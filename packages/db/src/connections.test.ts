import { describe, expect, it } from "vitest";
import { resolveDatabaseUrls } from "./connections.js";

const databaseUrl = "postgres://example:fake@db.example.test/rakazo";
const directDatabaseUrl = "postgres://example:fake@direct.example.test/rakazo";

describe("database connection routing", () => {
  it("keeps existing direct-only deployments on one database URL", () => {
    expect(resolveDatabaseUrls({ DATABASE_URL: databaseUrl })).toEqual({
      databaseUrl,
      directDatabaseUrl: databaseUrl,
      realtimeDatabaseUrl: databaseUrl,
    });
  });

  it("bypasses the application pooler for sessions and defaults realtime to direct", () => {
    expect(
      resolveDatabaseUrls({
        DATABASE_URL: databaseUrl,
        DATABASE_DIRECT_URL: ` ${directDatabaseUrl} `,
      }),
    ).toEqual({ databaseUrl, directDatabaseUrl, realtimeDatabaseUrl: directDatabaseUrl });
  });

  it("preserves an explicit realtime endpoint and ignores blank optional values", () => {
    const realtimeDatabaseUrl = "postgres://example:fake@realtime.example.test/rakazo";
    expect(
      resolveDatabaseUrls({
        DATABASE_URL: databaseUrl,
        DATABASE_DIRECT_URL: directDatabaseUrl,
        REALTIME_DATABASE_URL: realtimeDatabaseUrl,
      }).realtimeDatabaseUrl,
    ).toBe(realtimeDatabaseUrl);
    expect(
      resolveDatabaseUrls({
        DATABASE_URL: databaseUrl,
        DATABASE_DIRECT_URL: " ",
        REALTIME_DATABASE_URL: "",
      }).realtimeDatabaseUrl,
    ).toBe(databaseUrl);
  });

  it("fails without logging connection credentials when the database URL is missing", () => {
    expect(() => resolveDatabaseUrls({ DATABASE_DIRECT_URL: directDatabaseUrl })).toThrow(
      "DATABASE_URL is required",
    );
    expect(() => resolveDatabaseUrls({ DATABASE_URL: " " })).toThrow("DATABASE_URL is required");
  });
});
