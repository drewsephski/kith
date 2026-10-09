/** Organize actual documents by their path; never infer facts from their contents. */
export function memoryCategory(
  path: string,
): "preferences" | "people" | "projects" | "goals" | "context" {
  const parts = path.toLowerCase().split(/[/.\-_\s]+/);
  if (parts.some((part) => ["preference", "preferences", "calendar"].includes(part)))
    return "preferences";
  if (parts.some((part) => ["people", "person", "contacts", "relationships"].includes(part)))
    return "people";
  if (parts.some((part) => ["project", "projects"].includes(part))) return "projects";
  if (parts.some((part) => ["goal", "goals"].includes(part))) return "goals";
  return "context";
}
export function memoryTitle(path: string): string {
  const name =
    path
      .split("/")
      .at(-1)
      ?.replace(/\.[^.]+$/, "")
      .replace(/[-_]/g, " ") || path;
  if (name.toLowerCase() === "memory") return "Personal memory";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

import type { MemoryDocument } from "@rakazo/contracts";

/** Legacy starter documents are storage scaffolding, not knowledge about the user. */
export function isPersonalMemory(
  document: Pick<MemoryDocument, "scope" | "path" | "content">,
): boolean {
  const content = document.content.trim();
  if (!content) return false;
  if (document.scope !== "user" || document.path !== "MEMORY.md") return true;
  return ![
    "# Space memory",
    "# Space memory\n\nPreferences and context kept within this space live here.",
  ].includes(content);
}
