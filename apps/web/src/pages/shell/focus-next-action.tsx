import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@rakazo/ui-web";
import { useState } from "react";
import { CalendarConnection } from "../../components/CalendarConnection";
import type { TaskStarterDraft } from "../../components/task-starters/TaskStarterSetup";
import { TaskStarterSetup } from "../../components/task-starters/TaskStarterSetup";
import { newClientId } from "../../lib/client-id";

export function FocusNextAction({
  botId,
  focus,
  onChanged,
}: {
  botId: string;
  focus: string;
  onChanged: () => Promise<void>;
}) {
  const { t } = useLingui();
  const [draft, setDraft] = useState<TaskStarterDraft | null>(null);
  if (focus === "day")
    return (
      <div className="mt-4">
        <CalendarConnection botId={botId} />
      </div>
    );
  if (focus === "research")
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        <Trans>What are you working on?</Trans>
      </p>
    );
  if (focus === "everything")
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        <Trans>What’s on your mind?</Trans>
      </p>
    );
  if (focus !== "inbox") return null;
  return (
    <div className="mt-4">
      <Button
        variant="outline"
        className="h-auto min-h-10 whitespace-normal"
        onClick={() =>
          setDraft({
            starter: "inbox_todos",
            prompt: t`Turn my inbox into a to-do list`,
            botId,
            target: botId,
            clientNonce: newClientId(),
          })
        }
      >
        <Trans>Turn my inbox into a to-do list</Trans>
      </Button>
      {draft ? (
        <TaskStarterSetup
          draft={draft}
          onClose={() => setDraft(null)}
          onStarted={() => {
            setDraft(null);
            void onChanged().catch(() => undefined);
          }}
        />
      ) : null}
    </div>
  );
}
