import { describe, expect, it, vi } from "vitest";
import { createAuth } from "./index.js";

vi.mock("better-auth/adapters/prisma", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return {
    prismaAdapter: (prisma: { authData: Record<string, unknown[]> }) =>
      memoryAdapter(prisma.authData),
  };
});

describe("trusted auth client IP", () => {
  function fixture(clientIpHeader?: string) {
    const data: Record<string, Record<string, unknown>[]> = {
      user: [],
      account: [],
      session: [],
      verification: [],
      rateLimit: [],
    };
    const auth = createAuth(
      {
        authData: data,
        deploymentSettings: { findUnique: vi.fn(async () => null) },
      } as never,
      {
        secret: "offline-auth-secret-with-at-least-32-characters",
        baseURL: "https://app.example.test",
        webOrigin: "https://app.example.test",
        signupsEnabled: undefined,
        signupAllowlist: undefined,
        clientIpHeader,
      },
    );
    return { auth, data };
  }

  it("keeps the default header selection for deployments without normalization", async () => {
    const { auth } = fixture();
    expect((await auth.$context).options.advanced?.ipAddress).toBeUndefined();
  });

  it("selects only the synthesized IP and rate limits users independently", async () => {
    const { auth, data } = fixture("x-kith-client-ip");
    const context = await auth.$context;
    expect(context.options.advanced?.ipAddress?.ipAddressHeaders).toEqual(["x-kith-client-ip"]);
    context.rateLimit.enabled = true;
    const attempt = (ip: string) =>
      auth.handler(
        new Request("https://app.example.test/api/auth/sign-in/email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://app.example.test",
            "x-kith-client-ip": ip,
            "x-forwarded-for": "198.51.100.99",
          },
          body: "{}",
        }),
      );
    for (let index = 0; index < 10; index += 1)
      expect((await attempt("203.0.113.7")).status).toBe(400);
    expect((await attempt("203.0.113.7")).status).toBe(429);
    expect((await attempt("203.0.113.8")).status).toBe(400);
    expect(data.rateLimit?.map((row) => row.key)).toEqual(
      expect.arrayContaining(["203.0.113.7|/sign-in/email", "203.0.113.8|/sign-in/email"]),
    );
  });
});
