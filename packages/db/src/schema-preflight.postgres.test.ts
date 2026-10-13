import { afterAll, expect, it } from "vitest";
import { createDb } from "./client.js";
import { verifyComputerActivitySchema } from "./schema-preflight.js";

const enabled = process.env.VERIFY_DATABASE === "1" && Boolean(process.env.DATABASE_URL);
let database: ReturnType<typeof createDb> | undefined;
afterAll(async () => {
  await database?.prisma.$disconnect();
  await database?.pool.end();
});
it.skipIf(!enabled)(
  "refuses the old computer schema and remains usable after rollback",
  async () => {
    database = createDb(process.env.DATABASE_URL!);
    await verifyComputerActivitySchema(database.prisma);
    // Only this harness-owned, migrated test database is modified. The failed
    // transaction rolls its rename back before any other journey can start.
    await expect(
      database.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`ALTER TABLE "computers" RENAME COLUMN "lastUsedAt" TO "preflight_fixture_lastUsedAt"`;
        await verifyComputerActivitySchema(tx);
      }),
    ).rejects.toThrow("Apply database migrations");
    await verifyComputerActivitySchema(database.prisma);
  },
);
