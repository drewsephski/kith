import { describe, expect, it } from "vitest";
import { isPersonalMemory, memoryCategory, memoryTitle } from "./personal-memory";

describe("personal memory organization", () => {
  it("does not present default storage scaffolding as remembered personal knowledge", () => {
    const starter = {
      scope: "user" as const,
      path: "MEMORY.md",
      content: "# Space memory\n\nPreferences and context kept within this space live here.\n",
    };
    expect(isPersonalMemory(starter)).toBe(false);
    expect(
      isPersonalMemory({ ...starter, content: "# Space memory\n\nI prefer morning meetings." }),
    ).toBe(true);
    expect(isPersonalMemory({ ...starter, content: "" })).toBe(false);
  });
  it.each([
    ["preferences/meeting-times.md", "preferences"],
    ["people/jamie.md", "people"],
    ["projects/travel.md", "projects"],
    ["goals/learning.md", "goals"],
    ["MEMORY.md", "context"],
    ["notes/a-personal-projector.md", "context"],
  ])("categorizes %s without interpreting stored facts", (path, expected) => {
    expect(memoryCategory(path)).toBe(expected);
  });
  it("keeps the actual document's name readable", () => {
    expect(memoryTitle("preferences/meeting-times.md")).toBe("Meeting times");
    expect(memoryTitle("context.json")).toBe("Context");
  });
});
