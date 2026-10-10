import type { Locale } from "./i18n/locales";
import { resolvePublicConfig } from "../public-config.mjs";

const env = { ...process.env, ...import.meta.env };
// An explicit origin overrides the public app; an empty value keeps Web unconfigured.
const config = resolvePublicConfig({
  ...env,
  PUBLIC_APP_URL: env.PUBLIC_APP_URL ?? "https://kith-agent-app.vercel.app",
});
export const SITE_NAME = "Kith";
export const SITE_URL = config.siteUrl;
export const SITE_INDEXED = config.indexed;
export const APP_URL = config.appUrl;
export function webStartHref(locale: Locale = "en") {
  return APP_URL ? `${APP_URL}/start` : locale === "en" ? "/start/" : `/${locale}/start/`;
}
export function signInHref(locale: Locale = "en") {
  return APP_URL ? `${APP_URL}/sign-in` : webStartHref(locale);
}
export const WEB_START_URL = webStartHref();
export const SIGN_IN_URL = signInHref();
export const DESKTOP_URL = "/download/";
export const DESKTOP_DOWNLOADS = config.downloads;
export const SITE_DESCRIPTION =
  "Your personal AI assistant. It remembers what matters, gets work done, and shows you what happened.";

export const GITHUB_URL = "https://github.com/drewsephski/kith";
export const GITHUB_API_REPO = "https://api.github.com/repos/drewsephski/kith";
export const DOCS_URL = "https://github.com/drewsephski/kith/blob/main/docs/self-host.md";
export const SELF_HOST_SECRETS_URL =
  "https://github.com/drewsephski/kith/blob/main/docs/self-host-secrets.md";
export const SELF_HOST_RESTRICTED_URL =
  "https://github.com/drewsephski/kith/blob/main/docs/self-host-restricted-network.md";
export const SETUP_PROMPT_URL = "https://github.com/drewsephski/kith/blob/main/SETUP_PROMPT.md";
export const SELF_HOST_GUIDE_PATH = "/self-hosted-ai-agent/";
export const OPENCLAW_ALTERNATIVE_PATH = "/openclaw-alternative/";
export const CHANGELOG_URL = "https://github.com/drewsephski/kith/releases";
