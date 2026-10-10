import { describe, expect, it } from "vitest";
import { brandLogoUri, resolveBrandLogo } from "./brand-logos.js";

describe("SVGL brand artwork", () => {
  it.each([
    ["Google_Calendar", "googlecalendar"],
    ["google mail", "gmail"],
    ["gdrive", "googledrive"],
    ["slackbot", "slack"],
    ["notion.so", "notion"],
    ["MCP", "modelcontextprotocol"],
    ["openai-codex", "openai"],
    ["google-vertex", "gemini"],
    ["cloudflare-ai-gateway", "cloudflare"],
    ["Composio", "composio"],
  ])("resolves catalog/provider alias %s", (name, key) => {
    expect(resolveBrandLogo(name)?.key).toBe(key);
  });
  it("does not assign brands by substring or use inherited object properties", () => {
    for (const name of ["My Google tool", "Slack archive", "constructor", "__proto__"])
      expect(resolveBrandLogo(name)).toBeNull();
  });
  it("resolves protocol fallback only after the actual brand", () => {
    expect(resolveBrandLogo("Linear", "MCP")?.key).toBe("linear");
    expect(resolveBrandLogo("Custom server", "MCP")?.key).toBe("modelcontextprotocol");
  });
  it("embeds common assets and preserves SVGL theme variants", () => {
    const logo = resolveBrandLogo("MCP")!;
    expect(logo.artwork?.light).toContain("<svg");
    expect(logo.artwork?.dark).toContain("<svg");
    expect(brandLogoUri(logo, "light")).toMatch(/^data:image\/svg\+xml/);
    expect(brandLogoUri(logo, "light")).not.toBe(brandLogoUri(logo, "dark"));
  });
  it.each(["Gmail", "GitHub", "Google Calendar", "Google Sheets", "Notion", "Slack", "Supabase"])(
    "bundles mention service %s for offline rendering",
    (name) => {
      const logo = resolveBrandLogo(name)!;
      for (const appearance of ["light", "dark"] as const) {
        expect(brandLogoUri(logo, appearance)).toMatch(/^data:image\/svg\+xml/);
      }
    },
  );
  it("uses a pinned SVGL asset URL for less common brands", () => {
    const logo = resolveBrandLogo("Airbnb")!;
    expect(logo.artwork).toBeUndefined();
    expect(brandLogoUri(logo, "light")).toMatch(/^https:\/\/svgl.app\/library\/.+\.svg$/);
  });
  it("bundles the official Composio logomark for both themes", () => {
    const logo = resolveBrandLogo("Composio")!;
    expect(brandLogoUri(logo, "light")).toMatch(/^data:image\/svg\+xml/);
    expect(brandLogoUri(logo, "dark")).toMatch(/^data:image\/svg\+xml/);
    expect(logo.artwork?.light).toContain('fill="black"');
    expect(logo.artwork?.dark).toContain('fill="white"');
  });
});
