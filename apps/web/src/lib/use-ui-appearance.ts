import { useSyncExternalStore } from "react";
import {
  getResolvedUiAppearance,
  getUiAppearancePreference,
  subscribeUiAppearance,
} from "./ui-appearance";

export function useUiAppearance() {
  const preference = useSyncExternalStore(subscribeUiAppearance, getUiAppearancePreference);
  const resolved = useSyncExternalStore(subscribeUiAppearance, getResolvedUiAppearance);
  return { preference, resolved };
}
