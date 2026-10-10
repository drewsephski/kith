import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/server";
import type { JobPublisher } from "@rakazo/adapter-kit";
import { runContinueJob } from "@rakazo/adapter-kit";
import type { Actor } from "@rakazo/contracts";
import {
  connectedAppServices,
  FOR_YOU_SUGGESTIONS,
  forYouPrompt,
  PERSONAL_ASSISTANT_GUIDANCE,
} from "@rakazo/core";
import type { ForYouRecommendations } from "@rakazo/adapters";
import type { PrismaClient } from "@rakazo/db";
import { createRepos } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { personalAssistantBotId } from "./personal-assistant.js";

export async function launchForYou(
  deps: { prisma: PrismaClient; jobs: JobPublisher; forYouRecommendations?: ForYouRecommendations },
  actor: Actor,
  input: {
    userId: string;
    spaceId: string;
    assistantId: string;
    suggestionId: string;
    operationId: string;
  },
) {
  // Validate the captured scope, not just the current request header: account/space
  // changes while a client awaits bootstrap must never launch in the new scope.
  if (input.userId !== actor.userId || input.spaceId !== actor.spaceId)
    throw new ORPCError("CONFLICT", {
      message: "The selected account or space changed. Try again.",
    });
  let recommendation: Awaited<ReturnType<ForYouRecommendations["launch"]>> | undefined;
  if (input.suggestionId.startsWith("recommendation:")) {
    if (!deps.forYouRecommendations) throw new ORPCError("NOT_IMPLEMENTED");
    try { recommendation = await deps.forYouRecommendations.launch(actor, input.assistantId, input.suggestionId); }
    catch { throw new ORPCError("CONFLICT", { message: "The source changed or is unavailable. Refresh For you." }); }
  }
  const suggestion = recommendation ? { id: input.suggestionId, title: recommendation.title, prompt: recommendation.prompt } : FOR_YOU_SUGGESTIONS.find((entry) => entry.id === input.suggestionId);
  if (!suggestion) throw new ORPCError("BAD_REQUEST", { message: "Unknown suggestion." });
  const operationId = recommendation?.operationId ?? input.operationId;
  if ((await personalAssistantBotId(deps.prisma, actor)) !== input.assistantId)
    throw new ORPCError("CONFLICT", { message: "Your assistant changed. Try again." });
  const identity = createHash("sha256")
    .update(JSON.stringify([actor.userId, operationId]))
    .digest("hex");
  const spawnKey = `for-you:${identity}`;
  const existing = await deps.prisma.bot.findUnique({
    where: { spaceId_spawnKey: { spaceId: actor.spaceId, spawnKey } },
    select: { userId: true, parentBotId: true, archivedAt: true },
  });
  if (
    existing &&
    (existing.userId !== actor.userId ||
      existing.parentBotId !== input.assistantId ||
      existing.archivedAt)
  )
    throw new ORPCError("CONFLICT", { message: "This launch is no longer available." });
  const servicesNeeded = "services" in suggestion ? suggestion.services : undefined;
  const connections =
    servicesNeeded && !existing
      ? await deps.prisma.connection.findMany({
          where: { spaceId: actor.spaceId, userId: actor.userId, status: "connected" },
        })
      : [];
  const services = connectedAppServices(
    connections.map((row) => ({
      id: row.id,
      connectorId: row.connectorId,
      provider: row.provider,
      displayName: row.displayName,
      status: "connected" as const,
      capabilities: [],
      createdAt: row.createdAt.toISOString(),
    })),
    [],
  );
  const bot = await createRepos(deps.prisma).createBot(actor, {
    name: suggestion.title,
    title: "",
    description: "",
    instructions: PERSONAL_ASSISTANT_GUIDANCE,
    notifyOnFinish: true,
    parentBotId: input.assistantId,
    spawnKey,
    rejectArchivedSpawnKey: true,
    initialTask: {
      prompt: forYouPrompt(suggestion, services),
      clientNonce: spawnKey,
      launchIdentity: {
        suggestionId: input.suggestionId,
        assistantId: input.assistantId,
        operationId,
      },
    },
  });
  // The existing reconciler also wakes queued runs if the publisher is unavailable.
  // Retrying a lost response finds the same bot/run and never inserts another task.
  const run = await deps.prisma.run.findUnique({
    where: { spaceId_clientNonce: { spaceId: actor.spaceId, clientNonce: spawnKey } },
    select: { id: true, status: true, botId: true },
  });
  if (!run || run.botId !== bot.id)
    throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "The launch could not be recovered." });
  const event = await deps.prisma.event.findFirst({
    where: { runId: run.id, botId: bot.id, threadId: bot.threadId, type: "thread.message.created" },
    select: { payload: true },
  });
  const payload = event?.payload as
    | { forYouLaunch?: { suggestionId?: string; assistantId?: string; operationId?: string } }
    | undefined;
  const identityRecord = payload?.forYouLaunch;
  if (
    bot.parentBotId !== input.assistantId ||
    bot.archivedAt ||
    identityRecord?.suggestionId !== input.suggestionId ||
    identityRecord.assistantId !== input.assistantId ||
    identityRecord.operationId !== operationId
  )
    throw new ORPCError("CONFLICT", { message: "This launch is no longer available." });
  if (run.status === "queued")
    await deps.jobs.enqueue(runContinueJob(run.id)).catch((error) => {
      getLogger().error("For you launch enqueue", error);
    });
  if (recommendation) await deps.forYouRecommendations?.launched(actor, recommendation.id, bot.id);
  return bot;
}
