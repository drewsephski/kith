import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import {
  isPeerRun,
  loadAllMessages,
  loadMessagePage,
  shouldForwardPeerThreadEvent,
} from "./thread-message-pages.js";

it.each(["selected", "approved", "pending"] as const)(
  "projects persisted send state across reloads using the %s content",
  async (reviewState) => {
    const email = {
      account: "mail@example.test",
      to: ["recipient@example.test"],
      cc: [],
      bcc: [],
      subject: "Original",
      body: "Original body",
    };
    const row = {
      id: "email-source",
      threadId: "thread-1",
      seq: 1,
      role: "bot",
      botId: "bot-1",
      runId: null,
      replyToMessageId: null,
      replyQuote: null,
      blocks: [{ kind: "email", mode: "draft", draftId: "draft-1", email }],
      createdAt: new Date(),
    };
    const revisedEmail = { ...email, subject: "Accepted revision", body: "Edited body" };
    const approvedEmail = {
      ...revisedEmail,
      to: ["approved-recipient@example.test"],
      subject: "Final provider draft",
      body: "Final reviewed content",
    };
    const review = {
      kind: "ask",
      text: "Review email",
      approvalAction: "email_send",
      approvalEffectId: "send-effect",
      status: "answered",
      answer: "allow",
      email: approvedEmail,
      actions: [
        { id: "allow", label: "Send email" },
        { id: "deny", label: "Cancel" },
      ],
    };
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([
        {
          clientNonce: 'email-send:["email-source",0,"legacy-revision"]',
          blocks: [{ kind: "email", mode: "draft", email: revisedEmail }],
          sourceRuns: [
            {
              id: "send-run",
              status: "completed",
              effects: [
                {
                  id: "send-effect",
                  kind: "GMAIL_SEND_DRAFT",
                  status: "completed",
                  result: { emailSendVerified: true },
                },
              ],
            },
          ],
        },
      ])
      .mockResolvedValueOnce(
        reviewState === "selected"
          ? []
          : reviewState === "approved"
            ? [{ blocks: [review] }]
            : [
                { blocks: [{ ...review, status: "pending", answer: undefined }] },
                { blocks: [review] },
              ],
      );
    const prisma = { message: { findMany } } as unknown as PrismaClient;
    const page = await loadMessagePage(prisma, "thread-1", undefined, 100);
    expect(page.messages[0]?.emailActions).toEqual([
      {
        blockIndex: 0,
        runId: "send-run",
        status: "sent",
        email: reviewState === "approved" ? approvedEmail : revisedEmail,
      },
    ]);
    expect(findMany.mock.calls[1]?.[0].where).toEqual({
      threadId: "thread-1",
      role: "user",
      replyToMessageId: { in: ["email-source"] },
      clientNonce: { startsWith: "email-send:" },
    });
    expect(page.messages[0]?.blocks).toEqual(row.blocks);
    expect(findMany.mock.calls[2]?.[0].where).toEqual({
      threadId: "thread-1",
      role: "bot",
      runId: { in: ["send-run"] },
      blocks: { array_contains: [{ kind: "ask", approvalAction: "email_send" }] },
    });
  },
);

