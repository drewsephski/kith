import type { Alternative } from "./alternatives.js";

export type { FaqItem } from "./alternatives.js";

export const OPENCLAW_H1 = "Kith vs OpenClaw";
export const OPENCLAW_PAGE: Alternative = {
  slug: "openclaw-alternative",
  name: "OpenClaw",
  otherName: "OpenClaw",
  summary: "Choose between the Kith app and an assistant in your chat services.",
  title: "Kith vs OpenClaw: which fits your day?",
  description:
    "Compare Kith and OpenClaw by where you chat, the everyday tasks you delegate, and the setup you manage.",
  h1: "Kith vs OpenClaw",
  intro: [
    "OpenClaw connects an assistant to messaging services through a gateway: software that keeps those connections running. Kith brings your assistant and ongoing conversations into the Kith app.",
    "Choose the place you want to return to. Kith is for working with your assistant in one app; OpenClaw may fit if you want it in existing chat services and are comfortable managing the setup.",
  ],
  sections: [
    {
      heading: "Keep your day in one conversation",
      paragraphs: [
        "In Kith, try: “Check tomorrow’s calendar, find any related email, and help me decide what to prepare first.”",
        "Your conversation and memories carry the context forward. Add a focused bot or a scheduled routine when a task becomes something you want help with regularly.",
      ],
    },
    {
      heading: "Choose the setup you want to manage",
      paragraphs: [
        "Kith starts in the app. Connect accounts only when you need them.",
        "OpenClaw’s documentation describes installing its gateway, selecting a model, and connecting messaging services. Those settings give you flexibility, but you also maintain them.",
      ],
    },
  ],
  rows: [
    {
      topic: "Where you talk",
      kith: "The Kith app on web, desktop, and mobile.",
      other: "Connected chat services and a browser control panel.",
    },
    {
      topic: "Getting started",
      kith: "Open the app, sign in, and give your assistant a task.",
      other: "Install and configure a gateway, then connect the channels you want.",
    },
    {
      topic: "Recurring work",
      kith: "Describe a routine and schedule it with your bot.",
      other: "Memory, skills, and scheduled jobs are documented features.",
    },
    {
      topic: "Control",
      kith: "Review memories, sources, task history, and approval requests in the app.",
      other: "Configure tool access, permissions, and optional isolation in its settings.",
    },
  ],
  faq: [
    {
      question: "Can I transfer my OpenClaw setup into Kith?",
      answer:
        "Kith does not automatically import OpenClaw settings, skills, or conversations. Share the context you want your assistant to remember and connect accounts in Kith.",
    },
    {
      question: "Which should I try first?",
      answer:
        "Try Kith if you want a dedicated assistant app. Consider OpenClaw if reaching an assistant in your existing chat services matters more and you are comfortable maintaining its setup.",
    },
    {
      question: "How should I compare results?",
      answer:
        "Give each assistant the same small task. Check the source links, whether it identifies missing information, and how it asks for permission.",
    },
  ],
  sources: [
    {
      label: "OpenClaw overview",
      href: "https://docs.openclaw.ai/",
    },
    {
      label: "OpenClaw getting started",
      href: "https://docs.openclaw.ai/start/getting-started",
    },
  ],
};
