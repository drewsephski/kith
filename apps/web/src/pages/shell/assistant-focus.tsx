import { Trans, useLingui } from "@lingui/react/macro";
import type { AssistantFocus } from "@rakazo/core";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
} from "@rakazo/ui-web";
import { useId, useRef, useState } from "react";
import { rpc } from "../../lib/rpc";
import { errorText } from "../../lib/user-error";

export function focusLabel(focus: string): React.ReactNode {
  switch (focus) {
    case "day":
      return <Trans>Organize my day</Trans>;
    case "inbox":
      return <Trans>Email and follow-ups</Trans>;
    case "research":
      return <Trans>Research and projects</Trans>;
    default:
      return <Trans>Just start chatting</Trans>;
  }
}

export function AssistantFocusChoices({
  botId,
  assistantName,
  onChanged,
}: {
  botId: string;
  assistantName: string;
  onChanged: () => Promise<void>;
}) {
  const { t } = useLingui();
  const nameId = useId();
  const [name, setName] = useState(assistantName);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  async function perform(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
      await onChanged();
    } catch (cause) {
      setError(errorText(cause, t`Could not save this choice. Try again.`));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="mt-7 space-y-4" data-testid="assistant-focus">
      <h2 className="text-base text-muted-foreground">
        <Trans>What should I help you with first?</Trans>
      </h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(["day", "inbox", "research", "everything"] satisfies AssistantFocus[]).map((focus) => (
          <Button
            key={focus}
            variant="outline"
            className="h-auto min-h-12 justify-start whitespace-normal text-start"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                await rpc.onboarding.promptFocus({ botId });
                await rpc.onboarding.choose({ botId, optionId: focus });
              })
            }
          >
            {focusLabel(focus)}
          </Button>
        ))}
      </div>
      <Collapsible>
        <CollapsibleTrigger className="cursor-pointer rounded-md text-sm text-muted-foreground hover:text-foreground">
          <Trans>Name your assistant</Trans>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void perform(async () => {
                await rpc.bots.update({ botId, name: name.trim() || "Kith" });
              });
            }}
          >
            <div className="min-w-0 flex-1">
              <Label htmlFor={nameId}>
                <Trans>Assistant name</Trans>
              </Label>
              <Input
                id={nameId}
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={busy}>
              <Trans>Save</Trans>
            </Button>
          </form>
        </CollapsibleContent>
      </Collapsible>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
