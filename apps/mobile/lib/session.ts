import type { AvatarStyle } from "@rakazo/contracts";
import * as SecureStore from "expo-secure-store";
import { clearAvatarStyle, saveAvatarStyle } from "./avatar-style";
import { stopLiveNotifications } from "./live-notifications";

const SESSION_KEY = "rakazo.session_token";
const INTEGRATIONS_SCOPE_KEY = "rakazo.integrations-scope";

export type VerifiedIntegrationsScope = {
  apiBase: string;
  userId: string;
  spaceId: string;
  selectionId: string | null;
};
let scopeInvalidated = false;
let scopeWrites: Promise<void> = Promise.resolve();

function enqueueScopeWrite(task: () => Promise<void>): Promise<void> {
  const next = scopeWrites.then(task, task);
  scopeWrites = next.catch(() => undefined);
  return next;
}

function invalidateIntegrationsScope(): Promise<void> {
  scopeInvalidated = true;
  return enqueueScopeWrite(async () => {
    try {
      await SecureStore.deleteItemAsync(INTEGRATIONS_SCOPE_KEY);
    } catch {
      try {
        await SecureStore.setItemAsync(INTEGRATIONS_SCOPE_KEY, "");
      } catch {
        // A failed wipe remains invalid in memory; token matching gates future reads.
      }
    }
  });
}

export async function loadVerifiedIntegrationsScope(): Promise<VerifiedIntegrationsScope | null> {
  const generation = sessionGeneration;
  if (scopeInvalidated) return null;
  try {
    const token = await snapshotSessionToken();
    const stored = await SecureStore.getItemAsync(INTEGRATIONS_SCOPE_KEY);
    if (
      !token.ok ||
      !token.value ||
      !stored ||
      generation !== sessionGeneration ||
      scopeInvalidated
    )
      return null;
    const data = JSON.parse(stored);
    if (
      data.token !== token.value ||
      typeof data.apiBase !== "string" ||
      !data.apiBase ||
      typeof data.userId !== "string" ||
      !data.userId ||
      typeof data.spaceId !== "string" ||
      !data.spaceId ||
      !(data.selectionId === null || typeof data.selectionId === "string")
    )
      return null;
    return {
      apiBase: data.apiBase,
      userId: data.userId,
      spaceId: data.spaceId,
      selectionId: data.selectionId,
    };
  } catch {
    return null;
  }
}

export function saveVerifiedIntegrationsScope(
  generation: number,
  scope: VerifiedIntegrationsScope,
): Promise<void> {
  return enqueueScopeWrite(async () => {
    if (generation !== sessionGeneration) return;
    const token = await snapshotSessionToken();
    if (!token.ok || !token.value || generation !== sessionGeneration) return;
    try {
      await SecureStore.setItemAsync(
        INTEGRATIONS_SCOPE_KEY,
        JSON.stringify({ ...scope, token: token.value }),
      );
      if (generation === sessionGeneration) scopeInvalidated = false;
    } catch {
      // Verified scope persistence is optional.
    }
  });
}

/** In-memory gate so a failed SecureStore wipe cannot keep sending the old bearer. */
let sessionInvalidated = false;
let sessionFallback: string | undefined;
/** Bumped by every session change, so a late response can tell it no longer owns the session. */
let sessionGeneration = 0;
let tokenWrites: Promise<unknown> = Promise.resolve();

function enqueueTokenWrite<T>(task: () => Promise<T>): Promise<T> {
  const next = tokenWrites.then(task, task);
  tokenWrites = next.catch(() => undefined);
  return next;
}

function persistSessionToken(token: string, generation: number, clearingScope: Promise<void>) {
  return enqueueTokenWrite(async () => {
    await SecureStore.setItemAsync(SESSION_KEY, token);
    await clearingScope;
    if (generation === sessionGeneration) {
      sessionInvalidated = false;
      sessionFallback = undefined;
    }
  });
}

export function currentSessionGeneration() {
  return sessionGeneration;
}

export async function loadSessionToken() {
  const snapshot = await snapshotSessionToken();
  return snapshot.ok ? snapshot.value : "";
}

