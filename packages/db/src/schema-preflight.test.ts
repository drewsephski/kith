import { expect, it, vi } from "vitest";
import { verifyComputerActivitySchema } from "./schema-preflight.js";

const probes = [
  'SELECT "lastUsedAt" FROM "computers" LIMIT 0',
  'SELECT "clientNonce" FROM "artifacts" LIMIT 0',
  'SELECT "rootRunId" FROM "runs" LIMIT 0',
  'SELECT "requestKey", "botId" FROM "bot_creation_requests" LIMIT 0',
  'SELECT "runId", "modelId", "expiresAt", "settledAt" FROM "model_call_reservations" LIMIT 0',
];

it("probes the required schema without reading computer, account or conversation data", async () => {
  const query = vi.fn().mockResolvedValue([]);
  await verifyComputerActivitySchema({ $queryRaw: query });
  expect(query.mock.calls.map(([sql]) => sql.join(""))).toEqual(probes);
  expect(query.mock.calls.every((call) => call.length === 1)).toBe(true);
});
it.each(["42703", "42P01"])(
  "fails startup with an actionable missing-schema error (%s)",
  async (code) => {
    const query = vi
      .fn()
      .mockRejectedValue({ meta: { code }, message: "private database details" });
    await expect(verifyComputerActivitySchema({ $queryRaw: query })).rejects.toThrow(
      "Apply database migrations",
    );
  },
);
it.each(probes)("refuses startup when a required probe is missing: %s", async (missingProbe) => {
  const failure = { meta: { driverAdapterError: { cause: { originalCode: "42703" } } } };
  const query = vi
    .fn()
    .mockImplementation((sql: TemplateStringsArray) =>
      sql.join("") === missingProbe ? Promise.reject(failure) : Promise.resolve([]),
    );
  await expect(verifyComputerActivitySchema({ $queryRaw: query })).rejects.toThrow(
    "Apply database migrations",
  );
  expect(query).toHaveBeenCalledTimes(probes.indexOf(missingProbe) + 1);
});
it("retains an infrastructure failure instead of misclassifying it as a migration", async () => {
  const failure = new Error("synthetic database unavailable");
  await expect(
    verifyComputerActivitySchema({ $queryRaw: vi.fn().mockRejectedValue(failure) }),
  ).rejects.toBe(failure);
});
