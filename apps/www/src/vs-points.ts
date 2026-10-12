export type VsPoints = {
  kith: readonly string[];
  other: readonly string[];
};

/**
 * Short card lines. Each one is a compression of the comparison already on that
 * page, not a new claim.
 */
export const VS_CARDS: Record<string, VsPoints> = {
  "muse-alternative": {
    kith: ["One continuing chat", "Memory you can edit", "Sources and approvals"],
    other: ["Muse app and WhatsApp", "Everyday tasks", "Meta’s connected services"],
  },
  "dots-alternative": {
    kith: ["One continuing chat", "Memory you can edit", "Sources and approvals"],
    other: ["ChatGPT and work chats", "Background project work", "Eligible ChatGPT plans"],
  },
  "grok-bot-alternative": {
    kith: ["One continuing chat", "Memory you can edit", "Sources and approvals"],
    other: ["Named bots and routines", "A cloud computer", "Eligible paid plans"],
  },
  "openclaw-alternative": {
    kith: ["One continuing chat", "Memory you can edit", "Sources and approvals"],
    other: ["Chat in existing apps", "Gateway setup", "Configurable tools"],
  },
  "hermes-alternative": {
    kith: ["One continuing chat", "Memory you can edit", "Sources and approvals"],
    other: ["Desktop or terminal", "Memory and saved skills", "Configurable tools"],
  },
  "instinct-alternative": {
    kith: ["One continuing chat", "Memory you can edit", "Sources and approvals"],
    other: ["Text or call", "Everyday errands", "A hosted assistant"],
  },
  "hark-alternative": {
    kith: ["One continuing chat", "Memory you can edit", "Sources and approvals"],
    other: ["Projects and Panels", "Handoff computer work", "Browser and mobile apps"],
  },
};

export function vsCard(slug: string): VsPoints | undefined {
  return VS_CARDS[slug];
}
