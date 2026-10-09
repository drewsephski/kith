import type { Connection, ConnectionCatalogItem } from "@rakazo/contracts";
import { abortableDelay } from "./async.js";

/** Include provider-connected services even before a local account row exists. */
export function connectedAppServices(
  connections: readonly Connection[],
  catalog: readonly ConnectionCatalogItem[],
) {
  const key = (connectorId: string, slug: string) => `${connectorId}:${slug.toLowerCase()}`;
  const items = new Map(catalog.map((item) => [key(item.connectorId, item.slug), item]));
  const represented = new Set<string>();
  const services = connections
    .filter((row) => row.status === "connected")
    .map((row) => {
      const serviceKey = key(row.connectorId, row.provider);
      represented.add(serviceKey);
      return {
        key: row.id,
        connectionId: row.id as string | null,
        connectorId: row.connectorId,
        slug: row.provider,
        name: row.displayName,
        logo: items.get(serviceKey)?.logo ?? null,
      };
    });
  for (const item of catalog) {
    const serviceKey = key(item.connectorId, item.slug);
    if (!item.connected || item.noAuth || represented.has(serviceKey)) continue;
    represented.add(serviceKey);
    services.push({
      key: `catalog:${serviceKey}`,
      connectionId: null,
      connectorId: item.connectorId,
      slug: item.slug,
      name: item.name,
      logo: item.logo,
    });
  }
  return services.sort((a, b) => a.name.localeCompare(b.name));
}

/** Poll the authorization already begun; never repeat its connection mutation. */
export async function waitForAppConnection(
  complete: () => Promise<Connection>,
  options: { signal?: AbortSignal; attempts?: number; pollIntervalMs?: number } = {},
): Promise<Connection> {
  const attempts = options.attempts ?? 60;
  if (!Number.isInteger(attempts) || attempts < 1)
    throw new Error("Use a positive connection-check limit");
  for (let attempt = 0; attempt < attempts; attempt++) {
    options.signal?.throwIfAborted();
    const connection = await complete();
    options.signal?.throwIfAborted();
    if (connection.status !== "pending" || attempt === attempts - 1) return connection;
    await abortableDelay(options.pollIntervalMs ?? 2000, options.signal);
  }
  throw new Error("Connection could not be checked");
}
