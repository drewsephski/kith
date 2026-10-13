import { ALTERNATIVES, alternativeMarkdown } from "./alternatives.js";
import { GROK_PAGE } from "./grok-alternative.js";
import { OPENCLAW_PAGE } from "./guide.js";
import { getJourneyCopy } from "./i18n/journey.js";
import { PRIVACY_EFFECTIVE_DATE, PRIVACY_INTRO, PRIVACY_SECTIONS } from "./privacy-policy.js";
import { roundupMarkdown } from "./roundup.js";
import { DESKTOP_URL, GITHUB_URL, SITE_URL, SUPPORT_EMAIL, WEB_START_URL } from "./site.js";

const journey = getJourneyCopy("en");
export const HOME_MARKDOWN = `# Kith

${journey.lead}

- [Continue on Web](${WEB_START_URL})
- [Get Kith for Desktop](${SITE_URL}${DESKTOP_URL})

${journey.benefits.map((item) => `## ${item.title}\n\n${item.body}`).join("\n\n")}

## How it works

${journey.steps.map((item, index) => `${index + 1}. ${item.title}. ${item.body}`).join("\n")}

## ${journey.openTitle}

${journey.openBody}

## Common questions

${journey.faq.map((item) => `### ${item.question}\n\n${item.answer}`).join("\n\n")}
`;
export const ABOUT_MARKDOWN = `# A little help with the work around your day

Kith is your personal AI assistant. Start a conversation, share what matters, and return to the same assistant when you need help again.

## Built around real tasks

Prepare for a meeting. Find the email you meant to reply to. Compare a few options before making a decision. Kith can work with the information you share and the accounts you choose to connect.

## Context that carries forward

Your preferences and saved memories help Kith understand the next task. Review them, change them, or ask Kith to forget. Add a focused bot when you want a separate helper for a recurring job.

## Room for your judgment

Follow sources, review results, and respond to requests for approval. Kith can make mistakes, so check important details before acting on them.

## Open about how it works

Kith’s source code is available on [GitHub](${GITHUB_URL}) under Apache-2.0. For everyday use, start in the app. For account or product questions, visit [Support](${SITE_URL}/support/).

[Get started](${WEB_START_URL})
`;
export const SUPPORT_MARKDOWN = `# Kith support

Get help with sign-in, your account, connected services, or the Kith app.

${SUPPORT_EMAIL ? `Email [${SUPPORT_EMAIL}](mailto:${SUPPORT_EMAIL}) for private support or privacy requests.` : `Visit [support](${SITE_URL}/support/) for contact information.`} Include your app version and a short description of the problem. Never send passwords, API keys, or access tokens.

## Sign-in and connections

Use Forgot password? on the sign-in screen to reset your password. You can disconnect services in the app and revoke access in the connected service’s settings.

## Account deletion

Open Account in the mobile app, choose Delete account, complete the requested identity check, and confirm. This deletes your account and its personal Space data. Content shared with other members and records held by connected services may remain. If you cannot sign in, contact support from your account’s email address; we will verify your request before deleting account data.

## Software issues

Report reproducible bugs in the [issue tracker](${GITHUB_URL}/issues). Keep account information and private screenshots out of public reports. Read the [privacy policy](${SITE_URL}/privacy/) for data handling and privacy choices.
`;
export const PRIVACY_MARKDOWN = `# Privacy policy

Effective ${PRIVACY_EFFECTIVE_DATE}.

${PRIVACY_INTRO}

${SUPPORT_EMAIL ? `For privacy questions or requests, contact [${SUPPORT_EMAIL}](mailto:${SUPPORT_EMAIL}).` : `For privacy questions or requests, visit [support](${SITE_URL}/support/).`}

${PRIVACY_SECTIONS.map((section) => [`## ${section.heading}`, ...section.paragraphs, ...(section.items ? [section.items.map((item) => `- ${item}`).join("\n")] : [])].join("\n\n")).join("\n\n")}
`;
export const TERMS_MARKDOWN = `# Terms of Service

Kith is open-source software. The service operator is responsible for its policies, data handling, and any commercial terms. For questions about your account or the service, visit [Support](${SITE_URL}/support/).

Read the [privacy policy](${SITE_URL}/privacy/) to understand how information is processed and the choices available to you. The [Apache-2.0 license](${GITHUB_URL}/blob/main/LICENSE) covers the source code; it does not set the terms of the hosted service.
`;
export const AGENT_INSTRUCTIONS = `# Kith

> A personal AI assistant for ongoing conversations and practical tasks.

## What Kith helps with

