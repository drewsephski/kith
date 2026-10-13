import { randomUUID } from "node:crypto";
import { ONCE_ROUTINE_CRON } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { createDb } from "@rakazo/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRunExecutor } from "./executor.js";

const suite =
  process.env.VERIFY_DATABASE === "1" && process.env.DATABASE_URL
    ? describe.sequential
    : describe.skip;

suite("daily routine quota recovery (PostgreSQL)", () => {
  const suffix = randomUUID();
  const users = [`routine-quota-owner-${suffix}`, `routine-quota-other-${suffix}`];
  const organizationId = `routine-quota-organization-${suffix}`;
  const spaces = [`routine-quota-space-a-${suffix}`, `routine-quota-space-b-${suffix}`];
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
        data: { id: userId, name: "Routine quota fixture", email: `${userId}@fixture.test` },
      });
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Routine quota fixture",
        slug: organizationId,
        createdAt: new Date(),
      },
    });
    for (const spaceId of spaces)
      await prisma.space.create({
        data: { id: spaceId, organizationId, name: "Routine quota fixture" },
      });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (prisma) await prisma.bot.deleteMany({ where: { userId: { in: users } } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await close();
  });

  async function fixture(
    input: { userId?: string; spaceId?: string; crons?: string[]; exhaust?: boolean } = {},
  ) {
    const userId = input.userId ?? users[0]!;
    const spaceId = input.spaceId ?? spaces[0]!;
    const bot = await prisma.bot.create({
      data: { userId, spaceId, name: "Routine quota fixture", color: "indigo" },
    });
    const thread = await prisma.thread.create({ data: { botId: bot.id, userId, spaceId } });
    let priorRunId: string | undefined;
    if (input.exhaust !== false) {
      const task = await prisma.task.create({
        data: {
          userId,
          spaceId,
          botId: bot.id,
          threadId: thread.id,
          prompt: "Earlier task",
          status: "completed",
        },
      });
      const run = await prisma.run.create({
        data: {
          userId,
          spaceId,
          botId: bot.id,
          threadId: thread.id,
          taskId: task.id,
          status: "completed",
          trigger: "user",
        },
      });
      priorRunId = run.id;
    }
    const due = new Date(Date.now() - 1000);
    const lastRunAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const routine = await prisma.routine.create({
      data: {
        userId,
        spaceId,
        botId: bot.id,
        name: "Scheduled fixture",
        prompt: "Prepare a fixture report",
        crons: input.crons ?? [ONCE_ROUTINE_CRON],
        timezone: "America/Chicago",
        active: true,
        nextRunAt: due,
        lastRunAt,
      },
    });
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const append = vi.fn().mockResolvedValue(undefined);
    const model = vi.fn();
    const provision = vi.fn();
    const executor = createRunExecutor({
      prisma,
      jobs: { enqueue, cancel: vi.fn() },
      events: { append },
      runtime: { run: model },
      sandbox: { describe: () => ({ id: "none" }), provision },
    } as unknown as Parameters<typeof createRunExecutor>[0]);
    return { executor, enqueue, append, model, provision, routine, due, priorRunId, bot, thread };
  }

  function capped() {
    vi.stubEnv("MODEL_EXECUTION_MODE", "managed");
    vi.stubEnv("MAX_RUNS_PER_USER_PER_DAY", "1");
  }

  it.each([[ONCE_ROUTINE_CRON], ["15 9 * * *"]])(
    "defers an exhausted %j schedule once without task, run or external effects",
    async (...crons) => {
      capped();
      const f = await fixture({ crons });
      const before = {
        tasks: await prisma.task.count({ where: { userId: users[0] } }),
        runs: await prisma.run.count({ where: { userId: users[0] } }),
      };
      const [{ resetAt }] = await prisma.$queryRaw<
        [{ resetAt: Date }]
      >`SELECT (date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC' AS "resetAt"`;
      await Promise.all(
        Array.from({ length: 8 }, () => f.executor.wakeRoutine(f.routine.id, f.due.toISOString())),
      );
      const deferred = await prisma.routine.findUniqueOrThrow({ where: { id: f.routine.id } });
      expect(deferred.active).toBe(true);
      expect(deferred.lastRunAt).toEqual(f.routine.lastRunAt);
      expect(deferred.nextRunAt!.getTime()).toBeGreaterThanOrEqual(resetAt.getTime());
      if (crons[0] === ONCE_ROUTINE_CRON) expect(deferred.nextRunAt).toEqual(resetAt);
      else
        expect(
          new Intl.DateTimeFormat("en-US", {
            timeZone: "America/Chicago",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          }).format(deferred.nextRunAt!),
        ).toBe("09:15");
      expect(await prisma.task.count({ where: { userId: users[0] } })).toBe(before.tasks);
      expect(await prisma.run.count({ where: { userId: users[0] } })).toBe(before.runs);
      expect(f.enqueue).toHaveBeenCalledOnce();
      expect(f.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "routine.wakeup",
          payload: { routineId: f.routine.id, scheduledFor: deferred.nextRunAt!.toISOString() },
        }),
      );
      expect(f.append).not.toHaveBeenCalled();
      expect(f.model).not.toHaveBeenCalled();
      expect(f.provision).not.toHaveBeenCalled();
      await f.executor.wakeRoutine(f.routine.id, f.due.toISOString());
      expect(f.enqueue).toHaveBeenCalledOnce();
    },
  );

  it("preserves the durable deferral when the future job publish fails", async () => {
    capped();
    const f = await fixture();
    f.enqueue.mockRejectedValueOnce(new Error("Fixture queue unavailable"));
    await expect(f.executor.wakeRoutine(f.routine.id, f.due.toISOString())).rejects.toThrow(
      "Fixture queue unavailable",
    );
    const deferred = await prisma.routine.findUniqueOrThrow({ where: { id: f.routine.id } });
    expect(deferred.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
    expect(deferred.lastRunAt).toEqual(f.routine.lastRunAt);
    await f.executor.wakeRoutine(f.routine.id, f.due.toISOString());
    expect(f.enqueue).toHaveBeenCalledOnce();
    expect(await prisma.run.count({ where: { routineId: f.routine.id } })).toBe(0);
  });

  it("can fire a deferred one-shot when allowance becomes available without replaying its old wake", async () => {
    capped();
    const f = await fixture();
    await f.executor.wakeRoutine(f.routine.id, f.due.toISOString());
    // Advance only the fixture's financial day and due time; no wall-clock sleeps or provider calls.
    await prisma.$executeRaw`UPDATE runs SET "createdAt" = CURRENT_TIMESTAMP - interval '1 day' WHERE id = ${f.priorRunId!}`;
    const nextDue = new Date(Date.now() - 1000);
    await prisma.routine.update({ where: { id: f.routine.id }, data: { nextRunAt: nextDue } });
    await f.executor.wakeRoutine(f.routine.id, nextDue.toISOString());
    await f.executor.wakeRoutine(f.routine.id, nextDue.toISOString());
    const completed = await prisma.routine.findUniqueOrThrow({ where: { id: f.routine.id } });
    expect(completed.active).toBe(false);
    expect(completed.nextRunAt).toBeNull();
    expect(await prisma.run.count({ where: { routineId: f.routine.id } })).toBe(1);
    expect(f.enqueue.mock.calls.filter(([job]) => job.name === "run.continue")).toHaveLength(1);
    expect(f.append).toHaveBeenCalledOnce();
    expect(f.model).not.toHaveBeenCalled();
    expect(f.provision).not.toHaveBeenCalled();
  });

  it("does not defer another account or mistake active-run contention for daily exhaustion", async () => {
    capped();
    const blocked = await fixture();
    const other = await fixture({ userId: users[1], spaceId: spaces[1], exhaust: false });
    await blocked.executor.wakeRoutine(blocked.routine.id, blocked.due.toISOString());
    await other.executor.wakeRoutine(other.routine.id, other.due.toISOString());
    expect(await prisma.run.count({ where: { routineId: other.routine.id } })).toBe(1);
    vi.stubEnv("MAX_RUNS_PER_USER_PER_DAY", "10");
    const busy = await fixture();
    await prisma.run.updateMany({
      where: { userId: users[0] },
      data: { status: "running", leaseExpiresAt: new Date(Date.now() + 60000) },
    });
    expect(await prisma.run.count({ where: { userId: users[0], status: "running" } })).toBe(2);
    await busy.executor.wakeRoutine(busy.routine.id, busy.due.toISOString());
    expect(await prisma.run.count({ where: { routineId: busy.routine.id } })).toBe(1);
    expect(busy.enqueue).toHaveBeenCalledWith(expect.objectContaining({ name: "run.continue" }));
  });

  it("still rolls back the schedule on invalid configuration instead of masking it as quota exhaustion", async () => {
    capped();
    vi.stubEnv("MAX_RUNS_PER_USER_PER_DAY", "0");
    const f = await fixture();
    await expect(f.executor.wakeRoutine(f.routine.id, f.due.toISOString())).rejects.toThrow(
      "positive integer",
    );
    const unchanged = await prisma.routine.findUniqueOrThrow({ where: { id: f.routine.id } });
    expect(unchanged.nextRunAt).toEqual(f.due);
    expect(unchanged.lastRunAt).toEqual(f.routine.lastRunAt);
    expect(f.enqueue).not.toHaveBeenCalled();
    expect(await prisma.run.count({ where: { routineId: f.routine.id } })).toBe(0);
  });
});