describe("thread message pages", () => {
  it.each(["approved", "intended", "failed", "uncertain", "executing"])(
    "never pairs confirmed email A's Sent status with later email B when B is %s",
    async (status) => {
      const emailA = {
        account: "mail@example.test",
        to: ["first@example.test"],
        cc: [],
        bcc: [],
        subject: "Email A",
        body: "Confirmed content A",
      };
      const emailB = {
        ...emailA,
        to: ["second@example.test"],
        subject: "Email B",
        body: "Later content B",
      };
      const review = (id: string, email: typeof emailA) => ({
        kind: "ask",
        text: "Review email",
        approvalAction: "email_send",
        approvalEffectId: id,
        status: "answered",
        answer: "allow",
        email,
        actions: [
          { id: "allow", label: "Send email" },
          { id: "deny", label: "Cancel" },
        ],
      });
      const findMany = vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: "source",
            threadId: "thread-1",
            seq: 1,
            role: "bot",
            botId: "bot-1",
            runId: null,
            replyToMessageId: null,
            replyQuote: null,
            blocks: [{ kind: "email", mode: "draft", email: emailA }],
            createdAt: new Date(),
          },
        ])
        .mockResolvedValueOnce([
          {
            clientNonce: 'email-send:["source",0]',
            blocks: [{ kind: "email", mode: "draft", email: emailA }],
            sourceRuns: [
              {
                id: "send-run",
                status: "failed",
                effects: [
                  {
                    id: "send-A",
                    kind: "GMAIL_SEND_DRAFT",
                    status: "completed",
                    result: { emailSendVerified: true },
                  },
                  {
                    id: "send-B",
                    kind: "GMAIL_SEND_DRAFT",
                    status: status === "failed" ? "completed" : status,
                    result:
                      status === "failed" ? { error: "Connection revoked before dispatch" } : null,
                  },
                ],
              },
            ],
          },
        ])
        .mockResolvedValueOnce([
          { blocks: [review("send-B", emailB)] },
          { blocks: [review("send-A", emailA)] },
        ]);
      const page = await loadMessagePage(
        { message: { findMany } } as unknown as PrismaClient,
        "thread-1",
        undefined,
        100,
      );
      const uncertain = status === "uncertain" || status === "executing";
      expect(page.messages[0]?.emailActions).toEqual([
        {
          blockIndex: 0,
          runId: "send-run",
          status: uncertain ? "uncertain" : "sent",
          email: uncertain ? emailB : emailA,
        },
      ]);
    },
  );
  it("caches peer-run classification for live events", async () => {
    const findUnique = vi.fn(async () => ({ trigger: "bot_message" }));
    const prisma = { run: { findUnique } } as unknown as PrismaClient;
    const cache = new Map<string, Promise<boolean>>();

    await expect(isPeerRun(prisma, "run-peer", cache)).resolves.toBe(true);
    await expect(isPeerRun(prisma, "run-peer", cache)).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it("forwards peer waiting, ask, and text events on an open thread", () => {
    expect(shouldForwardPeerThreadEvent({ type: "run.waiting_input", payload: {} })).toBe(true);
    expect(shouldForwardPeerThreadEvent({ type: "computer.takeover.requested", payload: {} })).toBe(
      true,
    );
    expect(
      shouldForwardPeerThreadEvent({
        type: "thread.message.created",
        payload: { blocks: [{ kind: "ask", text: "Pick one" }] },
      }),
    ).toBe(true);
    expect(
      shouldForwardPeerThreadEvent({
        type: "thread.message.created",
        payload: { blocks: [{ kind: "text", text: "peer body" }] },
      }),
    ).toBe(true);
    expect(
      shouldForwardPeerThreadEvent({
        type: "thread.progress",
        payload: {},
      }),
    ).toBe(false);
  });

  it("keeps peer receipt rows when filtering peer-run output from pages", async () => {
    const findMany = vi.fn(async () => [
      {
        id: "message-reply",
        threadId: "thread-1",
        seq: 3,
        role: "bot",
        blocks: [{ kind: "text", text: "Echoed peer reply" }],
        botId: "bot-1",
        replyToMessageId: null,
        runId: "run-peer",
        createdAt: new Date("2026-08-16T00:00:03.000Z"),
      },
      {
        id: "message-received",
        threadId: "thread-1",
        seq: 2,
        role: "user",
        blocks: [
          {
            kind: "bot_message_received",
            fromBotId: "bot-2",
            fromBotName: "Coder",
            text: "Done.",
          },
        ],
        botId: null,
        replyToMessageId: null,
        runId: "run-peer",
        createdAt: new Date("2026-08-16T00:00:02.000Z"),
      },
      {
        id: "message-user",
        threadId: "thread-1",
        seq: 1,
        role: "bot",
        blocks: [{ kind: "text", text: "Visible answer" }],
        botId: "bot-1",
        replyToMessageId: null,
        runId: "run-user",
        createdAt: new Date("2026-08-16T00:00:01.000Z"),
      },
    ]);
    const prisma = {
      message: { findMany },
      run: { findMany: vi.fn(async () => [{ id: "run-peer" }]) },
    } as unknown as PrismaClient;

    const page = await loadMessagePage(prisma, "thread-1", undefined, 3);

    expect(page.messages.map((message) => message.id)).toEqual([
      "message-user",
      "message-received",
      "message-reply",
    ]);
  });

  it("filters peer-run activity when its receipt is outside the loaded page", async () => {
    const findMany = vi.fn(async () => [
      {
        id: "message-peer",
        threadId: "thread-1",
        seq: 2,
        role: "bot",
        blocks: [{ kind: "steps", steps: [{ label: "Echoed peer reply", count: 1 }] }],
        botId: "bot-1",
        replyToMessageId: null,
        runId: "run-peer",
        createdAt: new Date("2026-08-16T00:00:02.000Z"),
      },
      {
        id: "message-user",
        threadId: "thread-1",
        seq: 1,
        role: "bot",
        blocks: [{ kind: "text", text: "Visible answer" }],
        botId: "bot-1",
        replyToMessageId: null,
        runId: "run-user",
        createdAt: new Date("2026-08-16T00:00:01.000Z"),
      },
    ]);
    const prisma = {
      message: { findMany },
      run: { findMany: vi.fn(async () => [{ id: "run-peer" }]) },
    } as unknown as PrismaClient;

    const page = await loadMessagePage(prisma, "thread-1", undefined, 2);

    expect(page.messages.map((message) => message.id)).toEqual(["message-user"]);
  });

  it("keeps peer text around-page targets and omits peer activity", async () => {
    const findMany = vi.fn(async () => [
      {
        id: "message-user",
        threadId: "thread-1",
        seq: 4,
        role: "bot",
        blocks: [{ kind: "text", text: "Visible answer" }],
        botId: "bot-1",
        replyToMessageId: null,
        runId: "run-user",
        createdAt: new Date("2026-08-16T00:00:04.000Z"),
      },
      {
        id: "message-peer-activity",
        threadId: "thread-1",
        seq: 5,
        role: "bot",
        blocks: [{ kind: "steps", steps: [{ label: "Message bot", count: 1 }] }],
        botId: "bot-1",
        replyToMessageId: null,
        runId: "run-peer",
        createdAt: new Date("2026-08-16T00:00:05.000Z"),
      },
      {
        id: "message-peer-target",
        threadId: "thread-1",
        seq: 6,
        role: "bot",
        blocks: [{ kind: "text", text: "Peer reply" }],
        botId: "bot-1",
        replyToMessageId: null,
        runId: "run-peer",
        createdAt: new Date("2026-08-16T00:00:06.000Z"),
      },
    ]);
    const count = vi.fn(async () => 1);
    const runFindMany = vi.fn(async () => [{ id: "run-peer" }]);
    const prisma = {
      message: { findMany, count },
      run: { findMany: runFindMany },
    } as unknown as PrismaClient;

    const page = await loadMessagePage(prisma, "thread-1", undefined, 4, {
      messageId: "message-peer-target",
      seq: 6,
    });

    expect(page.messages.map((message) => message.id)).toEqual([
      "message-user",
      "message-peer-target",
    ]);
    expect(runFindMany).toHaveBeenCalled();
  });

  it("keeps peer receipt and text around-page targets in the normal transcript page", async () => {
    const findMany = vi.fn(async () => [
      {
        id: "message-user",
        threadId: "thread-1",
        seq: 4,
        role: "bot",
        blocks: [{ kind: "text", text: "Visible answer" }],
        botId: "bot-1",
        replyToMessageId: null,
        runId: "run-user",
        createdAt: new Date("2026-08-16T00:00:04.000Z"),
      },
      {
        id: "message-peer-receipt",
        threadId: "thread-1",
        seq: 5,
        role: "user",
        blocks: [
          {
            kind: "bot_message_received",
            fromBotId: "bot-2",
            fromBotName: "Coder",
            text: "Done.",
          },
        ],
        botId: null,
        replyToMessageId: null,
        runId: "run-peer",
        createdAt: new Date("2026-08-16T00:00:05.000Z"),
      },
      {
        id: "message-peer-text",
        threadId: "thread-1",
        seq: 6,
        role: "bot",
        blocks: [{ kind: "text", text: "Peer reply" }],
        botId: "bot-1",
        replyToMessageId: null,
        runId: "run-peer",
        createdAt: new Date("2026-08-16T00:00:06.000Z"),
      },
    ]);
    const count = vi.fn(async () => 0);
    const prisma = {
      message: { findMany, count },
      run: { findMany: vi.fn(async () => [{ id: "run-peer" }]) },
    } as unknown as PrismaClient;

    const page = await loadMessagePage(prisma, "thread-1", undefined, 4, {
      messageId: "message-peer-receipt",
      seq: 5,
    });

    expect(page.messages.map((message) => message.id)).toEqual([
      "message-user",
      "message-peer-receipt",
      "message-peer-text",
    ]);
  });

  it("returns peer-run output for the dedicated bot messages view", async () => {
    const findMany = vi.fn(async () => [
      {
        id: "message-peer",
        threadId: "thread-1",
        seq: 1,
        role: "bot",
        blocks: [{ kind: "text", text: "Peer reply" }],
        botId: "bot-1",
        replyToMessageId: null,
        runId: "run-peer",
        createdAt: new Date("2026-08-16T00:00:01.000Z"),
      },
    ]);
    const prisma = {
      message: { findMany, count: vi.fn(async () => 0) },
    } as unknown as PrismaClient;

    const page = await loadMessagePage(
      prisma,
      "thread-1",
      undefined,
      2,
      { messageId: "message-peer", seq: 1 },
      true,
    );

    expect(page.messages.map((message) => message.id)).toEqual(["message-peer"]);
  });

  it("scans past a page containing only hidden peer-run activity", async () => {
    const row = (seq: number, runId: string, kind: "text" | "steps" = "text") => ({
      id: `message-${seq}`,
      threadId: "thread-1",
      seq,
      role: "bot",
      blocks:
        kind === "steps"
          ? [{ kind: "steps", steps: [{ label: String(seq), count: 1 }] }]
          : [{ kind: "text", text: String(seq) }],
      botId: "bot-1",
      replyToMessageId: null,
      runId,
      createdAt: new Date("2026-08-16T00:00:00.000Z"),
    });
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        row(4, "run-peer", "steps"),
        row(3, "run-peer", "steps"),
        row(2, "run-peer", "steps"),
      ])
      .mockResolvedValueOnce([row(1, "run-user")]);
    const prisma = {
      message: { findMany },
      run: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: "run-peer" }])
          .mockResolvedValueOnce([]),
      },
    } as unknown as PrismaClient;

    const page = await loadMessagePage(prisma, "thread-1", undefined, 2);

    expect(page.messages.map((message) => message.id)).toEqual(["message-1"]);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it("scans past a receipt-only page so web can reach older user-visible rows", async () => {
    const receiptRows = [
      {
        id: "message-receipt-b",
        threadId: "thread-1",
        seq: 3,
        role: "user",
        blocks: [
          {
            kind: "bot_message_received",
            fromBotId: "bot-2",
            fromBotName: "Coder",
            text: "Done.",
          },
        ],
        botId: null,
        replyToMessageId: null,
        runId: "run-peer",
        createdAt: new Date("2026-08-16T00:00:03.000Z"),
      },
      {
        id: "message-receipt-a",
        threadId: "thread-1",
        seq: 2,
        role: "user",
        blocks: [
          {
            kind: "bot_message_sent",
            toBotId: "bot-2",
            toBotName: "Coder",
            text: "Check this.",
          },
        ],
        botId: null,
        replyToMessageId: null,
        runId: "run-user",
        createdAt: new Date("2026-08-16T00:00:02.000Z"),
      },
      {
        id: "message-lookahead",
        threadId: "thread-1",
        seq: 1,
        role: "bot",
        blocks: [{ kind: "text", text: "Older visible answer" }],
        botId: "bot-1",
        replyToMessageId: null,
        runId: "run-user",
        createdAt: new Date("2026-08-16T00:00:01.000Z"),
      },
    ];
    const olderRows = [
      {
        id: "message-user",
        threadId: "thread-1",
        seq: 1,
        role: "bot",
        blocks: [{ kind: "text", text: "Older visible answer" }],
        botId: "bot-1",
        replyToMessageId: null,
        runId: "run-user",
        createdAt: new Date("2026-08-16T00:00:01.000Z"),
      },
    ];
    const findMany = vi.fn().mockResolvedValueOnce(receiptRows).mockResolvedValueOnce(olderRows);
    const prisma = {
      message: { findMany },
      run: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: "run-peer" }])
          .mockResolvedValueOnce([]),
      },
    } as unknown as PrismaClient;

    const page = await loadMessagePage(prisma, "thread-1", undefined, 2);

    expect(page.messages.map((message) => message.id)).toEqual(["message-user"]);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it("returns a receipt-only page when the client displays peer receipts", async () => {
    const receipt = (seq: number) => ({
      id: `message-receipt-${seq}`,
      threadId: "thread-1",
      seq,
      role: "user",
      blocks: [
        {
          kind: "bot_message_received",
          fromBotId: "bot-2",
          fromBotName: "Coder",
          text: "Done.",
        },
      ],
      botId: null,
      replyToMessageId: null,
      runId: "run-peer",
      createdAt: new Date(`2026-08-16T00:00:0${seq}.000Z`),
    });
    const findMany = vi.fn(async () => [receipt(3), receipt(2), receipt(1)]);
    const prisma = {
      message: { findMany },
      run: { findMany: vi.fn(async () => [{ id: "run-peer" }]) },
    } as unknown as PrismaClient;

    const page = await loadMessagePage(prisma, "thread-1", undefined, 2, undefined, false, true);

    expect(page.messages.map((message) => message.id)).toEqual([
      "message-receipt-2",
      "message-receipt-3",
    ]);
    expect(page.olderCursor).toBe(2);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("queries before the cursor and returns an ascending bounded page", async () => {
    const findMany = vi.fn(async () =>
      [5, 4, 3].map((seq) => ({
        id: `message-${seq}`,
        threadId: "thread-1",
        seq,
        role: "bot",
        blocks: [{ kind: "text", text: String(seq) }],
        runId: null,
        createdAt: new Date(`2026-08-16T00:00:0${seq}.000Z`),
      })),
    );
    const prisma = { message: { findMany } } as unknown as PrismaClient;

    const page = await loadMessagePage(prisma, "thread-1", 6, 2);

    expect(findMany).toHaveBeenCalledWith({
      include: {
        replyTo: { select: { threadId: true, role: true, botId: true, blocks: true } },
      },
      where: { threadId: "thread-1", seq: { lt: 6 } },
      orderBy: { seq: "desc" },
      take: 3,
    });
    expect(page.messages.map((message) => message.seq)).toEqual([4, 5]);
    expect(page.olderCursor).toBe(4);
  });

  it("ends pagination when the database returns no lookahead row", async () => {
    const findMany = vi.fn(async () => [
      {
        id: "message-0",
        threadId: "thread-1",
        seq: 0,
        role: "user",
        blocks: [],
        runId: null,
        createdAt: new Date("2026-08-16T00:00:00.000Z"),
      },
    ]);
    const prisma = { message: { findMany } } as unknown as PrismaClient;

    const page = await loadMessagePage(prisma, "thread-1", 1, 2);

    expect(page.messages.map((message) => message.seq)).toEqual([0]);
    expect(page.olderCursor).toBeNull();
  });

  it("loads a page around a target sequence", async () => {
    const findFirst = vi.fn(async () => ({ seq: 5 }));
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "message-3",
          threadId: "thread-1",
          seq: 3,
          role: "bot",
          blocks: [],
          runId: null,
          createdAt: new Date(),
        },
        {
          id: "message-4",
          threadId: "thread-1",
          seq: 4,
          role: "bot",
          blocks: [],
          runId: null,
          createdAt: new Date(),
        },
        {
          id: "message-5",
          threadId: "thread-1",
          seq: 5,
          role: "bot",
          blocks: [],
          runId: null,
          createdAt: new Date(),
        },
      ])
      .mockResolvedValueOnce(1);
    const count = vi.fn(async () => 1);
    const prisma = {
      message: { findFirst, findMany, count },
    } as unknown as PrismaClient;

    const page = await loadMessagePage(prisma, "thread-1", undefined, 4, { seq: 5 });

    expect(page.messages.map((message) => message.seq)).toEqual([3, 4, 5]);
    expect(page.olderCursor).toBe(3);
    expect(page.coveredThroughSeq).toBe(7);
    expect(findMany).toHaveBeenCalledWith({
      include: {
        replyTo: { select: { threadId: true, role: true, botId: true, blocks: true } },
      },
      where: { threadId: "thread-1", seq: { gte: 3, lte: 7 } },
      orderBy: { seq: "asc" },
      take: 4,
    });
  });

  it("collects bounded pages into chronological export order", async () => {
    const row = (seq: number) => ({
      id: `message-${seq}`,
      threadId: "thread-1",
      seq,
      role: "bot",
      blocks: [],
      runId: null,
      createdAt: new Date("2026-08-16T00:00:00.000Z"),
    });
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([row(4), row(3), row(2)])
      .mockResolvedValueOnce([row(2), row(1), row(0)])
      .mockResolvedValueOnce([row(0)]);
    const prisma = { message: { findMany } } as unknown as PrismaClient;

    const messages = await loadAllMessages(prisma, "thread-1", 2);

    expect(messages.map((message) => message.seq)).toEqual([0, 1, 2, 3, 4]);
    expect(findMany.mock.calls.map(([query]) => query.where.seq?.lt)).toEqual([undefined, 3, 1]);
  });

  it("derives callId from a call client nonce and leaves plain messages without one", async () => {
    const findMany = vi.fn(async () => [
      {
        id: "message-call",
        threadId: "thread-1",
        seq: 2,
        role: "user",
        blocks: [{ kind: "text", text: "Hey" }],
        botId: null,
        replyToMessageId: null,
        replyQuote: null,
        runId: null,
        clientNonce: "call:call-1:abc",
        createdAt: new Date("2026-08-16T00:00:02.000Z"),
      },
      {
        id: "message-plain",
        threadId: "thread-1",
        seq: 1,
        role: "user",
        blocks: [{ kind: "text", text: "Typed" }],
        botId: null,
        replyToMessageId: null,
        replyQuote: null,
        runId: null,
        clientNonce: "plain-nonce",
        createdAt: new Date("2026-08-16T00:00:01.000Z"),
      },
    ]);
    const prisma = { message: { findMany } } as unknown as PrismaClient;

    const page = await loadMessagePage(prisma, "thread-1", undefined, 2);

    expect(page.messages.map((message) => message.callId)).toEqual([undefined, "call-1"]);
  });
});

