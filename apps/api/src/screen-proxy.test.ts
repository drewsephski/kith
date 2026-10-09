import {
  resetRemoteScreenCapabilityReuse,
  SCREEN_TARGET_ENDPOINT,
} from "@rakazo/core/node/screen-capability";
import type { PrismaClient } from "@rakazo/db";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { addScreenProxyCapability, mountScreenTarget } from "./screen-proxy.js";

const secret = "fake-screen-secret";
const scope = {
  sessionId: "session",
  userId: "user",
  spaceId: "space",
  botId: "bot",
  computerId: "computer",
  botGeneration: 0,
  computerGeneration: 0,
  controlLeaseId: "lease",
};
function fixture(
  interactive = false,
  upstream = `http://127.0.0.1:49152/embed.html?view_only=${!interactive}`,
) {
  const computer = {
    screenGeneration: 0,
    providerRef: "fake-provider",
    state: "running",
    controlHolder: "user",
    controlLeaseId: "lease",
    controlBotId: "bot",
    controlLeaseExpiresAt: new Date(Date.now() + 60_000),
  };
  const bot = {
    id: "bot",
    userId: "user",
    spaceId: "space",
    computerId: "computer",
    archivedAt: null as Date | null,
    screenGeneration: 0,
    computer,
  };
  const findFirst = vi.fn(async ({ where }) =>
    Object.entries(where).every(([key, value]) => bot[key as keyof typeof bot] === value)
      ? bot
      : null,
  );
  const session = {
    id: "session",
    userId: "user",
    expiresAt: new Date(Date.now() + 60_000),
    deleted: false,
  };
  const membership = { userId: "user", spaceId: "space", deleted: false };
  const findSession = vi.fn(async ({ where }) =>
    !session.deleted &&
    session.id === where.id &&
    session.userId === where.userId &&
    session.expiresAt > where.expiresAt.gt
      ? session
      : null,
  );
  const findMembership = vi.fn(async ({ where }) =>
    !membership.deleted &&
    membership.userId === where.userId &&
    membership.spaceId === where.spaceId
      ? membership
      : null,
  );
  const app = new Hono();
  app.onError(() => new Response(null, { status: 500 }));
  mountScreenTarget(
    app,
    {
      bot: { findFirst },
      session: { findFirst: findSession },
      spaceMember: { findFirst: findMembership },
    } as unknown as PrismaClient,
    secret,
  );
  const url = addScreenProxyCapability(upstream, secret, "https://app.example", scope);
  const path = new URL(url).pathname;
  const request = (value = path, credential = secret) =>
    app.request(SCREEN_TARGET_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
      body: JSON.stringify({ path: value }),
    });
  return {
    bot,
    computer,
    findFirst,
    session,
    membership,
    findSession,
    findMembership,
    path,
    request,
  };
}

