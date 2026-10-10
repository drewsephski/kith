// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Command, CommandInput, CommandItem, CommandList } from "./command";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("announces the actual keyboard selection and the surviving option after filtering", async () => {
  const render = (filtered = false) => (
    <Command shouldFilter={false}>
      <CommandInput aria-label="Search choices" />
      <CommandList aria-label="Choices">
        {!filtered && <CommandItem value="first">First</CommandItem>}
        <CommandItem value="second">Second</CommandItem>
      </CommandList>
    </Command>
  );
  await act(async () => root.render(render()));
  const input = container.querySelector("input")!;
  const list = container.querySelector('[role="listbox"]')!;
  const selected = () => container.querySelector('[role="option"][aria-selected="true"]')!;
  expect(input.getAttribute("aria-activedescendant")).toBe(selected().id);
  expect(selected().textContent).toBe("First");
  const firstId = selected().id;
  await act(async () => {
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  });
  expect(selected().textContent).toBe("Second");
  expect(input.getAttribute("aria-activedescendant")).toBe(selected().id);
  expect(input.getAttribute("aria-activedescendant")).not.toBe(firstId);
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
  });
  expect(selected().textContent).toBe("First");
  await act(async () => root.render(render(true)));
  expect(selected().textContent).toBe("Second");
  expect(input.getAttribute("aria-activedescendant")).toBe(selected().id);
  expect(list.getAttribute("aria-activedescendant")).toBe(selected().id);
  expect(input).toBe(document.activeElement);
});
