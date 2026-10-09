/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_POSTHOG_HOST?: string;
  readonly PUBLIC_POSTHOG_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_APP_URL?: string;
  readonly PUBLIC_DESKTOP_MAC_URL?: string;
  readonly PUBLIC_DESKTOP_WINDOWS_URL?: string;
  readonly PUBLIC_DESKTOP_LINUX_URL?: string;
}
