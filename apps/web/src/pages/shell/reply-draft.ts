import type { ThreadMessage } from "@rakazo/contracts";
import { useCallback, useRef, useState } from "react";

type ReplyDraft = { scope: string; target: ThreadMessage; quote: string | null };

/** A send may clear only the exact reply intent it captured, in its originating conversation. */
export function useReplyDraft(scope: string) {
  const [draft, setDraft] = useState<ReplyDraft | null>(null);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const current = draft?.scope === scope ? draft : null;
  const clear = useCallback(() => setDraft(null), []);
  const settle = useCallback((submitted: ReplyDraft | null) => {
    if (!submitted || scopeRef.current !== submitted.scope) return;
    setDraft((latest) => (latest === submitted ? null : latest));
  }, []);
  return {
    current,
    target: current?.target ?? null,
    quote: current?.quote ?? null,
    select: (target: ThreadMessage, quote: string | null = null) =>
      setDraft({ scope, target, quote }),
    clear,
    settle,
  };
}
