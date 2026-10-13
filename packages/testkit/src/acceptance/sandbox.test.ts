import type { AdapterContext } from "@rakazo/adapter-kit";
import { FakeSandboxProvider } from "@rakazo/adapters";
import { expect, it, vi } from "vitest";
import { observeSandbox } from "./sandbox.js";

const context: AdapterContext = {
  operationId: "acceptance",
  traceId: "acceptance",
  userId: "synthetic",
  spaceId: "synthetic",
  signal: new AbortController().signal,
};
const request = { botId: "synthetic", homePath: "/synthetic" };

it("tracks a reference before failed preparation and cleans it up", async () => {
  const provider = new FakeSandboxProvider();
  const observed = observeSandbox(provider, 1);
  vi.spyOn(provider, "prepare").mockRejectedValue(new Error("fixture failure"));
  const ref = await observed.sandbox.provision(request, context);
  await expect(observed.sandbox.prepare(ref, context)).rejects.toThrow();
  await expect(observed.sandbox.provision(request, context)).rejects.toThrow("budget");
  await observed.cleanup(context);
  expect(provider.boxes.size).toBe(0);
  expect(observed.counts).toEqual({ create: 1, resume: 0, prepare: 1, stop: 0, destroy: 1 });
});

it("fails cleanup and retains the reference for a later cleanup attempt", async () => {
  const provider = new FakeSandboxProvider();
  const observed = observeSandbox(provider, 2);
  await observed.sandbox.provision(request, context);
  const destroy = vi.spyOn(provider, "destroy").mockRejectedValueOnce(new Error("fixture"));
  await expect(observed.cleanup(context)).rejects.toThrow("cleanup failed");
  await observed.cleanup(context);
  expect(destroy).toHaveBeenCalledTimes(2);
  expect(provider.boxes.size).toBe(0);
  await expect(observed.sandbox.provision(request, context)).rejects.toThrow("budget");
});
