-- Pre-inference reservations survive worker failure and financial-history deletion.
CREATE TABLE "model_call_reservations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "spaceId" TEXT,
  "runId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "settledAt" TIMESTAMPTZ
);
CREATE INDEX "model_call_reservations_userId_createdAt_idx" ON "model_call_reservations"("userId", "createdAt");
CREATE INDEX "model_call_reservations_userId_expiresAt_idx" ON "model_call_reservations"("userId", "expiresAt");
CREATE INDEX "model_call_reservations_runId_idx" ON "model_call_reservations"("runId");
CREATE INDEX "runs_userId_createdAt_idx" ON "runs"("userId", "createdAt");

ALTER TABLE "model_call_reservations" ADD CONSTRAINT "model_call_reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE;
ALTER TABLE "model_call_reservations" ADD CONSTRAINT "model_call_reservations_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"(id) ON DELETE SET NULL;
ALTER TABLE "runs" ADD COLUMN "rootRunId" TEXT;
