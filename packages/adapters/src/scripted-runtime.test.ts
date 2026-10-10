import type { AgentRuntimeEvent } from "@rakazo/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import { inferScript, ScriptedAgentRuntime } from "./scripted-runtime.js";

describe("inferScript message_bot", () => {
  const messageBotScript = (confirmName: string, message: string) => [
    {
      assistant: "messaging that bot now.",
      toolCalls: [
        {
          name: "message_bot",
          args: {
            confirm_name: confirmName,
            message,
            intent: "request",
          },
        },
      ],
      complete: true,
    },
  ];

  it("messages another bot by name", () => {
    expect(inferScript("message the bot named Researcher saying peer-exchange-alpha")).toEqual(
      messageBotScript("Researcher", "peer-exchange-alpha"),
    );
  });

  it("keeps message_bot when the payload mentions delete or subagent", () => {
    expect(
      inferScript(
        "message the bot named Researcher saying please delete the bot named Scout and use a subagent",
      ),
    ).toEqual(
      messageBotScript("Researcher", "please delete the bot named Scout and use a subagent"),
    );
  });

  it("keeps message_bot when the payload mentions sign in", () => {
    expect(inferScript("message the bot named Researcher saying please sign in")).toEqual(
      messageBotScript("Researcher", "please sign in"),
    );
  });

  it("preserves multiline message content", () => {
    expect(inferScript("message the bot named Researcher saying line one\nline two")).toEqual(
      messageBotScript("Researcher", "line one\nline two"),
    );
  });
});

describe("inferScript shell", () => {
  it("runs the requested command verbatim, even when it mentions other intents", () => {
    expect(inferScript("run the shell command echo sign in && ls -la")).toEqual([
      {
        assistant: "running it on my computer.",
        toolCalls: [{ name: "shell", args: { command: "echo sign in && ls -la" } }],
        complete: true,
      },
    ]);
  });
});

describe("inferScript quote markdown fixture", () => {
  it("returns the markdown fixture including the caller marker", () => {
    expect(inferScript("quote markdown fixture md-stamp")[0]?.assistant).toContain(
      "md-stamp\n1. list-a",
    );
  });
});

describe("inferScript request_secret", () => {
  it("opens a masked api key card via request_secret", () => {
    expect(inferScript("show a secret card for a masked api key")).toEqual([
      {
        assistant: "i need that value in a protected field.",
        toolCalls: [
          {
            name: "request_secret",
            args: {
              label: "API key",
              purpose: "api_key",
              credential: {
                name: "example_api",
                origin: "https://api.example.test",
                auth: { type: "bearer" },
              },
            },
          },
        ],
      },
    ]);
  });
});

describe("inferScript login request_secret", () => {
  it("opens a login card via request_secret", () => {
    expect(inferScript("show a login card")).toEqual([
      {
        assistant: "i need that sign-in in a protected card.",
        toolCalls: [
          {
            name: "request_secret",
            args: {
              label: "Example sign-in",
              purpose: "password",
              credential: {
                name: "example_login",
                origin: "https://login.example.test",
                auth: { type: "login" },
              },
            },
          },
        ],
      },
    ]);
  });
});

describe("inferScript write_file", () => {
  it("posts the reply after the tool so a routine run still has a durable final", () => {
    expect(
      inferScript("write a file in your home called notes/result.txt that says routine-ok"),
    ).toEqual([
      {
        toolCalls: [
          { name: "write_file", args: { path: "notes/result.txt", content: "routine-ok\n" } },
        ],
      },
      { assistant: "writing that into my home now.", complete: true },
    ]);
  });
});

describe("inferScript update_bot", () => {
  it("silences finish notifications on this bot", () => {
    expect(inferScript("silence finish notifications")).toEqual([
      {
        assistant: "silencing finish notifications.",
        toolCalls: [{ name: "update_bot", args: { notifyOnFinish: false } }],
        complete: true,
      },
    ]);
  });

  it("resumes finish notifications on this bot", () => {
    expect(inferScript("resume finish notifications")).toEqual([
      {
        assistant: "enabling finish notifications.",
        toolCalls: [{ name: "update_bot", args: { notifyOnFinish: true } }],
        complete: true,
      },
    ]);
  });
});

describe("ScriptedAgentRuntime executionIds", () => {
  it("gives repeated tools distinct executionIds within a run", async () => {
    const runtime = new ScriptedAgentRuntime();
    const events: AgentRuntimeEvent[] = [];
    for await (const event of runtime.run({
      botId: "bot-1",
      threadId: "thread-1",
      runId: "run-1",
      prompt: "ping",
      instructions: "",
      history: [],
      tools: [],
      model: { provider: "scripted", id: "scripted" },
      script: [
        {
          toolCalls: [
            { name: "message_agent", args: { address: "+15551111111", message: "one" } },
            { name: "message_agent", args: { address: "+15551111111", message: "two" } },
          ],
          complete: true,
        },
      ],
    })) {
      events.push(event);
    }

    const toolIds = events
      .filter(
        (event): event is Extract<AgentRuntimeEvent, { type: "tool" }> => event.type === "tool",
      )
      .map((event) => event.executionId);
    expect(toolIds).toEqual(["run-1:message_agent:0", "run-1:message_agent:1"]);
  });
});

