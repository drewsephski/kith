import type { Alternative } from "./alternatives.js";

export const GROK_ALTERNATIVE_PATH = "/grok-bot-alternative/";
export const GROK_ALTERNATIVE_H1 = "Kith vs Grok Bot";
export const GROK_PAGE: Alternative = {
  slug: "grok-bot-alternative",
  name: "Grok Bot",
  otherName: "Grok Bot",
  summary: "Compare ongoing assistants by everyday work and the controls you use.",
  title: "Kith vs Grok Bot: choosing an AI assistant",
  description:
    "Compare Kith and Grok Bot for meeting preparation, research, ongoing tasks, and approvals.",
  h1: "Kith vs Grok Bot",
  intro: [
    "Grok Bot is xAI’s app for named assistants that keep context and use a computer. Kith also gives you ongoing conversations, with a personal assistant you can return to each day.",
    "The useful question is what you want help with: preparing for a meeting, finding an answer across your email, or keeping a recurring task moving.",
  ],
  sections: [
    {
      heading: "Get ready for your next meeting",
      paragraphs: [
        "Try this in Kith: “Find my next meeting, review the agenda and relevant email, and give me a short brief with questions to ask.”",
        "Connect Calendar and email when you want Kith to check them. It can show the sources it found and flag missing details. The result stays in your conversation.",
      ],
    },
    {
      heading: "Give a bot a specific job",
      paragraphs: [
        "Keep Kith as your everyday assistant, or add a bot for a focused job such as weekly research. Describe what a useful result looks like and when you want it.",
        "For example: “Every Friday, compare three new tools relevant to my project. Give me a short summary with links. Don’t sign up for anything.”",
      ],
    },
  ],
  rows: [
    {
      topic: "Where you talk",
      kith: "The Kith app on web, desktop, and mobile.",
      other: "Desktop and mobile apps, with the same bots across devices.",
    },
    {
      topic: "Ongoing context",
      kith: "A continuing conversation, saved memories, and routines.",
      other: "Named bots with memory, files, and routines.",
    },
    {
      topic: "Connected work",
      kith: "Use connected accounts or an available computer when a task needs them.",
      other: "Connectors and a persistent cloud computer.",
    },
    {
      topic: "Reviewing actions",
      kith: "Follow task history and sources. Approval checks apply to actions that need permission.",
      other: "Approvals and account rules govern sensitive actions.",
    },
    {
      topic: "Getting access",
      kith: "Open Kith and sign in. Desktop downloads appear when published.",
      other: "Access depends on an eligible Cursor or linked SuperGrok plan.",
    },
  ],
  faq: [
    {
      question: "Is Kith the same product as Grok Bot?",
      answer:
        "No. They are separate apps with separate accounts and settings. Kith does not import Grok Bot history or subscriptions.",
    },
    {
      question: "What is a good first task?",
      answer:
        "Choose a task with a clear result: a meeting brief, an email summary, or a comparison of three options. Say which sources to use and what needs your approval.",
    },
    {
      question: "Does Kith need access to all my accounts?",
      answer:
        "No. Start with a conversation. Connect an account only when you want help with its information, and disconnect it from Integrations when you no longer need it.",
    },
  ],
  sources: [
    {
      label: "Grok Bot overview",
      href: "https://docs.x.ai/grok-bot/overview",
    },
    {
      label: "Grok Bot questions and approvals",
      href: "https://docs.x.ai/grok-bot/faq",
    },
  ],
};
