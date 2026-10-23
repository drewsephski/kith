# Dependency patches

## expo-modules-core 57.0.24

Android CI crashed in `convertSharedObject` while opening a bot-creation deep
link. The native object still had an ID after Hermes collected its weak JS
peer, so the synchronous conversion dereferenced a null registry lookup.

The Android-only patch keeps a live peer when one exists. Otherwise it removes
the stale pairing before creating a new peer, preventing the old peer's delayed
destructor from resetting the new ID. It follows the recovery proposed in
[Expo PR 47805](https://github.com/expo/expo/pull/47805), which was closed in favor
of an async argument lifetime fix; the synchronous lookup remains unguarded in
our installed SDK. The original issue is
[Expo issue 47787](https://github.com/expo/expo/issues/47787).

Validate with a fresh Android native build and the CI bot-creation/deep-link
journey. This native fix requires a new binary; an OTA JavaScript update cannot
apply it. Remove the patch when an Expo release guards this lookup and the same
journey passes without it. iOS sources are unchanged.
