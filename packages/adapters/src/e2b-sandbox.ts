import { createHmac } from "node:crypto";
import type { CommandResult } from "@e2b/desktop";
import {
  ApiClient,
  ConnectionConfig,
  Sandbox,
  SandboxNotFoundError,
  TimeoutError,
} from "@e2b/desktop";
import type {
  AdapterContext,
  CommandRequest,
  ComputerActionRequest,
  ComputerFileEntry,
  ComputerInput,
  ComputerObservation,
  ComputerRef,
  ControlLeaseRef,
  PortableFile,
  ProcessEvent,
  SandboxProvider,
  ScreenRequest,
  ScreenSession,
  TerminalRequest,
} from "@rakazo/adapter-kit";
import { boundedSandboxCommandTimeoutMs } from "@rakazo/core";
import { getLogger } from "@rakazo/logging";
import { computerActivationReason } from "./computer-demand.js";
import { sandboxIdleMs } from "./computer-idle.js";
import { normalizeWorkspacePath, shellQuote, workspacePath } from "./computer-support.js";
import {
  PORTABLE_TRANSFER_BATCH_BYTES,
  shouldSkipPortableWorkspaceFile,
} from "./computer-workspace.js";
import { LinuxDesktop, PREPARE_LINUX_DESKTOP } from "./linux-desktop.js";
import { sandboxCommandArgv } from "./sandbox-command-environment.js";

const E2B_WORKSPACE = "/home/user/rakazo-home";
const E2B_BROWSER_PROFILES = `${E2B_WORKSPACE}/.browser-profiles`;

export interface E2BSandboxSdk {
  attachRunning(id: string, options: { apiKey: string }): Promise<Sandbox>;
  getInfo(id: string, options: { apiKey: string }): Promise<{ state: "running" | "paused" }>;
  create(options: ReturnType<typeof e2bCreateOptions>): Promise<Sandbox>;
  connect(
    id: string,
    options: { apiKey: string; timeoutMs: number; signal?: AbortSignal },
  ): Promise<Sandbox>;
  pause(id: string, options: { apiKey: string }): Promise<undefined | boolean>;
  kill(id: string, options: { apiKey: string }): Promise<boolean>;
}

/** Attach through GET only. SDK connect() also resumes and extends the timeout. */
export async function attachRunningE2BSandbox(
  id: string,
  options: { apiKey: string; apiUrl?: string },
): Promise<Sandbox> {
  const client = new ApiClient(new ConnectionConfig(options));
  const result = await client.api.GET("/sandboxes/{sandboxID}", {
    params: { path: { sandboxID: id } },
    signal: AbortSignal.timeout(10_000),
  });
  if (result.response.status === 404) throw new SandboxNotFoundError("Sandbox not found");
  if (result.error || !result.data) throw new Error("Could not read computer state");
  if (result.data.state !== "running") throw new ComputerSuspendedError();
  const connection = {
    ...options,
    sandboxId: result.data.sandboxID,
    envdVersion: result.data.envdVersion,
    sandboxDomain: result.data.domain ?? undefined,
    envdAccessToken: result.data.envdAccessToken,
  };
  // The desktop SDK forwards the connection object to the base SDK; its constructor
  // declaration omits the base SDK connection fields. Keep their inferred types.
  return new Sandbox(connection);
}

const E2B_SDK: E2BSandboxSdk = {
  create: (options) => Sandbox.create(options),
  connect: (id, options) => Sandbox.connect(id, options),
  getInfo: (id, options) => Sandbox.getInfo(id, options),
  attachRunning: attachRunningE2BSandbox,
  pause: (id, options) => Sandbox.pause(id, options),
  kill: (id, options) => Sandbox.kill(id, options),
};

// Give the app-owned checkpoint/idle job time to finish before provider auto-pause.
export function e2bTimeoutMs(): number {
  return sandboxIdleMs("e2b") + 60_000;
}

export function e2bCreateOptions(botId: string, apiKey: string, signal?: AbortSignal) {
  return {
    apiKey,
    ...(signal ? { signal } : {}),
    timeoutMs: e2bTimeoutMs(),
    metadata: { botId, rakazo: "computer" },
    resolution: [1280, 800] as [number, number],
    lifecycle: { onTimeout: "pause" as const, autoResume: false },
  };
}

