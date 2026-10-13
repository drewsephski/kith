CREATE UNIQUE INDEX "bots_id_spaceId_userId_key" ON "bots"("id", "spaceId", "userId");

CREATE TABLE "bot_creation_requests" (
  "id" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "botId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bot_creation_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bot_creation_requests_spaceId_userId_requestKey_key"
  ON "bot_creation_requests"("spaceId", "userId", "requestKey");
CREATE INDEX "bot_creation_requests_botId_idx" ON "bot_creation_requests"("botId");
CREATE INDEX "bot_creation_requests_userId_idx" ON "bot_creation_requests"("userId");
ALTER TABLE "bot_creation_requests" ADD CONSTRAINT "bot_creation_requests_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bot_creation_requests" ADD CONSTRAINT "bot_creation_requests_botId_fkey"
  FOREIGN KEY ("botId") REFERENCES "bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Clear only the target on deletion: keep the scoped request as a tombstone.
-- This extra constraint rejects cross-account and cross-Space mappings in SQL.
ALTER TABLE "bot_creation_requests" ADD CONSTRAINT "bot_creation_requests_bot_scope_fkey"
  FOREIGN KEY ("botId", "spaceId", "userId") REFERENCES "bots"("id", "spaceId", "userId")
  ON DELETE SET NULL ("botId") ON UPDATE CASCADE;

ALTER TABLE "bot_creation_requests" ADD CONSTRAINT "bot_creation_requests_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