export async function saveSessionToken(token: string) {
  const generation = ++sessionGeneration;
  await persistSessionToken(token, generation, invalidateIntegrationsScope());
}

/** Clears the session. Returns false only when SecureStore could neither delete nor overwrite. */
export async function clearSessionToken(): Promise<boolean> {
  sessionGeneration += 1;
  sessionInvalidated = true;
  sessionFallback = undefined;
  const clearingScope = invalidateIntegrationsScope();
  return enqueueTokenWrite(async () => {
    await stopLiveNotifications(true).catch(() => undefined);
    const tokenCleared = await clearStoredSessionToken();
    await clearingScope;
    // Best-effort: a stuck style must not block sign-out or restore a wiped token.
    await clearAvatarStyle();
    return tokenCleared;
  });
}

/** Saves a style response only when it still belongs to the current session. */
export function saveAvatarStyleIfCurrent(generation: number, style: AvatarStyle): Promise<boolean> {
  if (generation !== sessionGeneration) return Promise.resolve(false);
  return saveAvatarStyle(style).then(() => generation === sessionGeneration);
}

async function clearStoredSessionToken(): Promise<boolean> {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    return true;
  } catch {
    try {
      await SecureStore.setItemAsync(SESSION_KEY, "");
      return true;
    } catch {
      return false;
    }
  }
}

/** Restores the current-server session in memory even when persistence is unavailable. */
export async function restoreSessionToken(token: string) {
  const generation = ++sessionGeneration;
  const clearingScope = invalidateIntegrationsScope();
  if (!token) {
    await enqueueTokenWrite(async () => {
      await clearingScope;
      if (generation === sessionGeneration) {
        sessionInvalidated = false;
        sessionFallback = undefined;
      }
    });
    return;
  }
  try {
    await persistSessionToken(token, generation, clearingScope);
  } catch {
    if (generation === sessionGeneration) {
      sessionInvalidated = false;
      sessionFallback = token;
    }
  }
}

/** Replaces only the current session and reports false if a newer change supersedes the write. */
export async function replaceSessionTokenIfCurrent(
  generation: number,
  token: string,
): Promise<boolean> {
  if (generation !== sessionGeneration) return false;
  const replacementGeneration = ++sessionGeneration;
  try {
    await persistSessionToken(token, replacementGeneration, invalidateIntegrationsScope());
  } catch (error) {
    // The server already revoked the stored token; retain the replacement only for its owner.
    if (replacementGeneration === sessionGeneration) {
      sessionInvalidated = false;
      sessionFallback = token;
    }
    throw error;
  }
  return replacementGeneration === sessionGeneration;
}

/** Snapshots the active token without treating an unreadable store as an empty session. */
export async function snapshotSessionToken(): Promise<{ ok: true; value: string } | { ok: false }> {
  const generation = sessionGeneration;
  if (sessionInvalidated) return { ok: true, value: "" };
  if (sessionFallback !== undefined) return { ok: true, value: sessionFallback };
  try {
    const value = (await SecureStore.getItemAsync(SESSION_KEY)) ?? "";
    if (sessionInvalidated || generation !== sessionGeneration) return { ok: true, value: "" };
    if (sessionFallback !== undefined) return { ok: true, value: sessionFallback };
    return { ok: true, value };
  } catch {
    if (sessionInvalidated || generation !== sessionGeneration) return { ok: true, value: "" };
    if (sessionFallback !== undefined) return { ok: true, value: sessionFallback };
    return { ok: false };
  }
}

export function tokenFromAuthResponse(res: Response, body: unknown) {
  const fromJson = jsonToken(body);
  if (fromJson) return fromJson;
  const cookies = res.headers.get("set-cookie") ?? "";
  const encoded = cookies.match(/(?:^|,\s*)(?:__Secure-)?better-auth\.session_token=([^;,]*)/)?.[1];
  if (!encoded) return "";
  try {
    return decodeURIComponent(encoded);
  } catch {
    return "";
  }
}

function jsonToken(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  if (typeof record.token === "string" && record.token) return record.token;
  const session = record.session;
  if (
    session &&
    typeof session === "object" &&
    typeof (session as { token?: string }).token === "string"
  ) {
    return (session as { token: string }).token;
  }
  return "";
}
