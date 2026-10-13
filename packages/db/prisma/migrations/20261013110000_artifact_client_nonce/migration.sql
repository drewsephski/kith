ALTER TABLE "artifacts" ADD COLUMN "clientNonce" TEXT;
CREATE UNIQUE INDEX "artifacts_spaceId_userId_clientNonce_key"
  ON "artifacts" ("spaceId", "userId", "clientNonce");
