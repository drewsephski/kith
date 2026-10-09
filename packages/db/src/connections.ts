/** Session-dependent work must bypass transaction pooling. All URLs target the same database. */
export function resolveDatabaseUrls(source: NodeJS.ProcessEnv = process.env) {
  const databaseUrl = source.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const directDatabaseUrl = source.DATABASE_DIRECT_URL?.trim() || databaseUrl;
  const realtimeDatabaseUrl = source.REALTIME_DATABASE_URL?.trim() || directDatabaseUrl;
  return { databaseUrl, directDatabaseUrl, realtimeDatabaseUrl };
}
