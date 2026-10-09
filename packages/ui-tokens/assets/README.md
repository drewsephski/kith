# Kith artwork

`kith-companion-source.png` is the canonical user-supplied blue bot artwork, with transparency preserved and metadata stripped. `kith-companion.webp` is the shared web/Electron avatar, and `kith-companion.png` is the native UI mark. `kith-app-icon.png` is the opaque, unmasked native icon master. The WebP sidecar records the source checksum and export command.

`kith-companion-working.webp` (web/Electron) and `kith-companion-working.gif` (native) are silent, transparent loops derived from the supplied avatar video. They appear beside the personal assistant's live message, or beside its loading label before text arrives. Other bots keep their own avatars. Playback requires a generating run, visible UI, an active app, and no Reduce Motion preference; unavailable media falls back to the still companion. The animation sidecar records source provenance and export details. These assets are independent of the static brand generator.

`Rakazo.icon` retains its compatibility filename and is the shared editable source for macOS and iOS. It uses the Kith foreground on the shared light background token. Open it in Apple Icon Composer with Xcode 26 or newer. Its `orange-bot.png` layer filename is also retained for compatibility; the artwork is Kith.

Platform exports:

- Desktop `icon.png` and `icon.ico`: Linux and Windows exports of the native master.
- Desktop `icon-macos.png`: development Dock export with transparent outer margins. Packaged macOS builds compile the shared Icon Composer source and generate a legacy ICNS fallback.
- Mobile `icon.png`: unmasked 1024px native master. Android supplies its own mask.
- Mobile `adaptive-icon.png`: centered transparent character foreground, with the semantic background exported separately. Notification and themed icons use its alpha silhouette.
- Web favicons and install icons: transparent character exports with a larger foreground.
- Apple touch icon: resized opaque native master export.

Keep the character's face, silhouette, and lighting consistent. Run `pnpm generate:brand` after replacing the source to refresh all platform exports, the marketing logo, and social image together. The generator uses the shared light background token. It requires ImageMagick; this is a design maintenance step, not a runtime dependency.

`docs/readme-hero.png` is independently maintained editorial artwork showing the companion alongside conversation, memory, and recurring work. The brand generator preserves it.

Refresh the editorial social cards with `pnpm exec tsx apps/www/scripts/render-og.mjs`. Set `CHROME_PATH` to a headless-capable Chromium executable when it is not installed at the script's default location. These cards embed the shared avatar and use the same semantic palette.
