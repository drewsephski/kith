import path from "node:path";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "frontend.acceptance.ts",
  outputDir: path.resolve(import.meta.dirname, "../test-results/frontend"),
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: "pnpm --filter @rakazo/web dev",
    cwd: path.resolve(import.meta.dirname, "../../.."),
    url: process.env.PLAYWRIGHT_BASE_URL!,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
