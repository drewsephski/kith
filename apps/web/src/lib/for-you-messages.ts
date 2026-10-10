import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

/** Keep shared catalog copy statically extractable and its IDs stable across builds. */
export const FOR_YOU_MESSAGES: Readonly<Record<string, MessageDescriptor>> = {
  Outreach: msg({ id: "Outreach", message: "Outreach" }),
  "Draft replies that need your attention": msg({
    id: "Draft replies that need your attention",
    message: "Draft replies that need your attention",
  }),
  "Find time-sensitive conversations and leave replies as drafts": msg({
    id: "Find time-sensitive conversations and leave replies as drafts",
    message: "Find time-sensitive conversations and leave replies as drafts",
  }),
  "Follow up on unanswered conversations": msg({
    id: "Follow up on unanswered conversations",
    message: "Follow up on unanswered conversations",
  }),
  "Keep promising introductions and partnerships moving": msg({
    id: "Keep promising introductions and partnerships moving",
    message: "Keep promising introductions and partnerships moving",
  }),
  "Set up a daily reply and bounce tracker": msg({
    id: "Set up a daily reply and bounce tracker",
    message: "Set up a daily reply and bounce tracker",
  }),
  "Build a repeatable check for replies, bounces, and next steps": msg({
    id: "Build a repeatable check for replies, bounces, and next steps",
    message: "Build a repeatable check for replies, bounces, and next steps",
  }),
  "Developer tools": msg({ id: "Developer tools", message: "Developer tools" }),
  "Get pull requests ready to ship": msg({
    id: "Get pull requests ready to ship",
    message: "Get pull requests ready to ship",
  }),
  "Review failed checks, open feedback, and the next fix": msg({
    id: "Review failed checks, open feedback, and the next fix",
    message: "Review failed checks, open feedback, and the next fix",
  }),
  "Turn rough notes into a useful bug report": msg({
    id: "Turn rough notes into a useful bug report",
    message: "Turn rough notes into a useful bug report",
  }),
  "Capture reproduction steps, expected behavior, and evidence": msg({
    id: "Capture reproduction steps, expected behavior, and evidence",
    message: "Capture reproduction steps, expected behavior, and evidence",
  }),
  "Set up a morning digest of failing builds": msg({
    id: "Set up a morning digest of failing builds",
    message: "Set up a morning digest of failing builds",
  }),
  "Bring broken checks across your repositories into one review": msg({
    id: "Bring broken checks across your repositories into one review",
    message: "Bring broken checks across your repositories into one review",
  }),
  General: msg({ id: "General", message: "General" }),
  "Make a plan for the week ahead": msg({
    id: "Make a plan for the week ahead",
    message: "Make a plan for the week ahead",
  }),
  "Turn your priorities and commitments into a manageable week": msg({
    id: "Turn your priorities and commitments into a manageable week",
    message: "Turn your priorities and commitments into a manageable week",
  }),
  "Prepare for your next meeting": msg({
    id: "Prepare for your next meeting",
    message: "Prepare for your next meeting",
  }),
  "Gather the agenda, useful context, and questions to ask": msg({
    id: "Gather the agenda, useful context, and questions to ask",
    message: "Gather the agenda, useful context, and questions to ask",
  }),
  "Collect recent receipts and invoices": msg({
    id: "Collect recent receipts and invoices",
    message: "Collect recent receipts and invoices",
  }),
  "Organize vendors, dates, amounts, and source links": msg({
    id: "Organize vendors, dates, amounts, and source links",
    message: "Organize vendors, dates, amounts, and source links",
  }),
  "Set up a Sunday evening weekly review": msg({
    id: "Set up a Sunday evening weekly review",
    message: "Set up a Sunday evening weekly review",
  }),
  "Review unfinished work and prepare for the coming week": msg({
    id: "Review unfinished work and prepare for the coming week",
    message: "Review unfinished work and prepare for the coming week",
  }),
  "Set up a weekly job search review": msg({
    id: "Set up a weekly job search review",
    message: "Set up a weekly job search review",
  }),
  "Keep applications, interviews, and follow-ups in view": msg({
    id: "Keep applications, interviews, and follow-ups in view",
    message: "Keep applications, interviews, and follow-ups in view",
  }),
  "Level up Kith": msg({ id: "Level up Kith", message: "Level up Kith" }),
  "Teach Kith how you like to work": msg({
    id: "Teach Kith how you like to work",
    message: "Teach Kith how you like to work",
  }),
  "Share the preferences that make everyday help more useful": msg({
    id: "Share the preferences that make everyday help more useful",
    message: "Share the preferences that make everyday help more useful",
  }),
  "Review what Kith remembers about you": msg({
    id: "Review what Kith remembers about you",
    message: "Review what Kith remembers about you",
  }),
  "Correct outdated details and fill in the gaps": msg({
    id: "Correct outdated details and fill in the gaps",
    message: "Correct outdated details and fill in the gaps",
  }),
  "Teach Kith your outreach process": msg({
    id: "Teach Kith your outreach process",
    message: "Teach Kith your outreach process",
  }),
  "Capture your tone, follow-up timing, and approval preferences": msg({
    id: "Capture your tone, follow-up timing, and approval preferences",
    message: "Capture your tone, follow-up timing, and approval preferences",
  }),
  "Connect the tools you use every day": msg({
    id: "Connect the tools you use every day",
    message: "Connect the tools you use every day",
  }),
  "Choose which accounts would make your assistant more helpful": msg({
    id: "Choose which accounts would make your assistant more helpful",
    message: "Choose which accounts would make your assistant more helpful",
  }),
  "For builders": msg({ id: "For builders", message: "For builders" }),
  "Triage replies to cold outreach": msg({
    id: "Triage replies to cold outreach",
    message: "Triage replies to cold outreach",
  }),
  "Separate interested leads, questions, and declines": msg({
    id: "Separate interested leads, questions, and declines",
    message: "Separate interested leads, questions, and declines",
  }),
  "Research partners and draft introductions": msg({
    id: "Research partners and draft introductions",
    message: "Research partners and draft introductions",
  }),
  "Find relevant collaborators and prepare thoughtful first messages": msg({
    id: "Find relevant collaborators and prepare thoughtful first messages",
    message: "Find relevant collaborators and prepare thoughtful first messages",
  }),
  "Review your launch readiness": msg({
    id: "Review your launch readiness",
    message: "Review your launch readiness",
  }),
  "Find the gaps in onboarding, billing, and support": msg({
    id: "Find the gaps in onboarding, billing, and support",
    message: "Find the gaps in onboarding, billing, and support",
  }),
  "Plan infrastructure and usage alerts": msg({
    id: "Plan infrastructure and usage alerts",
    message: "Plan infrastructure and usage alerts",
  }),
  "Catch quota limits and service failures before they interrupt work": msg({
    id: "Catch quota limits and service failures before they interrupt work",
    message: "Catch quota limits and service failures before they interrupt work",
  }),
};

export function translateForYouMessage(i18n: I18n, message: string): string {
  const descriptor = FOR_YOU_MESSAGES[message];
  return descriptor ? i18n._(descriptor) : message;
}
