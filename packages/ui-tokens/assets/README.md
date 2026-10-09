# Kith artwork

`kith-companion.webp` is the original, transparent sage companion used by the shared web UI. `kith-app-icon.png` is the unmasked native icon master. Exact generation prompts are retained alongside both sources and embedded in shipping PNG exports; WebP provenance uses its JSON sidecar.

`Rakazo.icon` retains its compatibility filename and is the shared editable source for macOS and iOS. It uses the Kith foreground on the shared light background token. Open it in Apple Icon Composer with Xcode 26 or newer. Its `orange-bot.png` layer filename is also retained for compatibility; the artwork is Kith.

Platform exports:

- Desktop `icon.png` and `icon.ico`: Linux and Windows exports of the native master.
- Desktop `icon-macos.png`: development Dock export with transparent outer margins. Packaged macOS builds compile the shared Icon Composer source and generate a legacy ICNS fallback.
- Mobile `icon.png`: unmasked 1024px native master. Android supplies its own mask.
- Mobile `adaptive-icon.png`: centered transparent character foreground, with the semantic background exported separately. Notification and themed icons use its alpha silhouette.
- Web favicons, install icons, and touch icon: resized native master exports.

Keep the character's face, silhouette, and lighting consistent. Refresh these exports together when the source changes. Icon conversion requires ImageMagick; it is a design maintenance step, not a runtime dependency.