describe("inferScript save_shared_memory", () => {
  it("saves shared memory from the prompt", () => {
    expect(inferScript("save shared memory MEMORY.md with: Printing jobs go to Clyde.")).toEqual([
      {
        assistant: "saving that to shared memory.",
        toolCalls: [
          {
            name: "save_shared_memory",
            args: { path: "MEMORY.md", content: "Printing jobs go to Clyde." },
          },
        ],
        complete: true,
      },
    ]);
  });

  it("uses an explicit named path", () => {
    expect(inferScript("save shared memory named ROUTING.md with: Route print jobs.")).toEqual([
      {
        assistant: "saving that to shared memory.",
        toolCalls: [
          {
            name: "save_shared_memory",
            args: { path: "ROUTING.md", content: "Route print jobs." },
          },
        ],
        complete: true,
      },
    ]);
  });

  it("defaults the path when none is given", () => {
    expect(inferScript("save shared memory with: Team facts")).toEqual([
      {
        assistant: "saving that to shared memory.",
        toolCalls: [
          {
            name: "save_shared_memory",
            args: { path: "MEMORY.md", content: "Team facts" },
          },
        ],
        complete: true,
      },
    ]);
  });

  it("beats write_file when the payload mentions notes", () => {
    const script = inferScript("write shared memory MEMORY.md with: Keep notes concise.");
    expect(script?.[0]?.toolCalls?.[0]?.name).toBe("save_shared_memory");
    expect(script?.[0]?.toolCalls?.[0]?.args).toEqual({
      path: "MEMORY.md",
      content: "Keep notes concise.",
    });
  });

  it("accepts write shared memory file <path>", () => {
    expect(inferScript("write shared memory file ROUTING.md with: Keep notes concise.")).toEqual([
      {
        assistant: "saving that to shared memory.",
        toolCalls: [
          {
            name: "save_shared_memory",
            args: { path: "ROUTING.md", content: "Keep notes concise." },
          },
        ],
        complete: true,
      },
    ]);
  });

  it("accepts with without a colon", () => {
    expect(inferScript("save shared memory with Team facts")).toEqual([
      {
        assistant: "saving that to shared memory.",
        toolCalls: [
          {
            name: "save_shared_memory",
            args: { path: "MEMORY.md", content: "Team facts" },
          },
        ],
        complete: true,
      },
    ]);
  });

  it("does not take named paths from the content body", () => {
    expect(inferScript("save shared memory ROUTING.md with: Team named Alice.")).toEqual([
      {
        assistant: "saving that to shared memory.",
        toolCalls: [
          {
            name: "save_shared_memory",
            args: { path: "ROUTING.md", content: "Team named Alice." },
          },
        ],
        complete: true,
      },
    ]);
  });
});

describe("scripted durable steering", () => {
  it("keeps the original tool intent when initial steering adds context", async () => {
    const prompt = "write a file called notes/original.txt";
    const claimSteering = vi.fn(async () => [
      { id: "steering-1", messageId: "message-1", text: "Keep it concise." },
    ]);
    const events: AgentRuntimeEvent[] = [];
    for await (const event of new ScriptedAgentRuntime().run({
      botId: "bot-1",
      threadId: "thread-1",
      runId: "run-original",
      prompt,
      instructions: "",
      history: [],
      tools: [],
      model: { provider: "scripted", id: "scripted" },
      script: inferScript(prompt),
      claimSteering,
    }))
      events.push(event);

    expect(claimSteering).toHaveBeenCalledExactlyOnceWith([]);
    const write = events.find((event) => event.type === "tool" && event.name === "write_file");
    expect(write).toMatchObject({
      type: "tool",
      name: "write_file",
      args: { path: "notes/original.txt" },
    });
    if (write?.type !== "tool") throw new Error("Original file-writing intent was lost");
    expect(write.args.content).toContain(prompt);
    expect(write.args.content).toContain("Keep it concise.");
    expect(events.at(-1)?.type).toBe("done");
  });

  it("claims the initial steering once and answers it instead of replaying the old script", async () => {
    const claimSteering = vi.fn(async () => [
      { id: "steering-1", messageId: "message-1", text: "Use revised totals." },
      { id: "steering-2", messageId: "message-2", text: "Keep it concise." },
    ]);
    const events: AgentRuntimeEvent[] = [];
    for await (const event of new ScriptedAgentRuntime().run({
      botId: "bot-1",
      threadId: "thread-1",
      runId: "run-1",
      prompt: "Respond to the user's steering context.",
      instructions: "",
      history: [],
      tools: [],
      model: { provider: "scripted", id: "scripted" },
      script: [{ assistant: "Old result", complete: true }],
      claimSteering,
    }))
      events.push(event);
    expect(claimSteering).toHaveBeenCalledExactlyOnceWith([]);
    const text = events
      .filter((event) => event.type === "text")
      .map((event) => event.text)
      .join("\n");
    expect(text).toContain("Use revised totals.");
    expect(text).toContain("Keep it concise.");
    expect(text).not.toContain("Old result");
    expect(events.at(-1)?.type).toBe("done");
  });
});
