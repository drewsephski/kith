import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AdapterContext, BackgroundJobHandlers, SandboxProvider } from "@rakazo/adapter-kit";
import {
  GraphileJobWorkerHost,
  LocalAgentHomeStore,
  PiAgentRuntime,
  sleepComputerIfIdle,
} from "@rakazo/adapters";
import type { ModelConnectInputSchema, RunStatus } from "@rakazo/contracts";
import { isTerminal } from "@rakazo/core";
import { createDb, createThreadEvents } from "@rakazo/db";
import { createApp } from "../../../../apps/api/src/app.js";
import { discardBotIntroRun } from "../discard-bot-intro.js";
import type { EvalPricing, MeasuredCall } from "../evals/measurement.js";
import { measureCalls, SpendBudget } from "../evals/measurement.js";
import { EvalServices } from "../evals/services.js";
import { sessionCookieHeader } from "../index.js";
import { startModelEmulator } from "../model-emulator.js";
import type { AcceptanceScenario } from "./fixtures.js";
import { ACCEPTANCE_SCENARIOS, acceptanceFixture, approvalNote, FILE_CONTENT } from "./fixtures.js";
import { observeSandbox } from "./sandbox.js";
import { observeThreadStream } from "./stream.js";

// Keep the connection contract concrete, including explicit model and reasoning settings.
type ModelConnection = ReturnType<typeof ModelConnectInputSchema.parse>;
type Handles = Awaited<ReturnType<typeof createApp>>;
export interface AcceptanceOptions {
  databaseUrl: string;
  dataDir: string;
  sandbox: SandboxProvider;
  connection?: ModelConnection;
  pricing?: EvalPricing;
  maxUsd?: number;
  maxCalls: number;
  maxStarts: number;
  maxRuntimeMs: number;
  physicalRequests?: () => number;
  live: boolean;
  prepareCleanup?: () => void;
  save: (report: AcceptanceReport) => Promise<void>;
}
export interface AcceptanceReport {
  version: 1;
  mode: "live" | "deterministic";
  status: "running" | "passed" | "failed";
  transport: string;
  sandbox: string;
  cases: Array<{
    scenario: AcceptanceScenario;
    status: "NOT RUN" | "PASSED" | "FAILED";
    completionMs?: number;
    safeTextMs?: number;
    tools?: number;
  }>;
  modelCalls: number;
  modelHttpRequests: number | null;
  usage: ReturnType<typeof measureCalls> | null;
  budget: {
    maxCalls: number;
    maxStarts: number;
    maxRuntimeMs: number;
    maxUsd: number | null;
    usedUpperBoundUsd: number | null;
    reservedUsd: number | null;
  };
  sandboxCalls: { create: number; resume: number; prepare: number; stop: number; destroy: number };
  activeComputerWorkVerified: boolean | null;
  cleanup: "pending" | "passed" | "failed";
  failure?: string;
  runFailureCategory?:
    | "provider-unavailable"
    | "model-output-limit"
    | "authorization"
    | "execution";
}
const origin = "http://127.0.0.1:5173";
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runProductAcceptance(options: AcceptanceOptions): Promise<AcceptanceReport> {
  const measured = observeSandbox(options.sandbox, options.maxStarts);
  const services = new EvalServices();
  const budget = options.live ? new SpendBudget(options.maxUsd, options.pricing) : undefined;
  const deadline = Date.now() + options.maxRuntimeMs;
  let accepting = true;
  let handles: Handles | undefined;
  let worker: GraphileJobWorkerHost | undefined;
  let workerDb: ReturnType<typeof createDb> | undefined;
  let cookie = "";
  let botId = "";
  let activeStream: Awaited<ReturnType<typeof observeThreadStream>> | undefined;
  let activeModel: Awaited<ReturnType<typeof startModelEmulator>> | undefined;
  let selectedModel: ModelConnection | undefined;
  const inflight = new Set<string>();
  const calls: MeasuredCall[] = [];
  const report: AcceptanceReport = {
    version: 1,
    mode: options.live ? "live" : "deterministic",
    status: "running",
    transport: "authenticated API / PostgreSQL / Graphile / executor / Pi / model HTTP SSE",
    sandbox: options.sandbox.describe().id,
    cases: ACCEPTANCE_SCENARIOS.map((scenario) => ({ scenario, status: "NOT RUN" })),
    modelCalls: 0,
    modelHttpRequests: null,
    usage: null,
    budget: {
      maxCalls: options.maxCalls,
      maxStarts: options.maxStarts,
      maxRuntimeMs: options.maxRuntimeMs,
      maxUsd: options.maxUsd ?? null,
      usedUpperBoundUsd: null,
      reservedUsd: null,
    },
    sandboxCalls: measured.counts,
    activeComputerWorkVerified: null,
    cleanup: "pending",
  };
  const save = async () => {
    report.modelHttpRequests = options.physicalRequests?.() ?? null;
    report.usage = calls.length ? measureCalls(calls, options.pricing) : null;
    report.budget.usedUpperBoundUsd = budget?.usedUsd ?? null;
    report.budget.reservedUsd = budget?.reservedUsd ?? null;
    await options.save(report);
  };
  const requireTime = () => {
    if (!accepting || Date.now() >= deadline)
      throw new Error("Acceptance runtime budget exhausted");
  };
  const stopScheduling = () => {
    accepting = false;
    measured.stopScheduling();
  };
  const interrupt = () => {
    stopScheduling();
    void activeStream?.close().catch(() => undefined);
    void Promise.allSettled([...inflight].map((id) => handles?.runtime.abort(id)));
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  const timer = setTimeout(interrupt, options.maxRuntimeMs);
  const rpc = async <T>(procedure: string, input: unknown = {}): Promise<T> => {
    const response = await handles!.app.request(`/rpc/${procedure}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin },
      body: JSON.stringify({ json: input }),
    });
    assert.ok(response.ok, `Acceptance RPC failed: ${procedure} (${response.status})`);
    return ((await response.json()) as { json: T }).json;
  };
  const runtime = () =>
    new PiAgentRuntime({
      modelCallObserver: {
        beforeCall(call) {
          requireTime();
          assert.ok(
            selectedModel &&
              call.provider === selectedModel.provider &&
              call.modelId === selectedModel.modelId,
            "Selected model changed",
          );
          if (report.modelCalls >= options.maxCalls)
            throw new Error("Acceptance model request budget exhausted");
          report.modelCalls++;
          return (
            budget?.reserve(
              call.inputTokensEstimate,
              call.maxOutputTokens,
              call.cacheWriteRetention,
            ) ?? String(report.modelCalls)
          );
        },
        afterCall: (id, usage) => {
          budget?.settleUsage(id, usage);
          calls.push({ id, ...usage });
        },
      },
    });
  const start = async () => {
    handles = await createApp({
      databaseUrl: options.databaseUrl,
      directDatabaseUrl: options.databaseUrl,
      realtimeDatabaseUrl: options.databaseUrl,
      dataDir: options.dataDir,
      sandbox: measured.sandbox,
      sandboxProvider: "fake",
      agentRuntime: "pi",
      runtime: runtime(),
      wakeupDriver: "graphile",
      authUrl: origin,
      webOrigin: origin,
      signupsEnabled: "true",
      composio: services,
      cloudAgentProvider: "none",
      piSessionRecording: false,
      mcpStdioEnabled: false,
      mcpStdioAllowedCommands: [],
      deploymentModelConfigured: false,
      emailEmulator: true,
    });
  };
  const startWorker = async () => {
    workerDb = createDb(options.databaseUrl, { poolMax: 6 });
    worker = new GraphileJobWorkerHost(workerDb.pool, {
      concurrency: 2,
      noHandleSignals: true,
      pollInterval: 25,
    });
    const app = handles!;
    await worker.start({
      "run.continue": async ({ runId }) => {
        inflight.add(runId);
        try {
          await app.executor.continueRun(runId, "acceptance-worker");
        } finally {
          inflight.delete(runId);
        }
      },
      "computer.sleep": async ({ computerId }) =>
        sleepComputerIfIdle(
          {
            prisma: app.prisma,
            sandbox: measured.sandbox,
            jobs: app.jobs,
            home: new LocalAgentHomeStore(options.dataDir),
            events: createThreadEvents(app.prisma),
          },
          computerId,
        ),
    } as BackgroundJobHandlers);
  };
  const stopWorker = async () => {
    await worker?.stop();
    worker = undefined;
    await workerDb?.prisma.$disconnect();
    await workerDb?.pool.end();
    workerDb = undefined;
  };
  const restart = async () => {
    await waitUntil(() => Promise.resolve(inflight.size === 0));
    await stopWorker();
    await handles!.stop();
    handles = undefined;
    await start();
    await startWorker();
  };
  async function waitUntil(check: () => Promise<boolean>) {
    while (!(await check())) {
      requireTime();
      await delay(25);
    }
  }
  const waitRun = async (runId: string, status: string) => {
    await waitUntil(async () => {
      const run = await handles!.prisma.run.findUniqueOrThrow({ where: { id: runId } });
      if (run.status === status) return true;
      if (run.status === "failed") {
        const error = run.error ?? "";
        report.runFailureCategory =
          /rate.?limit|temporar|unavailable|timeout|timed out|network|connection|429|50[0234]/i.test(
            error,
          )
            ? "provider-unavailable"
            : /output limit|token limit|length/i.test(error)
              ? "model-output-limit"
              : /permission|credential|unauthorized|forbidden|connect.*first/i.test(error)
                ? "authorization"
                : "execution";
      }
      assert.ok(
        !isTerminal(run.status as RunStatus),
        `Acceptance expected ${status}, got ${run.status}`,
      );
      return false;
    });
  };
  const setModel = async (scenario: AcceptanceScenario) => {
    if (activeModel) {
      activeModel.assertComplete();
      await activeModel.close();
      activeModel = undefined;
    }
    if (options.connection) selectedModel = options.connection;
    else {
      activeModel = await startModelEmulator({
        steps: acceptanceFixture(scenario).steps,
        apiKey: "synthetic-acceptance-model-key",
      });
      selectedModel = {
        provider: activeModel.model.provider,
        modelId: activeModel.model.id,
        baseUrl: activeModel.baseUrl,
        apiKey: "synthetic-acceptance-model-key",
        contextWindow: 160_000,
        maxTokens: 4096,
        label: "Acceptance model",
      } as ModelConnection;
    }
    await rpc("models/connect", selectedModel);
    await rpc("bots/update", {
      botId,
      modelProvider: selectedModel.provider,
      modelId: selectedModel.modelId,
    });
  };
  const send = async (scenario: AcceptanceScenario) => {
    const before = Date.now();
    const clientNonce = randomUUID();
    const input = { botId, text: acceptanceFixture(scenario).prompt, clientNonce };
    const sent = await rpc<{ runId: string }>("threads/send", input);
    // An uncertain send retry must reuse the persisted message and durable run.
    const retry = await rpc<{ runId: string }>("threads/send", input);
    assert.equal(retry.runId, sent.runId, "Send retry created another run");
    assert.equal(
      await handles!.prisma.message.count({ where: { clientNonce, thread: { botId } } }),
      1,
    );
    return { ...sent, before };
  };
  const finalText = async (runId: string) => {
    const messages = await handles!.prisma.message.findMany({
      where: { runId, role: "bot" },
      orderBy: { seq: "asc" },
    });
    return messages
      .flatMap((message) => (Array.isArray(message.blocks) ? message.blocks : []))
      .filter((block): block is { kind: "text"; text: string } =>
        Boolean(
          block &&
            typeof block === "object" &&
            "kind" in block &&
            block.kind === "text" &&
            "text" in block &&
            typeof block.text === "string",
        ),
      )
      .map((block) => block.text)
      .join("\n");
  };
  const assertNoComputer = (starts: number) =>
    assert.equal(
      measured.counts.create + measured.counts.resume,
      starts,
      "Noncomputer task activated a computer",
    );
  const cleanupContext: AdapterContext = {
    operationId: "acceptance-cleanup",
    traceId: "acceptance-cleanup",
    userId: "synthetic",
    spaceId: "synthetic",
    signal: AbortSignal.timeout(60_000),
  };
  let failedScenario: AcceptanceScenario | undefined;
  try {
    await save();
    await start();
    const signup = await handles!.app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({
        email: `acceptance-${randomUUID()}@example.test`,
        password: "synthetic-acceptance-password-12",
        name: "Acceptance fixture",
      }),
    });
    assert.ok(signup.ok, "Synthetic signup failed");
    cookie = sessionCookieHeader(signup);
    const bot = await rpc<{ id: string }>("bots/create", {
      name: "Acceptance assistant",
      computerMode: "dedicated",
      notifyOnFinish: false,
    });
    botId = bot.id;
    await discardBotIntroRun(handles!, cookie, botId);
    await startWorker();
    let gmailId = "";
    for (const row of report.cases) {
      requireTime();
      if (!options.live) console.log(`Starting ${row.scenario}`);
      failedScenario = row.scenario;
      const starts = measured.counts.create + measured.counts.resume;
      if (row.scenario === "computer-lifecycle") {
        const persistedBot = await handles!.prisma.bot.findUniqueOrThrow({ where: { id: botId } });
        const computerId = persistedBot.computerId!;
        assert.equal(measured.counts.create, 1, "Computer task must start exactly one computer");
        // Recent activity must survive an early idle job. Then use the actual
        // configured idle interval (90 seconds for E2B), without changing timestamps.
        await sleepComputerIfIdle(
          {
            prisma: handles!.prisma,
            sandbox: measured.sandbox,
            jobs: handles!.jobs,
            home: new LocalAgentHomeStore(options.dataDir),
            events: createThreadEvents(handles!.prisma),
          },
          computerId,
        );
        assert.equal(
          (await handles!.prisma.computer.findUniqueOrThrow({ where: { id: computerId } })).state,
          "running",
        );
        if (!options.live) {
          await handles!.prisma.computer.update({
            where: { id: computerId },
            data: { lastUsedAt: new Date(Date.now() - 310_000) },
          });
          await sleepComputerIfIdle(
            {
              prisma: handles!.prisma,
              sandbox: measured.sandbox,
              jobs: handles!.jobs,
              home: new LocalAgentHomeStore(options.dataDir),
              events: createThreadEvents(handles!.prisma),
            },
            computerId,
          );
        }
        await waitUntil(
          async () =>
            (await handles!.prisma.computer.findUniqueOrThrow({ where: { id: computerId } }))
              .state === "suspended",
        );
        for (let read = 0; read < 3; read++) {
          await rpc("computer/status", { botId });
          await rpc("computer/screenUrl", { botId });
          const file = await rpc<{ content: string }>("computer/readFile", {
            botId,
            path: "notes/acceptance.txt",
          });
          assert.equal(file.content, FILE_CONTENT);
        }
        assertNoComputer(starts);
        await rpc("computer/boot", { botId });
        assert.equal(measured.counts.resume, 1);
        assert.equal(
          (
            await rpc<{ content: string }>("computer/readFile", {
              botId,
              path: "notes/acceptance.txt",
            })
          ).content,
          FILE_CONTENT,
        );
        await rpc("computer/stop", { botId });
        assert.equal((await rpc<{ state: string }>("computer/status", { botId })).state, "stopped");
      } else {
        if (row.scenario === "memory-restart") {
          await rpc("threads/clear", { botId });
          await restart();
        }
        if (row.scenario === "connected-source")
          gmailId = (
            await rpc<{ connectionId: string }>("connections/begin", {
              connectorId: "composio",
              provider: "GMAIL",
              displayName: "Synthetic Gmail",
            })
          ).connectionId;
        if (row.scenario === "revoked-source") {
          await rpc("connections/revoke", { connectionId: gmailId });
          // Prior conversation must not let an old inbox answer masquerade as a fresh read.
          await rpc("threads/clear", { botId });
        }
        if (row.scenario.startsWith("approval-")) {
          await rpc("threads/clear", { botId });
          const storedBot = await handles!.prisma.bot.findUniqueOrThrow({ where: { id: botId } });
          if (
            !(await handles!.prisma.actionApprovalRule.count({
              where: { spaceId: storedBot.spaceId, matchValue: "CRM_CREATE_NOTE" },
            }))
          ) {
            await rpc("connections/begin", {
              connectorId: "composio",
              provider: "CRM",
              displayName: "Synthetic CRM",
            });
            await handles!.prisma.actionApprovalRule.create({
              data: {
                spaceId: storedBot.spaceId,
                createdByUserId: storedBot.userId,
                effect: "require_approval",
                matchKind: "tool",
                matchValue: "CRM_CREATE_NOTE",
              },
            });
          }
        }
        await setModel(row.scenario);
        const callsBefore = services.calls.length;
        const notesBefore = services.notes.length;
        if (row.scenario === "conversation" || row.scenario === "cancellation") {
          const snapshot = await rpc<{ threadId: string; cursor: number }>("threads/get", {
            botId,
          });
          activeStream = await observeThreadStream(
            handles!.app,
            cookie,
            botId,
            snapshot.threadId,
            snapshot.cursor,
            row.scenario === "conversation",
          );
        }
        const sent = await send(row.scenario);
        if (row.scenario === "cancellation") {
          await waitRun(sent.runId, "running");
          await waitUntil(() => Promise.resolve(activeStream!.firstText.has(sent.runId)));
          await rpc("threads/stop", { botId });
          await waitRun(sent.runId, "cancelled");
          const cancelled = await handles!.prisma.run.findUniqueOrThrow({
            where: { id: sent.runId },
            include: { task: true, attempts: true },
          });
          assert.equal(cancelled.task.status, "cancelled");
          assert.ok(cancelled.attempts.every((attempt) => attempt.status === "cancelled"));
          assert.equal(cancelled.leaseOwner, null);
        } else if (row.scenario.startsWith("approval-")) {
          await waitRun(sent.runId, "waiting_input");
          assert.equal(services.notes.length, notesBefore);
          const effect = await handles!.prisma.externalEffect.findFirstOrThrow({
            where: { runId: sent.runId, kind: "CRM_CREATE_NOTE" },
          });
          assert.equal(effect.status, "intended");
          const card = await handles!.prisma.message.findFirstOrThrow({
            where: { runId: sent.runId, role: "bot" },
            orderBy: { seq: "desc" },
          });
          if (row.scenario === "approval-interrupted") {
            await rpc("threads/stop", { botId });
            const reply = await handles!.app.request("/rpc/threads/answer", {
              method: "POST",
              headers: { "content-type": "application/json", cookie, origin },
              body: JSON.stringify({
                json: { botId, runId: sent.runId, messageId: card.id, answer: "allow" },
              }),
            });
            assert.ok(!reply.ok, "Late approval accepted a stopped run");
            await waitRun(sent.runId, "cancelled");
            assert.equal(services.notes.length, notesBefore);
          } else {
            await restart();
            const callsBeforeAnswer = report.modelCalls;
            await rpc("threads/answer", {
              botId,
              runId: sent.runId,
              messageId: card.id,
              answer: row.scenario === "approval-allow" ? "allow" : "deny",
            });
            await waitRun(sent.runId, "completed");
            if (row.scenario === "approval-deny") {
              assert.equal(
                report.modelCalls,
                callsBeforeAnswer,
                "Denied action restarted inference",
              );
              assert.match(await finalText(sent.runId), /action was denied/i);
            }
            assert.equal(
              services.notes.length,
              notesBefore + (row.scenario === "approval-allow" ? 1 : 0),
            );
            if (row.scenario === "approval-allow")
              assert.deepEqual(services.notes.at(-1), approvalNote(row.scenario));
            assert.equal(
              (await handles!.prisma.externalEffect.findUniqueOrThrow({ where: { id: effect.id } }))
                .status,
              row.scenario === "approval-allow" ? "completed" : "denied",
            );
          }
        } else {
          await waitRun(sent.runId, "completed");
          const answer = await finalText(sent.runId);
          assert.ok(answer.trim(), "No durable assistant answer");
          if (row.scenario === "conversation") {
            assert.match(answer, /\b4\b/);
            assert.equal(
              await handles!.prisma.message.count({ where: { runId: sent.runId, role: "bot" } }),
              1,
              "Duplicate conversation answer",
            );
          }
          if (row.scenario === "memory-save") {
            const bot = await handles!.prisma.bot.findUniqueOrThrow({ where: { id: botId } });
            const memory = await handles!.prisma.memoryDocument.findMany({
              where: {
                spaceId: bot.spaceId,
                userId: bot.userId,
                OR: [
                  { scope: "bot", botId },
                  { scope: "user", botId: null },
                ],
              },
            });
            assert.ok(
              memory.some((doc) => /violet-731/i.test(doc.content)),
              "Preference not persisted",
            );
          }
          if (row.scenario === "memory-restart") assert.match(answer, /violet-731/i);
          if (row.scenario === "connected-source") {
            assert.ok(
              services.calls
                .slice(callsBefore)
                .some((call) => call.tool === "GMAIL_LIST_MESSAGES" && call.outcome === "read"),
            );
            assert.match(answer, /unsigned contract/i);
          }
          if (row.scenario === "revoked-source") {
            assert.ok(
              !services.calls
                .slice(callsBefore)
                .some((call) => call.tool === "GMAIL_LIST_MESSAGES" && call.outcome === "read"),
            );
            assert.match(answer, /access|connect|unavailable|permission|revoked/i);
          }
          if (row.scenario === "computer-file") {
            assert.equal(measured.counts.create + measured.counts.resume - starts, 1);
            if (options.live && options.sandbox.describe().id === "e2b") {
              assert.ok(
                measured.commands.some(
                  (command) =>
                    command.operationId === sent.runId &&
                    command.durationMs >= 90_000 &&
                    command.activeMarker &&
                    command.code === 0,
                ),
                "No independently observed long computer command",
              );
              assert.equal(measured.counts.stop, 0, "Computer suspended during active work");
              report.activeComputerWorkVerified = true;
            }
            assert.equal(
              (
                await rpc<{ content: string }>("computer/readFile", {
                  botId,
                  path: "notes/acceptance.txt",
                })
              ).content,
              FILE_CONTENT,
            );
            const receipts = await rpc<
              Array<{ kind: string; status: string; exitCode: number | null }>
            >("computer/commands", { botId });
            assert.ok(
              receipts.some((receipt) => receipt.status === "done" && receipt.exitCode === 0),
              "No successful file receipt",
            );
          }
        }
        await waitUntil(() => Promise.resolve(!inflight.has(sent.runId)));
        if (activeStream) {
          await waitUntil(() => Promise.resolve(activeStream!.firstText.has(sent.runId)));
          row.safeTextMs = activeStream.firstText.get(sent.runId)! - sent.before;
          if (row.scenario === "conversation") assert.equal(activeStream.reconnects, 1);
          await activeStream.close();
          activeStream = undefined;
        }
        activeModel?.assertComplete();
        row.completionMs = Date.now() - sent.before;
        row.tools = await handles!.prisma.event.count({
          where: { runId: sent.runId, type: "agent.tool.completed" },
        });
        // Completion removes progress, so consume it live before finalization in
        // conversation streaming acceptance below rather than inferring it from prose.
        if (row.scenario !== "computer-file") assertNoComputer(starts);
      }
      row.status = "PASSED";
      await save();
    }
    report.status = "passed";
  } catch (error) {
    if (!options.live) console.error(error);
    report.status = "failed";
    const row = report.cases.find((item) => item.scenario === failedScenario);
    if (row) row.status = "FAILED";
    const diagnostic =
      error instanceof assert.AssertionError && !error.generatedMessage
        ? error.message
        : error instanceof Error &&
            /^Acceptance|Selected model|Noncomputer|Computer|Preference|No |Tool|Send retry|Synthetic|Late approval/.test(
              error.message,
            )
          ? error.message.split("\n")[0]
          : "Observable outcome check failed";
    report.failure = failedScenario
      ? `${failedScenario}: ${diagnostic}`
      : "Acceptance setup failed";
  } finally {
    clearTimeout(timer);
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    stopScheduling();
    options.prepareCleanup?.();
    const failures: unknown[] = [];
    for (const operation of [
      async () => {
        if (handles && botId) await rpc("threads/stop", { botId });
      },
      async () => {
        await Promise.all([...inflight].map((id) => handles!.runtime.abort(id)));
      },
      stopWorker,
      async () => {
        await handles?.stop();
      },
      async () => {
        await measured.cleanup(cleanupContext);
      },
      async () => {
        await activeStream?.close();
        await activeModel?.close();
      },
    ]) {
      try {
        await operation();
      } catch (error) {
        failures.push(error);
      }
    }
    report.cleanup = failures.length ? "failed" : "passed";
    if (failures.length) {
      report.status = "failed";
      report.failure = "Acceptance cleanup failed";
    }
    await save();
  }
  return report;
}
