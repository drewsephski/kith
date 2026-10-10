// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { FOR_YOU_SUGGESTIONS } from "@rakazo/core";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (parts: TemplateStringsArray) => parts.join(""),
    i18n: setupI18n({ locale: "en", messages: { en: {} } }),
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));

import { ForYouPage } from "./ForYou";

it("filters grouped prompts and launches the complete selected suggestion", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () =>
    ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onSelect = vi.fn();
  try {
    act(() => root.render(<ForYouPage onSelect={onSelect} />));
    const routines = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Routines",
    )!;
    act(() => routines.click());
    const rows = [...container.querySelectorAll<HTMLButtonElement>("button[aria-label]")];
    expect(rows).toHaveLength(
      FOR_YOU_SUGGESTIONS.filter((suggestion) => suggestion.category === "routines").length,
    );
    act(() => rows[0]!.click());
    expect(onSelect).toHaveBeenCalledWith(
      FOR_YOU_SUGGESTIONS.find((suggestion) => suggestion.id === "outreach-tracker"),
    );
    act(() => root.render(<ForYouPage onSelect={onSelect} busy error="Could not send. Retry." />));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Could not send. Retry.");
    expect(
      [...container.querySelectorAll<HTMLButtonElement>("button[aria-label]")].every(
        (button) => button.disabled,
      ),
    ).toBe(true);
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
