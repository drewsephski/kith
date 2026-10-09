import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { checkAppAccount, connectAppAccount } from "./app-connect";

const state = vi.hoisted(() => ({
  spaceId: "space-one" as string | null,
  begin: vi.fn(),
  complete: vi.fn(),
  open: vi.fn(),
  wait: vi.fn(),
}));
vi.mock("./rpc", () => ({
  rpc: { connections: { begin: state.begin, complete: state.complete } },
  selectedSpaceId: () => state.spaceId,
}));
vi.mock("@rakazo/core", () => ({ waitForAppConnection: state.wait }));
const item = { connectorId: "example", slug: "gmail", name: "Gmail" };
beforeEach(() => {
  vi.clearAllMocks();
  state.spaceId = "space-one";
  state.begin.mockResolvedValue({
    connectionId: "connection-one",
    authorizationUrl: "https://provider.example.test/connect",
  });
  state.complete.mockResolvedValue({ id: "connection-one", status: "connected" });
  state.wait.mockImplementation(async (complete: () => Promise<unknown>) => complete());
  vi.stubGlobal("window", { open: state.open });
});
afterEach(() => vi.unstubAllGlobals());

it("reserves the popup before beginning OAuth and verifies the connection on the server", async () => {
  const popup = { opener: {}, closed: false, location: { href: "about:blank" }, close: vi.fn() };
  state.open.mockReturnValue(popup);
  const authorization = vi.fn();
  await connectAppAccount(item, {
    signal: new AbortController().signal,
    onAuthorization: authorization,
  });
  expect(state.open.mock.invocationCallOrder[0]).toBeLessThan(
    state.begin.mock.invocationCallOrder[0] ?? 0,
  );
  expect(popup.opener).toBeNull();
  expect(popup.location.href).toBe("https://provider.example.test/connect");
  expect(authorization).toHaveBeenCalledWith({
    connectionId: "connection-one",
    authorizationUrl: "https://provider.example.test/connect",
    spaceId: "space-one",
  });
  expect(state.complete).toHaveBeenCalledWith(
    { connectionId: "connection-one" },
    { context: { spaceId: "space-one" } },
  );
  expect(popup.close).toHaveBeenCalledOnce();
});

it("opens consent through the Electron system browser without reserving about:blank", async () => {
  vi.stubGlobal("window", { open: state.open, rakazoDesktop: {} });
  await connectAppAccount(item, { signal: new AbortController().signal });
  expect(state.open).toHaveBeenCalledExactlyOnceWith(
    "https://provider.example.test/connect",
    "_blank",
    "noopener,noreferrer",
  );
});

it("retains a usable explicit authorization link when browser popups are blocked", async () => {
  state.open.mockReturnValue(null);
  const authorization = vi.fn();
  await connectAppAccount(item, {
    signal: new AbortController().signal,
    onAuthorization: authorization,
  });
  expect(authorization).toHaveBeenCalledOnce();
  expect(state.complete).toHaveBeenCalledOnce();
});

it("resumes the pending account without starting another OAuth request", async () => {
  await checkAppAccount(
    { connectionId: "connection-one", spaceId: "space-one" },
    new AbortController().signal,
  );
  expect(state.begin).not.toHaveBeenCalled();
  expect(state.complete).toHaveBeenCalledOnce();
});

it("does not resume a pending authorization in a different workspace", async () => {
  state.spaceId = "space-two";
  await expect(
    checkAppAccount(
      { connectionId: "connection-one", spaceId: "space-one" },
      new AbortController().signal,
    ),
  ).rejects.toThrow("Account changed");
  expect(state.complete).not.toHaveBeenCalled();
});

it("closes unused popups when the server returns an unsafe authorization URL", async () => {
  const popup = { closed: false, location: { href: "about:blank" }, close: vi.fn() };
  state.open.mockReturnValue(popup);
  state.begin.mockResolvedValue({
    connectionId: "connection-one",
    authorizationUrl: "javascript:alert(1)",
  });
  await expect(connectAppAccount(item, { signal: new AbortController().signal })).rejects.toThrow(
    "secure URL",
  );
  expect(popup.close).toHaveBeenCalledOnce();
  expect(state.complete).not.toHaveBeenCalled();
});
