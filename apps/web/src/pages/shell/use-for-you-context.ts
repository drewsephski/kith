import type { RunActivityRow } from "@rakazo/contracts";
import { forYouWork } from "@rakazo/core";
import { useEffect, useState } from "react";
import { rpc, selectedSpaceId } from "../../lib/rpc";

/** Fetch on entry/return, not on a timer. Discard responses from an old space. */
export function useForYouWork(scopeKey?: string, workRevision?: string) {
  const [state, setState] = useState<{
    scope?: string;
    spaceId?: string | null;
    runs: RunActivityRow[];
    failed: boolean;
  }>({
    runs: [],
    failed: false,
  });
  useEffect(() => {
    if (!scopeKey) return;
    let alive = true;
    let pending = false;
    const spaceId = selectedSpaceId();
    const load = async () => {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const [active, recent] = await Promise.all([
          rpc.runs.list({ filter: "active" }, { context: { spaceId } }),
          rpc.runs.list({ filter: "recent" }, { context: { spaceId } }),
        ]);
        if (alive && selectedSpaceId() === spaceId)
          setState({
            scope: scopeKey,
            spaceId,
            runs: forYouWork([...active.runs, ...recent.runs]),
            failed: false,
          });
      } catch {
        if (alive && selectedSpaceId() === spaceId)
          setState({ scope: scopeKey, spaceId, runs: [], failed: true });
      } finally {
        pending = false;
      }
    };
    const refresh = () => void load();
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive = false;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [scopeKey, workRevision]);
  return state.scope === scopeKey && state.spaceId === selectedSpaceId()
    ? { ...state, loaded: true }
    : { runs: [], failed: false, loaded: false };
}
