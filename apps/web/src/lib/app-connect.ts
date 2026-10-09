import type { Connection, ConnectionCatalogItem } from "@rakazo/contracts";
import { waitForAppConnection } from "@rakazo/core";
import { rpc, selectedSpaceId } from "./rpc";

export type AppAuthorization = {
  connectionId: string;
  authorizationUrl: string;
  spaceId: string | null;
};

/** Reserve the browser while the click still has user activation. Electron opens
 * the returned provider URL in the system browser instead. */
export async function connectAppAccount(
  item: Pick<ConnectionCatalogItem, "connectorId" | "slug" | "name">,
  options: {
    signal: AbortSignal;
    displayName?: string;
    onAuthorization?: (authorization: AppAuthorization) => void;
  },
): Promise<Connection> {
  const spaceId = selectedSpaceId();
  const popup = window.rakazoDesktop ? null : window.open("about:blank", "_blank");
  if (popup) popup.opener = null;
  let navigated = false;
  try {
    const result = await rpc.connections.begin(
      {
        connectorId: item.connectorId,
        provider: item.slug,
        displayName: options.displayName ?? item.name,
      },
      { context: { spaceId } },
    );
    options.signal.throwIfAborted();
    if (selectedSpaceId() !== spaceId) throw new Error("Account changed; connect again");
    if (result.authorizationUrl) {
      const url = new URL(result.authorizationUrl);
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error("Account authorization requires a secure URL");
      options.onAuthorization?.({
        connectionId: result.connectionId,
        spaceId,
        authorizationUrl: result.authorizationUrl,
      });
      if (popup && !popup.closed) {
        popup.location.href = result.authorizationUrl;
        navigated = true;
      } else if (window.rakazoDesktop)
        window.open(result.authorizationUrl, "_blank", "noopener,noreferrer");
      // If popups are blocked, the caller renders the same link as an explicit click.
    } else popup?.close();
    const row = await checkAppAccount(
      { connectionId: result.connectionId, spaceId },
      options.signal,
    );
    if (row.status === "connected") popup?.close();
    return row;
  } finally {
    if (!navigated) popup?.close();
  }
}

/** Resume the same pending connection without creating another OAuth request. */
export function checkAppAccount(
  authorization: Pick<AppAuthorization, "connectionId" | "spaceId">,
  signal: AbortSignal,
): Promise<Connection> {
  return waitForAppConnection(
    () => {
      if (selectedSpaceId() !== authorization.spaceId)
        throw new Error("Account changed; connect again");
      return rpc.connections.complete(
        { connectionId: authorization.connectionId },
        { context: { spaceId: authorization.spaceId } },
      );
    },
    { signal },
  );
}
