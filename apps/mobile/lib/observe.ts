import { useObserve } from "expo-observe";
import { createContext, useContext, useEffect } from "react";

export const StartupReadyContext = createContext(false);

/** Call from a route once its initial data or recoverable error UI is ready. */
export function useScreenInteractive(ready: boolean = true): void {
  const startupReady = useContext(StartupReadyContext);
  const { markInteractive } = useObserve();

  useEffect(() => {
    if (startupReady && ready) void markInteractive();
  }, [startupReady, ready, markInteractive]);
}
