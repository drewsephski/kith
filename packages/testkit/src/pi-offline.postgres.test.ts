import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ComposioEmulator } from "@rakazo/adapters";
import { FOR_YOU_SUGGESTIONS } from "@rakazo/core";
import { beforeAll, describe, expect, it } from "vitest";
import type { createApp } from "../../../apps/api/src/app.ts";
import { discardBotIntroRun } from "./discard-bot-intro.js";
import { sessionCookieHeader } from "./index.js";
import { startModelEmulator } from "./model-emulator.js";

type App = { request: (input: string, init?: RequestInit) => Promise<Response> };
const databaseAvailable = process.env.VERIFY_DATABASE === "1" && Boolean(process.env.DATABASE_URL);
const fixtureOrigin = "http://127.0.0.1:5173";

describe.skipIf(!databaseAvailable)("offline Pi product journey", () => {
  let createProductApp: typeof createApp;
  beforeAll(async () => {
    ({ createApp: createProductApp } = await import("../../../apps/api/src/app.ts"));
  });
  it.each(["directive", "confirmation", "learning"] as const)(
    "verifies memory intent from a human %s answer without repeating prior work",
    async (mode) => {
      const model = await startModelEmulator({
        apiKey: "synthetic-memory-question-key",
        steps: [
          {
            expect: () => {},
            response: {
              type: "tool",
              id: "first-memory",
              name: "remember",
              arguments: { content: "I prefer cobalt." },
            },
          },
          {
            expect: () => {},
            response: {
              type: "tool",
              id: "preference-question",
              name: "ask_user",
              arguments: {
                question:
                  mode === "directive"
                    ? "What else should I remember?"
                    : "Should I remember that you prefer violet?",
                options:
                  mode === "directive"
                    ? ["Remember that I prefer violet.", "Keep cobalt."]
                    : ["Yes", "No"],
              },
            },
          },
          { expect: () => {}, response: { type: "text", text: "Remembered violet." } },
          {
            expect: () => {},
            response: {
              type: "tool",
              id: "second-memory",
              name: "remember",
              arguments: { content: "I prefer violet." },
            },
          },
          { expect: () => {}, response: { type: "text", text: "Saved violet." } },
        ].filter(
          (step) =>
            mode !== "learning" ||
            !(step.response.type === "tool" && step.response.id === "first-memory"),
        ),
      });
      const dataDir = await mkdtemp(path.join(tmpdir(), "kith-memory-answer-"));
      let handles: Awaited<ReturnType<typeof createApp>> | undefined;
      try {
        handles = await createProductApp({
          databaseUrl: process.env.DATABASE_URL!,
          realtimeDatabaseUrl: process.env.DATABASE_URL!,
          dataDir,
          authUrl: fixtureOrigin,
          webOrigin: fixtureOrigin,
          sandboxProvider: "fake",
          agentRuntime: "pi",
          wakeupDriver: "memory",
          signupsEnabled: "true",
          deploymentModelConfigured: false,
          encryptionKey: "synthetic-memory-answer-key-32chars",
        });
        const signup = await handles.app.request("/api/auth/sign-up/email", {
          method: "POST",
          headers: { "content-type": "application/json", origin: fixtureOrigin },
          body: JSON.stringify({
            email: `memory-answer-${randomUUID()}@example.test`,
            password: "synthetic-password-12",
            name: "Memory fixture",
          }),
        });
        expect(signup.ok).toBe(true);
        const cookie = sessionCookieHeader(signup);
        await rpc(handles.app, cookie, "models/connect", {
          provider: model.model.provider,
          modelId: model.model.id,
          baseUrl: model.baseUrl,
          apiKey: "synthetic-memory-question-key",
          contextWindow: 160_000,
          maxTokens: 4096,
        });
        const bot = await rpc<{ id: string }>(handles.app, cookie, "bots/create", {
          name: "Memory question",
          notifyOnFinish: false,
          startEmpty: true,
        });
        await discardBotIntroRun(handles, cookie, bot.id);
        await rpc(handles.app, cookie, "bots/update", {
          botId: bot.id,
          modelProvider: model.model.provider,
          modelId: model.model.id,
        });
        const sent = await rpc<{ runId: string }>(handles.app, cookie, "threads/send", {
          botId: bot.id,
          text:
            mode === "learning"
              ? FOR_YOU_SUGGESTIONS.find((suggestion) => suggestion.id === "preferences")!.prompt
              : "Remember that I prefer cobalt, then ask what else to remember.",
        });
        const app = handles;
        await expect
          .poll(
            async () =>
              (await app.prisma.run.findUniqueOrThrow({ where: { id: sent.runId } })).status,
            { timeout: 15_000, interval: 100 },
          )
          .toBe("waiting_input");
        const question = await app.prisma.message.findFirstOrThrow({
          where: { runId: sent.runId, role: "bot" },
          orderBy: { seq: "desc" },
        });
        const ask = (
          question.blocks as Array<{ kind: string; actions?: Array<{ id: string }> }>
        ).find((block) => block.kind === "ask");
        await rpc(app.app, cookie, "threads/answer", {
          botId: bot.id,
          runId: sent.runId,
          messageId: question.id,
          answer: mode === "learning" ? "Yes, please." : ask!.actions![0]!.id,
        });
        await expect
          .poll(
            async () =>
              (await app.prisma.run.findUniqueOrThrow({ where: { id: sent.runId } })).status,
            { timeout: 15_000, interval: 100 },
          )
          .toBe("completed");
        model.assertComplete();
        const documents = await app.prisma.memoryDocument.findMany({ where: { botId: bot.id } });
        expect(documents.some((doc) => doc.content.includes("violet"))).toBe(true);
        const receipts = await app.prisma.externalEffect.findMany({
          where: { runId: sent.runId, kind: "remember", status: "completed" },
        });
        const requestIds = receipts.map((effect) => {
          const requestId = (effect.request as { memoryRequestId: string }).memoryRequestId;
          expect(requestId).toBeTruthy();
          expect((effect.result as { memoryRequestId: string }).memoryRequestId).toBe(requestId);
          return requestId;
        });
        expect(new Set(requestIds).size).toBe(mode === "learning" ? 1 : 2);
        expect(
          await app.prisma.externalEffect.count({
            where: { runId: sent.runId, kind: "remember", status: "completed" },
          }),
        ).toBe(mode === "learning" ? 1 : 2);
      } finally {
        await handles?.stop();
        await model.close();
        await rm(dataDir, { recursive: true, force: true });
      }
    },
    30_000,
  );
  it("preserves partial text and completed work after an interrupted model stream", async () => {
    const fixtureKey = "partial-product-fixture-key";
    const model = await startModelEmulator({
      apiKey: fixtureKey,
      steps: [
        {
          expect: () => {},
          response: {
            type: "tool",
            id: "verified-write",
            name: "write_file",
            arguments: { path: "notes/partial.txt", content: "verified before interruption" },
          },
        },
        {
          expect: (request) => {
            const result = request.messages.findLast((message) => message.role === "tool");
            expect(JSON.parse(String(result?.content))).toMatchObject({ ok: true });
          },
          response: {
            type: "disconnect",
            text: "The file is saved. The remaining analysis is incomplete.",
          },
        },
      ],
    });
    const dataDir = await mkdtemp(path.join(tmpdir(), "rakazo-partial-product-"));
    let handles: Awaited<ReturnType<typeof createApp>> | undefined;
    try {
      handles = await createProductApp({
        databaseUrl: process.env.DATABASE_URL!,
        realtimeDatabaseUrl: process.env.DATABASE_URL!,
        dataDir,
        authUrl: fixtureOrigin,
        webOrigin: fixtureOrigin,
        sandboxProvider: "fake",
        agentRuntime: "pi",
        wakeupDriver: "memory",
        signupsEnabled: "true",
        encryptionKey: "synthetic-partial-encryption-key-32chars",
      });
      const signup = await handles.app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: fixtureOrigin },
        body: JSON.stringify({
          email: `partial-${randomUUID()}@example.test`,
          password: "synthetic-password-12",
          name: "Partial fixture",
        }),
      });
      expect(signup.ok).toBe(true);
      const cookie = sessionCookieHeader(signup);
      const bot = await rpc<{ id: string }>(handles.app, cookie, "bots/create", {
        name: "Partial fixture",
        notifyOnFinish: false,
      });
      await discardBotIntroRun(handles, cookie, bot.id);
      await rpc(handles.app, cookie, "models/connect", {
        provider: model.model.provider,
        modelId: model.model.id,
        baseUrl: model.baseUrl,
        apiKey: fixtureKey,
        contextWindow: 160_000,
        maxTokens: 4096,
      });
      await rpc(handles.app, cookie, "bots/update", {
        botId: bot.id,
        modelProvider: model.model.provider,
        modelId: model.model.id,
      });
      const sent = await rpc<{ runId: string }>(handles.app, cookie, "threads/send", {
        botId: bot.id,
        text: "Save a file, then analyze the result.",
      });
      const active = handles;
      await expect
        .poll(
          async () =>
            (await active.prisma.run.findUniqueOrThrow({ where: { id: sent.runId } })).status,
          { timeout: 15_000 },
        )
        .toBe("failed");
      model.assertComplete();
      const snapshot = await rpc<{
        messages: Array<{ blocks: unknown[] }>;
        run: { status: string };
      }>(handles.app, cookie, "threads/get", { botId: bot.id });
      expect(snapshot.run.status).toBe("failed");
      expect(JSON.stringify(snapshot.messages)).toContain(
        "The file is saved. The remaining analysis is incomplete.",
      );
      expect(
        await rpc(handles.app, cookie, "computer/readFile", {
          botId: bot.id,
          path: "notes/partial.txt",
        }),
      ).toMatchObject({ content: "verified before interruption" });
      expect(
        await handles.prisma.event.count({ where: { runId: sent.runId, type: "thread.progress" } }),
      ).toBe(0);
      const terminal = await handles.prisma.event.findMany({
        where: {
          runId: sent.runId,
          type: { in: ["thread.message.created", "run.failed", "run.completed"] },
        },
        orderBy: { seq: "asc" },
      });
      expect(
        terminal
          .filter(
            (event) =>
              event.type !== "thread.message.created" ||
              (event.payload as { role?: string }).role === "bot",
          )
          .map((event) => event.type),
      ).toEqual(["thread.message.created", "run.failed"]);
      const write = await handles.prisma.externalEffect.findFirstOrThrow({
        where: { runId: sent.runId, kind: "write_file" },
      });
      expect(write.status).toBe("completed");
      expect(JSON.stringify(snapshot.messages)).not.toContain(fixtureKey);
    } finally {
      await handles?.stop();
      await model.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("uses a saved model connection and the real executor to persist a file and completed run", async () => {
    const fixtureKey = "offline-product-fixture-key";
    const model = await startModelEmulator({
      apiKey: fixtureKey,
      steps: [
        {
          expect(request) {
            expect(JSON.stringify(request.messages)).toContain("Save hello to notes/result.txt.");
            expect(request.tools).toContainEqual(
              expect.objectContaining({
                function: expect.objectContaining({ name: "write_file" }),
              }),
            );
          },
          response: {
            type: "tool",
            id: "product-write",
            name: "write_file",
            arguments: { path: "notes/result.txt", content: "hello" },
          },
        },
        {
          expect(request) {
            const result = request.messages.findLast((message) => message.role === "tool");
            expect(result?.tool_call_id).toBe("product-write");
            expect(JSON.parse(String(result?.content))).toMatchObject({
              ok: true,
              path: "notes/result.txt",
            });
          },
          response: {
            type: "tool",
            id: "product-shell",
            name: "shell",
            arguments: { command: "wc -c notes/result.txt" },
          },
        },
        {
          expect(request) {
            const result = request.messages.findLast((message) => message.role === "tool");
            expect(result?.tool_call_id).toBe("product-shell");
          },
          response: { type: "text", text: "Saved notes/result.txt." },
        },
      ],
    });
    const dataDir = await mkdtemp(path.join(tmpdir(), "rakazo-offline-product-"));
    let stop: (() => Promise<void>) | undefined;
    try {
      const handles = await createProductApp({
        databaseUrl: process.env.DATABASE_URL!,
        realtimeDatabaseUrl: process.env.DATABASE_URL!,
        authUrl: fixtureOrigin,
        webOrigin: fixtureOrigin,
        dataDir,
        sandboxProvider: "fake",
        agentRuntime: "pi",
        wakeupDriver: "memory",
        signupsEnabled: "true",
        composio: new ComposioEmulator(),
        encryptionKey: "offline-model-fixture-encryption-key",
      });
      stop = handles.stop;
      const signup = await handles.app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: fixtureOrigin },
        body: JSON.stringify({
          email: `offline-pi-${randomUUID()}@rakazo.test`,
          password: "password12",
          name: "Offline fixture",
        }),
      });
      expect(signup.status).toBeLessThan(400);
      const cookie = sessionCookieHeader(signup);
      await rpc(handles.app, cookie, "models/connect", {
        provider: model.model.provider,
        modelId: model.model.id,
        baseUrl: model.baseUrl,
        apiKey: fixtureKey,
        contextWindow: 160_000,
        maxTokens: 4096,
      });
      const bot = await rpc<{ id: string }>(handles.app, cookie, "bots/create", {
        name: "File fixture",
        title: "",
        description: "",
        instructions: "Complete the task.",
        notifyOnFinish: false,
      });
      await discardBotIntroRun(handles, cookie, bot.id);
      await rpc(handles.app, cookie, "bots/update", {
        botId: bot.id,
        modelProvider: model.model.provider,
        modelId: model.model.id,
      });
      const sent = await rpc<{ runId: string }>(handles.app, cookie, "threads/send", {
        botId: bot.id,
        text: "Save hello to notes/result.txt.",
      });
      await expect
        .poll(
          async () => {
            const run = await handles.prisma.run.findUnique({
              where: { id: sent.runId },
              select: { status: true },
            });
            if (run?.status === "failed") model.assertComplete();
            return run?.status;
          },
          { timeout: 15_000, interval: 100 },
        )
        .toBe("completed");
      model.assertComplete();
      const file = await rpc<{ content: string }>(handles.app, cookie, "computer/readFile", {
        botId: bot.id,
        path: "notes/result.txt",
      });
      expect(file.content).toBe("hello");
      const thread = await rpc<{ messages: Array<{ role: string; blocks: unknown[] }> }>(
        handles.app,
        cookie,
        "threads/get",
        { botId: bot.id },
      );
      const messages = JSON.stringify(thread.messages);
      expect(messages).toContain("Saved notes/result.txt.");
      expect(messages).not.toContain(fixtureKey);
      const tools = await handles.prisma.event.findMany({
        where: { botId: bot.id, type: "agent.tool.called" },
        select: { payload: true },
      });
      expect(tools).toHaveLength(2);
      expect(JSON.stringify(tools[0])).toContain("write_file");
      const commands = await rpc<Array<Record<string, unknown>>>(
        handles.app,
        cookie,
        "computer/commands",
        { botId: bot.id },
      );
      expect(commands).toEqual([
        expect.objectContaining({
          executionId: JSON.stringify(["pi-tool", "main", "product-write"]),
          kind: "write_file",
          command: "notes/result.txt",
          status: "done",
          exitCode: 0,
          bytes: 5,
        }),
        expect.objectContaining({
          executionId: JSON.stringify(["pi-tool", "main", "product-shell"]),
          kind: "shell",
          command: "wc -c notes/result.txt",
          status: "done",
          exitCode: 0,
        }),
      ]);
    } finally {
      try {
        await stop?.();
      } finally {
        await model.close();
        await rm(dataDir, { recursive: true, force: true });
      }
    }
  }, 30_000);
});

async function rpc<T>(
  app: App,
  cookie: string,
  procedure: string,
  input: unknown = {},
): Promise<T> {
  const response = await app.request(`/rpc/${procedure}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: fixtureOrigin },
    body: JSON.stringify({ json: input }),
  });
  const body = (await response.json()) as { json?: T; error?: { message?: string } };
  if (response.status >= 400 || body.error)
    throw new Error(`${procedure}: ${body.error?.message ?? response.status}`);
  return body.json as T;
}
