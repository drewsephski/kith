import type { MessageBlock } from "@rakazo/contracts";

/** Echo accepted input without a model call or a claim that execution has started. */
export function taskAcknowledgmentBlocks(blocks: readonly MessageBlock[]): MessageBlock[] {
  const text = blocks
    .filter((block) => block.kind === "text")
    .map((block) => block.text)
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
  const characters = Array.from(text);
  const snippet = characters.slice(0, 160).join("") + (characters.length > 160 ? "…" : "");
  // Render the quoted request as text, never as links, images, or HTML.
  const escaped = snippet.replace(/[\\`*_{}[\]()<>!#|~]/gu, "\\$&");
  return [
    {
      kind: "progress",
      acknowledgment: true,
      text: escaped
        ? `Got it — I’ll look into your request:\n\n> ${escaped}`
        : "Got it — I’ll look at your attachments.",
    },
  ];
}