// How the E2B SDK words a sandbox that no longer exists. It does not always say "not found":
// an expired sandbox surfaces as a TimeoutError about the *sandbox* timeout (502 / Unavailable
// from envd), which used to read as a live sandbox and left every later call throwing forever.
const SANDBOX_GONE_MESSAGE =
  /probably not running anymore|likely due to sandbox timeout|killed or reached its end of life|sandbox [^:]{0,60}not found|sandbox [^:]{0,60}does not exist/i;
// The same words from a live sandbox: a missing binary or a missing file inside it.
const SHELL_MISSING_TARGET = /command not found|no such file|^path .* not found/i;
/** Only provider-specific evidence of sandbox loss permits automatic replacement. */
export function isSandboxGoneError(error: unknown): boolean {
  const message = errorMessage(error);
  if (SHELL_MISSING_TARGET.test(message)) return false;
  if (SANDBOX_GONE_MESSAGE.test(message)) return true;
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    if (current.name === "SandboxNotFoundError") return true;
  }
  return false;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ComputerSuspendedError extends Error {
  constructor() {
    super("Computer is suspended. Resume computer to continue.");
    this.name = "ComputerSuspendedError";
  }
}

export class E2BSandboxProvider implements SandboxProvider {
  private readonly desktops = new LinuxDesktop({
    environment: async () => ({
      homeDir: "/home/user",
      workspaceDir: E2B_WORKSPACE,
      browserProfilesDir: E2B_BROWSER_PROFILES,
      displayStart: 20,
      portStart: 6100,
    }),
    run: async (computer, command, context) => {
      const result = await this.runSetupCommand(await this.box(computer), command, context.signal);
      return { code: result.exitCode, stdout: result.stdout, stderr: result.stderr };
    },
    screenUrl: async (computer, port) =>
      `https://${(await this.box(computer)).getHost(port)}/vnc.html`,
  });
  private readonly boxes = new Map<string, Sandbox>();
  private readonly connections = new Map<string, Promise<Sandbox>>();
  private readonly renewals = new Map<string, Promise<boolean>>();
  private readonly lastTouchedAt = new Map<string, number>();
  private readonly activeSince = new Map<string, number>();

  constructor(
    private readonly apiKey: string,
    private readonly sdk: E2BSandboxSdk = E2B_SDK,
  ) {}

  describe() {
    return {
      id: "e2b",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: {
        graphical: true,
        pty: true,
        snapshots: true,
        takeover: true,
        persistentHome: true,
        multiScreen: true,
      },
    };
  }

  async isRunning(computer: ComputerRef): Promise<boolean> {
    if (computer.kind !== "e2b") return false;
    const id = computer.providerRef || computer.id;
    try {
      const info = await this.sdk.getInfo(id, { apiKey: this.apiKey });
      if (info.state === "paused") this.forget(id);
      return info.state === "running";
    } catch (error) {
      if (!isSandboxGoneError(error)) throw error;
      this.forget(id);
      return false;
    }
  }

  private async box(
    computer: ComputerRef,
    allowResume = false,
    signal?: AbortSignal,
  ): Promise<Sandbox> {
    const id = computer.providerRef || computer.id;
    const existing = this.boxes.get(id);
    if (existing) {
      if (await this.refreshTimeout(id, existing)) return existing;
      if (!allowResume) throw new SandboxNotFoundError("Sandbox no longer running");
    }
    const pending = this.connections.get(id);
    if (pending) return pending;
    let connection!: Promise<Sandbox>;
    connection = (async () => {
      // connect resumes paused machines. Only demand-owned provision may do that;
      // passive viewer reconnects must first observe provider state without mutation.
      if (!allowResume) return this.sdk.attachRunning(id, { apiKey: this.apiKey });
      signal?.throwIfAborted();
      return this.sdk.connect(id, {
        apiKey: this.apiKey,
        timeoutMs: e2bTimeoutMs(),
        ...(signal ? { signal } : {}),
      });
    })()
      .then(async (connected) => {
        if (this.connections.get(id) !== connection) {
          throw new Error("computer connection stopped during teardown");
        }
        this.boxes.set(connected.sandboxId, connected);
        this.activeSince.set(connected.sandboxId, Date.now());
        // GET attachment did not renew the provider timeout. A genuine viewer
        // or tool must not inherit a nearly expired deadline after a server restart.
        this.lastTouchedAt.set(
          connected.sandboxId,
          allowResume ? Date.now() : Number.NEGATIVE_INFINITY,
        );
        if (!allowResume && !(await this.refreshTimeout(connected.sandboxId, connected)))
          throw new SandboxNotFoundError("Sandbox no longer running");
        return connected;
      })
      .finally(() => {
        if (this.connections.get(id) === connection) this.connections.delete(id);
      });
    this.connections.set(id, connection);
    return connection;
  }

