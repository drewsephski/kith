import { randomUUID } from "node:crypto";
import type {
  AdapterContext,
  AgentRunModel,
  AgentRunRequest,
  ModelCallObserver,
} from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { ExecutionQuotaError, executionLimit, hasBillingAccess, Prisma } from "@rakazo/db";
import type { ModelExecutionMode } from "./deployment-model.js";
import {
  deploymentFundsModel,
  modelExecutionMode,
  resolveDeploymentModel,
} from "./deployment-model.js";
import { modelRequestSizes } from "./model-request-size.js";

/** The cap includes reasoning tokens and is forwarded through the model's hard completion ceiling. */
export function managedCompletionTokens(
  model: AgentRunModel,
  mode: ModelExecutionMode = modelExecutionMode(),
): number | undefined {
  if (mode !== "managed" || model.fundingSource !== "deployment") return model.maxTokens;
  const cap = executionLimit("MAX_HOSTED_MODEL_OUTPUT_TOKENS", 4096, {
    ...process.env,
    MODEL_EXECUTION_MODE: mode,
  });
  return Math.min(model.maxTokens ?? cap, cap);
}

export function createModelCallQuotaObserver(
  prisma: PrismaClient,
  request: AgentRunRequest,
  context?: Partial<AdapterContext>,
  options: { billingRequired?: boolean; mode?: ModelExecutionMode } = {},
): ModelCallObserver | undefined {
  const mode = options.mode ?? modelExecutionMode();
  if (mode !== "managed") return undefined;
  const env = { ...process.env, MODEL_EXECUTION_MODE: mode };
  const userId = context?.userId;
  const spaceId = context?.spaceId;
  if (!userId || !spaceId) throw new Error("Authenticated model execution scope is required");
  const daily = executionLimit("MAX_HOSTED_MODEL_CALLS_PER_USER_PER_DAY", 200, env);
  const perRun = executionLimit("MAX_HOSTED_MODEL_CALLS_PER_RUN", 40, env);
  const concurrent = executionLimit("MAX_CONCURRENT_HOSTED_MODEL_CALLS_PER_USER", 4, env);
  const requestBytes = executionLimit("MAX_HOSTED_MODEL_REQUEST_BYTES", 8 * 1024 * 1024, env);
  const textRequestBytes = executionLimit("MAX_HOSTED_MODEL_TEXT_REQUEST_BYTES", 131072, env);
  const outputTokens = executionLimit("MAX_HOSTED_MODEL_OUTPUT_TOKENS", 4096, env);
  const billingRequired =
    options.billingRequired ??
    Boolean(
      process.env.STRIPE_SECRET_KEY &&
        process.env.STRIPE_WEBHOOK_SECRET &&
        process.env.STRIPE_PRICE_ID,
    );
  const assertRequestSize = (size: { requestBytes?: number; textRequestBytes?: number }) => {
    if (
      !Number.isSafeInteger(size.requestBytes) ||
      size.requestBytes! > requestBytes ||
      !Number.isSafeInteger(size.textRequestBytes) ||
      size.textRequestBytes! > textRequestBytes
    )
      throw new ExecutionQuotaError(
        "This request exceeds the hosted model limit. Start a new conversation or send a smaller message.",
      );
  };
  return {
    timeoutMs: 5 * 60_000,
    validatePayload(payload) {
      assertRequestSize(modelRequestSizes(payload));
      if (payload && typeof payload === "object") {
        const body = payload as Record<string, unknown>;
        for (const key of ["max_tokens", "max_completion_tokens", "max_output_tokens"]) {
          const value = body[key];
          if (value !== undefined && (!Number.isSafeInteger(value) || Number(value) > outputTokens))
            throw new ExecutionQuotaError("This model request exceeds the hosted output limit.");
        }
      }
    },
    async beforeCall(call) {
      if (call.fundingSource === "user" || call.provider === "local") return "user-funded";
      if (
        call.fundingSource !== "deployment" ||
        !deploymentFundsModel(call.provider, call.modelId, resolveDeploymentModel(), mode)
      )
        throw new Error("Model funding authorization is missing. Reconnect the model provider.");
      assertRequestSize(call);
      if (!Number.isSafeInteger(call.maxOutputTokens) || call.maxOutputTokens > outputTokens)
        throw new ExecutionQuotaError("This model request exceeds the hosted output limit.");
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 4))::text AS lock`;
        const member = await tx.spaceMember.findFirst({
          where: { userId, spaceId },
          select: { space: { select: { organizationId: true } } },
        });
        if (!member) throw new Error("This account no longer has access to the Space");
        if (billingRequired) {
          const [settings, billing] = await Promise.all([
            tx.deploymentSettings.findUnique({
              where: { id: "default" },
              select: { ownerUserId: true },
            }),
            tx.billingAccount.findUnique({
              where: { organizationId: member.space.organizationId },
              select: { status: true },
            }),
          ]);
          if (settings?.ownerUserId !== userId && !hasBillingAccess(billing?.status ?? null))
            throw new Error("Model access is unavailable. Check your subscription in Settings.");
        }
        const [counts] = await tx.$queryRaw<[{ daily: bigint; run: bigint; active: bigint }]>`
          SELECT
            count(*) FILTER (WHERE "createdAt" >= date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS daily,
            count(*) FILTER (WHERE "runId" = ${request.rootRunId ?? request.runId}) AS run,
            count(*) FILTER (WHERE "settledAt" IS NULL AND "expiresAt" > CURRENT_TIMESTAMP) AS active
          FROM "model_call_reservations" WHERE "userId" = ${userId}
        `;
        if (counts.daily >= BigInt(daily))
          throw new ExecutionQuotaError(
            "Daily model limit reached. Try again tomorrow or connect your own model provider.",
          );
        if (counts.run >= BigInt(perRun))
          throw new ExecutionQuotaError(
            "This task reached its model limit. Send another message to continue.",
          );
        if (counts.active >= BigInt(concurrent))
          throw new ExecutionQuotaError(
            "Too many model requests are active. Wait for a task to finish or cancel it, then retry.",
          );
        const id = randomUUID();
        // Longer than the hard provider timeout; an interrupted worker cannot release a live request early.
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "model_call_reservations" (id, "userId", "spaceId", "runId", provider, "modelId", "expiresAt")
          VALUES (${id}, ${userId}, ${spaceId}, ${request.rootRunId ?? request.runId}, ${call.provider}, ${call.modelId}, CURRENT_TIMESTAMP + interval '10 minutes')
        `);
        return id;
      });
    },
    async afterCall(id) {
      if (id === "user-funded") return;
      await prisma.$executeRaw`
        UPDATE "model_call_reservations" SET "settledAt" = CURRENT_TIMESTAMP
        WHERE id = ${id} AND "userId" = ${userId} AND "spaceId" = ${spaceId} AND "settledAt" IS NULL
      `;
    },
  };
}
