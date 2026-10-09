import type { AdapterContext, ManagedConnectorProvider } from "@rakazo/adapter-kit";
import type { MessageBlock } from "@rakazo/contracts";
import { featuredConnectorProvidersMatch } from "@rakazo/core";
import { z } from "zod";

const RequestSchema = z.object({
  app: z.string().trim().min(1).max(120),
  connectorId: z.string().trim().min(1).max(120).optional(),
});

type AppConnectBlock = Extract<MessageBlock, { kind: "app_connect" }>;
type CatalogRegistry = {
  managed(id: string): ManagedConnectorProvider | undefined;
  managedProviders?(): ManagedConnectorProvider[];
};

/** Resolve an assistant's intent against configured catalogs; never invent an
 * app, consent URL, or connection. Authorization starts only after a user click. */
export async function appConnectionFromTool(
  registry: CatalogRegistry | undefined,
  context: AdapterContext,
  args: Record<string, unknown>,
): Promise<
  | { status: "pending"; block: AppConnectBlock }
  | { status: "connected" | "no_auth_required"; app: string }
  | { error: string }
> {
  const parsed = RequestSchema.safeParse(args);
  if (!parsed.success) return { error: "Provide an app name or catalog slug." };
  const { app, connectorId } = parsed.data;
  const providers = connectorId
    ? [registry?.managed(connectorId)].filter((provider): provider is ManagedConnectorProvider =>
        Boolean(provider),
      )
    : (registry?.managedProviders?.() ?? []);
  if (!providers.length) return { error: "App connections are not configured on this server." };

  const results = await Promise.allSettled(
    providers.map(async (provider) => {
      // Read the full catalog so aliases such as gcal still resolve to Calendar.
      const catalog = await provider.catalog(context);
      return catalog
        .filter((item) =>
          [item.slug, item.name].some(
            (key) =>
              key.toLowerCase() === app.toLowerCase() || featuredConnectorProvidersMatch(key, app),
          ),
        )
        .map((item) => ({ ...item, connectorId: provider.describe().id }));
    }),
  );
  context.signal.throwIfAborted();
  const matches = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const connected = matches.find((item) => item.connected);
  if (connected) return { status: "connected", app: connected.name };
  const publicApp = matches.find((item) => item.noAuth);
  if (publicApp) return { status: "no_auth_required", app: publicApp.name };
  const item = matches[0];
  if (!item) {
    return {
      error: results.some((result) => result.status === "rejected")
        ? "Could not verify app availability. Try again before offering a connection."
        : "This app is not available in the configured connection catalogs.",
    };
  }
  return {
    status: "pending",
    block: {
      kind: "app_connect",
      connectorId: item.connectorId,
      provider: item.slug,
      name: item.name,
      description: "",
      logo: item.logo,
      status: "pending",
    },
  };
}
