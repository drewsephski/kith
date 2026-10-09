// @vitest-environment jsdom
import type { TaskStarterReceipt } from "@rakazo/contracts";
import { TASK_STARTERS } from "@rakazo/core";
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TaskReceiptDetails } from "../components/task-starters/receipt";
import { TaskStarterSetup } from "../components/task-starters/setup";
import { TaskStarterSuggestions } from "../components/task-starters/suggestions";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  openURL: vi.fn(),
  readOnly: false,
  space: "space-one",
  generation: 1,
}));
vi.mock("./i18n", () => ({
  t: (message: string, values: Record<string, unknown> = {}) =>
    message.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match)),
}));
vi.mock("./api", () => ({
  rpc: state.rpc,
  selectedSpaceId: () => state.space,
  currentApiBase: () => "https://example.test",
}));
vi.mock("./session", () => ({ currentSessionGeneration: () => state.generation }));
vi.mock("./thread-read-only", () => ({ useThreadReadOnly: () => state.readOnly }));
vi.mock("./native", () => ({ useMobileTokens: () => ({}) }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
vi.mock("@expo/ui/community/menu", () => ({
  MenuView: ({
    children,
    title,
    actions,
    onPressAction,
  }: {
    children: ReactNode;
    title: string;
    actions: Array<{ id: string; title: string }>;
    onPressAction: (event: { nativeEvent: { event: string } }) => void;
  }) => (
    <>
      <select
        aria-label={title}
        onChange={(event) => onPressAction({ nativeEvent: { event: event.target.value } })}
      >
        {actions.map((action) => (
          <option key={action.id} value={action.id}>
            {action.title}
          </option>
        ))}
      </select>
      {children}
    </>
  ),
}));
vi.mock("../components/native-action-button", () => ({
  NativeActionButton: ({
    label,
    onPress,
    disabled,
    busy,
  }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    busy?: boolean;
  }) => (
    <button type="button" onClick={onPress} disabled={disabled || busy}>
      {label}
    </button>
  ),
}));
vi.mock("../components/native-switch", () => ({
  NativeSwitch: ({
    accessibilityLabel,
    value,
    disabled,
    onValueChange,
  }: {
    accessibilityLabel: string;
    value: boolean;
    disabled: boolean;
    onValueChange: (value: boolean) => void;
  }) => (
    <input
      type="checkbox"
      aria-label={accessibilityLabel}
      checked={value}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.checked)}
    />
  ),
}));
vi.mock("react-native", () => {
  const View = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return {
    View,
    Text: View,
    ScrollView: View,
    KeyboardAvoidingView: View,
    Modal: View,
    Platform: { OS: "ios" },
    Linking: { openURL: state.openURL },
    AppState: { currentState: "active", addEventListener: () => ({ remove: vi.fn() }) },
    TextInput: ({
      accessibilityLabel,
      value,
      onChangeText,
    }: {
      accessibilityLabel: string;
      value: string;
      onChangeText: (value: string) => void;
    }) => (
      <input
        aria-label={accessibilityLabel}
        value={value}
        onChange={(event) => onChangeText(event.target.value)}
      />
    ),
  };
});

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  state.readOnly = false;
  state.space = "space-one";
  state.generation = 1;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function render(node: ReactNode) {
  await act(async () => root.render(node));
}
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find((node) => node.textContent === text);
  expect(button, text).toBeDefined();
  await act(async () => button!.click());
}
async function input(label: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  expect(field).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function choose(label: string, id: string) {
  const select = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  await act(async () => {
    select.value = id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
const base = {
  id: "receipt-one",
  runId: "run-one",
  starter: "inbox_todos" as const,
  status: "completed" as const,
  error: null,
  createdAt: "2026-10-09T12:00:00Z",
  updatedAt: "2026-10-09T12:00:00Z",
};
const todoReceipt: TaskStarterReceipt = {
  ...base,
  result: {
    kind: "inbox_todos",
    summary: "One action",
    sources: [
      {
        id: "source-one",
        connectionId: "mail-one",
        title: "Email",
        url: "https://example.test/email",
        retrievedAt: "2026-10-09T12:00:00Z",
      },
    ],
    warnings: [],
    actions: [
      {
        id: "action-one",
        title: "Send proposal",
        notes: "Reply to the request",
        dueDate: null,
        priority: "high",
        reason: "Requested follow-up",
        sourceIds: ["source-one"],
        savedItemId: null,
      },
    ],
  },
};
const options = {
  configured: true,
  connections: [
    {
      id: "mail-one",
      app: "gmail",
      connectorId: "composio",
      name: "Personal",
      identity: "personal@example.test",
      status: "connected",
    },
    {
      id: "mail-two",
      app: "gmail",
      connectorId: "composio",
      name: "Work",
      identity: "work@example.test",
      status: "connected",
    },
  ],
};

it("only prefills the selected suggestion and never starts a task", async () => {
  const select = vi.fn();
  await render(<TaskStarterSuggestions onSelect={select} />);
  expect(host.querySelectorAll("button")).toHaveLength(4);
  for (const starter of TASK_STARTERS) {
    await click(starter.title);
    expect(select).toHaveBeenLastCalledWith(starter);
  }
  expect(state.rpc).not.toHaveBeenCalled();
});

it("requires a search topic and explicit accounts, then starts with exactly those accounts", async () => {
  const started = vi.fn();
  state.rpc.mockImplementation((proc: string) =>
    Promise.resolve(
      proc === "taskStarters/options"
        ? options
        : { ...base, starter: "gmail_search", status: "queued", result: null },
    ),
  );
  await render(
    <TaskStarterSetup
      starterId="gmail_search"
      prompt="Search all my Gmail accounts for invoices"
      botId="bot-one"
      onClose={vi.fn()}
      onStarted={started}
    />,
  );
  expect(
    [...host.querySelectorAll("button")].find((node) => node.textContent === "Start task")!
      .disabled,
  ).toBe(true);
  await input("Search for", "invoices");
  await act(async () =>
    host
      .querySelector<HTMLInputElement>('input[aria-label="Personal · personal@example.test"]')!
      .click(),
  );
  await click("Start task");
  expect(state.rpc).toHaveBeenCalledWith(
    "taskStarters/start",
    expect.objectContaining({
      spec: expect.objectContaining({ query: "invoices", gmailConnectionIds: ["mail-one"] }),
    }),
    expect.anything(),
  );
  expect(started).toHaveBeenCalledTimes(1);
});

it("keeps search input and selected accounts after authorizing another account", async () => {
  state.rpc.mockImplementation((proc: string) =>
    Promise.resolve(
      proc === "taskStarters/options"
        ? options
        : proc === "connections/catalog"
          ? [{ connectorId: "composio", slug: "gmail", name: "Gmail" }]
          : proc === "connections/begin"
            ? { connectionId: "new-mail", authorizationUrl: "https://example.test/oauth" }
            : { status: "connected" },
    ),
  );
  await render(
    <TaskStarterSetup
      starterId="gmail_search"
      prompt="Search my mail"
      botId="bot-one"
      onClose={vi.fn()}
      onStarted={vi.fn()}
    />,
  );
  await input("Search for", "receipt");
  await act(async () =>
    host.querySelector<HTMLInputElement>('input[aria-label="Work · work@example.test"]')!.click(),
  );
  await click("Connect Gmail");
  expect(state.openURL).toHaveBeenCalledWith("https://example.test/oauth");
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Search for"]')!.value).toBe(
    "receipt",
  );
  expect(
    host.querySelector<HTMLInputElement>('input[aria-label="Work · work@example.test"]')!.checked,
  ).toBe(true);
});

it("stops OAuth continuation when the active Space changes", async () => {
  let authorized: (() => void) | undefined;
  state.openURL.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        authorized = resolve;
      }),
  );
  state.rpc.mockImplementation((proc: string) =>
    Promise.resolve(
      proc === "taskStarters/options"
        ? options
        : proc === "connections/catalog"
          ? [{ connectorId: "composio", slug: "gmail", name: "Gmail" }]
          : { connectionId: "new-mail", authorizationUrl: "https://example.test/oauth" },
    ),
  );
  await render(
    <TaskStarterSetup
      starterId="gmail_search"
      prompt="Search my mail"
      botId="bot-one"
      onClose={vi.fn()}
      onStarted={vi.fn()}
    />,
  );
  await click("Connect Gmail");
  state.space = "space-two";
  await act(async () => authorized?.());
  expect(state.rpc.mock.calls.some(([proc]) => proc === "connections/complete")).toBe(false);
});