  private refreshTimeout(id: string, desktop: Sandbox): Promise<boolean> {
    if (this.boxes.get(id) !== desktop) return Promise.resolve(false);
    const pending = this.renewals.get(id);
    if (pending) return pending;
    const lastTouched = this.lastTouchedAt.get(id) ?? 0;
    if (Date.now() - lastTouched < Math.min(60_000, sandboxIdleMs("e2b") / 2)) {
      return Promise.resolve(true);
    }
    let renewal!: Promise<boolean>;
    renewal = desktop
      .setTimeout(e2bTimeoutMs())
      .then(
        () => {
          if (this.boxes.get(id) !== desktop) {
            throw new Error("computer connection stopped during teardown");
          }
          this.lastTouchedAt.set(id, Date.now());
          getLogger().info("computer.resource", {
            provider: "e2b",
            resource_id: this.resourceId(id),
            action: "kept_alive",
            reason: "active_computer",
          });
          return true;
        },
        async (error: unknown) => {
          // Network failures do not prove the sandbox disappeared or the timeout was renewed.
          if (!isSandboxGoneError(error)) throw error;
          if (this.boxes.get(id) !== desktop) {
            throw new Error("computer connection stopped during teardown");
          }
          // An envd timeout can also mean paused, not destroyed. Confirm through
          // the read-only control plane before allowing callers to drop the ref.
          try {
            const info = await this.sdk.getInfo(id, { apiKey: this.apiKey });
            this.forget(id);
            if (info.state === "paused") throw new ComputerSuspendedError();
            throw new Error("Computer connection needs to be refreshed");
          } catch (statusError) {
            if (!isSandboxGoneError(statusError)) throw statusError;
            this.forget(id);
            return false;
          }
        },
      )
      .finally(() => {
        if (this.renewals.get(id) === renewal) this.renewals.delete(id);
      });
    this.renewals.set(id, renewal);
    return renewal;
  }

  async provision(
    request: {
      botId: string;
      homePath: string;
      providerRef?: string;
      providerKind?: ComputerRef["kind"];
    },
    _context: AdapterContext,
  ): Promise<ComputerRef> {
    _context.signal.throwIfAborted();
    if (request.providerRef && request.providerKind === "e2b") {
      try {
        const state = await this.sdk.getInfo(request.providerRef, { apiKey: this.apiKey });
        if (state.state === "paused") this.forget(request.providerRef);
        _context.signal.throwIfAborted();
        const desktop = await this.box(
          {
            id: request.providerRef,
            providerRef: request.providerRef,
            kind: "e2b",
            botId: request.botId,
          },
          true,
          _context.signal,
        );
        getLogger().info("computer.resource", {
          provider: "e2b",
          resource_id: this.resourceId(desktop.sandboxId),
          action: state.state === "paused" ? "resumed" : "connected",
          reason: computerActivationReason(_context),
        });
        return {
          id: desktop.sandboxId,
          botId: request.botId,
          kind: "e2b",
          providerRef: desktop.sandboxId,
          fresh: false,
          started: state.state === "paused",
        };
      } catch (error) {
        this.boxes.delete(request.providerRef);
        // A transport failure says nothing about the workspace still on the server.
        if (!isSandboxGoneError(error)) throw error;
      }
    }
    _context.signal.throwIfAborted();
    const desktop = await this.sdk.create(
      e2bCreateOptions(request.botId, this.apiKey, _context.signal),
    );
    getLogger().info("computer.resource", {
      provider: "e2b",
      resource_id: this.resourceId(desktop.sandboxId),
      action: "created",
      reason: computerActivationReason(_context),
    });
    this.activeSince.set(desktop.sandboxId, Date.now());
    this.boxes.set(desktop.sandboxId, desktop);
    this.lastTouchedAt.set(desktop.sandboxId, Date.now());
    return {
      id: desktop.sandboxId,
      botId: request.botId,
      kind: "e2b",
      providerRef: desktop.sandboxId,
      fresh: true,
    };
  }

