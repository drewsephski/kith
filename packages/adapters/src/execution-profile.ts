import type { MessageBlock } from "@rakazo/contracts";

/** A narrow optimization, never an authorization or a capability boundary. */
export function executionProfile(input: {
  trigger: string;
  prompt: string;
  resumed: boolean;
  groupId?: string | null;
  blocks?: readonly MessageBlock[];
}): "conversation" | "agent" {
  if (
    input.trigger !== "user" ||
    input.resumed ||
    input.groupId ||
    input.blocks?.some((block) => block.kind !== "text")
  )
    return "agent";
  const prompt = input.prompt.trim();
  if (!prompt || prompt.length > 240 || /[\n\r@]|https?:|\/(?:\w|\.)/i.test(prompt)) return "agent";
  if (/^(?:hi|hello|hey|good (?:morning|afternoon|evening)|thanks|thank you)[!.?]*$/i.test(prompt))
    return "conversation";
  if (/^(?:what is |what's |calculate )?\d+(?:\s*[+*\-÷×/]\s*\d+)+\s*\??$/i.test(prompt))
    return "conversation";
  // Referents, fresh sources, persistent actions and high-stakes subjects stay on the full path.
  if (
    /\b(?:i|me|my|our|your|saved|remember|latest|current|today|email|mail|calendar|connected|file|browser|computer|tool|search|research|send|schedule|save|write|create|delete|update|run|skill|medical|medicine|diagnos\w*|legal|law|invest\w*|financial|tax|health|symptom\w*|pain|treat\w*|dosage|dose\w*|dosing|overdos\w*|tylenol|acetaminophen|ibuprofen|aspirin|drug\w*|medicat\w*|pregnan\w*|court|criminal|bank\w*|money|mortgage|loan\w*|password\w*|credential\w*|secret\w*|vulnerab\w*|exploit\w*|complex|difficult|multi-step|suicide|emergency)\b/i.test(
      prompt,
    )
  )
    return "agent";
  if (
    /^(?:explain|define|what is|what are|what's|how does)\s+[^!?]+[.?]?$/i.test(prompt) ||
    /^(?:can you |please )?(?:explain that|say that|make that|make it) (?:more )?(?:briefly|shorter|simpler|clearer)[.?]?$/i.test(
      prompt,
    )
  )
    return "conversation";
  return "agent";
}
