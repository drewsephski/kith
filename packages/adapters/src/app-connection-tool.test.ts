import type { AdapterContext, ManagedConnectorProvider } from "@rakazo/adapter-kit";
import type { ConnectionCatalogItem } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import { appConnectionFromTool } from "./app-connection-tool.js";

const context: AdapterContext = {
  operationId: "op",
  traceId: "trace",
  spaceId: "space",
  userId: "user",
  botId: "bot",
  signal: new AbortController().signal,
};
const calendar: ConnectionCatalogItem = {
  connectorId: "example",
  slug: "google_calendar",
  name: "Google Calendar",
  logo: null,
  connected: false,
  noAuth: false,
};
function fixture(items: ConnectionCatalogItem[] = [calendar], id = "example") {
  const provider = {
    describe: () => ({ id }),
    catalog: vi.fn(async () => items),
    begin: vi.fn(),
  } as unknown as ManagedConnectorProvider;
  const registry = {
    managed: (key: string) => (key === id ? provider : undefined),
    managedProviders: () => [provider],
  };
  return { provider, registry };
}

describe("intent-driven app connection cards", () => {
  it("uses authoritative catalog identity and resolves aliases without starting OAuth", async () => {
    const { registry, provider } = fixture();
    const result = await appConnectionFromTool(registry, context, { app: "gcal" });
    expect(result).toEqual({
      status: "pending",
      block: {
        kind: "app_connect",
        connectorId: "example",
        provider: "google_calendar",
        name: "Google Calendar",
        description: "",
        logo: null,
        status: "pending",
      },
    });
    expect(provider.catalog).toHaveBeenCalledWith(context);
    expect(provider.begin).not.toHaveBeenCalled();
  });

  it("does not invent unavailable apps or accept arbitrary card metadata", async () => {
    const { registry } = fixture();
    expect(
      await appConnectionFromTool(registry, context, {
        app: "Unknown",
        name: "Google Calendar",
        logo: "fake",
      }),
    ).toHaveProperty("error");
    expect(await appConnectionFromTool(registry, context, { app: "" })).toHaveProperty("error");
    expect(
      await appConnectionFromTool(undefined, context, { app: "Google Calendar" }),
    ).toHaveProperty("error");
    expect(
      await appConnectionFromTool(registry, context, {
        app: "Google Calendar",
        connectorId: "missing",
      }),
    ).toHaveProperty("error");
  });

  it("skips connected and auth-free apps", async () => {
    expect(
      await appConnectionFromTool(fixture([{ ...calendar, connected: true }]).registry, context, {
        app: "Google Calendar",
      }),
    ).toEqual({ status: "connected", app: "Google Calendar" });
    expect(
      await appConnectionFromTool(fixture([{ ...calendar, noAuth: true }]).registry, context, {
        app: "Google Calendar",
      }),
    ).toEqual({ status: "no_auth_required", app: "Google Calendar" });
  });

  it("prefers an existing connection across configured catalogs", async () => {
    const pending = fixture().provider;
    const connected = fixture([{ ...calendar, connected: true }], "another").provider;
    expect(
      await appConnectionFromTool(
        { managed: () => undefined, managedProviders: () => [pending, connected] },
        context,
        { app: "Google Calendar" },
      ),
    ).toEqual({ status: "connected", app: "Google Calendar" });
  });

  it("reports catalog failures and still uses another available provider", async () => {
    const { registry, provider } = fixture();
    vi.mocked(provider.catalog).mockRejectedValue(new Error("private provider failure"));
    expect(await appConnectionFromTool(registry, context, { app: "Google Calendar" })).toEqual({
      error: "Could not verify app availability. Try again before offering a connection.",
    });
    const working = fixture([calendar], "working").provider;
    expect(
      await appConnectionFromTool(
        { managed: () => undefined, managedProviders: () => [provider, working] },
        context,
        { app: "Google Calendar" },
      ),
    ).toHaveProperty("block.connectorId", "working");
  });
});
