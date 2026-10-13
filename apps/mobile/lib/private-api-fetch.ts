/** Native fetch ignores RequestInit.cache; real headers protect private API payloads. */
export function privateApiFetch(input: Parameters<typeof fetch>[0], init: RequestInit = {}) {
  const headers = new Headers(
    init.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  headers.delete("cookie");
  // Revalidate older cached replies and prevent storing this request or its response.
  headers.set("cache-control", "no-store, no-cache");
  return fetch(input, {
    ...init,
    // Kith uses its explicit bearer token, never a native shared cookie jar.
    credentials: "omit",
    headers: Object.fromEntries(headers.entries()),
  });
}
