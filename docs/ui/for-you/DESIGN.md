---
name: Kith — For you
description: "A quiet, grouped prompt list within the incumbent Kith web system."
components:
  prompt-row:
    backgroundColor: "transparent"
    textColor: "var(--foreground)"
    rounded: "var(--radius)"
    padding: "8px"
    width: "100%"
  category-row:
    backgroundColor: "transparent"
    textColor: "var(--muted-foreground)"
    rounded: "var(--radius)"
    padding: "0 12px"
    height: "36px"
  category-row-selected:
    backgroundColor: "var(--sidebar-accent)"
    textColor: "var(--sidebar-accent-foreground)"
    rounded: "var(--radius)"
    padding: "0 12px"
    height: "36px"
---

# Design System: Kith — For you

## Overview

**Creative North Star: "Neutral surfaces, ink, quiet companion"**

This scoped record extends [the web design system](../../../apps/web/DESIGN.md). Its palette, font family, radius scale, spacing scale, and shared control states remain authoritative. For you applies those decisions to a grouped list of starter prompts with a narrow reading column and compact category navigation.

Suggestions are catalog entries, not inferred activity or evidence of connected accounts. The interface keeps the title, a short secondary line, and the action together; selecting a row starts the work in a dedicated assistant conversation.

**Key Characteristics:**

- Monochrome controls and muted secondary text.
- Wrapping prompt rows grouped by modest headings.
- Compact categories beside the list or scrolling above it.
- Shared keyboard focus and reduced-motion behavior.

Source evidence: `apps/web/src/pages/ForYou.tsx`, `apps/web/src/pages/Shell.tsx`, `apps/web/src/pages/WindowChrome.tsx`, `apps/web/src/styles.css`, `packages/core/src/for-you.ts`, and the shared Button, NavigationButton, SelectionIndicator, and useIconAnimation implementations in `packages/ui-web/src/`. Paths in this record are repository-relative. Offline fixture coverage is defined in `apps/web/e2e/for-you-page.spec.ts`; this record does not establish live API, real Electron, or native-device behavior.

## Colors

Inherit the parent semantic palette in both themes. Foreground carries titles; muted foreground carries descriptions, unselected categories, and prompt icons. Selected categories use the sidebar-accent pair. Prompt hover uses the shared ghost-button muted wash; category hover uses accent. Error text uses destructive only when an error exists.

**The Ink Controls Rule.** Use semantic primary for actions, neutral tones for navigation, and success, warning, or destructive only for meaningful status. Identity color belongs to avatars.

## Typography

Inherit the parent ordinary-text font stack. The page title uses medium body-sized text (14px); group headings use medium labels (12px). Prompt titles are regular body text (14px, 20px line height), and descriptions are regular secondary text (12px, 20px line height). Category labels are body-sized, regular at rest and medium when selected. This surface introduces no display type role.

**The Quiet Labels Rule.** Use sentence case and modest weight for navigation and section labels. Keep long reading content at regular weight.

## Layout

The full-height surface keeps its header fixed in the flex layout (64px) and scrolls the prompt region independently. The centered list has a maximum width (672px). Below the medium breakpoint (768px), categories scroll horizontally above the list; from that breakpoint, they form a left column (176px). Main horizontal padding grows from 16px to 32px. Category labels do not shrink; prompt titles and descriptions wrap.

Groups use generous separation (40px) with smaller heading-to-list spacing (12px) and compact row gaps (4px). Prompt rows have a minimum height (56px), an icon-to-text gap (12px), and the frontmatter padding. The scroll region retains bottom breathing room (48px). The medium breakpoint describes responsive web layout, not native mobile navigation.

## Elevation & Depth

Prompt groups sit directly on the canvas. Whitespace separates groups; a tonal selection indicator and hover wash identify controls. Rows do not introduce card shells or resting shadows. Focus uses the existing semantic border and half-opacity ring (3px).

## Shapes

Rows inherit the shared base control radius through `var(--radius)`. Selection indicators inherit the row silhouette. The page adds no new radius or border vocabulary.

## Components

### Prompt rows

Full-width shared ghost buttons hold a decorative outline SVG icon, title, and secondary description. The shared button SVG rule resolves the icons to 16px. Text remains left-aligned and wraps naturally. The accessible name is the translated title; decorative icons are hidden from assistive technology. Busy state disables prompt selection and exposes `aria-busy` on the list container.

The shared typed catalog owns title, description, group, category, and prompt. Selection creates an empty child of the personal assistant, sends the catalog prompt immediately, and opens the resulting conversation on success. A failed send retains the created bot and client nonce for retry; it does not seed the composer. Error feedback appears as a contextual alert above the groups.

### Category navigation

Shared NavigationButton rows sit within one SelectionGroup. Pressed state is exposed through `aria-pressed`; the surface explicitly suppresses `aria-current` because these controls filter the list. Selected rows gain the shared tonal indicator and medium text. The indicator slides using the existing scoped motion; reduced motion renders it immediately.

### Shell controls and motion

The header retains navigation access when the sidebar is hidden. Electron window chrome is supplied to this surface when its sidebar is collapsed; ordinary web navigation uses the existing responsive sidebar controls. Native macOS traffic-light space remains owned by WindowChrome.

Surrounding sidebar connections, brain, and settings controls, and the shell maximize control, reuse the supplied animated SVG implementations. Pointer hover and keyboard focus start motion; leaving or blurring restores the normal state. Their shared useIconAnimation hook suppresses animation for reduced motion. These controls remain shared shell components, not a new For you icon system.

## Do's and Don'ts

### Do:

- **Do** inherit semantic tokens and shared control primitives from the parent system.
- **Do** keep prompt text wrapping and category navigation reachable at narrow widths.
- **Do** preserve pressed state, keyboard focus, busy state, and contextual retry feedback.
- **Do** keep suggestions distinguishable from verified activity and connected-account evidence.

### Don't:

- **Don't** add identity colors to ordinary categories or prompt controls.
- **Don't** turn secondary details into permanent explanatory chrome.
- **Don't** replace semantic colors with fixed light-theme or dark-theme colors.

Not canonized: fixed fallback window-control colors are platform chrome, not product palette tokens; inherited legacy craft exceptions remain excluded by the parent record.
