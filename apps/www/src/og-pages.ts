import { ALTERNATIVES, ALTERNATIVES_HUB } from "./alternatives";
import { GROK_ALTERNATIVE_H1 } from "./grok-alternative";
import { OPENCLAW_H1 } from "./guide";

export type OgPage = {
  id: string;
  kicker: string;
  title: string;
};

const BLOG_OG: readonly OgPage[] = [
  {
    id: "blog-choosing-an-ai-assistant",
    kicker: "Roundup",
    title: "How to choose an AI assistant",
  },
  {
    id: "blog-openclaw-vs-hermes-vs-kith",
    kicker: "Comparison",
    title: "OpenClaw vs Hermes Agent vs Kith",
  },
  {
    id: "blog-getting-started-with-kith",
    kicker: "Guide",
    title: "Your first useful task with Kith",
  },
];

/** One Open Graph image per marketing page that should not share the homepage image. */
export function ogPages(): OgPage[] {
  return [
    { id: "alternatives", kicker: "Alternatives", title: ALTERNATIVES_HUB.h1 },
    ...ALTERNATIVES.map((page) => ({
      id: page.slug,
      kicker: "Comparison",
      title: page.h1,
    })),
    { id: "grok-bot-alternative", kicker: "Comparison", title: GROK_ALTERNATIVE_H1 },
    { id: "openclaw-alternative", kicker: "Comparison", title: OPENCLAW_H1 },
    ...BLOG_OG,
  ];
}

export function ogPublicPath(id: string): string {
  return `/og/${id}.png`;
}

export function blogOgId(slug: string): string {
  return `blog-${slug}`;
}