describe("screen capability lifecycle authorization", () => {
  it("allows repeat assets and reconnects during the same active lifecycle", async () => {
    const { request, path } = fixture();
    expect((await request()).status).toBe(200);
    expect((await request(path.replace("/embed.html", "/websockify"))).status).toBe(200);
    expect((await request()).headers.get("cache-control")).toBe("no-store");
  });
  it.each([false, true])(
    "requires current session, membership, and bot ownership (interactive=%s)",
    async (interactive) => {
      for (const change of [
        "deleted session",
        "expired session",
        "wrong session",
        "wrong user",
        "removed membership",
        "wrong member",
        "wrong space",
        "wrong owner",
        "wrong bot space",
      ]) {
        const { request, session, membership, bot } = fixture(interactive);
        expect((await request()).status).toBe(200);
        if (change === "deleted session") session.deleted = true;
        if (change === "expired session") session.expiresAt = new Date(0);
        if (change === "wrong session") session.id = "other";
        if (change === "wrong user") session.userId = "other";
        if (change === "removed membership") membership.deleted = true;
        if (change === "wrong member") membership.userId = "other";
        if (change === "wrong space") membership.spaceId = "other";
        if (change === "wrong owner") bot.userId = "other";
        if (change === "wrong bot space") bot.spaceId = "other";
        const response = await request();
        expect(response.status, change).toBe(403);
        expect(await response.text()).toBe("");
      }
    },
  );

  it.each(["session", "membership", "bot"])(
    "fails closed on a %s database error",
    async (boundary) => {
      const { request, findSession, findMembership, findFirst } = fixture();
      const query =
        boundary === "session"
          ? findSession
          : boundary === "membership"
            ? findMembership
            : findFirst;
      query.mockRejectedValueOnce(new Error("database unavailable"));
      const response = await request();
      expect(response.status).toBe(500);
      expect(await response.text()).toBe("");
    },
  );

  it("requires the proxy credential before looking up a capability", async () => {
    const { request, findFirst, path } = fixture();
    expect((await request(path, "wrong")).status).toBe(403);
    expect(findFirst).not.toHaveBeenCalled();
  });
  it("rejects stopped computers and old URLs after restart at the same address", async () => {
    const { request, computer } = fixture();
    computer.state = "stopped";
    expect((await request()).status).toBe(403);
    computer.state = "running";
    computer.screenGeneration++;
    expect((await request()).status).toBe(403);
  });
  it.each(["suspending", "error", "stopped"])("rejects computer state %s", async (state) => {
    const { request, computer } = fixture();
    computer.state = state;
    expect((await request()).status).toBe(403);
  });
  it("revokes archived, reassigned, and restored bots", async () => {
    const { request, bot } = fixture();
    bot.archivedAt = new Date();
    expect((await request()).status).toBe(403);
    bot.archivedAt = null;
    bot.computerId = "other";
    expect((await request()).status).toBe(403);
    bot.computerId = "computer";
    bot.screenGeneration++;
    expect((await request()).status).toBe(403);
  });
  it.each(["expiry", "release", "replacement", "holder", "bot"])(
    "revokes control on lease %s",
    async (change) => {
      const { request, computer } = fixture(true);
      expect((await request()).status).toBe(200);
      if (change === "expiry") computer.controlLeaseExpiresAt = new Date(0);
      if (change === "release") computer.controlLeaseId = "";
      if (change === "replacement") computer.controlLeaseId = "new-lease";
      if (change === "holder") computer.controlHolder = "agent";
      if (change === "bot") computer.controlBotId = "other";
      expect((await request()).status).toBe(403);
    },
  );
  it("rejects legacy stateless capabilities", async () => {
    expect(
      (await fixture().request("/novnc/MTI3LjAuMC4x/49152/view/9999999999999.fake/embed.html"))
        .status,
    ).toBe(403);
  });
  it("reuses one remote capability across polls and still revokes it", async () => {
    resetRemoteScreenCapabilityReuse();
    const upstream =
      "https://6100-sandbox.example/vnc.html?autoconnect=true&resize=scale&path=websockify%3Ftoken%3Dview-1&view_only=true";
    const { path, request, computer } = fixture(false, upstream);
    const again = new URL(addScreenProxyCapability(upstream, secret, "https://app.example", scope))
      .pathname;
    expect(again).toBe(path);
    expect((await request()).status).toBe(200);
    expect((await request(again.replace("/vnc.html", "/websockify"))).status).toBe(200);
    computer.screenGeneration++;
    expect((await request()).status).toBe(403);
  });
  it("keeps minting a new capability for loopback screens", () => {
    const upstream = "http://127.0.0.1:49152/embed.html?view_only=true";
    const first = addScreenProxyCapability(upstream, secret, "https://app.example", scope);
    const second = addScreenProxyCapability(upstream, secret, "https://app.example", scope);
    expect(new URL(first).pathname).not.toBe(new URL(second).pathname);
  });
  it("passes desktop and other non-http screen URLs through unsealed", () => {
    expect(
      addScreenProxyCapability("desktop://screen/computer", secret, "https://app.example", scope),
    ).toBe("desktop://screen/computer");
    expect(addScreenProxyCapability("local://preview", secret, "https://app.example", scope)).toBe(
      "local://preview",
    );
  });
});
