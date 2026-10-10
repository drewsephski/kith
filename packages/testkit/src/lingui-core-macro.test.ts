import { describe, expect, it } from "vitest";
import { msg, t } from "./lingui-core-macro.js";

describe("source-test Lingui macros", () => {
  it("preserves explicit descriptor identity, fallback text, and interpolation values", () => {
    const descriptor = {
      id: "greeting",
      message: "Hello {name}",
      values: { name: "Scout" },
      comment: "Greeting shown in the conversation",
    };
    expect(msg(descriptor)).toBe(descriptor);
    expect(msg({ id: "outreach" })).toEqual({ id: "outreach" });
  });

  it("renders the existing English template behavior", () => {
    expect(t`Hello ${"Scout"}`).toBe("Hello Scout");
  });
});
