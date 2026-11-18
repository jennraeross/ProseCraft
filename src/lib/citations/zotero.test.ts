import { describe, expect, it, vi } from "vitest";
import { mergeImportedCitations } from "./library";
import type { CitationProvider } from "./provider";
import {
  buildZoteroSearchPath,
  classifyZoteroError,
  classifyZoteroHttpError,
  extractZoteroKey,
  mapZoteroCslJson,
  ZoteroError,
  ZoteroLocal,
  ZOTERO_BBT_CAYW_PATH,
  ZOTERO_PING_PATH
} from "./zotero";

const ZOTERO_CSLJSON_FIXTURE = JSON.stringify([
  {
    id: "http://zotero.org/users/local/0/items/K8M9P2Q1",
    type: "book",
    title: "Strukturwandel der Öffentlichkeit",
    author: [{ family: "Habermas", given: "Jürgen" }],
    issued: { "date-parts": [[1962]] },
    publisher: "Luchterhand",
    "publisher-place": "Neuwied",
    ISBN: "978-3-518-28491-9"
  },
  {
    id: "http://zotero.org/users/local/0/items/R4T7W1X9",
    type: "article-journal",
    "citation-key": "rosa2016resonanz",
    title: "Resonanz als Grundbegriff",
    author: [{ family: "Rosa", given: "Hartmut" }],
    "container-title": "Soziologische Revue",
    volume: "39",
    issue: "4",
    page: "501-515",
    issued: { "date-parts": [[2016]] },
    DOI: "10.1515/srsr-2016-0068"
  },
  {
    id: "http://zotero.org/users/local/0/items/ATT00001",
    itemType: "attachment",
    title: "Full Text PDF"
  }
]);

const ZOTERO_403_BODY_FIXTURE = "Local API is not enabled";

const ZOTERO_BBT_CAYW_FIXTURE = JSON.stringify([
  {
    id: 42,
    citationKey: "arendt1958",
    citekey: "arendt1958",
    item: {
      id: "http://zotero.org/users/0/items/Z9Y8X7W6",
      type: "book",
      title: "The Human Condition",
      author: [{ family: "Arendt", given: "Hannah" }],
      issued: { "date-parts": [[1958]] },
      publisher: "University of Chicago Press"
    }
  }
]);

describe("Zotero mapping helpers", () => {
  it("extracts Zotero keys from URIs and raw key fields", () => {
    expect(extractZoteroKey("http://zotero.org/users/local/0/items/K8M9P2Q1")).toBe("K8M9P2Q1");
    expect(extractZoteroKey("http://zotero.org/users/0/items/AB12CD34?format=csljson")).toBe("AB12CD34");
    expect(extractZoteroKey("http://zotero.org/users/0/items/123", "EXPLICIT9")).toBe("EXPLICIT9");
    expect(extractZoteroKey("smith2020")).toBe("smith2020");
  });

  it("maps a recorded Zotero 7 csljson response into CslItem[]", () => {
    const items = mapZoteroCslJson(ZOTERO_CSLJSON_FIXTURE);
    expect(items).toHaveLength(2);

    expect(items[0]).toMatchObject({
      id: "K8M9P2Q1",
      type: "book",
      title: "Strukturwandel der Öffentlichkeit",
      author: [{ family: "Habermas", given: "Jürgen" }],
      issued: { "date-parts": [[1962]] },
      publisher: "Luchterhand",
      "publisher-place": "Neuwied",
      ISBN: "978-3-518-28491-9",
      provider: "zotero"
    });

    expect(items[1]).toMatchObject({
      id: "R4T7W1X9",
      type: "article-journal",
      citeKey: "rosa2016resonanz",
      title: "Resonanz als Grundbegriff",
      "container-title": "Soziologische Revue",
      volume: "39",
      issue: "4",
      page: "501-515",
      DOI: "10.1515/srsr-2016-0068",
      provider: "zotero"
    });
  });

  it("maps wrapped { items: [...] } payloads and rejects malformed JSON", () => {
    const wrapped = JSON.stringify({ items: JSON.parse(ZOTERO_CSLJSON_FIXTURE) });
    expect(mapZoteroCslJson(wrapped)).toHaveLength(2);
    expect(() => mapZoteroCslJson("{not json")).toThrowError(ZoteroError);
  });

  it("maps an item type named like an Object member to document", () => {
    const items = mapZoteroCslJson(JSON.stringify([{ itemType: "constructor", title: "Z", key: "ABCD1234" }]));
    expect(items.map((item) => item.type)).toEqual(["document"]);
  });

  it("keeps the Zotero key as id when copying into project citations if unique", () => {
    const [first, second] = mapZoteroCslJson(ZOTERO_CSLJSON_FIXTURE);
    const added = mergeImportedCitations([], [first]);
    expect(added.items[0].id).toBe("K8M9P2Q1");

    const collision = mergeImportedCitations(added.items, [first, second]);
    expect(collision.items.map((item) => item.id)).toEqual(["K8M9P2Q1", "K8M9P2Q1-2", "R4T7W1X9"]);
  });

  it("builds URL-encoded Zotero 7 local search paths", () => {
    expect(buildZoteroSearchPath("Hannah Arendt")).toBe(
      "/api/users/0/items?q=Hannah%20Arendt&format=csljson&limit=25"
    );
  });
});

