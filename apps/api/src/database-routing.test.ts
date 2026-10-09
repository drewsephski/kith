import type * as Adapters from "@rakazo/adapters";
import type * as Database from "@rakazo/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(),
  createPool: vi.fn(),
  realtime: vi.fn(),
}));
vi.mock("@rakazo/db", async (original) => ({
  ...(await original<typeof Database>()),
  createDb: mocks.createDb,
  createPool: mocks.createPool,
}));
vi.mock("@rakazo/adapters", async (original) => ({
  ...(await original<typeof Adapters>()),
  PostgresRealtimeFanout: class {
    constructor(options: unknown) {
      mocks.realtime(options);
    }
  },
  createSecretStore: () => ({
    start: async () => undefined,
    describe: () => ({ capabilities: {} }),
  }),
  withSecretPersistence: (prisma: unknown) => prisma,
}));

const pooled = "postgres://example:fake@pool.example.test/rakazo";
const direct = "postgres://example:fake@direct.example.test/rakazo";
const applicationPool = { query: vi.fn() };
const sessionPool = { query: vi.fn() };
const startupBoundary = new Error("connection routing inspected");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", pooled);
  vi.stubEnv("DATABASE_DIRECT_URL", undefined);
  vi.stubEnv("REALTIME_DATABASE_URL", undefined);
  mocks.createDb.mockReturnValue({
    pool: applicationPool,
    prisma: {
      deploymentSettings: {
        upsert: async () => {
          throw startupBoundary;
        },
      },
    },
  });
  mocks.createPool.mockReturnValue(sessionPool);
});
afterEach(() => vi.unstubAllEnvs());

describe("API database sessions", () => {
  it("keeps CRUD on the pooled endpoint and notifications on the direct endpoint", async () => {
    vi.stubEnv("DATABASE_DIRECT_URL", direct);
    await expect(createApp()).rejects.toBe(startupBoundary);
    expect(mocks.createDb).toHaveBeenCalledWith(pooled, expect.anything());
    expect(mocks.createPool).toHaveBeenCalledExactlyOnceWith(direct, expect.anything());
    expect(mocks.realtime).toHaveBeenCalledWith({
      connectionString: direct,
      publisher: sessionPool,
    });
  });

  it("reuses the application pool for existing direct-only deployments", async () => {
    await expect(createApp()).rejects.toBe(startupBoundary);
    expect(mocks.createPool).not.toHaveBeenCalled();
    expect(mocks.realtime).toHaveBeenCalledWith({
      connectionString: pooled,
      publisher: applicationPool,
    });
  });
});
