// @vitest-environment jsdom
import type { ThreadMessage } from "@rakazo/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { useReplyDraft } from "./reply-draft";

it("late success clears only its captured reply intent in the originating conversation", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  let reply!: ReturnType<typeof useReplyDraft>;
  function Parent({ scope }: { scope: string }) {
    reply = useReplyDraft(scope);
    return <div>{reply.target?.id}</div>;
  }
  const message: ThreadMessage = {
    id: "first",
    threadId: "thread",
    seq: 1,
    role: "bot",
    blocks: [],
    createdAt: "2026-10-10T12:00:00Z",
  };
  try {
    await act(async () => root.render(<Parent scope="a" />));
    await act(async () => reply.select(message));
    const submitted = reply.current;
    await act(async () => root.render(<Parent scope="b" />));
    await act(async () => reply.select({ ...message, id: "new-chat" }));
    await act(async () => reply.settle(submitted));
    expect(reply.target?.id).toBe("new-chat");
    await act(async () => root.render(<Parent scope="a" />));
    await act(async () => reply.select({ ...message, id: "new-reply" }));
    await act(async () => reply.settle(submitted));
    expect(reply.target?.id).toBe("new-reply");
    const latest = reply.current;
    await act(async () => reply.settle(latest));
    expect(reply.target).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});
