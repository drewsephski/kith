import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";
import type { ScreenCapabilityScope } from "./screen-capability.js";
import {
  issueScreenCapability,
  openScreenCapability,
  REMOTE_SCREEN_CAPABILITY_MIN_REMAINING_MS,
  resetRemoteScreenCapabilityReuse,
  SCREEN_PROXY_TTL_MS,
  sealScreenCapability,
} from "./screen-capability.js";

const scope: ScreenCapabilityScope = {
  sessionId: "session",
  userId: "user",
  spaceId: "space",
  botId: "bot",
  computerId: "computer",
  botGeneration: 2,
  computerGeneration: 3,
  controlLeaseId: null,
};
const path = (url: string, interactive = false) =>
  new URL(
    sealScreenCapability(
      `${url}?token=fake-provider-token&view_only=${!interactive}`,
      "fake-secret",
      "https://app.example",
      scope,
      100,
    ),
  ).pathname;
describe("sealed screen capabilities", () => {
  it.each([false, true])(
    "connects the shipped embed through one capability prefix (control=%s)",
    (interactive) => {
      const provider = new URL("http://127.0.0.1:49152/embed.html");
      provider.searchParams.set("view_only", String(!interactive));
      provider.searchParams.set("path", "websockify?token=fake-socket-token");
      const url = new URL(
        sealScreenCapability(provider.toString(), "fake-secret", "https://app.example", scope, 100),
      );
      const html = readFileSync(
        new URL("../../../../infra/sandboxes/computer/embed.html", import.meta.url),
        "utf8",
      );
      const script = html
        .match(/<script type="module">([\s\S]*?)<\/script>/)![1]!
        .replace(/^\s*import[\s\S]*?;\s*$/gm, "");
      let socketUrl = "";
      runInNewContext(script, {
        document: { location: url, getElementById: () => ({}) },
        window: { location: url },
        RFB: class {
          constructor(_element: unknown, value: string) {
            socketUrl = value;
          }
        },
        attachHostClipboardPaste: () => {},
        attachMobilePaste: () => {},
        attachRemoteClipboardCopy: () => {},
        pasteHostText: () => false,
        // Embed imports are stripped for this smoke; stub the touch-keyboard
        // and trackpad bridges the same way as clipboard. Returning false
        // skips Keyboard / KeyTable / keysyms, which this harness does not provide.
        isTouchBrowser: () => false,
        attachMobileKeyboard: () => {},
        attachMobileTrackpad: () => {},
      });
      const socket = new URL(socketUrl);
      expect(socket.protocol).toBe("wss:");
      expect(socket.host).toBe(url.host);
      expect(socket.pathname).toBe(url.pathname.replace("/embed.html", "/websockify"));
      expect(socketUrl).not.toContain("fake-socket-token");
      expect(openScreenCapability(socket.pathname, "fake-secret", 101)?.target).toMatchObject({
        path: "/websockify?token=fake-socket-token",
        interactive,
      });
    },
  );
  it("hides provider credentials and binds scope and destination", () => {
    const value = path("https://screen.example/vnc.html");
    expect(value).not.toContain("fake-provider-token");
    expect(openScreenCapability(value, "fake-secret", 101)).toMatchObject({
      scope,
      target: {
        hostname: "screen.example",
        port: 443,
        protocol: "https:",
        interactive: false,
        path: "/vnc.html?token=fake-provider-token&view_only=true",
      },
    });
    expect(
      openScreenCapability(value.replace("/vnc.html", "/websockify"), "fake-secret", 101)?.target
        .path,
    ).toBe("/websockify?token=fake-provider-token&view_only=true");
  });
  it("keeps noVNC routing public and nested provider socket credentials sealed", () => {
    const provider = new URL("https://screen.example/vnc.html");
    provider.searchParams.set("path", "websockify?token=fake-socket-token");
    const url = new URL(
      sealScreenCapability(provider.toString(), "fake-secret", "https://app.example", scope, 100),
    );
    expect(url.toString()).not.toContain("fake-socket-token");
    expect(url.searchParams.get("autoconnect")).toBe("true");
    const socketPath = `/${url.searchParams.get("path")}`;
    expect(openScreenCapability(socketPath, "fake-secret", 101)?.target.path).toBe(
      "/websockify?token=fake-socket-token",
    );
  });

  it.each(["http://127.0.0.1:5173", "https://app.example"])(
    "connects stock noVNC using its host-or-relative URL behavior on %s",
    (origin) => {
      const provider = new URL("https://screen.example/vnc.html");
      provider.searchParams.set("path", "websockify?token=fake-socket-token");
      const page = new URL(
        sealScreenCapability(provider.toString(), "fake-secret", origin, scope, 100),
      );
      // noVNC's app/ui.js uses an explicit host when configured, otherwise resolves
      // the path relative to the current page (not relative to the origin).
      const host = page.searchParams.get("host");
      const port = page.searchParams.get("port");
      const path = page.searchParams.get("path")!;
      const socket = host ? new URL(`https://${host}`) : new URL(path, page);
      if (host) {
        socket.protocol = page.searchParams.get("encrypt") === "true" ? "wss:" : "ws:";
        if (port) socket.port = port;
        socket.pathname = `/${path}`;
      } else socket.protocol = page.protocol === "https:" ? "wss:" : "ws:";
      expect(socket.host).toBe(page.host);
      expect(socket.pathname).toBe(page.pathname.replace("/vnc.html", "/websockify"));
      expect(openScreenCapability(socket.pathname, "fake-secret", 101)?.target.path).toBe(
        "/websockify?token=fake-socket-token",
      );
    },
  );

  it.each(["sessionId", "userId", "spaceId"] as const)(
    "rejects missing or empty sealed %s",
    (field) => {
      for (const value of [undefined, ""]) {
        const legacy = { ...scope, [field]: value } as unknown as ScreenCapabilityScope;
        const sealed = sealScreenCapability(
          "https://screen.example/vnc.html",
          "fake-secret",
          "https://app.example",
          legacy,
          100,
        );
        expect(openScreenCapability(new URL(sealed).pathname, "fake-secret", 101)).toBeNull();
      }
    },
  );

  it("randomizes issuance even at the same timestamp", () => {
    expect(path("http://127.0.0.1:49152/embed.html")).not.toBe(
      path("http://127.0.0.1:49152/embed.html"),
    );
  });
  it("rejects wrong keys, modified policy, expiry and ciphertext", () => {
    const value = path("http://127.0.0.1:49152/embed.html");
    expect(openScreenCapability(value, "wrong", 101)).toBeNull();
    expect(
      openScreenCapability(value.replace("/view/", "/control/"), "fake-secret", 101),
    ).toBeNull();
    expect(
      openScreenCapability(value.replace("3600100.", "3600101."), "fake-secret", 101),
    ).toBeNull();
    expect(
      openScreenCapability(
        value.replace(/\.(.)/, (_, c) => `.${c === "a" ? "b" : "a"}`),
        "fake-secret",
        101,
      ),
    ).toBeNull();
    expect(openScreenCapability(value, "fake-secret", 100 + SCREEN_PROXY_TTL_MS)).toBeNull();
  });
  it("rejects truncated capability tokens before decryption", () => {
    const value = path("http://127.0.0.1:49152/embed.html");
    const match = value.match(/^(\/novnc\/session\/view\/\d+\.)([A-Za-z0-9_-]+)(\/.*)$/);
    expect(match).not.toBeNull();
    const truncated = `${match![1]}${match![2]!.slice(0, 8)}${match![3]}`;
    expect(openScreenCapability(truncated, "fake-secret", 101)).toBeNull();
  });
  it("enforces view policy and still serves relative assets", () => {
    const value = path("http://127.0.0.1:49152/embed.html");
    expect(
      openScreenCapability(`${value}?view_only=false`, "fake-secret", 101)?.target.path,
    ).toContain("view_only=true");
    expect(
      openScreenCapability(value.replace("/embed.html", "/core/rfb.js"), "fake-secret", 101)?.target
        .path,
    ).toBe("/core/rfb.js");
    expect(
      openScreenCapability(path("http://127.0.0.1:49152/embed.html", true), "fake-secret", 101)
        ?.target.interactive,
    ).toBe(true);
  });
  it.each(["http://public.example:49152/embed.html", "http://127.0.0.1:80/embed.html"])(
    "rejects disallowed local target %s",
    (url) => {
      expect(openScreenCapability(path(url), "fake-secret", 101)).toBeNull();
    },
  );
  it.each(["http://100.64.0.1:49152/embed.html", "http://100.127.255.254:49152/embed.html"])(
    "allows CGNAT 100.64/10 screen targets %s",
    (url) => {
      expect(openScreenCapability(path(url), "fake-secret", 101)?.target.hostname).toBe(
        new URL(url).hostname,
      );
    },
  );
  it.each(["http://100.63.255.255:49152/embed.html", "http://100.128.0.1:49152/embed.html"])(
    "rejects addresses outside CGNAT 100.64/10 %s",
    (url) => {
      expect(openScreenCapability(path(url), "fake-secret", 101)).toBeNull();
    },
  );
});

