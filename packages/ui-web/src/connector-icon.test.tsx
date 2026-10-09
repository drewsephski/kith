// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ConnectorIcon } from "./connector-icon.js";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
it("renders local SVGL artwork when provider artwork is absent", () => {
  act(() => root.render(<ConnectorIcon name="Gmail" />));
  expect(container.querySelector("img")?.src).toMatch(/^data:image\/svg\+xml/);
  expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
});
it("falls back from SVGL to catalog artwork and then an initial without retry loops", () => {
  act(() => root.render(<ConnectorIcon name="Airbnb" logo="https://example.test/logo.png" />));
  expect(container.querySelector("img")?.src).toContain("svgl.app/library/");
  act(() => container.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(container.querySelector("img")?.src).toBe("https://example.test/logo.png");
  act(() => container.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toBe("A");
});
