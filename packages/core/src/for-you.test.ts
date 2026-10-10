import { describe, expect, it, vi } from "vitest";
import {
  FOR_YOU_SUGGESTIONS,
  forYouLaunchAttempt,
  forYouLaunchStorageKey,
  startForYouConversation,
} from "./for-you.js";

const suggestion = FOR_YOU_SUGGESTIONS[0]!;
const scope = { userId: "user", spaceId: "space", assistantId: "assistant" };
const id = "00000000-0000-4000-8000-000000000001";

describe("For you conversation launch", () => {
  it("delegates creation and the first task to one authoritative operation", async () => {
    const launch = vi.fn().mockResolvedValue({ id: "conversation" });
    await expect(
      startForYouConversation(suggestion, scope, { operationId: id }, { launch }),
    ).resolves.toBe("conversation");
    expect(launch).toHaveBeenCalledWith({ ...scope, suggestionId: suggestion.id, operationId: id });
  });

  it("recovers a failed or uncertain request after reload with the same persisted identity", async () => {
    const storage = new Map<string, string>();
    const key = forYouLaunchStorageKey(scope, suggestion.id);
    const first = forYouLaunchAttempt(storage.get(key) ?? null, () => id);
    storage.set(key, first.operationId);
    const launch = vi
      .fn()
      .mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce({ id: "same-conversation" });
    await expect(startForYouConversation(suggestion, scope, first, { launch })).rejects.toThrow(
      "lost response",
    );
    const reloaded = forYouLaunchAttempt(storage.get(key) ?? null, () => "other-operation");
    expect(reloaded).toEqual(first);
    await startForYouConversation(suggestion, scope, reloaded, { launch });
    expect(launch.mock.calls[0]).toEqual(launch.mock.calls[1]);
    storage.delete(key);
    expect(forYouLaunchAttempt(storage.get(key) ?? null, () => "new-operation").operationId).toBe(
      "new-operation",
    );
  });

  it("isolates pending attempts by account, space, assistant, and suggestion", () => {
    const keys = [
      forYouLaunchStorageKey(scope, suggestion.id),
      forYouLaunchStorageKey({ ...scope, userId: "other" }, suggestion.id),
      forYouLaunchStorageKey({ ...scope, spaceId: "other" }, suggestion.id),
      forYouLaunchStorageKey({ ...scope, assistantId: "other" }, suggestion.id),
      forYouLaunchStorageKey(scope, "other"),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    expect(forYouLaunchAttempt("invalid", () => id).operationId).toBe(id);
  });
});
