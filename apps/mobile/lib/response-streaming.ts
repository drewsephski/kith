import type { ResponseStreamingPreference } from "@rakazo/core";
import {
  normalizeResponseStreamingPreference,
  RESPONSE_STREAMING_STORAGE_KEY,
  responseStreamingEnabled,
} from "@rakazo/core";
import * as SecureStore from "expo-secure-store";

export type { ResponseStreamingPreference };

let memoryPreference: ResponseStreamingPreference | null = null;
let preferenceRevision = 0;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function getCachedResponseStreamingPreference(): ResponseStreamingPreference {
  return memoryPreference ?? "off";
}

export function getCachedResponseStreamingEnabled(): boolean {
  return responseStreamingEnabled(getCachedResponseStreamingPreference());
}

export async function loadResponseStreamingPreference(): Promise<ResponseStreamingPreference> {
  const revision = preferenceRevision;
  try {
    const stored = await SecureStore.getItemAsync(RESPONSE_STREAMING_STORAGE_KEY);
    if (revision !== preferenceRevision) return getCachedResponseStreamingPreference();
    // Missing is a new installation; a saved off (including legacy empty values) stays off.
    memoryPreference = stored === null ? "on" : normalizeResponseStreamingPreference(stored);
  } catch {
    if (revision !== preferenceRevision) return getCachedResponseStreamingPreference();
    memoryPreference = memoryPreference ?? "off";
  }
  notify();
  return memoryPreference;
}

export async function setResponseStreamingPreference(
  preference: ResponseStreamingPreference,
): Promise<ResponseStreamingPreference> {
  preferenceRevision += 1;
  memoryPreference = preference;
  // Paint the switch before SecureStore resolves.
  notify();
  try {
    await SecureStore.setItemAsync(RESPONSE_STREAMING_STORAGE_KEY, preference);
  } catch {
    // Keep the in-memory preference when SecureStore is unavailable.
  }
  return preference;
}

export function subscribeResponseStreaming(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
