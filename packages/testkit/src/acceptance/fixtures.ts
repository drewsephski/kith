import assert from "node:assert/strict";
import type { ModelEmulatorRequest, ModelEmulatorStep } from "../model-emulator.js";

export const ACCEPTANCE_SCENARIOS = [
  "conversation",
  "cancellation",
  "memory-save",
  "memory-restart",
  "connected-source",
  "revoked-source",
  "computer-file",
  "computer-lifecycle",
  "approval-allow",
  "approval-deny",
  "approval-interrupted",
] as const;
export type AcceptanceScenario = (typeof ACCEPTANCE_SCENARIOS)[number];
export const FILE_CONTENT = "Kith synthetic acceptance file: violet-731\n";
export const MEMORY = "The synthetic user's preferred notebook color is violet-731.";
export const NOTE = { recordId: "customer-1", text: "Synthetic acceptance approved." };

export function approvalNote(scenario: AcceptanceScenario) {
  return { ...NOTE, text: `${NOTE.text} ${scenario}` };
}

const text = (value: string): ModelEmulatorStep => ({
  expect: () => {},
  response: { type: "text", text: value },
  timing: { chunkMs: 5 },
});
const tool = (name: string, args: Record<string, unknown>, id = name): ModelEmulatorStep => ({
  expect: () => {},
  response: { type: "tool", name, arguments: args, id },
});
const result = (value: string, expected: RegExp): ModelEmulatorStep => ({
  ...text(value),
  expect: (request: ModelEmulatorRequest) => {
    const latest = request.messages.findLast((message) => message.role === "tool");
    assert.ok(latest && expected.test(JSON.stringify(latest.content)), "Tool result missing");
  },
});

/** Scripted protocol decisions are execution regressions, never real-model quality claims. */
export function acceptanceFixture(scenario: AcceptanceScenario) {
  switch (scenario) {
    case "conversation":
      return {
        prompt: "Hello! What is 2 + 2? Reply briefly.",
        steps: [{ ...text("Hello! 2 + 2 is 4."), timing: { firstTextMs: 50, chunkMs: 100 } }],
      };
    case "cancellation":
      return {
        prompt: "Write a very long explanation of the history of arithmetic. Do not use tools.",
        steps: [
          {
            expect: () => {},
            response: { type: "hold", text: "Arithmetic has a long history." },
          } satisfies ModelEmulatorStep,
        ],
      };
    case "memory-save":
      return {
        prompt: `Remember for future conversations: ${MEMORY}`,
        steps: [
          tool("remember", { path: "MEMORY.md", content: MEMORY }),
          result("Remembered your preference.", /true/),
        ],
      };
    case "memory-restart":
      return {
        prompt: "What is my saved preferred notebook color? Answer only the color; do not guess.",
        steps: [
          {
            ...text("violet-731"),
            expect: (request: ModelEmulatorRequest) => {
              assert.ok(
                JSON.stringify(request.messages).includes(MEMORY),
                "Persisted memory absent",
              );
            },
          },
        ],
      };
    case "connected-source":
      return {
        prompt: "Read my connected Gmail inbox. What blocks the launch? Use the connected service.",
        steps: [
          tool("GMAIL_LIST_MESSAGES", {}),
          result("The unsigned contract blocks the launch.", /unsigned contract/),
        ],
      };
    case "revoked-source":
      return {
        prompt:
          "Read my Gmail inbox again. If access is unavailable, say so. Do not use a computer.",
        steps: [
          tool("GMAIL_LIST_MESSAGES", {}),
          result(
            "Gmail access is unavailable; reconnect it.",
            /unavailable|not available|not connected|Unknown|not found|connect|revoked/i,
          ),
        ],
      };
    case "computer-file":
      return {
        prompt: `Create notes/acceptance.txt on your computer containing exactly ${JSON.stringify(FILE_CONTENT)}. Run a foreground shell command that waits 95 seconds and prints kith-active-verified before completing this task. Read the file back to verify the bytes.`,
        steps: [
          tool("write_file", { path: "notes/acceptance.txt", content: FILE_CONTENT }),
          resultTool("read_file", { path: "notes/acceptance.txt" }, /true/),
          result("Created and verified notes/acceptance.txt.", /violet-731/),
        ],
      };
    case "computer-lifecycle":
      return { prompt: "", steps: [] };
    case "approval-allow":
    case "approval-deny":
    case "approval-interrupted":
      return {
        prompt: `Add a CRM note to Example Bakery saying exactly ${JSON.stringify(approvalNote(scenario).text)}.`,
        steps: [
          tool("CRM_CREATE_NOTE", approvalNote(scenario), "pending-note"),
          ...(scenario === "approval-interrupted" || scenario === "approval-deny"
            ? []
            : [
                tool("CRM_CREATE_NOTE", approvalNote(scenario), "resumed-note"),
                result(
                  scenario === "approval-allow"
                    ? "Saved the approved note."
                    : "The note was denied; nothing was written.",
                  scenario === "approval-allow" ? /note|customer-1|true/ : /denied/i,
                ),
              ]),
        ],
      };
  }
}
function resultTool(
  name: string,
  args: Record<string, unknown>,
  expected: RegExp,
): ModelEmulatorStep {
  return {
    ...tool(name, args),
    expect: (request: ModelEmulatorRequest) => {
      assert.ok(
        expected.test(
          JSON.stringify(request.messages.findLast((message) => message.role === "tool")?.content),
        ),
      );
    },
  };
}
