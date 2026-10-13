import type { Me } from "@rakazo/contracts";
import { botCreationAttemptKey, botCreationIntentRemoved, botCreationNonce } from "@rakazo/core";
import * as SecureStore from "expo-secure-store";
import type { MobileBot } from "./api";
import {
  captureApiRequestContext,
  captureMobileScreenScope,
  mobileScreenScopeKey,
  rpc,
} from "./api";

const pending = new Map<string, Promise<MobileBot | null>>();

/** Explicit creation only; a retained nonce is never delivered in the background. */
export function createConversationalBot(): Promise<MobileBot | null> {
  const scope = mobileScreenScopeKey();
  const existing = pending.get(scope);
  if (existing) return existing;
  const work = create().finally(() => {
    pending.delete(scope);
  });
  pending.set(scope, work);
  return work;
}

async function create(): Promise<MobileBot | null> {
  const current = captureMobileScreenScope();
  const requestContext = await captureApiRequestContext();
  const me = await rpc<Me>("me", {}, { requestContext });
  if (!current()) return null;
  const key = botCreationAttemptKey({
    endpoint: requestContext.apiBase,
    userId: me.userId,
    spaceId: me.spaceId,
  });
  const clientNonce = botCreationNonce(
    await SecureStore.getItemAsync(key),
    () =>
      globalThis.crypto?.randomUUID?.() ??
      `bot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
  );
  if (!current()) return null;
  // Storage must succeed before the mutation, so refresh/retry cannot duplicate it.
  await SecureStore.setItemAsync(key, clientNonce);
  if (!current()) return null;
  async function settleIntent() {
    if (!current()) return;
    const stored = await SecureStore.getItemAsync(key);
    if (current() && stored === clientNonce) await SecureStore.deleteItemAsync(key);
  }
  let bot: MobileBot;
  try {
    bot = await rpc<MobileBot>("onboarding/create", { clientNonce }, { requestContext });
  } catch (error) {
    if (botCreationIntentRemoved(error)) await settleIntent().catch(() => undefined);
    throw error;
  }
  if (!current()) return null;
  // Failure to clear leaves the safe retry identity rather than undoing a created bot.
  await settleIntent().catch(() => undefined);
  return current() ? bot : null;
}
