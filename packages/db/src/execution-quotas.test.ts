import { afterEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "./client.js";
import {
  assertRunCreationQuota,
  executionLimit,
  resolveModelExecutionMode,
  runConcurrencyAvailable,
} from "./execution-quotas.js";

afterEach(() => vi.unstubAllEnvs());

describe("execution admission", () => {
  it("normalizes managed whitespace consistently and rejects disabled caps", () => {
    expect(resolveModelExecutionMode({ MODEL_EXECUTION_MODE: " managed " })).toBe("managed");
    expect(executionLimit("TEST_LIMIT", 2, { MODEL_EXECUTION_MODE: " managed " })).toBe(2);
    expect(() =>
      executionLimit("TEST_LIMIT", 2, { MODEL_EXECUTION_MODE: " managed ", TEST_LIMIT: "0" }),
    ).toThrow("positive integer");
    expect(resolveModelExecutionMode({ MODEL_EXECUTION_MODE: " self-hosted " })).toBe(
      "self-hosted",
    );
    expect(() => resolveModelExecutionMode({ MODEL_EXECUTION_MODE: " invalid " })).toThrow(
      "MODEL_EXECUTION_MODE",
    );
  });
  it("has finite managed defaults and preserves unconfigured self-hosted behavior", () => {
    expect(executionLimit("TEST_LIMIT", 2, { MODEL_EXECUTION_MODE: "managed" })).toBe(2);
    expect(executionLimit("TEST_LIMIT", 2, { MODEL_EXECUTION_MODE: "self-hosted" })).toBe(0);
    for (const value of ["0", "-1", "NaN", "1.1", "Infinity"])
      expect(() =>
        executionLimit("TEST_LIMIT", 2, { MODEL_EXECUTION_MODE: "managed", TEST_LIMIT: value }),
      ).toThrow();
  });

  it("rejects daily admission under the user lock across Spaces", async () => {
    vi.stubEnv("MODEL_EXECUTION_MODE", "managed");
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ dayStart: new Date("2026-10-13T00:00:00Z") }]);
    const count = vi.fn().mockResolvedValue(100);
    const tx = { $queryRaw: query, run: { count } } as unknown as Prisma.TransactionClient;
    await expect(assertRunCreationQuota(tx, "fixture-user")).rejects.toThrow("Daily task limit");
    expect(query).toHaveBeenCalledTimes(2);
    expect(count).toHaveBeenCalledWith({
      where: { userId: "fixture-user", createdAt: { gte: new Date("2026-10-13T00:00:00Z") } },
    });
    expect(query.mock.invocationCallOrder[0]).toBeLessThan(count.mock.invocationCallOrder[0]!);
  });

  it("counts live leases only and excludes the reclaimed run", async () => {
    vi.stubEnv("MODEL_EXECUTION_MODE", "managed");
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 2n }]);
    const tx = { $queryRaw: query } as unknown as Prisma.TransactionClient;
    await expect(
      runConcurrencyAvailable(tx, { userId: "fixture-user", runId: "fixture-run" }),
    ).resolves.toBe(false);
    expect(query.mock.calls[1]?.slice(1)).toEqual(["fixture-user", "fixture-run"]);
  });
});
