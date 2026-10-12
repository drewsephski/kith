import { describe, expect, it } from "vitest";
import { ResponseTiming } from "./response-timing";

describe("client response timing", () => {
  it("retains text arriving before the acceptance RPC returns", () => {
    let now = 0;
    const timing = new ResponseTiming(() => now);
    timing.begin("scope", "nonce");
    now = 5;
    timing.event("scope", "run", true, false);
    now = 8;
    timing.frame("scope", "run");
    now = 10;
    expect(timing.accept("scope", "nonce", ["run"])).toEqual([
      expect.objectContaining({
        runId: "run",
        acknowledgmentMs: 10,
        firstTextReceivedMs: 5,
        firstTextFrameMs: 8,
      }),
    ]);
    expect(timing.accept("scope", "nonce", ["run"])).toEqual([]);
    expect(timing.frame("scope", "run")).toBeUndefined();
    expect(timing.read("run")?.firstTextFrameMs).toBe(8);
  });
  it("keeps acceptance, safe text, committed frame and completion distinct across nonce replay", () => {
    let now = 0;
    const timing = new ResponseTiming(() => now);
    timing.begin("scope", "nonce");
    now = 10;
    timing.accept("scope", "nonce", ["run"]);
    now = 20;
    timing.begin("scope", "nonce");
    timing.accept("scope", "nonce", ["run"]);
    timing.event("scope", "run", false, false);
    expect(timing.frame("scope", "run")).toBeUndefined();
    now = 40;
    timing.event("scope", "run", true, false);
    now = 50;
    expect(timing.frame("scope", "run")).toMatchObject({
      acknowledgmentMs: 10,
      firstTextReceivedMs: 40,
      firstTextFrameMs: 50,
    });
    now = 60;
    expect(timing.frame("scope", "run")).toBeUndefined();
    timing.event("scope", "run", true, true);
    expect(timing.read("run")?.completionMs).toBe(60);
  });
  it("ignores other scopes and discards traces after an account or Space change", () => {
    const timing = new ResponseTiming(() => 1);
    timing.begin("a", "n");
    timing.accept("a", "n", ["r"]);
    timing.event("b", "r", true, true);
    expect(timing.frame("b", "r")).toBeUndefined();
    timing.begin("b", "n");
    expect(timing.read("r")).toBeUndefined();
    expect(timing.accept("a", "n", ["r"])).toEqual([]);
    timing.accept("b", "n", ["new-run"]);
    expect(timing.read("new-run")?.acknowledgmentMs).toBe(0);
  });
});
