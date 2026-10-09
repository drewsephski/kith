import type { Connection } from "@rakazo/contracts";
import { afterEach, expect, it, vi } from "vitest";
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
