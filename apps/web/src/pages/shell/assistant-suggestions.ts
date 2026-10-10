import { useLingui } from "@lingui/react/macro";
import { connectedAppServices, taskStarterApp } from "@rakazo/core";
import { useEffect, useState } from "react";
import { rpc, selectedSpaceId } from "../../lib/rpc";

export function useConnectedApps(scopeKey?: string) {
  const [state, setState] = useState<{ scope?: string; spaceId?: string | null; apps: string[] }>({
    apps: [],
  });
  useEffect(() => {
    let alive = true;
    let generation = 0;
    let pending = false;
    if (!scopeKey) return;
    const spaceId = selectedSpaceId();
    async function load() {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      const request = ++generation;
      const [connections, catalog] = await Promise.allSettled([
        rpc.connections.list(undefined, { context: { spaceId } }),
        rpc.connections.catalog({}, { context: { spaceId } }),
      ]);
      pending = false;
      if (!alive || request !== generation || selectedSpaceId() !== spaceId) return;
      const services = connectedAppServices(
        connections.status === "fulfilled" ? connections.value : [],
        catalog.status === "fulfilled" ? catalog.value : [],
      );
      setState({
        scope: scopeKey,
        spaceId,
        apps: services.map(
          ({ slug }) => taskStarterApp(slug) ?? slug.toLowerCase().replace(/[^a-z0-9]/g, ""),
        ),
      });
    }
    const refresh = () => void load();
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive = false;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [scopeKey]);
  return state.scope === scopeKey && state.spaceId === selectedSpaceId() ? state.apps : [];
}

export function useAssistantSuggestions(botId?: string, connectedApps?: string[]) {
  const { t } = useLingui();
  const discoveredApps = useConnectedApps(connectedApps === undefined ? botId : undefined);
  const apps = connectedApps ?? discoveredApps;
  return [
    {
      title: t`Draft important replies`,
      prompt: t`Go through my inbox from the past seven days, find important emails that still need a reply, and create a draft response for each. Prioritize time-sensitive requests and include links to the original emails. Leave the responses as drafts.`,
      available: apps.includes("gmail"),
    },
    {
      title: t`Prepare my next meeting`,
      prompt: t`Find my next calendar meeting, review its description and attendees, and prepare a brief with the agenda, questions to ask, and any missing details. Include a link to the event.`,
      available: apps.includes("calendar"),
    },
    {
      title: t`Triage pull requests`,
      prompt: t`Review my open GitHub pull requests, identify failed checks and unresolved reviews, and make a prioritized list of the next action for each with links.`,
      available: apps.includes("github"),
    },
    {
      title: t`Summarize team updates`,
      prompt: t`Review Slack messages from the past 24 hours and summarize decisions, blockers, and follow-ups that need my attention. Include links to the relevant messages.`,
      available: apps.includes("slack"),
    },
    {
      title: t`Draft lead follow-ups`,
      prompt: t`Find HubSpot leads with no follow-up in the past seven days, prioritize them by deal stage, and draft a personalized follow-up for each using their activity history.`,
      available: apps.includes("hubspot"),
    },
    {
      title: t`Create a weekly report`,
      prompt: t`Pull last week's GA4 sessions, active users, and page views into a new Google Sheet, compare them with the previous week, and add a short summary of the biggest changes.`,
      available: apps.includes("analytics") && apps.includes("sheets"),
    },
    {
      title: t`Find overdue tasks`,
      prompt: t`Review my Notion task pages, find overdue and unfinished tasks assigned to me, and list them by urgency with their due dates and page links.`,
      available: apps.includes("notion"),
    },
    {
      title: t`Follow up unanswered emails`,
      prompt: t`Find emails I sent over seven days ago that have not received a reply and draft a short follow-up for each conversation that still needs a response. Leave them as drafts and include links to the conversations.`,
      available: apps.includes("gmail"),
    },
    {
      title: t`Collect recent receipts`,
      prompt: t`Find receipts and invoices in my inbox from the past 30 days. Make a table of vendors, dates, amounts, and currencies, with links to the source emails, and flag any missing amounts or duplicate charges.`,
      available: apps.includes("gmail"),
    },
  ].filter((suggestion) => suggestion.available);
}
