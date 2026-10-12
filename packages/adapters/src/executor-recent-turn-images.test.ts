import type { AgentRunRequest } from "@rakazo/adapter-kit";
import type { MessageBlock } from "@rakazo/contracts";
import { getLogger } from "@rakazo/logging";
import { describe, expect, it, vi } from "vitest";
import type * as ComputerLifecycleModule from "./computer-lifecycle.js";
import {
  acquireComputerExecutionLease,
  ComputerBusyError,
  provisionComputer,
} from "./computer-lifecycle.js";
import { COMPUTER_TOOL_NAMES, createRunExecutor } from "./executor.js";
import { NoneSandboxProvider } from "./none-sandbox.js";

vi.mock("./computer-lifecycle.js", async (importOriginal) => ({
  ...(await importOriginal<typeof ComputerLifecycleModule>()),
  acquireComputerExecutionLease: vi.fn(async () => null),
  provisionComputer: vi.fn(async (deps: { sandbox: { describe: () => { id?: string } } }) => {
    if (deps.sandbox.describe().id === "none") throw new Error("Computers unavailable");
    return { id: "computer-1", kind: "desktop" };
  }),
}));

const TEXT_ONLY_MODEL = "deepseek/deepseek-v4-flash-0731";
const VISION_MODEL = "openai/gpt-4o";

function historyMessages(): Array<{
  id: string;
  threadId: string;
  seq: number;
  role: string;
  runId: string;
  blocks: MessageBlock[];
  replyToMessageId: null;
  replyQuote: null;
  replyTo: null;
}> {
  return [
    {
      id: "current",
      threadId: "thread-1",
      seq: 2,
      role: "user",
      runId: "run-1",
      blocks: [{ kind: "text", text: "what was in the screenshot?" }],
      replyToMessageId: null,
      replyQuote: null,
      replyTo: null,
    },
    {
      id: "earlier",
      threadId: "thread-1",
      seq: 1,
      role: "user",
      runId: "run-0",
      blocks: [{ kind: "image", artifactId: "art-1", mimeType: "image/png", name: "shot.png" }],
      replyToMessageId: null,
      replyQuote: null,
      replyTo: null,
    },
  ];
}

