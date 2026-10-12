import { z } from "zod";
import type { ComputerIntent } from "./computer-demand.js";

const probability = z.number().finite().min(0).max(1);
const intent = z.enum(["conversation", "connected_tools", "computer_candidate", "uncertain"]);
const decisionSchema = z.object({
  answers: z.object({
    routing: z.object({
      type: z.literal("choice"),
      choice: intent,
      confidence: probability,
      probabilities: z.object({
        conversation: probability,
        connected_tools: probability,
        computer_candidate: probability,
        uncertain: probability,
      }),
    }),
  }),
  usage: z.object({ cost: z.number().finite().nonnegative() }).optional(),
});

export type ShadowRoutingDecision = {
  choice: ComputerIntent;
  confidence: number;
  probabilities: Record<ComputerIntent, number>;
  latencyMs: number;
  costUsd: number | null;
};

/** Evaluation-only adapter. No runtime caller; shadow output cannot authorize tools. */
export async function jevShadowDecision(input: {
  mode?: "off" | "shadow";
  sharingAllowed: boolean;
  apiKey?: string;
  text: string;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}): Promise<ShadowRoutingDecision | null> {
  if (
    input.mode !== "shadow" ||
    !input.sharingAllowed ||
    !input.apiKey ||
    !input.text.trim() ||
    input.text.length > 2000 ||
    input.signal?.aborted
  )
    return null;
  const started = performance.now();
  const deadline = AbortSignal.timeout(750);
  const signal = input.signal ? AbortSignal.any([input.signal, deadline]) : deadline;
  try {
    const response = await (input.fetch ?? fetch)("https://openrouter.ai/api/alpha/decisions", {
      method: "POST",
      signal,
      headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "typesafe/jev-1.13",
        state: input.text,
        questions: {
          routing: {
            type: "choice",
            instructions:
              "Which capability does this request need? This is preparation advice, never permission. Prefer connected APIs when available. An explanatory question about a computer does not require a computer.",
            criteria: {
              conversation: "Reasoning, explanation, or saved memory without external action",
              connected_tools: "Connected-service APIs or ordinary web/API research",
              computer_candidate:
                "Live GUI/browser interaction, shell execution, or filesystem processing",
              uncertain:
                "Missing context or materially ambiguous intent; retain normal agent tools",
            },
          },
        },
      }),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      return null;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 16_384) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = Buffer.concat(chunks);
    const parsed = decisionSchema.safeParse(JSON.parse(body.toString("utf8")));
    if (!parsed.success || signal.aborted) return null;
    const answer = parsed.data.answers.routing;
    const sum = Object.values(answer.probabilities).reduce((total, p) => total + p, 0);
    if (Math.abs(sum - 1) > 0.02) return null;
    return {
      choice: answer.choice,
      confidence: answer.confidence,
      probabilities: answer.probabilities,
      latencyMs: Math.round(performance.now() - started),
      costUsd: parsed.data.usage?.cost ?? null,
    };
  } catch {
    return null;
  }
}
