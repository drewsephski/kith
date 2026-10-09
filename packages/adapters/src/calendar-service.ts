import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  AdapterContext,
  CalendarProvider,
  CalendarTokens,
  JobPublisher,
  MemoryStore,
  SecretStore,
} from "@rakazo/adapter-kit";
import { CalendarAccessError, runContinueJob } from "@rakazo/adapter-kit";
import type { Actor, CalendarOAuthConfig } from "@rakazo/contracts";
import {
  CalendarOAuthConfigSchema,
  CalendarReceiptSchema,
  CalendarSnapshotSchema,
  CalendarSuggestionsSchema,
} from "@rakazo/contracts";
import { CALENDAR_PREFERENCES_PATH } from "@rakazo/core";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import {
  appendEventInTransaction,
  createThreadMessageInTransaction,
  IsolationError,
} from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { z } from "zod";
import { persistPreparedSecret } from "./secret-persistence.js";

export const CALENDAR_CONNECTOR_ID = "calendar-google";
const TokenSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number(),
});
const PendingSchema = z.object({
  verifier: z.string(),
  redirectUri: z.string(),
  config: CalendarOAuthConfigSchema,
});
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const contextFor = (
  actor: Pick<Actor, "userId" | "spaceId">,
  operationId: string,
): AdapterContext => ({
  spaceId: actor.spaceId,
  userId: actor.userId,
  operationId,
  traceId: operationId,
  signal: AbortSignal.timeout(120_000),
});

export class CalendarService {
  constructor(
    readonly deps: {
      prisma: PrismaClient;
      secrets: SecretStore;
      provider: CalendarProvider;
      jobs: JobPublisher;
      events: ThreadEvents;
      memory: MemoryStore;
      redirectUri: string;
    },
  ) {}