async function runWithModel(
  modelId: string,
  switchModel?: { provider: string; modelId: string },
  backupReadFails = false,
  scripted = false,
  computerAvailable = true,
  latencyCheck?: "stream" | "setup",
  scenario?: {
    prompt: string;
    useCatalog?: boolean;
    collision?: boolean;
    pendingConnection?: boolean;
    revokedDuringSync?: boolean;
    peerDirectory?: boolean;
    imageCurrent?: boolean;
    fileCurrent?: boolean;
    processSteering?: boolean;
    steeringAttachment?: "file" | "image";
    steeringBusy?: boolean;
    computerWaitRetries?: number;
    preparationFailure?: string;
    swallowPreparationFailure?: boolean;
    inspectRuntimeControls?: boolean;
    inspectHelperDelegation?: boolean;
  },
) {
  const run = {
    id: "run-1",
    botId: "bot-1",
    threadId: "thread-1",
    taskId: "task-1",
    spaceId: "space-1",
    userId: "user-1",
    status: "queued",
    trigger: "user",
    leaseFence: 0,
    checkpoint: null as string | null,
    sourceMessageId: scenario?.imageCurrent || scenario?.fileCurrent ? "current" : undefined,
  };
  const get = vi.fn(async () => new Uint8Array([1, 2, 3, 4]));
  const append = vi.fn(async () => undefined);
  const writeFile = vi.fn(async () => undefined);
  let releaseSetup!: () => void;
  const setupGate = new Promise<void>((resolve) => {
    releaseSetup = resolve;
  });
  let markSetupStarted!: () => void;
  const setupStarted = new Promise<void>((resolve) => {
    markSetupStarted = resolve;
  });
  let request: AgentRunRequest | undefined;
  const runtimeRun = vi.fn(async function* (next: AgentRunRequest) {
    request = next;
    if (scenario?.inspectRuntimeControls) {
      for (const name of ["ask_user", "request_takeover", "run_subagent"]) {
        expect(next.tools.some((tool) => tool.name === name)).toBe(true);
        const result = (await next.executeTool?.(
          "kith_search_tools",
          { query: name },
          `search-${name}`,
        )) as { tools: Array<{ name: string }> };
        expect(result.tools.some((tool) => tool.name === name)).toBe(false);
      }
    }
    if (scenario?.inspectHelperDelegation) {
      const observer = { allowDelegation: false };
      const result = (await next.executeTool?.(
        "kith_search_tools",
        { query: "spawn_bot" },
        "helper-search",
        undefined,
        observer,
      )) as { tools: Array<{ name: string }> };
      expect(result.tools.some((tool) => tool.name === "spawn_bot")).toBe(false);
      expect(
        await next.executeTool?.(
          "spawn_bot",
          { name: "Forbidden helper bot" },
          "helper-spawn",
          undefined,
          observer,
        ),
      ).toEqual({ error: "Short helpers cannot manage or delegate to other bots." });
    }
    if (scenario?.steeringAttachment) {
      const prior = vi.mocked(provisionComputer).mock.calls.length;
      const steering = await next.claimSteering?.([]);
      expect(vi.mocked(provisionComputer).mock.calls.length).toBe(prior);
      expect(steering?.[0]?.text).toContain("attachments/art-1.png");
      if (!scenario.computerWaitRetries) expect(writeFile).not.toHaveBeenCalled();
      if (scenario.processSteering || scenario.steeringBusy) {
        if (scenario.steeringBusy)
          vi.mocked(acquireComputerExecutionLease).mockRejectedValueOnce(new ComputerBusyError());
        await next.executeTool?.("read_file", { path: "attachments/art-1.png" }, "steering-read");
        if (!scenario.steeringBusy) expect(writeFile).toHaveBeenCalled();
      }
    }
    if (scenario?.useCatalog) {
      try {
        const toolName = scenario.collision ? "kith_search_tools" : "list_files";
        if (next.executionProfile === "agent") {
          expect(await next.executeTool?.(toolName, { path: "" }, "execute")).toEqual({
            path: "",
            entries: [],
          });
        } else {
          const result = (await next.executeTool?.(
            "kith_search_tools",
            { query: toolName },
            "search",
          )) as { tools: Array<{ id: string; name: string }> };
          const hit = result.tools.find((tool) => tool.name === toolName);
          expect(hit).toBeDefined();
          expect(
            await next.executeTool?.(
              "kith_execute_tool",
              { id: hit!.id, arguments: scenario.collision ? {} : { path: "" } },
              "execute",
            ),
          ).toEqual(scenario.collision ? { ok: true } : { path: "", entries: [] });
        }
      } catch (error) {
        if (!scenario.swallowPreparationFailure) throw error;
        expect(error).toMatchObject({ message: "Computer setup failed" });
      }
    }
    if (latencyCheck === "stream") {
      yield { type: "text" as const, text: "Done" };
      // The executor must publish the first safe chunk before requesting more
      // output, even when a credential is much longer than the entire reply.
      expect(append).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "thread.progress",
          payload: { text: "Done", streaming: true },
        }),
      );
    }
    if (switchModel) {
      const onModelChange = (
        next as AgentRunRequest & {
          onModelChange?: (provider: string, modelId: string) => Promise<void>;
        }
      ).onModelChange;
      await onModelChange?.(switchModel.provider, switchModel.modelId);
    }
    yield { type: "done" as const, text: "Done" };
  });
  let connectionStatus = "pending";
  const prisma = {
    run: {
      findUnique: vi.fn(async () => run),
      findUniqueOrThrow: vi.fn(async () => run),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { checkpoint?: string | null | { in: string[] } };
          data: Record<string, unknown>;
        }) => {
          if (
            where.checkpoint &&
            typeof where.checkpoint === "object" &&
            !where.checkpoint.in.includes(run.checkpoint ?? "")
          )
            return { count: 0 };
          if (where.checkpoint === null && run.checkpoint !== null) return { count: 0 };
          Object.assign(run, data);
          return { count: 1 };
        },
      ),
    },
    bot: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: run.botId,
        name: "Assistant",
        title: "Assistant",
        description: "Test assistant",
        modelProvider: null,
        modelId: null,
        thinkingLevel: null,
        computerId: "computer-1",
        computerSwitching: false,
        memoryScope: null,
        computer: { id: "computer-1", scope: "dedicated" },
      })),
      findMany: vi.fn(async () =>
        scenario?.peerDirectory
          ? [
              {
                id: "support",
                name: "Support",
                title: "Support bot",
                description: "Resolves customer support tickets",
              },
            ]
          : [],
      ),
    },
    attempt: {
      create: vi.fn(async () => ({ id: "attempt-1" })),
      update: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    thread: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: run.threadId,
        groupId: null,
        historyCompactionSummary: null,
        historyCompactedUpToSeq: null,
        nextMessageSeq: 3,
      })),
    },
    message: {
      findMany: vi.fn(async (args: { where?: { threadId?: string } }) =>
        args.where?.threadId
          ? historyMessages().map((message) =>
              (scenario?.imageCurrent || scenario?.fileCurrent) && message.id === "current"
                ? {
                    ...message,
                    blocks: [
                      {
                        kind: scenario.fileCurrent ? ("file" as const) : ("image" as const),
                        artifactId: "art-1",
                        mimeType: "image/png",
                        name: "shot.png",
                      },
                    ],
                  }
                : message,
            )
          : [],
      ),
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
    },
    task: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: run.taskId,
        prompt: scenario?.prompt ?? "Look again",
      })),
    },
    computer: { updateMany: vi.fn(async () => ({ count: 1 })) },
    connection: {
      findMany: vi.fn(async () =>
        scenario?.pendingConnection
          ? [
              {
                id: "gmail",
                connectorId: "composio",
                provider: "gmail",
                providerRef: "account-fixture",
                displayName: "Gmail",
                status: connectionStatus,
              },
            ]
          : [],
      ),
      updateMany: vi.fn(async () => {
        connectionStatus = scenario?.revokedDuringSync ? "revoked" : "connected";
        return { count: scenario?.revokedDuringSync ? 0 : 1 };
      }),
    },
    spaceModelPreference: {
      findFirst: vi.fn<(...args: unknown[]) => Promise<Record<string, unknown> | null>>(
        async () => null,
      ),
    },
    secret: { findFirst: vi.fn(async () => null) },
    userModelCredential: { findFirst: vi.fn(async () => null) },
    spaceBackupModel: {
      findMany: vi.fn(async () => {
        if (backupReadFails) throw new Error("Backup list unavailable");
        return switchModel
          ? [{ provider: switchModel.provider, modelId: switchModel.modelId }]
          : [];
      }),
    },

    deploymentSettings: {
      findUnique: vi.fn(async () => ({
        defaultModelProvider: "openrouter",
        defaultModelId: modelId,
      })),
    },
    taughtSkill: { findMany: vi.fn(async () => []) },
    agentSecret: { findMany: vi.fn(async () => []) },
    botSecret: { findMany: vi.fn(async () => []) },
    agentSkill: { findMany: vi.fn(async () => []) },
    scratchpadItem: { findMany: vi.fn(async () => []) },
    actionApprovalRule: { findMany: vi.fn(async () => []) },
    actionAutoReviewPreference: { findUnique: vi.fn(async () => ({ enabled: false })) },
    externalEffect: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "effect-1",
        ...data,
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findMany: vi.fn(async () => {
        if (latencyCheck === "setup") {
          markSetupStarted();
          await setupGate;
        }
        return [];
      }),
    },
    artifact: {
      findMany: vi.fn(async () => [
        {
          id: "art-1",
          storageKey: "shot.png",
          size: 4,
          mimeType: "image/png",
          name: "shot.png",
        },
      ]),
    },
  };
  const finalizeRun = vi.fn(async () => ({ continuationRunId: null }));
  const listConnectedPluginSlugs = vi.fn(async () => ["gmail"]);
  const discoveryContexts: Array<{
    connectedConnections?: Array<{ id: string }>;
  }> = [];
  const executor = createRunExecutor({
    listConnectedPluginSlugs,
    prisma,
    deploymentModelKey:
      latencyCheck === "stream" ? `fake-deployment-key-${"x".repeat(2048)}` : "fake-deployment-key",
    runtime: {
      describe: () => ({ capabilities: { scripted } }),
      run: runtimeRun,
    },
    sandbox: computerAvailable
      ? {
          describe: () => ({ capabilities: { graphical: false } }),
          writeFile,
          readFile: vi.fn(async () => new TextEncoder().encode("fixture content")),
          listFiles: vi.fn(async () => []),
          async *exportWorkspace() {
            yield* [];
          },
        }
      : new NoneSandboxProvider(),
    home: { commit: vi.fn(async () => "fixture-revision") },
    memory: { read: async () => ({ documents: [] }) },
    memoryProviders: { resolve: async () => null },
    artifacts: { get },
    events: {
      append,
      finalizeRun,
      claimSteering: vi.fn(async () =>
        scenario?.steeringAttachment
          ? [
              {
                id: "steering-1",
                messageId: "steering-message",
                text: "Inspect this attachment",
                blocks: [
                  {
                    kind: scenario.steeringAttachment,
                    artifactId: "art-1",
                    mimeType: "image/png",
                    name: "shot.png",
                  },
                ],
              },
            ]
          : [],
      ),
    },
    jobs: { enqueue: vi.fn(async () => undefined) },
    connector: {
      discoverTools: vi.fn(async (context: { connectedConnections?: Array<{ id: string }> }) => {
        discoveryContexts.push({
          connectedConnections: [...(context.connectedConnections ?? [])],
        });
        return scenario?.collision
          ? [
              {
                name: "kith_search_tools",
                description: "Fixture connector tool",
                readOnly: true,
                inputSchema: { type: "object", properties: {} },
                route: {
                  connectorId: "fixture",
                  toolName: "kith_search_tools",
                },
              },
            ]
          : [];
      }),
      async *execute() {
        yield { type: "result", data: { ok: true } };
      },
    },
    secrets: [],
  } as unknown as Parameters<typeof createRunExecutor>[0]);

  if (scenario?.preparationFailure)
    vi.mocked(provisionComputer).mockRejectedValueOnce(new Error(scenario.preparationFailure));
  const continuing = executor.continueRun(run.id, "worker-1");
  if (latencyCheck === "setup") {
    try {
      await setupStarted;
      expect(prisma.spaceBackupModel.findMany).toHaveBeenCalled();
    } finally {
      releaseSetup();
      await continuing;
    }
  }
  if (scenario?.preparationFailure) {
    await expect(continuing).rejects.toThrow("Run setup failed; retrying");
    expect(finalizeRun).not.toHaveBeenCalled();
    expect(run.status).toBe("queued");
    expect(run.checkpoint).toBe("computer-required");
    expect(prisma.attempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "setup_failed" }) }),
    );
    await executor.continueRun(run.id, "worker-1");
    expect(runtimeRun).toHaveBeenCalledTimes(2);
  } else await continuing;
  if (scenario?.computerWaitRetries) {
    expect(run.checkpoint).toBe("computer-required");
    for (let retry = 0; retry < scenario.computerWaitRetries; retry++) {
      vi.mocked(acquireComputerExecutionLease).mockRejectedValueOnce(new ComputerBusyError());
      await executor.continueRun(run.id, "worker-1");
      expect(runtimeRun).toHaveBeenCalledOnce();
      expect(run.checkpoint).toBe("computer-required");
      expect(run.status).toBe("queued");
    }
    scenario.steeringBusy = false;
    await executor.continueRun(run.id, "worker-1");
    expect(runtimeRun).toHaveBeenCalledTimes(2);
  }
  expect(runtimeRun).toHaveBeenCalled();
  if (scenario?.steeringBusy) {
    expect(finalizeRun).not.toHaveBeenCalled();
    expect(run.status).toBe("queued");
  } else
    expect(finalizeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "completed",
        blocks: expect.arrayContaining([{ kind: "text", text: "Done" }]),
      }),
    );
  if (!request) throw new Error("runtime was not called");
  return {
    request,
    get,
    prisma,
    run,
    listConnectedPluginSlugs,
    discoveryContexts,
    writeFile,
  };
}

