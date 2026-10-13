import type { AdapterContext, ComputerRef, SandboxProvider } from "@rakazo/adapter-kit";

/** Observe the existing adapter; do not replace its lifecycle or workspace semantics. */
export function observeSandbox(provider: SandboxProvider, maxStarts: number) {
  const resources = new Map<string, ComputerRef>();
  const counts = { create: 0, resume: 0, prepare: 0, stop: 0, destroy: 0 };
  const commands: Array<{
    operationId: string;
    durationMs: number;
    activeMarker: boolean;
    code: number | null;
  }> = [];
  let accepting = true;
  const sandbox = new Proxy(provider, {
    get(target, key) {
      if (key === "provision")
        return async (...args: Parameters<SandboxProvider["provision"]>) => {
          if (!accepting || counts.create + counts.resume >= maxStarts)
            throw new Error("Acceptance computer startup budget exhausted");
          counts[args[0].providerRef ? "resume" : "create"]++;
          const ref = await target.provision(...args);
          // Track before fallible prepare so failed setup still gets destroyed.
          resources.set(ref.providerRef, ref);
          return ref;
        };
      if (key === "execute")
        return async function* (...args: Parameters<SandboxProvider["execute"]>) {
          const started = performance.now();
          let tail = "";
          let activeMarker = false;
          let code: number | null = null;
          try {
            for await (const event of target.execute(...args)) {
              if (event.type === "stdout") {
                tail += event.data;
                activeMarker ||= tail.includes("kith-active-verified");
                tail = tail.slice(-32);
              }
              if (event.type === "exit") code = event.code;
              yield event;
            }
          } finally {
            commands.push({
              operationId: args[2].operationId,
              durationMs: performance.now() - started,
              activeMarker,
              code,
            });
          }
        };
      if (key === "prepare")
        return async (...args: Parameters<SandboxProvider["prepare"]>) => {
          counts.prepare++;
          return target.prepare(...args);
        };
      if (key === "stop")
        return async (...args: Parameters<SandboxProvider["stop"]>) => {
          counts.stop++;
          return target.stop(...args);
        };
      if (key === "destroy")
        return async (...args: Parameters<SandboxProvider["destroy"]>) => {
          await target.destroy(...args);
          counts.destroy++;
          resources.delete(args[0].providerRef);
        };
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return {
    sandbox,
    counts,
    commands,
    stopScheduling: () => {
      accepting = false;
    },
    async cleanup(context: AdapterContext) {
      accepting = false;
      const results = await Promise.allSettled(
        [...resources.values()].map((ref) => sandbox.destroy(ref, context)),
      );
      if (results.some((result) => result.status === "rejected"))
        throw new Error("Acceptance remote resource cleanup failed");
    },
  };
}
