import { describe, expect, it } from "vitest";
import { connectedAppServices } from "./app-connection.js";
import { FOR_YOU_SUGGESTIONS } from "./for-you.js";
import {
  availableForYouSuggestions,
  connectedForYouSuggestions,
  forYouPrompt,
} from "./for-you-work.js";

describe("For you connected context", () => {
  it("selects featured tasks for confirmed services", () => {
    expect(connectedForYouSuggestions(["googlemail"])).toEqual(["important-replies"]);
    expect(connectedForYouSuggestions(["github", "googlecalendar"])).toEqual([
      "meeting-brief",
      "pull-requests",
    ]);
    expect(connectedForYouSuggestions([])).toEqual([]);
  });
  it("keeps conversational tasks while excluding unconnected service tasks", () => {
    const ids = (services: string[]) => availableForYouSuggestions(services).map(({ id }) => id);
    expect(ids([])).toContain("weekly-plan");
    expect(ids([])).not.toContain("important-replies");
    expect(ids([])).not.toContain("pull-requests");
    expect(ids(["gmail"])).toEqual(
      expect.arrayContaining([
        "important-replies",
        "follow-ups",
        "outreach-tracker",
        "receipts",
        "lead-replies",
      ]),
    );
    expect(ids(["gmail"])).not.toContain("meeting-brief");
    expect(ids(["GitHub"])).toEqual(expect.arrayContaining(["pull-requests", "build-digest"]));
    expect(ids(["GitHub"])).not.toContain("receipts");
    for (const slug of ["outlook", "microsoft_outlook", "outlook_mail", "googlemail"])
      expect(ids([slug])).toContain("important-replies");
    for (const slug of ["googlecalendar", "outlook_calendar", "microsoft_calendar"])
      expect(ids([slug])).toContain("meeting-brief");
  });
  it("grounds service prompts in connected matching accounts without using revoked or unrelated accounts", () => {
    const services = connectedAppServices(
      [
        {
          id: "mail-one",
          connectorId: "composio",
          provider: "gmail",
          displayName: "Work",
          status: "connected",
          capabilities: [],
          createdAt: "2026-10-10T00:00:00Z",
        },
        {
          id: "mail-two",
          connectorId: "composio",
          provider: "outlook",
          displayName: "Personal",
          status: "connected",
          capabilities: [],
          createdAt: "2026-10-10T00:00:00Z",
        },
        {
          id: "revoked",
          connectorId: "composio",
          provider: "gmail",
          displayName: "Old",
          status: "revoked",
          capabilities: [],
          createdAt: "2026-10-10T00:00:00Z",
        },
        {
          id: "github",
          connectorId: "composio",
          provider: "github",
          displayName: "Repos",
          status: "connected",
          capabilities: [],
          createdAt: "2026-10-10T00:00:00Z",
        },
      ],
      [],
    );
    const suggestion = FOR_YOU_SUGGESTIONS.find(({ id }) => id === "important-replies")!;
    const prompt = forYouPrompt(suggestion, services);
    expect(prompt).toContain('"connectionId":"mail-one"');
    expect(prompt).toContain('"connectionId":"mail-two"');
    expect(prompt).not.toContain('"connectionId":"revoked"');
    expect(prompt).not.toContain('"connectionId":"github"');
    expect(forYouPrompt(suggestion, [])).toBe(suggestion.prompt);
    expect(
      forYouPrompt(FOR_YOU_SUGGESTIONS.find(({ id }) => id === "weekly-plan")!, services),
    ).toBe(FOR_YOU_SUGGESTIONS.find(({ id }) => id === "weekly-plan")!.prompt);
  });
});
