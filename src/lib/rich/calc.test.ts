import { describe, expect, it } from "vitest";
import { evaluateWorksheet, worksheetToLatex, worksheetToPlainText } from "./calc";
import { renderMathSvg } from "./math";

function lines(source: string) {
  return evaluateWorksheet(source).lines;
}

describe("calculation worksheets", () => {
  it("carries definitions and units down the worksheet", () => {
    const text = worksheetToPlainText("m := 5 kg\na := 9.81 m/s^2\nF := m a =\nF = kN");
    expect(text).toBe("m := 5 kg\na := 9.81 m/s^2\nF := m a = 49.05 N\nF = 0.04905 kN");
  });

  it("composes base units when no named unit fits", () => {
    expect(worksheetToPlainText("v := 100 km/hr =")).toBe("v := 100 km/hr = 27.778 m·s^-1");
    expect(worksheetToPlainText("v := 100 km/hr\nv = mph")).toContain("v = 62.137 mph");
  });

  it("supports user functions, constants, and built-ins", () => {
    const text = worksheetToPlainText(
      "area(r) := π r^2\nA_1 := area(2 m) =\nsqrt(A_1) =\nsin(30 deg) =\nmax(1 ft, 30 cm) = cm"
    );
    expect(text).toContain("A_1 := area(2 m) = 12.566 m^2");
    expect(text).toContain("sqrt(A_1) = 3.545 m");
    expect(text).toContain("sin(30 deg) = 0.5");
    expect(text).toContain("max(1 ft, 30 cm) = 30.48 cm");
  });

  it("reads 'min' as minutes outside a call and as a function inside one", () => {
    expect(worksheetToPlainText("t_1 := 90 min\nt_1 = hr")).toContain("t_1 = 1.5 hr");
    expect(worksheetToPlainText("min(3, 2) =")).toBe("min(3, 2) = 2");
  });

  it("settles names that are both a unit and a variable from context", () => {
    // Only a shadowed name leading into a variable: the variable.
    expect(worksheetToPlainText("m := 2 kg\nv := 3 m/s\nE := 0.5 m v^2 =")).toContain("= 9 J");
    expect(worksheetToPlainText("m := 2 kg\nE := 0.5 m (3 m/s)^2 =")).toContain("= 9 J");
    // An unshadowed unit in the chain: units.
    expect(worksheetToPlainText("m := 2 kg\nv := 3 m/s =")).toContain("v := 3 m/s = 3 m·s^-1");
    // A shadowed name alone could be either, so it is reported.
    const result = lines("m := 2 kg\nx := 5 m\nL := 12 ft\ny := 0.5 L\nz := 5*m =");
    expect(result[1].kind === "error" && result[1].message).toMatch(/m is both a unit and a variable/);
    expect(result[3].kind === "error" && result[3].message).toMatch(/L is both a unit and a variable/);
    expect(result[4]).toMatchObject({ kind: "math", plain: "z := 5*m = 10 kg" });
    // A display unit after "=" always means the unit.
    expect(worksheetToPlainText("m := 2 kg\nL := 3 ft\nL = m")).toContain("L = 0.9144 m");
    // The variable reading renders as a variable, not an upright unit.
    expect(worksheetToLatex(evaluateWorksheet("m := 2 kg\nv := 3 m/s\n0.5 m v ="))).toContain("0.5\\,m\\,v");
  });

  it("multiplies a value written before parentheses", () => {
    expect(worksheetToPlainText("x := 3\ny := x (x + 1) =")).toContain("y := x (x + 1) = 12");
    expect(worksheetToLatex(evaluateWorksheet("x := 3\nx (x + 1) ="))).not.toContain("operatorname");
    expect(worksheetToPlainText("x := 3\nx (2)^2 =")).toContain("= 12");
    expect(lines("q(2) =")[0]).toMatchObject({ kind: "error", message: "q is not a known function." });
  });

  it("ends a unit chain at the first non-unit operand", () => {
    const text = worksheetToPlainText("A := 2 m^2\nρ := 1.2 kg/m^3\nv := 3 m/s\nq := 0.5 ρ A v^2 =");
    expect(text).toContain("q := 0.5 ρ A v^2 = 10.8 N");
  });

  it("uses scientific notation for very large and small values", () => {
    expect(worksheetToPlainText("6.02e23 =")).toBe("6.02e23 = 6.02·10^23");
    expect(worksheetToPlainText("0.00001234 =")).toBe("0.00001234 = 1.234·10^-5");
  });

  it("keeps errors on their own line and continues evaluating", () => {
    const result = lines("x := 2 m + 3 s\ny := 4\nz =\ny =");
    expect(result[0]).toMatchObject({ kind: "error" });
    expect(result[0].kind === "error" && result[0].message).toMatch(/units don't match/);
    expect(result[2]).toMatchObject({ kind: "error", message: "z is not defined." });
    expect(result[3]).toMatchObject({ kind: "math", plain: "y = 4" });
  });

  it("rejects display units of the wrong dimension", () => {
    const [line] = lines("5 kg = m");
    expect(line.kind === "error" && line.message).toMatch(/can't be shown in m/);
  });

  it("stops runaway recursion", () => {
    const result = lines("f(x) := f(x) + 1\nf(1) =");
    expect(result[1].kind === "error" && result[1].message).toMatch(/too deep/);
  });

  it("treats hash lines as text and rejects empty worksheets", () => {
    expect(lines("# Load case 1")[0]).toEqual({ kind: "text", text: "Load case 1" });
    expect(() => evaluateWorksheet("  ")).toThrow(/Add a calculation/);
  });

  it("produces LaTeX that MathJax renders, including text, units, and errors", async () => {
    const latex = worksheetToLatex(evaluateWorksheet(
      "# Beam {test} 100% & $5 a_b ^ ~ \\ #\nL := 3 ft\nθ := 30°\nw_load := 2 kN/m\nM := w_load L^2/8 = kN m\nθ = deg\nsqrt(abs(-4)) =\nbad := 1 +"
    ));
    expect(latex).toContain("\\mathrel{:=}");
    expect(latex).toContain("\\mathrm{kN}");
    expect(latex).toContain("\\color{#c0392b}");
    const result = await renderMathSvg(latex, true, 16, 64_000);
    expect(result.svg).toContain("<svg");
    expect(result.svg).not.toContain("merror");
    expect(result.width).toBeGreaterThan(0);
  });
});
