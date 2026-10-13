import { GROK_ALTERNATIVE_H1, GROK_ALTERNATIVE_PATH } from "./grok-alternative.js";
import { OPENCLAW_H1 } from "./guide.js";
import { GITHUB_URL, OPENCLAW_ALTERNATIVE_PATH, WEB_START_URL } from "./site.js";

export const COMPARED_ON = "October 12, 2026";
export const GET_STARTED = {
  heading: "Give Kith one thing to take off your list",
  copy: "Start with a meeting to prepare for, an email to find, or a question to research.",
  appLabel: "Get started",
  githubLabel: "View on GitHub",
} as const;

export const KITH_REASONS = [
  "One continuing conversation, with memories you can review, edit, or remove.",
  "Email and Calendar connections when a task needs them.",
  "Sources and task history you can check, with approval when an action requires it.",
];

export type ComparisonRow = { topic: string; kith: string; other: string };
export type FaqItem = { question: string; answer: string };
export type SourceLink = { label: string; href: string };
export type AlternativeSection = { heading: string; paragraphs: readonly string[] };
export type Alternative = {
  slug: string;
  name: string;
  summary: string;
  title: string;
  description: string;
  h1: string;
  otherName: string;
  intro: readonly string[];
  sections?: readonly AlternativeSection[];
  rows: readonly ComparisonRow[];
  faq: readonly FaqItem[];
  sources: readonly SourceLink[];
};

export const ALTERNATIVES_HUB = {
  title: "Find an AI assistant that fits your day – Kith",
  description:
    "Compare personal AI assistants by the tasks you need help with, where you talk to them, and how you stay in control.",
  h1: "Find an AI assistant that fits your day",
  intro:
    "Start with the job you want help with. A useful assistant should understand the task, show its sources, and make it clear when it needs you.",
} as const;