Meeting preparation, email summaries, research, draft replies, saved preferences, and scheduled routines. Account connections are optional and should be requested only when a task needs them. Computer work depends on available tools and permissions.

## How to start

Open the app and describe one task with a clear result. Use [the first-task guide](${SITE_URL}/blog/getting-started-with-kith/) for examples. Follow sources, review important results, and keep approval checks intact. Do not promise access, pricing, or platform availability beyond the current app and download pages.

## Resources

- [Open Kith](${WEB_START_URL})
- [Website](${SITE_URL}/)
- [Blog](${SITE_URL}/blog/)
- [Compare assistants](${SITE_URL}/alternatives/)
- [Source code](${GITHUB_URL})
- [Support](${SITE_URL}/support/)
- [Privacy](${SITE_URL}/privacy/)
- [Terms](${SITE_URL}/terms/)
- [Sitemap](${SITE_URL}/sitemap-index.xml)
`;
export const NOT_FOUND_MARKDOWN = `# Page not found

The requested Kith page does not exist.

- [Home](${SITE_URL}/)
- [Open Kith](${WEB_START_URL})
- [Blog](${SITE_URL}/blog/)
`;
const MARKDOWN_DOCUMENTS = new Map<string, string>([
  ["/", HOME_MARKDOWN],
  ["/about", ABOUT_MARKDOWN],
  ["/openclaw-alternative", alternativeMarkdown(OPENCLAW_PAGE)],
  ["/grok-bot-alternative", alternativeMarkdown(GROK_PAGE)],
  ["/privacy", PRIVACY_MARKDOWN],
  ["/support", SUPPORT_MARKDOWN],
  ["/alternatives", roundupMarkdown()],
  ...ALTERNATIVES.map((page) => [`/${page.slug}`, alternativeMarkdown(page)] as const),
  ["/terms", TERMS_MARKDOWN],
]);

type MediaPreference = {
  quality: number;
  specificity: number;
};

export type Representation = "html" | "markdown" | "not-acceptable";

function normalizePathname(pathname: string): string {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}

function preferenceFor(accept: string, desiredType: string): MediaPreference {
  const [desiredMajor, desiredMinor] = desiredType.split("/");
  let best: MediaPreference = { quality: 0, specificity: -1 };

  for (const rawRange of accept.split(",")) {
    const [rawType = "", ...rawParameters] = rawRange.trim().toLowerCase().split(";");
    const [major, minor] = rawType.trim().split("/");
    if (!major || !minor) continue;

    const specificity =
      major === desiredMajor && minor === desiredMinor
        ? 2
        : major === desiredMajor && minor === "*"
          ? 1
          : major === "*" && minor === "*"
            ? 0
            : -1;
    if (specificity < 0) continue;

    const qualityParameter = rawParameters.find((parameter) => parameter.trim().startsWith("q="));
    const parsedQuality = qualityParameter
      ? Number.parseFloat(qualityParameter.trim().slice(2))
      : 1;
    const quality =
      Number.isFinite(parsedQuality) && parsedQuality >= 0 && parsedQuality <= 1
        ? parsedQuality
        : 0;

    if (
      specificity > best.specificity ||
      (specificity === best.specificity && quality > best.quality)
    ) {
      best = { quality, specificity };
    }
  }

  return best;
}

export function negotiateRepresentation(acceptHeader: string | null): Representation {
  if (!acceptHeader?.trim()) return "html";

  const markdown = preferenceFor(acceptHeader, "text/markdown");
  const html = preferenceFor(acceptHeader, "text/html");

  if (markdown.quality <= 0 && html.quality <= 0) return "not-acceptable";
  if (markdown.quality > html.quality) return "markdown";
  if (markdown.quality === html.quality && markdown.specificity > html.specificity)
    return "markdown";
  return "html";
}

export function getMarkdownDocument(pathname: string): string | undefined {
  return MARKDOWN_DOCUMENTS.get(normalizePathname(pathname));
}

export function getMarkdownAlternate(pathname: string): string | undefined {
  const normalizedPathname = normalizePathname(pathname);
  if (!MARKDOWN_DOCUMENTS.has(normalizedPathname)) return undefined;
  return normalizedPathname === "/" ? "/index.md" : `${normalizedPathname}.md`;
}

export function markdownResponse(body: string, method = "GET", status = 200): Response {
  return new Response(method === "HEAD" ? null : body, {
    status,
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Language": "en",
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '</llms.txt>; rel="describedby"; type="text/plain"',
      Vary: "Accept, Accept-Encoding",
      ...(status === 404 ? { "X-Robots-Tag": "noindex" } : {}),
    },
  });
}
