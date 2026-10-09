import { spawnSync } from "node:child_process";
import { PostgreSqlContainer } from "@testcontainers/postgresql";

const container = await new PostgreSqlContainer("postgres:16-alpine").start();
try {
  const env = {
    ...process.env,
    DATABASE_URL: container.getConnectionUri(),
    DATABASE_DIRECT_URL: container.getConnectionUri(),
    VERIFY_DATABASE: "1",
  };
  const migrated = spawnSync(
    "pnpm",
    ["--filter", "@rakazo/db", "exec", "prisma", "migrate", "deploy"],
    { env, encoding: "utf8" },
  );
  if (migrated.status !== 0) throw new Error("Isolated test migrations failed");
  const result = spawnSync(
    "pnpm",
    ["exec", "vitest", "run", "apps/api/src/calendar.postgres.test.ts"],
    { env, stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
} finally {
  await container.stop();
}
