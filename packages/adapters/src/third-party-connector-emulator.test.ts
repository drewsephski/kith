import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, it } from "vitest";
import { secureFetch } from "./mcp-transport.js";
import { ThirdPartyConnectorEmulator } from "./third-party-connector-emulator.js";

it("accepts buffered SDK initialization and discovers tools through the secure transport", async () => {
  const emulator = new ThirdPartyConnectorEmulator();
  const endpoint = new URL("https://mcp.example.test/mcp");
  const fetch = secureFetch(
    endpoint,
    {},
    {},
    {
      fetch: emulator.fetch,
      resolveHostname: emulator.resolveHostname,
    },
  );
  const client = new Client({ name: "acceptance", version: "1" });
  const transport = new StreamableHTTPClientTransport(endpoint, { fetch });
  try {
    await client.connect(transport, { timeout: 1000 });
    expect((await client.listTools()).tools.map((tool) => tool.name)).toContain("notes.write");
    expect(emulator.records).toContainEqual({
      provider: "mcp",
      operation: "tools/list",
      host: "mcp.example.test",
      authenticated: false,
    });
    expect((await fetch(endpoint, { method: "GET" })).status).toBe(405);
  } finally {
    await client.close();
    await fetch.close();
  }
});
