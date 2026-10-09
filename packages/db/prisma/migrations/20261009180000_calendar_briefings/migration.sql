CREATE TABLE "calendar_authorizations" (
 "connectionId" TEXT PRIMARY KEY REFERENCES "connections"("id") ON DELETE CASCADE,
 "stateHash" TEXT NOT NULL UNIQUE, "secretId" TEXT NOT NULL, "botId" TEXT NOT NULL,
 "timezone" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3)
);
CREATE TABLE "calendar_briefings" (
 "id" TEXT PRIMARY KEY, "runId" TEXT NOT NULL UNIQUE REFERENCES "runs"("id") ON DELETE CASCADE,
 "connectionId" TEXT REFERENCES "connections"("id") ON DELETE SET NULL,
 "generation" TEXT NOT NULL, "attemptBase" INTEGER NOT NULL DEFAULT 0, "timezone" TEXT NOT NULL, "snapshot" JSONB,
 "outcome" TEXT, "suggestions" JSONB NOT NULL DEFAULT '[]', "suggestionStatus" TEXT,
 "memorySources" JSONB NOT NULL DEFAULT '[]', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("connectionId", "generation")
);