describe("remote screen capability reuse", () => {
  const upstream =
    "https://6100-sandbox.example/vnc.html?autoconnect=true&resize=scale&path=websockify%3Ftoken%3Dview-1&view_only=true";
  const issued = (now: number, nextScope = scope, url = upstream, secret = "fake-secret") =>
    issueScreenCapability(url, secret, "https://app.example", nextScope, now);

  beforeEach(() => {
    resetRemoteScreenCapabilityReuse();
  });

  it("reuses one remote seal across polls that a slow handshake can still be using", () => {
    const now = 1_000_000;
    const first = issued(now);
    const duringHandshake = issued(now + 5_000);
    expect(duringHandshake).toBe(first);
    const opened = openScreenCapability(new URL(first).pathname, "fake-secret", now + 5_000);
    expect(opened?.target.path).toBe(
      "/vnc.html?autoconnect=true&resize=scale&path=websockify%3Ftoken%3Dview-1&view_only=true",
    );
    expect(
      openScreenCapability(
        new URL(first).pathname.replace("/vnc.html", "/websockify"),
        "fake-secret",
        now + 5_000,
      )?.target.path,
    ).toBe("/websockify?token=view-1");
    expect(
      openScreenCapability(new URL(first).pathname, "fake-secret", now + SCREEN_PROXY_TTL_MS),
    ).toBeNull();
  });

  it("keeps the original expiry when a later client reads the cached seal", () => {
    const now = 1_000_000;
    const first = issued(now);
    const later = issued(now + 20 * 60_000);
    expect(later).toBe(first);
    const expiresAt = Number(new URL(later).pathname.match(/\/(\d+)\./)?.[1]);
    expect(expiresAt).toBe(now + SCREEN_PROXY_TTL_MS);
  });

  it("mints again once the held seal is inside the refresh window, without extending the old one", () => {
    const now = 1_000_000;
    const first = issued(now);
    const stillHeld = now + SCREEN_PROXY_TTL_MS - REMOTE_SCREEN_CAPABILITY_MIN_REMAINING_MS - 1;
    expect(issued(stillHeld)).toBe(first);
    const refreshAt = now + SCREEN_PROXY_TTL_MS - REMOTE_SCREEN_CAPABILITY_MIN_REMAINING_MS;
    const renewed = issued(refreshAt);
    expect(renewed).not.toBe(first);
    expect(openScreenCapability(new URL(first).pathname, "fake-secret", refreshAt)).not.toBeNull();
    expect(
      openScreenCapability(new URL(first).pathname, "fake-secret", now + SCREEN_PROXY_TTL_MS),
    ).toBeNull();
    expect(
      openScreenCapability(new URL(renewed).pathname, "fake-secret", refreshAt),
    ).not.toBeNull();
    expect(
      openScreenCapability(
        new URL(renewed).pathname,
        "fake-secret",
        refreshAt + SCREEN_PROXY_TTL_MS,
      ),
    ).toBeNull();
  });

  it("rotates when the upstream token, scope, secret, or origin changes", () => {
    const now = 1_000_000;
    const first = issued(now);
    expect(issued(now + 1, scope, upstream.replace("view-1", "view-2"))).not.toBe(first);
    expect(
      issued(now + 1, { ...scope, computerGeneration: scope.computerGeneration + 1 }),
    ).not.toBe(first);
    expect(issued(now + 1, { ...scope, controlLeaseId: "lease" })).not.toBe(first);
    expect(issued(now + 1, scope, upstream, "other-secret")).not.toBe(first);
    expect(
      issueScreenCapability(upstream, "fake-secret", "https://other.example", scope, now + 1),
    ).not.toBe(first);
  });

  it.each(["sessionId", "userId", "spaceId"] as const)("partitions remote reuse by %s", (field) => {
    const first = issued(1_000_000);
    const changed = { ...scope, [field]: "other" };
    const second = issued(1_000_001, changed);
    expect(second).not.toBe(first);
    expect(issued(1_000_002, changed)).toBe(second);
    expect(issued(1_000_003)).toBe(first);
    expect(openScreenCapability(new URL(second).pathname, "fake-secret", 1_000_002)?.scope).toEqual(
      changed,
    );
  });

  it("keeps minting a fresh capability for loopback screens", () => {
    const local = "http://127.0.0.1:49152/embed.html?path=websockify%3Ftoken%3Dview-1";
    expect(issued(1_000_000, scope, local)).not.toBe(issued(1_000_001, scope, local));
  });
});
