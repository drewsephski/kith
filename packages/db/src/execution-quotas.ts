import type { Prisma } from "./client.js";

export class ExecutionQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionQuotaError";
  }
}

/** A managed limit cannot be disabled accidentally with zero or invalid configuration. */
export function executionLimit(
  name: string,
  managedDefault: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const managed = env.MODEL_EXECUTION_MODE === "managed";
  const raw = env[name]?.trim();
  if (!raw) return managed ? managedDefault : 0;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < (managed ? 1 : 0))
    throw new Error(`${name} must be ${managed ? "a positive" : "a nonnegative"} integer`);
  return value;
}

/** Call inside the transaction that creates the run, after checking delivery idempotency. */
export async function assertRunCreationQuota(
  tx: Pick<Prisma.TransactionClient, "$queryRaw" | "run">,
  userId: string,
): Promise<void> {
  const limit = executionLimit("MAX_RUNS_PER_USER_PER_DAY", 100);
  if (!limit) return;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 3))::text AS lock`;
  const [{ dayStart }] = await tx.$queryRaw<[{ dayStart: Date }]>`
    SELECT date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS "dayStart"
  `;
  const count = await tx.run.count({ where: { userId, createdAt: { gte: dayStart } } });
  if (count >= limit)
    throw new ExecutionQuotaError("Daily task limit reached. Try again tomorrow.");
}

/** Serializes user-wide lease admission across workers and Spaces. */
export async function runConcurrencyAvailable(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  input: { userId: string; runId: string; rootRunId?: string | null },
): Promise<boolean> {
  const limit = executionLimit("MAX_CONCURRENT_RUNS_PER_USER", 2);
  if (!limit) return true;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.userId}, 3))::text AS lock`;
  // Delegated runs share their parent's slot, so a parent waiting for its child cannot
  // consume the last slot the child needs. Actual provider concurrency has its own fuse.
  const [{ count }] = await tx.$queryRaw<[{ count: bigint }]>`
    SELECT count(DISTINCT COALESCE("rootRunId", id)) AS count FROM runs
    WHERE "userId" = ${input.userId} AND status IN ('leased', 'running')
      AND "leaseExpiresAt" > CURRENT_TIMESTAMP
      AND COALESCE("rootRunId", id) <> ${input.rootRunId ?? input.runId}
  `;
  return count < BigInt(limit);
}
