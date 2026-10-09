import { createHash } from "node:crypto";
import type {
  AdapterContext,
  TaskConnection,
  TaskMailContent,
  TaskPlatform,
} from "@rakazo/adapter-kit";
import { runContinueJob } from "@rakazo/adapter-kit";
import type {
  TaskMail,
  TaskReport,
  TaskSource,
  TaskStarterResult,
  TaskStarterSpec,
  TaskTodo,
} from "@rakazo/contracts";
import {
  TaskReportSchema,
  TaskStarterResultSchema,
  TaskStarterSpecSchema,
  TaskTodoSchema,
} from "@rakazo/contracts";
import {
  renderTaskStarterResult,
  taskSourceId,
  taskStarterApp,
  taskStarterPeriod,
} from "@rakazo/core";
import type { Prisma } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { z } from "zod";
import { TaskPlatformRejectedError } from "./task-platform.js";
import { taskStarterModel } from "./task-starter-model.js";
import type { TaskStarterDependencies } from "./task-starter-service.js";
import {
  assertStarterConnections,
  StarterConnectionsSchema,
  starterContext,
} from "./task-starter-service.js";

export class TaskStarterReconciliationError extends Error {}
const labels = {
  sessions: "Sessions",
  activeUsers: "Active users",
  screenPageViews: "Page and screen views",
  keyEvents: "Key events",
  totalRevenue: "Revenue",
};
type Scope = { id: string; userId: string; spaceId: string; botId: string; threadId: string };

