import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { AdapterContext, BackgroundJobHandlers } from "@rakazo/adapter-kit";
import {
  ComposioEmulator,
  createBrowserProvider,
  FakeSandboxProvider,
  GraphileJobWorkerHost,
} from "@rakazo/adapters";
import { createDb } from "@rakazo/db";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { createApp } from "../../../../apps/api/src/app.js";
import { createLogger, createTestSink } from "../../../logging/src/index.js";
import { discardBotIntroRun } from "../discard-bot-intro.js";
import { sessionCookieHeader } from "../index.js";
import type { ModelEmulatorRequest, ModelEmulatorStep } from "../model-emulator.js";
import { startModelEmulator } from "../model-emulator.js";

const arg = (name: string, fallback: string) =>
  process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const trials = Number(arg("trials", "20"));
assert.ok(Number.isInteger(trials) && trials >= 1 && trials <= 100);
const parallel = Number(arg("parallel", "1"));
assert.ok(Number.isInteger(parallel) && parallel >= 1 && parallel <= 4);
const chunkMs = Number(arg("chunk-ms", "2"));
assert.ok(Number.isInteger(chunkMs) && chunkMs >= 0 && chunkMs <= 1000);
const output = path.resolve(arg("output", "test-report/latency/current.json"));
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const origin = "http://127.0.0.1:5173";

// These delays represent controllable dependencies, not live provider measurements.
class MeasuredSandbox extends FakeSandboxProvider {
  provisions = 0;
  preparations = 0;
  byRun = new Map<string, { provisions: number; preparations: number }>();
  private count(context: AdapterContext, key: "provisions" | "preparations") {
    const counts = this.byRun.get(context.operationId) ?? { provisions: 0, preparations: 0 };
    counts[key]++;
    this.byRun.set(context.operationId, counts);
  }
  override async provision(...args: Parameters<FakeSandboxProvider["provision"]>) {
    this.provisions += 1;
    this.count(args[1], "provisions");
    await delay(120);
    return super.provision(...args);
  }
  override async prepare(...args: Parameters<FakeSandboxProvider["prepare"]>) {
    this.preparations += 1;
    this.count(args[1], "preparations");
    await delay(60);
    return super.prepare(...args);
  }
}
class MeasuredConnector extends ComposioEmulator {
  discoveries = 0;
  byRun = new Map<string, number>();
  override async discoverTools(...args: Parameters<ComposioEmulator["discoverTools"]>) {
    this.discoveries += 1;
    this.byRun.set(args[0].operationId, (this.byRun.get(args[0].operationId) ?? 0) + 1);
    await delay(40);
    return super.discoverTools(...args);
  }
}

const cases = [
  { name: "greeting", prompt: "Hi", answer: "Hello!" },
  { name: "background-load", prompt: "Hi", answer: "Hello!", background: true },
  { name: "slow-provider", prompt: "Hi", answer: "Hello!", slow: true },
  { name: "arithmetic", prompt: "What is 2 + 2?", answer: "4." },
  {
    name: "explanation",
    prompt: "Explain REST versus GraphQL briefly.",
    answer: "REST uses resource endpoints; GraphQL lets clients request specific fields.",
  },
  {
    name: "follow-up",
    prompt: "Can you explain that more briefly?",
    answer: "REST has fixed endpoints. GraphQL selects fields.",
  },
  {
    name: "memory",
    prompt: "What is my saved favorite color?",
    answer: "Your favorite color is teal.",
  },
  {
    name: "connected-data",
    prompt: "Fetch the labels in my connected Gmail account.",
    answer: "Your Gmail labels include INBOX and SENT.",
    tool: "GMAIL_LIST_LABELS",
    args: {},
  },
  {
    name: "tool",
    prompt: "List files on your computer.",
    answer: "Listed the workspace files.",
    tool: "list_files",
    args: { path: "" },
  },
  {
    name: "computer",
    prompt: "Write hello to notes/result.txt on your computer.",
    answer: "Saved notes/result.txt.",
    tool: "write_file",
    args: { path: "notes/result.txt", content: "hello" },
  },
  {
    name: "browser",
    prompt: "Open the fixture website in your browser.",
    answer: "Opened the fixture website.",
    tool: "browser_navigate",
    args: { url: "https://fixture.example.test" },
  },
  {
    name: "attachment",
    prompt: "Describe the attached image.",
    answer: "The fixture image is attached.",
    image: true,
  },
  {
    name: "long-agent",
    prompt: "Create four notes with hello 0 through hello 3, then read each back to verify them.",
    answer: "Created and verified all four notes.",
    tool: "write_file",
    args: { path: "notes/step-0.txt", content: "hello 0" },
    long: true,
  },
  {
    name: "multi-step",
    prompt: "Write hello to notes/result.txt, then read it and report the result.",
    answer: "Wrote and verified hello.",
    tool: "write_file",
    args: { path: "notes/result.txt", content: "hello" },
    second: true,
  },
] as const;
const selectedNames = arg("scenarios", "").split(",").filter(Boolean);
const selectedCases = cases.filter(
  (item) => !selectedNames.length || selectedNames.includes(item.name),
);

