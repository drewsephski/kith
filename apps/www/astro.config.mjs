import { loadRootEnv } from "@rakazo/core/node/load-root-env";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { isIndexedPath } from "./src/blog/indexability.ts";
import { LOCALE_HREFLANG } from "./src/i18n/locales.ts";
import { resolvePublicConfig } from "./public-config.mjs";
import { resolveWwwPort } from "./www-port.mjs";

loadRootEnv();

const wwwPort = resolveWwwPort();

export default defineConfig({
  site: resolvePublicConfig(process.env).siteUrl,
  output: "static",
  i18n: {
    defaultLocale: "en",
    locales: ["en", "de", "ko", "zh"],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    react(),
    sitemap({
      filter: (page) => isIndexedPath(new URL(page).pathname),
      i18n: {
        defaultLocale: "en",
        locales: LOCALE_HREFLANG,
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  server: {
    host: "127.0.0.1",
    port: wwwPort,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: wwwPort,
  },
});
