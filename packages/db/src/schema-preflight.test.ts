import { expect, it, vi } from "vitest";
import { verifyComputerActivitySchema } from "./schema-preflight.js";

it("probes the required column without reading any computer or account data", async () => {
  const query = vi.fn().mockResolvedValue([]);
  await verifyComputerActivitySchema({ $queryRaw: query });
  expect(query.mock.calls[0]?.[0].join("")).toBe('SELECT "lastUsedAt" FROM "computers" LIMIT 0');
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
it("retains an infrastructure failure instead of misclassifying it as a migration", async () => {
  const failure = new Error("synthetic database unavailable");
  await expect(
    verifyComputerActivitySchema({ $queryRaw: vi.fn().mockRejectedValue(failure) }),
  ).rejects.toBe(failure);
});
