/** Restrict live acceptance to the chosen model origin and the sandbox's public API. */
export function guardAcceptanceNetwork(
  options: {
    modelOrigin: string;
    e2b: boolean;
    maxRequests: number;
    deadline: number;
  },
  original: typeof fetch = globalThis.fetch,
) {
  let requests = 0;
  const guarded: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const isModel = url.origin === options.modelOrigin;
    const isSandbox =
      options.e2b &&
      url.protocol === "https:" &&
      (url.hostname === "api.e2b.dev" ||
        url.hostname.endsWith(".e2b.app") ||
        url.hostname.endsWith(".e2b.dev"));
    if (!isModel && !isSandbox)
      throw new Error("Acceptance blocked an unapproved network destination");
    const remaining = options.deadline - Date.now();
    if (remaining <= 0) throw new Error("Acceptance network runtime budget exhausted");
    if (isModel) {
      if (requests >= options.maxRequests)
        throw new Error("Acceptance HTTP request budget exhausted");
      requests++;
    }
    const signals = [
      AbortSignal.timeout(remaining),
      init?.signal,
      input instanceof Request ? input.signal : undefined,
    ].filter((signal): signal is AbortSignal => Boolean(signal));
    return original(input, { ...init, signal: AbortSignal.any(signals) });
  };
  return {
    fetch: guarded,
    get requests() {
      return requests;
    },
  };
}
