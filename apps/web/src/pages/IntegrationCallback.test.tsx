// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { IntegrationCallbackPage } from "./IntegrationCallback";

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@rakazo/ui-web", () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

it("ignores provider callback claims and lets users close the authorization tab", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(
    null,
    "",
    "/integrations/callback?status=success&connectedAccountId=other-account",
  );
  const close = vi.spyOn(window, "close").mockImplementation(() => undefined);
  const fetch = vi.spyOn(globalThis, "fetch");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<IntegrationCallbackPage />));
  expect(container.textContent).toContain("Return to the app to finish connecting.");
  expect(container.textContent).not.toContain("Connected");
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => container?.querySelector("button")?.click());
  expect(close).toHaveBeenCalledOnce();
});
