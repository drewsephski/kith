import { Trans, useLingui } from "@lingui/react/macro";
import type { MessageBlock } from "@rakazo/contracts";
import { BOT_NAME_MAX_LENGTH, BOT_TITLE_MAX_LENGTH } from "@rakazo/contracts";
import { BOT_IDENTITY_PRESETS } from "@rakazo/core";
import { BotAvatar, Button, Input, Label } from "@rakazo/ui-web";
import { Check } from "lucide-react";
import { useId, useRef, useState } from "react";
import { rpc, selectedSpaceId } from "../../lib/rpc";
import { errorText } from "../../lib/user-error";

type Identity =
  | { presetId: "miso" | "pippin" | "orbit" | "pixel" }
  | { name: string; role: string };

export function BotIdentityCard({
  botId,
  botColor = "ink",
  messageId,
  block,
  onBotChanged,
}: {
  botId: string;
  botColor?: string;
  messageId: string;
  block: Extract<MessageBlock, { kind: "choice" }>;
  onBotChanged: () => Promise<void>;
}) {
  const { t } = useLingui();
  const ids = useId();
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [localAnswer, setLocalAnswer] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  // Capture the card's Space before an asynchronous save, never the newly selected Space.
  const spaceId = useRef(selectedSpaceId()).current;
  const answerId = block.answerId ?? localAnswer;
  const roleLabels: Record<string, string> = {
    miso: t`Inbox assistant`,
    pippin: t`Research assistant`,
    orbit: t`Planning assistant`,
    pixel: t`Coding partner`,
  };
  async function save(identity: Identity) {
    if (submitting.current || answerId || selectedSpaceId() !== spaceId) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      await rpc.onboarding.identity({ botId, messageId, identity }, { context: { spaceId } });
      if (selectedSpaceId() !== spaceId) return;
      setLocalAnswer("presetId" in identity ? identity.presetId : "custom");
      // Persistence succeeded even if the optional roster refresh fails.
      void onBotChanged().catch(() => undefined);
    } catch (reason) {
      if (selectedSpaceId() === spaceId) setError(errorText(reason, t`Could not save this choice`));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <div
      className="w-[420px] max-w-full space-y-3 rounded-[20px] border border-border bg-card px-[18px] py-[14px]"
      data-testid="bot-identity-card"
      aria-busy={busy}
    >
      {!answerId ? (
        <p className="text-[15.5px] leading-relaxed">
          <Trans>What should my name be, and what's my role?</Trans>
        </p>
      ) : null}
      {!custom || answerId ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {block.options
            .filter((option) => !answerId || option.id === answerId)
            .map((option) => (
              <Button
                key={option.id}
                variant="secondary"
                disabled={busy || Boolean(answerId)}
                data-testid={`bot-identity-${option.id}`}
                aria-pressed={answerId === option.id}
                className="h-auto min-h-16 justify-start gap-3 whitespace-normal px-3 py-3 text-start"
                onClick={() => {
                  const preset = BOT_IDENTITY_PRESETS.find((entry) => entry.id === option.id);
                  if (preset) void save({ presetId: preset.id });
                }}
              >
                <BotAvatar color={botColor} identity={botId} variant="organic" size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium" dir="auto">
                    {option.label}
                  </span>
                  <span className="block text-xs text-muted-foreground" dir="auto">
                    {roleLabels[option.id] ?? option.description}
                  </span>
                </span>
                {answerId === option.id ? <Check size={14} aria-hidden="true" /> : null}
              </Button>
            ))}
          {localAnswer === "custom" && !block.answerId ? (
            <p className="text-sm" dir="auto">
              {name} · {role}
            </p>
          ) : null}
        </div>
      ) : null}
      {!answerId ? (
        custom ? (
          <form
            data-testid="bot-identity-custom-form"
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim() && role.trim()) void save({ name: name.trim(), role: role.trim() });
            }}
          >
            <div>
              <Label htmlFor={`${ids}-name`}>
                <Trans>Name</Trans>
              </Label>
              <Input
                autoFocus
                id={`${ids}-name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={BOT_NAME_MAX_LENGTH}
                autoComplete="off"
                disabled={busy}
                required
              />
            </div>
            <div>
              <Label htmlFor={`${ids}-role`}>
                <Trans>Role</Trans>
              </Label>
              <Input
                id={`${ids}-role`}
                value={role}
                onChange={(event) => setRole(event.target.value)}
                maxLength={BOT_TITLE_MAX_LENGTH}
                autoComplete="off"
                disabled={busy}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !name.trim() || !role.trim()}>
                {busy ? <Trans>Saving…</Trans> : <Trans>Save</Trans>}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setCustom(false)}>
                <Trans>Cancel</Trans>
              </Button>
            </div>
          </form>
        ) : (
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={busy}
            onClick={() => setCustom(true)}
          >
            <Trans>Custom</Trans>
          </Button>
        )
      ) : null}
      {error && !answerId ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
