import { expect, it, vi } from "vitest";
import { guardAcceptanceNetwork } from "./network.js";

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
