import { describe, expect, it } from "vitest";
import { COMPUTER_TOOL_NAMES, computerIntent, toolNeedsComputer } from "./computer-demand.js";

const routingCases = [
  { prompt: "Hi", label: "conversation" },
  { prompt: "What is 2 + 2?", label: "conversation" },
  { prompt: "What is a computer?", label: "uncertain" },
  { prompt: "Explain how web browsers work", label: "conversation" },
  { prompt: "What is my favorite color?", label: "uncertain" },
  { prompt: "Read my Gmail inbox", label: "connected_tools", connectedSources: ["Gmail"] },
  { prompt: "Find my Calendar events", label: "connected_tools", connectedSources: ["Calendar"] },
  { prompt: "Summarize my GitHub issues", label: "connected_tools", connectedSources: ["GitHub"] },
  { prompt: "Search the web for today's news", label: "uncertain" },
  {
    prompt: "Open the browser and click the export button",
    label: "computer_candidate",
    computerTask: true,
  },
  { prompt: "Run this shell command", label: "computer_candidate", computerTask: true },
  {
    prompt: "Read Gmail then fill the website form",
    label: "computer_candidate",
    computerTask: true,
    connectedSources: ["Gmail"],
  },
  { prompt: "Could you take care of that?", label: "uncertain", resumed: true },
  { prompt: "Use the same files", label: "uncertain", resumed: true },
  { prompt: "Explain that browser bug", label: "uncertain" },
  { prompt: "Make it work", label: "uncertain" },
] as const;

describe("server computer demand", () => {
  it.each(routingCases)("retains preparation for $prompt", (fixture) => {
    const input = { trigger: "user", resumed: false, ...fixture };
    expect(computerIntent(input)).toBe(fixture.label);
  });

  it.each([
    "remember",
    "recall_memory",
    "search_history",
    "web_search",
    "secret_request",
    "gmail_read",
    "calendar_list",
    "kith_search_tools",
  ])("%s never demands a computer", (tool) => expect(toolNeedsComputer(tool, true)).toBe(false));
  it.each([...COMPUTER_TOOL_NAMES])("%s demands an available computer only", (tool) => {
    expect(toolNeedsComputer(tool, true)).toBe(true);
    expect(toolNeedsComputer(tool, false)).toBe(false);
  });
  it("keeps image transport independent of workspace materialization", () => {
    const image = {
      kind: "image" as const,
      artifactId: "image",
      name: "image.png",
      mimeType: "image/png",
    };
    expect(
      computerIntent({ trigger: "user", resumed: false, prompt: "Inspect", blocks: [image] }),
    ).toBe("uncertain");
    expect(
      computerIntent({
        trigger: "user",
        resumed: false,
        prompt: "Inspect",
        blocks: [{ ...image, kind: "file", size: 1 }],
      }),
    ).toBe("computer_candidate");
    expect(toolNeedsComputer("recall_memory", true)).toBe(false);
  });
});
