// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate, useParams } from "react-router-dom";
import { expect, it, vi } from "vitest";

vi.mock("./lib/auth", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "user-1" } }, isPending: false, error: null }),
  },
}));
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: (parts: TemplateStringsArray) => parts.join("") }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./components/SubscriptionGate", () => ({
  SubscriptionGate: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./pages/Shell", () => ({
  ShellPage: () => {
    const [draft, setDraft] = useState("");
    const location = useLocation();
    const navigate = useNavigate();
    const { botId, groupId } = useParams();
    return (
      <div>
        <output data-testid="thread">{groupId ?? botId ?? "default"}</output>
        <input
          aria-label="Draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="button"
          onClick={() =>
            navigate("/app/artifacts", { state: { filesBackground: location.pathname } })
          }
        >
          Files
        </button>
      </div>
    );
  },
}));
vi.mock("./pages/Artifacts", () => ({
  ArtifactsPage: () => {
    const { artifactId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    return (
      <div data-testid="files">
        <output>{artifactId ?? "library"}</output>
        <button
          type="button"
          onClick={() =>
            navigate("/app/artifacts/file-1", { replace: true, state: location.state })
          }
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() =>
            location.state?.filesBackground ? navigate(-1) : navigate("/app", { replace: true })
          }
        >
          Close
        </button>
      </div>
    );
  },
}));

import { App } from "./App";

it.each(["/app/bot-1", "/app/g/group-1"])(
  "keeps %s mounted while the library and preview overlay it",
  async (route) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <MemoryRouter initialEntries={[route]}>
            <App />
          </MemoryRouter>,
        ),
      );
      const input = container.querySelector("input")!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
          input,
          "Keep this draft",
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
      await vi.waitFor(() =>
        expect(container.querySelector("[data-testid='files']")?.textContent).toContain("library"),
      );
      expect(container.querySelector("input")).toBe(input);
      expect(input.value).toBe("Keep this draft");
      await act(async () =>
        container.querySelector<HTMLButtonElement>("[data-testid='files'] button")!.click(),
      );
      expect(container.querySelector("[data-testid='files']")?.textContent).toContain("file-1");
      await act(async () =>
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent === "Close")!
          .click(),
      );
      expect(container.querySelector("[data-testid='files']")).toBeNull();
      expect(container.querySelector("input")).toBe(input);
      expect(input.value).toBe("Keep this draft");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  },
);

it("opens a historic file deep link over the default conversation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={["/app/artifacts/file-1"]}>
          <App />
        </MemoryRouter>,
      ),
    );
    await vi.waitFor(() =>
      expect(container.querySelector("[data-testid='files']")?.textContent).toContain("file-1"),
    );
    expect(container.querySelector("[data-testid='thread']")?.textContent).toBe("default");
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Close")!
        .click(),
    );
    expect(container.querySelector("[data-testid='files']")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