it("saves only reviewed actions and includes edits without changing their source identity", async () => {
  state.rpc.mockResolvedValue(todoReceipt);
  await render(<TaskReceiptDetails receiptId="receipt-one" onClose={vi.fn()} />);
  await click("Edit");
  await input("Title", "Send revised proposal");
  await act(async () =>
    host.querySelector<HTMLInputElement>('input[aria-label="Send revised proposal"]')!.click(),
  );
  await click("Save selected to-dos");
  expect(state.rpc).toHaveBeenCalledWith(
    "taskStarters/saveTodos",
    {
      receiptId: "receipt-one",
      actionIds: ["action-one"],
      edits: [
        {
          id: "action-one",
          title: "Send revised proposal",
          notes: "Reply to the request",
          dueDate: null,
          priority: "high",
        },
      ],
    },
    expect.anything(),
  );
});

it("does not offer writes or retries for an ambiguous report mutation", async () => {
  state.rpc.mockResolvedValue({
    ...base,
    starter: "analytics_report",
    status: "reconciliation_required",
    result: {
      kind: "analytics_report",
      summary: "",
      sources: [],
      warnings: [],
      report: {
        propertyId: "123",
        timezone: "UTC",
        startDate: "2026-10-05",
        endDate: "2026-10-09",
        metrics: [{ name: "activeUsers", label: "Active users", value: 42 }],
        currency: null,
        spreadsheetId: "sheet-identifier",
        url: null,
        range: "Report!A1",
        values: [],
        provisional: true,
        published: false,
      },
    },
  });
  await render(<TaskReceiptDetails receiptId="receipt-one" onClose={vi.fn()} />);
  expect(host.textContent).toContain("Active users: 42");
  expect(host.textContent).toContain("Check the destination");
  expect(host.textContent).not.toContain("Write report to Sheet");
  expect(host.textContent).not.toContain("Retry retrieval");
});

