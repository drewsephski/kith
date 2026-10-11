// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  generation: 1,
  space: "space-one",
  storage: new Map<string, string>(),
  appState: (_value: string) => {},
  rpc: vi.fn(),
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => state.storage.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    state.storage.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    state.storage.delete(key);
  },
}));
vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_event: string, callback: (value: string) => void) => {
      state.appState = callback;
      return { remove() {} };
    },
  },
}));
vi.mock("./api", () => ({
  rpc: state.rpc,
  currentApiBase: () => "https://example.test",
  selectedSpaceId: () => state.space,
  mobileScreenScopeKey: () => `${state.space}:${state.generation}`,
  captureMobileScreenScope: () => {
    const generation = state.generation;
    return () => generation === state.generation;
  },
}));
vi.mock("./session", () => ({
  currentSessionGeneration: () => state.generation,
  loadVerifiedIntegrationsScope: async () => null,
}));
vi.mock("./i18n", () => ({ t: (text: string) => text }));

import {
  clearConversationDrafts,
  parseSavedConversationDraft,
  readConversationDraft,
} from "./conversation-drafts";
import { useConversationDraft } from "./use-conversation-draft";

let hook: ReturnType<typeof useConversationDraft>;
let edit: (text: string) => void;
let text = "";
const scope = {
  endpoint: "https://example.test",
  userId: "user-one",
  spaceId: "space-one",
  conversation: "bot:one",
};
function Probe({ conversation }: { conversation: string }) {
  const [draft, setDraft] = useState("");
  text = draft;
  edit = setDraft;
  hook = useConversationDraft(conversation, { text: draft }, (saved) => setDraft(saved.text));
  return null;
}
let root = createRoot(document.createElement("div"));
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  state.storage.clear();
  state.generation = 1;
  state.space = "space-one";
  state.rpc.mockReset().mockResolvedValue({ userId: "user-one", spaceId: "space-one" });
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});
async function render(conversation = "bot:one") {
  await act(async () => root.render(<Probe key={conversation} conversation={conversation} />));
}
it("flushes on navigation and backgrounding, and restores A → B → A", async () => {
  await render();
  await act(async () => edit("Unfinished A"));
  await render("group:two");
  await act(async () => edit("Unfinished B"));
  await act(async () => state.appState("background"));
  await render();
  expect(text).toBe("Unfinished A");
  expect(
    parseSavedConversationDraft(
      await readConversationDraft({ ...scope, conversation: "group:two" }),
    ).text,
  ).toBe("Unfinished B");
});
it("persists a delivery nonce before dispatch, restores it on restart, and clears after confirmation", async () => {
  await render();
  await act(async () => edit("Please review"));
  const input = {
    botId: "one",
    text: "Please review",
    clientNonce: "stable-nonce",
    artifactIds: ["durable-artifact"],
  };
  await act(async () => hook.prepare(input, "Please review", null));
  expect(
    parseSavedConversationDraft(await readConversationDraft(scope)).deliveries?.[0]?.input,
  ).toEqual(input);
  await act(async () => root.unmount());
  root = createRoot(document.createElement("div"));
  await render();
  expect(hook.deliveries[0]?.input.clientNonce).toBe("stable-nonce");
  await act(async () => {
    hook.confirmed("stable-nonce", true);
    edit("");
  });
  expect(await readConversationDraft(scope)).toBe("");
});
it("does not erase text edited during an uncertain send", async () => {
  await render();
  await act(async () => edit("Original"));
  await act(async () =>
    hook.prepare({ botId: "one", text: "Original", clientNonce: "nonce" }, "Original", null),
  );
  await act(async () => edit("Next message"));
  await act(async () => hook.confirmed("nonce"));
  expect(parseSavedConversationDraft(await readConversationDraft(scope)).text).toBe("Next message");
});
it.each([false, true])(
  "settles acceptance after leaving its original scope, preserving newer text=%s",
  async (edited) => {
    await render();
    await act(async () => edit("Submitted"));
    let confirm!: () => Promise<void>;
    await act(async () => {
      confirm = await hook.prepare(
        { botId: "one", text: "Submitted", clientNonce: "accepted" },
        "Submitted",
        null,
      );
    });
    if (edited) await act(async () => edit("Newer draft"));
    await render("group:two");
    await act(async () => edit("Other conversation"));
    await act(async () => confirm());
    await render();
    expect(hook.deliveries).toEqual([]);
    expect(text).toBe(edited ? "Newer draft" : "");
    expect(
      parseSavedConversationDraft(
        await readConversationDraft({ ...scope, conversation: "group:two" }),
      ).text,
    ).toBe("Other conversation");
  },
);
it("does not recreate wiped drafts when an old account's accepted request finishes", async () => {
  await render();
  await act(async () => edit("Submitted"));
  let confirm!: () => Promise<void>;
  await act(async () => {
    confirm = await hook.prepare(
      { botId: "one", text: "Submitted", clientNonce: "accepted" },
      "Submitted",
      null,
    );
  });
  state.generation += 1;
  await clearConversationDrafts();
  await confirm();
  expect(await readConversationDraft(scope)).toBe("");
});
it("does not restore an old account's draft after a late identity response", async () => {
  let resolve!: (value: unknown) => void;
  state.rpc.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await render();
  await act(async () => {
    state.generation += 1;
    resolve({ userId: "old", spaceId: "space-one" });
  });
  expect(text).toBe("");
  expect(hook.deliveries).toEqual([]);
});
