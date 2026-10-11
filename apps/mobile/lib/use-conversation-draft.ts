import type { ThreadSendInput } from "@rakazo/contracts";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { MobileMe } from "./api";
import { captureMobileScreenScope, currentApiBase, mobileScreenScopeKey, rpc, selectedSpaceId } from "./api";
import type { DraftScope, DurableDelivery, SavedConversationDraft } from "./conversation-drafts";
import { parseSavedConversationDraft, readConversationDraft, writeConversationDraft } from "./conversation-drafts";
import { t } from "./i18n";
import { currentSessionGeneration, loadVerifiedIntegrationsScope } from "./session";

/** Persist reviewable text and durable delivery identities, never temporary file handles. */
export function useConversationDraft(conversation: string | undefined, draft: SavedConversationDraft, restore: (draft: SavedConversationDraft) => void) {
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const [deliveries, setDeliveries] = useState<DurableDelivery[]>([]);
  const pending = useRef<DurableDelivery[]>([]);
  const latest = useRef(draft);
  latest.current = draft;
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scopeRef = useRef<DraftScope | null>(null);
  const ownsScope = useRef<() => boolean>(() => false);
  const scopeKey = `${mobileScreenScopeKey()}:${conversation}`;
  function encoded() {
    const value = { text: latest.current.text, replyTargetId: latest.current.replyTargetId, replyQuote: latest.current.replyQuote, ...(pending.current.length ? { deliveries: pending.current } : {}) };
    return value.text || value.replyTargetId || pending.current.length ? JSON.stringify(value) : "";
  }
  const prompt = JSON.stringify(draft);
  useEffect(() => {
    let active = true;
    const scopeCurrent = captureMobileScreenScope();
    ownsScope.current = scopeCurrent;
    const endpoint = currentApiBase();
    const session = currentSessionGeneration();
    const selection = selectedSpaceId();
    const current = () => active && scopeCurrent() && session === currentSessionGeneration();
    scopeRef.current = null;
    pending.current = [];
    setDeliveries([]); setReady(false); setError(false);
    const initialPrompt = JSON.stringify(latest.current);
    void (async () => {
      if (!conversation) return;
      const me = await rpc<MobileMe>("me").catch(async () => {
        const saved = await loadVerifiedIntegrationsScope();
        if (saved?.apiBase !== endpoint || saved.selectionId !== selection) throw new Error("Draft scope unavailable");
        return saved;
      });
      if (!current()) return;
      const scope = { endpoint, userId: me.userId, spaceId: me.spaceId, conversation };
      const raw = await readConversationDraft(scope);
      if (!current()) return;
      scopeRef.current = scope;
      const saved = parseSavedConversationDraft(raw);
      pending.current = saved.deliveries ?? [];
      setDeliveries(pending.current);
      if (JSON.stringify(latest.current) === initialPrompt && !latest.current.text && !latest.current.replyTargetId) {
        latest.current = saved;
        restoreRef.current(saved);
      }
    })().catch(() => { if (current()) setError(true); }).finally(() => { if (current()) setReady(true); });
    const flush = () => {
      if (current() && scopeRef.current) void writeConversationDraft(scopeRef.current, encoded()).catch(() => { if (current()) setError(true); });
    };
    const background = AppState.addEventListener("change", (state) => { if (state !== "active") flush(); });
    return () => { flush(); active = false; background.remove(); };
  }, [scopeKey]);
  useEffect(() => {
    if (!ready || !scopeRef.current) return;
    const scope = scopeRef.current;
    const current = ownsScope.current;
    const timer = setTimeout(() => {
      if (current()) void writeConversationDraft(scope, encoded()).then(() => setError(false)).catch(() => setError(true));
    }, 350);
    saveTimer.current = timer;
    return () => clearTimeout(timer);
  }, [prompt, ready, scopeKey, deliveries]);
  async function persist() {
    clearTimeout(saveTimer.current);
    if (!scopeRef.current || !ownsScope.current()) throw new Error(t("Draft recovery is not ready. Try again."));
    await writeConversationDraft(scopeRef.current, encoded());
  }
  return { ready, error, deliveries,
    async prepare(input: ThreadSendInput, displayText: string, replyPreview: string | null) {
      if (!pending.current.some((entry) => entry.input.clientNonce === input.clientNonce)) {
        pending.current = [...pending.current, { input, displayText, replyPreview }];
        setDeliveries(pending.current);
      }
      await persist();
    },
    confirmed(nonce: string, clearDraft = false) {
      pending.current = pending.current.filter((entry) => entry.input.clientNonce !== nonce);
      setDeliveries(pending.current);
      if (clearDraft) latest.current = { text: "" };
      void persist().catch(() => setError(true));
    },
  };
}
