import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client.js";
import { verifyComputerActivitySchema } from "./schema-preflight.js";

const enabled = process.env.VERIFY_DATABASE === "1" && Boolean(process.env.DATABASE_URL);
let database: ReturnType<typeof createDb> | undefined;
afterAll(async () => {
  await database?.prisma.$disconnect();
  await database?.pool.end();
});
describe.skipIf(!enabled)("required startup schema", () => {
  beforeAll(async () => {
    database = createDb(process.env.DATABASE_URL!);
    await verifyComputerActivitySchema(database.prisma);
  });

  it.each([
    [
      "computer activity",
      'ALTER TABLE "computers" RENAME COLUMN "lastUsedAt" TO "preflight_fixture_lastUsedAt"',
    ],
    [
      "artifact delivery identity",
      'ALTER TABLE "artifacts" RENAME COLUMN "clientNonce" TO "preflight_fixture_clientNonce"',
    ],
    [
      "delegated run attribution",
      'ALTER TABLE "runs" RENAME COLUMN "rootRunId" TO "preflight_fixture_rootRunId"',
    ],
    [
      "bot creation requests",
      'ALTER TABLE "bot_creation_requests" RENAME TO "preflight_fixture_bot_creation_requests"',
    ],
    [
      "model call reservations",
      'ALTER TABLE "model_call_reservations" RENAME TO "preflight_fixture_model_call_reservations"',
    ],
  ])("refuses missing %s and remains usable after rollback", async (_description, rename) => {
    // Only the harness-owned migrated database is modified. Each failed
    // transaction rolls its rename back before the next probe or journey.
    await expect(
      database!.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(rename);
        await verifyComputerActivitySchema(tx);
      }),
    ).rejects.toThrow("Apply database migrations");
    await verifyComputerActivitySchema(database!.prisma);
  });
});
