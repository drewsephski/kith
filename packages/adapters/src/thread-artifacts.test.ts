import type {
  AdapterContext,
  ArtifactStore,
  ComputerRef,
  SandboxProvider,
} from "@rakazo/adapter-kit";
import type { MessageBlock } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import {
  attachWorkspaceFileToThread,
  currentTurnFilesInstruction,
  materializeCurrentTurnFiles,
  materializeMissingThreadAttachments,
} from "./thread-artifacts.js";

describe("current-turn thread files", () => {
  it("removes stored bytes when artifact metadata cannot be created", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const failure = new Error("database unavailable");
    const artifact = {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockRejectedValue(failure),
    };
    const tx = { artifact, $queryRaw: vi.fn().mockResolvedValue([{ lock: "1" }]) };

    await expect(
      attachWorkspaceFileToThread(
        {
          prisma: {
            artifact,
            $transaction: async (run: (client: typeof tx) => Promise<unknown>) => run(tx),
          } as unknown as PrismaClient,
          artifacts: {
            put: vi.fn().mockResolvedValue({ id: "stored-1", hash: "hash" }),
            remove,
          } as unknown as ArtifactStore,
        },
        {
          spaceId: "workspace-1",
          userId: "user-1",
          botId: "bot-1",
          runId: "run-1",
          filePath: "report.pdf",
          bytes: new Uint8Array([1, 2, 3]),
          operationId: "attach-1",
        },
      ),
    ).rejects.toBe(failure);
    expect(remove).toHaveBeenCalledWith(
      "stored-1",
      expect.objectContaining({ spaceId: "workspace-1", botId: "bot-1" }),
    );
  });

  it("copies non-image attachments into the bot workspace and describes their paths", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "artifact-1",
        spaceId: "workspace-1",
        botId: "bot-1",
        name: "../quarterly report.pdf",
        mimeType: "application/pdf",
        size: 4,
        storageKey: "stored-1",
      },
    ]);
    const get = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]));
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const markWorkspaceDirty = vi.fn();
    const context: AdapterContext & { botId: string } = {
      operationId: "run-1",
      traceId: "run-1",
      spaceId: "workspace-1",
      userId: "user-1",
      botId: "bot-1",
      runId: "run-1",
      signal: new AbortController().signal,
    };
    const computer: ComputerRef = {
      id: "computer-1",
      botId: "bot-1",
      kind: "fake",
      providerRef: "fake-1",
    };
    const blocks: MessageBlock[] = [
      {
        kind: "file",
        artifactId: "artifact-1",
        name: "../quarterly report.pdf",
        mimeType: "application/pdf",
        size: 4,
      },
    ];

    const files = await materializeCurrentTurnFiles(
      {
        prisma: { artifact: { findMany } } as unknown as PrismaClient,
        artifacts: { get } as unknown as ArtifactStore,
        sandbox: { writeFile } as unknown as SandboxProvider,
      },
      blocks,
      { context, computer, computerMode: "team", markWorkspaceDirty },
    );

    expect(get).toHaveBeenCalledWith("stored-1", context);
    expect(writeFile).toHaveBeenCalledWith(
      computer,
      {
        path: "bots/bot-1/attachments/artifact-1.pdf",
        content: new Uint8Array([1, 2, 3, 4]),
      },
      context,
    );
    expect(markWorkspaceDirty).toHaveBeenCalledOnce();
    expect(markWorkspaceDirty.mock.invocationCallOrder[0]).toBeLessThan(
      writeFile.mock.invocationCallOrder[0]!,
    );
    expect(files).toEqual([
      {
        name: "../quarterly report.pdf",
        mimeType: "application/pdf",
        size: 4,
        path: "attachments/artifact-1.pdf",
      },
    ]);
    expect(currentTurnFilesInstruction(files)).toContain('"attachments/artifact-1.pdf"');
  });

  it("also materializes image attachments, not just files", async () => {
    // A photo attached in chat is only handed to the model as inline vision
    // content otherwise (loadCurrentTurnImages) — a bot that needs the actual
    // bytes (to forward, re-attach, or hand to a shell tool) needs this too.
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "image-1",
        spaceId: "workspace-1",
        botId: "bot-1",
        name: "photo.png",
        mimeType: "image/png",
        size: 4,
        storageKey: "stored-image-1",
      },
    ]);
    const get = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]));
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const files = await materializeCurrentTurnFiles(
      {
        prisma: { artifact: { findMany } } as unknown as PrismaClient,
        artifacts: { get } as unknown as ArtifactStore,
        sandbox: { writeFile } as unknown as SandboxProvider,
      },
      [
        {
          kind: "image",
          artifactId: "image-1",
          name: "photo.png",
          mimeType: "image/png",
        },
      ],
      {
        context: {
          operationId: "run-1",
          traceId: "run-1",
          spaceId: "workspace-1",
          userId: "user-1",
          botId: "bot-1",
          signal: new AbortController().signal,
        },
        computer: {
          id: "computer-1",
          botId: "bot-1",
          kind: "fake",
          providerRef: "fake-1",
        },
        computerMode: "team",
      },
    );

    expect(get).toHaveBeenCalledWith("stored-image-1", expect.objectContaining({ botId: "bot-1" }));
    expect(writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ id: "computer-1" }),
      { path: "bots/bot-1/attachments/image-1.png", content: new Uint8Array([1, 2, 3, 4]) },
      expect.objectContaining({ botId: "bot-1" }),
    );
    expect(files).toEqual([
      { name: "photo.png", mimeType: "image/png", size: 4, path: "attachments/image-1.png" },
    ]);
  });
});

