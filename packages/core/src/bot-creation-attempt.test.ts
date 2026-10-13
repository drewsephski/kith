import { describe, expect, it } from "vitest";
import {
  botCreationAttemptKey,
  botCreationIntentRemoved,
  botCreationNonce,
} from "./bot-creation-attempt.js";

describe("bot creation intent", () => {
  it("keeps retries on the original nonce", () => {
    const nonce = "00000000-0000-4000-8000-000000000001";
    expect(botCreationNonce(nonce, () => "replacement")).toBe(nonce);
    expect(botCreationNonce(null, () => nonce)).toBe(nonce);
    expect(botCreationNonce("invalid", () => nonce)).toBe(nonce);
  });
  it("isolates the endpoint, user and Space without ambiguous separators", () => {
    const scope = { endpoint: "https://example.test", userId: "user", spaceId: "space" };
    const key = botCreationAttemptKey(scope);
    for (const field of ["endpoint", "userId", "spaceId"] as const) {
      expect(botCreationAttemptKey({ ...scope, [field]: `${scope[field]}-other` })).not.toBe(key);
    }
    expect(botCreationAttemptKey({ ...scope, userId: "a.b", spaceId: "c" })).not.toBe(
      botCreationAttemptKey({ ...scope, userId: "a", spaceId: "b.c" }),
    );
  });
  it("only settles the definitive scoped tombstone error", () => {
    expect(botCreationIntentRemoved({ code: "ONBOARDING_TARGET_REMOVED" })).toBe(true);
    for (const error of [
      { code: "NOT_FOUND" },
      { code: "FORBIDDEN" },
      new Error("Lost response"),
      null,
    ])
      expect(botCreationIntentRemoved(error)).toBe(false);
  });
});
