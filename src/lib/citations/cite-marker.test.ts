import { describe, expect, it } from "vitest";
import { commentText, offsetsFromRange, rangeFromOffsets } from "../comment-dom";
import { buildAnchor, locateAnchor } from "../comments";
import type { CslItem } from "./csl";
import {
  MAX_CITE_AFFIX_LENGTH,
  MAX_CITE_ATTR_LENGTH,
  MAX_CITE_ITEMS,
  MAX_CITE_LOCATOR_LENGTH,
  buildCiteData,
  citationIdsInHtml,
  citeMarkerHtml,
  formatPandocCitations,
  normalizeCiteDataAttr,
  parseCiteData,
  parsePandocCitationCluster,
  renderCitationLabels
} from "./cite-marker";

const POPPER: CslItem = {
  id: "popper-1959",
  type: "book",
  author: [{ family: "Popper", given: "Karl R." }],
  title: "The Logic of Scientific Discovery",
  issued: { "date-parts": [[1959]] }
};

const SHANNON: CslItem = {
  id: "shannon-1948",
  type: "article-journal",
  author: [
    { family: "Shannon", given: "Claude E." },
    { family: "Weaver", given: "Warren" }
  ],
  title: "A Mathematical Theory of Communication",
  issued: { "date-parts": [[1948]] }
};

const SMITH_A: CslItem = {
  id: "smith-2020-a",
  type: "book",
  author: [{ family: "Smith", given: "Ada" }],
  title: "Alpha Work",
  issued: { "date-parts": [[2020]] }
};

const SMITH_B: CslItem = {
  id: "smith-2020-b",
  type: "book",
  author: [{ family: "Smith", given: "Ada" }],
  title: "Beta Work",
  issued: { "date-parts": [[2020]] }
};

describe("cite-marker data-cites validation and building", () => {
  it("parses and builds canonical data-cites JSON and marker HTML", () => {
    const raw = JSON.stringify([
      {
        id: "key",
        locator: "42",
        label: "page",
        prefix: "see ",
        suffix: "",
        suppressAuthor: false
      }
    ]);
    expect(parseCiteData(raw)).toEqual([
      { id: "key", locator: "42", label: "page", prefix: "see " }
    ]);

    const html = citeMarkerHtml([
      { id: "key", locator: "42", label: "page", prefix: "see ", suppressAuthor: false }
    ]);
    expect(html).toBe(
      `<span class="cite-ref" data-cites="[{&quot;id&quot;:&quot;key&quot;,&quot;locator&quot;:&quot;42&quot;,&quot;label&quot;:&quot;page&quot;,&quot;prefix&quot;:&quot;see &quot;}]" contenteditable="false"></span>`
    );

    const parsedDoc = new DOMParser().parseFromString(html, "text/html");
    const span = parsedDoc.querySelector("span.cite-ref")!;
    expect(parseCiteData(span.getAttribute("data-cites"))).toEqual([
      { id: "key", locator: "42", label: "page", prefix: "see " }
    ]);
  });

  it("drops hostile, malformed, unknown-key, or oversized data-cites payloads", () => {
    expect(parseCiteData(null)).toBeNull();
    expect(parseCiteData("")).toBeNull();
    expect(parseCiteData("{not-json")).toBeNull();
    expect(parseCiteData('{"id":"key"}')).toBeNull();
    expect(parseCiteData("[]")).toBeNull();
    expect(parseCiteData('[{}]')).toBeNull();
    expect(parseCiteData('[{"id":"bad id!"}]')).toBeNull();
    expect(parseCiteData('[{"id":"-leading-dash"}]')).toBeNull();
    expect(parseCiteData('[{"id":"key","label":"figure"}]')).toBeNull();
    expect(parseCiteData('[{"id":"key","locator":42}]')).toBeNull();
    expect(parseCiteData('[{"id":"key","suppressAuthor":"true"}]')).toBeNull();
    expect(parseCiteData('[{"id":"key","evil":"<script>"}]')).toBeNull();
    expect(parseCiteData('[{"id":"key","prefix":"see\\n<script>"}]')).toBeNull();
    expect(
      parseCiteData(JSON.stringify([{ id: "key", locator: "1".repeat(MAX_CITE_LOCATOR_LENGTH + 1) }]))
    ).toBeNull();
    expect(
      parseCiteData(JSON.stringify([{ id: "key", prefix: "x".repeat(MAX_CITE_AFFIX_LENGTH + 1) }]))
    ).toBeNull();
    expect(
      parseCiteData(JSON.stringify([{ id: "key", suffix: "x".repeat(MAX_CITE_AFFIX_LENGTH + 1) }]))
    ).toBeNull();
    expect(
      parseCiteData(
        JSON.stringify(Array.from({ length: MAX_CITE_ITEMS + 1 }, (_, i) => ({ id: `k-${i}` })))
      )
    ).toBeNull();
    expect(normalizeCiteDataAttr("x".repeat(MAX_CITE_ATTR_LENGTH + 1))).toBeNull();
    expect(() => buildCiteData([])).toThrow();
    expect(() => buildCiteData([{ id: "bad id!" }])).toThrow();
  });
});

