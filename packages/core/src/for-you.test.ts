import { describe, expect, it, vi } from "vitest";
import type { ForYouConversationAttempt } from "./for-you.js";
import { FOR_YOU_SUGGESTIONS, startForYouConversation } from "./for-you.js";

const suggestion = FOR_YOU_SUGGESTIONS[0]!;
describe("For you conversation launch", () => {
  it("creates a separate assistant thread and sends the selected prompt", async () => {
    const create = vi.fn().mockResolvedValue({ id: "new-thread" });
    const send = vi.fn().mockResolvedValue({});
    const attempt = { clientNonce: "prompt-nonce" };
    await expect(
      startForYouConversation(suggestion, "assistant", attempt, { create, send }),
    ).resolves.toBe("new-thread");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: suggestion.title,
        parentBotId: "assistant",
        startEmpty: true,
        notifyOnFinish: true,
      }),
    );
    expect(send).toHaveBeenCalledWith({
      botId: "new-thread",
      text: suggestion.prompt,
      clientNonce: "prompt-nonce",
    });
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0]!);
  });
  it("reuses the thread and message nonce after a failed send", async () => {
    const create = vi.fn().mockResolvedValue({ id: "new-thread" });
    const send = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({});
    const attempt: ForYouConversationAttempt = { clientNonce: "retry-nonce" };
    await expect(
      startForYouConversation(suggestion, "assistant", attempt, { create, send }),
    ).rejects.toThrow("offline");
    expect(attempt.botId).toBe("new-thread");
    await startForYouConversation(suggestion, "assistant", attempt, { create, send });
    expect(create).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
  });
  it("does not send when creating the thread fails", async () => {
    const create = vi.fn().mockRejectedValue(new Error("unavailable"));
    const send = vi.fn();
    const attempt: ForYouConversationAttempt = { clientNonce: "nonce" };
    await expect(
      startForYouConversation(suggestion, "assistant", attempt, { create, send }),
    ).rejects.toThrow("unavailable");
    expect(attempt.botId).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
});
