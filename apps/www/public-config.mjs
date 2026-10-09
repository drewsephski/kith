function publicUrl(value, name, { origin = false, local = false } = {}) {
  if (!value?.trim()) return null;
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error(`${name} must be an absolute URL`); }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
  // URL canonicalizes numeric IPv4 forms. Keep this validation edge-compatible:
  // the same module runs in the Astro build and Vercel marketing middleware.
  const ipLiteral = /^[\d.]+$/.test(host) || host.includes(":");
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== "https:" && !(local && loopback && url.protocol === "http:")) ||
      (!loopback && (ipLiteral || !host.includes(".") || host.endsWith(".") ||
        /\.(local|internal|localhost)$/.test(host))) || (!local && loopback) ||
      (origin && url.pathname !== "/")) {
    throw new Error(`${name} must be a public, credential-free HTTPS ${origin ? "origin" : "URL"}`);
  }
  return origin ? url.origin : url.href;
}

/** Local builds are unindexed; deployment builds must name their public origins. */
export function resolvePublicConfig(env) {
  const deployed = Boolean(env.VERCEL || env.KITH_PUBLIC_DEPLOYMENT === "1");
  const siteUrl = publicUrl(env.PUBLIC_SITE_URL, "PUBLIC_SITE_URL", { origin: true, local: !deployed });
  const appUrl = publicUrl(env.PUBLIC_APP_URL, "PUBLIC_APP_URL", { origin: true, local: !deployed });
  if (deployed && (!siteUrl || !appUrl)) throw new Error("Set PUBLIC_SITE_URL and PUBLIC_APP_URL before deploying marketing");
  if (siteUrl && appUrl && siteUrl === appUrl) throw new Error("Marketing and application origins must be different");
  const downloads = Object.fromEntries(["MAC", "WINDOWS", "LINUX"].map((platform) => [
    platform.toLowerCase(), publicUrl(env[`PUBLIC_DESKTOP_${platform}_URL`], `PUBLIC_DESKTOP_${platform}_URL`),
  ]));
  return { siteUrl: siteUrl ?? "http://localhost:4321", appUrl, downloads, indexed: Boolean(siteUrl && new URL(siteUrl).protocol === "https:") };
}
