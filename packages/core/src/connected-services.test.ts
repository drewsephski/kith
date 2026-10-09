import type { Connection, ConnectionCatalogItem } from "@rakazo/contracts";
import { expect, it } from "vitest";
import { connectedAppServices } from "./app-connection.js";

const account = (id: string, overrides: Partial<Connection> = {}): Connection => ({
  id,
  connectorId: "composio",
  provider: "GMAIL",
  displayName: id,
  status: "connected",
  capabilities: [],
  createdAt: "2026-10-09T00:00:00Z",
  ...overrides,
});
const item = (
  slug: string,
  overrides: Partial<ConnectionCatalogItem> = {},
): ConnectionCatalogItem => ({
  connectorId: "composio",
  slug,
  name: slug,
  logo: null,
  connected: true,
  noAuth: false,
  ...overrides,
});

it("preserves every connected account, merges catalog metadata, and adds provider-only services", () => {
  const services = connectedAppServices(
    [
      account("Work Gmail"),
      account("Personal Gmail"),
      account("Local service", { provider: "missing" }),
    ],
    [item("gmail", { logo: "https://example.test/gmail.svg" }), item("Slack"), item("Slack")],
  );
  expect(services.map((service) => service.name)).toEqual([
    "Local service",
    "Personal Gmail",
    "Slack",
    "Work Gmail",
  ]);
  expect(
    services.filter((service) => service.slug === "GMAIL").map((service) => service.logo),
  ).toEqual(["https://example.test/gmail.svg", "https://example.test/gmail.svg"]);
  expect(services.find((service) => service.name === "Work Gmail")?.connectionId).toBe(
    "Work Gmail",
  );
  expect(services.find((service) => service.name === "Slack")?.connectionId).toBeNull();
});

it("omits inactive accounts, disconnected services, and tools that need no account", () => {
  expect(
    connectedAppServices(
      [
        account("pending", { status: "pending" }),
        account("revoked", { status: "revoked" }),
        account("failed", { status: "error" }),
      ],
      [item("gmail", { connected: false }), item("public", { noAuth: true })],
    ),
  ).toEqual([]);
});

it("keeps the same service connected through different providers", () => {
  expect(
    connectedAppServices(
      [account("Gmail")],
      [item("gmail"), item("gmail", { connectorId: "pipedream" })],
    ),
  ).toHaveLength(2);
});
