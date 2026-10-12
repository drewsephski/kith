import type { MessageBlock } from "@rakazo/contracts";

export const COMPUTER_ROUTING_FIXTURES: Array<{
  name: string;
  prompt: string;
  label: "conversation" | "connected_tools" | "computer_candidate" | "uncertain";
  resumed?: boolean;
  connectedSources?: string[];
  computerTask?: boolean;
  blocks?: MessageBlock[];
}> = [
  { name: "greeting", prompt: "Hi", label: "conversation" },
  { name: "arithmetic", prompt: "What is 2 + 2?", label: "conversation" },
  { name: "computer-explanation", prompt: "What is a computer?", label: "conversation" },
  { name: "browser-explanation", prompt: "Explain how web browsers work", label: "conversation" },
  { name: "memory", prompt: "What is my saved favorite color?", label: "conversation" },
  {
    name: "gmail",
    prompt: "Read my Gmail inbox",
    connectedSources: ["Gmail"],
    label: "connected_tools",
  },
  {
    name: "calendar",
    prompt: "Find my Calendar events",
    connectedSources: ["Calendar"],
    label: "connected_tools",
  },
  {
    name: "github",
    prompt: "Summarize my GitHub issues",
    connectedSources: ["GitHub"],
    label: "connected_tools",
  },
  { name: "web-search", prompt: "Search the web for today's weather", label: "connected_tools" },
  { name: "http", prompt: "Fetch this public JSON API", label: "connected_tools" },
  {
    name: "browser-click",
    prompt: "Open the browser and click the export button",
    computerTask: true,
    label: "computer_candidate",
  },
  {
    name: "browser-indirect",
    prompt: "The site has no API. Complete its form for me",
    label: "computer_candidate",
  },
  {
    name: "shell",
    prompt: "Run this shell command on the computer",
    computerTask: true,
    label: "computer_candidate",
  },
  {
    name: "filesystem",
    prompt: "Process the attached PDF with pdftotext",
    label: "computer_candidate",
    blocks: [
      {
        kind: "file",
        size: 16,
        artifactId: "fixture",
        mimeType: "application/pdf",
        name: "fixture.pdf",
      },
    ],
  },
  {
    name: "mixed",
    prompt: "Read Gmail then fill the website form",
    connectedSources: ["Gmail"],
    computerTask: true,
    label: "computer_candidate",
  },
  {
    name: "image-vision",
    prompt: "Describe this image",
    label: "conversation",
    blocks: [{ kind: "image", artifactId: "fixture", mimeType: "image/png", name: "fixture.png" }],
  },
  {
    name: "image-processing",
    prompt: "Convert this image to WebP in the workspace",
    label: "computer_candidate",
    blocks: [{ kind: "image", artifactId: "fixture", mimeType: "image/png", name: "fixture.png" }],
  },
  { name: "followup", prompt: "Could you take care of that?", resumed: true, label: "uncertain" },
  { name: "followup-brief", prompt: "Can you explain that more briefly?", label: "conversation" },
  { name: "ambiguous-file", prompt: "Use the same files", resumed: true, label: "uncertain" },
  { name: "technical-bug", prompt: "Explain that browser bug", label: "uncertain" },
  { name: "ambiguous-action", prompt: "Make it work", label: "uncertain" },
  { name: "quotation", prompt: "Explain the sentence 'run this command'", label: "conversation" },
  { name: "missing-connection", prompt: "Read my email", label: "uncertain" },
];
