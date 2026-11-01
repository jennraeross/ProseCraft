import { MAX_MATH_SOURCE_LENGTH } from "./model";

export type MathRenderResult = {
  /** Standalone SVG markup including its natural dimensions. */
  svg: string;
  /** Natural display width/height in CSS pixels for a given base font size. */
  width: number;
  height: number;
};

type MathJaxContext = {
  adaptor: {
    outerHTML(node: unknown): string;
  };
  doc: {
    convert(tex: string, options: Record<string, unknown>): unknown;
  };
};

let context: Promise<MathJaxContext> | null = null;

/**
 * MathJax is a large dependency, so it is only downloaded the first time a
 * document actually contains an equation. The direct API avoids the component
 * loader and produces self-contained SVG with no external font requests.
 */
async function mathJaxContext(): Promise<MathJaxContext> {
  if (context) return context;
  context = (async () => {
    const [{ browserAdaptor }, { RegisterHTMLHandler }, { TeX }, { SVG }, { mathjax }] =
      await Promise.all([
        import("@mathjax/src/js/adaptors/browserAdaptor.js"),
        import("@mathjax/src/js/handlers/html.js"),
        import("@mathjax/src/js/input/tex.js"),
        import("@mathjax/src/js/output/svg.js"),
        import("@mathjax/src/js/mathjax.js")
      ]);

    // Register only the packages ProseCraft uses. In particular, the HTML
    // package is deliberately absent so TeX cannot inject URLs, classes, or
    // arbitrary markup into the editor or exported documents.
    await Promise.all([
      import("@mathjax/src/js/input/tex/ams/AmsConfiguration.js"),
      import("@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js"),
      import("@mathjax/src/js/input/tex/noundefined/NoUndefinedConfiguration.js"),
      import("@mathjax/src/js/input/tex/configmacros/ConfigMacrosConfiguration.js"),
      import("@mathjax/src/js/input/tex/color/ColorConfiguration.js"),
      import("@mathjax/src/js/input/tex/textmacros/TextMacrosConfiguration.js"),
      import("@mathjax/src/js/input/tex/cancel/CancelConfiguration.js"),
      import("@mathjax/src/js/input/tex/cases/CasesConfiguration.js"),
      import("@mathjax/src/js/input/tex/bbox/BboxConfiguration.js"),
      import("@mathjax/src/js/input/tex/braket/BraketConfiguration.js")
    ]);

    const adaptor = browserAdaptor();
    RegisterHTMLHandler(adaptor);
    const tex = new TeX({
      packages: [
        "base",
        "ams",
        "newcommand",
        "noundefined",
        "configmacros",
        "color",
        "textmacros",
        "cancel",
        "cases",
        "bbox",
        "braket"
      ]
    });
    const svg = new SVG({
      fontCache: "local",
      linebreaks: { inline: false }
    });
    const doc = mathjax.document("", { InputJax: tex, OutputJax: svg });
    return {
      adaptor: adaptor as MathJaxContext["adaptor"],
      doc: doc as MathJaxContext["doc"]
    };
  })();
  try {
    return await context;
  } catch (error) {
    context = null;
    throw error;
  }
}

function lengthInEx(value: string | null): number | null {
  const match = /^([\d.]+)ex$/.exec(value ?? "");
  const number = match ? Number(match[1]) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

function viewBoxSize(value: string | null): { width: number; height: number } | null {
  const parts = (value ?? "").trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const width = parts[2];
  const height = parts[3];
  return width > 0 && height > 0 ? { width, height } : null;
}

export async function renderMathSvg(
  tex: string,
  display: boolean,
  emPx = 16
): Promise<MathRenderResult> {
  const source = tex.trim();
  if (!source) throw new Error("Add some LaTeX to render an equation.");
  if (source.length > MAX_MATH_SOURCE_LENGTH) {
    throw new Error("That equation is too large to render.");
  }
  const { adaptor, doc } = await mathJaxContext();

  let node: unknown;
  try {
    node = doc.convert(source, {
      display,
      em: emPx,
      ex: emPx / 2,
      containerWidth: 1200
    });
  } catch {
    throw new Error("Could not render that equation. Check the LaTeX syntax.");
  }

  const container = adaptor.outerHTML(node);
  const parsed = new DOMParser().parseFromString(container, "text/html");
  const svg = parsed.querySelector("svg");
  if (!svg) throw new Error("Could not render that equation. Check the LaTeX syntax.");

  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("focusable", "false");
  if (!svg.getAttribute("xmlns:xlink")) {
    svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  }

  const exPx = emPx / 2;
  const widthEx = lengthInEx(svg.getAttribute("width"));
  const heightEx = lengthInEx(svg.getAttribute("height"));
  const box = viewBoxSize(svg.getAttribute("viewBox"));
  const ratio = box ? box.width / box.height : 1;
  const height = heightEx ? heightEx * exPx : (box ? (emPx * box.height) / 1000 : emPx);
  const width = widthEx ? widthEx * exPx : height * ratio;

  return {
    svg: svg.outerHTML,
    width: Math.max(1, width),
    height: Math.max(1, height)
  };
}