  async prepare(computer: ComputerRef, _context: AdapterContext): Promise<void> {
    const desktop = await this.box(computer);
    if (computer.fresh) await desktop.files.makeDir(E2B_WORKSPACE);
    const result = await this.runSetupCommand(desktop, PREPARE_LINUX_DESKTOP, _context.signal);
    if (result.exitCode !== 0)
      throw new Error(result.stderr || "could not prepare computer desktop tools");
  }

  async *execute(
    computer: ComputerRef,
    request: CommandRequest,
    context: AdapterContext,
  ): AsyncIterable<ProcessEvent> {
    const desktop = await this.box(computer);
    const cmd = sandboxCommandArgv(request).map(shellQuote).join(" ");
    const timeoutMs = boundedSandboxCommandTimeoutMs(request.timeoutMs);
    try {
      const result = await this.withCommandKeepalive(desktop, () =>
        desktop.commands.run(cmd, {
          cwd: e2bCwd(request.cwd),
          envs: request.env,
          signal: context.signal,
          timeoutMs,
        }),
      );
      if (result.stdout) yield { type: "stdout", data: result.stdout };
      if (result.stderr) yield { type: "stderr", data: result.stderr };
      yield { type: "exit", code: result.exitCode ?? 0 };
    } catch (error) {
      if (error instanceof TimeoutError) {
        yield {
          type: "stderr",
          data: `command timed out after ${timeoutMs} ms\n`,
        };
        yield { type: "exit", code: 124 };
        return;
      }
      throw error;
    }
  }

  async connectScreen(
    computer: ComputerRef,
    request: ScreenRequest,
    context: AdapterContext,
  ): Promise<ScreenSession> {
    return this.desktops.connectScreen(computer, request, context);
  }
  async connectTerminal(computer: ComputerRef, request: TerminalRequest, context: AdapterContext) {
    return this.desktops.connectTerminal(computer, request, context);
  }
  async setScreenControl(
    computer: ComputerRef,
    interactive: boolean,
    context: AdapterContext,
    controlToken?: string,
  ): Promise<void> {
    return this.desktops.setScreenControl(computer, interactive, context, controlToken);
  }
  async sendInput(
    computer: ComputerRef,
    input: ComputerInput,
    _lease: ControlLeaseRef,
    context: AdapterContext,
  ): Promise<void> {
    return this.desktops.sendInput(computer, input, context);
  }
  async observe(computer: ComputerRef, context: AdapterContext): Promise<ComputerObservation> {
    return this.desktops.observe(computer, context);
  }
  async act(computer: ComputerRef, request: ComputerActionRequest, context: AdapterContext) {
    return this.desktops.act(computer, request, context);
  }

  async listFiles(
    computer: ComputerRef,
    directory: string,
    context: AdapterContext,
  ): Promise<ComputerFileEntry[]> {
    const desktop = await this.box(computer);
    const relative = normalizeWorkspacePath(directory);
    const entries = await desktop.files.list(workspacePath(E2B_WORKSPACE, relative), {
      signal: context.signal,
    });
    return entries.flatMap((entry) => {
      if (entry.type !== "file" && entry.type !== "dir") return [];
      return [
        {
          path: normalizeWorkspacePath(relative ? `${relative}/${entry.name}` : entry.name),
          kind: entry.type,
          size: entry.size,
          ...(entry.type === "file" && entry.mode & 0o100 ? { executable: true } : {}),
        },
      ];
    });
  }

