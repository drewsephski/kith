import type { AppearancePreference, ResolvedAppearance } from "@rakazo/ui-tokens";
import {
  normalizeAppearancePreference,
  persistAppearancePreference,
  resolveAppearance,
  resolveAppearancePreference,
  tokensForAppearance,
  UI_APPEARANCE_STORAGE_KEY,
} from "@rakazo/ui-tokens";

export type { AppearancePreference, ResolvedAppearance };

const THEME_COLOR_META = 'meta[name="theme-color"]';
const listeners = new Set<() => void>();
let memoryPreference: AppearancePreference | null = null;

export function readSystemAppearance(
  media: Pick<MediaQueryList, "matches"> | null = typeof window !== "undefined" &&
  typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: light)")
    : null,
): ResolvedAppearance {
  return media?.matches ? "light" : "dark";
}

export function applyResolvedAppearance(
  appearance: ResolvedAppearance,
  root: HTMLElement | null = typeof document !== "undefined" ? document.documentElement : null,
): void {
  if (!root) return;
  root.dataset.theme = appearance;
  root.style.colorScheme = appearance;
  if (typeof document === "undefined") return;
  const meta = document.querySelector(THEME_COLOR_META);
  if (meta) {
    meta.setAttribute("content", tokensForAppearance(appearance).background);
  }
}

export function applyUiAppearance(
  preference: AppearancePreference = getUiAppearancePreference(),
  system: ResolvedAppearance = readSystemAppearance(),
): ResolvedAppearance {
  memoryPreference = preference;
  const resolved = resolveAppearance(preference, system);
  applyResolvedAppearance(resolved);
  for (const listener of listeners) listener();
  return resolved;
}

export function setUiAppearance(preference: AppearancePreference): ResolvedAppearance {
  persistAppearancePreference(preference);
  return applyUiAppearance(preference);
}

export function getUiAppearancePreference(): AppearancePreference {
  return memoryPreference ?? resolveAppearancePreference();
}

export function getResolvedUiAppearance(): ResolvedAppearance {
  const theme = typeof document !== "undefined" ? document.documentElement.dataset.theme : null;
  return theme === "light" || theme === "dark"
    ? theme
    : resolveAppearance(getUiAppearancePreference(), readSystemAppearance());
}

export function subscribeUiAppearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Keep `data-theme` in sync when the OS scheme changes and preference is System. */
export function watchSystemAppearance(
  onChange: (system: ResolvedAppearance) => void = () => {
    if (getUiAppearancePreference() === "system") applyUiAppearance("system");
  },
): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const media = window.matchMedia("(prefers-color-scheme: light)");
  const handler = () => onChange(media.matches ? "light" : "dark");
  media.addEventListener("change", handler);
  return () => media.removeEventListener("change", handler);
}

/** Synchronize other tabs and Electron windows as well as system appearance. */
export function watchUiAppearance(): () => void {
  const stopSystem = watchSystemAppearance();
  if (typeof window === "undefined") return stopSystem;
  const onStorage = (event: StorageEvent) => {
    if (event.key !== UI_APPEARANCE_STORAGE_KEY && event.key !== null) return;
    try {
      if (event.storageArea !== window.localStorage) return;
    } catch {
      return;
    }
    applyUiAppearance(normalizeAppearancePreference(event.newValue));
  };
  window.addEventListener("storage", onStorage);
  return () => {
    stopSystem();
    window.removeEventListener("storage", onStorage);
  };
}
