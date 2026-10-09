import { next } from "@vercel/functions";
import {
  getMarkdownAlternate,
  getMarkdownDocument,
  markdownResponse,
  negotiateRepresentation,
} from "./src/agent-content.js";

const VARY_HEADER = "Accept, Accept-Encoding";
import { resolvePublicConfig } from "./public-config.mjs";

const APEX_ORIGIN = resolvePublicConfig(process.env).siteUrl;
const CANONICAL_HOST = new URL(APEX_ORIGIN).hostname;
const WWW_HOST = CANONICAL_HOST.startsWith("www.") ? null : `www.${CANONICAL_HOST}`;

export const config = {
  matcher: ["/((?!api|rpc|screen|oauth|mcp|_astro|.*\\..*).*)", "/sitemap.xml"],
};

function permanentRedirect(location: string): Response {
  return new Response(null, {
    status: 301,
    headers: { Location: location },
  });
}

export default function middleware(request: Request): Response {
  const url = new URL(request.url);
  if (/^\/(api|rpc|screen|oauth|mcp|files)(?:\/|$)/.test(url.pathname)) return next();

  if (url.hostname.toLowerCase() === WWW_HOST) {
    const destination = new URL(`${url.pathname}${url.search}`, APEX_ORIGIN);
    return permanentRedirect(destination.toString());
  }

  if (url.pathname === "/sitemap.xml") {
    const destination = new URL(`/sitemap-index.xml${url.search}`, url.origin);
    return permanentRedirect(destination.toString());
  }

  if (request.method !== "GET" && request.method !== "HEAD") return next();

  const acceptHeader = request.headers.get("accept");
  const representation = negotiateRepresentation(acceptHeader);
  const markdown = getMarkdownDocument(url.pathname);

  if (representation === "markdown" && markdown) {
    return markdownResponse(markdown, request.method);
  }

  if (representation === "not-acceptable") {
    return new Response(
      request.method === "HEAD"
        ? null
        : "Not acceptable. Request text/html or text/markdown.\n",
      {
        status: 406,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          Vary: VARY_HEADER,
        },
      },
    );
  }

  const markdownAlternate = getMarkdownAlternate(url.pathname);
  return next({
    headers: {
      ...(markdownAlternate
        ? {
            Link: `<${markdownAlternate}>; rel="alternate"; type="text/markdown"`,
          }
        : {}),
      Vary: VARY_HEADER,
    },
  });
}
