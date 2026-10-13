import type { Api, Model } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type { AdapterContext, AgentRunRequest } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { resolveMaxComputersPerUser } from "@rakazo/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { claimComputerActivation } from "./computer-demand.js";
import { createModelCallQuotaObserver, managedCompletionTokens } from "./model-call-quota.js";
import { maxToolCallsPerTurn, PiAgentRuntime } from "./pi-runtime.js";
import { observedPiStream } from "./pi-usage.js";

const request = { runId: "fixture-child", rootRunId: "fixture-root" } as AgentRunRequest;
const context = { userId: "fixture-user", spaceId: "fixture-space" } as AdapterContext;
const call = {
  provider: "openrouter",
  modelId: "openai/gpt-6-luna",
  fundingSource: "deployment" as const,
  inputTokensEstimate: 100,
  requestBytes: 512,
  textRequestBytes: 512,
  maxOutputTokens: 4096,
};

function fixture(counts = { daily: 0n, run: 0n, active: 0n }) {
  const query = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([counts]);
  const execute = vi.fn().mockResolvedValue(1);
  const member = vi.fn().mockResolvedValue({ space: { organizationId: "fixture-org" } });
  const tx = {
    $queryRaw: query,
    $executeRaw: execute,
    spaceMember: { findFirst: member },
    billingAccount: { findUnique: vi.fn().mockResolvedValue(null) },
    deploymentSettings: { findUnique: vi.fn().mockResolvedValue(null) },
  };
  const prisma = {
    $transaction: vi.fn(async (run: (tx: unknown) => unknown) => run(tx)),
    $executeRaw: execute,
  } as unknown as PrismaClient;
  return { prisma, query, execute, member, tx };
}

afterEach(() => vi.unstubAllEnvs());

