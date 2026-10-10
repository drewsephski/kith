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
import { Check, Loader2 } from "lucide-react";
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
  const [selected, setSelected] = useState<AssistantFocus | null>(null);
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
      setSelected(null);
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["day", "inbox", "research", "everything"] satisfies AssistantFocus[]).map((focus) => (
          <Button
            key={focus}
            variant="outline"
            className="h-auto min-h-14 justify-between gap-3 whitespace-normal px-4 py-3 text-start leading-5 transition-colors duration-200 data-selected:bg-accent"
            data-selected={selected === focus ? "" : undefined}
            aria-pressed={selected === focus}
            disabled={busy}
            onClick={() => {
              if (pending.current) return;
              setSelected(focus);
              void perform(async () => {
                await rpc.onboarding.promptFocus({ botId });
                await rpc.onboarding.choose({ botId, optionId: focus });
              });
            }}
          >
            <span>{focusLabel(focus)}</span>
            {selected === focus ? (
              busy ? (
                <Loader2
                  size={16}
                  className="shrink-0 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Check size={16} className="shrink-0" aria-hidden="true" />
              )
            ) : null}
          </Button>
        ))}
      </div>
      <Collapsible>
        <CollapsibleTrigger className="cursor-pointer rounded-md text-sm text-muted-foreground hover:text-foreground">
          <Trans>Name your assistant</Trans>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-3">
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
          </div>
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
