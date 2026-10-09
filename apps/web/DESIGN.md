---
name: Kith
description: "Neutral gray, blue accents, and a quiet personal companion."
colors:
  "background": "#FAFAFB"
  "foreground": "#24262B"
  "card": "#FFFFFF"
  "card-foreground": "#24262B"
  "popover": "#FFFFFF"
  "popover-foreground": "#24262B"
  "primary": "#245FC5"
  "primary-foreground": "#FFFFFF"
  "secondary": "#F1F2F4"
  "secondary-foreground": "#24262B"
  "chat-user": "#EAECF0"
  "chat-user-foreground": "#24262B"
  "muted": "#F1F2F4"
  "muted-foreground": "#646872"
  "accent": "#E9EBEF"
  "accent-foreground": "#24262B"
  "destructive": "#DC2626"
  "destructive-foreground": "#FFFFFF"
  "border": "#DFE2E7"
  "input": "#E9EBEF"
  "ring": "#245FC5"
  "sidebar": "#F0F1F3"
  "sidebar-foreground": "#24262B"
  "sidebar-border": "#DFE2E7"
  "sidebar-accent": "#DFE9FB"
  "sidebar-accent-foreground": "#1E4FAD"
  "link": "#245FC5"
  "success": "#207F37"
  "warning": "#946018"
  "overlay": "rgba(20, 20, 22, 0.45)"
  "dark-background": "#0B0C0E"
  "dark-foreground": "#ECECEE"
  "dark-card": "#141518"
  "dark-card-foreground": "#ECECEE"
  "dark-popover": "#141518"
  "dark-popover-foreground": "#ECECEE"
  "dark-primary": "#78A7FA"
  "dark-primary-foreground": "#101828"
  "dark-secondary": "#18191E"
  "dark-secondary-foreground": "#ECECEE"
  "dark-chat-user": "#22242B"
  "dark-chat-user-foreground": "#ECECEE"
  "dark-muted": "#141518"
  "dark-muted-foreground": "#9A9DA5"
  "dark-accent": "#1A1B20"
  "dark-accent-foreground": "#ECECEE"
  "dark-destructive": "#EF4444"
  "dark-destructive-foreground": "#FFFFFF"
  "dark-border": "#1E2026"
  "dark-input": "#18191E"
  "dark-ring": "#78A7FA"
  "dark-sidebar": "#111215"
  "dark-sidebar-foreground": "#ECECEE"
  "dark-sidebar-border": "#1C1D22"
  "dark-sidebar-accent": "#1D2C46"
  "dark-sidebar-accent-foreground": "#A8C7FF"
  "dark-link": "#A8C7FF"
  "dark-success": "#4ECB71"
  "dark-warning": "#E9C46A"
  "dark-overlay": "rgba(4, 4, 5, 0.72)"
typography:
  "title":
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Geist Variable\", ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
  "body":
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Geist Variable\", ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  "chat":
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Geist Variable\", ui-sans-serif, system-ui, sans-serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.7
  "label":
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Geist Variable\", ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
rounded:
  "sm": "8px"
  "md": "10px"
  "lg": "12px"
  "xl": "16px"
  "2xl": "20px"
  "full": "9999px"
spacing:
  "1": "4px"
  "1.5": "6px"
  "2": "8px"
  "2.5": "10px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
components:
  "button-primary":
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  "button-outline":
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  "button-secondary":
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  "button-ghost":
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  "button-destructive":
    backgroundColor: "color-mix(in oklab, var(--destructive) 10%, transparent)"
    textColor: "{colors.destructive}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  "button-link":
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  "input":
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  "navigation-row":
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "40px"
  "filter-chip":
    backgroundColor: "color-mix(in oklab, var(--muted) 40%, transparent)"
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  "card":
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
    padding: "16px"
    typography: "{typography.body}"
---
# Design System: Kith

## Overview

**Creative North Star: "Neutral gray, blue accents, quiet companion"**

Neutral gray surfaces and a quiet companion give Kith a friendly, low-chrome setting. Open space and readable conversation carry the experience. Blue connects the companion to selected navigation, focus rings, links, and primary actions.

The shared web UI also runs inside Electron. Density stays compact in navigation and contextual lists while the conversation has room to breathe. Details appear in contextual panels; the persistent composer and conversation remain the visual anchor. Native setup shares the semantic palette but keeps its own window controls and form geometry.

**Key Characteristics:**

- Neutral gray surfaces with restrained blue actions and selection.
- Compact controls around a spacious conversation.
- Small original companion artwork.
- Contextual detail and restrained, reduced-motion-aware transitions.

This record describes the built web/Electron surfaces, shared primitives, and native setup renderer. Sources are `src/styles.css`, `src/pages/Shell.tsx`, `src/pages/shell/kith-sidebar.tsx`, `src/pages/shell/assistant-welcome.tsx`, `src/pages/ActivityList.tsx`, `src/pages/PersonalMemoryPanel.tsx`, `../../packages/ui-tokens/src/index.ts`, `../../packages/ui-web/src/`, and `../desktop/src/setup.css`. Responsive web and browser-rendered setup captures support the source scan; they do not establish physical native-device behavior.

