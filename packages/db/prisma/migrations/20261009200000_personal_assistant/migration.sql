CREATE TABLE "personal_assistants" (
  "spaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  CONSTRAINT "personal_assistants_pkey" PRIMARY KEY ("spaceId", "userId"),
  CONSTRAINT "personal_assistants_botId_fkey" FOREIGN KEY ("botId") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "personal_assistants_botId_idx" ON "personal_assistants"("botId");
