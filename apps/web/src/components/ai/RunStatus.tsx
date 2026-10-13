import { useLingui } from "@lingui/react/macro";
import type { ThreadMessage } from "@rakazo/contracts";
import { hasRunApproval, hasRunResponseText, runActivityText } from "@rakazo/core";
import type { GroupAvatarMember } from "@rakazo/ui-web";
import { ActiveBotGlyph } from "./CollaborationMarker";

type StatusRun = { id: string; status: string };

/** Run authority determines whether work is over; streamed prose never does. */
export function RunStatus({
  bots,
  messages,
  latestRun,
  waitingBots = [],
  assistantId,
  reconnecting = false,
}: {
  bots: (GroupAvatarMember & { runId: string })[];
  messages: ThreadMessage[];
  latestRun?: StatusRun | null;
  waitingBots?: (GroupAvatarMember & { runId: string })[];
  assistantId?: string | null;
  reconnecting?: boolean;
}) {
  const { t } = useLingui();
  const active = bots.filter((bot) => ["queued", "leased", "running"].includes(bot.status ?? ""));
  if (active.length > 0 || waitingBots.length > 0) {
    return (
      <div data-testid="run-status" className="flex flex-col gap-1">
        {active.map((bot) => {
          const activity = reconnecting
            ? t`Reconnecting…`
            : (runActivityText(messages, bot.runId) ??
              (bot.status === "queued"
                ? t`Queued…`
                : bot.status === "leased"
                  ? t`Starting…`
                  : t`Working…`));
          const name = bot.name ?? t`Bot`;
          return (
            <ActiveBotGlyph
              key={bot.runId}
              bots={[bot]}
              label={active.length + waitingBots.length > 1 ? t`${name}: ${activity}` : activity}
              assistantId={assistantId}
              showAvatar={!hasRunResponseText(messages, bot.runId)}
            />
          );
        })}
        {waitingBots.map((bot) => (
          <div key={bot.runId} role="status" className="px-1 py-2 text-sm text-muted-foreground">
            {active.length + waitingBots.length > 1 ? `${bot.name ?? t`Bot`}: ` : ""}
            {bot.status === "waiting_takeover"
              ? t`Waiting for you`
              : hasRunApproval(messages, bot.runId)
                ? t`Waiting for approval`
                : t`Waiting for your input`}
          </div>
        ))}
      </div>
    );
  }
  const label =
    latestRun?.status === "waiting_input"
      ? hasRunApproval(messages, latestRun.id)
        ? t`Waiting for approval`
        : t`Waiting for your input`
      : latestRun?.status === "waiting_takeover"
        ? t`Waiting for you`
        : latestRun?.status === "completed"
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
