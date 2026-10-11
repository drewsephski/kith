import { beforeEach, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => storage.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    storage.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    storage.delete(key);
  }),
}));

import {
  clearConversationDrafts,
  conversationDraftKey,
  parseSavedConversationDraft,
  readConversationDraft,
  writeConversationDraft,
} from "./conversation-drafts";

const scope = {
  endpoint: "https://example.test",
  userId: "user-1",
  spaceId: "space-1",
  conversation: "bot:one",
};
beforeEach(async () => {
  await clearConversationDrafts();
  storage.clear();
});
it("preserves A → B → A and restores encrypted persisted text after a new module session", async () => {
  await writeConversationDraft(scope, "Unsent A");
  await writeConversationDraft({ ...scope, conversation: "group:two" }, "Unsent B");
  expect(await readConversationDraft(scope)).toBe("Unsent A");
  vi.resetModules();
  const restarted = await import("./conversation-drafts");
  expect(await restarted.readConversationDraft(scope)).toBe("Unsent A");
  expect(await restarted.readConversationDraft({ ...scope, conversation: "group:two" })).toBe(
    "Unsent B",
  );
});
it.each(["endpoint", "userId", "spaceId", "conversation"] as const)(
  "isolates drafts by %s",
  async (key) => {
    await writeConversationDraft(scope, "Private prompt");
    expect(await readConversationDraft({ ...scope, [key]: "different" })).toBe("");
    expect(conversationDraftKey({ ...scope, [key]: "different" })).not.toBe(
      conversationDraftKey(scope),
    );
  },
);
it("clears only the confirmed conversation and fences queued saves on logout", async () => {
  await writeConversationDraft(scope, "First");
  const other = { ...scope, conversation: "bot:two" };
  await writeConversationDraft(other, "Second");
  await writeConversationDraft(scope, "");
  expect(await readConversationDraft(other)).toBe("Second");
  const late = writeConversationDraft(scope, "Late private text");
  await clearConversationDrafts();
  await late;
  expect(await readConversationDraft(scope)).toBe("");
  expect(await readConversationDraft(other)).toBe("");
  expect([...storage.values()]).not.toContain("Late private text");
});
it("restores reply references as metadata without trusting temporary handles or executable mentions", () => {
  expect(
    parseSavedConversationDraft(
      JSON.stringify({
        text: "Reply",
        replyTargetId: "message-one",
        replyQuote: "excerpt",
        attachments: ["file:///temp"],
        mentions: [{ connectionId: "stale" }],
      }),
    ),
  ).toEqual({ text: "Reply", replyTargetId: "message-one", replyQuote: "excerpt" });
});
