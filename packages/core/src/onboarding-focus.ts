/** Stable IDs preserve persisted onboarding answers from earlier versions. */
export const ASSISTANT_FOCUS_QUESTION = "What should I help you with first?";
export const LEGACY_FOCUS_QUESTION = "What do you want me on first?";
export const ASSISTANT_FOCUS_OPTIONS = [
  { id: "day", letter: "A", label: "Organize my day" },
  { id: "inbox", letter: "B", label: "Email and follow-ups" },
  { id: "research", letter: "C", label: "Research and projects" },
  { id: "everything", letter: "D", label: "Just start chatting" },
] as const;
export type AssistantFocus = (typeof ASSISTANT_FOCUS_OPTIONS)[number]["id"];
export function isAssistantFocusQuestion(question: string): boolean {
  return question === ASSISTANT_FOCUS_QUESTION || question === LEGACY_FOCUS_QUESTION;
}

export const BOT_IDENTITY_QUESTION = "What should my name be, and what's my role?";
export const BOT_IDENTITY_PRESETS = [
  {
    id: "miso",
    name: "Miso",
    role: "Inbox assistant",
    description: "Helps organize email and prepare follow-ups.",
    instructions:
      "Help organize the user's inbox and prepare clear follow-ups. Respect existing connection and approval requirements.",
  },
  {
    id: "pippin",
    name: "Pippin",
    role: "Research assistant",
    description: "Helps research questions and organize useful findings.",
    instructions:
      "Help research the user's questions, compare sources, and organize useful findings. Clearly distinguish evidence from uncertainty.",
  },
  {
    id: "orbit",
    name: "Orbit",
    role: "Planning assistant",
    description: "Helps plan days and projects with practical next steps.",
    instructions:
      "Help plan the user's days and projects with practical next steps. Ask about priorities when they are unclear.",
  },
  {
    id: "pixel",
    name: "Pixel",
    role: "Coding partner",
    description: "Helps understand code, solve problems, and review changes.",
    instructions:
      "Help understand code, solve programming problems, and review changes. Verify results and respect existing permissions and approvals.",
  },
] as const;