type Sample = {
  scenario: string;
  temperature: string;
  acknowledgmentMs: number;
  firstPublishedTextMs: number;
  firstTextReceivedMs: number;
  completionMs: number;
  queueWaitMs: number | null;
  setupMs: number | null;
  modelToFirstTextMs: number | null;
  streamDeliveryMs: number | null;
  toolCount: number;
  toolSchemaBytes: number;
  promptBytes: number;
  modelCalls: number;
  streamReconnects: number;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  provisions: number;
  preparations: number;
  discoveries: number;
};

/** A disposable local cluster is useful when a shared Docker runtime is occupied. */
async function startDatabase() {
  if (arg("postgres", "docker") !== "local")
    return new PostgreSqlContainer("postgres:16-alpine").start();
  const directory = await mkdtemp(path.join(tmpdir(), "kith-latency-pg-"));
  const execute = promisify(execFile);
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  try {
    await execute(
      "initdb",
      ["-D", directory, "-U", "latency_fixture", "-A", "trust", "--no-locale", "-E", "UTF8"],
      { timeout: 120_000 },
    );
    await execute(
      "pg_ctl",
      [
        "-D",
        directory,
        "-l",
        path.join(directory, "server.log"),
        "-o",
        `-h 127.0.0.1 -p ${port} -k ${directory}`,
        "-w",
        "start",
      ],
      { timeout: 120_000 },
    );
    return {
      getConnectionUri: () => `postgresql://latency_fixture@127.0.0.1:${port}/postgres`,
      async stop() {
        await execute("pg_ctl", ["-D", directory, "-m", "fast", "-w", "stop"], {
          timeout: 120_000,
        });
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await execute("pg_ctl", ["-D", directory, "-m", "fast", "stop"]).catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  // Pin offline composition before createApp; do not load a maintainer's .env.
  Object.assign(process.env, {
    BETTER_AUTH_SECRET: "latency-fixture-auth-secret-32chars",
    ENCRYPTION_KEY: "latency-fixture-encryption-key-32chars",
    SANDBOX_SUPERVISOR_TOKEN: "latency-fixture-supervisor-secret-32chars",
    BROWSER_PROVIDER: "emulator",
    SANDBOX_PROVIDER: "fake",
    AGENT_RUNTIME: "pi",
    WAKEUP_DRIVER: "graphile",
    SCREEN_PROXY_SECRET: "latency-fixture-screen-secret-32chars",
    CLOUD_AGENT_PROVIDER: "emulator",
    MODEL_API_KEY: "",
    PI_DEFAULT_PROVIDER: "openai-compatible",
    PI_DEFAULT_MODEL: "offline-fixture",
    PI_DEFAULT_CREDENTIALS: "",
    ANTHROPIC_API_KEY: "",
    INTEGRATIONS_CATALOG_URL: "",
    OPENROUTER_API_KEY: "",
    COMPOSIO_API_KEY: "",
    AXIOM_TOKEN: "",
    LOG_LEVEL: "off",
  });
  const container = await startDatabase();
  const dataDir = await mkdtemp(path.join(tmpdir(), "kith-latency-"));
  let handles: Awaited<ReturnType<typeof createApp>> | undefined;
  let host: GraphileJobWorkerHost | undefined;
  let workerDb: ReturnType<typeof createDb> | undefined;
  const activeModels = new Set<Awaited<ReturnType<typeof startModelEmulator>>>();
  try {
    const databaseUrl = container.getConnectionUri();
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      DATABASE_DIRECT_URL: databaseUrl,
      REALTIME_DATABASE_URL: databaseUrl,
    });
    execFileSync("pnpm", ["--filter", "@rakazo/db", "exec", "prisma", "migrate", "deploy"], {
      stdio: "ignore",
    });
    const sandbox = new MeasuredSandbox();
    const connector = new MeasuredConnector();
    const sink = createTestSink();
    handles = await createApp({
      databaseUrl,
      realtimeDatabaseUrl: databaseUrl,
      dataDir,
      sandboxProvider: "fake",
      sandbox,
      browser: createBrowserProvider("emulator", {
        pages: {
          "https://fixture.example.test": { title: "Fixture", html: "<p>Offline fixture page</p>" },
        },
      }),
      agentRuntime: "pi",
      wakeupDriver: "graphile",
      authUrl: origin,
      webOrigin: origin,
      signupsEnabled: "true",
      composio: connector,
      logger: createLogger({ service: "latency-fixture", sinks: [sink], level: "info" }),
    });
    const app = handles;
    const signup = await app.app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({
        email: `latency-${randomUUID()}@example.test`,
        password: "password12",
        name: "Latency fixture",
      }),
    });
    assert.ok(signup.ok);
    const fixtureCookie = sessionCookieHeader(signup);
    const rpcFor =
      (cookie: string) =>
      async <T>(procedure: string, input: unknown): Promise<T> => {
        const response = await app.app.request(`/rpc/${procedure}`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie, origin },
          body: JSON.stringify({ json: input }),
        });
        const body = (await response.json()) as { json: T };
        if (!response.ok)
          console.error(
            "Fixture RPC diagnostic",
            JSON.stringify({
              procedure,
              status: response.status,
              errors: sink.events
                .filter((event) => event.level === "error")
                .slice(-2)
                .map((event) => ({ message: event.message, error: event.error })),
            }),
          );
        assert.ok(response.ok, `Fixture RPC failed: ${procedure} (${response.status})`);
        return body.json;
      };
    workerDb = createDb(databaseUrl, { poolMax: 8 });
    host = new GraphileJobWorkerHost(workerDb.pool, {
      concurrency: 4,
      reserveInteractive: arg("interactive", "1") === "1",
      noHandleSignals: true,
      pollInterval: 50,
    });
    let backgroundsStarted = 0;
    const finishedRuns = new Set<string>();
    const measuredHandlers: Pick<
      BackgroundJobHandlers,
      "run.continue" | "history.compact" | "computer.sleep"
    > = {
      "run.continue": async ({ runId }) => {
        try {
          await app.executor.continueRun(runId, "latency-worker");
        } finally {
          finishedRuns.add(runId);
        }
      },
      // Deliberately occupy real worker capacity with deterministic background load.
      "history.compact": async () => {
        backgroundsStarted += 1;
        await delay(500);
      },
      "computer.sleep": async () => {},
    };
    // Graphile supports task-list subsets; this fixture registers only measured jobs.
    await host.start(measuredHandlers as BackgroundJobHandlers);
    const samples: Sample[] = [];
    for (const scenario of selectedCases) {
      for (const temperature of ["cold", "warm"]) {
        const prepareTrial = async (trial: number) => {
          let cookie = fixtureCookie;
          {
            const account = await app.app.request("/api/auth/sign-up/email", {
              method: "POST",
              headers: { "content-type": "application/json", origin },
              body: JSON.stringify({
                email: `latency-${randomUUID()}@example.test`,
                password: "password12",
                name: "Latency fixture",
              }),
            });
            assert.ok(account.ok);
            cookie = sessionCookieHeader(account);
          }
          const rpc = rpcFor(cookie);
          const bot = await rpc<{ id: string }>("bots/create", {
            name: "Latency fixture",
            title: "",
            description: "",
            instructions: "Answer accurately. Use tools for actions.",
            notifyOnFinish: false,
          });
          await discardBotIntroRun(app, cookie, bot.id);
          const owner = await app.prisma.bot.findUniqueOrThrow({
            where: { id: bot.id },
            select: { userId: true, spaceId: true, thread: { select: { id: true } } },
          });
          if (scenario.name === "memory") {
            await app.prisma.memoryDocument.create({
              data: {
                spaceId: owner.spaceId,
                userId: owner.userId,
                botId: bot.id,
                scope: "bot",
                path: "preferences.md",
                content: "Favorite color: teal.",
                revision: 1,
              },
            });
          }
          if (scenario.name === "connected-data") {
            await app.prisma.connection.create({
              data: {
                spaceId: owner.spaceId,
                userId: owner.userId,
                connectorId: "composio",
                provider: "GMAIL",
                displayName: "Fixture Gmail",
                status: "connected",
              },
            });
          }
          if (scenario.name === "follow-up") {
            await app.prisma.$transaction(async (tx) => {
              const thread = await tx.thread.update({
                where: { id: owner.thread!.id },
                data: { nextMessageSeq: { increment: 2 } },
              });
              await tx.message.createMany({
                data: [
                  {
                    threadId: thread.id,
                    seq: thread.nextMessageSeq - 2,
                    role: "user",
                    blocks: [{ kind: "text", text: "Explain REST versus GraphQL briefly." }],
                  },
                  {
                    threadId: thread.id,
                    seq: thread.nextMessageSeq - 1,
                    role: "bot",
                    botId: bot.id,
                    blocks: [
                      {
                        kind: "text",
                        text: "REST uses resource endpoints; GraphQL lets clients request specific fields.",
                      },
                    ],
                  },
                ],
              });
            });
          }
          if (temperature === "warm") await rpc("computer/boot", { botId: bot.id });
          const requests: ModelEmulatorRequest[] = [];
          const steps: ModelEmulatorStep[] = [];
          const expectRequest = (request: ModelEmulatorRequest) => {
            requests.push(request);
          };
          const timing = {
            headersMs: "slow" in scenario ? 50 : 5,
            firstTextMs: "slow" in scenario ? 250 : 25,
            chunkMs,
          };
          if ("tool" in scenario) {
            steps.push({
              expect: expectRequest,
              timing,
              response: {
                type: "tool",
                id: "fixture-tool",
                name: scenario.tool,
                arguments: scenario.args,
              },
            });
            if ("second" in scenario)
              steps.push({
                expect: expectRequest,
                timing,
                response: {
                  type: "tool",
                  id: "fixture-read",
                  name: "read_file",
                  arguments: { path: "notes/result.txt" },
                },
              });
          }
          if ("long" in scenario) {
            for (let step = 1; step < 8; step++) {
              const note = Math.floor(step / 2);
              steps.push({
                expect: expectRequest,
                timing,
                response: {
                  type: "tool",
                  id: `fixture-step-${step}`,
                  name: step % 2 === 0 ? "write_file" : "read_file",
                  arguments:
                    step % 2 === 0
                      ? { path: `notes/step-${note}.txt`, content: `hello ${note}` }
                      : { path: `notes/step-${note}.txt` },
                },
              });
            }
          }
          steps.push({
            expect: (request) => {
              expectRequest(request);
              if (scenario.name === "follow-up")
                assert.ok(
                  JSON.stringify(request.messages).includes("REST uses resource endpoints"),
                );
              if ("image" in scenario) {
                const messages = JSON.stringify(request.messages);
                assert.ok(messages.includes("image_url"));
                assert.ok(
                  messages.includes("attachments/"),
                  "Image must also be available to file-based workflows",
                );
              }
              if ("tool" in scenario) {
                const results = request.messages.filter((message) => message.role === "tool");
                assert.ok(
                  results.length >= ("long" in scenario ? 8 : "second" in scenario ? 2 : 1),
                );
                assert.ok(
                  !results.some((message) =>
                    /"error"|not found|failed/i.test(JSON.stringify(message.content)),
                  ),
                  "Fixture tool must succeed",
                );
              }
              if ("long" in scenario) {
                const results = request.messages.filter((message) => message.role === "tool");
                for (let note = 0; note < 4; note++)
                  assert.ok(
                    results.some((message) =>
                      JSON.stringify(message.content).includes(`hello ${note}`),
                    ),
                    "Long task must verify each file's contents",
                  );
              }
              if (scenario.name === "memory")
                assert.ok(JSON.stringify(request.messages).includes("Favorite color: teal"));
            },
            timing,
            response: { type: "text", text: scenario.answer },
          });
          const model = await startModelEmulator({ steps, apiKey: "latency-fixture-key" });
          activeModels.add(model);
          await rpc("models/connect", {
            provider: model.model.provider,
            modelId: model.model.id,
            baseUrl: model.baseUrl,
            apiKey: "latency-fixture-key",
            contextWindow: 160000,
            maxTokens: 4096,
            supportsImages: true,
          });
          await rpc("bots/update", {
            botId: bot.id,
            modelProvider: model.model.provider,
            modelId: model.model.id,
          });
          const blocks =
            "image" in scenario
              ? [
                  {
                    kind: "image",
                    artifactId: "fixture-image",
                    mimeType: "image/png",
                    name: "fixture.png",
                  },
                ]
              : undefined;
          // No fake attachment metadata: the attachment lane uploads through the API.
          let artifactIds: string[] | undefined;
          if (blocks) {
            const uploaded = await rpc<{ id: string }>("artifacts/create", {
              botId: bot.id,
              name: "fixture.png",
              mimeType: "image/png",
              contentBase64:
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
            });
            artifactIds = [uploaded.id];
          }
          return async () => {
            if ("background" in scenario) {
              const started = backgroundsStarted;
              for (let job = 0; job < 4; job += 1)
                await app.jobs.enqueue({
                  name: "history.compact",
                  payload: { threadId: `fixture-${randomUUID()}` },
                });
              while (backgroundsStarted < started + 3) await delay(5);
            }
            const submitted = performance.now();
            const sent = await rpc<{ runId: string }>("threads/send", {
              botId: bot.id,
              text: scenario.prompt,
              artifactIds,
              clientNonce: randomUUID(),
            });
            const acknowledged = performance.now();
            let firstPublished: number | undefined;
            let firstReceived: number | undefined;
            const streamAbort = new AbortController();
            const openStream = (cursor: number) =>
              app.app.request("/rpc/threads/subscribe", {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  accept: "text/event-stream",
                  cookie,
                  origin,
                },
                body: JSON.stringify({ json: { botId: bot.id, cursor } }),
                signal: streamAbort.signal,
              });
            const streamResponse = await openStream(0);
            assert.ok(streamResponse.ok && streamResponse.body);
            let reader = streamResponse.body.getReader();
            let streamCursor = 0;
            let streamReconnects = 0;
            const consume = (async () => {
              const decoder = new TextDecoder();
              let buffer = "";
              while (!streamAbort.signal.aborted) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const frames = buffer.split("\n\n");
                buffer = frames.pop() ?? "";
                for (const frame of frames) {
                  const data = frame
                    .split("\n")
                    .filter((line) => line.startsWith("data:"))
                    .map((line) => line.slice(5).trim())
                    .join("");
                  if (!data || data === "[DONE]") continue;
                  const event = (
                    JSON.parse(data) as {
                      json?: {
                        type?: string;
                        seq?: number;
                        runId?: string;
                        payload?: { text?: string; delta?: string; streaming?: boolean };
                      };
                    }
                  ).json;
                  if (event?.seq !== undefined) streamCursor = Math.max(streamCursor, event.seq);
                  if (
                    event?.runId === sent.runId &&
                    event.type === "thread.progress" &&
                    event.payload?.streaming === true &&
                    (event.payload.text?.trim() || event.payload.delta?.trim())
                  )
                    firstReceived ??= performance.now();
                }
                if (
                  arg("reconnect", "0") === "1" &&
                  firstReceived !== undefined &&
                  streamReconnects === 0 &&
                  !streamAbort.signal.aborted
                ) {
                  await reader.cancel();
                  await delay(30);
                  const resumed = await openStream(streamCursor);
                  assert.ok(resumed.ok && resumed.body);
                  reader = resumed.body.getReader();
                  buffer = "";
                  streamReconnects++;
                }
              }
            })();

            const deadline = Date.now() + Number(arg("timeout-ms", "120000"));
            for (;;) {
              const progress = await app.prisma.event.findFirst({
                where: {
                  runId: sent.runId,
                  type: "thread.progress",
                  payload: { path: ["streaming"], equals: true },
                },
                orderBy: { seq: "asc" },
                select: { createdAt: true },
              });
              if (progress) firstPublished ??= performance.now();
              const run = await app.prisma.run.findUniqueOrThrow({
                where: { id: sent.runId },
                select: { status: true },
              });
              if (run.status === "completed") break;
              if (run.status === "failed") {
                model.assertComplete();
                throw new Error("Fixture run failed");
              }
              if (model.requests.length > steps.length) model.assertComplete();
              if (Date.now() >= deadline) {
                await rpc("threads/stop", { botId: bot.id });
                console.error("Fixture timeout diagnostics", {
                  scenario: scenario.name,
                  temperature,
                  trial,
                  requests: requests.length,
                  stages: sink.events
                    .filter((event) => event.runId === sent.runId)
                    .map((event) => event.message),
                });
                model.assertComplete();
                throw new Error("Fixture run timed out");
              }
              await delay(5);
            }
            const completed = performance.now();
            const deliveryDeadline = Date.now() + 2000;
            while (firstReceived === undefined && Date.now() < deliveryDeadline) await delay(5);
            streamAbort.abort();
            await reader.cancel().catch(() => undefined);
            await consume;
            assert.ok(firstReceived !== undefined, "Fixture SSE did not deliver safe text");
            assert.ok(
              firstReceived - submitted >= timing.firstTextMs,
              "Useful text cannot precede the emulated provider text delay",
            );
            model.assertComplete();
            const final = await app.prisma.message.findFirstOrThrow({
              where: { runId: sent.runId, role: "bot" },
              orderBy: { seq: "desc" },
              select: { blocks: true },
            });
            assert.ok(
              JSON.stringify(final.blocks).includes(scenario.answer),
              "Authoritative answer must match streamed fixture answer",
            );
            const usage = await app.prisma.usageRecord.findMany({ where: { runId: sent.runId } });
            const tokenTotal = (
              key:
                | "inputTokens"
                | "outputTokens"
                | "reasoningTokens"
                | "cacheReadTokens"
                | "cacheWriteTokens",
            ) =>
              usage.length && usage.every((row) => row[key] !== null)
                ? usage.reduce((total, row) => total + (row[key] ?? 0), 0)
                : null;
            const row = sink.events.find(
              (event) => event.message === "run response timing" && event.runId === sent.runId,
            );
            samples.push({
              scenario: scenario.name,
              temperature,
              acknowledgmentMs: acknowledged - submitted,
              firstPublishedTextMs: (firstPublished ?? completed) - submitted,
              firstTextReceivedMs: firstReceived - submitted,
              completionMs: completed - submitted,
              queueWaitMs: typeof row?.queueWaitMs === "number" ? row.queueWaitMs : null,
              setupMs: typeof row?.setupMs === "number" ? row.setupMs : null,
              modelToFirstTextMs:
                typeof row?.modelToFirstTextMs === "number" ? row.modelToFirstTextMs : null,
              streamDeliveryMs:
                typeof row?.streamDeliveryMs === "number" ? row.streamDeliveryMs : null,
              toolCount: requests[0]?.tools?.length ?? 0,
              toolSchemaBytes: Buffer.byteLength(JSON.stringify(requests[0]?.tools ?? [])),
              promptBytes: Buffer.byteLength(JSON.stringify(requests[0]?.messages ?? [])),
              modelCalls: requests.length,
              streamReconnects,
              inputTokens: tokenTotal("inputTokens"),
              outputTokens: tokenTotal("outputTokens"),
              reasoningTokens: tokenTotal("reasoningTokens"),
              cacheReadTokens: tokenTotal("cacheReadTokens"),
              cacheWriteTokens: tokenTotal("cacheWriteTokens"),
              provisions: sandbox.byRun.get(sent.runId)?.provisions ?? 0,
              preparations: sandbox.byRun.get(sent.runId)?.preparations ?? 0,
              discoveries: connector.byRun.get(sent.runId) ?? 0,
            });
            while (!finishedRuns.has(sent.runId)) await delay(5);
            await model.close();
            activeModels.delete(model);
          };
        };
        for (let batch = 0; batch < trials; batch += parallel) {
          const prepared: Array<() => Promise<void>> = [];
          for (let offset = 0; offset < Math.min(parallel, trials - batch); offset++)
            prepared.push(await prepareTrial(batch + offset));
          const results = await Promise.allSettled(prepared.map((run) => run()));
          const failed = results.find((result) => result.status === "rejected");
          if (failed?.status === "rejected") throw failed.reason;
        }
        await mkdir(path.dirname(output), { recursive: true });
        await writeFile(
          output.replace(/\.json$/, ".partial.json"),
          JSON.stringify({ complete: false, samples }, null, 2),
        );
        console.log(`${scenario.name}/${temperature}: ${trials} completed`);
      }
    }
    const percentile = (values: number[], p: number) =>
      [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)];
    const summary = selectedCases.flatMap(({ name }) =>
      ["cold", "warm"].map((temperature) => {
        const selected = samples.filter(
          (sample) => sample.scenario === name && sample.temperature === temperature,
        );
        return {
          scenario: name,
          temperature,
          trials: selected.length,
          ...Object.fromEntries(
            [
              "acknowledgmentMs",
              "firstPublishedTextMs",
              "firstTextReceivedMs",
              "completionMs",
              "queueWaitMs",
              "setupMs",
              "modelToFirstTextMs",
              "streamDeliveryMs",
              "toolCount",
              "toolSchemaBytes",
              "promptBytes",
              "modelCalls",
              "streamReconnects",
              "inputTokens",
              "outputTokens",
              "reasoningTokens",
              "cacheReadTokens",
              "cacheWriteTokens",
              "provisions",
              "preparations",
              "discoveries",
            ].map((key) => {
              const values = selected
                .map((sample) => sample[key as keyof Sample])
                .filter((value): value is number => typeof value === "number");
              return [
                key,
                values.length
                  ? { p50: percentile(values, 0.5), p95: percentile(values, 0.95) }
                  : null,
              ];
            }),
          ),
        };
      }),
    );
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(
      output,
      JSON.stringify(
        {
          version: 1,
          transport: "API/Postgres/Graphile/Pi/loopback SSE",
          provider: "emulated",
          firstTextEvent: "thread.progress with nonempty assistant text/delta and streaming=true",
          postgres: arg("postgres", "docker"),
          injected: {
            computerColdMs: 120,
            computerPrepareMs: 60,
            connectorDiscoveryMs: 40,
            providerHeadersMs: 5,
            providerFirstTextMs: 25,
            providerChunkMs: chunkMs,
            backgroundJobMs: 500,
            slowProviderHeadersMs: 50,
            slowProviderFirstTextMs: 250,
          },
          backgroundsStarted,
          parallel,
          interactiveReservation: arg("interactive", "1") === "1",
          summary,
          samples,
        },
        null,
        2,
      ),
    );
    console.log(`Report: ${output}`);
  } finally {
    const active = await handles?.prisma.run
      .findMany({
        where: { status: { in: ["queued", "leased", "running"] } },
        select: { id: true },
      })
      .catch(() => []);
    await Promise.allSettled((active ?? []).map((run) => handles!.runtime.abort(run.id)));
    await host?.stop();
    await handles?.stop();
    await workerDb?.prisma.$disconnect();
    await workerDb?.pool.end();
    await Promise.allSettled([...activeModels].map((model) => model.close()));
    await container.stop();
    await rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
