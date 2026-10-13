-- Preserve the spend scope across asynchronous cloud-agent generations and wakes.
ALTER TABLE "cloud_agents" ADD COLUMN "rootRunId" TEXT;

-- Existing card origins provide a conservative budget for legacy generations.
-- Unattributable managed rows retain their result without starting a funded wake.
UPDATE "cloud_agents" AS agent
SET "rootRunId" = COALESCE(origin."rootRunId", origin.id)
FROM "messages" AS card
JOIN "runs" AS origin ON origin.id = card."runId"
WHERE card.id = agent."messageId"
  AND card."threadId" = agent."threadId"
  AND origin."threadId" = agent."threadId"
  AND origin."botId" = agent."botId"
  AND origin."userId" = agent."userId"
  AND origin."spaceId" = agent."spaceId";
