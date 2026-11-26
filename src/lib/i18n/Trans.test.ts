import { afterEach, describe, expect, it } from "vitest";
import { mount, unmount, type ComponentProps } from "svelte";
import Trans from "./Trans.svelte";

let instance: ReturnType<typeof mount> | undefined;

afterEach(() => {
  if (instance) unmount(instance);
  instance = undefined;
});

function render(props: ComponentProps<typeof Trans>): HTMLElement {
  const target = document.createElement("div");
  instance = mount(Trans, { target, props });
  return target;
}

describe("Trans", () => {
  it("renders allowlisted tags as real elements", () => {
    const target = render({
      message: "Writes one <code>{file}</code> file.",
      params: { file: "a.prosecraft" }
    });
    expect(target.querySelector("code")?.textContent).toBe("a.prosecraft");
    expect(target.textContent).toBe("Writes one a.prosecraft file.");
  });

  it("renders plurals and nested tags", () => {
    const target = render({
      message:
        "{count, plural, one {<strong>#</strong> word} other {<strong>#</strong> words}}",
      params: { count: 2 }
    });
    expect(target.querySelector("strong")?.textContent).toBe("2");
    expect(target.textContent).toBe("2 words");
  });

  it("escapes parameters and never renders them as markup", () => {
    const target = render({
      message: "Hello {name}",
      params: { name: "<strong>evil</strong>" }
    });
    expect(target.querySelector("strong")).toBeNull();
    expect(target.textContent).toBe("Hello <strong>evil</strong>");
  });

  it("renders unknown tags as text", () => {
    const target = render({ message: "<script>x</script>" });
    expect(target.querySelector("script")).toBeNull();
    expect(target.textContent).toBe("<script>x</script>");
  });
});
