/** The companion animates only for the bound assistant's generating turns. */
export function isAssistantResponding(
  assistantId: string | null | undefined,
  bots: readonly { botId?: string; status?: string }[],
): boolean {
  return Boolean(
    assistantId &&
      bots.some(
        (bot) =>
          bot.botId === assistantId &&
          (bot.status === "queued" || bot.status === "leased" || bot.status === "running"),
      ),
  );
}