  async readFile(
    computer: ComputerRef,
    filePath: string,
    context: AdapterContext,
    options?: { maxBytes?: number },
  ) {
    const desktop = await this.box(computer);
    const target = workspacePath(E2B_WORKSPACE, filePath);
    if (options?.maxBytes !== undefined) {
      const info = await desktop.files.getInfo(target, {
        signal: context.signal,
      });
      if (info.size > options.maxBytes) {
        throw new Error(`computer file exceeds ${options.maxBytes} bytes`);
      }
    }
    return desktop.files.read(target, {
      format: "bytes",
      signal: context.signal,
    });
  }

  async writeFile(computer: ComputerRef, file: PortableFile, context: AdapterContext) {
    const desktop = await this.box(computer);
    await writeE2BFiles(desktop, [file], context);
  }

  async *exportWorkspace(
    computer: ComputerRef,
    context: AdapterContext,
  ): AsyncIterable<PortableFile> {
    const desktop = await this.box(computer);
    await this.desktops.stopBrowsers(computer, context);
    yield* walkE2BWorkspace(desktop, "", context);
  }

  async importWorkspace(
    computer: ComputerRef,
    files: AsyncIterable<PortableFile>,
    context: AdapterContext,
  ): Promise<void> {
    const desktop = await this.box(computer);
    await this.desktops.stopBrowsers(computer, context);
    let batch: PortableFile[] = [];
    let batchBytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      await writeE2BFiles(desktop, batch, context);
      batch = [];
      batchBytes = 0;
    };
    for await (const file of files) {
      if (
        batch.length >= 32 ||
        batchBytes + file.content.byteLength > PORTABLE_TRANSFER_BATCH_BYTES
      ) {
        await flush();
      }
      batch.push(file);
      batchBytes += file.content.byteLength;
    }
    await flush();
    // Imported browser profiles remain dormant until their owning bot needs a desktop.
  }

  async snapshot(computer: ComputerRef, _context: AdapterContext) {
    const observation = await this.observe(computer, _context);
    return { id: observation.frameId, createdAt: observation.capturedAt };
  }

  async keepAlive(computer: ComputerRef): Promise<void> {
    // A heartbeat never connects/resumes a sandbox. A demanded operation or a
    // running viewer establishes the handle; timeout renewal only uses that handle.
    const id = computer.providerRef || computer.id;
    const desktop = this.boxes.get(id);
    if (desktop) await this.refreshTimeout(id, desktop);
  }

  async releaseScreen(computer: ComputerRef, context: AdapterContext): Promise<void> {
    return this.desktops.releaseScreen(computer, context);
  }

  async stop(computer: ComputerRef, _context: AdapterContext): Promise<void> {
    const id = computer.providerRef || computer.id;
    const desktop = this.boxes.get(id);
    const observedActiveMs = this.activeSince.has(id)
      ? Date.now() - this.activeSince.get(id)!
      : null;
    this.forget(id);
    try {
      if (desktop) await desktop.pause();
      else await this.sdk.pause(id, { apiKey: this.apiKey });
    } catch (error) {
      if (!isSandboxGoneError(error)) {
        getLogger().warn("computer.resource", {
          provider: "e2b",
          resource_id: this.resourceId(id),
          action: "unable_to_suspend",
          reason: "provider_refused",
        });
        throw error;
      }
    }
    getLogger().info("computer.resource", {
      provider: "e2b",
      resource_id: this.resourceId(id),
      observed_active_ms: observedActiveMs,
      action: "suspended",
      reason: _context.operationId === "computer.sleep" ? "idle" : "explicit_stop",
    });
  }

  async destroy(computer: ComputerRef, _context: AdapterContext): Promise<void> {
    const id = computer.providerRef || computer.id;
    const desktop = this.boxes.get(id);
    this.forget(id);
    // Delete directly by id: connecting a paused sandbox would resume billable compute.
    if (desktop) await desktop.kill();
    else await this.sdk.kill(id, { apiKey: this.apiKey });
    getLogger().info("computer.resource", {
      provider: "e2b",
      resource_id: this.resourceId(id),
      action: "destroyed",
      reason: "lifecycle",
    });
  }

  private resourceId(id: string): string {
    return createHmac("sha256", this.apiKey).update(id).digest("hex").slice(0, 24);
  }

  private forget(id: string): void {
    this.boxes.delete(id);
    this.connections.delete(id);
    this.lastTouchedAt.delete(id);
    this.activeSince.delete(id);
    this.renewals.delete(id);
  }

  private async withCommandKeepalive<T>(desktop: Sandbox, run: () => Promise<T>): Promise<T> {
    // An SDK command can run for longer than idle TTL, including during initial setup.
    const timer = setInterval(
      () => {
        void this.refreshTimeout(desktop.sandboxId, desktop).catch((error) => {
          getLogger().error("sandbox command keepalive", error);
        });
      },
      Math.min(60_000, sandboxIdleMs("e2b") / 2),
    );
    timer.unref?.();
    try {
      return await run();
    } finally {
      clearInterval(timer);
    }
  }

  /** Apply the deployment timeout (SDK default is 60s) and return failed results instead of throwing. */
  private async runSetupCommand(
    desktop: Sandbox,
    command: string,
    signal?: AbortSignal,
  ): Promise<CommandResult> {
    try {
      // E2B's outer login shell can fail its logout hook under `set -e`, even after `exit 0`.
      return await this.withCommandKeepalive(desktop, () =>
        desktop.commands.run(`bash -c ${shellQuote(command)}`, {
          ...(signal ? { signal } : {}),
          timeoutMs: boundedSandboxCommandTimeoutMs(undefined),
        }),
      );
    } catch (error) {
      if (error instanceof TimeoutError) {
        return {
          exitCode: 124,
          stdout: "",
          stderr: error.message,
          error: error.message,
        };
      }
      const result = (error as { result?: CommandResult }).result;
      if (result) return result;
      throw error;
    }
  }
}

