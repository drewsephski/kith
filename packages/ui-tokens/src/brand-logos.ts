import { svglArtwork } from "./brand-logos/artwork.js";
import { svglCatalog } from "./brand-logos/catalog.js";
import { officialBrandLogos } from "./brand-logos/official.js";

const aliases: Record<string, string> = {
  googlemail: "gmail",
  gcal: "googlecalendar",
  gdrive: "googledrive",
  slackbot: "slack",
  notionso: "notion",
  mcp: "modelcontextprotocol",
  anthropicoauth: "anthropic",
  claude: "claudeai",
  claudecode: "claudeai",
  claudepromax: "claudeai",
  claudepro: "claudeai",
  openaicodex: "openai",
  openaicodexoauth: "openai",
  googleaistudio: "gemini",
  googlegenerativeai: "gemini",
  googlevertex: "gemini",
  mistral: "mistralai",
  together: "togetherai",
  perplexity: "perplexityai",
  cloudflareaigateway: "cloudflare",
  huggingfaceinference: "huggingface",
  azure: "microsoftazure",
  outlook: "microsoftoutlook",
  microsoftoutlookcalendar: "microsoftoutlook",
  microsoftoutlookemail: "microsoftoutlook",
  teams: "microsoftteams",
};

/** Exact normalized brand names only: custom server names never match by substring. */
export function resolveBrandLogo(...names: (string | null | undefined)[]) {
  for (const name of names) {
    const normalized = name?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
    const key = Object.hasOwn(aliases, normalized) ? aliases[normalized]! : normalized;
    if (key === "composio") return { key, ...officialBrandLogos.composio };
    const routes = Object.hasOwn(svglCatalog, key) ? svglCatalog[key] : undefined;
    if (routes) return { key, routes, artwork: svglArtwork[key] };
  }
  return null;
}

const dataUris = new Map<string, string>();

/** Embedded common brands work offline; the remaining catalog uses SVGL's asset URLs. */
export function brandLogoUri(
  logo: NonNullable<ReturnType<typeof resolveBrandLogo>>,
  appearance: "light" | "dark",
): string {
  const xml = logo.artwork?.[appearance];
  if (!xml) return logo.routes[appearance];
  const key = `${logo.key}:${appearance}`;
  let uri = dataUris.get(key);
  if (!uri) {
    uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    dataUris.set(key, uri);
  }
  return uri;
}
