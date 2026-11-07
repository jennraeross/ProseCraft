import { describe, expect, it } from "vitest";
import {
  STARTER_MODULES, addCustomFolder, addModule, allBlueprintKeys, blueprintHasModule, buildFromBlueprint,
  filterBlueprint, loadCustomStarters, moduleFolderKey, modulesOf, normalizeCustomStarters, removeModule,
  saveCustomStarters, starterBlueprint, type CustomStarter
} from "./starters";

function ids() { let n = 0; return () => `id-${n++}`; }

const MODULE_IDS = [
  "characters", "places", "items", "species", "cultures", "religions", "languages", "magic-and-technology",
  "organisations", "maps", "calendar", "timeline", "relationships", "encyclopedia", "plot", "research"
];

describe("starter modules", () => {
  it("are well formed and cover the offered breadth", () => {
    const moduleIds = STARTER_MODULES.map((entry) => entry.id);
    expect(moduleIds.length).toBeGreaterThanOrEqual(16);
    expect(new Set(moduleIds).size).toBe(moduleIds.length);
    for (const id of MODULE_IDS) expect(moduleIds).toContain(id);
    for (const entry of STARTER_MODULES) {
      expect(entry.label.trim()).not.toBe("");
      expect(entry.description.trim()).not.toBe("");
      expect(entry.folder.trim()).not.toBe("");
      expect(entry.pages.length).toBeGreaterThan(0);
      expect(entry.pages.length).toBeLessThanOrEqual(3);
      for (const page of entry.pages) {
        const headings = page.html.match(/<h2>/g) ?? [];
        const paragraphs = page.html.match(/<p>/g) ?? [];
        expect(page.title.trim()).not.toBe("");
        expect(headings.length).toBeGreaterThanOrEqual(4);
        expect(headings.length).toBeLessThanOrEqual(6);
        expect(paragraphs.length).toBeGreaterThanOrEqual(headings.length);
        expect(page.html.toLowerCase()).not.toContain("<script");
      }
    }
  });

  it("adds and removes modules without mutating the blueprint", () => {
    const empty = starterBlueprint("blank");
    const added = addModule(empty, "characters");
    expect(empty.folders).toHaveLength(0);
    expect(added.folders.map((folder) => folder.key)).toEqual(["module:characters"]);
    expect(blueprintHasModule(added, "characters")).toBe(true);
    expect(blueprintHasModule(empty, "characters")).toBe(false);
    expect(addModule(added, "characters")).toEqual(added);
    expect(modulesOf(added)).toEqual(["characters"]);
    const removed = removeModule(added, "characters");
    expect(removed.folders).toHaveLength(0);
    expect(added.folders).toHaveLength(1);
    expect(removeModule(removed, "characters")).toEqual(removed);
  });

  it("builds the folder and page keys a module promises", () => {
    const added = addModule({ folders: [] }, "relationships");
    const entry = STARTER_MODULES.find((item) => item.id === "relationships");
    expect(added.folders).toHaveLength(1);
    expect(added.folders[0].key).toBe(moduleFolderKey("relationships"));
    expect(added.folders[0].name).toBe(entry?.folder);
    expect(added.folders[0].pages.map((page) => page.key))
      .toEqual(entry?.pages.map((_, index) => `module:relationships/${index}`));
  });

  it("ignores unknown module ids", () => {
    const blueprint = starterBlueprint("blank");
    expect(addModule(blueprint, "not-a-module")).toEqual(blueprint);
    expect(removeModule(blueprint, "not-a-module")).toEqual(blueprint);
    expect(blueprintHasModule(blueprint, "not-a-module")).toBe(false);
    expect(modulesOf(blueprint)).toEqual([]);
  });

  it("keeps module keys unique next to preset and custom keys", () => {
    const blueprint = addCustomFolder(starterBlueprint("blank"), "My notes");
    const withAll = MODULE_IDS.reduce((current, id) => addModule(current, id), blueprint);
    const keys = [...allBlueprintKeys(withAll)];
    expect(new Set(keys).size).toBe(keys.length);
    expect(withAll.folders.map((folder) => folder.key)).toEqual(["folder:c0", ...MODULE_IDS.map(moduleFolderKey)]);
    expect(modulesOf(withAll)).toEqual(MODULE_IDS);
  });

  it("survives filtering by key", () => {
    const blueprint = addModule(addModule(starterBlueprint("blank"), "maps"), "timeline");
    const filtered = filterBlueprint(blueprint, new Set(["module:timeline/0"]));
    expect(filtered.folders.map((folder) => folder.key)).toEqual(["module:timeline"]);
    expect(filtered.folders[0].pages.map((page) => page.key)).toEqual(["module:timeline/0"]);
  });

  it("builds wiki documents for each module folder", () => {
    const blueprint = addModule(addModule(starterBlueprint("blank"), "characters"), "timeline");
    const built = buildFromBlueprint(blueprint, ids());
    expect(built.folders).toHaveLength(2);
    const folderIds = new Set(built.folders.map((folder) => folder.id));
    expect(built.documents.every((doc) => doc.space === "Wiki" && doc.folderId && folderIds.has(doc.folderId))).toBe(true);
    const timeline = STARTER_MODULES.find((entry) => entry.id === "timeline");
    const timelineDocs = built.documents.filter((doc) => doc.folderId === built.folders[1].id);
    expect(timelineDocs.map((doc) => doc.title)).toEqual(timeline?.pages.map((page) => page.title));
  });

  it("keeps modules through a save and load round trip", () => {
    const blueprint = addModule(addModule(starterBlueprint("blank"), "characters"), "religions");
    const starter: CustomStarter = { id: "mine", name: "Mine", blueprint };
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
    saveCustomStarters(storage, [starter]);
    const loaded = loadCustomStarters(storage)[0];
    expect(modulesOf(loaded.blueprint)).toEqual(["characters", "religions"]);
    expect(blueprintHasModule(loaded.blueprint, "religions")).toBe(true);
    const keys = [...allBlueprintKeys(loaded.blueprint)];
    expect(new Set(keys).size).toBe(keys.length);
    const religions = loaded.blueprint.folders[1];
    expect(religions.key).toBe(moduleFolderKey("religions"));
    expect(religions.pages.map((page) => page.key))
      .toEqual(religions.pages.map((_, index) => `module:religions/${index}`));
  });

  it("drops unknown module keys and duplicate module folders", () => {
    const [unknown] = normalizeCustomStarters([
      { id: "x", name: "X", blueprint: { folders: [{ key: "module:unknown", name: "N", pages: [{ key: "module:unknown/0", title: "P", html: "<p>ok</p>" }] }] } }
    ]);
    expect(unknown.blueprint.folders[0].key).toBe("folder:0");
    expect(unknown.blueprint.folders[0].pages[0].key).toBe("page:0.0");
    const [duplicate] = normalizeCustomStarters([
      { id: "y", name: "Y", blueprint: { folders: [
        { key: "module:maps", name: "Maps", pages: [] },
        { key: "module:maps", name: "Maps again", pages: [] }
      ] } }
    ]);
    expect(duplicate.blueprint.folders.map((folder) => folder.key)).toEqual(["module:maps", "folder:1"]);
  });

  it("reflects each preset in the module toggles", () => {
    expect(modulesOf(starterBlueprint("blank"))).toEqual([]);
    expect(modulesOf(starterBlueprint("fantasy"))).toEqual(
      ["characters", "places", "magic-and-technology", "cultures", "species", "timeline", "items"]
    );
    expect(modulesOf(starterBlueprint("scifi"))).toEqual(
      ["characters", "places", "magic-and-technology", "organisations", "species", "timeline"]
    );
    expect(modulesOf(starterBlueprint("crime"))).toEqual(["characters", "timeline"]);
    expect(modulesOf(starterBlueprint("historical"))).toEqual(["characters", "places", "research", "timeline"]);
    expect(modulesOf(starterBlueprint("romance"))).toEqual(["characters", "relationships", "places"]);
    expect(modulesOf(starterBlueprint("nonfiction"))).toEqual(["research", "encyclopedia"]);
    expect(modulesOf(starterBlueprint("thriller"))).toEqual(
      ["characters", "places", "organisations", "timeline", "research"]
    );
  });

  it("keeps the preset's own folder names and unique keys", () => {
    for (const id of ["fantasy", "scifi", "crime", "historical", "romance", "nonfiction", "thriller"] as const) {
      const blueprint = starterBlueprint(id);
      const keys = [...allBlueprintKeys(blueprint)];
      expect(new Set(keys).size).toBe(keys.length);
    }
    const fantasy = starterBlueprint("fantasy");
    expect(fantasy.folders.map((folder) => folder.name)).toEqual(
      ["Characters", "Places", "Magic", "Cultures", "Creatures", "History & Timeline", "Items"]
    );
    expect(blueprintHasModule(fantasy, "characters")).toBe(true);
    expect(blueprintHasModule(fantasy, "religions")).toBe(false);
  });

  it("toggles a preset module off and on without duplicating it", () => {
    const fantasy = starterBlueprint("fantasy");
    // Toggling on while present is a no-op, so the dialog cannot duplicate the folder.
    expect(addModule(fantasy, "characters")).toEqual(fantasy);
    const removed = removeModule(fantasy, "characters");
    expect(removed.folders).toHaveLength(fantasy.folders.length - 1);
    expect(removed.folders.some((folder) => folder.name === "Characters")).toBe(false);
    expect(blueprintHasModule(removed, "characters")).toBe(false);
    const restored = addModule(removed, "characters");
    expect(restored.folders).toHaveLength(fantasy.folders.length);
    const keys = [...allBlueprintKeys(restored)];
    expect(new Set(keys).size).toBe(keys.length);
    expect(blueprintHasModule(restored, "characters")).toBe(true);
  });

  it("leaves preset folders without a module alone when adding nearby modules", () => {
    const crime = starterBlueprint("crime");
    expect(blueprintHasModule(crime, "plot")).toBe(false);
    const withPlot = addModule(crime, "plot");
    expect(withPlot.folders).toHaveLength(crime.folders.length + 1);
    expect(withPlot.folders.map((folder) => folder.name)).toContain("Suspects");
    expect(withPlot.folders.map((folder) => folder.name)).toContain("Plot");
    const keys = [...allBlueprintKeys(withPlot)];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
