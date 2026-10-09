import { createHash } from "node:crypto";
import type {
  AdapterContext,
  AgentRunRequest,
  AgentRuntime,
  JobPublisher,
  TaskConnection,
} from "@rakazo/adapter-kit";
import { routineWakeupJob, runContinueJob } from "@rakazo/adapter-kit";
import type { Actor, TaskStarterSpec, TaskStarterStart, TaskTodo } from "@rakazo/contracts";
import {
  TaskStarterOptionsSchema,
  TaskStarterReceiptSchema,
  TaskStarterResultSchema,
  TaskStarterSpecSchema,
} from "@rakazo/contracts";
import { nextCronDateAcrossStrict, taskStarterApp } from "@rakazo/core";
import type { Prisma, PrismaClient, ThreadEvents } from "@rakazo/db";
import {
  appendEventInTransaction,
  createThreadMessageInTransaction,
  IsolationError,
} from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { z } from "zod";
import type { IntegrationProviderSettings } from "./integration-provider-settings.js";

export const StarterConnectionsSchema = z
  .array(
    z.object({
      id: z.string(),
      connectorId: z.string(),
      provider: z.string(),
      providerRef: z.string(),
      displayName: z.string(),
    }),
  )
  .max(30);
export type TaskStarterDependencies = {
  prisma: PrismaClient;
  jobs: JobPublisher;
  events: ThreadEvents;
  integrationSettings: IntegrationProviderSettings;
  runtime: AgentRuntime;
  resolveModel: (scope: {
    userId: string;
    spaceId: string;
    botId: string;
  }) => Promise<AgentRunRequest["model"]>;
};
export function starterContext(
  actor: Pick<Actor, "userId" | "spaceId">,
  operationId: string,
): AdapterContext {
  return {
    userId: actor.userId,
    spaceId: actor.spaceId,
    operationId,
    traceId: operationId,
    signal: AbortSignal.timeout(180_000),
  };
}
export function starterSelections(spec: TaskStarterSpec): [string, string][] {
  return [
    ...spec.gmailConnectionIds.map((id): [string, string] => [id, "gmail"]),
    ...spec.calendarConnectionIds.map((id): [string, string] => [id, "calendar"]),
    ...(spec.hubspotConnectionId
      ? [[spec.hubspotConnectionId, "hubspot"] as [string, string]]
      : []),
    ...(spec.analyticsConnectionId
      ? [[spec.analyticsConnectionId, "analytics"] as [string, string]]
      : []),
    ...(spec.sheetsConnectionId ? [[spec.sheetsConnectionId, "sheets"] as [string, string]] : []),
  ];
}
export async function assertStarterConnections(
  db: PrismaClient | Prisma.TransactionClient,
  actor: Pick<Actor, "spaceId" | "userId">,
  connections: TaskConnection[],
) {
  for (const c of [...connections].sort((a, b) => a.id.localeCompare(b.id))) {
    const row = await db.connection.findFirst({
      where: {
        spaceId: actor.spaceId,
        userId: actor.userId,
        id: c.id,
        status: "connected",
        providerRef: c.providerRef,
        connectorId: c.connectorId,
        provider: c.provider,
      },
    });
    if (!row) throw new Error("Reconnect the selected accounts to continue");
  }
}

