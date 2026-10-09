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
  ])("resolves catalog/provider alias %s", (name, key) => {
    expect(resolveBrandLogo(name)?.key).toBe(key);
  });
  it("does not assign brands by substring or use inherited object properties", () => {
    for (const name of ["My Google tool", "Slack archive", "Composio", "constructor", "__proto__"])
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
  it("uses a pinned SVGL asset URL for less common brands", () => {
    const logo = resolveBrandLogo("Airbnb")!;
    expect(logo.artwork).toBeUndefined();
    expect(brandLogoUri(logo, "light")).toMatch(/^https:\/\/svgl.app\/library\/.+\.svg$/);
  });
});