it("keeps read-only receipts inspectable without editing or saving", async () => {
  state.readOnly = true;
  state.rpc.mockResolvedValue(todoReceipt);
  await render(<TaskReceiptDetails receiptId="receipt-one" onClose={vi.fn()} />);
  expect(host.textContent).toContain("Send proposal");
  expect(host.textContent).not.toContain("Save selected to-dos");
  expect(host.textContent).not.toContain("Edit");
});

it("loads properties from the selected GA4 account and uses the property timezone", async () => {
  const reportOptions = {
    configured: true,
    connections: [
      {
        id: "analytics-one",
        app: "analytics",
        connectorId: "composio",
        name: "Analytics",
        identity: null,
        status: "connected",
      },
      {
        id: "sheets-one",
        app: "sheets",
        connectorId: "composio",
        name: "Sheets",
        identity: null,
        status: "connected",
      },
    ],
  };
  state.rpc.mockImplementation((proc: string) =>
    Promise.resolve(
      proc === "taskStarters/options"
        ? reportOptions
        : proc === "taskStarters/properties"
          ? [{ id: "123", name: "Website", timezone: "America/New_York" }]
          : { ...base, starter: "analytics_report", status: "queued", result: null },
    ),
  );
  await render(
    <TaskStarterSetup
      starterId="analytics_report"
      prompt="Report this week"
      botId="bot-one"
      onClose={vi.fn()}
      onStarted={vi.fn()}
    />,
  );
  await choose("Google Analytics 4 account", "analytics-one");
  await choose("Property", "123");
  await choose("Google Sheets account", "sheets-one");
  await click("Start task");
  expect(state.rpc).toHaveBeenCalledWith(
    "taskStarters/properties",
    { connectionId: "analytics-one" },
    expect.anything(),
  );
  expect(state.rpc).toHaveBeenCalledWith(
    "taskStarters/start",
    expect.objectContaining({
      spec: expect.objectContaining({
        propertyId: "123",
        timezone: "America/New_York",
        sheetsConnectionId: "sheets-one",
        period: "this_week",
      }),
    }),
    expect.anything(),
  );
});

