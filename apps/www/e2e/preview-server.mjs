import { preview } from "astro";
import { resolveWwwPort } from "../www-port.mjs";

// The CLI may detach in agent environments; Playwright must own this server.
const server = await preview({
  server: { host: "127.0.0.1", port: resolveWwwPort() },
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => void server.stop().then(() => process.exit(0)));
}
