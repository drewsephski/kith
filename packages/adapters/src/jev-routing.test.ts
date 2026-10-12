import { describe, expect, it, vi } from "vitest";
import { jevShadowDecision } from "./jev-routing.js";

const result = {
  answers: {
    routing: {
      type: "choice",
      choice: "connected_tools",
      confidence: 0.9,
      probabilities: {
        conversation: 0.05,
        connected_tools: 0.9,
        computer_candidate: 0.03,
        uncertain: 0.02,
      },
    },
  },
  usage: { cost: 0.00001 },
};
const input = {
  mode: "shadow" as const,
  sharingAllowed: true,
  apiKey: "fixture-key",
  text: "Read Gmail",
};

describe("optional Jev shadow decisions", () => {
  it.each([
    { mode: "off" as const },
    { sharingAllowed: false },
    { apiKey: undefined },
    { text: "x".repeat(2001) },
    { signal: AbortSignal.abort() },
  ])("does not send content when blocked by %j", async (change) => {
    const fetcher = vi.fn();
    expect(await jevShadowDecision({ ...input, ...change, fetch: fetcher })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses Decisions rather than completions and parses bounded typed output", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(result));
    expect(await jevShadowDecision({ ...input, fetch: fetcher })).toMatchObject({
      choice: "connected_tools",
      confidence: 0.9,
      costUsd: 0.00001,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(JSON.parse(String(options?.body))).toMatchObject({
      model: "typesafe/jev-1.13",
      state: "Read Gmail",
      questions: { routing: { type: "choice" } },
    });
  });
  it.each([
    {},
    { ...result, answers: { routing: { choice: "shell" } } },
    { ...result, answers: { routing: { ...result.answers.routing, confidence: 2 } } },
    {
      ...result,
      answers: {
        routing: {
          ...result.answers.routing,
          probabilities: { ...result.answers.routing.probabilities, uncertain: 0.9 },
        },
      },
    },
  ])("falls back for malformed output", async (value) => {
    expect(
      await jevShadowDecision({ ...input, fetch: vi.fn(async () => Response.json(value)) }),
    ).toBeNull();
  });
  it("fails open to existing routing on unavailable service without retries", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("unavailable");
    });
    expect(await jevShadowDecision({ ...input, fetch: fetcher })).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("bounds oversized responses", async () => {
    expect(
      await jevShadowDecision({
        ...input,
        fetch: vi.fn(async () => new Response("x".repeat(20_000))),
      }),
    ).toBeNull();
  });
});