export class TaskStarterService {
  constructor(readonly deps: TaskStarterDependencies) {}
  async options(actor: Actor) {
    const rows = await this.deps.prisma.connection.findMany({
      where: {
        spaceId: actor.spaceId,
        userId: actor.userId,
        connectorId: { in: ["composio", "pipedream"] },
      },
      orderBy: { createdAt: "asc" },
    });
    const connections: z.infer<typeof TaskStarterOptionsSchema>["connections"] = [];
    const supported = new Set<string>();
    for (const id of ["composio", "pipedream"] as const) {
      try {
        const provider = await this.deps.integrationSettings.resolve(id);
        if (provider?.taskPlatform?.()) supported.add(id);
      } catch {
        /* Unavailable providers cannot offer executable accounts. */
      }
    }
    const configured = supported.size > 0;
    // Profile requests use account-scoped adapters with bounded concurrency and persist only a verified identity.
    for (let offset = 0; offset < rows.length; offset += 5) {
      const batch = await Promise.all(
        rows.slice(offset, offset + 5).map(async (c) => {
          const app = taskStarterApp(c.provider);
          if (!app || !supported.has(c.connectorId)) return null;
          const metadata =
            typeof c.metadata === "object" && c.metadata !== null && !Array.isArray(c.metadata)
              ? c.metadata
              : {};
          let identity =
            typeof metadata.taskStarterIdentity === "string" &&
            metadata.taskStarterIdentityRef === c.providerRef
              ? metadata.taskStarterIdentity
              : null;
          if (c.status === "connected" && c.providerRef) {
            const context = {
              ...starterContext(actor, "task-starter.identity"),
              signal: AbortSignal.timeout(10_000),
            };
            try {
              const platform = await this.deps.integrationSettings.taskPlatform(
                { ...c, providerRef: c.providerRef },
                context,
              );
              if (!identity && app === "gmail") {
                identity = await platform.identity({ ...c, providerRef: c.providerRef }, context);
                await this.deps.prisma.$transaction(async (tx) => {
                  await tx.$queryRaw`SELECT id FROM connections WHERE id = ${c.id} FOR UPDATE`;
                  const latest = await tx.connection.findFirst({
                    where: {
                      id: c.id,
                      spaceId: actor.spaceId,
                      userId: actor.userId,
                      status: "connected",
                      providerRef: c.providerRef,
                    },
                  });
                  if (!latest) {
                    identity = null;
                    return;
                  }
                  const current =
                    typeof latest.metadata === "object" &&
                    latest.metadata !== null &&
                    !Array.isArray(latest.metadata)
                      ? latest.metadata
                      : {};
                  await tx.connection.update({
                    where: { id: c.id },
                    data: {
                      metadata: {
                        ...current,
                        taskStarterIdentity: identity,
                        taskStarterIdentityRef: c.providerRef,
                      },
                    },
                  });
                });
              }
            } catch {
              identity = null;
            }
          }
          return {
            id: c.id,
            connectorId: c.connectorId,
            app,
            name: c.displayName,
            identity,
            status: ["connected", "pending", "revoked"].includes(c.status)
              ? (c.status as "connected" | "pending" | "revoked")
              : ("error" as const),
          };
        }),
      );
      connections.push(...batch.filter((c): c is NonNullable<typeof c> => c !== null));
    }
    return TaskStarterOptionsSchema.parse({ configured, connections });
  }
  async connections(actor: Pick<Actor, "userId" | "spaceId">, spec: TaskStarterSpec) {
    const result: TaskConnection[] = [];
    for (const [id, app] of starterSelections(spec)) {
      const c = await this.deps.prisma.connection.findFirst({
        where: {
          spaceId: actor.spaceId,
          userId: actor.userId,
          id,
          status: "connected",
          connectorId: { in: ["composio", "pipedream"] },
        },
      });
      if (!c?.providerRef || taskStarterApp(c.provider) !== app)
        throw new Error("Choose a connected account for each source");
      result.push({
        id: c.id,
        connectorId: c.connectorId,
        provider: c.provider,
        providerRef: c.providerRef,
        displayName: c.displayName,
      });
    }
    return result;
  }
  async properties(actor: Actor, connectionId: string) {
    const c = await this.deps.prisma.connection.findFirst({
      where: {
        id: connectionId,
        userId: actor.userId,
        spaceId: actor.spaceId,
        status: "connected",
        connectorId: { in: ["composio", "pipedream"] },
      },
    });
    if (!c?.providerRef || taskStarterApp(c.provider) !== "analytics") throw new IsolationError();
    const connection = { ...c, providerRef: c.providerRef };
    const context = starterContext(actor, "task-starter.properties");
    const platform = await this.deps.integrationSettings.taskPlatform(connection, context);
    const properties = await platform.analyticsProperties(connection, context);
    await assertStarterConnections(this.deps.prisma, actor, [connection]);
    return properties;
  }
  async receipt(actor: Pick<Actor, "userId" | "spaceId">, receiptId: string) {
    const row = await this.deps.prisma.taskStarterExecution.findFirst({
      where: { id: receiptId, run: { userId: actor.userId, spaceId: actor.spaceId } },
      include: { run: true },
    });
    if (!row) throw new IsolationError();
    if (row.run.status === "completed" && row.result)
      await assertStarterConnections(
        this.deps.prisma,
        actor,
        StarterConnectionsSchema.parse(row.connections),
      );
    const uncertain =
      row.reconciliationRequired ||
      (["failed", "cancelled"].includes(row.run.status) &&
        Boolean(
          await this.deps.prisma.externalEffect.findFirst({
            where: { runId: row.runId, kind: "task_report.publish", status: "ambiguous" },
            select: { id: true },
          }),
        ));
    return TaskStarterReceiptSchema.parse({
      id: row.id,
      runId: row.runId,
      starter: row.starter,
      status:
        uncertain && ["failed", "cancelled"].includes(row.run.status)
          ? "reconciliation_required"
          : row.run.status === "leased"
            ? "running"
            : row.run.status,
      result:
        row.run.status === "completed" && row.result
          ? TaskStarterResultSchema.parse(row.result)
          : null,
      error: row.run.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  private async enqueue(runId: string) {
    await this.deps.jobs
      .enqueue(runContinueJob(runId))
      .catch((error) => getLogger().error("task starter enqueue", error));
  }
  async start(actor: Actor, input: TaskStarterStart) {
    const spec = TaskStarterSpecSchema.parse(input.spec);
    const connections = await this.connections(actor, spec);
    const nonce = `task-starter:${actor.userId}:${input.clientNonce}`;
    const row = await this.deps.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.spaceId}), hashtext(${nonce}))`;
      const previous = await tx.taskStarterExecution.findFirst({
        where: { run: { spaceId: actor.spaceId, clientNonce: nonce } },
        include: { run: true },
      });
      if (previous) {
        if (
          previous.run.userId !== actor.userId ||
          previous.run.botId !== input.botId ||
          JSON.stringify(TaskStarterSpecSchema.parse(previous.input)) !== JSON.stringify(spec)
        )
          throw new IsolationError();
        return previous;
      }
      const bot = await tx.bot.findFirst({
        where: { id: input.botId, spaceId: actor.spaceId, userId: actor.userId, archivedAt: null },
        include: { thread: true },
      });
      if (!bot?.thread || bot.thread.userId !== actor.userId) throw new IsolationError();
      await tx.$queryRaw`SELECT id FROM threads WHERE id = ${bot.thread.id} FOR UPDATE`;
      await assertStarterConnections(tx, actor, connections);
      const task = await tx.task.create({
        data: {
          spaceId: actor.spaceId,
          userId: actor.userId,
          botId: bot.id,
          threadId: bot.thread.id,
          prompt: input.prompt,
          status: "queued",
        },
      });
      const run = await tx.run.create({
        data: {
          spaceId: actor.spaceId,
          userId: actor.userId,
          botId: bot.id,
          threadId: bot.thread.id,
          taskId: task.id,
          trigger: "task_starter",
          status: "queued",
          clientNonce: nonce,
        },
      });
      const execution = await tx.taskStarterExecution.create({
        data: {
          runId: run.id,
          starter: spec.starter,
          input: spec as Prisma.InputJsonValue,
          connections,
          action: "read",
        },
      });
      for (const [role, blocks] of [
        ["user", [{ kind: "text", text: input.prompt }]],
        ["bot", [{ kind: "task_starter_receipt", receiptId: execution.id }]],
      ] as const) {
        const message = await createThreadMessageInTransaction(tx, {
          threadId: run.threadId,
          botId: bot.id,
          runId: run.id,
          role,
          blocks: [...blocks],
        });
        await appendEventInTransaction(tx, {
          spaceId: actor.spaceId,
          threadId: run.threadId,
          botId: bot.id,
          runId: run.id,
          type: "thread.message.created",
          payload: { messageId: message.id, role, blocks: message.blocks },
        });
      }
      return execution;
    });
    await this.enqueue(row.runId);
    return this.receipt(actor, row.id);
  }
  async publish(actor: Actor, receiptId: string, clientNonce: string) {
    const source = await this.deps.prisma.taskStarterExecution.findFirst({
      where: {
        id: receiptId,
        run: { spaceId: actor.spaceId, userId: actor.userId, status: "completed" },
      },
      include: { run: true },
    });
    if (!source?.result) throw new IsolationError();
    const result = TaskStarterResultSchema.parse(source.result);
    if (result.kind !== "analytics_report")
      throw new Error("Only report previews can be published");
    if (result.report.published) return this.receipt(actor, source.id);
    const connections = StarterConnectionsSchema.parse(source.connections);
    const row = await this.deps.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM threads WHERE id = ${source.run.threadId} FOR UPDATE`;
      const previous = await tx.taskStarterExecution.findUnique({
        where: { sourceExecutionId_action: { sourceExecutionId: source.id, action: "publish" } },
      });
      if (previous) return previous;
      await assertStarterConnections(tx, actor, connections);
      const task = await tx.task.create({
        data: {
          spaceId: actor.spaceId,
          userId: actor.userId,
          botId: source.run.botId,
          threadId: source.run.threadId,
          prompt: "Publish the reviewed analytics report to Google Sheets",
          status: "queued",
        },
      });
      const run = await tx.run.create({
        data: {
          spaceId: actor.spaceId,
          userId: actor.userId,
          botId: source.run.botId,
          threadId: source.run.threadId,
          taskId: task.id,
          trigger: "task_starter",
          status: "queued",
          clientNonce: `task-publish:${actor.userId}:${clientNonce}`,
        },
      });
      const execution = await tx.taskStarterExecution.create({
        data: {
          runId: run.id,
          starter: "analytics_report",
          action: "publish",
          input: source.input as Prisma.InputJsonValue,
          connections,
          result: source.result as Prisma.InputJsonValue,
          sourceExecutionId: source.id,
        },
      });
      const message = await createThreadMessageInTransaction(tx, {
        threadId: run.threadId,
        botId: run.botId,
        runId: run.id,
        role: "bot",
        blocks: [{ kind: "task_starter_receipt", receiptId: execution.id }],
      });
      await appendEventInTransaction(tx, {
        spaceId: actor.spaceId,
        threadId: run.threadId,
        botId: run.botId,
        runId: run.id,
        type: "thread.message.created",
        payload: { messageId: message.id, role: "bot", blocks: message.blocks },
      });
      return execution;
    });
    await this.enqueue(row.runId);
    return this.receipt(actor, row.id);
  }
  async saveTodos(
    actor: Actor,
    receiptId: string,
    actionIds: string[],
    edits: Pick<TaskTodo, "id" | "title" | "notes" | "dueDate" | "priority">[] = [],
  ) {
    await this.deps.prisma.$transaction(async (tx) => {
      const row = await tx.taskStarterExecution.findFirst({
        where: {
          id: receiptId,
          run: { spaceId: actor.spaceId, userId: actor.userId, status: "completed" },
        },
        include: { run: true },
      });
      if (!row?.result) throw new IsolationError();
      await tx.$queryRaw`SELECT id FROM threads WHERE id = ${row.run.threadId} FOR UPDATE`;
      const latest = await tx.taskStarterExecution.findUniqueOrThrow({ where: { id: row.id } });
      const result = TaskStarterResultSchema.parse(latest.result);
      if (
        result.kind !== "inbox_todos" ||
        actionIds.some((id) => !result.actions.some((a) => a.id === id))
      )
        throw new Error("Choose actions from this receipt");
      if (
        edits.some((e) => !actionIds.includes(e.id)) ||
        new Set(edits.map((e) => e.id)).size !== edits.length
      )
        throw new Error("Edit only the selected actions");
      for (const action of result.actions) {
        const edit = edits.find((e) => e.id === action.id);
        if (edit) Object.assign(action, edit);
      }
      await assertStarterConnections(tx, actor, StarterConnectionsSchema.parse(row.connections));
      for (const action of result.actions.filter((a) => actionIds.includes(a.id))) {
        const key = createHash("sha256")
          .update(
            JSON.stringify([
              actor.spaceId,
              actor.userId,
              row.run.botId,
              [...action.sourceIds].sort(),
              action.id,
            ]),
          )
          .digest("hex");
        const item = await tx.scratchpadItem.upsert({
          where: { sourceActionKey: key },
          create: {
            spaceId: actor.spaceId,
            userId: actor.userId,
            botId: row.run.botId,
            title: action.title,
            notes: [
              action.notes,
              `Priority: ${action.priority}`,
              action.reason ? `Reason: ${action.reason}` : "",
              action.dueDate ? `Due: ${action.dueDate}` : "",
              ...result.sources
                .filter((s) => action.sourceIds.includes(s.id))
                .map((s) => s.url ?? s.title),
            ]
              .filter(Boolean)
              .join("\n"),
            sourceActionKey: key,
          },
          update: {},
        });
        action.savedItemId = item.id;
      }
      await tx.taskStarterExecution.update({
        where: { id: row.id },
        data: { result: result as Prisma.InputJsonValue },
      });
    });
    return this.receipt(actor, receiptId);
  }
  async retry(actor: Actor, receiptId: string) {
    const row = await this.deps.prisma.$transaction(async (tx) => {
      const execution = await tx.taskStarterExecution.findFirst({
        where: { id: receiptId, run: { spaceId: actor.spaceId, userId: actor.userId } },
        include: { run: true },
      });
      if (!execution) throw new IsolationError();
      if (
        execution.reconciliationRequired ||
        (await tx.externalEffect.findFirst({
          where: { runId: execution.runId, kind: "task_report.publish", status: "ambiguous" },
          select: { id: true },
        }))
      )
        throw new Error("Check the outcome before another attempt");
      await assertStarterConnections(
        tx,
        actor,
        StarterConnectionsSchema.parse(execution.connections),
      );
      const held = await tx.run.updateMany({
        where: { id: execution.runId, status: "failed" },
        data: {
          status: "queued",
          completedAt: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          error: null,
        },
      });
      if (held.count) {
        await tx.task.update({ where: { id: execution.run.taskId }, data: { status: "queued" } });
      }
      return execution;
    });
    await this.enqueue(row.runId);
    return this.receipt(actor, row.id);
  }
  async chooseMeeting(
    actor: Actor,
    input: { receiptId: string; meetingId: string; connectionId: string; clientNonce: string },
  ) {
    const row = await this.deps.prisma.taskStarterExecution.findFirst({
      where: {
        id: input.receiptId,
        run: { spaceId: actor.spaceId, userId: actor.userId, status: "completed" },
      },
      include: { run: true },
    });
    if (!row?.result) throw new IsolationError();
    const result = TaskStarterResultSchema.parse(row.result);
    if (
      result.kind !== "meeting_brief" ||
      !result.choices.some(
        (choice) => choice.id === input.meetingId && choice.connectionId === input.connectionId,
      )
    )
      throw new IsolationError();
    await assertStarterConnections(
      this.deps.prisma,
      actor,
      StarterConnectionsSchema.parse(row.connections),
    );
    return this.start(actor, {
      botId: row.run.botId,
      clientNonce: `meeting-choice:${createHash("sha256")
        .update(JSON.stringify([row.id, input.connectionId, input.meetingId]))
        .digest("hex")}`,
      prompt: "Prepare me for the selected meeting",
      spec: TaskStarterSpecSchema.parse({
        ...TaskStarterSpecSchema.parse(row.input),
        meetingId: input.meetingId,
        meetingConnectionId: input.connectionId,
      }),
    });
  }
  async reconcile(actor: Actor, receiptId: string) {
    const execution = await this.deps.prisma.$transaction(async (tx) => {
      const candidate = await tx.taskStarterExecution.findFirst({
        where: {
          id: receiptId,
          run: {
            spaceId: actor.spaceId,
            userId: actor.userId,
            status: { in: ["failed", "cancelled"] },
          },
        },
        include: { run: true },
      });
      if (
        !candidate ||
        (!candidate.reconciliationRequired &&
          !(await tx.externalEffect.findFirst({
            where: { runId: candidate.runId, kind: "task_report.publish", status: "ambiguous" },
            select: { id: true },
          })))
      )
        throw new IsolationError();
      let source: Prisma.TaskStarterExecutionGetPayload<{ include: { run: true } }> = candidate;
      const ancestors = new Set<string>();
      while (source.action === "reconcile") {
        if (!source.sourceExecutionId || ancestors.has(source.id) || ancestors.size >= 8)
          throw new IsolationError();
        ancestors.add(source.id);
        const parent: Prisma.TaskStarterExecutionGetPayload<{ include: { run: true } }> | null =
          await tx.taskStarterExecution.findFirst({
            where: {
              id: source.sourceExecutionId,
              run: { spaceId: actor.spaceId, userId: actor.userId },
            },
            include: { run: true },
          });
        if (!parent) throw new IsolationError();
        source = parent;
      }
      if (!["publish", "scheduled_publish"].includes(source.action)) throw new IsolationError();
      await tx.$queryRaw`SELECT id FROM threads WHERE id = ${source.run.threadId} FOR UPDATE`;
      const connections = StarterConnectionsSchema.parse(source.connections);
      await assertStarterConnections(tx, actor, connections);
      const previous = await tx.taskStarterExecution.findUnique({
        where: { sourceExecutionId_action: { sourceExecutionId: source.id, action: "reconcile" } },
        include: { run: true },
      });
      if (previous) {
        const held = await tx.run.updateMany({
          where: { id: previous.runId, status: { in: ["failed", "cancelled"] } },
          data: {
            status: "queued",
            error: null,
            completedAt: null,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        if (held.count)
          await tx.task.update({ where: { id: previous.run.taskId }, data: { status: "queued" } });
        return previous;
      }
      const task = await tx.task.create({
        data: {
          spaceId: actor.spaceId,
          userId: actor.userId,
          botId: source.run.botId,
          threadId: source.run.threadId,
          prompt: "Check the outcome of the previous Sheet update without changing it",
          status: "queued",
        },
      });
      const run = await tx.run.create({
        data: {
          spaceId: actor.spaceId,
          userId: actor.userId,
          botId: source.run.botId,
          threadId: source.run.threadId,
          taskId: task.id,
          trigger: "task_starter",
          status: "queued",
          clientNonce: `task-reconcile:${source.id}`,
        },
      });
      const child = await tx.taskStarterExecution.create({
        data: {
          runId: run.id,
          starter: source.starter,
          action: "reconcile",
          input: source.input as Prisma.InputJsonValue,
          connections,
          result: source.result as Prisma.InputJsonValue,
          sourceExecutionId: source.id,
          reconciliationRequired: true,
        },
      });
      const message = await createThreadMessageInTransaction(tx, {
        threadId: run.threadId,
        botId: run.botId,
        runId: run.id,
        role: "bot",
        blocks: [{ kind: "task_starter_receipt", receiptId: child.id }],
      });
      await appendEventInTransaction(tx, {
        spaceId: actor.spaceId,
        threadId: run.threadId,
        botId: run.botId,
        runId: run.id,
        type: "thread.message.created",
        payload: { messageId: message.id, role: "bot", blocks: message.blocks },
      });
      return child;
    });
    await this.enqueue(execution.runId);
    return this.receipt(actor, execution.id);
  }
  async schedule(actor: Actor, input: { receiptId: string; cron: string; timezone: string }) {
    const nextRunAt = nextCronDateAcrossStrict([input.cron], new Date(), input.timezone);
    if (!nextRunAt) throw new Error("Choose a recurring schedule");
    const routine = await this.deps.prisma.$transaction(async (tx) => {
      const row = await tx.taskStarterExecution.findFirst({
        where: {
          id: input.receiptId,
          run: { spaceId: actor.spaceId, userId: actor.userId, status: "completed" },
        },
        include: { run: true },
      });
      if (!row?.result) throw new IsolationError();
      const result = TaskStarterResultSchema.parse(row.result);
      if (
        result.kind !== "analytics_report" ||
        !result.report.published ||
        !result.report.spreadsheetId
      )
        throw new Error("Publish the report before scheduling it");
      await tx.$queryRaw`SELECT id FROM threads WHERE id = ${row.run.threadId} FOR UPDATE`;
      const connections = StarterConnectionsSchema.parse(row.connections);
      await assertStarterConnections(tx, actor, connections);
      const existing = await tx.routine.findFirst({
        where: {
          spaceId: actor.spaceId,
          userId: actor.userId,
          taskStarterSpec: { path: ["sourceExecutionId"], equals: row.id },
          crons: { equals: [input.cron] },
          timezone: input.timezone,
          active: true,
        },
      });
      if (existing) return existing;
      const spec = TaskStarterSpecSchema.parse({
        ...TaskStarterSpecSchema.parse(row.input),
        spreadsheetId: result.report.spreadsheetId,
        reportRange: result.report.range,
        timezone: result.report.timezone,
      });
      return tx.routine.create({
        data: {
          spaceId: actor.spaceId,
          userId: actor.userId,
          botId: row.run.botId,
          threadId: row.run.threadId,
          name: "GA4 report",
          prompt: "Update the approved GA4 report in Google Sheets",
          crons: [input.cron],
          timezone: input.timezone,
          active: true,
          nextRunAt,
          taskStarterSpec: {
            sourceExecutionId: row.id,
            spec: spec as Prisma.InputJsonValue,
            connections,
          },
        },
      });
    });
    await this.deps.jobs
      .enqueue(routineWakeupJob(routine.id, nextRunAt))
      .catch((error) => getLogger().error("task starter schedule enqueue", error));
    return { routineId: routine.id };
  }
}
