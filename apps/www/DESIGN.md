---
name: Kith marketing
description: "Neutral surfaces, ink platform links, and the original blue companion."
colors:
  background: "#FAFAFB"
  foreground: "#24262B"
  card: "#FFFFFF"
  primary: "#24262B"
  primary-foreground: "#FFFFFF"
  secondary: "#F1F2F4"
  muted-foreground: "#646872"
  accent: "#E9EBEF"
  border: "#DFE2E7"
  ring: "#24262B"
typography:
  headline:
    fontFamily: "Aeonik, Geist, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 500
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
rounded:
  control: "14px"
  card: "20px"
  menu: "12px"
spacing:
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
    padding: "0 22px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.control}"
    padding: "0 22px"
    height: "48px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.card}"
    padding: "26px"
  faq:
    textColor: "{colors.foreground}"
    padding: "22px 0"
---
# Design System: Kith marketing

## Overview

**Creative North Star: "Neutral surfaces, ink, quiet companion"**

The original blue companion gives the site its friendly identity. Neutral surfaces, ink platform links, generous space, and modest prose connect the marketing site to the conversation product. Aeonik headings distinguish the public site while Geist carries reading and controls.

This record describes the shipped Astro site, especially its consumer homepage and platform pages. Sources are `src/styles/global.css`, `src/components/HomePage.astro`, `src/components/Button.astro`, `src/components/Header.astro`, `src/layouts/BaseLayout.astro`, and `../../packages/ui-tokens/src/index.ts`. Desktop and narrow marketing captures and the release-status fallback are recorded in `../web/.impeccable/review/`; their configured placeholder origins do not verify production domains or installers.

**Key Characteristics:**

- Neutral surfaces and ink functional controls.
- Original blue companion, reused without alteration.
- Medium editorial headings and regular reading text.
- Open sections, fine dividers, and native disclosures.

## Colors

The light site inherits the shared semantic palette; frontmatter records those source values. Its root aliases page, surface, ink, muted text, and line to shared tokens. Legacy variable names containing “blue” now resolve to functional ink or neutral tokens.

### Primary

- **Ink:** primary links and filled platform actions use the primary pair; focus uses ring.

### Neutral

- **Quiet canvas:** background holds the page; card and secondary distinguish controls and restrained surfaces.
- **Reading ink:** foreground carries body and heading text; muted foreground carries supporting prose.
- **Fine edge:** border separates sections, cards, and menu surfaces. Accent supplies the interaction wash.

**The Ink Controls Rule.** Keep functional controls monochrome. Blue belongs to the companion and bot identity artwork.

## Typography

**Display and heading font:** the locally supplied medium Aeonik face, falling back to Geist and system sans-serif.
**Body font:** Geist with system sans-serif fallbacks. Technical examples use Geist Mono with a monospace fallback.

Headings use medium weight and restrained negative tracking; paragraphs stay regular. The consumer hero uses a responsive headline (42–70px, line height 1.08); supporting benefit headings use 30px with a 1.2 line height. General section headings use a 36–42px clamp with a 1.1 line height. Repeated reading text uses the body role; the hero lead rises to 18px and returns to 16px on narrow screens. Compact navigation and metadata use approximately 14px.

**The Quiet Labels Rule.** Use sentence case and modest weight for controls and supporting labels. Keep reading text at regular weight.

## Layout

The page uses a centered container (1150px maximum) with 24px side gutters, reducing to 16px at 720px. The hero centers companion, heading, lead, and wrapping platform actions. Its companion is 96px on desktop and 72px below 768px. Benefits and ordered steps use three equal columns with a 56px gap, becoming one column with a 32px gap below 768px. Open sections and fine dividers provide grouping without a card around every passage.

Section spacing is generous: the shared top padding is 110px, reducing to 84px at 720px. The hero and divided open section have their own tighter spacing. Below 768px the platform actions stack; hero actions remain at least 48px tall. Below 860px desktop navigation gives way to the existing menu disclosure. Narrow platform lists also stack their text and action vertically. FAQ content caps at 780px; supporting prose uses shorter measures than the full container.

## Elevation & Depth

Depth is primarily tonal and spatial. The recurring soft shadow (`0 2px 16px rgba(0, 0, 0, 0.03)`) appears under controls and selected existing cards; fine semantic borders separate regions. The existing illustrative product demo has its own dark frame and deeper shadow; it is an explicitly labeled demonstration, not a token authority for the app.

**The Tonal Depth Rule.** Use open space, surface tone, and fine borders for persistent sections. Reserve stronger depth for floating menus and the existing demo frame.

## Shapes

Controls have gently curved corners; repeated feature cards use the card radius. Menus use smaller corners. The original companion silhouette stays in the supplied asset. Hairline dividers and native disclosure markers are part of this world.

## Components

### Buttons

Platform links are clear, restrained anchors. The primary variant uses semantic primary and primary foreground; secondary uses a white surface and fine border. Both are 48px minimum height, with 22px horizontal padding, 16px medium text, and the recorded control radius. Small variants reduce to 42px and 14px text. Focus has a 2px ring with a 3px offset; hover preserves restrained shadow and changes the secondary surface subtly. Shared transitions last 180ms; reduced motion suppresses transitions and smooth scrolling.

### Cards / Containers

Repeated existing feature cards have the card radius, fine border, soft shadow, and 26px padding. The consumer benefits use open columns rather than card wrappers. Platform availability uses divided rows and contextual action links; the component renders actual release availability or an honest fallback.

### Navigation

Compact text links sit beside the brand. Active interaction strengthens text toward ink. Narrow screens use the existing native details menu; its panel has a card-colored surface, fine border, and softly rounded links. Accessible names and visible focus remain necessary across localized labels.

### FAQ

Native details and summary preserve familiar disclosure behavior. Each row uses a bottom border and 22px vertical padding; the summary is an 18px medium sentence-case title. Expanded prose uses regular body text and muted foreground. No fabricated answers or decorative accordion controls are required.

## Do's and Don'ts

### Do:

- **Do** inherit semantic colors from the shared token source.
- **Do** reuse original companion assets and the existing platform-link component.
- **Do** preserve wrapping labels, readable narrow layouts, and visible keyboard focus.
- **Do** keep reduced motion and native disclosure behavior.
- **Do** make unavailable platform actions an honest contextual state.

### Don't:

- **Don't** recolor functional controls with the companion's blue identity.
- **Don't** wrap every section in cards or turn supporting prose into persistent status chrome.
- **Don't** imply that illustrative demo data proves connected accounts or executed work.
- **Don't** treat legacy fixed colors, glyph icons, or eyebrow treatments as new system patterns.

Not canonized: legacy fixed-color demo chrome, fixed secondary-link text, glyph icons, and eyebrow or uppercase metadata styles remain implementation exceptions or craft defects. They do not override the shared semantic palette or establish patterns for new surfaces. No native physical-device or production availability proof is recorded.
