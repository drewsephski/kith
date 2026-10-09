import { describe, expect, it } from "vitest";
import { resolvePublicConfig } from "../public-config.mjs";

describe("public platform configuration", () => {
  it("keeps an unconfigured local build unindexed and without fabricated downloads", () => {
    expect(resolvePublicConfig({})).toEqual({ siteUrl: "http://localhost:4321", appUrl: null, indexed: false, downloads: { mac: null, windows: null, linux: null } });
  });
  it("requires distinct explicit deployment origins", () => {
    expect(() => resolvePublicConfig({ VERCEL: "1" })).toThrow("Set PUBLIC_SITE_URL");
    expect(() => resolvePublicConfig({ PUBLIC_SITE_URL: "https://example.test", PUBLIC_APP_URL: "https://example.test" })).toThrow("different");
    expect(resolvePublicConfig({ VERCEL: "1", PUBLIC_SITE_URL: "https://www.example.test/", PUBLIC_APP_URL: "https://app.example.test/" }).appUrl).toBe("https://app.example.test");
  });
  it.each(["http://example.test", "https://user:secret@example.test", "https://example.test/?token=private", "https://example.test/#secret", "https://127.0.0.1", "https://server.internal", "https://example.test/path"])("rejects unsafe or non-origin configuration: %s", (url) => {
    expect(() => resolvePublicConfig({ VERCEL: "1", PUBLIC_SITE_URL: url, PUBLIC_APP_URL: "https://app.example.test" })).toThrow();
  });
  it("allows local HTTP origins only for local development", () => {
    expect(resolvePublicConfig({ PUBLIC_APP_URL: "http://localhost:5173" }).appUrl).toBe("http://localhost:5173");
    expect(() => resolvePublicConfig({ VERCEL: "1", PUBLIC_SITE_URL: "https://example.test", PUBLIC_APP_URL: "http://localhost:5173" })).toThrow();
  });
  it.each(["https://[2001:db8::1]", "https://0x7f000001", "https://2130706433"])("rejects canonicalized IP literals without Node middleware dependencies: %s", (url) => {
    expect(() => resolvePublicConfig({ VERCEL: "1", PUBLIC_SITE_URL: url, PUBLIC_APP_URL: "https://app.example.test" })).toThrow();
  });
  it("accepts explicit release paths while rejecting credential-bearing download URLs", () => {
    expect(resolvePublicConfig({ PUBLIC_DESKTOP_MAC_URL: "https://github.com/example/project/releases/download/v1/app.dmg" }).downloads.mac).toContain("app.dmg");
    expect(() => resolvePublicConfig({ PUBLIC_DESKTOP_MAC_URL: "https://example.test/app.dmg?token=secret" })).toThrow();
  });
});
