import type { ConfigContext, ExpoConfig } from "expo/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import configure from "../app.config";
import { hostedServiceOrigin } from "./service-url.cjs";

afterEach(() => vi.unstubAllEnvs());

describe("hosted service release configuration", () => {
  const context: ConfigContext = {
    projectRoot: "/example",
    staticConfigPath: null,
    packageJsonPath: null,
    config: { name: "Example", slug: "example", extra: { other: true } },
  };

  it("embeds only the public origin while preserving other Expo configuration", () => {
    vi.stubEnv("RAKAZO_SERVICE_URL", "https://service.example.test/");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://legacy.example.test");
    const config: ExpoConfig = configure(context);
    expect(config.extra).toEqual({ other: true, rakazoServiceUrl: "https://service.example.test" });
  });

  it("accepts the legacy endpoint for production builds", () => {
    vi.stubEnv("RAKAZO_SERVICE_URL", undefined);
    vi.stubEnv("EAS_BUILD_PROFILE", "production");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://legacy.example.test");
    expect(configure(context).extra?.rakazoServiceUrl).toBe("https://legacy.example.test");
  });

  it("fails the production build when there is no hosted service", () => {
    vi.stubEnv("RAKAZO_SERVICE_URL", undefined);
    vi.stubEnv("EXPO_PUBLIC_API_URL", undefined);
    vi.stubEnv("EAS_BUILD_PROFILE", "production");
    expect(() => configure(context)).toThrow("RAKAZO_SERVICE_URL must be set");
  });

  it.each([
    "http://service.example.test",
    "https://user:secret@service.example.test",
    "https://service.example.test/app",
    "https://service.example.test?secret=value",
    "https://service.example.test#return",
    "https://localhost",
    "https://localhost.",
    "https://[::ffff:127.0.0.1]",
    "https://127.0.0.1",
    "https://2130706433",
    "https://192.168.1.10",
    "https://10.0.0.1",
    "https://100.64.0.1",
    "https://[::1]",
    "https://[fd00::1]",
  ])("rejects unsafe or unusable public release configuration: %s", (value) => {
    expect(() => hostedServiceOrigin(value)).toThrow();
  });
});
