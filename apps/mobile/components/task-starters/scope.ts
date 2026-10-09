import { currentApiBase, selectedSpaceId } from "../../lib/api";
import { currentSessionGeneration } from "../../lib/session";

/** OAuth may return after the selected account, server, or Space changed. */
export function captureTaskScope() {
  const apiBase = currentApiBase();
  const session = currentSessionGeneration();
  const spaceId = selectedSpaceId();
  return () =>
    apiBase === currentApiBase() &&
    session === currentSessionGeneration() &&
    spaceId === selectedSpaceId();
}
