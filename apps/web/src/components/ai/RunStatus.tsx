import { useLingui } from "@lingui/react/macro";
import type { ThreadMessage } from "@rakazo/contracts";
import { hasRunResponseText, runActivityText } from "@rakazo/core";
import type { GroupAvatarMember } from "@rakazo/ui-web";
import { ActiveBotGlyph } from "./CollaborationMarker";

type StatusRun = { id: string; status: string };

/** Run authority determines whether work is over; streamed prose never does. */
export function RunStatus({
  bots,
  messages,
  latestRun,
  assistantId,
}: {
  bots: (GroupAvatarMember & { runId: string })[];
  messages: ThreadMessage[];
  latestRun?: StatusRun | null;
  assistantId?: string | null;
}) {
  const { t } = useLingui();
  const active = bots.filter((bot) => ["queued", "leased", "running"].includes(bot.status ?? ""));
  if (active.length > 0) {
    return (
      <div data-testid="run-status" className="flex flex-col gap-1">
        {active.map((bot) => {
          const activity =
            runActivityText(messages, bot.runId) ??
            (bot.status === "queued" || bot.status === "leased" ? t`Starting…` : t`Working…`);
          const name = bot.name ?? t`Bot`;
          return (
            <ActiveBotGlyph
              key={bot.runId}
              bots={[bot]}
              label={active.length > 1 ? t`${name}: ${activity}` : activity}
              assistantId={assistantId}
              showAvatar={!hasRunResponseText(messages, bot.runId)}
            />
          );
        })}
      </div>
    );
  }
  const label =
    latestRun?.status === "waiting_input"
      ? t`Waiting for your input`
      : latestRun?.status === "waiting_takeover"
        ? t`Waiting for you`
        : latestRun?.status === "completed" && hasRunResponseText(messages, latestRun.id)
          ? t`Done`
          : latestRun?.status === "cancelled"
            ? t`Stopped`
            : latestRun?.status === "failed"
              ? t`Couldn’t finish`
              : null;
  return label ? (
    <div data-testid="run-status" role="status" className="px-1 py-2 text-sm text-muted-foreground">
      {label}
    </div>
  ) : null;
}
