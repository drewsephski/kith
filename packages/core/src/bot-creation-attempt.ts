/** Creation intent is scoped to the authenticated owner and Space, never the current screen. */
export function botCreationAttemptKey(scope: {
  endpoint: string;
  userId: string;
  spaceId: string;
}): string {
  const encoded = [scope.endpoint, scope.userId, scope.spaceId]
    .map((value) =>
      Array.from(value, (character) => character.codePointAt(0)!.toString(16)).join("-"),
    )
    .join(".");
  return `rakazo.bot-create.${encoded}`;
}

/** Reuse an unresolved intent after a lost response or reload. */
export function botCreationNonce(stored: string | null, generate: () => string): string {
  return stored && /^[a-zA-Z0-9_-]{16,120}$/.test(stored) ? stored : generate();
}

/** Only a scoped, definitive tombstone response settles an unresolved create intent. */
export function botCreationIntentRemoved(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ONBOARDING_TARGET_REMOVED",
  );
}
