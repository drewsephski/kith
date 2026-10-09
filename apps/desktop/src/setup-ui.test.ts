import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import type { DesktopSetup, DesktopSetupState } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(path.join(import.meta.dirname, "setup.js"), "utf8");

function setupScreen(state: DesktopSetupState) {
  const elements = new Map<string, Element>();
  const radios: Element[] = [];
  class Element {
    hidden = false;
    disabled = false;
    textContent = "";
    value = "";
    name = "";
    private selected = false;
    readonly listeners = new Map<string, (event: { preventDefault: () => void }) => void>();
    get checked() {
      return this.selected;
    }
    set checked(value: boolean) {
      if (value) for (const radio of radios) radio.selected = false;
      this.selected = value;
    }
    addEventListener(type: string, handler: (event: { preventDefault: () => void }) => void) {
      this.listeners.set(type, handler);
    }
    setAttribute() {}
    removeAttribute() {}
    focus() {}
    querySelector() {
      return radios.find((radio) => radio.checked) ?? null;
    }
    querySelectorAll() {
      return radios;
    }
    dispatch(type: string) {
      this.listeners.get(type)?.({ preventDefault: () => undefined });
    }
  }
  const element = (id: string) => {
    const existing = elements.get(id);
    if (existing) return existing;
    const created = new Element();
    elements.set(id, created);
    return created;
  };
  for (const mode of ["new", "existing", "hosted"]) {
    const radio = element(`mode-${mode}`);
    radio.name = "mode";
    radio.value = mode;
    radios.push(radio);
  }
  element("mode-new").checked = true;
  const bridge = {
    state: vi.fn(async () => state),
    save: vi.fn(async (_setup: DesktopSetup) => ({ ok: true })),
    stack: {
      state: vi.fn(async () => ({ phase: "idle" })),
      start: vi.fn(),
      onChange: vi.fn(),
    },
  };
  runInNewContext(source, {
    window: { rakazoSetup: bridge },
    document: {
      documentElement: { dataset: {} },
      getElementById: element,
      querySelector: (selector: string) =>
        radios.find((radio) => selector.includes(`value="${radio.value}"`)) ?? null,
    },
    HTMLInputElement: Element,
    HTMLElement: Element,
    setTimeout,
  });
  return { element, bridge };
}

describe("desktop service setup", () => {
  const defaults = {
    defaultLocalUrl: "http://127.0.0.1:45173",
    serviceUrl: "https://service.example.com",
    saved: null,
  };

  it("retries the hosted service without requesting an address or starting Docker", async () => {
    const { element, bridge } = setupScreen(defaults);
    await vi.waitFor(() => expect(element("mode-hosted").checked).toBe(true));
    expect(element("panel-existing").hidden).toBe(true);
    expect(element("panel-new").hidden).toBe(true);
    element("setup").dispatch("submit");
    await vi.waitFor(() =>
      expect(bridge.save).toHaveBeenCalledWith({
        mode: "existing",
        serverUrl: defaults.serviceUrl,
      }),
    );
    expect(bridge.stack.start).not.toHaveBeenCalled();
  });

  it("lets users choose custom or local hosting and return to the public service", async () => {
    const { element } = setupScreen(defaults);
    await vi.waitFor(() => expect(element("mode-hosted").checked).toBe(true));
    element("change-mode").dispatch("click");
    expect(element("mode-existing").checked).toBe(true);
    expect(element("panel-existing").hidden).toBe(false);
    expect(element("use-hosted").hidden).toBe(false);
    element("change-mode").dispatch("click");
    expect(element("mode-new").checked).toBe(true);
    element("use-hosted").dispatch("click");
    expect(element("mode-hosted").checked).toBe(true);
    expect(element("panel-existing").hidden).toBe(true);
  });

  it("preserves saved server selection when a release configures hosted defaults", async () => {
    const saved = { mode: "existing", serverUrl: "https://custom.example.com" } as const;
    const { element } = setupScreen({ ...defaults, saved });
    await vi.waitFor(() => expect(element("server-url").value).toBe(saved.serverUrl));
    expect(element("mode-existing").checked).toBe(true);
  });
});