it("checks an uncertain write through the read-only reconciliation operation", async () => {
  state.rpc.mockResolvedValue({ ...base, status: "reconciliation_required", result: null });
  await render(<TaskReceiptDetails receiptId="receipt-one" onClose={vi.fn()} />);
  await click("Check outcome");
  expect(state.rpc).toHaveBeenCalledWith(
    "taskStarters/reconcile",
    { receiptId: "receipt-one" },
    expect.anything(),
  );
  expect(state.rpc.mock.calls.some(([proc]) => proc === "taskStarters/publish")).toBe(false);
});

it("continues an already-pending connection without starting another OAuth authorization", async () => {
  state.rpc.mockImplementation((proc: string) =>
    Promise.resolve(
      proc === "taskStarters/options"
        ? {
            ...options,
            connections: [
              ...options.connections,
              {
                id: "pending-mail",
                app: "gmail",
                connectorId: "composio",
                name: "Other Gmail",
                identity: null,
                status: "pending",
              },
            ],
          }
        : { id: "pending-mail", status: "connected" },
    ),
  );
  await render(
    <TaskStarterSetup
      starterId="gmail_search"
      prompt="Search mail"
      botId="bot-one"
      onClose={vi.fn()}
      onStarted={vi.fn()}
    />,
  );
  await click("Finish connecting Other Gmail");
  expect(state.rpc).toHaveBeenCalledWith(
    "connections/complete",
    { connectionId: "pending-mail" },
    expect.anything(),
  );
  expect(state.rpc.mock.calls.some(([proc]) => proc === "connections/begin")).toBe(false);
  expect(state.openURL).not.toHaveBeenCalled();
});

it("follows the new durable receipt after selecting an overlapping meeting", async () => {
  const choice = {
    id: "event-one",
    connectionId: "calendar-one",
    title: "Project review",
    start: "2026-10-09T14:00:00Z",
    end: "2026-10-09T14:30:00Z",
    url: "https://example.test/meeting",
  };
  const initial = {
    ...base,
    starter: "meeting_brief",
    result: {
      kind: "meeting_brief",
      summary: "Choose a meeting",
      sources: [],
      warnings: [],
      meeting: null,
      choices: [choice],
      facts: [],
      suggestions: [],
    },
  };
  const next = {
    ...initial,
    id: "receipt-two",
    runId: "run-two",
    result: { ...initial.result, choices: [], meeting: choice, summary: "Meeting selected" },
  };
  state.rpc.mockImplementation((proc: string, body: { receiptId: string }) =>
    Promise.resolve(
      proc === "taskStarters/chooseMeeting" || body.receiptId === "receipt-two" ? next : initial,
    ),
  );
  await render(<TaskReceiptDetails receiptId="receipt-one" onClose={vi.fn()} />);
  await click("Project review · 2026-10-09T14:00:00Z");
  expect(state.rpc).toHaveBeenCalledWith(
    "taskStarters/chooseMeeting",
    expect.objectContaining({
      receiptId: "receipt-one",
      meetingId: "event-one",
      connectionId: "calendar-one",
      clientNonce: expect.any(String),
    }),
    expect.anything(),
  );
  expect(state.rpc).toHaveBeenCalledWith(
    "taskStarters/receipt",
    { receiptId: "receipt-two" },
    expect.anything(),
  );
  expect(host.textContent).toContain("Meeting selected");
});