/** Every call rereads the local authorization barrier; accounts are never selected by provider default. */
export async function taskStarterRead(
  deps: TaskStarterDependencies,
  scope: Scope,
  spec: TaskStarterSpec,
  connections: TaskConnection[],
  now: Date,
  context: AdapterContext,
  guard?: () => Promise<void>,
): Promise<TaskStarterResult> {
  const sources: TaskSource[] = [];
  const warnings: string[] = [];
  const source = (connectionId: string, resourceId: string, title: string, url: string | null) => {
    const id = taskSourceId(connectionId, resourceId);
    if (!sources.some((s) => s.id === id))
      sources.push({
        id,
        connectionId,
        title: title.slice(0, 500),
        url,
        retrievedAt: now.toISOString(),
      });
    return id;
  };
  const call = async <T>(c: TaskConnection, fn: (platform: TaskPlatform) => Promise<T>) => {
    context.signal.throwIfAborted();
    await guard?.();
    await assertStarterConnections(deps.prisma, scope, [c]);
    return fn(await deps.integrationSettings.taskPlatform(c, context));
  };
  const app = (name: string) => connections.filter((c) => taskStarterApp(c.provider) === name);
  const readMail = async (query: string, maxMessages: number) => {
    const batches = await Promise.all(
      app("gmail").map(async (c) => {
        try {
          const result = await call(c, (p) =>
            p.searchMail(
              {
                connection: c,
                query,
                maxMessages,
                includeThreadContext: spec.starter === "inbox_todos",
              },
              context,
            ),
          );
          return { connection: c, ...result, failed: false };
        } catch {
          return {
            connection: c,
            messages: [] as TaskMailContent[],
            complete: false,
            failed: true,
          };
        }
      }),
    );
    if (batches.length && batches.every((b) => b.failed))
      throw new Error("Could not read the selected Gmail accounts. Reconnect or try again.");
    for (const b of batches) {
      if (b.failed) warnings.push(`Could not search ${b.connection.displayName}`);
      else if (!b.complete) warnings.push(`Results from ${b.connection.displayName} were limited`);
      for (const m of b.messages) source(b.connection.id, m.id, m.subject, m.url);
    }
    return batches;
  };
  if (spec.starter === "gmail_search") {
    const batches = await readMail(spec.query, Math.floor(200 / Math.max(app("gmail").length, 1)));
    const messages: TaskMail[] = batches
      .flatMap((b) => b.messages.map(({ text: _text, to: _to, ...m }) => m))
      .sort((a, b) => b.date.localeCompare(a.date));
    return {
      kind: "gmail_search",
      sources,
      warnings,
      summary: `${messages.length} matching messages`,
      messages,
      coverage: batches.map((b) => ({
        connectionId: b.connection.id,
        label: b.connection.displayName,
        status: b.failed ? "failed" : b.complete ? "complete" : "limited",
        count: b.messages.length,
      })),
    };
  }
  if (spec.starter === "inbox_todos") {
    const query =
      `after:${Math.floor((now.getTime() - spec.lookbackDays * 86_400_000) / 1000)} ${spec.query}`.trim();
    const batches = await readMail(
      query,
      Math.min(40, Math.floor(60 / Math.max(app("gmail").length, 1))),
    );
    const messages = batches.flatMap((b) =>
      b.messages.map((m) => ({
        sourceId: taskSourceId(b.connection.id, m.id),
        ...m,
        text: m.text.slice(
          0,
          Math.floor(
            40_000 /
              Math.max(
                batches.reduce((n, b) => n + b.messages.length, 0),
                1,
              ),
          ),
        ),
      })),
    );
    if (!messages.length)
      return {
        kind: "inbox_todos",
        sources,
        warnings,
        summary: "No recent emails found",
        actions: [],
      };
    const previous = await deps.prisma.taskStarterExecution.findMany({
      where: {
        starter: "inbox_todos",
        run: {
          spaceId: scope.spaceId,
          userId: scope.userId,
          botId: scope.botId,
          status: "completed",
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { result: true },
    });
    const priorActions: TaskTodo[] = [];
    const currentSources = new Set(messages.map((m) => m.sourceId));
    for (const receipt of previous) {
      const parsed = TaskStarterResultSchema.safeParse(receipt.result);
      if (!parsed.success || parsed.data.kind !== "inbox_todos") continue;
      for (const action of parsed.data.actions)
        if (
          action.savedItemId &&
          action.sourceIds.every((id) => currentSources.has(id)) &&
          !priorActions.some((p) => p.id === action.id)
        )
          priorActions.push(action);
      if (priorActions.length >= 20) break;
    }
    const acceptedActions = priorActions.slice(0, 20).map((a) => ({
      id: a.id,
      title: a.title,
      notes: a.notes.slice(0, 500),
      sourceIds: a.sourceIds,
    }));
    const input = { now: now.toISOString(), messages, acceptedActions };
    while (JSON.stringify(input).length > 90_000 && input.acceptedActions.length)
      input.acceptedActions.pop();
    while (JSON.stringify(input).length > 90_000 && input.messages.length > 1) {
      input.messages.pop();
      if (!warnings.includes("Inbox synthesis context was limited"))
        warnings.push("Inbox synthesis context was limited");
    }
    const schema = z
      .array(
        TaskTodoSchema.omit({ id: true, savedItemId: true }).extend({
          existingActionId: z.string().nullable().default(null),
        }),
      )
      .max(50);
    await guard?.();
    const generated = await taskStarterModel(
      deps,
      scope,
      input,
      'Extract commitments and explicit requests addressed to the user into a prioritized, deduplicated review list. Each action must be supported by its source emails; omit newsletters, automated notices and unsupported actions. Use priority high only for an explicit urgency or near deadline. Set dueDate to an explicit ISO date or null. Explain prioritization briefly using source facts. Reuse existingActionId from acceptedActions only for exactly the same commitment with exactly the same sourceIds, even when wording changed. Distinct commitments in one email must remain distinct. Preserve accepted actions and their user edits. Use null for new actions. Return [{"title":"...","notes":"...","dueDate":null,"priority":"normal","reason":"...","sourceIds":["..."],"existingActionId":null}].',
      schema,
      context,
    );
    const ids = new Set(sources.map((s) => s.id));
    if (generated.some((a) => a.sourceIds.some((id) => !ids.has(id))))
      throw new Error("The model returned an unsupported source");
    const actions = generated.map(({ existingActionId, ...action }) => {
      const previous = existingActionId
        ? priorActions.find(
            (a) =>
              a.id === existingActionId &&
              JSON.stringify([...a.sourceIds].sort()) ===
                JSON.stringify([...action.sourceIds].sort()),
          )
        : null;
      if (existingActionId && !previous)
        throw new Error("The model returned an unsupported previous action");
      return {
        ...action,
        id:
          previous?.id ??
          taskSourceId(
            action.sourceIds.slice().sort().join(":"),
            action.title.trim().toLowerCase(),
          ),
        savedItemId: previous?.savedItemId ?? null,
      };
    });
    const priorities = { high: 0, normal: 1, low: 2 };
    const unique = actions.filter(
      (action, index) => actions.findIndex((other) => other.id === action.id) === index,
    );
    unique.sort(
      (a, b) =>
        priorities[a.priority] - priorities[b.priority] ||
        (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31"),
    );
    return {
      kind: "inbox_todos",
      sources,
      warnings,
      summary: `${unique.length} suggested actions`,
      actions: unique,
    };
  }
  if (spec.starter === "meeting_brief") {
    let successfulCalendars = 0;
    const batches = await Promise.all(
      app("calendar").map(async (c) => {
        try {
          const r = await call(c, (p) =>
            p.upcomingMeetings(
              {
                connection: c,
                timeMin: now.toISOString(),
                timeMax: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
              },
              context,
            ),
          );
          successfulCalendars++;
          if (!r.complete) warnings.push(`Calendar results from ${c.displayName} were limited`);
          return r.meetings;
        } catch {
          warnings.push(`Could not read ${c.displayName}`);
          return [];
        }
      }),
    );
    if (!successfulCalendars)
      throw new Error("Reconnect the selected Calendar accounts to continue");
    const allMeetings = batches.flat().sort((a, b) => a.start.localeCompare(b.start));
    const meetings = allMeetings.filter(
      (m, index) =>
        allMeetings.findIndex(
          (other) =>
            other.title === m.title &&
            other.start === m.start &&
            other.end === m.end &&
            JSON.stringify([...other.attendees].sort()) === JSON.stringify([...m.attendees].sort()),
        ) === index,
    );
    const chosen = spec.meetingId
      ? allMeetings.find(
          (m) => m.id === spec.meetingId && m.connectionId === spec.meetingConnectionId,
        )
      : null;
    if (spec.meetingId && !chosen) throw new Error("The selected meeting is no longer available");
    const first = meetings[0];
    const overlapping = first
      ? meetings.filter(
          (m) => new Date(m.start) < new Date(first.end) && new Date(m.end) > new Date(first.start),
        )
      : [];
    if (!chosen && overlapping.length > 1)
      return {
        kind: "meeting_brief",
        sources: overlapping.slice(0, 20).map((m) => ({
          id: taskSourceId(m.connectionId, m.id),
          connectionId: m.connectionId,
          title: m.title,
          url: m.url,
          retrievedAt: now.toISOString(),
        })),
        warnings,
        summary: "Choose the meeting to prepare for",
        meeting: null,
        choices: overlapping.slice(0, 20).map((m) => ({
          id: m.id,
          connectionId: m.connectionId,
          title: m.title,
          start: m.start,
          end: m.end,
          url: m.url,
        })),
        facts: [],
        suggestions: [],
      };
    const meeting = chosen ?? first;
    if (!meeting)
      return {
        kind: "meeting_brief",
        sources,
        warnings,
        summary: "No upcoming meeting found in the next seven days",
        meeting: null,
        choices: [],
        facts: [],
        suggestions: [],
      };
    const meetingSource = source(meeting.connectionId, meeting.id, meeting.title, meeting.url);
    const facts = [
      { text: `${meeting.title}: ${meeting.start}–${meeting.end}`, sourceIds: [meetingSource] },
    ];
    if (meeting.description)
      facts.push({ text: meeting.description.slice(0, 1000), sourceIds: [meetingSource] });
    const emails = meeting.attendees
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      .slice(0, 20);
    const mailboxQuery = emails.map((email) => `(from:${email} OR to:${email})`).join(" OR ");
    const mail =
      mailboxQuery && app("gmail").length
        ? (
            await readMail(
              `newer_than:90d (${mailboxQuery})`,
              Math.floor(30 / Math.max(app("gmail").length, 1)),
            ).catch(() => {
              warnings.push("Gmail context was unavailable");
              return [];
            })
          ).flatMap((b) => b.messages)
        : [];
    const crm = app("hubspot")[0];
    const records =
      crm && emails.length
        ? await call(crm, (p) => p.hubspotContext({ connection: crm, emails }, context)).catch(
            () => ({ records: [], warnings: ["HubSpot context was unavailable"] }),
          )
        : { records: [], warnings: [] };
    warnings.push(...records.warnings);
    if (
      records.records.length > 20 ||
      mail.length > 20 ||
      records.records.some((r) => r.text.length > 1500) ||
      mail.some((m) => m.text.length > 1500)
    )
      warnings.push("Briefing context was limited to the most relevant retrieved records");
    records.records = records.records.slice(0, 100);
    for (const record of records.records) source(crm!.id, record.id, record.title, record.url);
    const crmFacts = records.records.slice(0, 10).map((record) => ({
      text: `${record.title}: ${record.text}`.slice(0, 1000),
      sourceIds: [taskSourceId(crm!.id, record.id)],
    }));
    let suggestions: { text: string; sourceIds: string[] }[] = [];
    try {
      const schema = z.object({
        facts: z
          .array(z.object({ text: z.string().max(1000), sourceIds: z.array(z.string()).min(1) }))
          .max(20),
        suggestions: z
          .array(z.object({ text: z.string().max(1000), sourceIds: z.array(z.string()).min(1) }))
          .max(5),
      });
      await guard?.();
      const generated = await taskStarterModel(
        deps,
        scope,
        {
          meeting: {
            title: meeting.title.slice(0, 500),
            start: meeting.start,
            end: meeting.end,
            description: meeting.description.slice(0, 4000),
            attendees: emails,
            sourceId: meetingSource,
          },
          mail: mail.slice(0, 20).map((m) => ({
            subject: m.subject,
            from: m.from.slice(0, 500),
            date: m.date,
            sourceId: taskSourceId(m.connectionId, m.id),
            text: m.text.slice(-1500),
          })),
          crm: records.records.slice(0, 20).map((r) => ({
            title: r.title.slice(0, 500),
            sourceId: taskSourceId(crm!.id, r.id),
            text: r.text.slice(0, 1500),
          })),
        },
        'Prepare a concise meeting brief. Separate supported facts from suggested discussion questions. Match people only by supplied exact email associations. Return {"facts":[{"text":"...","sourceIds":["..."]}],"suggestions":[{"text":"Consider ...","sourceIds":["..."]}]}.',
        schema,
        context,
      );
      if (
        [...generated.facts, ...generated.suggestions].some((f) =>
          f.sourceIds.some((id) => !sources.some((s) => s.id === id)),
        )
      )
        throw new Error("Unsupported brief source");
      facts.push(...generated.facts);
      suggestions = generated.suggestions;
    } catch {
      facts.push(...crmFacts);
      warnings.push("Model synthesis unavailable; showing verified meeting details");
    }
    return {
      kind: "meeting_brief",
      sources,
      warnings,
      summary: meeting.title,
      meeting: {
        id: meeting.id,
        title: meeting.title,
        start: meeting.start,
        end: meeting.end,
        url: meeting.url,
      },
      choices: [],
      facts,
      suggestions,
    };
  }
  const analytics = app("analytics")[0];
  const sheets = app("sheets")[0];
  if (!analytics || !sheets || !spec.propertyId)
    throw new Error("Choose an analytics source and Sheet destination");
  const properties = await call(analytics, (p) => p.analyticsProperties(analytics, context));
  const property = properties.find((p) => p.id === spec.propertyId);
  if (!property) throw new Error("The selected GA4 property is unavailable");
  if (spec.reportRange && property.timezone !== spec.timezone)
    throw new Error(
      "The report property timezone changed; review a new report before scheduling it",
    );
  const period = taskStarterPeriod(now, property.timezone, spec.period);
  const response = await call(analytics, (p) =>
    p.analyticsReport(
      {
        connection: analytics,
        propertyId: property.id,
        metrics: spec.metrics,
        startDate: period.startDate,
        endDate: period.endDate,
      },
      context,
    ),
  );
  if (response.report.timezone !== property.timezone || response.report.propertyId !== property.id)
    throw new Error("Analytics source changed while preparing the report");
  warnings.push(...response.warnings);
  source(
    analytics.id,
    `property:${property.id}`,
    property.name,
    `https://analytics.google.com/analytics/web/#/p${property.id}/reports/reportinghub`,
  );
  if (spec.spreadsheetId)
    await call(sheets, (p) => p.sheetInfo(sheets, spec.spreadsheetId!, context));
  const metrics = spec.metrics.map((name) => {
    const metric = response.report.metrics.find((m) => m.name === name);
    if (!metric) throw new Error("The report omitted a requested metric");
    return { ...metric, label: labels[name] };
  });
  const values: TaskReport["values"] = [
    ["GA4 property", property.id],
    ["Period", `${period.startDate} – ${period.endDate}`],
    ["Timezone", property.timezone],
    ["Currency", response.report.currency ?? ""],
    ["Status", period.provisional ? "Provisional" : "Completed period"],
    ["", ""],
    ["Metric", "Value"],
    ...metrics.map((m) => [m.label, m.value]),
  ];
  while (values.length < 12) values.push(["", ""]);
  return {
    kind: "analytics_report",
    sources,
    warnings,
    summary: `${property.name}: ${period.startDate}–${period.endDate}`,
    report: {
      ...response.report,
      metrics,
      spreadsheetId: spec.spreadsheetId,
      url: spec.spreadsheetId
        ? `https://docs.google.com/spreadsheets/d/${spec.spreadsheetId}/edit`
        : null,
      range:
        spec.reportRange ??
        `Rakazo_${createHash("sha256").update(scope.id).digest("hex").slice(0, 16)}!A1:B12`,
      values,
      provisional: period.provisional,
      published: false,
    },
  };
}

export async function executeTaskStarter(
  deps: TaskStarterDependencies,
  runId: string,
  workerId: string,
): Promise<void> {
  const execution = await deps.prisma.taskStarterExecution.findUnique({
    where: { runId },
    include: { run: true },
  });
  if (!execution) throw new Error("Task starter run has no receipt");
  const run = execution.run;
  const fence = run.leaseFence + 1;
  const held = await deps.prisma.run.updateMany({
    where: {
      id: runId,
      leaseFence: run.leaseFence,
      OR: [
        { status: "queued" },
        { status: { in: ["leased", "running"] }, leaseExpiresAt: { lte: new Date() } },
      ],
    },
    data: {
      status: "running",
      leaseOwner: workerId,
      leaseFence: fence,
      leaseExpiresAt: new Date(Date.now() + 5 * 60_000),
      startedAt: run.startedAt ?? new Date(),
      error: null,
    },
  });
  if (!held.count) return;
  const attempt = await deps.prisma.attempt.create({ data: { runId, fence, status: "running" } });
  const base = {
    spaceId: run.spaceId,
    botId: run.botId,
    threadId: run.threadId,
    taskId: run.taskId,
    runId,
    attemptId: attempt.id,
    leaseOwner: workerId,
    leaseFence: fence,
  };
  let connections: TaskConnection[] = [];
  let spec: TaskStarterSpec;
  let effectId: string | null = null;
  const context = starterContext(run, runId);
  const ensure = async () => {
    context.signal.throwIfAborted();
    await assertStarterConnections(deps.prisma, run, connections);
    const active = await deps.prisma.run.findFirst({
      where: {
        id: runId,
        status: "running",
        leaseOwner: workerId,
        leaseFence: fence,
        leaseExpiresAt: { gt: new Date() },
      },
    });
    if (!active) throw new Error("Task was cancelled or its worker lease expired");
  };
  const persist = async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
    deps.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM threads WHERE id = ${run.threadId} FOR UPDATE`;
      const active = await tx.run.updateMany({
        where: {
          id: runId,
          status: "running",
          leaseOwner: workerId,
          leaseFence: fence,
          leaseExpiresAt: { gt: new Date() },
        },
        data: { updatedAt: new Date() },
      });
      if (!active.count) throw new Error("Task worker lease expired");
      return fn(tx);
    });
  try {
    connections = StarterConnectionsSchema.parse(execution.connections);
    spec = TaskStarterSpecSchema.parse(execution.input);
    await ensure();
    if (
      !(await deps.prisma.bot.findFirst({
        where: { id: run.botId, spaceId: run.spaceId, userId: run.userId, archivedAt: null },
      }))
    )
      throw new Error("The task bot is unavailable");
    await deps.events.append({
      spaceId: run.spaceId,
      threadId: run.threadId,
      botId: run.botId,
      runId,
      type: "run.started",
      payload: { taskId: run.taskId },
    });
    let result = execution.result
      ? TaskStarterResultSchema.parse(execution.result)
      : await taskStarterRead(deps, run, spec, connections, execution.createdAt, context, ensure);
    await ensure();
    // Freeze every report before any side effect, including scheduled reports.
    await persist((tx) =>
      tx.taskStarterExecution.update({
        where: { id: execution.id },
        data: { result: result as Prisma.InputJsonValue },
      }),
    );
    if (["publish", "scheduled_publish", "reconcile"].includes(execution.action)) {
      if (result.kind !== "analytics_report") throw new Error("The approved report is missing");
      const sheets = connections.find((c) => c.id === spec.sheetsConnectionId);
      if (!sheets) throw new Error("The approved destination is missing");
      const platform = await deps.integrationSettings.taskPlatform(sheets, context);
      let original = null;
      if (execution.action === "reconcile") {
        const ancestors = new Set<string>([execution.id]);
        let sourceId = execution.sourceExecutionId;
        while (sourceId) {
          if (ancestors.has(sourceId) || ancestors.size > 8)
            throw new Error("Invalid report reconciliation ancestry");
          ancestors.add(sourceId);
          const parent = await deps.prisma.taskStarterExecution.findFirst({
            where: { id: sourceId, run: { spaceId: run.spaceId, userId: run.userId } },
          });
          if (!parent) throw new Error("The original report operation is unavailable");
          if (parent.action !== "reconcile") {
            original = parent;
            break;
          }
          sourceId = parent.sourceExecutionId;
        }
        if (!original || !["publish", "scheduled_publish"].includes(original.action))
          throw new Error("The original report operation is unavailable");
      }
      const operationKey = `task-report:${original ? (original.sourceExecutionId ?? original.id) : (execution.sourceExecutionId ?? execution.id)}`;
      const approvedReport = result.report;
      let spreadsheetId = approvedReport.spreadsheetId;
      const effect =
        execution.action === "reconcile"
          ? await deps.prisma.externalEffect.findUnique({ where: { idempotencyKey: operationKey } })
          : await persist((tx) =>
              tx.externalEffect.upsert({
                where: { idempotencyKey: operationKey },
                create: {
                  spaceId: run.spaceId,
                  runId,
                  kind: "task_report.publish",
                  idempotencyKey: operationKey,
                  status: "intended",
                  request: {
                    connectionId: sheets.id,
                    providerRef: sheets.providerRef,
                    report: approvedReport,
                  } as Prisma.InputJsonValue,
                  reviewDecision: "user_approved",
                  reviewReason:
                    execution.action === "scheduled_publish"
                      ? "Bound recurring report authorized by user"
                      : "Reviewed report explicitly published by user",
                },
                update: {},
              }),
            );
      if (!effect)
        throw new TaskStarterReconciliationError(
          "The original report effect is unavailable; verify the destination",
        );
      effectId = effect.id;
      const request = z
        .object({ connectionId: z.string(), providerRef: z.string(), report: TaskReportSchema })
        .parse(effect.request);
      if (request.connectionId !== sheets.id || request.providerRef !== sheets.providerRef)
        throw new Error("The approved destination changed");
      // The durable effect is authoritative on recovery, even if a source later revises metrics.
      result.report = request.report;
      spreadsheetId = request.report.spreadsheetId ?? spreadsheetId;
      await persist((tx) =>
        tx.taskStarterExecution.update({
          where: { id: execution.id },
          data: { result: result as Prisma.InputJsonValue },
        }),
      );
      if (effect.status === "completed") {
        const previous = z.object({ spreadsheetId: z.string() }).parse(effect.result);
        spreadsheetId = previous.spreadsheetId;
      } else {
        if (!spreadsheetId) {
          await ensure();
          spreadsheetId = await platform.findReportSheet(sheets, operationKey, context);
          if (!spreadsheetId) {
            if (execution.reconciliationRequired || effect.status !== "intended")
              throw new TaskStarterReconciliationError(
                "Sheet creation is uncertain; reconcile the existing operation before trying again",
              );
            await persist((tx) =>
              tx.externalEffect.update({
                where: { id: effect.id },
                data: { status: "ambiguous", result: { phase: "create_dispatched" } },
              }),
            );
            await ensure();
            try {
              spreadsheetId = await platform.createReportSheet(
                sheets,
                "GA4 report",
                operationKey,
                context,
              );
            } catch (error) {
              if (error instanceof TaskPlatformRejectedError) {
                await persist((tx) =>
                  tx.externalEffect.update({
                    where: { id: effect.id },
                    data: { status: "intended", result: { phase: "not_dispatched" } },
                  }),
                );
                throw error;
              }
              throw new TaskStarterReconciliationError(
                "Sheet creation is uncertain; reconcile the existing operation before trying again",
              );
            }
          }
          // Persist the known destination before any range write so retry never creates a second sheet.
          result.report.spreadsheetId = spreadsheetId;
          await persist((tx) =>
            tx.taskStarterExecution.update({
              where: { id: execution.id },
              data: { result: result as Prisma.InputJsonValue },
            }),
          );
        }
        await ensure();
        await platform.sheetInfo(sheets, spreadsheetId, context);
        const matches = (actual: TaskReport["values"]) =>
          result.kind === "analytics_report" &&
          result.report.values.every((row, i) =>
            row.every((cell, j) => String(actual[i]?.[j] ?? "") === String(cell ?? "")),
          );
        await ensure();
        const previous = await platform.readSheet(
          sheets,
          spreadsheetId,
          result.report.range,
          context,
        );
        if (!matches(previous)) {
          // A dispatching/uncertain write can only be reconciled by reading; never replay it automatically.
          if (
            execution.reconciliationRequired ||
            (effect.status === "ambiguous" &&
              effect.result !== null &&
              typeof effect.result === "object" &&
              !Array.isArray(effect.result) &&
              effect.result.phase === "write_dispatched")
          )
            throw new TaskStarterReconciliationError(
              "The Sheet differs from the attempted report; verify the destination before another write",
            );
          await persist((tx) =>
            tx.externalEffect.update({
              where: { id: effect.id },
              data: { status: "ambiguous", result: { phase: "write_dispatched", spreadsheetId } },
            }),
          );
          await ensure();
          try {
            await platform.writeSheet(
              sheets,
              spreadsheetId,
              result.report.range,
              result.report.values,
              context,
            );
          } catch (error) {
            if (error instanceof TaskPlatformRejectedError) {
              await persist((tx) =>
                tx.externalEffect.update({
                  where: { id: effect.id },
                  data: { status: "intended", result: { spreadsheetId, phase: "not_dispatched" } },
                }),
              );
              throw error;
            }
            try {
              await ensure();
              if (
                !matches(
                  await platform.readSheet(sheets, spreadsheetId, result.report.range, context),
                )
              )
                throw new Error("Unconfirmed write");
            } catch {
              throw new TaskStarterReconciliationError(
                "The Sheet update could not be confirmed; verify the destination before another write",
              );
            }
          }
          await ensure();
          if (
            !matches(await platform.readSheet(sheets, spreadsheetId, result.report.range, context))
          )
            throw new TaskStarterReconciliationError("The Sheet update could not be verified");
        }
        await persist((tx) =>
          tx.externalEffect.update({
            where: { id: effect.id },
            data: { status: "completed", result: { spreadsheetId } },
          }),
        );
      }
      result.report.spreadsheetId = spreadsheetId;
      result.report.url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
      result.report.published = true;
    }
    result = TaskStarterResultSchema.parse(result);
    await ensure();
    const saved = await deps.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM threads WHERE id = ${run.threadId} FOR UPDATE`;
      for (const c of [...connections].sort((a, b) => a.id.localeCompare(b.id)))
        await tx.$queryRaw`SELECT id FROM connections WHERE id = ${c.id} FOR UPDATE`;
      await assertStarterConnections(tx, run, connections);
      const current = await tx.run.updateMany({
        where: {
          id: runId,
          status: "running",
          leaseOwner: workerId,
          leaseFence: fence,
          leaseExpiresAt: { gt: new Date() },
        },
        data: { updatedAt: new Date() },
      });
      if (!current.count) return false;
      await tx.taskStarterExecution.update({
        where: { id: execution.id },
        data: { result: result as Prisma.InputJsonValue, reconciliationRequired: false },
      });
      if (execution.action === "reconcile" && execution.sourceExecutionId)
        await tx.taskStarterExecution.updateMany({
          where: { id: execution.sourceExecutionId },
          data: { reconciliationRequired: false },
        });
      return true;
    });
    if (!saved) return;
    const finalized = await deps.events.finalizeRun({
      ...base,
      outcome: "completed",
      taskConnections: connections,
      blocks: [{ kind: "text", text: renderTaskStarterResult(result) }],
    });
    if (finalized !== false && finalized.continuationRunId)
      await deps.jobs.enqueue(runContinueJob(finalized.continuationRunId));
  } catch (error) {
    const uncertainEffect = effectId
      ? await deps.prisma.externalEffect.findFirst({ where: { id: effectId, status: "ambiguous" } })
      : null;
    const reconciliation =
      error instanceof TaskStarterReconciliationError || Boolean(uncertainEffect);
    if (uncertainEffect)
      await deps.prisma.taskStarterExecution.update({
        where: { id: execution.id },
        data: { reconciliationRequired: true },
      });
    const message = reconciliation
      ? error instanceof TaskStarterReconciliationError
        ? error.message
        : "The Sheet update could not be confirmed. Check the outcome before another attempt."
      : error instanceof Error &&
          /^(Reconnect|Connect a model|Allow this model|Could not read|The selected GA4|The report omitted|The report property timezone changed|Choose an analytics)/.test(
            error.message,
          )
        ? error.message
        : "Could not complete this task. Try again.";
    if (reconciliation)
      await deps.prisma.$transaction(async (tx) => {
        const active = await tx.run.updateMany({
          where: { id: runId, status: "running", leaseOwner: workerId, leaseFence: fence },
          data: { updatedAt: new Date() },
        });
        if (active.count) {
          await tx.taskStarterExecution.update({
            where: { id: execution.id },
            data: { reconciliationRequired: true },
          });
          await tx.externalEffect.updateMany({
            where: { runId, status: { not: "completed" } },
            data: { status: "ambiguous" },
          });
        }
      });
    await deps.events
      .finalizeRun({ ...base, outcome: "failed", error: message })
      .catch((failure) => getLogger().error("task starter finalization", failure));
  }
}
