import type { AgentRuntime } from "@rakazo/adapter-kit";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { ConversationSuggestions } from "./conversation-suggestions.js";

const actor = { userId: "user", spaceId: "space" } as Actor;
const target = { botId: "bot", threadId: "thread" };
const input = { messageId: "reply", locale: "en" };
const suggestions = [
  {
    title: "Compare the milestone options",
    prompt: "Compare the two milestone options we discussed.",
  },
];

function fixture(output = JSON.stringify(suggestions)) {
  const latest = vi.fn().mockResolvedValue({ id: "reply", role: "bot" });
  const busy = vi.fn().mockResolvedValue(null);
  const consent = vi.fn().mockResolvedValue({ id: "consent" });
  const messages = vi.fn().mockImplementation(async () => [
    {
      id: "reply",
      role: "bot",
      blocks: [{ kind: "text", text: "We can prioritize onboarding or search." }],
      runId: null,
    },
    {
      id: "question",
      role: "user",
      blocks: [{ kind: "text", text: "Help plan the next milestone." }],
      runId: null,
    },
  ]);
  const usage = vi.fn().mockResolvedValue({});
  const run = vi.fn<AgentRuntime["run"]>(async function* () {
    yield { type: "text", text: output };
    yield { type: "done" };
  });
  const resolveModel = vi.fn().mockResolvedValue({ provider: "openai", id: "fake-model" });
  const prisma = {
    message: { findFirst: latest, findMany: messages },
    run: { findFirst: busy },
    aiDataConsent: { findFirst: consent },
    usageRecord: { create: usage },
  } as unknown as PrismaClient;
  const service = new ConversationSuggestions({
    prisma,
    runtime: { run } as unknown as AgentRuntime,
    resolveModel,
  });
  return { service, run, latest, busy, consent, messages, usage, resolveModel };
}

