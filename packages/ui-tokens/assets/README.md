# Kith artwork

`kith-companion-source.png` is the canonical user-supplied blue bot artwork, with transparency preserved and metadata stripped. `kith-companion.webp` is the shared web/Electron avatar, and `kith-companion.png` is the native UI mark. `kith-app-icon.png` is the opaque, unmasked native icon master. The WebP sidecar records the source checksum and export command.

`Rakazo.icon` retains its compatibility filename and is the shared editable source for macOS and iOS. It uses the Kith foreground on the shared light background token. Open it in Apple Icon Composer with Xcode 26 or newer. Its `orange-bot.png` layer filename is also retained for compatibility; the artwork is Kith.

Platform exports:

- Desktop `icon.png` and `icon.ico`: Linux and Windows exports of the native master.
- Desktop `icon-macos.png`: development Dock export with transparent outer margins. Packaged macOS builds compile the shared Icon Composer source and generate a legacy ICNS fallback.
- Mobile `icon.png`: unmasked 1024px native master. Android supplies its own mask.
- Mobile `adaptive-icon.png`: centered transparent character foreground, with the semantic background exported separately. Notification and themed icons use its alpha silhouette.
- Web favicons, install icons, and touch icon: resized native master exports.

Keep the character's face, silhouette, and lighting consistent. Run `pnpm generate:brand` after replacing the source to refresh all platform exports, the marketing logo, social image, and README artwork together. The generator uses the shared light background token. It requires ImageMagick; this is a design maintenance step, not a runtime dependency.

Refresh the editorial social cards with `pnpm exec tsx apps/www/scripts/render-og.mjs`. Set `CHROME_PATH` to a headless-capable Chromium executable when it is not installed at the script's default location. These cards embed the shared avatar and use the same semantic palette.
