import * as z from "zod";

export const ConversationSuggestionSchema = z.object({
  title: z.string().trim().min(1).max(80),
  prompt: z.string().trim().min(1).max(500),
});

export const ConversationSuggestionsSchema = z.array(ConversationSuggestionSchema).max(3);
export type ConversationSuggestion = z.infer<typeof ConversationSuggestionSchema>;