export const ALTERNATIVES: readonly Alternative[] = [
  {
    slug: "muse-alternative",
    name: "Muse",
    summary:
      "Consider Muse if you want Meta’s assistant in WhatsApp or the Muse app. Check its current availability and account permissions.",
    title: "Kith vs Muse: choosing an AI assistant",
    description:
      "Compare Kith and Muse by everyday tasks, ongoing context, and the controls you use.",
    h1: "Kith vs Muse",
    otherName: "Muse",
    intro: [
      "Meta describes Muse as a personal assistant for everyday tasks in its app and WhatsApp. It remembers context and can work across connected apps.",
      "Kith starts with a conversation that stays with you. Ask for help with a real task, connect only the accounts it needs, and return to the results in the same chat.",
    ],
    sections: [
      {
        heading: "Try an everyday task",
        paragraphs: [
          "“Find the email about my next meeting, summarize what I need to know, and draft three questions to ask.”",
          "With email or Calendar connected, Kith can check the information you permit it to use. If a source is missing or access fails, ask what it could verify before relying on the result.",
        ],
      },
      {
        heading: "When to consider Muse",
        paragraphs: [
          "Consider Muse if you want Meta’s assistant in WhatsApp or the Muse app. Check its current availability and account permissions.",
        ],
      },
    ],
    rows: [
      {
        topic: "Where you talk",
        kith: "The Kith app on web, desktop, and mobile.",
        other: "The Muse app or WhatsApp.",
      },
      {
        topic: "Everyday help",
        kith: "Prepare for meetings, find email, compare options, and draft follow-ups.",
        other: "Meta describes help with travel, email, and longer-term goals.",
      },
      {
        topic: "What carries over",
        kith: "Your conversation, preferences, saved memories, and scheduled routines.",
        other: "Meta says Muse keeps working after you close the app.",
      },
      {
        topic: "Your control",
        kith: "Review sources, set permissions, and approve actions when required.",
        other:
          "Meta says it asks before sensitive actions, including sending email or making a purchase.",
      },
    ],
    faq: [
      {
        question: "Can I move my Muse history into Kith?",
        answer:
          "Kith does not automatically import your Muse conversations or settings. Start by sharing the context you want Kith to remember, then connect the accounts you choose.",
      },
      {
        question: "Do I need technical experience?",
        answer:
          "Start in the Kith app and describe what you need in ordinary language. Account connections and additional bots are optional.",
      },
      {
        question: "What should I compare before choosing?",
        answer:
          "Try the same small task in each app. Check whether the answer uses current sources, how it handles missing information, and which actions need your permission.",
      },
    ],
    sources: [
      {
        label: "Meta, Introducing Muse (September 8, 2026)",
        href: "https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/",
      },
    ],
  },
  {
    slug: "dots-alternative",
    name: "Dots",
    summary:
      "Consider Dots if your work already lives in ChatGPT and your plan includes access. Check eligible plans and markets before choosing.",
    title: "Kith vs Dots: choosing an AI assistant",
    description:
      "Compare Kith and Dots by everyday tasks, ongoing context, and the controls you use.",
    h1: "Kith vs Dots",
    otherName: "Dots",
    intro: [
      "OpenAI describes Dots as assistants that learn your preferences, use connected apps, and continue working toward your goals. You reach them through ChatGPT and supported work chats.",
      "Kith starts with a conversation that stays with you. Ask for help with a real task, connect only the accounts it needs, and return to the results in the same chat.",
    ],
    sections: [
      {
        heading: "Try an everyday task",
        paragraphs: [
          "“Find the email about my next meeting, summarize what I need to know, and draft three questions to ask.”",
          "With email or Calendar connected, Kith can check the information you permit it to use. If a source is missing or access fails, ask what it could verify before relying on the result.",
        ],
      },
      {
        heading: "When to consider Dots",
        paragraphs: [
          "Consider Dots if your work already lives in ChatGPT and your plan includes access. Check eligible plans and markets before choosing.",
        ],
      },
    ],
    rows: [
      {
        topic: "Where you talk",
        kith: "The Kith app on web, desktop, and mobile.",
        other: "ChatGPT, Slack, or Teams, according to OpenAI.",
      },
      {
        topic: "Everyday help",
        kith: "Prepare for meetings, find email, compare options, and draft follow-ups.",
        other: "OpenAI describes research, project work, and follow-up across connected apps.",
      },
      {
        topic: "What carries over",
        kith: "Your conversation, preferences, saved memories, and scheduled routines.",
        other: "Dots can work in the background and learn from feedback.",
      },
      {
        topic: "Your control",
        kith: "Review sources, set permissions, and approve actions when required.",
        other:
          "Built-in rules and custom rules govern actions; some sensitive steps stay with you.",
      },
    ],
    faq: [
      {
        question: "Can I move my Dots history into Kith?",
        answer:
          "Kith does not automatically import your Dots conversations or settings. Start by sharing the context you want Kith to remember, then connect the accounts you choose.",
      },
      {
        question: "Do I need technical experience?",
        answer:
          "Start in the Kith app and describe what you need in ordinary language. Account connections and additional bots are optional.",
      },
      {
        question: "What should I compare before choosing?",
        answer:
          "Try the same small task in each app. Check whether the answer uses current sources, how it handles missing information, and which actions need your permission.",
      },
    ],
    sources: [
      {
        label: "OpenAI, Introducing dots (September 29, 2026)",
        href: "https://openai.com/index/introducing-dots/",
      },
    ],
  },
  {
    slug: "instinct-alternative",
    name: "Instinct",
    summary:
      "Consider Instinct if texting or calling is the way you want to reach an assistant. Check which tasks and services it currently supports.",
    title: "Kith vs Instinct: choosing an AI assistant",
    description:
      "Compare Kith and Instinct by everyday tasks, ongoing context, and the controls you use.",
    h1: "Kith vs Instinct",
    otherName: "Instinct",
    intro: [
      "Instinct presents its assistant as someone you can text or call for everyday tasks. Its examples include errands, scheduling, and trip planning.",
      "Kith starts with a conversation that stays with you. Ask for help with a real task, connect only the accounts it needs, and return to the results in the same chat.",
    ],
    sections: [
      {
        heading: "Try an everyday task",
        paragraphs: [
          "“Find the email about my next meeting, summarize what I need to know, and draft three questions to ask.”",
          "With email or Calendar connected, Kith can check the information you permit it to use. If a source is missing or access fails, ask what it could verify before relying on the result.",
        ],
      },
      {
        heading: "When to consider Instinct",
        paragraphs: [
          "Consider Instinct if texting or calling is the way you want to reach an assistant. Check which tasks and services it currently supports.",
        ],
      },
    ],
    rows: [
      {
        topic: "Where you talk",
        kith: "The Kith app on web, desktop, and mobile.",
        other: "Text or call the assistant.",
      },
      {
        topic: "Everyday help",
        kith: "Prepare for meetings, find email, compare options, and draft follow-ups.",
        other: "Its site gives examples such as errands, appointments, and trip planning.",
      },
      {
        topic: "What carries over",
        kith: "Your conversation, preferences, saved memories, and scheduled routines.",
        other: "The assistant works from the task and permissions you give it.",
      },
      {
        topic: "Your control",
        kith: "Review sources, set permissions, and approve actions when required.",
        other:
          "Review the current terms and permissions before allowing purchases or account changes.",
      },
    ],
    faq: [
      {
        question: "Can I move my Instinct history into Kith?",
        answer:
          "Kith does not automatically import your Instinct conversations or settings. Start by sharing the context you want Kith to remember, then connect the accounts you choose.",
      },
      {
        question: "Do I need technical experience?",
        answer:
          "Start in the Kith app and describe what you need in ordinary language. Account connections and additional bots are optional.",
      },
      {
        question: "What should I compare before choosing?",
        answer:
          "Try the same small task in each app. Check whether the answer uses current sources, how it handles missing information, and which actions need your permission.",
      },
    ],
    sources: [
      {
        label: "Instinct homepage",
        href: "https://instinct.com/",
      },
    ],
  },
  {
    slug: "hermes-alternative",
    name: "Hermes Agent",
    summary:
      "Consider Hermes if you want a desktop or terminal agent and are comfortable managing its model and tools. Connecting messaging apps adds setup.",
    title: "Kith vs Hermes Agent: choosing an AI assistant",
    description:
      "Compare Kith and Hermes Agent by everyday tasks, ongoing context, and the controls you use.",
    h1: "Kith vs Hermes Agent",
    otherName: "Hermes Agent",
    intro: [
      "Hermes Agent, from Nous Research, offers a desktop app and a command-line interface. It keeps memory and skills, and can run scheduled work.",
      "Kith starts with a conversation that stays with you. Ask for help with a real task, connect only the accounts it needs, and return to the results in the same chat.",
    ],
    sections: [
      {
        heading: "Try an everyday task",
        paragraphs: [
          "“Find the email about my next meeting, summarize what I need to know, and draft three questions to ask.”",
          "With email or Calendar connected, Kith can check the information you permit it to use. If a source is missing or access fails, ask what it could verify before relying on the result.",
        ],
      },
      {
        heading: "When to consider Hermes Agent",
        paragraphs: [
          "Consider Hermes if you want a desktop or terminal agent and are comfortable managing its model and tools. Connecting messaging apps adds setup.",
        ],
      },
    ],
    rows: [
      {
        topic: "Where you talk",
        kith: "The Kith app on web, desktop, and mobile.",
        other: "A desktop app or a terminal; chat services use a separate gateway.",
      },
      {
        topic: "Everyday help",
        kith: "Prepare for meetings, find email, compare options, and draft follow-ups.",
        other: "Its documentation describes research, tool use, saved skills, and scheduled jobs.",
      },
      {
        topic: "What carries over",
        kith: "Your conversation, preferences, saved memories, and scheduled routines.",
        other: "Memory, sessions, and reusable skills carry work forward.",
      },
      {
        topic: "Your control",
        kith: "Review sources, set permissions, and approve actions when required.",
        other: "Its security settings govern tool access and command approvals.",
      },
    ],
    faq: [
      {
        question: "Can I move my Hermes Agent history into Kith?",
        answer:
          "Kith does not automatically import your Hermes Agent conversations or settings. Start by sharing the context you want Kith to remember, then connect the accounts you choose.",
      },
      {
        question: "Do I need technical experience?",
        answer:
          "Start in the Kith app and describe what you need in ordinary language. Account connections and additional bots are optional.",
      },
      {
        question: "What should I compare before choosing?",
        answer:
          "Try the same small task in each app. Check whether the answer uses current sources, how it handles missing information, and which actions need your permission.",
      },
    ],
    sources: [
      {
        label: "Hermes Agent security",
        href: "https://hermes-agent.nousresearch.com/docs/user-guide/security",
      },
    ],
  },
  {
    slug: "hark-alternative",
    name: "Hark Pro",
    summary:
      "Consider Hark if you want its Projects, Panels, and Handoff features in one app. Review its current plans and connected-account permissions.",
    title: "Kith vs Hark Pro: choosing an AI assistant",
    description:
      "Compare Kith and Hark Pro by everyday tasks, ongoing context, and the controls you use.",
    h1: "Kith vs Hark Pro",
    otherName: "Hark Pro",
    intro: [
      "Hark Pro offers an ongoing conversation for everyday work, with Projects for bigger tasks. Its Handoff agent uses a computer to work on websites.",
      "Kith starts with a conversation that stays with you. Ask for help with a real task, connect only the accounts it needs, and return to the results in the same chat.",
    ],
    sections: [
      {
        heading: "Try an everyday task",
        paragraphs: [
          "“Find the email about my next meeting, summarize what I need to know, and draft three questions to ask.”",
          "With email or Calendar connected, Kith can check the information you permit it to use. If a source is missing or access fails, ask what it could verify before relying on the result.",
        ],
      },
      {
        heading: "When to consider Hark Pro",
        paragraphs: [
          "Consider Hark if you want its Projects, Panels, and Handoff features in one app. Review its current plans and connected-account permissions.",
        ],
      },
    ],
    rows: [
      {
        topic: "Where you talk",
        kith: "The Kith app on web, desktop, and mobile.",
        other: "Browser, iOS, and Android apps.",
      },
      {
        topic: "Everyday help",
        kith: "Prepare for meetings, find email, compare options, and draft follow-ups.",
        other: "Its site describes email, research, expenses, and trip planning.",
      },
      {
        topic: "What carries over",
        kith: "Your conversation, preferences, saved memories, and scheduled routines.",
        other: "Projects, memory, and suggested Action Buttons organize ongoing work.",
      },
      {
        topic: "Your control",
        kith: "Review sources, set permissions, and approve actions when required.",
        other: "Hark says it checks in before actions that require approval.",
      },
    ],
    faq: [
      {
        question: "Can I move my Hark Pro history into Kith?",
        answer:
          "Kith does not automatically import your Hark Pro conversations or settings. Start by sharing the context you want Kith to remember, then connect the accounts you choose.",
      },
      {
        question: "Do I need technical experience?",
        answer:
          "Start in the Kith app and describe what you need in ordinary language. Account connections and additional bots are optional.",
      },
      {
        question: "What should I compare before choosing?",
        answer:
          "Try the same small task in each app. Check whether the answer uses current sources, how it handles missing information, and which actions need your permission.",
      },
    ],
    sources: [
      {
        label: "Hark homepage",
        href: "https://hark.com/",
      },
      {
        label: "Hark security",
        href: "https://hark.com/security",
      },
    ],
  },
];