describe("Zotero error-state helpers", () => {
  it("explains the Zotero setting on HTTP 403 and recorded 403 body", () => {
    const fromHttp = classifyZoteroHttpError(403, ZOTERO_403_BODY_FIXTURE);
    expect(fromHttp.code).toBe("forbidden");
    expect(fromHttp.message).toContain(
      "Allow other applications on this computer to communicate with Zotero"
    );
    expect(fromHttp.detail).toBe(ZOTERO_403_BODY_FIXTURE);

    const fromCommandError = classifyZoteroError(`HTTP 403: ${ZOTERO_403_BODY_FIXTURE}`);
    expect(fromCommandError.code).toBe("forbidden");
    expect(fromCommandError.message).toContain(
      "Allow other applications on this computer to communicate with Zotero"
    );

    const fromRawBody = classifyZoteroError(ZOTERO_403_BODY_FIXTURE);
    expect(fromRawBody.code).toBe("forbidden");
  });

  it("classifies Zotero not running and timeout errors", () => {
    const notRunning = classifyZoteroError(
      "Zotero is not running (connection refused on 127.0.0.1:23119)."
    );
    expect(notRunning.code).toBe("not-running");
    expect(notRunning.message).toContain("Zotero is not running");

    const timedOut = classifyZoteroError("Zotero request timed out after 5s.");
    expect(timedOut.code).toBe("timeout");
    expect(timedOut.message).toContain("timed out");
  });
});

describe("ZoteroLocal provider", () => {
  it("satisfies CitationProvider and pings /connector/ping", async () => {
    const transport = vi.fn(async (path: string) => {
      if (path === ZOTERO_PING_PATH) return '{"prefs":{"automaticSnapshots":true}}';
      throw new Error(`Unexpected path: ${path}`);
    });

    const provider: CitationProvider = new ZoteroLocal(transport);
    expect(provider.id).toBe("zotero");
    expect(await provider.available()).toBe(true);
    expect(transport).toHaveBeenCalledWith("/connector/ping");
  });

  it("returns false from available() and reports not-running when Zotero is closed", async () => {
    const transport = vi.fn(async () => {
      throw new Error("Zotero is not running (connection refused on 127.0.0.1:23119).");
    });

    const zotero = new ZoteroLocal(transport);
    expect(await zotero.available()).toBe(false);
    const status = await zotero.checkStatus();
    expect(status.available).toBe(false);
    expect(status.error?.code).toBe("not-running");
  });

  it("searches Zotero 7 local API and surfaces 403 / timeout as ZoteroError", async () => {
    const okTransport = vi.fn(async (path: string) => {
      expect(path).toBe("/api/users/0/items?q=Habermas&format=csljson&limit=25");
      return ZOTERO_CSLJSON_FIXTURE;
    });
    const zotero = new ZoteroLocal(okTransport);
    const results = await zotero.search("Habermas");
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("K8M9P2Q1");

    const forbiddenZotero = new ZoteroLocal(async () => {
      throw new Error(`HTTP 403: ${ZOTERO_403_BODY_FIXTURE}`);
    });
    await expect(forbiddenZotero.search("Habermas")).rejects.toMatchObject({
      name: "ZoteroError",
      code: "forbidden"
    });

    const timeoutZotero = new ZoteroLocal(async () => {
      throw new Error("Zotero request timed out after 5s.");
    });
    await expect(timeoutZotero.search("Habermas")).rejects.toMatchObject({
      name: "ZoteroError",
      code: "timeout"
    });
  });

  it("uses Better BibTeX CAYW picker when present and falls back silently when absent", async () => {
    const bbtTransport = vi.fn(async (path: string) => {
      expect(path).toBe(ZOTERO_BBT_CAYW_PATH);
      return ZOTERO_BBT_CAYW_FIXTURE;
    });
    const bbtZotero = new ZoteroLocal(bbtTransport);
    const picked = await bbtZotero.tryPick();
    expect(picked.supported).toBe(true);
    expect(picked.items).toHaveLength(1);
    expect(picked.items[0]).toMatchObject({
      id: "Z9Y8X7W6",
      citeKey: "arendt1958",
      title: "The Human Condition",
      provider: "zotero"
    });

    const noBbtZotero = new ZoteroLocal(async () => {
      throw new Error("HTTP 404: No endpoint found");
    });
    await expect(noBbtZotero.tryPick()).resolves.toEqual({ supported: false, items: [] });
    await expect(noBbtZotero.pick()).resolves.toEqual([]);
  });
});