describe("response latency", () => {
  it("never provisions or leases a computer for a greeting", async () => {
    const provisionCount = vi.mocked(provisionComputer).mock.calls.length;
    const leaseCount = vi.mocked(acquireComputerExecutionLease).mock.calls.length;
    const { request } = await runWithModel(
      TEXT_ONLY_MODEL,
      undefined,
      false,
      false,
      true,
      undefined,
      { prompt: "Hi" },
    );
    expect(request.executionProfile).toBe("conversation");
    expect(request.tools.map((tool) => tool.name)).toEqual([
      "kith_search_tools",
      "kith_load_tool",
      "kith_execute_tool",
      "request_takeover",
      "ask_user",
      "run_subagent",
    ]);
    expect(vi.mocked(provisionComputer).mock.calls.length).toBe(provisionCount);
    expect(vi.mocked(acquireComputerExecutionLease).mock.calls.length).toBe(leaseCount);
  });

  it("keeps runtime controls directly available without routing them through catalog effects", async () => {
    await runWithModel(VISION_MODEL, undefined, false, false, true, undefined, {
      prompt: "Hi",
      inspectRuntimeControls: true,
    });
  });

  it("retains helper delegation restrictions through lazy catalog search and execution", async () => {
    const { prisma } = await runWithModel(VISION_MODEL, undefined, false, false, true, undefined, {
      prompt: "Hi",
      inspectHelperDelegation: true,
    });
    expect(prisma.externalEffect.create).not.toHaveBeenCalled();
  });

  it("inspects an image-only current turn without activating a computer", async () => {
    const prior = vi.mocked(provisionComputer).mock.calls.length;
    const { request, writeFile } = await runWithModel(
      VISION_MODEL,
      undefined,
      false,
      false,
      true,
      undefined,
      { prompt: "Inspect this image", imageCurrent: true },
    );
    expect(vi.mocked(provisionComputer).mock.calls.length).toBe(prior);
    expect(request.currentTurnImages).toHaveLength(1);
    expect(request.prompt).toContain("attachments/art-1.png");
    expect(writeFile).not.toHaveBeenCalled();
  });

  it.each(["file", "image"] as const)(
    "does not provision for steering %s before tool demand",
    async (steeringAttachment) => {
      await runWithModel(VISION_MODEL, undefined, false, false, true, undefined, {
        prompt: "Hi",
        steeringAttachment,
      });
    },
  );

  it("keeps file attachment metadata without provisioning before tool demand", async () => {
    const prior = vi.mocked(provisionComputer).mock.calls.length;
    const { request, writeFile } = await runWithModel(
      VISION_MODEL,
      undefined,
      false,
      false,
      true,
      undefined,
      { prompt: "Keep this file for later", fileCurrent: true },
    );
    expect(vi.mocked(provisionComputer).mock.calls.length).toBe(prior);
    expect(request.prompt).toContain("attachments/art-1.png");
    expect(writeFile).not.toHaveBeenCalled();
  });

  it.each(["file", "image"] as const)(
    "materializes steering %s for an authorized file tool",
    async (steeringAttachment) => {
      await runWithModel(VISION_MODEL, undefined, false, false, true, undefined, {
        prompt: "Inspect attachment",
        steeringAttachment,
        processSteering: true,
      });
    },
  );

  it("requeues the same run when steering attachments race a busy computer", async () => {
    const { run } = await runWithModel(VISION_MODEL, undefined, false, false, true, undefined, {
      prompt: "Hi",
      steeringAttachment: "file",
      steeringBusy: true,
    });
    expect(run.id).toBe("run-1");
  });

  it("does not repeat inference while a demanded computer remains leased elsewhere", async () => {
    await runWithModel(VISION_MODEL, undefined, false, false, true, undefined, {
      prompt: "Hi",
      steeringAttachment: "file",
      steeringBusy: true,
      computerWaitRetries: 3,
    });
  });

  it.each([false, true])(
    "recovers computer preparation failures when the runtime consumes tool errors=%s",
    async (swallowPreparationFailure) => {
      for (const preparationFailure of [
        "Temporary sandbox prepare failure",
        "computer control revocation is still in progress",
      ])
        await runWithModel(VISION_MODEL, undefined, false, false, true, undefined, {
          prompt: "Hi",
          useCatalog: true,
          preparationFailure,
          swallowPreparationFailure,
        });
    },
  );

  it("preserves the peer bot directory for conversational bot questions", async () => {
    const { request } = await runWithModel(
      TEXT_ONLY_MODEL,
      undefined,
      false,
      false,
      true,
      undefined,
      {
        prompt: "What is the support bot responsible for?",
        peerDirectory: true,
      },
    );
    expect(request.executionProfile).toBe("conversation");
    expect(request.instructions).toContain("Support");
    expect(request.instructions).toContain("Resolves customer support tickets");
  });

  it.each([false, true])(
    "reconciles pending accounts on lazy escalation and preserves revocation=%s",
    async (revokedDuringSync) => {
      const { request, listConnectedPluginSlugs, discoveryContexts } = await runWithModel(
        TEXT_ONLY_MODEL,
        undefined,
        false,
        false,
        true,
        undefined,
        {
          prompt: "Hi",
          useCatalog: true,
          pendingConnection: true,
          revokedDuringSync,
        },
      );
      expect(request.executionProfile).toBe("conversation");
      expect(listConnectedPluginSlugs).toHaveBeenCalledOnce();
      expect(discoveryContexts[0]?.connectedConnections?.map((row) => row.id)).toEqual(
        revokedDuringSync ? [] : ["gmail"],
      );
    },
  );

  it.each([false, true])(
    "refreshes full-agent connection state after reconciliation and preserves revocation=%s",
    async (revokedDuringSync) => {
      const { request, listConnectedPluginSlugs, discoveryContexts, prisma } = await runWithModel(
        TEXT_ONLY_MODEL,
        undefined,
        false,
        false,
        true,
        undefined,
        { prompt: "Read my email", pendingConnection: true, revokedDuringSync },
      );
      expect(request.executionProfile).toBe("agent");
      expect(listConnectedPluginSlugs).toHaveBeenCalledOnce();
      expect(prisma.connection.findMany).toHaveBeenCalledTimes(2);
      expect(discoveryContexts[0]?.connectedConnections?.map((row) => row.id)).toEqual(
        revokedDuringSync ? [] : ["gmail"],
      );
    },
  );

  it("can dispatch a connector whose name matches a catalog wrapper without recursion", async () => {
    await runWithModel(TEXT_ONLY_MODEL, undefined, false, false, true, undefined, {
      prompt: "Hi",
      useCatalog: true,
      collision: true,
    });
  });

  it("discovers a computer tool on demand in the same durable run", async () => {
    const provisionCount = vi.mocked(provisionComputer).mock.calls.length;
    const leaseCount = vi.mocked(acquireComputerExecutionLease).mock.calls.length;
    const { request } = await runWithModel(
      TEXT_ONLY_MODEL,
      undefined,
      false,
      false,
      true,
      undefined,
      { prompt: "Hi", useCatalog: true },
    );
    expect(request.runId).toBe("run-1");
    expect(vi.mocked(provisionComputer).mock.calls.length).toBe(provisionCount + 1);
    expect(vi.mocked(acquireComputerExecutionLease).mock.calls.length).toBe(leaseCount + 1);
  });

  it.each([false, true])(
    "streams a short reply before completion with computer=%s",
    async (computer) => {
      await runWithModel(TEXT_ONLY_MODEL, undefined, false, false, computer, "stream");
    },
  );

  it("loads independent setup reads without waiting for approved-effect retrieval", async () => {
    await runWithModel(TEXT_ONLY_MODEL, undefined, false, false, false, "setup");
  });

  it("reports setup, model and delivery timing without response text or credentials", async () => {
    const info = vi.spyOn(getLogger(), "info");
    try {
      await runWithModel(TEXT_ONLY_MODEL, undefined, false, false, false, "stream");
      const timings = info.mock.calls.filter(([message]) => message === "run response timing");
      expect(timings).toHaveLength(1);
      expect(timings[0]?.[1]).toEqual({
        runId: "run-1",
        queueWaitMs: null,
        setupMs: expect.any(Number),
        modelToFirstTextMs: expect.any(Number),
        streamDeliveryMs: expect.any(Number),
        executionProfile: "agent",
        leaseMs: expect.any(Number),
        initialReadsMs: expect.any(Number),
        connectorMs: expect.any(Number),
        contextMs: expect.any(Number),
        computerMs: expect.any(Number),
      });
      for (const key of ["setupMs", "modelToFirstTextMs", "streamDeliveryMs"]) {
        expect(timings[0]?.[1]?.[key]).toBeGreaterThanOrEqual(0);
      }
    } finally {
      info.mockRestore();
    }
  });
});

