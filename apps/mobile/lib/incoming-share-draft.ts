import type { DraftScope } from "./conversation-drafts";
import type { PickedAttachment } from "./pick-attachments-filter";

type SharedDraft = { scope: DraftScope; text: string; attachments: PickedAttachment[] };
const drafts = new Map<string, SharedDraft>();
export function stageIncomingShare(id: string, draft: SharedDraft) {
  drafts.clear();
  drafts.set(id, draft);
}
export function takeIncomingShare(id: string, scope: DraftScope): SharedDraft | null {
  const draft = drafts.get(id);
  drafts.delete(id);
  return draft && JSON.stringify(draft.scope) === JSON.stringify(scope) ? draft : null;
}
export function clearIncomingShareDrafts() {
  drafts.clear();
}
