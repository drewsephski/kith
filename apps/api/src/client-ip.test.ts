import { describe, expect, it } from "vitest";
import type { AuthClientIpConfig } from "./client-ip.js";
import {
  AUTH_CLIENT_IP_HEADER,
  AUTH_PROXY_TOKEN_HEADER,
  authRequestWithClientIp,
} from "./client-ip.js";

const config: AuthClientIpConfig = {
  edgeHeader: "fly-client-ip",
  forwardedHeader: "x-vercel-forwarded-for",
  proxySecret: "offline-proxy-secret-with-at-least-32-characters",
};
const request = (headers: Record<string, string>) =>
  new Request("https://app.example.test/api/auth/sign-in/email", { headers });
const normalize = (headers: Record<string, string>) =>
  authRequestWithClientIp(request(headers), config).headers;

describe("auth client IP boundary", () => {
  it("uses authenticated upstream IPs and removes the proxy secret", () => {
    const headers = normalize({
      [AUTH_PROXY_TOKEN_HEADER]: config.proxySecret!,
      "x-vercel-forwarded-for": "203.0.113.7",
      "fly-client-ip": "192.0.2.20",
      [AUTH_CLIENT_IP_HEADER]: "198.51.100.99",
      cookie: "session=offline-fixture",
    });
    expect(headers.get(AUTH_CLIENT_IP_HEADER)).toBe("203.0.113.7");
    expect(headers.has(AUTH_PROXY_TOKEN_HEADER)).toBe(false);
    expect(headers.get("cookie")).toBe("session=offline-fixture");
  });

  it.each([undefined, "wrong-secret", `${config.proxySecret}, ${config.proxySecret}`])(
    "ignores spoofed forwarded/synthesized IPs without a valid token: %s",
    (token) => {
      const headers = normalize({
        ...(token ? { [AUTH_PROXY_TOKEN_HEADER]: token } : {}),
        "x-vercel-forwarded-for": "203.0.113.7",
        "x-forwarded-for": "198.51.100.99",
        "fly-client-ip": "192.0.2.20",
        [AUTH_CLIENT_IP_HEADER]: "198.51.100.99",
      });
      expect(headers.get(AUTH_CLIENT_IP_HEADER)).toBe("192.0.2.20");
      expect(headers.has(AUTH_PROXY_TOKEN_HEADER)).toBe(false);
    },
  );

  it.each(["203.0.113.7, 192.0.2.20", "not-an-ip", "203.0.113.7:1234", "fe80::1%eth0"])(
    "falls back to the edge for invalid upstream IPs: %s",
    (ip) => {
      expect(
        normalize({
          [AUTH_PROXY_TOKEN_HEADER]: config.proxySecret!,
          "x-vercel-forwarded-for": ip,
          "fly-client-ip": "192.0.2.20",
        }).get(AUTH_CLIENT_IP_HEADER),
      ).toBe("192.0.2.20");
    },
  );

  it("accepts single IPv6 addresses", () => {
    expect(
      normalize({
        [AUTH_PROXY_TOKEN_HEADER]: config.proxySecret!,
        "x-vercel-forwarded-for": "2001:db8::7",
      }).get(AUTH_CLIENT_IP_HEADER),
    ).toBe("2001:db8::7");
  });

  it("does not retain a caller's IP when no trustworthy address is available", () => {
    expect(
      normalize({
        [AUTH_CLIENT_IP_HEADER]: "198.51.100.99",
        "fly-client-ip": "192.0.2.20, 203.0.113.1",
      }).has(AUTH_CLIENT_IP_HEADER),
    ).toBe(false);
  });

  it("preserves the original request and its body", async () => {
    const original = new Request("https://app.example.test/api/auth/sign-in/email", {
      method: "POST",
      headers: { [AUTH_PROXY_TOKEN_HEADER]: config.proxySecret!, "fly-client-ip": "192.0.2.20" },
      body: JSON.stringify({ email: "fixture@example.test" }),
    });
    const normalized = authRequestWithClientIp(original, config);
    expect(original.headers.has(AUTH_PROXY_TOKEN_HEADER)).toBe(true);
    expect(normalized.method).toBe("POST");
    await expect(normalized.json()).resolves.toEqual({ email: "fixture@example.test" });
  });

  it("preserves self-hosted defaults while stripping any upstream credential", () => {
    const original = request({ "x-forwarded-for": "203.0.113.7" });
    expect(authRequestWithClientIp(original, undefined)).toBe(original);
    const headers = authRequestWithClientIp(
      request({ [AUTH_PROXY_TOKEN_HEADER]: config.proxySecret!, "x-forwarded-for": "203.0.113.7" }),
      undefined,
    ).headers;
    expect(headers.has(AUTH_PROXY_TOKEN_HEADER)).toBe(false);
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.7");
  });
});
