ALTER TABLE "routines" ADD COLUMN "taskStarterSpec" JSONB;
ALTER TABLE "scratchpad_items" ADD COLUMN "sourceActionKey" TEXT;
CREATE UNIQUE INDEX "scratchpad_items_sourceActionKey_key" ON "scratchpad_items"("sourceActionKey");
CREATE TABLE "task_starter_executions" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "starter" TEXT NOT NULL,
  "action" TEXT NOT NULL DEFAULT 'read',
  "input" JSONB NOT NULL,
  "connections" JSONB NOT NULL,
  "result" JSONB,
  "reconciliationRequired" BOOLEAN NOT NULL DEFAULT false,
  "sourceExecutionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "task_starter_executions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_starter_executions_runId_fkey" FOREIGN KEY ("runId") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "task_starter_executions_runId_key" ON "task_starter_executions"("runId");
CREATE UNIQUE INDEX "task_starter_executions_sourceExecutionId_action_key" ON "task_starter_executions"("sourceExecutionId", "action");