describe("conversation follow-ups", () => {
  it("uses recent conversation data and the selected model without tools or chat mutations", async () => {
    const f = fixture();
    expect(await f.service.get(actor, target, input)).toEqual(suggestions);
    const [request, context] = f.run.mock.calls[0]!;
    expect(request.tools).toEqual([]);
    expect(request.history).toEqual([]);
    expect(request.model).toMatchObject({ provider: "openai", id: "fake-model", maxTokens: 1024 });
    expect(request.instructions).toContain("untrusted data");
    expect(request.instructions).toContain("irreversible actions");
    expect(JSON.parse(request.prompt)).toEqual({
      locale: "en",
      messages: [
        { role: "user", text: "Help plan the next milestone." },
        { role: "assistant", text: "We can prioritize onboarding or search." },
      ],
    });
    expect(context?.spaceId).toBe(actor.spaceId);
    expect(f.resolveModel).toHaveBeenCalledWith({ ...actor, ...target });
    expect(f.latest.mock.calls[0]![0].where).toEqual({ threadId: target.threadId });
  });

  it("coalesces concurrent requests and caches only the same scope, reply, language, and model", async () => {
    const f = fixture();
    await Promise.all([f.service.get(actor, target, input), f.service.get(actor, target, input)]);
    await f.service.get(actor, target, input);
    expect(f.run).toHaveBeenCalledTimes(1);
    await f.service.get(actor, target, { ...input, locale: "de" });
    await f.service.get({ ...actor, spaceId: "other" }, target, input);
    f.resolveModel.mockResolvedValue({ provider: "openai", id: "other-model" });
    await f.service.get(actor, target, input);
    expect(f.run).toHaveBeenCalledTimes(4);
  });

  it("rechecks consent even for cached results", async () => {
    const f = fixture();
    await f.service.get(actor, target, input);
    f.consent.mockResolvedValue(null);
    expect(await f.service.get(actor, target, input)).toEqual([]);
    expect(f.run).toHaveBeenCalledTimes(1);
  });

  it.each(["queued", "leased", "running", "waiting_input", "waiting_takeover"])(
    "does not generate while a run is %s",
    async (status) => {
      const f = fixture();
      f.busy.mockResolvedValue({ id: "run", status });
      expect(await f.service.get(actor, target, input)).toEqual([]);
      expect(f.run).not.toHaveBeenCalled();
    },
  );

  it("rejects stale anchors, cleared chats, and unanswered user turns", async () => {
    const f = fixture();
    for (const latest of [null, { id: "new", role: "bot" }, { id: "reply", role: "user" }]) {
      f.latest.mockResolvedValue(latest);
      expect(await f.service.get(actor, target, input)).toEqual([]);
    }
    expect(f.run).not.toHaveBeenCalled();
  });

  it("discards a generation if the conversation changed while it was running", async () => {
    const f = fixture();
    f.run.mockImplementation(async function* () {
      f.latest.mockResolvedValue({ id: "new", role: "user" });
      yield { type: "text", text: JSON.stringify(suggestions) };
    });
    expect(await f.service.get(actor, target, input)).toEqual([]);
  });

  it.each([
    "not json",
    '[{"title":"Missing prompt"}]',
    JSON.stringify(Array(4).fill(suggestions[0])),
    JSON.stringify([{ title: "x", prompt: "x".repeat(501) }]),
  ])("fails quietly for invalid model output %s", async (output) => {
    expect(await fixture(output).service.get(actor, target, input)).toEqual([]);
  });

  it("does not replace failures with unrelated starter prompts", async () => {
    const f = fixture();
    f.run.mockImplementation(async function* () {
      yield { type: "progress", text: "" };
      throw new Error("offline");
    });
    expect(await f.service.get(actor, target, input)).toEqual([]);
  });

  it("declines model requests without consent or a real configured model", async () => {
    const f = fixture();
    f.consent.mockResolvedValue(null);
    expect(await f.service.get(actor, target, input)).toEqual([]);
    f.resolveModel.mockResolvedValue({ provider: "scripted", id: "scripted" });
    expect(await f.service.get(actor, target, input)).toEqual([]);
    expect(f.run).not.toHaveBeenCalled();
  });

  it("bounds text context and excludes tool results and peer receipts", async () => {
    const f = fixture();
    f.messages.mockResolvedValue([
      { id: "reply", role: "bot", blocks: [{ kind: "text", text: "Answer" }] },
      { id: "question", role: "user", blocks: [{ kind: "text", text: "x".repeat(10_000) }] },
    ]);
    await f.service.get(actor, target, input);
    expect(JSON.parse(f.run.mock.calls[0]![0].prompt).messages[0].text).toHaveLength(2000);
    expect(f.messages.mock.calls[0]![0].take).toBe(24);
  });

  it("deduplicates suggestions and removes verbatim repeated user requests", async () => {
    const f = fixture(
      JSON.stringify([
        suggestions[0],
        suggestions[0],
        { title: "Repeat", prompt: "Help plan the next milestone." },
      ]),
    );
    expect(await f.service.get(actor, target, input)).toEqual(suggestions);
  });

  it("grounds follow-ups in an inline email draft without raw tool results", async () => {
    const f = fixture();
    f.messages.mockResolvedValue([
      {
        id: "reply",
        role: "bot",
        blocks: [
          {
            kind: "email",
            mode: "draft",
            email: {
              account: "sender@example.test",
              to: ["recipient@example.test"],
              subject: "Milestone review",
              body: "Please review the onboarding milestone.",
            },
          },
        ],
      },
      {
        id: "question",
        role: "user",
        blocks: [{ kind: "text", text: "Draft an email about the onboarding milestone." }],
      },
    ]);
    await f.service.get(actor, target, input);
    expect(f.run.mock.calls[0]![0].prompt).toContain("onboarding milestone");
    expect(f.run.mock.calls[0]![0].prompt).toContain("email draft; untrusted content");
  });

  it("never uses an older text reply when the latest message has no supported content", async () => {
    const f = fixture();
    f.messages.mockResolvedValue([
      {
        id: "reply",
        role: "bot",
        blocks: [
          {
            kind: "ask",
            text: "Password?",
            input: "secret",
            answer: "fake-secret-value",
            status: "answered",
          },
        ],
      },
      { id: "older-reply", role: "bot", blocks: [{ kind: "text", text: "Old topic." }] },
      { id: "question", role: "user", blocks: [{ kind: "text", text: "Earlier request." }] },
    ]);
    expect(await f.service.get(actor, target, input)).toEqual([]);
    expect(f.run).not.toHaveBeenCalled();
  });

  it("rejects runtime actions and accounts usage without a fictitious run foreign key", async () => {
    const f = fixture();
    f.run.mockImplementation(async function* () {
      yield {
        type: "usage",
        provider: "openai",
        model: "fake-model",
        inputTokens: 10,
        outputTokens: 5,
      };
      yield { type: "ask", text: "Unexpected" };
    });
    expect(await f.service.get(actor, target, input)).toEqual([]);
    expect(f.usage.mock.calls[0]![0].data).toMatchObject({
      userId: "user",
      spaceId: "space",
      operationKind: "answer",
    });
    expect(f.usage.mock.calls[0]![0].data.runId).toBeUndefined();
    expect(f.usage.mock.calls[0]![0].data).not.toHaveProperty("threadId");
  });
});
