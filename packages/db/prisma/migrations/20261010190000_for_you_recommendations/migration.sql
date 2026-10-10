CREATE TABLE "for_you_recommendations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "assistantId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'available',
  "snoozedUntil" TIMESTAMP(3),
  "operationId" TEXT NOT NULL,
  "launchedBotId" TEXT,
  "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "for_you_recommendations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "for_you_recommendations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
  CONSTRAINT "for_you_recommendations_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE,
  CONSTRAINT "for_you_recommendations_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "bots"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "for_you_recommendations_userId_spaceId_assistantId_sourceKey_key" ON "for_you_recommendations"("userId", "spaceId", "assistantId", "sourceKey");
CREATE INDEX "for_you_recommendations_userId_spaceId_assistantId_state_idx" ON "for_you_recommendations"("userId", "spaceId", "assistantId", "state");