describe("citationIdsInHtml", () => {
  it("extracts unique citation ids in document order and skips invalid markers", () => {
    const html =
      `<p>One${citeMarkerHtml([{ id: "popper-1959", locator: "42", label: "page" }])}</p>`
      + `<p>Two<span class="cite-ref" data-cites="bad"></span>`
      + `${citeMarkerHtml([{ id: "shannon-1948" }, { id: "popper-1959" }])}</p>`;

    expect(citationIdsInHtml(html)).toEqual(["popper-1959", "shannon-1948"]);
    expect(citationIdsInHtml("<p>No citations here</p>")).toEqual([]);
  });
});

describe("renderCitationLabels and comment anchor stability", () => {
  it("populates data-label across styles/locales while keeping markers empty and non-editable", () => {
    const root = document.createElement("div");
    root.innerHTML =
      `<p>First${citeMarkerHtml([{ id: "popper-1959", locator: "42", label: "page", prefix: "see " }])} `
      + `second<span class="cite-ref" data-cites='[{"id":"shannon-1948"},{"id":"popper-1959","suppressAuthor":true}]'>stale<b>child</b></span> `
      + `third${citeMarkerHtml([{ id: "smith-2020-b" }, { id: "smith-2020-a" }])} `
      + `missing${citeMarkerHtml([{ id: "unknown-key" }])} `
      + `bad<span class="cite-ref" data-cites="invalid" data-label="stale"></span>.</p>`;

    const library = [POPPER, SHANNON, SMITH_A, SMITH_B];

    renderCitationLabels(root, library, "apa7", "en");
    const markers = Array.from(root.querySelectorAll<HTMLElement>("span.cite-ref"));
    expect(markers.map((el) => el.getAttribute("data-label"))).toEqual([
      "(see Popper, 1959, p. 42)",
      "(Shannon & Weaver, 1948; 1959)",
      "(Smith, 2020b; Smith, 2020a)",
      "[@unknown-key]",
      null
    ]);
    expect(markers.slice(0, 4).every((el) => el.getAttribute("contenteditable") === "false")).toBe(true);
    expect(markers.slice(0, 4).every((el) => el.childNodes.length === 0)).toBe(true);

    // German locale and numeric style
    renderCitationLabels(root, library, "apa7", "de");
    expect(markers[0].getAttribute("data-label")).toBe("(see Popper, 1959, S. 42)");

    renderCitationLabels(root, library, "ieee", "en");
    expect(markers[0].getAttribute("data-label")).toBe("[see 1, p. 42]");
    expect(markers[1].getAttribute("data-label")).toBe("[2], [1]");
  });

  it("does not shift commentText offsets or comment anchors when markers are present", () => {
    const plain = document.createElement("div");
    plain.innerHTML = "<p>She said no. Then he said yes, and left.</p>";
    const plainText = commentText(plain);
    const expectedAnchor = buildAnchor(plainText, 13, 28)!;
    expect(expectedAnchor.quote).toBe("Then he said ye");

    const withCitations = document.createElement("div");
    withCitations.innerHTML =
      `<p>She said no.${citeMarkerHtml([{ id: "popper-1959", locator: "42", label: "page", prefix: "see " }])}`
      + ` Then he${citeMarkerHtml([{ id: "shannon-1948" }, { id: "smith-2020-a", suppressAuthor: true }])}`
      + ` said yes, and left.</p>`;
    document.body.append(withCitations);
    renderCitationLabels(withCitations, [POPPER, SHANNON, SMITH_A], "apa7", "en");

    expect(commentText(withCitations)).toBe(plainText);
    expect(locateAnchor(commentText(withCitations), expectedAnchor)).toEqual({ start: 13, end: 28 });

    const range = rangeFromOffsets(withCitations, 13, 28)!;
    expect(range).not.toBeNull();
    expect(range.toString()).toBe("Then he said ye");
    expect(offsetsFromRange(withCitations, range)).toEqual({ start: 13, end: 28 });

    withCitations.remove();
  });
});