describe("managed model-call admission", () => {
  it("keeps whitespace-managed computer and tool quotas enabled", async () => {
    vi.stubEnv("MODEL_EXECUTION_MODE", " managed ");
    vi.stubEnv("SANDBOX_MAX_COMPUTERS_PER_USER", undefined);
    vi.stubEnv("SANDBOX_MAX_ACTIVE_COMPUTERS_PER_USER", undefined);
    expect(resolveMaxComputersPerUser()).toBe(3);
    expect(() => resolveMaxComputersPerUser("0")).toThrow("positive integer");
    expect(maxToolCallsPerTurn({ MODEL_EXECUTION_MODE: " managed " })).toBe(40);
    expect(() =>
      maxToolCallsPerTurn({ MODEL_EXECUTION_MODE: " managed ", MAX_TOOL_CALLS_PER_TURN: "0" }),
    ).toThrow("positive integer");
    const updateMany = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      computer: { count: vi.fn().mockResolvedValue(1), updateMany },
    };
    const prisma = {
      $transaction: vi.fn(async (run: (tx: unknown) => unknown) => run(tx)),
      computer: { updateMany },
    } as unknown as PrismaClient;
    await expect(
      claimComputerActivation(prisma, {
        userId: "fixture-user",
        computerId: "fixture-computer",
        kind: "e2b",
        where: { id: "fixture-computer" },
        data: { state: "booting" },
      }),
    ).rejects.toThrow("Computer limit reached");
    expect(updateMany).not.toHaveBeenCalled();
  });
  it("fails closed when a managed runtime was composed without durable admission", async () => {
    const runtime = new PiAgentRuntime({ modelExecutionMode: "managed" });
    const input = {
      botId: "fixture-bot",
      threadId: "fixture-thread",
      runId: "fixture-run",
      prompt: "Hello",
      instructions: "",
      history: [],
      tools: [],
      model: {
        provider: call.provider,
        id: call.modelId,
        fundingSource: "deployment",
        apiKey: "fixture-key",
      },
    } as AgentRunRequest;
    await expect(
      (async () => {
        for await (const _event of runtime.run(input, context)) {
          /* Composition must fail before opening a stream. */
        }
      })(),
    ).rejects.toThrow("requires a quota observer");
  });
  it("accepts a screenshot through the real Pi protocol and rejects oversized text before HTTP", async () => {
    const model: Model<Api> = {
      provider: call.provider,
      id: call.modelId,
      api: "openai-completions",
      name: "Fixture Luna",
      baseUrl: "https://model.example.test/v1",
      reasoning: false,
      input: ["text", "image"],
      contextWindow: 262144,
      maxTokens: 4096,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
    const data = "A".repeat(300000);
    const fetcher = vi.fn(
      async () =>
        new Response(
          'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":"Done"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    const f = fixture();
    const observer = createModelCallQuotaObserver(f.prisma, request, context, {
      mode: "managed",
      billingRequired: false,
    })!;
    const stream = observedPiStream(
      builtinModels(),
      model,
      {
        messages: [
          {
            role: "user",
            timestamp: 1,
            content: [
              { type: "text", text: "Look at this" },
              { type: "image", data, mimeType: "image/png" },
            ],
          },
        ],
      },
      { apiKey: "fixture-key", fetch: fetcher },
      vi.fn(),
      observer,
      { operationKind: "answer", fundingSource: "deployment" },
    );
    for await (const _event of stream) {
      /* Real protocol generates and validates the HTTP payload. */
    }
    expect((await stream.result()).stopReason).toBe("stop");
    expect(fetcher).toHaveBeenCalledOnce();
    const rejected = observedPiStream(
      builtinModels(),
      model,
      { messages: [{ role: "user", timestamp: 1, content: "T".repeat(131073) }] },
      { apiKey: "fixture-key", fetch: fetcher },
      vi.fn(),
      observer,
      { operationKind: "answer", fundingSource: "deployment" },
    );
    for await (const _event of rejected) {
      /* Oversized text never opens another HTTP request. */
    }
    expect((await rejected.result()).errorMessage).toContain("smaller message");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("preserves BYOK and self-hosted behavior and caps funded completions", async () => {
    const f = fixture();
    expect(
      createModelCallQuotaObserver(f.prisma, request, context, { mode: "self-hosted" }),
    ).toBeUndefined();
    const observer = createModelCallQuotaObserver(f.prisma, request, context, {
      mode: "managed",
      billingRequired: false,
    })!;
    await expect(observer.beforeCall({ ...call, fundingSource: "user" })).resolves.toBe(
      "user-funded",
    );
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
    expect(
      managedCompletionTokens(
        { provider: "openrouter", id: call.modelId, fundingSource: "deployment", maxTokens: 32768 },
        "managed",
      ),
    ).toBe(4096);
    expect(
      managedCompletionTokens(
        { provider: "openrouter", id: call.modelId, fundingSource: "user", maxTokens: 32768 },
        "managed",
      ),
    ).toBe(32768);
  });

  it.each([
    [{ daily: 200n, run: 0n, active: 0n }, "Daily model limit"],
    [{ daily: 0n, run: 40n, active: 0n }, "task reached"],
    [{ daily: 0n, run: 0n, active: 4n }, "Too many model"],
  ])("rejects exhausted reservations before inference", async (counts, error) => {
    const f = fixture(counts);
    const observer = createModelCallQuotaObserver(f.prisma, request, context, {
      mode: "managed",
      billingRequired: false,
    })!;
    await expect(observer.beforeCall(call)).rejects.toThrow(error);
    expect(f.execute).not.toHaveBeenCalled();
  });

  it("reserves durably in the root scope and only settles the authenticated receipt", async () => {
    const f = fixture();
    const observer = createModelCallQuotaObserver(f.prisma, request, context, {
      mode: "managed",
      billingRequired: false,
    })!;
    const id = await observer.beforeCall(call);
    expect(f.execute.mock.calls[0]![0].values).toContain("fixture-root");
    expect(f.member).toHaveBeenCalledWith({
      where: { userId: context.userId, spaceId: context.spaceId },
      select: { space: { select: { organizationId: true } } },
    });
    await observer.afterCall(id, null);
    expect(f.execute.mock.calls[1]?.slice(1)).toEqual([id, context.userId, context.spaceId]);
  });

  it("rejects missing membership and existing billing denial before reserving", async () => {
    const f = fixture();
    f.member.mockResolvedValueOnce(null);
    const observer = createModelCallQuotaObserver(f.prisma, request, context, {
      mode: "managed",
      billingRequired: true,
    })!;
    await expect(observer.beforeCall(call)).rejects.toThrow("Space");
    await expect(observer.beforeCall(call)).rejects.toThrow("subscription");
    expect(f.execute).not.toHaveBeenCalled();
  });

  it("rejects unowned funding and oversized payloads before touching the database", async () => {
    const f = fixture();
    const observer = createModelCallQuotaObserver(f.prisma, request, context, { mode: "managed" })!;
    await expect(observer.beforeCall({ ...call, modelId: "other-model" })).rejects.toThrow(
      "funding",
    );
    await expect(observer.beforeCall({ ...call, textRequestBytes: 131073 })).rejects.toThrow(
      "smaller",
    );
    await expect(observer.beforeCall({ ...call, maxOutputTokens: 4097 })).rejects.toThrow("output");
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
    expect(() =>
      createModelCallQuotaObserver(f.prisma, request, undefined, { mode: "managed" }),
    ).toThrow("scope");
  });
});
