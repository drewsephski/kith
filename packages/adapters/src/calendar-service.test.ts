import * as db from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { CalendarService } from "./calendar-service.js";

describe("optional initial calendar briefing", () => {
  it.each([
    { error: new db.ExecutionQuotaError("Daily task limit reached"), skipped: true },
    { error: new Error("Database unavailable"), skipped: false },
  ])("skips only a typed quota failure (skipped=$skipped)", async ({ error, skipped }) => {
    const actor = {
      userId: "fixture-user",
      spaceId: "fixture-space",
      email: "fixture@example.test",
      isDeploymentOwner: false,
    };
    const source = {
      id: "fixture-source",
      provider: "googlecalendar",
      providerRef: "fixture-account",
    };
    const bot = { id: "fixture-bot", thread: { id: "fixture-thread", userId: actor.userId } };
    const createTask = vi.fn();
    const createRun = vi.fn();
    const createReceipt = vi.fn();
    const enqueue = vi.fn();
    const notify = vi.fn();
    const createConnection = vi.fn(async () => ({ id: "fixture-attachment" }));
    const tx = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(async () => [{ id: bot.thread.id }]),
      connection: {
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(source),
        create: createConnection,
      },
      bot: { findFirst: vi.fn(async () => bot) },
      task: { create: createTask },
      run: { create: createRun },
      calendarBriefing: { create: createReceipt },
    };
    const service = new CalendarService({
      prisma: {
        connection: { findFirst: vi.fn(async () => source) },
        bot: { findFirst: vi.fn(async () => bot) },
        $transaction: async (commit: (client: typeof tx) => Promise<unknown>) => commit(tx),
      },
      managed: {
        reader: async () => ({ sources: async () => [{ id: "primary" }], events: vi.fn() }),
      },
      jobs: { enqueue },
      events: { notify },
    } as unknown as ConstructorParameters<typeof CalendarService>[0]);
    const quota = vi.spyOn(db, "assertRunCreationQuota").mockRejectedValue(error);
    try {
      const result = service.connectAccount(actor, {
        connectionId: source.id,
        botId: bot.id,
        timezone: "UTC",
      });
      if (skipped) await expect(result).resolves.toBeUndefined();
      else await expect(result).rejects.toBe(error);
      expect(quota).toHaveBeenCalledExactlyOnceWith(tx, actor.userId);
      expect(createConnection).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: "connected",
          userId: actor.userId,
          spaceId: actor.spaceId,
        }),
      });
      for (const effect of [createTask, createRun, createReceipt, enqueue, notify])
        expect(effect).not.toHaveBeenCalled();
    } finally {
      quota.mockRestore();
    }
  });
});
