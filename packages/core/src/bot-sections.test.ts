import { describe, expect, it } from "vitest";
import { groupBotsForSidebar, nestRosterByParent, reorderBotTo } from "./bot-sections.js";

const sections = [
  { id: "work", name: "Work" },
  { id: "home", name: "Home" },
];

describe("groupBotsForSidebar", () => {
  it("keeps an unassigned child with its pinned parent without pinning the child", () => {
    const parent = {
      id: "assistant",
      pinned: true,
      sectionId: null,
      parentBotId: null,
    };
    const child = {
      id: "child",
      pinned: false,
      sectionId: null,
      parentBotId: parent.id,
    };
    const [group] = groupBotsForSidebar([parent, child], []);
    expect(group?.bots).toEqual([parent, child]);
    expect(nestRosterByParent(group?.bots ?? []).map((row) => row.depth)).toEqual([0, 1]);
    expect(child.pinned).toBe(false);
    expect(
      groupBotsForSidebar([parent, { ...child, sectionId: "work" }], sections).map((group) =>
        group.bots.map((bot) => bot.id),
      ),
    ).toEqual([["assistant"], ["child"]]);
  });
  it("keeps parent cycles and missing parents reachable", () => {
    const bots = [
      { id: "a", parentBotId: "b", pinned: false, sectionId: null },
      { id: "b", parentBotId: "a", pinned: false, sectionId: null },
    ];
    expect(groupBotsForSidebar(bots, []).flatMap((group) => group.bots)).toEqual(bots);
  });
  it("keeps pinned bots in one top-level group without duplicating them", () => {
    const groups = groupBotsForSidebar(
      [
        { id: "pinned", pinned: true, sectionId: "home" },
        { id: "work", pinned: false, sectionId: "work" },
        { id: "home", pinned: false, sectionId: "home" },
        { id: "loose", pinned: false, sectionId: null },
      ],
      sections,
    );

    expect(groups.map((group) => [group.title, group.bots.map((bot) => bot.id)])).toEqual([
      ["Pinned", ["pinned"]],
      ["Work", ["work"]],
      ["Home", ["home"]],
      ["Unassigned", ["loose"]],
    ]);
  });

  it("treats bots pointing at an unavailable section as unassigned", () => {
    const groups = groupBotsForSidebar(
      [{ id: "orphan", pinned: false, sectionId: "missing" }],
      sections,
    );
    expect(groups).toEqual([
      {
        key: "unassigned",
        title: "Unassigned",
        bots: [{ id: "orphan", pinned: false, sectionId: "missing" }],
      },
    ]);
  });

  it("does not add a heading before sections or pins exist", () => {
    const groups = groupBotsForSidebar([{ id: "first", pinned: false, sectionId: null }], []);
    expect(groups[0]?.title).toBeNull();
  });
});

describe("reorderBotTo", () => {
  const bots = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("moves a bot to the target bot's position in either direction", () => {
    expect(reorderBotTo(bots, "a", "c").map((bot) => bot.id)).toEqual(["b", "c", "a"]);
    expect(reorderBotTo(bots, "c", "a").map((bot) => bot.id)).toEqual(["c", "a", "b"]);
  });

  it("leaves the list alone when either bot is missing or unchanged", () => {
    expect(reorderBotTo(bots, "a", "missing")).toBe(bots);
    expect(reorderBotTo(bots, "a", "a")).toBe(bots);
  });
});

describe("nestRosterByParent", () => {
  it("nests children under parents that appear in the same list", () => {
    const rows = nestRosterByParent([
      { id: "chief", parentBotId: null },
      { id: "lead", parentBotId: "chief" },
      { id: "helper", parentBotId: "lead" },
      { id: "peer", parentBotId: null },
    ]);
    expect(rows.map((row) => [row.item.id, row.depth, row.hasChildren])).toEqual([
      ["chief", 0, true],
      ["lead", 1, true],
      ["helper", 2, false],
      ["peer", 0, false],
    ]);
    expect(rows.map((row) => row.parentId)).toEqual([null, "chief", "lead", null]);
  });

  it("keeps orphans as roots when the parent is not in the list", () => {
    const rows = nestRosterByParent([{ id: "helper", parentBotId: "missing" }]);
    expect(rows).toEqual([
      {
        item: { id: "helper", parentBotId: "missing" },
        depth: 0,
        hasChildren: false,
        parentId: null,
      },
    ]);
  });

  it("hides all descendants when a parent is collapsed", () => {
    const rows = nestRosterByParent(
      [
        { id: "chief", parentBotId: null },
        { id: "lead", parentBotId: "chief" },
        { id: "helper", parentBotId: "lead" },
      ],
      new Set(["chief"]),
    );
    expect(rows.map((row) => row.item.id)).toEqual(["chief"]);
    expect(rows[0]?.hasChildren).toBe(true);
  });

  it("preserves sibling order from the source list", () => {
    const rows = nestRosterByParent([
      { id: "chief", parentBotId: null },
      { id: "beta", parentBotId: "chief" },
      { id: "alpha", parentBotId: "chief" },
    ]);
    expect(rows.map((row) => row.item.id)).toEqual(["chief", "beta", "alpha"]);
  });

  it("breaks parent cycles without dropping the items", () => {
    const rows = nestRosterByParent([
      { id: "a", parentBotId: "b" },
      { id: "b", parentBotId: "a" },
    ]);
    expect(rows.map((row) => row.item.id).sort()).toEqual(["a", "b"]);
  });
});
