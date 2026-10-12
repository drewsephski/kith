-- Establish the default once for existing assistant bindings. Future unpins remain user-owned.
UPDATE "bots" AS b
SET "pinned" = TRUE
FROM "personal_assistants" AS a
WHERE b."id" = a."botId"
  AND b."spaceId" = a."spaceId"
  AND b."userId" = a."userId"
  AND b."archivedAt" IS NULL;
