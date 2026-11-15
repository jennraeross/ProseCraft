import { describe, expect, it } from "vitest";
import { STARTERS } from "./starters";
import {
  addCustomFolder, addCustomPage, allBlueprintKeys, buildFromBlueprint, filterBlueprint,
  loadCustomStarters, normalizeCustomStarters, removeCustomFolder, removeCustomPage,
  renameCustomPage, saveCustomStarters, starterBlueprint, type CustomStarter
} from "./starters";

function ids() { let n = 0; return () => `id-${n++}`; }

describe("blueprint helpers", () => {
  const blueprint = starterBlueprint("thriller");

  it("thriller is a real preset with unique keys", () => {
    const keys = [...allBlueprintKeys(blueprint)];
    expect(blueprint.folders.length).toBeGreaterThan(3);
    expect(keys.length).toBe(new Set(keys).size);
    expect(STARTERS.some((s) => s.id === "thriller")).toBe(true);
  });

  it("filterBlueprint keeps selected pages, selected empty folders, drops the rest", () => {
    const first = blueprint.folders[0];
    const keep = new Set([first.pages[0].key, blueprint.folders[1].key]);
    expect(blueprint.folders[1].pages.length).toBeGreaterThan(0);
    const result = filterBlueprint(blueprint, keep);
    expect(result.folders.map((f) => f.key)).toEqual([first.key, blueprint.folders[1].key]);
    expect(result.folders[0].pages).toHaveLength(1);
    expect(result.folders[1].pages).toHaveLength(0);
    expect(blueprint.folders[1].pages.length).toBeGreaterThan(0);
  });

  it("buildFromBlueprint links pages to their folder", () => {
    const built = buildFromBlueprint(filterBlueprint(blueprint, allBlueprintKeys(blueprint)), ids());
    const folderIds = new Set(built.folders.map((f) => f.id));
    expect(built.documents.every((d) => d.space === "Wiki" && d.folderId && folderIds.has(d.folderId))).toBe(true);
  });

  it("custom folder and page helpers are immutable and consistent", () => {
    const withFolder = addCustomFolder({ folders: [] }, "Magic");
    const folderKey = withFolder.folders[0].key;
    const withPage = addCustomPage(withFolder, folderKey, "Rules");
    expect(withPage.folders[0].pages[0].title).toBe("Rules");
    expect(withFolder.folders[0].pages).toHaveLength(0);
    const pageKey = withPage.folders[0].pages[0].key;
    expect(renameCustomPage(withPage, pageKey, "Costs").folders[0].pages[0].title).toBe("Costs");
    expect(removeCustomPage(withPage, pageKey).folders[0].pages).toHaveLength(0);
    expect(removeCustomFolder(withPage, folderKey).folders).toHaveLength(0);
  });
});

describe("custom templates storage", () => {
  const sample: CustomStarter = { id: "c1", name: "Mine", blueprint: addCustomPage(addCustomFolder({ folders: [] }, "Places"), "folder:c0", "Town") };

  it("round-trips through an injected storage", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    saveCustomStarters(storage, [sample]);
    expect(loadCustomStarters(storage)).toEqual(normalizeCustomStarters([sample]));
    expect(loadCustomStarters(storage)[0].blueprint.folders[0].pages[0].title).toBe("Town");
  });

  it("survives garbage and caps sizes", () => {
    expect(loadCustomStarters({ getItem: () => "not json{" })).toEqual([]);
    expect(normalizeCustomStarters({ no: "array" })).toEqual([]);
    const many = Array.from({ length: 50 }, (_, i) => ({ ...sample, id: `c${i}`, name: `T${i}` }));
    expect(normalizeCustomStarters(many).length).toBeLessThanOrEqual(20);
    const hostile = [{ id: "x", name: "N", blueprint: { folders: [{ key: "folder:a", name: "A", pages: [{ key: "page:a/1", title: "P", html: "<p>ok</p><script>alert(1)</script>" }] }] } }];
    expect(JSON.stringify(normalizeCustomStarters(hostile))).not.toContain("<script");
  });
});