describe("renderCitationLabels with ids named like Object members", () => {
  it("labels a source whose id is constructor like any other", () => {
    const named = (id: string, family: string): CslItem => ({
      id,
      type: "book",
      author: [{ family, given: "A" }],
      title: family,
      issued: { "date-parts": [[2020]] }
    });
    const library = [
      named("constructor", "Doe"), named("__proto__", "Roe"), named("toString", "Moe"), named("other", "Poe")
    ];
    const root = document.createElement("div");
    root.innerHTML = `<p>${citeMarkerHtml([{ id: "other" }])} ${citeMarkerHtml([{ id: "constructor" }])}`
      + ` ${citeMarkerHtml([{ id: "__proto__" }])} ${citeMarkerHtml([{ id: "toString" }])}</p>`;
    const labels = () => Array.from(root.querySelectorAll("span.cite-ref"))
      .map((el) => el.getAttribute("data-label"));

    renderCitationLabels(root, library, "apa7", "en");
    expect(labels()).toEqual(["(Poe, 2020)", "(Doe, 2020)", "(Roe, 2020)", "(Moe, 2020)"]);
    renderCitationLabels(root, library, "ieee", "en");
    expect(labels()).toEqual(["[1]", "[2]", "[3]", "[4]"]);
  });
});

describe("Pandoc syntax helpers", () => {
  it("formats and parses single, suppress-author, multi-item, and locator/affix clusters", () => {
    const cases: Array<{ items: Parameters<typeof formatPandocCitations>[0]; expected: string }> = [
      {
        items: [{ id: "key", locator: "42", label: "page", prefix: "see " }],
        expected: "[see @key, p. 42]"
      },
      {
        items: [{ id: "key", suppressAuthor: true }],
        expected: "[-@key]"
      },
      {
        items: [{ id: "a" }, { id: "b", locator: "2", label: "chapter" }],
        expected: "[@a; @b, ch. 2]"
      },
      {
        items: [{ id: "a", locator: "3.1", label: "section", suffix: "and passim" }],
        expected: "[@a, sec. 3.1 and passim]"
      }
    ];

    for (const { items, expected } of cases) {
      const pandoc = formatPandocCitations(items);
      expect(pandoc).toBe(expected);
      expect(parsePandocCitationCluster(pandoc.slice(1, -1))).toEqual(items);
    }

    expect(parsePandocCitationCluster("user@example.com")).toBeNull();
    expect(parsePandocCitationCluster("plain text")).toBeNull();
    expect(parsePandocCitationCluster("@a; not a cite")).toBeNull();
  });
});