async function writeE2BFiles(
  desktop: Sandbox,
  files: readonly PortableFile[],
  context: AdapterContext,
) {
  if (!files.length) return;
  await desktop.files.write(
    files.map((file) => ({
      path: workspacePath(E2B_WORKSPACE, file.path),
      data: toArrayBuffer(file.content),
    })),
    { signal: context.signal },
  );
  const executable = files
    .filter((file) => file.executable)
    .map((file) => shellQuote(workspacePath(E2B_WORKSPACE, file.path)));
  if (executable.length) {
    await desktop.commands.run(`chmod 700 -- ${executable.join(" ")}`, {
      signal: context.signal,
    });
  }
}

async function* walkE2BWorkspace(
  desktop: Sandbox,
  directory: string,
  context: AdapterContext,
): AsyncIterable<PortableFile> {
  const entries = await desktop.files.list(workspacePath(E2B_WORKSPACE, directory), {
    signal: context.signal,
  });
  const files: Array<{ relative: string; mode: number }> = [];
  const directories: string[] = [];
  for (const entry of entries) {
    const relative = normalizeWorkspacePath(directory ? `${directory}/${entry.name}` : entry.name);
    if (shouldSkipPortableWorkspaceFile(relative)) continue;
    if (entry.type === "dir") directories.push(relative);
    else if (entry.type === "file") files.push({ relative, mode: entry.mode });
  }
  for (let index = 0; index < files.length; index += 8) {
    const batch = await Promise.all(
      files.slice(index, index + 8).map(async ({ relative, mode }) => {
        const content = await desktop.files
          .read(workspacePath(E2B_WORKSPACE, relative), {
            format: "bytes",
            signal: context.signal,
          })
          .catch((error) => {
            if (relative.startsWith(".browser-profiles/")) return undefined;
            throw error;
          });
        if (!content) return undefined;
        return { path: relative, content, executable: Boolean(mode & 0o100) };
      }),
    );
    for (const file of batch) {
      if (file) yield file;
    }
  }
  for (const relative of directories) yield* walkE2BWorkspace(desktop, relative, context);
}

function e2bCwd(cwd: string | undefined): string {
  if (
    !cwd ||
    cwd === "." ||
    cwd === "/" ||
    cwd === "/home/rakazo" ||
    cwd === "/home/user" ||
    cwd === E2B_WORKSPACE
  ) {
    return E2B_WORKSPACE;
  }
  const relative = cwd.startsWith(`${E2B_WORKSPACE}/`)
    ? cwd.slice(E2B_WORKSPACE.length + 1)
    : cwd.startsWith("/home/rakazo/")
      ? cwd.slice("/home/rakazo/".length)
      : cwd;
  return workspacePath(E2B_WORKSPACE, relative);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
