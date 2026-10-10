import type { Actor, MessageBlock } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import type { ThreadTarget } from "./thread-target.js";
import { sendThreadMessage } from "./thread-target.js";

const card: Extract<MessageBlock, { kind: "email" }> = {
  kind: "email",
  mode: "draft",
  draftId: "draft-1",
  email: {
    account: "work@example.test",
    to: ["recipient@example.test"],
    cc: [],
    bcc: [],
    subject: "Status",
    body: "Reviewed response",
  },
};
function fixture(
  parent: { id: string; botId: string; role: string; blocks: MessageBlock[] } | null = {
    id: "parent",
    botId: "bot-1",
    role: "bot",
    blocks: [card],
  },
  waiting = false,
) {
  let seq = 0;
  const tx = {
    thread: { update: vi.fn(async () => ({ nextMessageSeq: ++seq, nextEventSeq: seq })) },
    message: {
      findFirst: vi.fn(async () => parent),
      update: vi.fn(),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        id: "message-1",
        createdAt: new Date(),
      })),
    },
    run: {
      findMany: vi.fn(async () =>
        waiting ? [{ id: "run-waiting", status: "waiting_input", trigger: "user" }] : [],
      ),
      findUnique: vi.fn(async () => ({ status: "queued", startedAt: null })),
      create: vi.fn(async () => ({ id: "run-1", taskId: "task-1", status: "queued" })),
    },
    task: { create: vi.fn(async () => ({ id: "task-1" })) },
    event: { create: vi.fn(async () => ({ id: "event-1", seq: 1, createdAt: new Date() })) },
    steeringMessage: { create: vi.fn() },
  };
  const prisma = {
    message: { findUnique: vi.fn(async () => null) },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaClient;
  const deps = {
    prisma,
    events: { notify: vi.fn().mockResolvedValue(undefined) } as never,
    jobs: { enqueue: vi.fn().mockResolvedValue(undefined) } as never,
  };
  const actor = { spaceId: "space-1", userId: "user-1" } as Actor;
  const target = { kind: "bot", botId: "bot-1", threadId: "thread-1" } as ThreadTarget;
  return {
    tx,
    prisma,
    async send(input: Parameters<typeof sendThreadMessage>[3]) {
      return sendThreadMessage(deps, actor, target, input);
    },
  };
}
describe("server-owned email actions", () => {
  it("loads the owned card and derives intent and identity without accepting client mail content", async () => {
    const f = fixture();
    await expect(
      f.send({
        emailAction: { messageId: "parent", blockIndex: 0 },
        text: "Send to the wrong person",
        replyToMessageId: "wrong-parent",
        replyQuote: "wrong content",
        clientNonce: "force-new-send",
      }),
    ).resolves.toMatchObject({ runId: "run-1" });
    expect(f.tx.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "parent", threadId: "thread-1" } }),
    );
    expect(f.tx.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        replyToMessageId: "parent",
        replyQuote: undefined,
        clientNonce: 'email-send:["parent",0]',
        blocks: [{ kind: "text", text: "Send this email draft as shown." }, card],
      }),
    });
    expect(f.tx.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ prompt: "Send this email draft as shown." }),
    });
  });
  it.each([
    null,
    { id: "parent", botId: "bot-2", role: "bot", blocks: [card] },
    { id: "parent", botId: "bot-1", role: "user", blocks: [card] },
    {
      id: "parent",
      botId: "bot-1",
      role: "bot",
      blocks: [{ kind: "text" as const, text: "not mail" }],
    },
  ])("rejects missing, foreign, or non-email cards", async (parent) => {
    const f = fixture(parent);
    await expect(
      f.send({ emailAction: { messageId: "parent", blockIndex: 0 } }),
    ).rejects.toMatchObject({ code: parent ? "BAD_REQUEST" : "NOT_FOUND" });
    expect(f.tx.task.create).not.toHaveBeenCalled();
  });
  it("does not turn a card click into the answer to an unrelated pending ask", async () => {
    const f = fixture(undefined, true);
    await expect(
      f.send({ emailAction: { messageId: "parent", blockIndex: 0 } }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(f.tx.task.create).not.toHaveBeenCalled();
  });
});

it("persists the exact email approved by Send and derives a stable revision identity", async () => {
  const edits = { subject: "Revised", body: "My response" };
  const send = fixture();
  await send.send({ emailAction: { messageId: "parent", blockIndex: 0, edits } });
  const data = send.tx.message.create.mock.calls[0]![0].data;
  expect(data.blocks).toEqual([
    { kind: "text", text: "Send this email draft with my edits." },
    { ...card, email: { ...card.email, ...edits } },
  ]);
  expect(data.clientNonce).not.toBe('email-send:["parent",0]');
  const replay = fixture();
  await replay.send({ emailAction: { messageId: "parent", blockIndex: 0, edits } });
  expect(replay.tx.message.create.mock.calls[0]![0].data.clientNonce).toBe(data.clientNonce);
  expect(send.tx.task.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ prompt: "Send this email draft with my edits." }),
  });
});
it("rejects edits to received emails", async () => {
  const f = fixture({
    id: "parent",
    botId: "bot-1",
    role: "bot",
    blocks: [{ ...card, mode: "received" }],
  });
  await expect(
    f.send({
      emailAction: {
        messageId: "parent",
        blockIndex: 0,
        edits: { subject: "Changed", body: "Changed" },
      },
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(f.tx.task.create).not.toHaveBeenCalled();
});
