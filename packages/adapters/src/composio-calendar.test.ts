import type { AdapterContext } from "@rakazo/adapter-kit";
import { CalendarAccessError } from "@rakazo/adapter-kit";
import { beforeEach, expect, it, vi } from "vitest";
import { ComposioConnector } from "./composio-connector.js";

const proxy = vi.hoisted(() => vi.fn());
vi.mock("@composio/core", () => ({
  Composio: class {
    tools = { proxyExecute: proxy };
  },
}));
const context: AdapterContext = {
  spaceId: "space",
  userId: "user",
  operationId: "calendar",
  traceId: "calendar",
  signal: new AbortController().signal,
};
const window = {
  date: "2026-10-10",
  timezone: "America/Chicago",
  timeMin: "2026-10-10T05:00:00Z",
  timeMax: "2026-10-11T05:00:00Z",
};
beforeEach(() => {
  proxy.mockReset();
});
it("reads through the selected account with GET, preserving calendar pagination", async () => {
  proxy
    .mockResolvedValueOnce({
      status: 200,
      data: {
        items: [{ id: "work", summary: "Work", timeZone: "America/Chicago" }],
        nextPageToken: "second",
      },
    })
    .mockResolvedValueOnce({
      status: 200,
      data: { items: [{ id: "home", summary: "Home", timeZone: "America/Chicago" }] },
    })
    .mockResolvedValue({ status: 200, data: JSON.stringify({ items: [] }) });
  const reader = new ComposioConnector("fake-key").calendarReader("selected-account", context);
  const sources = await reader.sources(context);
  expect(sources.map((source) => source.id)).toEqual(["work", "home"]);
  expect(await reader.events({ ...window, sources }, context)).toMatchObject({
    events: [],
    sources,
  });
  expect(proxy).toHaveBeenCalledTimes(4);
  for (const [request, options] of proxy.mock.calls) {
    expect(request).toMatchObject({ connectedAccountId: "selected-account", method: "GET" });
    expect(new URL(request.endpoint).origin).toBe("https://www.googleapis.com");
    expect(request).not.toHaveProperty("headers");
    expect(options.signal).toBe(context.signal);
  }
  expect(new URL(proxy.mock.calls[1]![0].endpoint).searchParams.get("pageToken")).toBe("second");
});
it.each([401, 403])("requires reconnection on status %s", async (status) => {
  proxy.mockResolvedValue({ status, data: { error: "fake-private-provider-body" } });
  await expect(
    new ComposioConnector("fake-key").calendarReader("account", context).sources(context),
  ).rejects.toBeInstanceOf(CalendarAccessError);
});
it("does not expose provider errors or credentials", async () => {
  proxy.mockRejectedValue(new Error("fake-private-token"));
  await expect(
    new ComposioConnector("fake-key").calendarReader("account", context).sources(context),
  ).rejects.toThrow("Could not read Calendar");
});
it("does not send a request after cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  const cancelled = { ...context, signal: controller.signal };
  await expect(
    new ComposioConnector("fake-key").calendarReader("account", cancelled).sources(cancelled),
  ).rejects.toThrow();
  expect(proxy).not.toHaveBeenCalled();
});
