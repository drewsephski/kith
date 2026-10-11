type ReadableMessage = {
  id: string;
  role: string;
  readAt?: string;
  callId?: string;
};

/** Only the latest user message carries a receipt, matching a personal conversation. */
export function latestReadMessageId(messages: readonly ReadableMessage[]): string | undefined {
  const latest = messages.findLast((message) => message.role === "user");
  return latest?.readAt && !latest.callId ? latest.id : undefined;
}

/** Apply server evidence to exact messages; a run can contain unread steering too. */
export function applyMessageReadReceipt<T extends ReadableMessage>(
  messages: T[],
  messageIds: unknown,
  readAt: unknown,
): T[] {
  if (
    !Array.isArray(messageIds) ||
    typeof readAt !== "string" ||
    !Number.isFinite(Date.parse(readAt))
  )
    return messages;
  const ids = new Set(messageIds.filter((id): id is string => typeof id === "string"));
  return messages.map((message) =>
    message.role === "user" && !message.readAt && ids.has(message.id)
      ? { ...message, readAt }
      : message,
  );
}
