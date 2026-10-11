import type { ThreadSendInput } from "@rakazo/contracts";
import { ThreadSendInputSchema } from "@rakazo/contracts";
import * as SecureStore from "expo-secure-store";

export type DurableDelivery = { input: ThreadSendInput; displayText: string; replyPreview: string | null };
export type SavedConversationDraft = {
  deliveries?: DurableDelivery[];
  text: string;
  replyTargetId?: string;
  replyQuote?: string | null;
};
export function parseSavedConversationDraft(raw: string): SavedConversationDraft {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      "text" in parsed &&
      typeof parsed.text === "string"
    ) {
      const deliveries: DurableDelivery[] = [];
      if ("deliveries" in parsed && Array.isArray(parsed.deliveries)) {
        for (const entry of parsed.deliveries) {
          if (!entry || typeof entry !== "object" || typeof entry.displayText !== "string" || !(entry.replyPreview === null || typeof entry.replyPreview === "string")) continue;
          const input = ThreadSendInputSchema.safeParse(entry.input);
          if (input.success && input.data.clientNonce) deliveries.push({ input: input.data, displayText: entry.displayText, replyPreview: entry.replyPreview });
        }
      }
      return {
        ...(deliveries.length ? { deliveries } : {}),
        text: parsed.text,
        ...("replyTargetId" in parsed && typeof parsed.replyTargetId === "string"
          ? { replyTargetId: parsed.replyTargetId }
          : {}),
        ...("replyQuote" in parsed &&
        (typeof parsed.replyQuote === "string" || parsed.replyQuote === null)
          ? { replyQuote: parsed.replyQuote }
          : {}),
      };
    }
  } catch {
    /* Compatibility with an ordinary text draft. */
  }
  return { text: raw };
}

export type DraftScope = {
  endpoint: string;
  userId: string;
  spaceId: string;
  conversation: string;
};
const INDEX = "kith.drafts.index";
let writes: Promise<unknown> = Promise.resolve();
let epoch = 0;

export function conversationDraftKey(scope: DraftScope): string {
  const raw = JSON.stringify([scope.endpoint, scope.userId, scope.spaceId, scope.conversation]);
  return `kith.draft.${Array.from(raw, (char) => char.codePointAt(0)!.toString(16)).join("-")}`;
}

function draftKeys(raw: string | null): string[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is string => typeof item === "string" && item.startsWith("kith.draft."),
        )
      : [];
  } catch {
    return [];
  }
}

export async function readConversationDraft(scope: DraftScope): Promise<string> {
  const generation = epoch;
  await writes;
  const key = conversationDraftKey(scope);
  if (!draftKeys(await SecureStore.getItemAsync(INDEX)).includes(key)) return "";
  const value = await SecureStore.getItemAsync(key);
  return generation === epoch ? (value ?? "") : "";
}

export function writeConversationDraft(scope: DraftScope, text: string): Promise<void> {
  const generation = epoch;
  const task = async () => {
    if (generation !== epoch) return;
    const key = conversationDraftKey(scope);
    const raw = await SecureStore.getItemAsync(INDEX);
    const keys = new Set(draftKeys(raw));
    if (text) {
      keys.add(key);
      // Record ownership before writing so interrupted saves can still be wiped.
      await SecureStore.setItemAsync(INDEX, JSON.stringify([...keys]));
      await SecureStore.setItemAsync(key, text);
    } else {
      await SecureStore.deleteItemAsync(key);
      keys.delete(key);
      await SecureStore.setItemAsync(INDEX, JSON.stringify([...keys]));
    }
  };
  const next = writes.then(task, task);
  writes = next.catch(() => undefined);
  return next;
}

/** Sign-out fences queued writes before wiping all encrypted local drafts. */
export function clearConversationDrafts(): Promise<void> {
  epoch += 1;
  const task = async () => {
    const raw = await SecureStore.getItemAsync(INDEX);
    for (const key of draftKeys(raw)) await SecureStore.deleteItemAsync(key);
    await SecureStore.deleteItemAsync(INDEX);
  };
  const next = writes.then(task, task);
  writes = next.catch(() => undefined);
  return next;
}
