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