describe("images deferred across turns", () => {
  const image = {
    kind: "image" as const,
    artifactId: "image-1",
    mimeType: "image/png",
    name: "photo.png",
  };
  const context = {
    operationId: "fixture",
    traceId: "fixture",
    spaceId: "space",
    userId: "owner",
    botId: "bot",
    signal: new AbortController().signal,
  };
  const computer = { id: "computer", providerRef: "computer", kind: "fake" as const, botId: "bot" };
  function fixture(existing = false, authorized = true) {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const findMany = vi.fn().mockResolvedValue(
      authorized
        ? [
            {
              id: "image-1",
              mimeType: "image/png",
              storageKey: "image",
              name: "photo.png",
              size: 3,
            },
          ]
        : [],
    );
    const listFiles = vi.fn(async (_computer, directory) =>
      existing
        ? directory === "bots/bot"
          ? [{ kind: "dir", path: "bots/bot/attachments" }]
          : [{ kind: "file", path: "bots/bot/attachments/image-1.png" }]
        : [],
    );
    return {
      get,
      writeFile,
      findMany,
      deps: {
        prisma: { artifact: { findMany } } as unknown as PrismaClient,
        artifacts: { get } as unknown as ArtifactStore,
        sandbox: { listFiles, writeFile } as unknown as SandboxProvider,
      },
    };
  }
  it("copies a previously inspected image for a later workspace tool", async () => {
    const f = fixture();
    const result = await materializeMissingThreadAttachments(
      f.deps,
      [image],
      { path: "attachments/image-1.png" },
      { context, computer, computerMode: "team" },
    );
    expect(result).toHaveLength(1);
    expect(f.writeFile).toHaveBeenCalledWith(
      computer,
      expect.objectContaining({ path: "bots/bot/attachments/image-1.png" }),
      context,
    );
    expect(f.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ spaceId: "space", userId: "owner" }),
      }),
    );
  });
  it("preserves an existing or edited workspace copy", async () => {
    const f = fixture(true);
    expect(
      await materializeMissingThreadAttachments(
        f.deps,
        [image],
        { path: "attachments/image-1.png" },
        { context, computer, computerMode: "team" },
      ),
    ).toEqual([]);
    expect(f.get).not.toHaveBeenCalled();
    expect(f.writeFile).not.toHaveBeenCalled();
  });
  it("does not restore unrelated images or expose foreign/deleted artifacts", async () => {
    const f = fixture(false, false);
    expect(
      await materializeMissingThreadAttachments(
        f.deps,
        [image],
        { command: "pwd" },
        { context, computer, computerMode: "team" },
      ),
    ).toEqual([]);
    expect(f.findMany).not.toHaveBeenCalled();
    expect(
      await materializeMissingThreadAttachments(
        f.deps,
        [image],
        { path: "attachments/image-1.png" },
        { context, computer, computerMode: "team" },
      ),
    ).toEqual([]);
    expect(f.get).not.toHaveBeenCalled();
    expect(f.writeFile).not.toHaveBeenCalled();
  });
});
