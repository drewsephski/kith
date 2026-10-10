export type ForYouCategory = "tasks" | "routines" | "learn" | "builders";
export type ForYouService = "email" | "calendar" | "github";
export interface ForYouSuggestion {
  id: string;
  group: string;
  category: ForYouCategory;
  title: string;
  description: string;
  prompt: string;
  services?: readonly ForYouService[];
}

/** Starter ideas, not claims about the user's activity or connected accounts. */
export const FOR_YOU_SUGGESTIONS: readonly ForYouSuggestion[] = [
  {
    id: "important-replies",
    services: ["email"],
    group: "Outreach",
    category: "tasks",
    title: "Draft replies that need your attention",
    description: "Find time-sensitive conversations and leave replies as drafts",
    prompt:
      "Review my connected inboxes for important emails from the past seven days that still need a reply. Prioritize time-sensitive requests, draft a response for each, and include links to the original emails. Leave responses as drafts. If no inbox is connected, help me connect one first.",
  },
  {
    id: "follow-ups",
    services: ["email"],
    group: "Outreach",
    category: "tasks",
    title: "Follow up on unanswered conversations",
    description: "Keep promising introductions and partnerships moving",
    prompt:
      "Find conversations in my connected inboxes where I sent an introduction or partnership proposal over seven days ago and have not received a reply. Identify those still worth pursuing and draft a short follow-up for each. Leave them as drafts and include source links.",
  },
  {
    id: "outreach-tracker",
    services: ["email"],
    group: "Outreach",
    category: "routines",
    title: "Set up a daily reply and bounce tracker",
    description: "Build a repeatable check for replies, bounces, and next steps",
    prompt:
      "Help me set up a daily outreach review using my connected inboxes. Track replies, bounced emails, and follow-ups that need attention. Ask me which accounts and time to use, confirm my timezone, and show the routine for approval before scheduling it.",
  },
  {
    id: "pull-requests",
    services: ["github"],
    group: "Developer tools",
    category: "tasks",
    title: "Get pull requests ready to ship",
    description: "Review failed checks, open feedback, and the next fix",
    prompt:
      "Review open pull requests in my connected GitHub repositories. Identify failed checks and unresolved review feedback, then give me a prioritized next-action list with source links. Ask which repositories to use if that is unclear. Do not merge anything.",
  },
  {
    id: "bug-report",
    group: "Developer tools",
    category: "tasks",
    title: "Turn rough notes into a useful bug report",
    description: "Capture reproduction steps, expected behavior, and evidence",
    prompt:
      "Help me turn a bug into a clear report with reproduction steps, expected and actual behavior, environment, and supporting evidence. Start by asking me for the issue and any notes or screenshots. Prepare a draft for me to review before submitting it anywhere.",
  },
  {
    id: "build-digest",
    services: ["github"],
    group: "Developer tools",
    category: "routines",
    title: "Set up a morning digest of failing builds",
    description: "Bring broken checks across your repositories into one review",
    prompt:
      "Help me create a morning digest of failing builds across my connected GitHub repositories. Include the failing check, source link, and suggested next step. Ask which repositories, delivery time, and timezone to use, then show the routine for approval before scheduling it.",
  },
  {
    id: "weekly-plan",
    group: "General",
    category: "tasks",
    title: "Make a plan for the week ahead",
    description: "Turn your priorities and commitments into a manageable week",
    prompt:
      "Help me make a realistic plan for the week ahead. Use available calendar events, unfinished work, and preferences without inventing details. Ask me what matters most this week, then propose priorities and time blocks. Do not change my calendar without approval.",
  },
  {
    id: "meeting-brief",
    services: ["calendar"],
    group: "General",
    category: "tasks",
    title: "Prepare for your next meeting",
    description: "Gather the agenda, useful context, and questions to ask",
    prompt:
      "Find my next meeting in my connected calendar and prepare a brief with its agenda, attendees, relevant context, and questions to ask. Include links to the sources and flag missing details. If no calendar is connected, ask me for the event details.",
  },
  {
    id: "receipts",
    services: ["email"],
    group: "General",
    category: "tasks",
    title: "Collect recent receipts and invoices",
    description: "Organize vendors, dates, amounts, and source links",
    prompt:
      "Find receipts and invoices in my connected inboxes from the past 30 days. Make a table of vendors, dates, amounts, and currencies with source links. Flag missing amounts and possible duplicates. If no inbox is connected, ask me to provide the documents.",
  },
  {
    id: "weekly-review",
    group: "General",
    category: "routines",
    title: "Set up a Sunday evening weekly review",
    description: "Review unfinished work and prepare for the coming week",
    prompt:
      "Help me set up a Sunday evening routine to review unfinished work and prepare for the coming week using the sources I choose. Ask for my preferred time, timezone, and sources. Show me the proposed routine and get approval before scheduling it.",
  },
  {
    id: "job-search",
    group: "General",
    category: "routines",
    title: "Set up a weekly job search review",
    description: "Keep applications, interviews, and follow-ups in view",
    prompt:
      "Help me build a weekly job search review for applications, interviews, and follow-ups. Ask where I track my search and which day, time, and timezone I prefer. Propose a routine for approval before scheduling it.",
  },
  {
    id: "preferences",
    group: "Level up Kith",
    category: "learn",
    title: "Teach Kith how you like to work",
    description: "Share the preferences that make everyday help more useful",
    prompt:
      "Help me teach you how I like to work. Ask a few focused questions about my priorities, communication style, and working hours, one at a time. Summarize what you learned and confirm what I want remembered.",
  },
  {
    id: "memory-review",
    group: "Level up Kith",
    category: "learn",
    title: "Review what Kith remembers about you",
    description: "Correct outdated details and fill in the gaps",
    prompt:
      "Review what you actually remember about me from available memory. Present a concise summary, ask what is outdated or missing, and help me correct or remove it. Do not infer facts that have not been saved.",
  },
  {
    id: "outreach-process",
    group: "Level up Kith",
    category: "learn",
    title: "Teach Kith your outreach process",
    description: "Capture your tone, follow-up timing, and approval preferences",
    prompt:
      "Help me document my outreach process so you can assist consistently. Ask about the audience, tone, follow-up timing, and what requires my approval. Summarize the process and confirm what should be remembered.",
  },
  {
    id: "connections",
    group: "Level up Kith",
    category: "learn",
    title: "Connect the tools you use every day",
    description: "Choose which accounts would make your assistant more helpful",
    prompt:
      "Help me choose which of my everyday tools to connect. Review only connections that actually exist, ask what I want help with, and suggest the smallest useful set of additional connections. Let me complete authorization myself.",
  },
  {
    id: "lead-replies",
    services: ["email"],
    group: "For builders",
    category: "builders",
    title: "Triage replies to cold outreach",
    description: "Separate interested leads, questions, and declines",
    prompt:
      "Review recent cold-outreach replies in my connected inboxes. Group interested leads, questions, declines, and bounces, and suggest a next step for each with source links. Draft responses for review without sending them.",
  },
  {
    id: "partnerships",
    group: "For builders",
    category: "builders",
    title: "Research partners and draft introductions",
    description: "Find relevant collaborators and prepare thoughtful first messages",
    prompt:
      "Help me research potential partners for my product and draft thoughtful introductions. First ask what I am building, who it serves, and what kind of partnership I want. Cite sources for partner research and leave outreach as drafts.",
  },
  {
    id: "launch-review",
    group: "For builders",
    category: "builders",
    title: "Review your launch readiness",
    description: "Find the gaps in onboarding, billing, and support",
    prompt:
      "Help me review my product's launch readiness across onboarding, billing, reliability, accessibility, and support. Ask me for the product and current status, distinguish verified evidence from assumptions, and produce a prioritized checklist. Do not change configuration or activate payments.",
  },
  {
    id: "usage-alerts",
    group: "For builders",
    category: "builders",
    title: "Plan infrastructure and usage alerts",
    description: "Catch quota limits and service failures before they interrupt work",
    prompt:
      "Help me plan infrastructure and usage alerts for the services my product uses. Ask about the stack, existing monitoring, and budget. Propose meaningful thresholds and escalation steps, and flag anything that needs a connection or permission. Do not change live settings without approval.",
  },
];

export interface ForYouConversationAttempt {
  operationId: string;
}

export interface ForYouLaunchScope {
  userId: string;
  spaceId: string;
  assistantId: string;
}

/** Store only an opaque pending identity. All launch content and state stay server-owned. */
export function forYouLaunchStorageKey(scope: ForYouLaunchScope, suggestionId: string): string {
  return `kith.for-you.launch:${JSON.stringify([scope.userId, scope.spaceId, scope.assistantId, suggestionId])}`;
}

export function forYouLaunchAttempt(
  stored: string | null,
  createId: () => string,
): ForYouConversationAttempt {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return { operationId: stored && uuid.test(stored) ? stored : createId() };
}

/** One authoritative operation atomically creates the conversation and its first task. */
export async function startForYouConversation(
  suggestion: ForYouSuggestion,
  scope: ForYouLaunchScope,
  attempt: ForYouConversationAttempt,
  actions: {
    launch: (
      input: ForYouLaunchScope & { suggestionId: string; operationId: string },
    ) => Promise<{ id: string }>;
  },
): Promise<string> {
  const bot = await actions.launch({
    ...scope,
    suggestionId: suggestion.id,
    operationId: attempt.operationId,
  });
  return bot.id;
}
