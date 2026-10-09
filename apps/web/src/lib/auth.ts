import { organizationClient } from "better-auth/client/plugins";
import type { ReactAuthClient } from "better-auth/react";
import { createAuthClient } from "better-auth/react";

export const AUTH_REQUEST_TIMEOUT_MS = 15_000;

/** Better Auth supplies a cancellation signal for session requests, which
 * disables better-fetch's timeout option. Add an independent deadline without
 * aborting Better Auth's signal, so it records the failure and can retry. */
const fetchWithAuthDeadline: typeof fetch = (input, init) => {
  const deadline = AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS);
  const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : null);
  const signal = callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline;
  return fetch(input, { ...init, signal });
};

export const authClient: ReactAuthClient<{
  plugins: [ReturnType<typeof organizationClient>];
}> = createAuthClient({
  plugins: [organizationClient()],
  fetchOptions: { customFetchImpl: fetchWithAuthDeadline },
});
