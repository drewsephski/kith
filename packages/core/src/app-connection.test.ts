import type { Connection } from "@rakazo/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForAppConnection } from "./app-connection.js";

const row = (status: Connection["status"]): Connection => ({
  id: "account",
  connectorId: "managed",
  provider: "gmail",
  displayName: "Email",
  status,
  createdAt: new Date().toISOString(),
  capabilities: [],
});
afterEach(() => vi.useRealTimers());
it("polls the same authorization until connected", async () => {
  const complete = vi
    .fn()
    .mockResolvedValueOnce(row("pending"))
    .mockResolvedValue(row("connected"));
  await expect(waitForAppConnection(complete, { pollIntervalMs: 0 })).resolves.toMatchObject({
    status: "connected",
  });
  expect(complete).toHaveBeenCalledTimes(2);
});
it.each(["error", "revoked"] as const)("stops on terminal status %s", async (status) => {
  const complete = vi.fn().mockResolvedValue(row(status));
  await expect(waitForAppConnection(complete)).resolves.toMatchObject({ status });
  expect(complete).toHaveBeenCalledTimes(1);
});
it("returns pending after the bound without starting another sign-in", async () => {
  const complete = vi.fn().mockResolvedValue(row("pending"));
  await expect(
    waitForAppConnection(complete, { attempts: 2, pollIntervalMs: 0 }),
  ).resolves.toMatchObject({ status: "pending" });
  expect(complete).toHaveBeenCalledTimes(2);
});
it("propagates provider errors", async () => {
  const complete = vi.fn().mockRejectedValue(new Error("Unavailable"));
  await expect(waitForAppConnection(complete)).rejects.toThrow("Unavailable");
  expect(complete).toHaveBeenCalledTimes(1);
});
it("aborting during a pending wait prevents another completion request", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const complete = vi.fn().mockResolvedValue(row("pending"));
  const result = waitForAppConnection(complete, { signal: controller.signal });
  const rejected = expect(result).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await rejected;
  expect(complete).toHaveBeenCalledTimes(1);
});

const connection = (status: Connection["status"]) => ({ status }) as Connection;

describe("authorization completion polling", () => {
  it("polls only completion until the existing connection is active", async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(connection("pending"))
      .mockResolvedValue(connection("connected"));
    await expect(
      waitForAppConnection(complete, { attempts: 3, pollIntervalMs: 0 }),
    ).resolves.toEqual(connection("connected"));
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("returns pending when the bounded authorization window expires", async () => {
    const complete = vi.fn(async () => connection("pending"));
    await expect(
      waitForAppConnection(complete, { attempts: 2, pollIntervalMs: 0 }),
    ).resolves.toEqual(connection("pending"));
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("never polls after scope cancellation or repeats a failed completion", async () => {
    const controller = new AbortController();
    const complete = vi.fn(async () => {
      controller.abort();
      return connection("pending");
    });
    await expect(
      waitForAppConnection(complete, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(complete).toHaveBeenCalledOnce();
    const failure = vi.fn(async () => {
      throw new Error("Connection check failed");
    });
    await expect(waitForAppConnection(failure)).rejects.toThrow("Connection check failed");
    expect(failure).toHaveBeenCalledOnce();
  });
});
