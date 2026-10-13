import { RPCHandler } from "@orpc/server/fetch";
import type { Actor } from "@rakazo/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RouterDeps } from "./router.js";
import { createRouter } from "./router.js";
import type * as ThreadTargetModule from "./thread-target.js";

const { resolveTarget, send, commitSend } = vi.hoisted(() => ({
  resolveTarget: vi.fn(),
  send: vi.fn(),
  commitSend: vi.fn(),
}));
vi.mock("./thread-target.js", async (original) => ({
  ...(await original<typeof ThreadTargetModule>()),
  resolveThreadTarget: resolveTarget,
  sendThreadMessage: send,
}));

afterEach(() => vi.clearAllMocks());

const actor: Actor = {
  userId: "fixture-user",
  spaceId: "fixture-space",
  email: "fixture@example.test",
  isDeploymentOwner: false,
};
const profile = { modelProvider: "openai", modelId: "fixture-good-model", thinkingLevel: null };

function setup(
  options: {
    group?: boolean;
    followsDefault?: boolean;
    revokedPin?: boolean;
    expiredCodex?: boolean;
    badFirst?: boolean;
  } = {},
) {
  const credential = {
    id: "fixture-credential",
    userId: actor.userId,
    provider: options.expiredCodex ? "openai-codex" : "anthropic",
    secretId: "fixture-default-secret",
    label: "Fixture",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  const defaultPreference = {
    credential,
    isDefault: true,
    modelId: options.expiredCodex ? "gpt-5.3-codex-spark" : "fixture-default-model",
    thinkingLevel: null,
  };
  const owned = {
    credential: {
      ...credential,
      provider: "openai",
      id: "fixture-owned",
      secretId: "fixture-owned-secret",
    },
    modelId: profile.modelId,
    thinkingLevel: null,
    isDefault: false,
  };
  const selected =
    options.followsDefault || options.expiredCodex
      ? { modelProvider: null, modelId: null, thinkingLevel: null }
      : options.revokedPin
        ? { modelProvider: "openrouter", modelId: "openai/gpt-6-luna", thinkingLevel: null }
        : profile;
  const bots = [
    { id: "good", ...selected },
    { id: "bad", modelProvider: null, modelId: null, thinkingLevel: null },
  ];
  const bot = { id: "good", ...selected };
  const target = options.group
    ? {
        kind: "group",
        groupId: "fixture-group",
        threadId: "fixture-thread",
        groupName: "Fixture",
        memberBotIds: ["good", "bad"],
        members: [
          { botId: "good", name: "Good", color: "ink", status: "idle" },
          { botId: "bad", name: "Bad", color: "ink", status: "idle" },
        ],
      }
    : { kind: "bot", botId: "good", threadId: "fixture-thread", bot };
  resolveTarget.mockResolvedValue(target);
  if (options.badFirst && target.kind === "group") target.members.reverse();
  send.mockImplementation(
    async (
      deps: Parameters<typeof ThreadTargetModule.sendThreadMessage>[0],
      _actor: Actor,
      _target: ThreadTargetModule.ThreadTarget,
      input: Parameters<typeof ThreadTargetModule.sendThreadMessage>[3],
    ) => {
      await deps.beforeNewSend?.(input);
      commitSend();
      return { taskId: "fixture-task", runId: "fixture-run", seq: 1 };
    },
  );
  const findMany = vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
    bots.filter((bot) => where.id.in.includes(bot.id)),
  );
  const load = vi.fn(async (_cipher: string, id: string) => {
    if (id === "fixture-owned-secret") return "fixture-user-key";
    if (options.expiredCodex)
      return JSON.stringify({
        type: "oauth",
        access: "fixture-access",
        refresh: "fixture-refresh",
        accountId: "fixture-account",
        expires: Date.now() - 1000,
      });
    return `fixture.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "fixture-account" } })).toString("base64url")}.signature`;
  });
  const read = vi.fn();
  const secretQuery = vi.fn(async ({ where }: { where: { id: string } }) => ({
    id: where.id,
    ciphertext: "fixture-cipher",
  }));
  const deps = {
    prisma: {
      spaceModelPreference: {
        findFirst: vi.fn(
          async ({
            where,
          }: {
            where: { isDefault?: boolean; credential?: { provider: string } };
          }) => {
            if (where.isDefault) return defaultPreference;
            return where.credential?.provider === "openai" ? owned : null;
          },
        ),
      },
      userModelCredential: { findFirst: vi.fn(async () => null) },
      secret: { findFirst: secretQuery },
      deploymentSettings: { findUnique: vi.fn(async () => null) },
      bot: { findMany },
      taughtSkill: { findFirst: vi.fn(async () => null) },
    },
    secrets: { load },
    codexCatalog: { read },
    env: {
      agentRuntime: "pi",
      modelExecutionMode: options.expiredCodex ? "self-hosted" : "managed",
      defaultProvider: "openrouter",
      defaultModel: "openai/gpt-6-luna",
      deploymentModelConfigured: true,
    },
  } as unknown as RouterDeps;
  const handler = new RPCHandler(createRouter(deps));
  const call = async (
    mentions?: Array<{ kind: "bot"; id: string }>,
    clientNonce?: string,
    emailAction?: { messageId: string; blockIndex: number },
  ) => {
    const { response } = await handler.handle(
      new Request("http://127.0.0.1/rpc/threads/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          json: {
            ...(options.group ? { groupId: "fixture-group" } : { botId: "good" }),
            text: "hello",
            mentions,
            clientNonce,
            emailAction,
          },
        }),
      }),
      { prefix: "/rpc", context: { actor } },
    );
    return response!;
  };
  return { call, load, read, findMany, secretQuery, deps };
}