describe("authoritative reply previews", () => {
  it("serializes a parent outside the loaded page and marks deleted parents unavailable", async () => {
    const base = {
      threadId: "thread-1",
      role: "user",
      botId: null,
      runId: null,
      createdAt: new Date(),
      blocks: [{ kind: "text", text: "My reply" }],
    };
    const parent = {
      threadId: "thread-1",
      role: "bot",
      botId: "bot-1",
      blocks: [{ kind: "text", text: "**First** line\n\nSecond line" }],
    };
    const findMany = vi.fn().mockResolvedValue([
      {
        ...base,
        id: "reply-2",
        seq: 2,
        replyToMessageId: null,
        replyQuote: "First line",
        replyTo: null,
      },
      {
        ...base,
        id: "reply-1",
        seq: 1,
        replyToMessageId: "older-parent",
        replyQuote: null,
        replyTo: parent,
      },
    ]);
    const page = await loadMessagePage(
      { message: { findMany } } as unknown as PrismaClient,
      "thread-1",
      undefined,
      100,
    );
    expect(page.messages[0]?.replyPreview).toEqual({
      role: "bot",
      botId: "bot-1",
      text: "First line",
    });
    expect(page.messages[1]?.replyPreview).toBeNull();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { threadId: "thread-1" },
        include: {
          replyTo: { select: { threadId: true, role: true, botId: true, blocks: true } },
        },
      }),
    );
  });
  it("does not expose a parent from another thread", async () => {
    const row = {
      id: "reply",
      threadId: "thread-1",
      seq: 1,
      role: "user",
      blocks: [],
      botId: null,
      runId: null,
      createdAt: new Date(),
      replyToMessageId: "foreign",
      replyQuote: null,
      replyTo: {
        threadId: "other",
        role: "bot",
        botId: "other-bot",
        blocks: [{ kind: "text", text: "Private text" }],
      },
    };
    const page = await loadMessagePage(
      { message: { findMany: vi.fn().mockResolvedValue([row]) } } as unknown as PrismaClient,
      "thread-1",
      undefined,
      100,
    );
    expect(page.messages[0]?.replyPreview).toBeNull();
    expect(JSON.stringify(page)).not.toContain("Private text");
  });
});

