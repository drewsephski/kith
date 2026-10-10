import { createRouterClient } from "@orpc/server";
import type { Actor } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import type { RouterDeps } from "./router.js";
import { createRouter } from "./router.js";

const actor = { userId: "user", spaceId: "space" } as Actor;
function fixture() {
  const bot = vi.fn().mockResolvedValue({ id: "bot", thread: { id: "thread" } });
  const get = vi.fn().mockResolvedValue([]);
  const deps = {
    prisma: { bot: { findFirst: bot } },
    conversationSuggestions: { get },
    env: {},
  } as unknown as RouterDeps;
  const router = createRouter(deps);
  const client = createRouterClient(router, { context: { actor } });
  return { client, router, bot, get };
}

describe("follow-up suggestion authorization", () => {
  it("resolves the owned conversation before generating", async () => {
    const f = fixture();
    await f.client.threads.suggestions({ botId: "bot", messageId: "reply", locale: "en" });
    expect(f.bot).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "bot",
          userId: "user",
          spaceId: "space",
          archivedAt: null,
        },
      }),
    );
    expect(f.get).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ botId: "bot", threadId: "thread" }),
      { botId: "bot", messageId: "reply", locale: "en" },
      undefined,
    );
  });

  it("refuses missing, foreign, or archived conversations before generation", async () => {
    const f = fixture();
    f.bot.mockResolvedValue(null);
    await expect(
      f.client.threads.suggestions({ botId: "foreign", messageId: "reply" }),
    ).rejects.toThrow();
    expect(f.get).not.toHaveBeenCalled();
  });

  it("requires an authenticated actor", async () => {
    const f = fixture();
    const client = createRouterClient(f.router, { context: { actor: null } });
    await expect(
      client.threads.suggestions({ botId: "bot", messageId: "reply" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(f.bot).not.toHaveBeenCalled();
    expect(f.get).not.toHaveBeenCalled();
  });
});
