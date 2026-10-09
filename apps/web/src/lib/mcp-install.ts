import type { McpServer } from "@rakazo/contracts";
import { McpRemoteEndpointSchema } from "@rakazo/contracts";
import { deriveMcpSlug } from "@rakazo/core";
import { newClientId } from "./client-id";
import { connectMcpOauth } from "./mcp-connect";
import { rpc, selectedSpaceId } from "./rpc";

/** A failed or cancelled sign-in keeps the saved server available for retry.
 * Bot access is granted only after a successful read-only tool discovery. */
export async function connectRemoteMcp(input: {
  endpoint: string;
  name?: string;
  transport?: "streamable_http" | "sse";
  secret?: string;
  headers?: Record<string, string>;
  botId?: string;
  signal?: AbortSignal;
  onAuthorization?: (url: string) => void;
}): Promise<McpServer | null> {
  const spaceId = selectedSpaceId();
  const context = { spaceId };
  const assertCurrent = () => {
    input.signal?.throwIfAborted();
    if (selectedSpaceId() !== spaceId) throw new Error("Account changed; connect again");
  };
  assertCurrent();
  const endpoint = McpRemoteEndpointSchema.parse(input.endpoint.trim());
  const name = input.name?.trim() || new URL(endpoint).hostname;
  const popup = window.rakazoDesktop ? null : window.open("about:blank", "rakazo-mcp-oauth");
  if (popup) popup.opener = null;
  try {
    const existing = (await rpc.mcp.servers.list(undefined, { context })).find(
      (server) => server.endpoint === endpoint,
    );
    assertCurrent();
    if (existing && !existing.enabled) throw new Error("This MCP server is disabled");
    const server =
      existing ??
      (await rpc.mcp.servers.create(
        {
          slug: `${deriveMcpSlug(name).slice(0, 54)}-${newClientId().slice(0, 8)}`,
          name,
          transport: input.transport ?? "streamable_http",
          endpoint,
          ...(input.secret?.trim() ? { secret: input.secret.trim() } : {}),
          ...(input.headers ? { headers: input.headers } : {}),
        },
        { context },
      ));
    assertCurrent();
    if (existing && (input.secret?.trim() || input.headers))
      await rpc.mcp.servers.update(
        {
          id: server.id,
          ...(input.secret?.trim() ? { secret: input.secret.trim() } : {}),
          ...(input.headers ? { headers: input.headers } : {}),
        },
        { context },
      );
    assertCurrent();
    const result = await connectMcpOauth(server.id, {
      popup,
      signal: input.signal,
      onAuthorization: input.onAuthorization,
    });
    if (result === "cancelled") return null;
    assertCurrent();
    await rpc.mcp.servers.check({ serverId: server.id }, { context });
    assertCurrent();
    if (input.botId)
      await rpc.mcp.assignments.approve({ botId: input.botId, serverId: server.id }, { context });
    return server;
  } finally {
    popup?.close();
  }
}
