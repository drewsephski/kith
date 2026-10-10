import { describe, expect, it } from "vitest";
import { describeToolActivity } from "./pi-runtime.js";

describe("describeToolActivity", () => {
  it("describes actual connected-app operations without exposing mail content", () => {
    expect(describeToolActivity("GMAIL_FETCH_EMAILS", { query: "private query" })).toBe(
      "Searching Gmail…",
    );
    expect(
      describeToolActivity("mcp__mail__GMAIL_CREATE_EMAIL_DRAFT", { body: "private body" }),
    ).toBe("Preparing drafts");
    expect(
      describeToolActivity("COMPOSIO_MULTI_EXECUTE_TOOL", {
        tools: [{ tool_slug: "GMAIL_CREATE_EMAIL_DRAFT", arguments: { body: "private body" } }],
      }),
    ).toBe("Preparing drafts");
    expect(
      describeToolActivity("COMPOSIO_MULTI_EXECUTE_TOOL", {
        tools: [{ tool_slug: "GMAIL_FETCH_EMAILS" }, { tool_slug: "GMAIL_GET_THREAD" }],
      }),
    ).toBe("Working across connected apps");
    expect(
      describeToolActivity("COMPOSIO_MULTI_EXECUTE_TOOL", {
        tools: [{ tool_slug: "GMAIL_FETCH_EMAILS" }, { tool_slug: "GOOGLECALENDAR_LIST_EVENTS" }],
      }),
    ).toBe("Working across connected apps");
  });
<<<<<<< Updated upstream
  it("names builtin operations without exposing their arguments", () => {
=======
  it("names builtin operations without echoing private arguments", () => {
>>>>>>> Stashed changes
    expect(describeToolActivity("shell", { command: "pnpm test --filter web" })).toBe(
      "Running a command…",
    );
    expect(describeToolActivity("read_file", { path: "notes/plan.md" })).toBe("Reading a file…");
    expect(describeToolActivity("write_file", { path: "out.csv", content: "…" })).toBe(
      "Writing a file…",
    );
    expect(describeToolActivity("render_plot", { spec: {} })).toBe("Rendering a chart");
    expect(describeToolActivity("add_mcp_server", { name: "Linear" })).toBe("Connecting an app…");
    expect(describeToolActivity("run_subagent", { name: "scout", task: "…" })).toBe(
      "Delegating to a helper…",
    );
    expect(describeToolActivity("create_space", { name: "Customer support" })).toBe(
      "Creating a space…",
    );
    expect(describeToolActivity("web_search", { query: "rakazo agents" })).toBe(
      "Searching the web…",
    );
    expect(describeToolActivity("web_fetch", { url: "https://example.com" })).toBe(
      "Reading a page…",
    );
  });

  it("names MCP server and remote tool", () => {
    expect(describeToolActivity("mcp__brex__list_expenses", {})).toBe("Using brex: list_expenses");
    expect(describeToolActivity("mcp__demo-oauth__greet", {})).toBe("Using demo-oauth: greet");
  });

  it("omits long payloads and embedded whitespace", () => {
    const long = `x${"y".repeat(200)}`;
    const line = describeToolActivity("shell", { command: `a\n\t${long}` });
    expect(line).toBe("Running a command…");
    expect(line).not.toContain(long);
    expect(line).toContain("…");
    expect(line).not.toContain("\n");
<<<<<<< Updated upstream
=======
    expect(line).toBe("Running a command…");
>>>>>>> Stashed changes
  });

  it("redacts credentials from activity details", () => {
    const token = "fake-token";
    const line = describeToolActivity("shell", {
      command: `curl -H 'Authorization: Bearer ${token}' https://example.test?api_key=fake-key password=fake-password`,
    });

    expect(line).toBe("Running a command…");
<<<<<<< Updated upstream
    expect(line).not.toContain("Authorization");
    expect(line).not.toContain("api_key");
=======
>>>>>>> Stashed changes
    expect(line).not.toContain(token);
    expect(line).not.toContain("fake-key");
    expect(line).not.toContain("fake-password");
  });

  it("omits signed URLs from web_fetch activity", () => {
    const line = describeToolActivity("web_fetch", {
      url: "https://user:secret@cdn.example.test/doc.pdf?X-Amz-Signature=abc123&token=leak#frag",
    });
    expect(line).toBe("Reading a page…");
    expect(line).not.toContain("secret");
    expect(line).not.toContain("X-Amz-Signature");
    expect(line).not.toContain("token=");
    expect(line).not.toContain("abc123");
    expect(line).not.toContain("frag");
  });

  it("does not echo secrets from malformed web_fetch URLs", () => {
    const line = describeToolActivity("web_fetch", {
      url: "https://user:secret@[",
    });
    expect(line).toBe("Reading a page…");
    expect(line).not.toContain("secret");
    expect(line).not.toContain("user:");
  });

  it("falls back to the tool name", () => {
    expect(describeToolActivity("destination_write", undefined)).toBe("Using destination_write");
  });
});
