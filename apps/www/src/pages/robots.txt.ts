import { SITE_INDEXED } from "../site";
import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL("sitemap-index.xml", site);
  const body = SITE_INDEXED ? `User-agent: *\nAllow: /\n\nSitemap: ${sitemap.href}\n` : "User-agent: *\nDisallow: /\n";

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
