import { createRouterClient } from "@orpc/server";
import type { Actor } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import type { RouterDeps } from "./router.js";
import { createRouter } from "./router.js";

const actor: Actor = {
  spaceId: "space-a",
  userId: "user-a",
  email: "user@example.test",
  isDeploymentOwner: false,
};

function fixture({ accounts = 0, connected = true, noAuth = false } = {}) {
  const revoke = vi.fn(async () => undefined);
  const catalog = vi.fn(async () => [{ slug: "GMAIL", connected, noAuth }]);
  const count = vi.fn(async () => accounts);
  const lock = vi.fn(async () => undefined);
  const tx = { $executeRaw: lock, connection: { count } };
  const transaction = vi.fn(async (work: (value: typeof tx) => Promise<void>) => work(tx));
  const managed = vi.fn(() => ({ catalog, revoke }));
  const deps = {
    prisma: { $transaction: transaction },
    connectors: { managed },
    env: { sandboxProvider: "fake" },
  } as unknown as RouterDeps;
  const client = createRouterClient(createRouter(deps), { context: { actor } });
  return { client, revoke, catalog, count, lock, managed, transaction };
}

describe("catalog-only connection removal", () => {
  it("revokes a verified catalog service within the owner's locked scope", async () => {
    const { client, revoke, catalog, count, lock } = fixture();
    await expect(
      client.connections.revokeService({ connectorId: "composio", provider: "gmail" }),
    ).resolves.toEqual({ ok: true });
    expect(lock).toHaveBeenCalledOnce();
    expect(count).toHaveBeenCalledWith({
      where: {
        spaceId: actor.spaceId,
        userId: actor.userId,
        connectorId: "composio",
        provider: { equals: "gmail", mode: "insensitive" },
        status: { in: ["connected", "pending", "error"] },
      },
    });
    expect(catalog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: actor.userId }),
      "gmail",
    );
    expect(revoke).toHaveBeenCalledWith(
      "GMAIL",
      expect.objectContaining({ userId: actor.userId, spaceId: actor.spaceId }),
    );
  });

  it("protects tracked accounts from a provider-wide revoke", async () => {
    const { client, revoke, catalog } = fixture({ accounts: 1 });
    await expect(
      client.connections.revokeService({ connectorId: "composio", provider: "GMAIL" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(catalog).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it("does not repeat a remote deletion for a disconnected service", async () => {
    const { client, revoke } = fixture({ connected: false });
    await client.connections.revokeService({ connectorId: "composio", provider: "gmail" });
    expect(revoke).not.toHaveBeenCalled();
  });

  it.each(["unknown", "no-auth"])("rejects %s catalog entries", async (kind) => {
    const { client, revoke } = fixture({ noAuth: kind === "no-auth" });
    await expect(
      client.connections.revokeService({
        connectorId: "composio",
        provider: kind === "unknown" ? "unknown" : "gmail",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(revoke).not.toHaveBeenCalled();
  });

  it("surfaces provider failures without retrying the mutation", async () => {
    const { client, revoke } = fixture();
    revoke.mockRejectedValueOnce(new Error("Provider unavailable"));
    await expect(
      client.connections.revokeService({ connectorId: "composio", provider: "gmail" }),
    ).rejects.toThrow("Provider unavailable");
    expect(revoke).toHaveBeenCalledOnce();
  });
});
