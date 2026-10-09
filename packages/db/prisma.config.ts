import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";
import { resolveDatabaseUrls } from "./src/connections.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.resolve(here, "../../.env");
if (existsSync(rootEnv)) config({ path: rootEnv });
config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: resolveDatabaseUrls({
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || "postgres://rakazo:rakazo@127.0.0.1:5433/rakazo",
    }).directDatabaseUrl,
  },
});
