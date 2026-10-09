import { abortableDelay } from "@rakazo/core";
import { rpc, selectedSpaceId } from "./rpc";

export const MCP_OAUTH_CHANNEL = "rakazo-mcp-oauth";
const MCP_OAUTH_TIMEOUT_MS = 2 * 60 * 1000;
export type McpOauthResult =
  | "connected"
  | "cancelled"
  | "already_connected"
  | "authorization_not_requested";

/** Reserve a window during the click. Poll persisted connection state as well as
 * listening for the callback, so Electron's system browser works too. */
export async function connectMcpOauth(
  serverId: string,
  options: {
    popup?: Window | null;
    signal?: AbortSignal;
    onAuthorization?: (url: string) => void;
  } = {},
): Promise<McpOauthResult> {
  const popup =
    options.popup !== undefined
      ? options.popup
      : window.rakazoDesktop
        ? null
        : window.open("about:blank", MCP_OAUTH_CHANNEL);
  if (popup) popup.opener = null;
  const spaceId = selectedSpaceId();
  const context = { spaceId };
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  const channel = new BroadcastChannel(MCP_OAUTH_CHANNEL);
  let result: McpOauthResult | undefined;
  try {
    const started = await rpc.mcp.oauth.begin(
      { serverId, redirectUri: `${window.location.origin}/mcp/oauth/callback` },
      { context },
    );
    if (started.status !== "authorization_required") return started.status;
    signal.throwIfAborted();
    channel.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; sessionId?: string; status?: string } | null;
      if (data?.type !== "mcp-oauth-complete" || data.sessionId !== started.sessionId) return;
      result = data.status === "error" ? "cancelled" : "connected";
      controller.abort();
    };
    options.onAuthorization?.(started.authorizationUrl);
    if (popup && !popup.closed) popup.location.href = started.authorizationUrl;
    else if (window.rakazoDesktop)
      window.open(started.authorizationUrl, "_blank", "noopener,noreferrer");
    else if (!options.onAuthorization) {
      window.location.assign(started.authorizationUrl);
      return "cancelled";
    }
    const deadline = Date.now() + MCP_OAUTH_TIMEOUT_MS;
    while (Date.now() < deadline && !signal.aborted) {
      if (selectedSpaceId() !== spaceId) return "cancelled";
      const servers = await rpc.mcp.servers.list(undefined, { context });
      if (servers.some((server) => server.id === serverId && server.oauthStatus === "connected"))
        return "connected";
      if (result) return result;
      await abortableDelay(2000, signal);
    }
    return result ?? "cancelled";
  } catch (error) {
    if (signal.aborted) return result ?? "cancelled";
    throw error;
  } finally {
    channel.close();
    popup?.close();
  }
}
