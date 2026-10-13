import { createHash } from "node:crypto";
import type { ArtifactStore } from "@rakazo/adapter-kit";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { createDb, IsolationError } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOwnedArtifact } from "./artifacts.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE === "1" && databaseUrl ? describe.sequential : describe.skip;

describePostgres("artifact upload nonce (PostgreSQL)", () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const userId = `artifact-nonce-user-${suffix}`;
  const organizationId = `artifact-nonce-org-${suffix}`;
  const spaceId = `artifact-nonce-space-${suffix}`;
  const actor: Actor = {
    userId,
    spaceId,
    email: `${userId}@rakazo.test`,
    isDeploymentOwner: false,
  };
  const stored = new Set<string>();
  let puts = 0;
  const artifacts = {
    describe: () => ({
      id: "test",
      contractVersion: "1",
      adapterVersion: "1",
      capabilities: { stream: false },
    }),
    async put(input) {
      puts += 1;
      const id = `blob-${puts}`;
      stored.add(id);
      return { id, hash: createHash("sha256").update(input.bytes).digest("hex") };
    },
    async get() {
      return new Uint8Array();
    },
    async remove(id: string) {
      stored.delete(id);
    },
  } satisfies ArtifactStore;
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let botId: string;
  let otherBotId: string;
  const upload = (clientNonce: string | undefined, target: { botId: string; groupId?: string }) =>
    createOwnedArtifact({ prisma, artifacts }, actor, {
      ...target,
      name: "notes.txt",
      mimeType: "text/plain",
      contentBase64: Buffer.from("hello").toString("base64"),
      clientNonce,
    });

  beforeAll(async () => {
    const db = createDb(databaseUrl!);
    prisma = db.prisma;
    close = async () => {
      await db.prisma.$disconnect();
      await db.pool.end();
    };
    await prisma.user.create({
      data: { id: userId, name: userId, email: `${userId}@rakazo.test`, emailVerified: false },
    });
    await prisma.organization.create({
      data: { id: organizationId, name: "Nonce Org", slug: organizationId, createdAt: new Date() },
    });
    await prisma.space.create({
      data: { id: spaceId, organizationId, name: "General", isDefault: true },
    });
    botId = (await prisma.bot.create({ data: { spaceId, userId, name: "Chief", color: "blue" } }))
      .id;
    otherBotId = (
      await prisma.bot.create({ data: { spaceId, userId, name: "Scout", color: "green" } })
    ).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await close();
  });

  it("returns the artifact a retried upload already created", async () => {
    const first = await upload("send-1:0", { botId });
    const retry = await upload("send-1:0", { botId });
    expect(retry).toEqual(first);
    expect(await prisma.artifact.count({ where: { spaceId, clientNonce: "send-1:0" } })).toBe(1);
    expect(stored.size).toBe(1);
  });

  it("creates one artifact when two retries of an upload race", async () => {
    const [a, b] = await Promise.all([
      upload("send-2:0", { botId }),
      upload("send-2:0", { botId }),
    ]);
    expect(a.id).toBe(b.id);
    expect(await prisma.artifact.count({ where: { spaceId, clientNonce: "send-2:0" } })).toBe(1);
    expect(stored.size).toBe(2);
  });

  it("replays one artifact when retries of a group upload race under different member bots", async () => {
    const group = await prisma.chatGroup.create({ data: { spaceId, userId, name: "Race" } });
    const uploads = await Promise.all(
      [botId, otherBotId, botId, otherBotId].map((member) =>
        upload("send-5:0", { botId: member, groupId: group.id }),
      ),
    );
    expect(new Set(uploads.map((artifact) => artifact.id)).size).toBe(1);
    expect(await prisma.artifact.count({ where: { spaceId, clientNonce: "send-5:0" } })).toBe(1);
  });

  it("refuses a nonce reused for another chat", async () => {
    await upload("send-3:0", { botId });
    await expect(upload("send-3:0", { botId: otherBotId })).rejects.toBeInstanceOf(IsolationError);
  });
  it("rejects a changed payload instead of replaying unrelated content", async () => {
    await upload("changed-payload", { botId });
    await expect(
      createOwnedArtifact({ prisma, artifacts }, actor, {
        botId,
        name: "notes.txt",
        mimeType: "text/plain",
        contentBase64: Buffer.from("different").toString("base64"),
        clientNonce: "changed-payload",
      }),
    ).rejects.toThrow("already used for different content");
  });

  it("keeps nonce ownership isolated to account and Space", async () => {
    const otherUserId = `${userId}-other`;
    const otherSpaceId = `${spaceId}-other`;
    await prisma.user.create({
      data: { id: otherUserId, name: "Other", email: `${otherUserId}@rakazo.test` },
    });
    await prisma.space.create({ data: { id: otherSpaceId, organizationId, name: "Other" } });
    const peerBot = await prisma.bot.create({
      data: { spaceId, userId: otherUserId, name: "Peer", color: "blue" },
    });
    const otherSpaceBot = await prisma.bot.create({
      data: { spaceId: otherSpaceId, userId, name: "Elsewhere", color: "blue" },
    });
    const data = {
      name: "notes.txt",
      mimeType: "text/plain",
      contentBase64: Buffer.from("hello").toString("base64"),
      clientNonce: "same-scoped-nonce",
    };
    try {
      const own = await createOwnedArtifact({ prisma, artifacts }, actor, { ...data, botId });
      const peer = await createOwnedArtifact(
        { prisma, artifacts },
        { ...actor, userId: otherUserId },
        { ...data, botId: peerBot.id },
      );
      const elsewhere = await createOwnedArtifact(
        { prisma, artifacts },
        { ...actor, spaceId: otherSpaceId },
        { ...data, botId: otherSpaceBot.id },
      );
      expect(new Set([own.id, peer.id, elsewhere.id]).size).toBe(3);
      expect(
        await prisma.artifact.count({
          where: { clientNonce: "same-scoped-nonce", space: { organizationId } },
        }),
      ).toBe(3);
    } finally {
      await prisma.artifact.deleteMany({ where: { userId: otherUserId } });
      await prisma.bot.deleteMany({ where: { userId: otherUserId } });
      await prisma.user.delete({ where: { id: otherUserId } });
    }
  });

  it("preserves the winner when the adapter returns a shared blob", async () => {
    const key = "shared-blob";
    const sharedStore: ArtifactStore = {
      ...artifacts,
      async put(input) {
        stored.add(key);
        return { id: key, hash: createHash("sha256").update(input.bytes).digest("hex") };
      },
    };
    const input = {
      botId,
      name: "shared.txt",
      mimeType: "text/plain",
      contentBase64: Buffer.from("shared").toString("base64"),
      clientNonce: "shared-retry",
    };
    const created = await Promise.all(
      Array.from({ length: 4 }, () =>
        createOwnedArtifact({ prisma, artifacts: sharedStore }, actor, input),
      ),
    );
    expect(new Set(created.map((item) => item.id)).size).toBe(1);
    expect(stored.has(key)).toBe(true);
  });
});
