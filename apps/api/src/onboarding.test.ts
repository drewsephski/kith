import type * as db from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { chooseFocus, markAppConnected } from "./onboarding.js";

const posted = vi.hoisted(() => [] as Array<{ blocks: unknown[] }>);
vi.mock("@rakazo/db", async (original) => ({
  ...(await original<typeof db>()),
  createThreadMessageInTransaction: vi.fn(async (_tx, input) => {
    posted.push(input);
    return { id: "posted" };
  }),
  appendEventInTransaction: vi.fn(async () => ({ seq: 1 })),
}));
function fixture(catalog: unknown[]) {
  posted.length = 0;
  const tx = {
    $executeRaw: vi.fn(),
    message: {
      findMany: vi.fn(async () => [{ id: "choice", blocks: [{ kind: "choice", answerId: null }] }]),
      update: vi.fn(),
    },
  };
  const deps = {
    prisma: {
      bot: { findFirst: vi.fn(async () => ({ id: "bot", thread: { id: "thread" } })) },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
    },
    events: { notify: vi.fn() },
    connectors: { managedProviders: () => [{ catalog: async () => catalog }] },
  } as unknown as Parameters<typeof chooseFocus>[0];
  const actor = {
    userId: "user",
    spaceId: "space",
    email: "user@rakazo.test",
    isDeploymentOwner: true,
  };
  return { deps, actor, tx };
}
describe("onboarding connection suggestions", () => {
  it("does not invent authorization cards when no connector has an app catalog", async () => {
    const { deps, actor } = fixture([]);
    await chooseFocus(deps, actor, "bot", "day");
    expect(posted.flatMap((message) => message.blocks)).not.toContainEqual(
      expect.objectContaining({ kind: "app_connect" }),
    );
    expect(posted.length).toBeGreaterThan(0);
  });
  it("uses the available connector and omits unavailable apps", async () => {
    const { deps, actor } = fixture([
      { connectorId: "pipedream", slug: "slack", name: "Slack", connected: false, logo: null },
    ]);
    await chooseFocus(deps, actor, "bot", "day");
    expect(
      posted
        .flatMap((message) => message.blocks)
        .filter((block) => (block as { kind: string }).kind === "app_connect"),
    ).toEqual([
      expect.objectContaining({ connectorId: "pipedream", provider: "slack", name: "Slack" }),
    ]);
  });
});

it("marks only the authorized connector when provider slugs collide", async () => {
  const { deps, actor, tx } = fixture([]);
  const blocks = ["composio", "pipedream"].map((connectorId) => ({
    kind: "app_connect",
    connectorId,
    provider: "slack",
    name: "Slack",
    status: "pending",
  }));
  deps.prisma.connection = { findMany: vi.fn(async () => [{ provider: "slack" }]) } as never;
  deps.prisma.message = { findMany: vi.fn(async () => [{ id: "cards", blocks }]) } as never;
  await markAppConnected(deps, actor, "bot", "slack", "pipedream");
  expect(tx.message.update).toHaveBeenCalledWith({
    where: { id: "cards" },
    data: { blocks: [blocks[0], { ...blocks[1], status: "connected" }] },
  });
});

it("rejects an unverified connection without changing card state", async () => {
  const { deps, actor, tx } = fixture([]);
  deps.prisma.connection = { findMany: vi.fn(async () => []) } as never;
  deps.connectors.managed = vi.fn(() => undefined);
  await expect(markAppConnected(deps, actor, "bot", "slack", "example")).rejects.toThrow();
  expect(tx.message.update).not.toHaveBeenCalled();
  expect(deps.prisma.connection.findMany).toHaveBeenCalledWith({
    where: { spaceId: "space", userId: "user", connectorId: "example", status: "connected" },
    select: { provider: true },
  });
});

it("rejects a thread outside the actor's owned group membership", async () => {
  const { deps, actor, tx } = fixture([]);
  deps.prisma.thread = { findFirst: vi.fn(async () => null) } as never;
  await expect(
    markAppConnected(deps, actor, "bot", "slack", "example", "other-thread"),
  ).rejects.toThrow();
  expect(tx.message.update).not.toHaveBeenCalled();
});

it("updates cards in the authorized group thread instead of the bot's main thread", async () => {
  const { deps, actor } = fixture([]);
  deps.prisma.thread = { findFirst: vi.fn(async () => ({ id: "group-thread" })) } as never;
  deps.prisma.connection = { findMany: vi.fn(async () => [{ provider: "slack" }]) } as never;
  deps.prisma.message = { findMany: vi.fn(async () => []) } as never;
  await markAppConnected(deps, actor, "bot", "slack", "example", "group-thread");
  expect(deps.prisma.message.findMany).toHaveBeenCalledWith({
    where: {
      threadId: "group-thread",
      botId: "bot",
      blocks: { array_contains: [{ kind: "app_connect" }] },
    },
    select: { id: true, blocks: true },
    orderBy: { createdAt: "asc" },
  });
});