  async config(): Promise<CalendarOAuthConfig | null> {
    const row = await this.deps.prisma.integrationProviderConfig.findUnique({
      where: { id: CALENDAR_CONNECTOR_ID },
    });
    return row
      ? CalendarOAuthConfigSchema.parse(
          JSON.parse(
            await this.deps.secrets.load(
              row.ciphertext,
              `integration-provider:${CALENDAR_CONNECTOR_ID}`,
            ),
          ),
        )
      : null;
  }
  async configure(input: CalendarOAuthConfig, actor: Actor) {
    if (!actor.isDeploymentOwner) throw new IsolationError();
    const config = CalendarOAuthConfigSchema.parse(input);
    const recordId = `integration-provider:${CALENDAR_CONNECTOR_ID}`;
    const stored = await this.deps.secrets.put(
      JSON.stringify(config),
      contextFor(actor, "calendar.configure"),
      { recordId },
    );
    await persistPreparedSecret(
      this.deps.prisma,
      this.deps.secrets,
      { id: recordId, ciphertext: stored.ciphertext },
      () =>
        this.deps.prisma.integrationProviderConfig.upsert({
          where: { id: CALENDAR_CONNECTOR_ID },
          create: { id: CALENDAR_CONNECTOR_ID, ciphertext: stored.ciphertext },
          update: { ciphertext: stored.ciphertext },
        }),
    );
  }
  async status(actor: Actor) {
    const row = await this.deps.prisma.connection.findFirst({
      where: { userId: actor.userId, spaceId: actor.spaceId, connectorId: CALENDAR_CONNECTOR_ID },
      orderBy: { createdAt: "desc" },
    });
    if (row?.status === "pending") {
      const authorization = await this.deps.prisma.calendarAuthorization.findUnique({
        where: { connectionId: row.id },
      });
      if (!authorization || authorization.expiresAt <= new Date()) {
        await this.deps.prisma.connection.updateMany({
          where: { id: row.id, status: "pending", updatedAt: row.updatedAt },
          data: { status: "error" },
        });
        if (authorization && authorization.expiresAt <= new Date()) {
          await this.deps.prisma.secret.deleteMany({
            where: { id: authorization.secretId, userId: actor.userId, spaceId: actor.spaceId },
          });
        }
        row.status = "error";
      }
    }
    return {
      configured: Boolean(
        await this.deps.prisma.integrationProviderConfig.findUnique({
          where: { id: CALENDAR_CONNECTOR_ID },
          select: { id: true },
        }),
      ),
      canConfigure: actor.isDeploymentOwner,
      redirectUri: this.deps.redirectUri,
      connectionId: row?.id ?? null,
      status: (row && ["revoking", "revocation_failed"].includes(row.status)
        ? "error"
        : row && ["pending", "connected", "error"].includes(row.status)
          ? row.status
          : "disconnected") as "pending" | "connected" | "error" | "disconnected",
    };
  }
  async begin(actor: Actor, input: { botId: string; timezone: string }) {
    const config = await this.config();
    if (!config) throw new Error("Set up Google Calendar in connection settings first");
    const bot = await this.deps.prisma.bot.findFirst({
      where: { id: input.botId, spaceId: actor.spaceId, userId: actor.userId, archivedAt: null },
      include: { thread: true },
    });
    if (!bot?.thread || bot.thread.userId !== actor.userId) throw new IsolationError();
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const secretId = randomUUID();
    const pending = { verifier, config, redirectUri: this.deps.redirectUri };
    const stored = await this.deps.secrets.put(
      JSON.stringify(pending),
      contextFor(actor, "calendar.begin"),
      { recordId: secretId },
    );
    await persistPreparedSecret(
      this.deps.prisma,
      this.deps.secrets,
      { id: secretId, ciphertext: stored.ciphertext },
      () =>
        this.deps.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CALENDAR_CONNECTOR_ID}), hashtext(${`${actor.spaceId}:${actor.userId}`}))`;
          if (
            await tx.connection.count({
              where: {
                userId: actor.userId,
                spaceId: actor.spaceId,
                connectorId: CALENDAR_CONNECTOR_ID,
                status: { in: ["revoking", "revocation_failed"] },
              },
            })
          )
            throw new Error("Finish disconnecting Calendar before connecting again");
          const previous = await tx.connection.findFirst({
            where: {
              userId: actor.userId,
              spaceId: actor.spaceId,
              connectorId: CALENDAR_CONNECTOR_ID,
            },
            orderBy: { createdAt: "desc" },
          });
          // Each reconnect gets a distinct generation; a stale callback cannot overwrite it.
          if (previous) {
            await tx.connection.update({ where: { id: previous.id }, data: { status: "revoked" } });
            const old = await tx.calendarAuthorization.findUnique({
              where: { connectionId: previous.id },
            });
            if (old) {
              await tx.calendarAuthorization.delete({ where: { connectionId: previous.id } });
              await tx.secret.deleteMany({ where: { id: old.secretId } });
            }
          }
          await tx.secret.create({
            data: {
              id: secretId,
              userId: actor.userId,
              spaceId: actor.spaceId,
              kind: "calendar-oauth-pending",
              ciphertext: stored.ciphertext,
            },
          });
          const connection = await tx.connection.create({
            data: {
              userId: actor.userId,
              spaceId: actor.spaceId,
              connectorId: CALENDAR_CONNECTOR_ID,
              provider: "google-calendar",
              displayName: "Google Calendar",
              status: "pending",
            },
          });
          await tx.calendarAuthorization.create({
            data: {
              connectionId: connection.id,
              stateHash: hash(state),
              secretId,
              botId: bot.id,
              timezone: input.timezone,
              expiresAt: new Date(Date.now() + 10 * 60_000),
            },
          });
        }),
    );
    return {
      authorizationUrl: this.deps.provider.authorizationUrl(config, {
        redirectUri: this.deps.redirectUri,
        state,
        challenge: createHash("sha256").update(verifier).digest("base64url"),
      }),
    };
  }

  /** Unauthenticated callback is authorized solely by bounded, one-use random state + PKCE. */
  async callback(input: { state: string; code?: string; denied?: boolean }) {
    const authorization = await this.deps.prisma.calendarAuthorization.findUnique({
      where: { stateHash: hash(input.state) },
      include: { connection: true },
    });
    if (
      !authorization ||
      authorization.consumedAt ||
      authorization.expiresAt <= new Date() ||
      authorization.connection.status !== "pending"
    )
      throw new Error("Calendar authorization expired; connect again");
    const actor = authorization.connection;
    const context = contextFor(actor, "calendar.callback");
    const claimed = await this.deps.prisma.calendarAuthorization.updateMany({
      where: {
        connectionId: authorization.connectionId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (!claimed.count) throw new Error("Calendar authorization already used");
    let tokens: CalendarTokens | undefined;
    let exchangedConfig: CalendarOAuthConfig | undefined;
    try {
      if (input.denied || !input.code) throw new Error("Calendar authorization cancelled");
      const secret = await this.deps.prisma.secret.findFirst({
        where: { id: authorization.secretId, spaceId: actor.spaceId, userId: actor.userId },
      });
      if (!secret) throw new IsolationError();
      const pending = PendingSchema.parse(
        JSON.parse(await this.deps.secrets.load(secret.ciphertext, secret.id)),
      );
      exchangedConfig = pending.config;
      tokens = await this.deps.provider.exchange(
        pending.config,
        { code: input.code, verifier: pending.verifier, redirectUri: pending.redirectUri },
        context,
      );
      // Verify both granted permissions before persisting a connected account.
      await this.deps.provider.sources(tokens, context);
      const tokenId = randomUUID();
      const stored = await this.deps.secrets.put(
        JSON.stringify({ tokens, config: pending.config }),
        context,
        { recordId: tokenId },
      );
      const generation = randomUUID();
      const committed = await persistPreparedSecret(
        this.deps.prisma,
        this.deps.secrets,
        { id: tokenId, ciphertext: stored.ciphertext },
        () =>
          this.deps.prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CALENDAR_CONNECTOR_ID}), hashtext(${`${actor.spaceId}:${actor.userId}`}))`;
            await tx.$queryRaw`SELECT id FROM connections WHERE id = ${actor.id} FOR UPDATE`;
            const current = await tx.connection.findFirst({
              where: {
                id: actor.id,
                spaceId: actor.spaceId,
                userId: actor.userId,
                status: "pending",
              },
            });
            const bot = await tx.bot.findFirst({
              where: {
                id: authorization.botId,
                spaceId: actor.spaceId,
                userId: actor.userId,
                archivedAt: null,
              },
              include: { thread: true },
            });
            if (!current || !bot?.thread || bot.thread.userId !== actor.userId)
              throw new IsolationError();
            await tx.secret.create({
              data: {
                id: tokenId,
                spaceId: actor.spaceId,
                userId: actor.userId,
                kind: "calendar-oauth",
                ciphertext: stored.ciphertext,
              },
            });
            await tx.connection.update({
              where: { id: actor.id },
              data: { status: "connected", secretId: tokenId, metadata: { generation } },
            });
            const task = await tx.task.create({
              data: {
                spaceId: actor.spaceId,
                userId: actor.userId,
                botId: bot.id,
                threadId: bot.thread.id,
                prompt: "Prepare tomorrow's calendar briefing",
                status: "queued",
              },
            });
            const run = await tx.run.create({
              data: {
                spaceId: actor.spaceId,
                userId: actor.userId,
                botId: bot.id,
                threadId: bot.thread.id,
                taskId: task.id,
                trigger: "calendar",
                status: "queued",
                clientNonce: `calendar:${actor.id}:${generation}`,
              },
            });
            const receipt = await tx.calendarBriefing.create({
              data: {
                runId: run.id,
                connectionId: actor.id,
                generation,
                timezone: authorization.timezone,
              },
            });
            const message = await createThreadMessageInTransaction(tx, {
              threadId: run.threadId,
              botId: bot.id,
              runId: run.id,
              role: "bot",
              blocks: [{ kind: "calendar_receipt", receiptId: receipt.id }],
            });
            await appendEventInTransaction(tx, {
              spaceId: actor.spaceId,
              threadId: run.threadId,
              botId: bot.id,
              runId: run.id,
              type: "thread.message.created",
              payload: { messageId: message.id, role: "bot", blocks: message.blocks },
            });
            await tx.secret.deleteMany({ where: { id: authorization.secretId } });
            const event = await appendEventInTransaction(tx, {
              spaceId: actor.spaceId,
              threadId: bot.thread.id,
              botId: bot.id,
              runId: run.id,
              type: "thread.progress",
              payload: { text: "Preparing tomorrow's calendar briefing…", receiptId: receipt.id },
            });
            return { run, event };
          }),
      );
      // Durable run repairs a missed wake; delivery failure cannot invalidate OAuth.
      await this.deps.jobs
        .enqueue(runContinueJob(committed.run.id))
        .catch((error) => getLogger().error("calendar briefing enqueue", error));
      await this.deps.events
        .notify(committed.run.threadId, committed.event.seq)
        .catch((error) => getLogger().error("calendar briefing notify", error));
      tokens = undefined;
    } catch (error) {
      if (tokens && exchangedConfig) {
        // Revocation is grant-wide. Only explicit disconnect revokes remotely;
        // otherwise a concurrent reconnect could lose its new grant.
        const id = randomUUID();
        const stored = await this.deps.secrets.put(
          JSON.stringify({ tokens, config: exchangedConfig }),
          context,
          { recordId: id },
        );
        await persistPreparedSecret(
          this.deps.prisma,
          this.deps.secrets,
          { id, ciphertext: stored.ciphertext },
          () =>
            this.deps.prisma.$transaction(async (tx) => {
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CALENDAR_CONNECTOR_ID}), hashtext(${`${actor.spaceId}:${actor.userId}`}))`;
              await tx.secret.create({
                data: {
                  id,
                  userId: actor.userId,
                  spaceId: actor.spaceId,
                  kind: "calendar-oauth",
                  ciphertext: stored.ciphertext,
                },
              });
              await tx.connection.update({
                where: { id: actor.id },
                data: { secretId: id },
              });
            }),
        );
      }
      await this.deps.prisma.connection.updateMany({
        where: { id: actor.id, status: "pending" },
        data: { status: "error" },
      });
      throw error;
    } finally {
      await this.deps.prisma.secret
        .deleteMany({ where: { id: authorization.secretId } })
        .catch(() => getLogger().warn("Calendar verifier cleanup failed"));
    }
  }

  async credentials(
    connectionId: string,
    actor: Pick<Actor, "spaceId" | "userId">,
    context: AdapterContext,
  ) {
    const row = await this.deps.prisma.connection.findFirst({
      where: {
        id: connectionId,
        ...actor,
        connectorId: CALENDAR_CONNECTOR_ID,
        status: "connected",
      },
    });
    if (!row?.secretId) throw new CalendarAccessError();
    const secret = await this.deps.prisma.secret.findFirst({
      where: { id: row.secretId, ...actor },
    });
    if (!secret) throw new CalendarAccessError();
    const parsed = z
      .object({ tokens: TokenSchema, config: CalendarOAuthConfigSchema })
      .parse(JSON.parse(await this.deps.secrets.load(secret.ciphertext, secret.id)));
    if (parsed.tokens.expiresAt > Date.now() + 60_000) return parsed.tokens;
    const tokens = await this.deps.provider.refresh(parsed.config, parsed.tokens, context);
    const stored = await this.deps.secrets.put(JSON.stringify({ ...parsed, tokens }), context, {
      recordId: secret.id,
    });
    await persistPreparedSecret(
      this.deps.prisma,
      this.deps.secrets,
      { id: secret.id, ciphertext: stored.ciphertext },
      () =>
        this.deps.prisma.secret.updateMany({
          where: { id: secret.id, ciphertext: secret.ciphertext },
          data: { ciphertext: stored.ciphertext },
        }),
    );
    return tokens;
  }

  async disconnect(actor: Actor) {
    const rows = await this.deps.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CALENDAR_CONNECTOR_ID}), hashtext(${`${actor.spaceId}:${actor.userId}`}))`;
      const where = {
        spaceId: actor.spaceId,
        userId: actor.userId,
        connectorId: CALENDAR_CONNECTOR_ID,
      };
      const current = await tx.connection.findMany({ where });
      if (
        current.some(
          (row) => row.status === "revoking" && row.updatedAt.getTime() > Date.now() - 5 * 60_000,
        )
      )
        throw new Error("Calendar disconnect is already in progress");
      // Persist the barrier before remote grant revocation; reconnect must wait
      // until cleanup is confirmed, including after a crash or provider failure.
      await tx.connection.updateMany({ where, data: { status: "revoking" } });
      return current;
    });
    try {
      for (const row of rows) {
        if (row.secretId) {
          const secret = await this.deps.prisma.secret.findFirst({
            where: { id: row.secretId, spaceId: actor.spaceId, userId: actor.userId },
          });
          if (secret) {
            const parsed = z
              .object({ tokens: TokenSchema })
              .parse(JSON.parse(await this.deps.secrets.load(secret.ciphertext, secret.id)));
            await this.deps.provider.revoke(
              parsed.tokens,
              contextFor(actor, "calendar.disconnect"),
            );
            await this.deps.prisma.secret.deleteMany({ where: { id: secret.id } });
          }
        }
        const pending = await this.deps.prisma.calendarAuthorization.findUnique({
          where: { connectionId: row.id },
        });
        if (pending) await this.deps.prisma.secret.deleteMany({ where: { id: pending.secretId } });
        await this.deps.prisma.calendarAuthorization.deleteMany({
          where: { connectionId: row.id },
        });
      }
      await this.deps.prisma.connection.updateMany({
        where: { id: { in: rows.map((row) => row.id) }, status: "revoking" },
        data: { status: "revoked" },
      });
    } catch (error) {
      await this.deps.prisma.connection.updateMany({
        where: { id: { in: rows.map((row) => row.id) }, status: "revoking" },
        data: { status: "revocation_failed" },
      });
      throw error;
    }
  }

  async receipt(actor: Actor, id: string) {
    const row = await this.deps.prisma.calendarBriefing.findFirst({
      where: { id, run: { spaceId: actor.spaceId, userId: actor.userId } },
      include: { run: { include: { attempts: true } } },
    });
    if (!row) throw new IsolationError();
    const run = row.run;
    return CalendarReceiptSchema.parse({
      id: row.id,
      runId: run.id,
      status: run.status,
      timezone: row.timezone,
      createdAt: row.createdAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
      attempts: run.attempts.length,
      error: run.error,
      snapshot: row.snapshot ? CalendarSnapshotSchema.parse(row.snapshot) : null,
      outcome: run.status === "completed" ? row.outcome : null,
      suggestions: CalendarSuggestionsSchema.parse(row.suggestions),
      suggestionStatus: row.suggestionStatus,
      memorySources: row.memorySources,
    });
  }
  async retry(actor: Actor, receiptId: string) {
    const result = await this.deps.prisma.$transaction(async (tx) => {
      const receipt = await tx.calendarBriefing.findFirst({
        where: { id: receiptId, run: { userId: actor.userId, spaceId: actor.spaceId } },
        include: { run: true, connection: true },
      });
      if (receipt?.connection?.status !== "connected") throw new IsolationError();
      const updated = await tx.run.updateMany({
        where: { id: receipt.runId, status: "failed" },
        data: {
          status: "queued",
          error: null,
          completedAt: null,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      if (updated.count) {
        await tx.calendarBriefing.update({
          where: { id: receipt.id },
          data: { attemptBase: receipt.run.leaseFence },
        });
        await tx.task.update({ where: { id: receipt.run.taskId }, data: { status: "queued" } });
      }
      return updated.count ? receipt.runId : null;
    });
    if (result)
      await this.deps.jobs
        .enqueue(runContinueJob(result))
        .catch((error) => getLogger().error("calendar retry enqueue", error));
  }
  async preferences(
    actor: Actor,
    input: { botId: string; content: string; expectedRevision: number },
  ) {
    const bot = await this.deps.prisma.bot.findFirst({
      where: { id: input.botId, spaceId: actor.spaceId, userId: actor.userId },
      include: { thread: true },
    });
    if (!bot?.thread) throw new IsolationError();
    await this.deps.memory.commit(
      {
        scope: "user",
        path: CALENDAR_PREFERENCES_PATH,
        content: input.content,
        expectedRevision: input.expectedRevision,
        sourceThreadId: bot.thread.id,
      },
      contextFor(actor, "calendar.preferences"),
    );
  }
}
