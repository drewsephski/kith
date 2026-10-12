import { InfisicalSecretStore } from "@rakazo/adapters";
import { describe, expect, it, vi } from "vitest";
import { infisicalFake } from "../../../packages/adapters/src/secret-store-fake.js";
import { healthRoutes } from "./health.js";

const app = healthRoutes(() => ({ runtime: "pi", sandbox: "docker", revision: "abc123" }));

describe("health routes", () => {
  it("bounds readiness latency and shares an in-flight database probe", async () => {
    vi.useFakeTimers();
    try {
      const check = vi.fn(() => new Promise(() => {}));
      const health = healthRoutes(() => ({}), check);
      const reads = [health.request("/ready"), health.request("/ready")];
      await vi.advanceTimersByTimeAsync(3_000);
      expect((await Promise.all(reads)).map((response) => response.status)).toEqual([503, 503]);
      expect(check).toHaveBeenCalledTimes(1);
      expect((await health.request("/health")).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
  it("fails readiness during a database outage without changing liveness or leaking errors", async () => {
    let offline = true;
    let probes = 0;
    const health = healthRoutes(
      () => ({ revision: "abc123" }),
      async () => {
        probes++;
        if (offline) throw new Error("private database quota details");
      },
    );
    expect((await health.request("/health")).status).toBe(200);
    expect(probes).toBe(0);
    const unavailable = await health.request("/ready");
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("cache-control")).toBe("no-store");
    await expect(unavailable.json()).resolves.toEqual({ ok: false, degraded: true });
    const internal = await health.request("/internal/health");
    await expect(internal.json()).resolves.toEqual({
      ok: false,
      revision: "abc123",
      degraded: true,
      database: false,
    });
    offline = false;
    expect((await health.request("/ready")).status).toBe(200);
  });
  it("reports degraded readiness during a store outage and recovers on later reads", async () => {
    const fake = infisicalFake();
    const writer = new InfisicalSecretStore(fake.options);
    const record = await writer.put("fake", {
      operationId: "test",
      traceId: "test",
      userId: "test",
      spaceId: "test",
      signal: new AbortController().signal,
    });
    await writer.close();
    fake.offline = true;
    const store = new InfisicalSecretStore(fake.options);
    await store.start();
    const health = healthRoutes(() => ({ degraded: store.describe().capabilities.degraded }));
    try {
      const response = await health.request("/ready");
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ ok: false, degraded: true });
      expect((await health.request("/health")).status).toBe(200);
      fake.offline = false;
      await store.load(record.ref, record.id);
      expect((await health.request("/ready")).status).toBe(200);
    } finally {
      await store.close();
    }
  });
  it("keeps public liveness free of deployment details", async () => {
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("serves details to direct requests on the API port", async () => {
    const response = await app.request("/internal/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      runtime: "pi",
      sandbox: "docker",
      revision: "abc123",
      degraded: false,
    });
  });

  it("hides details from requests that came through a reverse proxy", async () => {
    for (const headers of [
      { "x-forwarded-for": "203.0.113.7" },
      { forwarded: "for=203.0.113.7;proto=https" },
    ]) {
      const response = await app.request("/internal/health", { headers });
      expect(response.status).toBe(404);
    }
  });
});
