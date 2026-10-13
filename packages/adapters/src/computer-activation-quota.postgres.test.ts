import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@rakazo/db";
import { createDb, ExecutionQuotaError } from "@rakazo/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { claimComputerActivation } from "./computer-demand.js";

const suite =
  process.env.VERIFY_DATABASE === "1" && process.env.DATABASE_URL
    ? describe.sequential
    : describe.skip;

suite("computer activation admission (PostgreSQL)", () => {
  const suffix = randomUUID();
  const users = [`activation-owner-${suffix}`, `activation-other-${suffix}`];
  const organizationId = `activation-organization-${suffix}`;
  const spaces = [`activation-space-a-${suffix}`, `activation-space-b-${suffix}`];
  let prisma: PrismaClient;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const db = createDb(process.env.DATABASE_URL!);
    prisma = db.prisma;
    close = async () => {
      await prisma.$disconnect();
      await db.pool.end();
    };
    for (const userId of users)
      await prisma.user.create({
        data: { id: userId, name: "Activation fixture", email: `${userId}@fixture.test` },
      });
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Activation fixture",
        slug: organizationId,
        createdAt: new Date(),
      },
    });
    for (const spaceId of spaces)
      await prisma.space.create({
        data: { id: spaceId, organizationId, name: "Activation fixture" },
      });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (prisma) await prisma.computer.deleteMany({ where: { spaceId: { in: spaces } } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await close();
  });

  const computer = async (
    input: { userId?: string; spaceId?: string; kind?: string; state?: string } = {},
  ) => {
    const id = randomUUID();
    return prisma.computer.create({
      data: {
        userId: input.userId ?? users[0]!,
        spaceId: input.spaceId ?? spaces[0]!,
        scopeKey: `activation:${id}`,
        homeKey: `activation:${id}`,
        kind: input.kind ?? "e2b",
        state: input.state ?? "stopped",
      },
    });
  };

  const claim = (target: { id: string; userId: string; spaceId: string; kind: string }) =>
    claimComputerActivation(prisma, {
      userId: target.userId,
      computerId: target.id,
      kind: target.kind,
      where: {
        id: target.id,
        userId: target.userId,
        spaceId: target.spaceId,
        state: "stopped",
      },
      data: { state: "booting" },
    });

  const managed = () => {
    vi.stubEnv("MODEL_EXECUTION_MODE", "managed");
    vi.stubEnv("SANDBOX_MAX_ACTIVE_COMPUTERS_PER_USER", undefined);
  };

  it("serializes simultaneous claims across Spaces and keeps other accounts independent", async () => {
    managed();
    const targets = await Promise.all(
      Array.from({ length: 8 }, (_, i) => computer({ spaceId: spaces[i % 2] })),
    );
    const results = await Promise.allSettled(targets.map(claim));
    const admitted = results.filter(
      (result): result is PromiseFulfilledResult<{ count: number }> =>
        result.status === "fulfilled",
    );
    expect(admitted.map((result) => result.value.count)).toEqual([1]);
    const refused = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(refused).toHaveLength(7);
    for (const refusal of refused) {
      expect(refusal.reason).toBeInstanceOf(ExecutionQuotaError);
      expect(refusal.reason.message).toBe(
        "Computer limit reached. Stop another computer, then retry.",
      );
    }
    expect(await prisma.computer.count({ where: { userId: users[0], state: "booting" } })).toBe(1);
    expect(await prisma.computer.count({ where: { userId: users[0], state: "stopped" } })).toBe(7);
    const otherAccount = await computer({ userId: users[1] });
    await expect(claim(otherAccount)).resolves.toEqual({ count: 1 });
    expect(await prisma.computer.count({ where: { userId: users[1], state: "booting" } })).toBe(1);
  });

  it.each(["running", "booting", "suspending"])(
    "counts a %s remote computer and releases admission after it stops",
    async (state) => {
      managed();
      const occupied = await computer({ state });
      const next = await computer({ spaceId: spaces[1] });
      await expect(claim(next)).rejects.toBeInstanceOf(ExecutionQuotaError);
      expect((await prisma.computer.findUniqueOrThrow({ where: { id: next.id } })).state).toBe(
        "stopped",
      );
      await prisma.computer.update({ where: { id: occupied.id }, data: { state: "stopped" } });
      await expect(claim(next)).resolves.toEqual({ count: 1 });
    },
  );

  it("preserves self-hosted zero-cap behavior and its configured-cap contention result", async () => {
    vi.stubEnv("MODEL_EXECUTION_MODE", "self-hosted");
    vi.stubEnv("SANDBOX_MAX_ACTIVE_COMPUTERS_PER_USER", "0");
    const targets = await Promise.all([computer(), computer(), computer()]);
    expect(await Promise.all(targets.map(claim))).toEqual([
      { count: 1 },
      { count: 1 },
      { count: 1 },
    ]);
    vi.stubEnv("SANDBOX_MAX_ACTIVE_COMPUTERS_PER_USER", "1");
    const stopped = await computer();
    await expect(claim(stopped)).resolves.toEqual({ count: 0 });
    expect((await prisma.computer.findUniqueOrThrow({ where: { id: stopped.id } })).state).toBe(
      "stopped",
    );
  });

  it("keeps local desktops outside the managed remote-computer cap", async () => {
    managed();
    const desktops = await Promise.all([
      computer({ kind: "desktop" }),
      computer({ kind: "desktop" }),
    ]);
    expect(await Promise.all(desktops.map(claim))).toEqual([{ count: 1 }, { count: 1 }]);
    const remote = await computer();
    await expect(claim(remote)).resolves.toEqual({ count: 1 });
    const nextRemote = await computer();
    await expect(claim(nextRemote)).rejects.toBeInstanceOf(ExecutionQuotaError);
    const anotherDesktop = await computer({ kind: "desktop" });
    await expect(claim(anotherDesktop)).resolves.toEqual({ count: 1 });
  });

  it("fails closed for a zero managed cap before changing computer state", async () => {
    managed();
    vi.stubEnv("SANDBOX_MAX_ACTIVE_COMPUTERS_PER_USER", "0");
    const target = await computer();
    await expect(claim(target)).rejects.toThrow(
      "SANDBOX_MAX_ACTIVE_COMPUTERS_PER_USER must be a positive integer",
    );
    expect((await prisma.computer.findUniqueOrThrow({ where: { id: target.id } })).state).toBe(
      "stopped",
    );
  });
});
