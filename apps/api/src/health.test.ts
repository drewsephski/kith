import { InfisicalSecretStore } from "@rakazo/adapters";
import type { Pool } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { infisicalFake } from "../../../packages/adapters/src/secret-store-fake.js";
import { checkDatabaseReadiness, healthRoutes } from "./health.js";

const app = healthRoutes(() => ({ runtime: "pi", sandbox: "docker", revision: "abc123" }));

describe("health routes", () => {
  it("recovers after checkout rejection without retaining a pending probe", async () => {
    const query = vi.fn(async () => undefined);
    const release = vi.fn();
    const connect = vi
      .fn()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValue({ query, release });
    const pool = { connect } as unknown as Pool;
    const health = healthRoutes(
      () => ({}),
      (signal) => checkDatabaseReadiness(pool, signal),
    );
    expect((await health.request("/ready")).status).toBe(503);
    expect((await health.request("/ready")).status).toBe(200);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledExactlyOnceWith();
  });
  it("returns an expired checkout without destroying a healthy connection", async () => {
    const query = vi.fn(async () => undefined);
    const release = vi.fn();
    const client = { query, release };
    let finishCheckout!: () => void;
    const pool = {
      connect: vi.fn(
        () =>
          new Promise<typeof client>((resolve) => {
            finishCheckout = () => resolve(client);
          }),
      ),
    } as unknown as Pool;
    const controller = new AbortController();
    const check = checkDatabaseReadiness(pool, controller.signal);
    controller.abort();
    finishCheckout();
    await expect(check).rejects.toThrow("expired");
    expect(query).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledExactlyOnceWith();
  });
  it("does not queue additional probes while an expired checkout is still pending", async () => {
    vi.useFakeTimers();
    try {
      const query = vi.fn(async () => undefined);
      const release = vi.fn();
      const client = { query, release };
      const checkouts: Array<() => void> = [];
      const connect = vi.fn(
        () =>
          new Promise<typeof client>((resolve) => {
            checkouts.push(() => resolve(client));
          }),
      );
      // Reuse the same pool identity across readiness reads.
      const pool = { connect } as unknown as Pool;
      const sharedHealth = healthRoutes(
        () => ({}),
        (signal) => checkDatabaseReadiness(pool, signal),
      );
      const first = sharedHealth.request("/ready");
      await vi.advanceTimersByTimeAsync(3_000);
      expect((await first).status).toBe(503);
      const later = sharedHealth.request("/ready");
      await vi.advanceTimersByTimeAsync(3_000);
      expect((await later).status).toBe(503);
      expect(connect).toHaveBeenCalledTimes(1);
      for (const complete of checkouts) complete();
      await vi.advanceTimersByTimeAsync(0);
      expect(release).toHaveBeenCalledExactlyOnceWith();
      expect(query).not.toHaveBeenCalled();
      connect.mockImplementation(async () => client);
      expect((await sharedHealth.request("/ready")).status).toBe(200);
      expect(connect).toHaveBeenCalledTimes(2);
      expect(query).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(2);
      expect((await sharedHealth.request("/health")).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
  it("bounds readiness latency and shares an in-flight database probe", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const check = vi.fn((nextSignal: AbortSignal) => {
        signal = nextSignal;
        return new Promise(() => {});
      });
      const health = healthRoutes(() => ({}), check);
      const reads = [health.request("/ready"), health.request("/ready")];
      await vi.advanceTimersByTimeAsync(3_000);
      expect((await Promise.all(reads)).map((response) => response.status)).toEqual([503, 503]);
      expect(check).toHaveBeenCalledTimes(1);
      expect(signal?.aborted).toBe(true);
      expect((await health.request("/health")).status).toBe(200);
      check.mockImplementation(async () => undefined);
      expect((await health.request("/ready")).status).toBe(200);
      expect(check).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("destroys a stalled probe connection and recovers without leaking pool slots", async () => {
    vi.useFakeTimers();
    try {
      const release = vi.fn();
      const query = vi.fn(() => new Promise<void>(() => {}));
      const pool = { connect: vi.fn(async () => ({ query, release })) } as unknown as Pool;
      const health = healthRoutes(
        () => ({}),
        (signal) => checkDatabaseReadiness(pool, signal),
      );
      const reads = [health.request("/ready"), health.request("/ready")];
      await vi.advanceTimersByTimeAsync(3_000);
      expect((await Promise.all(reads)).map((r) => r.status)).toEqual([503, 503]);
      expect(release).toHaveBeenCalledExactlyOnceWith(true);
      query.mockImplementation(async () => undefined);
      expect((await health.request("/ready")).status).toBe(200);
      expect(pool.connect).toHaveBeenCalledTimes(2);
      expect(release).toHaveBeenCalledTimes(2);
      expect(release).toHaveBeenLastCalledWith();
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