describe("effective conversation model admission", () => {
  it("admits an owned bot override without decrypting its unusable Space default", async () => {
    const { call, load, secretQuery } = setup();
    expect((await call()).status).toBe(200);
    expect(send).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledExactlyOnceWith("fixture-cipher", "fixture-owned-secret");
    expect(secretQuery).toHaveBeenCalledWith({
      where: { id: "fixture-owned-secret", userId: actor.userId, spaceId: null },
      select: { id: true, ciphertext: true },
    });
  });
  it("rejects a bot following the unusable default", async () => {
    const { call } = setup({ followsDefault: true });
    expect((await call()).status).toBe(400);
    expect(commitSend).not.toHaveBeenCalled();
  });
  it("returns an accepted send receipt after its model is disconnected", async () => {
    const { call, deps, load } = setup({ followsDefault: true });
    const receiptRun = {
      id: "fixture-accepted-run",
      taskId: "fixture-accepted-task",
      status: "completed",
    };
    const findUnique = vi.fn(async () => ({
      id: "fixture-message",
      seq: 7,
      runId: receiptRun.id,
      sourceRuns: [receiptRun],
    }));
    Object.assign(deps.prisma, {
      message: { findUnique },
      event: { findFirst: vi.fn(async () => null) },
    });
    Object.assign(deps, { events: { notify: vi.fn() }, jobs: { enqueue: vi.fn() } });
    const actual = await vi.importActual<typeof ThreadTargetModule>("./thread-target.js");
    send.mockImplementation(actual.sendThreadMessage);
    const response = await call(undefined, "fixture-accepted-nonce");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      json: { taskId: receiptRun.taskId, runId: receiptRun.id, seq: 7 },
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          threadId_clientNonce: {
            threadId: "fixture-thread",
            clientNonce: "fixture-accepted-nonce",
          },
        },
      }),
    );
    expect(load).not.toHaveBeenCalled();
  });
  it("does not fund a revoked explicit Luna pin through the deployment key", async () => {
    const { call } = setup({ revokedPin: true });
    expect((await call()).status).toBe(400);
    expect(commitSend).not.toHaveBeenCalled();
  });
  it("allows expired self-hosted Codex auth to reach execution-time refresh", async () => {
    const { call, read } = setup({ expiredCodex: true });
    expect((await call()).status).toBe(200);
    expect(send).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
  });
  it("checks only actual addressed group recipients", async () => {
    const { call, findMany } = setup({ group: true });
    expect((await call([{ kind: "bot", id: "good" }])).status).toBe(200);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["good"] },
        userId: actor.userId,
        spaceId: actor.spaceId,
        archivedAt: null,
      },
      select: { modelProvider: true, modelId: true, thinkingLevel: true },
    });
    expect(send).toHaveBeenCalledOnce();
  });
  it("preserves a mixed group message for independently authorized recipients", async () => {
    const { call, findMany } = setup({ group: true });
    expect(
      (
        await call([
          { kind: "bot", id: "good" },
          { kind: "bot", id: "bad" },
        ])
      ).status,
    ).toBe(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["good", "bad"] } }) }),
    );
    expect(send).toHaveBeenCalledOnce();
  });
  it("rejects a group message addressed only to an unavailable recipient", async () => {
    const { call } = setup({ group: true });
    expect((await call([{ kind: "bot", id: "bad" }])).status).toBe(400);
    expect(commitSend).not.toHaveBeenCalled();
  });
  it.each([
    { cardBot: "good", badFirst: true, status: 200 },
    { cardBot: "bad", badFirst: false, status: 400 },
  ])(
    "checks email card bot $cardBot instead of the first member",
    async ({ cardBot, badFirst, status }) => {
      const { call, deps, findMany } = setup({ group: true, badFirst });
      const findFirst = vi.fn(async () => ({ botId: cardBot }));
      Object.assign(deps.prisma, { message: { findFirst } });
      expect(
        (await call(undefined, undefined, { messageId: "fixture-email", blockIndex: 0 })).status,
      ).toBe(status);
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: "fixture-email", threadId: "fixture-thread", role: "bot" },
        select: { botId: true },
      });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { in: [cardBot] } }) }),
      );
      expect(commitSend).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
    },
  );
});
