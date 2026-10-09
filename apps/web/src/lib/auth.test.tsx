// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { authClient as AuthClient } from "./auth";
import { sessionGate } from "./session-gate";

let authClient: typeof AuthClient;
let timeoutMs: number;
let root: Root;
let container: HTMLDivElement;

function SessionProbe() {
  const session = authClient.useSession();
  return (
    <>
      <output>{sessionGate(session)}</output>
      <button type="button" onClick={() => void session.refetch()}>
        Retry
      </button>
    </>
  );
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.resetModules();
  // Native deadline timers do not use Vitest's clock. Preserve abort semantics
  // while letting the test advance the deadline deterministically.
  vi.spyOn(AbortSignal, "timeout").mockImplementation((delay) => {
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new DOMException("Request timed out", "TimeoutError")),
      delay,
    );
    return controller.signal;
  });
  const module = await import("./auth");
  authClient = module.authClient;
  timeoutMs = module.AUTH_REQUEST_TIMEOUT_MS;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("moves a stalled initial session into recovery and permits a successful retry", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  fetch.mockImplementationOnce(
    (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      }),
  );
  fetch.mockResolvedValueOnce(Response.json(null));
  vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(<SessionProbe />));
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(container.querySelector("output")?.textContent).toBe("loading");
  await act(async () => vi.advanceTimersByTimeAsync(timeoutMs - 1));
  expect(container.querySelector("output")?.textContent).toBe("loading");
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(container.querySelector("output")?.textContent).toBe("unreachable");
  await act(async () => container.querySelector("button")?.click());
  expect(container.querySelector("output")?.textContent).toBe("anonymous");
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("preserves a known session when a refresh stalls", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const data = {
    session: { id: "session-one", userId: "user-one", expiresAt: "2099-01-01T00:00:00.000Z" },
    user: { id: "user-one", name: "Example", email: "example@example.test" },
  };
  fetch.mockResolvedValueOnce(Response.json(data));
  fetch.mockImplementationOnce(
    (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      }),
  );
  vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(<SessionProbe />));
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(container.querySelector("output")?.textContent).toBe("authenticated");
  await act(async () => container.querySelector("button")?.click());
  await act(async () => vi.advanceTimersByTimeAsync(timeoutMs));
  expect(container.querySelector("output")?.textContent).toBe("authenticated");
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("still cancels immediately when the caller aborts an authentication request", async () => {
  const caller = new AbortController();
  const reason = new DOMException("Request cancelled", "AbortError");
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        }),
    ),
  );
  const request = authClient.$fetch("/get-session", { signal: caller.signal });
  await vi.advanceTimersByTimeAsync(0);
  const rejected = expect(request).rejects.toBe(reason);
  caller.abort(reason);
  await rejected;
});