describe("reply target validation", () => {
  it.each([
    ["malformed text", [{ kind: "text", text: 12 }], null],
    ["null block", [null], null],
    ["non-array", {}, null],
    ["ask", [{ kind: "ask", text: "Which release?" }], "Which release?"],
    [
      "channel message",
      [
        {
          kind: "channel_message",
          provider: "test",
          channelId: "channel",
          fromAddress: "sender",
          fromLabel: "Sender",
          text: "Release notes",
        },
      ],
      "Release notes",
    ],
    [
      "chart",
      [{ kind: "chart", name: "Release adoption", spec: {}, data: [] }],
      "Release adoption",
    ],
  ])("serializes an outside-page %s target safely", async (_kind, blocks, text) => {
    const row = {
      id: "reply",
      threadId: "thread-1",
      seq: 100,
      role: "user",
      blocks: [{ kind: "text", text: "Follow up" }],
      botId: null,
      runId: null,
      createdAt: new Date("2026-10-08T12:00:00Z"),
      replyToMessageId: "older-parent",
      replyQuote: null,
      replyTo: { id: "older-parent", threadId: "thread-1", role: "bot", botId: "bot-1", blocks },
    };
    const prisma = {
      message: { findMany: vi.fn().mockResolvedValue([row]), count: vi.fn().mockResolvedValue(0) },
    } as unknown as PrismaClient;
    for (const around of [undefined, { seq: 100 }]) {
      const page = await loadMessagePage(prisma, "thread-1", undefined, 1, around);
      expect(page.messages.map((message) => message.id)).toEqual(["reply"]);
      expect(page.messages[0]?.replyPreview).toEqual(
        text === null ? null : { role: "bot", botId: "bot-1", text },
      );
    }
  });
});

it("derives attachment metadata from a validated parent outside the loaded page", async () => {
  const image = { kind: "image", artifactId: "parent-photo", name: "", mimeType: "image/png" };
  const row = {
    id: "reply",
    threadId: "thread",
    seq: 100,
    role: "user",
    blocks: [],
    botId: null,
    runId: null,
    createdAt: new Date(),
    replyToMessageId: "parent",
    replyQuote: null,
    replyTo: { threadId: "thread", role: "user", botId: null, blocks: [image] },
  };
  const prisma = {
    message: { findMany: vi.fn().mockResolvedValue([row]), count: vi.fn().mockResolvedValue(0) },
  } as unknown as PrismaClient;
  const page = await loadMessagePage(prisma, "thread", undefined, 1);
  expect(page.messages[0]?.replyPreview).toEqual({ role: "user", text: "", attachment: image });
});
