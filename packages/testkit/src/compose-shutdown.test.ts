import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const { scripts } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
const stack = ["docker", "compose", "--env-file", ".env", "-f", "infra/compose/docker-compose.yml"];

describe("Compose shutdown safety", () => {
  it("stops the existing stack without removing volumes or chaining deletion", () => {
    expect(scripts["compose:down"]?.trim().split(/\s+/)).toEqual([...stack, "down"]);
  });

  it("reserves volume deletion for the explicit reset command", () => {
    expect(scripts["compose:reset"]?.trim().split(/\s+/)).toEqual([...stack, "down", "-v"]);
  });
});