## Colors

A neutral gray light palette pairs with a cool near-black dark palette. Frontmatter records actual semantic values; `dark-` entries are their dark-theme counterparts. Runtime components inherit the corresponding unprefixed CSS custom properties from the active theme.

### Primary

- **Blue / light blue:** `primary` and `primary-foreground` define filled actions, including the composer send control. Dark mode pairs a lighter blue action with dark text.

### Neutral

- **Neutral gray / near-black canvas:** `background` gives the conversation its quiet field.
- **Clean sheet / lifted charcoal:** `card` and `popover`, with their foreground pairs, separate details and overlays.
- **Soft paper / charcoal:** `secondary` and `muted` support secondary controls and subdued surfaces. `muted-foreground` carries helper copy and metadata.
- **Paper edge / charcoal edge:** `border`, `input`, and `sidebar-border` divide surfaces with restrained strokes.
- **Sidebar paper / dark sidebar:** `sidebar` and its foreground pair set the navigation region; `sidebar-accent` supplies its selected row.
- **Conversation paper / dark bubble:** `chat-user` and its foreground pair distinguish user messages.
- **Hover wash:** `accent` and its foreground pair identify interaction states.
- **Focus and links:** `ring` and `link` remain semantic and appearance-aware. The retained dark palette uses blue for these functional roles; the build is not strictly hue-free.
- **Scrim:** `overlay` dims content behind temporary navigation and floating surfaces.

### Status

- **Destructive red:** destructive actions and error feedback.
- **Success green:** completed or healthy states.
- **Warning amber:** input or attention required.

The blue companion is a raster identity asset. Semantic blue accents complement it without sampling colors at runtime. Other bots retain the existing shared identity-color array.

### Named Rules

**The Restrained Accent Rule.** Use semantic blue for primary actions, selected navigation, tabs, links, and focus. Keep ordinary surfaces and inactive controls neutral. Success, warning, and destructive communicate meaningful status.

## Typography

**Body and title font:** macOS system face first, BlinkMacSystemFont next, then Geist Variable and system sans-serif fallbacks, as recorded in frontmatter. Native setup has its own system-first fallback stack. Monospace is confined to technical fields and logs.

**Character:** familiar, restrained, and compact. Weight and space establish hierarchy without decorative fonts or large blocks of emphasized copy.

### Hierarchy

- **Title:** medium weight for conversation names and shared card titles.
- **Body:** regular weight for navigation, controls, and panels; controls selectively use medium weight.
- **Chat:** a slightly larger regular reading size; assistant prose uses the recorded relaxed line height, while user bubbles use a tighter line height (1.45).
- **Label:** compact sentence-case group headings and metadata; secondary rows also retain observed sizes around 12.5–13px.

The greeting currently uses a responsive system title (30px, rising to 36px at the small breakpoint; medium weight, tight tracking, 1.25 line height). It is an observed surface treatment, not a reusable display-font token. The sidebar wordmark uses a semibold compact title (24px). Neither establishes a separate display family.

### Named Rules

**The Quiet Labels Rule.** Use sentence case and modest weight for navigation and section labels. Keep long reading content at regular weight.

## Layout

The full-height shell has a collapsible navigation rail (260px) and a flexible main region with a fixed-height header (64px). Transcript messages are centered at a maximum width of 760px; the welcome surface uses a narrower 576px reading width. The composer wrapper caps at 840px including horizontal padding, aligning its usable width to the transcript on desktop. Transcript padding moves from 20px to 40px horizontally at the medium breakpoint; message spacing uses 20px.

Contextual details use a card-colored trailing panel with an initial width (384px), minimum width (320px), and an available-width cap that preserves a conversation region (320px). The desktop panel supports pointer and keyboard resizing. Below the medium breakpoint (768px), navigation becomes an overlay limited to 260px, and the detail panel overlays the main region up to 384px; it restores trigger focus and traps keyboard focus while open. The small breakpoint (640px) adjusts greeting and shared dialog layout.

Spacing follows the observed 4px base rhythm with half steps for compact controls. Larger gaps group navigation and details; list rows remain compact. Quick Ask hides the rail and welcome suggestions to fit a compact conversation window. Native setup centers a narrow form (460px maximum), adapts at 400px, and preserves room for macOS traffic lights in its titlebar.

## Elevation & Depth

Persistent regions use tonal layering, thin semantic borders, and whitespace. Shared cards and dialogs use a subtle foreground ring (1px at 10% opacity) rather than a lifted card shadow. Floating jump controls, selections, and a secondary composer control retain the shared small/medium shadow vocabulary.

### Shadow Vocabulary

- **Small floating control:** `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`.
- **Medium floating control:** `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`.
- **Surface ring:** `0 0 0 1px color-mix(in oklab, var(--foreground) 10%, transparent)`.

### Named Rules

**The Tonal Depth Rule.** Use surface tone, fine borders, and spacing to separate persistent regions. Reserve soft shadows for floating controls and overlays.

## Shapes