describe("recent turn images follow model vision", () => {
  it("responds with a connected model without provisioning a computer", async () => {
    const { request } = await runWithModel(VISION_MODEL, undefined, false, false, false);
    const tools = request.tools.map((tool) => tool.name);
    expect(tools.filter((name) => COMPUTER_TOOL_NAMES.has(name))).toEqual([]);
    expect(tools).toEqual(
      expect.arrayContaining(["ask_user", "message_user", "remember", "web_search"]),
    );
    expect(request.instructions).toContain("No computer is connected");
    expect(request.instructions).not.toContain("Relative file paths and shell working directories");
    await expect(
      request.executeTool?.("shell", { command: "echo unsafe" }, "tool-1"),
    ).resolves.toEqual({ error: "This tool is disabled for this bot." });
    expect(request.history.find((entry) => entry.id === "earlier")?.images?.[0]).toMatchObject({
      name: "shot.png",
    });
  });

  it("does not send history images to a text-only model", async () => {
    const { request, get } = await runWithModel(TEXT_ONLY_MODEL);

    expect(request.model.id).toBe(TEXT_ONLY_MODEL);
    expect(request.history.find((entry) => entry.id === "earlier")?.images).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it("attaches an earlier turn's image for a model that can see it", async () => {
    const { request, get } = await runWithModel(VISION_MODEL);

    expect(request.model.id).toBe(VISION_MODEL);
    expect(request.history.find((entry) => entry.id === "earlier")?.images?.[0]).toMatchObject({
      name: "shot.png",
      mimeType: "image/png",
    });
    expect(request.history.find((entry) => entry.id === "current")?.images).toBeUndefined();
    expect(get).toHaveBeenCalledWith("shot.png", expect.anything());
  });

  it("continues with no backups when the indexed lookup fails", async () => {
    const { prisma, request } = await runWithModel(TEXT_ONLY_MODEL, undefined, true);
    expect(request.fallbackModels).toEqual([]);
    expect(request.resolveFallbackModel).toBeUndefined();
    expect(prisma.spaceBackupModel.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { userId: "user-1", spaceId: "space-1" },
      orderBy: { position: "asc" },
      select: { provider: true, modelId: true },
    });
  });

  it("does not read or configure backups for scripted runs", async () => {
    const { prisma, request } = await runWithModel(TEXT_ONLY_MODEL, undefined, false, true);
    expect(prisma.spaceBackupModel.findMany).not.toHaveBeenCalled();
    expect(request.fallbackModels).toEqual([]);
    expect(request.resolveFallbackModel).toBeUndefined();
  });

  it("does not recover a backup's missing secret with a deployment key", async () => {
    const backup = { provider: "openrouter", modelId: "openai/gpt-4o" };
    const { prisma, request } = await runWithModel(TEXT_ONLY_MODEL, backup);
    expect(request.model.apiKey).toBe("fake-deployment-key");
    const resolve = request.resolveFallbackModel;
    if (!resolve) throw new Error("Backup resolver is missing");
    prisma.spaceModelPreference.findFirst.mockResolvedValue({
      modelId: backup.modelId,
      isDefault: false,
      thinkingLevel: null,
      credential: {
        id: "backup-credential",
        userId: "user-1",
        provider: backup.provider,
        label: "Backup",
        secretId: "missing-secret",
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    });
    vi.stubEnv("OPENROUTER_API_KEY", "fake-deployment-key");
    try {
      await expect(resolve(backup.provider, backup.modelId)).rejects.toThrow(
        "Backup model credential is no longer available",
      );
      expect(prisma.spaceModelPreference.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            spaceId: "space-1",
            userId: "user-1",
            modelId: backup.modelId,
            credential: { provider: backup.provider },
          },
        }),
      );
      expect(prisma.secret.findFirst).toHaveBeenCalledExactlyOnceWith({
        where: { id: "missing-secret", userId: "user-1", spaceId: null },
      });
      await expect(resolve("openai", "gpt-4o")).rejects.toThrow("Backup model is not selected");
      expect(prisma.secret.findFirst).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("persists the switched model against the current run lease", async () => {
    const backup = { provider: "openrouter", modelId: "openai/gpt-4o" };
    const { prisma, request, run } = await runWithModel(TEXT_ONLY_MODEL, backup);

    expect(request?.model.id).toBe(TEXT_ONLY_MODEL);
    expect(run).toMatchObject({ modelProvider: backup.provider, modelId: backup.modelId });
    expect(prisma.run.updateMany).toHaveBeenCalledWith({
      where: {
        id: "run-1",
        status: "running",
        leaseOwner: "worker-1",
        leaseFence: expect.any(Number),
      },
      data: { modelProvider: backup.provider, modelId: backup.modelId },
    });
  });
});
