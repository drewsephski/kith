// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StartupReadyContext, useScreenInteractive } from "./observe";

const markInteractive = vi.hoisted(() => vi.fn());
vi.mock("expo-observe", () => ({ useObserve: () => ({ markInteractive }) }));

let host: HTMLDivElement;
let root: Root;

function Screen({ ready }: { ready: boolean }) {
  useScreenInteractive(ready);
  return <div />;
}

function render(startupReady: boolean, screenReady: boolean) {
  act(() => {
    root.render(
      <StartupReadyContext.Provider value={startupReady}>
        <Screen ready={screenReady} />
      </StartupReadyContext.Provider>,
    );
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  markInteractive.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("waits for splash dismissal even if the entry screen is already ready", () => {
  render(false, true);
  expect(markInteractive).not.toHaveBeenCalled();
  render(true, true);
  expect(markInteractive).toHaveBeenCalledOnce();
});

it("waits for authentication and initial data after the splash is hidden", () => {
  render(true, false);
  expect(markInteractive).not.toHaveBeenCalled();
  render(true, true);
  expect(markInteractive).toHaveBeenCalledOnce();
  render(true, true);
  expect(markInteractive).toHaveBeenCalledOnce();
});

it("does not report a route that unmounts before startup finishes", () => {
  render(false, true);
  act(() => root.render(null));
  expect(markInteractive).not.toHaveBeenCalled();
});

it("does not treat a screen outside the startup provider as interactive", () => {
  act(() => root.render(<Screen ready />));
  expect(markInteractive).not.toHaveBeenCalled();
});
