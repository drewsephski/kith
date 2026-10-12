ALTER TABLE "computers" ADD COLUMN "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "computers" SET "lastUsedAt" = "updatedAt";
