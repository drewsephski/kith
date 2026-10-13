import { createServer } from "node:http";
import { expect, it, vi } from "vitest";
import { guardAcceptanceNetwork } from "./network.js";

it("never follows an allowed endpoint redirect to another destination", async () => {
  let redirectedRequests = 0;
  const destination = createServer((_request, response) => {
    redirectedRequests++;
    response.end("synthetic");
  });
  await new Promise<void>((resolve) => destination.listen(0, "127.0.0.1", resolve));
  const address = destination.address();
  if (!address || typeof address === "string") throw new Error("Test listener unavailable");
  const source = createServer((_request, response) => {
    response.writeHead(302, { location: `http://127.0.0.1:${address.port}/destination` });
    response.end();
  });
  await new Promise<void>((resolve) => source.listen(0, "127.0.0.1", resolve));
  try {
    const origin = source.address();
    if (!origin || typeof origin === "string") throw new Error("Test listener unavailable");
    const url = `http://127.0.0.1:${origin.port}`;
    const guard = guardAcceptanceNetwork({
      modelOrigin: url,
      e2b: false,
      maxRequests: 1,
      deadline: Date.now() + 2000,
    });
    await expect(guard.fetch(new Request(url, { redirect: "follow" }))).rejects.toThrow();
    expect(redirectedRequests).toBe(0);
    expect(guard.requests).toBe(1);
  } finally {
    await Promise.all(
      [source, destination].map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
            server.closeAllConnections();
          }),
      ),
    );
  }
});

it("counts actual HTTP retries and blocks another model or connected account destination", async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("synthetic"));
  const guard = guardAcceptanceNetwork(
    {
      modelOrigin: "https://model.example.test",
      e2b: false,
      maxRequests: 2,
      deadline: Date.now() + 1000,
    },
    transport,
  );
  await guard.fetch("https://model.example.test/v1/chat/completions");
  await guard.fetch("https://model.example.test/v1/chat/completions");
  await expect(guard.fetch("https://model.example.test/v1/chat/completions")).rejects.toThrow(
    "budget",
  );
  await expect(guard.fetch("https://mail.example.test/private")).rejects.toThrow("destination");
  expect(transport).toHaveBeenCalledTimes(2);
  expect(transport).toHaveBeenLastCalledWith(
    "https://model.example.test/v1/chat/completions",
    expect.objectContaining({ redirect: "error" }),
  );
});
it("allows only HTTPS E2B domains and honors the overall runtime deadline", async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("synthetic"));
  const options = {
    modelOrigin: "https://model.example.test",
    e2b: true,
    maxRequests: 2,
    deadline: Date.now() + 1000,
  };
  const guard = guardAcceptanceNetwork(options, transport);
  await guard.fetch("https://api.e2b.dev/sandboxes");
  await guard.fetch("https://synthetic.e2b.app/files");
  await expect(guard.fetch("http://api.e2b.dev/sandboxes")).rejects.toThrow("destination");
  await expect(guard.fetch("https://e2b.app.attacker.test/files")).rejects.toThrow("destination");
  const expired = guardAcceptanceNetwork({ ...options, deadline: Date.now() - 1 }, transport);
  await expect(expired.fetch("https://api.e2b.dev/sandboxes")).rejects.toThrow("runtime");
  expect(guard.requests).toBe(0);
});