Soft corners distinguish controls from larger surfaces. The shared base radius is 12px; the derived scale is recorded in frontmatter. Buttons and inputs use the base radius; cards, task rows, and dialogs use the next larger radius. The composer uses the largest shared step. Circular icon controls, status dots, filter chips, and attachment chips use fully rounded forms.

User message bubbles retain the same 20px silhouette as the larger rounded forms. Fine borders remain useful for inputs, chips, and region boundaries; they are part of this world, not a device to prohibit.

## Components

### Buttons

Compact, neutral, and quietly responsive. The shared default is 32px high with 10px horizontal padding, 14px medium text, and 12px corners. Size variants cover 24px, 28px, and 36px controls; signature navigation and suggestions increase row height for scanning.

Primary uses the primary pair; outline uses background and a semantic border; secondary uses the secondary pair. Ghost starts transparent and gains a muted hover wash. Destructive uses a translucent destructive fill and destructive text. Link remains transparent with an underline on hover. Focus adds a ring-colored border and a 3px half-opacity ring; disabled controls reduce opacity and stop interaction. Ordinary pressed buttons shift down 1px; popup triggers are exempt.

### Chips

Task filters use a full pill, a border-colored stroke, a muted wash (40%), and compact text (11.5px). Hover changes to accent. Each clear control names the affected filter. Attachment pills use accent fill and preserve truncation for long content. Retained glyph clear marks are not an icon pattern to inherit.

### Cards / Containers

Shared cards use card/foreground colors, 16px corners, and a fine foreground ring. Default spacing is 16px; compact cards use 12px. Title and content align to that same internal spacing. Native setup remains a flat form rather than a stack of cards.

### Inputs / Fields

Shared text inputs have a 32px height, 12px corners, input-colored stroke, and 4px by 10px padding. Text is 16px below the medium breakpoint and 14px above it. Dark mode adds a translucent input fill. Placeholder text uses muted foreground; focus uses the same 3px ring as buttons. Invalid and disabled states remain explicit. Task search uses a card-colored, more rounded treatment; personal-memory search stays within the shared input pattern.

### Navigation

The sidebar uses compact ghost rows with 16px SVG icons, regular sentence-case labels, and muted foreground. Selected conversations and groups use a blue sidebar-accent fill, stronger label weight, and `aria-current`. Detail controls use `aria-pressed`. Settings navigation and advanced conversation rows share the same selection motion. The assistant row is taller (56px), carrying a decorative 36px companion and two lines of identity. Search/new-conversation rows use 40px height; the lower detail controls use 36px. Active and recent sections appear only when populated. Mobile navigation uses the same content in an overlay. Hidden navigation is inert, and closing mobile Settings returns focus to the visible navigation trigger.

### Conversation and contextual detail

Assistant prose sits directly on the canvas; user prose sits in a right-aligned chat-user bubble. The composer is a bordered card-colored rounded surface with growing multiline input, circular accessory controls, and a blue send control. Suggestions are ghost rows with a 44px minimum height and wrapping labels; the larger decorative companion introduces the empty conversation without an animated character loop.

Tasks use hoverable rounded rows with a small status dot, title, relative time, preview, and human-readable status. Advanced task filters live in a disclosure. Personal memory uses divided expandable rows, a medium title, a muted two-line preview, and editing actions revealed on expansion. These are reusable list patterns, not decorative dashboards.

Navigation and tab indicators use one scoped Framer Motion layoutId per group, with a 180ms ease-out slide. Reduced motion renders the indicator immediately without a layout animation. Avatar Studio, knowledge, MCP transport, and terminal tabs reuse the shared Base UI Tabs primitive and preserve keyboard navigation.

Motion communicates interaction and state: panel width uses a 200ms ease-out transition; shared avatar state transitions use 180ms; native progress width uses 400ms ease-out. The original Kith raster is static. The web reduced-motion override reduces animation/transition duration to 0.01ms, limits repetitions, and disables smooth scrolling; native progress disables its transition.

## Do's and Don'ts

### Do:

- **Do** consume the shared semantic CSS variables and generate palette CSS from the TypeScript source.
- **Do** reuse the shared Base UI primitives before adding custom controls.
- **Do** keep state legible through text and accessible names as well as color.
- **Do** preserve the conversation and composer when opening contextual details.
- **Do** respect system appearance, keyboard focus, and reduced motion.
- **Do** use the original companion asset with empty alternative text when adjacent text names the assistant.

### Don't:

- **Don't** spread blue onto ordinary surfaces or inactive controls.
- **Don't** turn secondary details into permanent explanatory chrome.
- **Don't** replace semantic colors with fixed light-theme or dark-theme colors.
- **Don't** reproduce proprietary reference artwork or branding.
- **Don't** carry forward legacy glyph icons, uppercase eyebrow treatments, or fixed-white labels as new system patterns.

Not canonized: retained system display treatment, uppercase setup eyebrow/field labels, glyph-based status/clear marks, and fixed-white legacy text are observed implementation exceptions or craft defects, not reusable rules. The user's system-type preference is recorded for ordinary text; it does not create a new display-family standard.
