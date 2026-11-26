import { describe, expect, it } from "vitest";
import { MESSAGE_TAGS, parseMessage, renderNodes } from "./message";
import { renderMessage } from "./format";
import { ALLOWED_MESSAGE_TAGS, checkTags, validateCatalog } from "./validate.js";

describe("parseMessage", () => {
  it("parses allowlisted tags into element nodes", () => {
    const nodes = parseMessage("Writes one <code>{file}</code> file.");
    expect(nodes).toHaveLength(3);
    expect(nodes[1]).toMatchObject({ type: "tag", name: "code" });
    const tag = nodes[1];
    if (tag?.type !== "tag") throw new Error("expected a tag node");
    expect(tag.children).toEqual([{ type: "param", name: "file" }]);
  });

  it("nests inline tags", () => {
    const nodes = parseMessage("<strong>a <em>b</em></strong>");
    expect(nodes).toHaveLength(1);
    const strong = nodes[0];
    if (strong?.type !== "tag") throw new Error("expected a tag node");
    expect(strong.name).toBe("strong");
    expect(strong.children[1]).toMatchObject({ type: "tag", name: "em" });
  });

  it("drops tags when rendering plain text", () => {
    expect(renderMessage("Writes one <code>{file}</code> file.", "en", { file: "x" })).toBe(
      "Writes one x file."
    );
  });

  it("substitutes # with the formatted count inside tags", () => {
    const template =
      "{count, plural, one {<strong>#</strong> word} other {<strong>#</strong> words}}";
    expect(renderMessage(template, "en", { count: 1 })).toBe("1 word");
    expect(renderMessage(template, "en", { count: 1234 })).toBe("1,234 words");
  });

  it("keeps unknown tags as text instead of rendering them", () => {
    const template = "Hello <script>alert(1)</script>";
    expect(renderNodes(parseMessage(template), "en")).toBe(template);
  });

  it("falls back to plain text when tags are unbalanced", () => {
    expect(renderMessage("<strong>hello", "en")).toBe("hello");
  });

  it("treats markup inside parameters as text", () => {
    expect(renderMessage("Hello {name}", "en", { name: "<strong>x</strong>" })).toBe(
      "Hello <strong>x</strong>"
    );
  });
});

describe("tag validation", () => {
  it("allows the same tags the parser understands", () => {
    expect(ALLOWED_MESSAGE_TAGS).toEqual([...MESSAGE_TAGS]);
  });

  it("accepts balanced allowlisted tags", () => {
    const errors: string[] = [];
    checkTags("A <strong>bold</strong> and <code>code</code>", "en/a", errors);
    expect(errors).toEqual([]);
  });

  it("rejects unknown tags, attributes and unbalanced tags", () => {
    const errors: string[] = [];
    checkTags("<script>x</script>", "en/a", errors);
    checkTags('<strong class="x">y</strong>', "en/b", errors);
    checkTags("<strong>y", "en/c", errors);
    const joined = errors.join("\n");
    expect(joined).toContain("<script> is not an allowed tag");
    expect(joined).toContain("must not have attributes");
    expect(joined).toContain("unclosed <strong>");
  });

  it("reports tag mistakes during catalog validation", () => {
    const source = { "a.b": "<script>x</script>" };
    const result = validateCatalog("en", "en", source, source);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
