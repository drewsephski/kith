import type { FaqItem } from "./alternatives.js";
import { ALTERNATIVES_HUB, HUB_CARDS } from "./alternatives.js";
import { SITE_URL, WEB_START_URL } from "./site.js";

export const ROUNDUP_TITLE = ALTERNATIVES_HUB.title;
export const ROUNDUP_H1 = ALTERNATIVES_HUB.h1;
export const ROUNDUP_DESCRIPTION = ALTERNATIVES_HUB.description;
export const ROUNDUP_TLDR = [
  ALTERNATIVES_HUB.intro,
  "If you want help preparing your day, start with an assistant that can use the calendar and email you choose to connect. If you want recurring research, look for saved context and schedules. If you want an assistant in work chats, check which messaging services it supports.",
  "These comparisons summarize public product descriptions. They do not rank reliability or promise that every task will succeed. Follow each comparison’s sources for current access and features.",
];
export const ROUNDUP_COLUMNS = ["Typical focus", "Where you talk", "Consider it when"];
export const ROUNDUP_ROWS = [
  {
    product: "Kith",
    href: "/",
    focus: "Daily planning, email, research, and ongoing personal context.",
    where: "The Kith app.",
    consider: "You want one assistant conversation, with optional focused bots.",
  },
  {
    product: "Grok Bot",
    href: "/grok-bot-alternative/",
    focus: "Named bots with computers and routines.",
    where: "Desktop and mobile apps.",
    consider: "You already have or want an eligible Cursor or SuperGrok plan.",
  },
  {
    product: "Meta Muse",
    href: "/muse-alternative/",
    focus: "Everyday tasks and longer-term goals.",
    where: "Muse app or WhatsApp.",
    consider: "You want Meta’s personal assistant and its connected services.",
  },
  {
    product: "OpenAI Dots",
    href: "/dots-alternative/",
    focus: "Ongoing project work across connected apps.",
    where: "ChatGPT and supported work chats.",
    consider: "You work in ChatGPT and have an eligible plan.",
  },
  {
    product: "Instinct",
    href: "/instinct-alternative/",
    focus: "Everyday errands and planning.",
    where: "Text or call.",
    consider: "You prefer reaching an assistant by phone.",
  },
  {
    product: "Hark Pro",
    href: "/hark-alternative/",
    focus: "Personal tasks, Projects, and computer work.",
    where: "Browser and mobile apps.",
    consider: "You want Hark’s Projects, Panels, and Handoff features.",
  },
  {
    product: "OpenClaw",
    href: "/openclaw-alternative/",
    focus: "An assistant connected to messaging services.",
    where: "Chat apps and a browser control panel.",
    consider: "You are comfortable managing a gateway and its settings.",
  },
  {
    product: "Hermes Agent",
    href: "/hermes-alternative/",
    focus: "Tool use, saved skills, and recurring jobs.",
    where: "Desktop app or terminal.",
    consider: "You want to configure an agent’s model and tools.",
  },
];
export const ROUNDUP_CARDS = HUB_CARDS.map((card) => ({
  ...card,
  heading: card.h1,
  paragraphs: [card.summary],
}));
export const ROUNDUP_HOWTO = [
  "Pick one real task. Ask for a brief for tomorrow’s meeting, a summary of an email thread, or three options that fit a budget. Give the assistant the same instructions and sources each time.",
  "Check the result: can you open the sources, tell what is missing, and understand what the assistant actually did? A useful draft should make the next decision easier.",
  "Then try the task again later. Does your assistant remember the preferences you gave it? Can you correct them? Can you review or stop work when you need to?",
];
export const ROUNDUP_FAQ: readonly FaqItem[] = [
  {
    question: "What is the difference between a chatbot and an assistant?",
    answer:
      "A chatbot responds to a question. An assistant can also use permitted tools, keep context, and follow through on a task. The available tools and permissions determine what it can actually do.",
  },
  {
    question: "Do I have to connect my email or calendar?",
    answer:
      "No. Start with questions, writing, or information you share. Connect an account when you want help with its private information.",
  },
  {
    question: "What does Kith remember?",
    answer:
      "Kith can keep preferences and context you want it to use again. You can review, edit, or remove saved memories. Ask it to check current sources for information that may have changed.",
  },
  {
    question: "Which assistant is best?",
    answer:
      "The best fit depends on the work and the way you want to use it. Compare a small task that matters to you, then check access, price, and permissions before committing.",
  },
];
export function roundupStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name: ROUNDUP_TITLE,
        numberOfItems: ROUNDUP_CARDS.length,
        itemListElement: ROUNDUP_CARDS.map((card, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: card.name,
          url: new URL(card.href, SITE_URL).toString(),
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: ROUNDUP_FAQ.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };
}
export function roundupMarkdown(): string {
  return [
    `# ${ROUNDUP_H1}`,
    "",
    ...ROUNDUP_TLDR.flatMap((line) => [line, ""]),
    "## At a glance",
    "",
    `| Product | ${ROUNDUP_COLUMNS.join(" | ")} |`,
    "| --- | --- | --- | --- |",
    ...ROUNDUP_ROWS.map(
      (row) => `| ${row.product} | ${row.focus} | ${row.where} | ${row.consider} |`,
    ),
    "",
    "## The assistants",
    "",
    ...ROUNDUP_CARDS.flatMap((card) => [
      `### ${card.name}`,
      "",
      ...card.paragraphs,
      "",
      `[${card.heading}](${SITE_URL}${card.href})`,
      "",
    ]),
    "## How to choose",
    "",
    ...ROUNDUP_HOWTO.flatMap((line) => [line, ""]),
    "## Common questions",
    "",
    ...ROUNDUP_FAQ.flatMap((item) => [`### ${item.question}`, "", item.answer, ""]),
    `Get help with your first task: [Open Kith](${WEB_START_URL}).`,
    "",
  ].join("\n");
}
