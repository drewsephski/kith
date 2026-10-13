import type { PrismaClient } from "./client.js";

/** Read-only startup gate for the activity column required by computer idle fencing. */
export async function verifyComputerActivitySchema(prisma: Pick<PrismaClient, "$queryRaw">) {
  try {
    await prisma.$queryRaw`SELECT "lastUsedAt" FROM "computers" LIMIT 0`;
  } catch (error) {
    const metadata = (
      error as {
        meta?: { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } };
      } | null
    )?.meta;
    const code = metadata?.driverAdapterError?.cause?.originalCode ?? metadata?.code;
    if (code === "42703" || code === "42P01")
      throw new Error(
        "Database schema lacks computer activity. Apply database migrations before starting this revision.",
      );
    throw error;
  }
}
