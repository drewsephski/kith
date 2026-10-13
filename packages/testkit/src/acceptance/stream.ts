import assert from "node:assert/strict";
import type { ProductEvent } from "@rakazo/contracts";

type App = { request(input: string, init: RequestInit): Promise<Response> | Response };
/** Consume the same authenticated SSE endpoint as clients, retaining no response content. */
export async function observeThreadStream(
  app: App,
  cookie: string,
  botId: string,
  threadId: string,
  cursor: number,
  reconnect: boolean,
) {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let failure: unknown;
  let reconnects = 0;
  const firstText = new Map<string, number>();
  const seen = new Set<number>();
  const open = async () => {
    const response = await app.request("/rpc/threads/subscribe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        cookie,
        origin: "http://127.0.0.1:5173",
      },
      body: JSON.stringify({ json: { botId, cursor } }),
      signal: controller.signal,
    });
    assert.ok(response.ok && response.body, "Authenticated stream unavailable");
    reader = response.body.getReader();
    if (controller.signal.aborted) await reader.cancel();
  };
  const work = (async () => {
    try {
      await open();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!controller.signal.aborted) {
        const { value, done } = await reader!.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const data = frame
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("");
          if (!data || data === "[DONE]") continue;
          const event = (JSON.parse(data) as { json?: ProductEvent }).json;
          if (!event || typeof event.seq !== "number") continue;
          assert.equal(event.threadId, threadId, "Foreign conversation event");
          assert.ok(!seen.has(event.seq) && event.seq > cursor, "Duplicate or stale stream event");
          seen.add(event.seq);
          cursor = event.seq;
          const payload = event.payload as { streaming?: boolean; text?: string; delta?: string };
          if (
            event.runId &&
            event.type === "thread.progress" &&
            payload.streaming === true &&
            (payload.text?.trim() || payload.delta?.trim())
          )
            if (!firstText.has(event.runId)) firstText.set(event.runId, Date.now());
        }
        if (reconnect && firstText.size && reconnects === 0) {
          controller.signal.throwIfAborted();
          await reader!.cancel();
          reconnects++;
          buffer = "";
          await open();
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) failure = error;
    }
  })();
  return {
    firstText,
    get reconnects() {
      return reconnects;
    },
    async close() {
      controller.abort();
      await reader?.cancel();
      await work;
      if (failure) throw failure;
    },
  };
}