export function alternativePath(page: Pick<Alternative, "slug">): string {
  return `/${page.slug}/`;
}

export type HubCard = { href: string; name: string; h1: string; summary: string };
export const HUB_CARDS: readonly HubCard[] = [
  {
    href: GROK_ALTERNATIVE_PATH,
    name: "Grok Bot",
    h1: GROK_ALTERNATIVE_H1,
    summary: "Named bots, ongoing work, and computer use.",
  },
  {
    href: OPENCLAW_ALTERNATIVE_PATH,
    name: "OpenClaw",
    h1: OPENCLAW_H1,
    summary: "An assistant reached through the chat apps you use.",
  },
  ...ALTERNATIVES.map((page) => ({
    href: alternativePath(page),
    name: page.name,
    h1: page.h1,
    summary: page.summary,
  })),
];

export function faqPageSchema(faq: readonly FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}
function cell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
export function alternativeMarkdown(page: Alternative): string {
  return [
    `# ${page.h1}`,
    "",
    ...page.intro.flatMap((paragraph) => [paragraph, ""]),
    ...(page.sections ?? []).flatMap((section) => [
      `## ${section.heading}`,
      "",
      ...section.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ]),
    `Public descriptions checked ${COMPARED_ON}. This is a guide, not a performance ranking.`,
    "",
    "## At a glance",
    "",
    `| Topic | Kith | ${page.otherName} |`,
    "| --- | --- | --- |",
    ...page.rows.map((row) => `| ${cell(row.topic)} | ${cell(row.kith)} | ${cell(row.other)} |`),
    "",
    "## What stays with you in Kith",
    "",
    ...KITH_REASONS.map((reason) => `- ${reason}`),
    "",
    "## Common questions",
    "",
    ...page.faq.flatMap((item) => [`### ${item.question}`, "", item.answer, ""]),
    "## Sources",
    "",
    ...page.sources.map((source) => `- [${source.label}](${source.href})`),
    "",
    `## ${GET_STARTED.heading}`,
    "",
    GET_STARTED.copy,
    "",
    `[Get started](${WEB_START_URL})`,
    "",
    `[Source code](${GITHUB_URL})`,
    "",
  ].join("\n");
}
