import type { AdapterContext } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { ExecutionQuotaError, executionLimit, Prisma } from "@rakazo/db";
import { executionProfile } from "./execution-profile.js";

/** Preparation hints only. Textual intent never grants computer authority. */
export type ComputerIntent =
  | "conversation"
  | "connected_tools"
  | "computer_candidate"
  | "uncertain";

export const COMPUTER_TOOL_NAMES: ReadonlySet<string> = new Set([
  "computer_observe",
  "computer_act",
  "browser_navigate",
  "browser_snapshot",
  "browser_act",
  "list_files",
  "read_file",
  "write_file",
  "attach_file",
  "shell",
  "open_path",
  "launch_app",
  "request_takeover",
  "render_plot",
]);

export function computerIntent(
  input: Parameters<typeof executionProfile>[0] & {
    computerTask?: boolean;
    connectedSources?: readonly string[];
  },
): ComputerIntent {
  if (input.computerTask || input.blocks?.some((block) => block.kind === "file"))
    return "computer_candidate";
  if (executionProfile(input) === "conversation") return "conversation";
  // Known connections improve discovery; mentions alone never start a machine.
  if (
    input.connectedSources?.some(
      (source) => source.length > 0 && input.prompt.toLowerCase().includes(source.toLowerCase()),
    )
  )
    return "connected_tools";
  return "uncertain";
}

/** Called after the existing availability, argument, permission and approval gates. */
export function toolNeedsComputer(name: string, available: boolean): boolean {
  return available && COMPUTER_TOOL_NAMES.has(name);
}

export const COMPUTER_DEMAND_GUIDANCE =
  "Answer questions directly and use memory/history tools for saved context. Prefer available connected-app APIs for connected services, and web_search or HTTP/API tools for research they can complete directly. Discover connected tools before using a browser for Gmail, Calendar, GitHub or similar services. Use computer tools when the task actually needs a live browser/GUI, shell, workspace files or human computer input. Mentioning a computer, browser or file is not a reason to start one. If the required action is ambiguous, clarify or continue without a computer. Never claim a tool is connected or an action succeeded without its confirmed result.";

export function computerActivationReason(context: AdapterContext): string {
  if (context.runId) return "computer_tool";
  if (context.operationId.includes("skills")) return "teaching";
  if (context.operationId.includes("takeover")) return "takeover";
  if (context.operationId === "boot" || context.operationId === "computer.boot")
    return "manual_start";
  return "recovery";
}

/** Optional fleet fuse, shared across manual, agent, teaching and recovery starts. */
export async function claimComputerActivation(
  prisma: PrismaClient,
  input: {
    userId: string;
    computerId: string;
    kind: string;
    where: Prisma.ComputerWhereInput;
    data: Prisma.ComputerUpdateManyMutationInput;
  },
): Promise<{ count: number }> {
  const limit = executionLimit("SANDBOX_MAX_ACTIVE_COMPUTERS_PER_USER", 1);
  if (limit === 0 || input.kind === "desktop")
    return prisma.computer.updateMany({ where: input.where, data: input.data });
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.userId}, 2))::text AS lock`,
    );
    const active = await tx.computer.count({
      where: {
        userId: input.userId,
        id: { not: input.computerId },
        kind: { not: "desktop" },
        state: { in: ["running", "booting", "suspending"] },
      },
    });
    if (active >= limit) {
      if (process.env.MODEL_EXECUTION_MODE === "managed")
        throw new ExecutionQuotaError("Computer limit reached. Stop another computer, then retry.");
      return { count: 0 };
    }
    return tx.computer.updateMany({ where: input.where, data: input.data });
  });
}
