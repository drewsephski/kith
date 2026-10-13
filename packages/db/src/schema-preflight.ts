import type { PrismaClient } from "./client.js";

/** Read-only startup gate shared by API and workers for this revision's required schema. */
export async function verifyComputerActivitySchema(prisma: Pick<PrismaClient, "$queryRaw">) {
  try {
    await prisma.$queryRaw`SELECT "lastUsedAt" FROM "computers" LIMIT 0`;
    await prisma.$queryRaw`SELECT "clientNonce" FROM "artifacts" LIMIT 0`;
    await prisma.$queryRaw`SELECT "rootRunId" FROM "runs" LIMIT 0`;
    await prisma.$queryRaw`SELECT "requestKey", "botId" FROM "bot_creation_requests" LIMIT 0`;
    await prisma.$queryRaw`SELECT "runId", "modelId", "expiresAt", "settledAt" FROM "model_call_reservations" LIMIT 0`;
  } catch (error) {
    const metadata = (
      error as {
        meta?: { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } };
      } | null
    )?.meta;
    const code = metadata?.driverAdapterError?.cause?.originalCode ?? metadata?.code;
    if (code === "42703" || code === "42P01")
      throw new Error(
        "Database schema lacks required runtime fields or tables. Apply database migrations before starting this revision.",
      );
    throw error;
  }
}
