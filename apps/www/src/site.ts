import { resolvePublicConfig } from "../public-config.mjs";
import type { Locale } from "./i18n/locales.js";

const env = { ...process.env, ...import.meta.env };
const config = resolvePublicConfig(env);
export const SITE_NAME = "Kith";
export const SUPPORT_EMAIL = env.PUBLIC_SUPPORT_EMAIL?.trim();
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
export const OPENCLAW_ALTERNATIVE_PATH = "/openclaw-alternative/";
export const CHANGELOG_URL = "https://github.com/drewsephski/kith/releases";
