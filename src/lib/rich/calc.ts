import { MAX_CALC_SOURCE_LENGTH } from "./model";

/**
 * A small MathCAD-style worksheet evaluator. Each line of a calculation block
 * is one region, evaluated top to bottom:
 *
 *   # Text lines start with a hash.
 *   m := 5 kg              definition
 *   a := 9.81 m/s^2
 *   F := m a =             definition that also shows its value
 *   F = kN                 evaluation, shown in a chosen unit
 *   f(x) := x^2 + 1        user function
 *
 * Quantities carry SI dimensions, so adding incompatible units or showing a
 * result in the wrong unit is reported on that line instead of producing a
 * silently wrong number. Nothing here touches the DOM, so plain-text export
 * and word counts can use the same evaluation synchronously.
 */

const MAX_LINES = 200;
const MAX_CALLS = 10_000;
const MAX_DEPTH = 64;
const EPSILON = 1e-9;

/** Exponents of m, kg, s, A, K, mol, cd. */
type Dims = readonly number[];
type Quantity = { value: number; dims: Dims };

const DIMENSIONLESS: Dims = [0, 0, 0, 0, 0, 0, 0];
const BASE_SYMBOLS = ["m", "kg", "s", "A", "K", "mol", "cd"];

function dims(L = 0, M = 0, T = 0, I = 0, Θ = 0, N = 0, J = 0): Dims {
  return [L, M, T, I, Θ, N, J];
}

const LENGTH = dims(1);
const MASS = dims(0, 1);
const TIME = dims(0, 0, 1);
const FORCE = dims(1, 1, -2);
const ENERGY = dims(2, 1, -2);
const POWER = dims(2, 1, -3);
const PRESSURE = dims(-1, 1, -2);
const CHARGE = dims(0, 0, 1, 1);
const VOLTAGE = dims(2, 1, -3, -1);
const RESISTANCE = dims(2, 1, -3, -2);
const VOLUME = dims(3);
const FREQUENCY = dims(0, 0, -1);
const SPEED = dims(1, 0, -1);

/**
 * Built-in units follow MathCAD naming where it differs from SI symbols:
 * `g` is standard gravity, so grams are `gm`; hours are `hr`. Single letters
 * that are far more often variables than units (F, C, H, T, t) are left out.
 */
const UNITS: Record<string, Quantity> = {
  m: { value: 1, dims: LENGTH },
  km: { value: 1e3, dims: LENGTH },
  cm: { value: 1e-2, dims: LENGTH },
  mm: { value: 1e-3, dims: LENGTH },
  μm: { value: 1e-6, dims: LENGTH },
  nm: { value: 1e-9, dims: LENGTH },
  in: { value: 0.0254, dims: LENGTH },
  ft: { value: 0.3048, dims: LENGTH },
  yd: { value: 0.9144, dims: LENGTH },
  mi: { value: 1609.344, dims: LENGTH },
  kg: { value: 1, dims: MASS },
  gm: { value: 1e-3, dims: MASS },
  mg: { value: 1e-6, dims: MASS },
  tonne: { value: 1e3, dims: MASS },
  lb: { value: 0.45359237, dims: MASS },
  s: { value: 1, dims: TIME },
  ms: { value: 1e-3, dims: TIME },
  μs: { value: 1e-6, dims: TIME },
  min: { value: 60, dims: TIME },
  hr: { value: 3600, dims: TIME },
  day: { value: 86_400, dims: TIME },
  yr: { value: 31_557_600, dims: TIME },
  A: { value: 1, dims: dims(0, 0, 0, 1) },
  mA: { value: 1e-3, dims: dims(0, 0, 0, 1) },
  K: { value: 1, dims: dims(0, 0, 0, 0, 1) },
  mol: { value: 1, dims: dims(0, 0, 0, 0, 0, 1) },
  cd: { value: 1, dims: dims(0, 0, 0, 0, 0, 0, 1) },
  N: { value: 1, dims: FORCE },
  kN: { value: 1e3, dims: FORCE },
  MN: { value: 1e6, dims: FORCE },
  lbf: { value: 4.4482216152605, dims: FORCE },
  J: { value: 1, dims: ENERGY },
  kJ: { value: 1e3, dims: ENERGY },
  MJ: { value: 1e6, dims: ENERGY },
  kWh: { value: 3.6e6, dims: ENERGY },
  cal: { value: 4.184, dims: ENERGY },
  kcal: { value: 4184, dims: ENERGY },
  eV: { value: 1.602176634e-19, dims: ENERGY },
  W: { value: 1, dims: POWER },
  kW: { value: 1e3, dims: POWER },
  MW: { value: 1e6, dims: POWER },
  hp: { value: 745.69987158227, dims: POWER },
  Pa: { value: 1, dims: PRESSURE },
  kPa: { value: 1e3, dims: PRESSURE },
  MPa: { value: 1e6, dims: PRESSURE },
  GPa: { value: 1e9, dims: PRESSURE },
  bar: { value: 1e5, dims: PRESSURE },
  atm: { value: 101_325, dims: PRESSURE },
  psi: { value: 6894.757293168, dims: PRESSURE },
  coul: { value: 1, dims: CHARGE },
  V: { value: 1, dims: VOLTAGE },
  mV: { value: 1e-3, dims: VOLTAGE },
  kV: { value: 1e3, dims: VOLTAGE },
  Ω: { value: 1, dims: RESISTANCE },
  ohm: { value: 1, dims: RESISTANCE },
  kΩ: { value: 1e3, dims: RESISTANCE },
  L: { value: 1e-3, dims: VOLUME },
  mL: { value: 1e-6, dims: VOLUME },
  gal: { value: 0.003785411784, dims: VOLUME },
  Hz: { value: 1, dims: FREQUENCY },
  kHz: { value: 1e3, dims: FREQUENCY },
  MHz: { value: 1e6, dims: FREQUENCY },
  GHz: { value: 1e9, dims: FREQUENCY },
  mph: { value: 0.44704, dims: SPEED },
  kph: { value: 1 / 3.6, dims: SPEED },
  rad: { value: 1, dims: DIMENSIONLESS },
  deg: { value: Math.PI / 180, dims: DIMENSIONLESS },
  "°": { value: Math.PI / 180, dims: DIMENSIONLESS }
};

const UNIT_ALIASES: Record<string, string> = { um: "μm", us: "μs", µm: "μm", µs: "μs" };

const CONSTANTS: Record<string, Quantity> = {
  π: { value: Math.PI, dims: DIMENSIONLESS },
  pi: { value: Math.PI, dims: DIMENSIONLESS },
  e: { value: Math.E, dims: DIMENSIONLESS },
  g: { value: 9.80665, dims: dims(1, 0, -2) }
};

/** Units preferred when a result has no requested display unit. */
const DISPLAY_UNITS: Array<[string, Dims]> = [
  ["N", FORCE],
  ["J", ENERGY],
  ["W", POWER],
  ["Pa", PRESSURE],
  ["V", VOLTAGE],
  ["Ω", RESISTANCE]
];

const GREEK = new Set([
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota",
  "kappa", "lambda", "mu", "nu", "xi", "rho", "sigma", "tau", "upsilon", "phi",
  "chi", "psi", "omega", "Gamma", "Delta", "Theta", "Lambda", "Xi", "Sigma",
  "Upsilon", "Phi", "Psi", "Omega"
]);

export class CalcError extends Error {}

// ---------------------------------------------------------------------------
// Tokens and syntax tree

type Token =
  | { type: "number"; text: string; value: number }
  | { type: "ident"; text: string }
  | { type: "op"; text: string };

type Node =
  | { type: "number"; text: string; value: number }
  | { type: "ident"; name: string; unit?: boolean; chain?: UnitChain }
  | { type: "neg"; operand: Node }
  | { type: "binary"; op: "+" | "-" | "*" | "/" | "^"; left: Node; right: Node; implicit?: boolean }
  | { type: "call"; name: string; args: Node[] };

/** Unit names written straight after a number, as in "9.81 m/s^2". */
type UnitChain = { names: string[]; endedByOperand: boolean };

const IDENT_START = /[A-Za-z_Ͱ-Ͽµ°]/;
const IDENT_PART = /[A-Za-z0-9_Ͱ-Ͽµ']/;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    const number = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(index));
    if (number) {
      tokens.push({ type: "number", text: number[0], value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    if (IDENT_START.test(char)) {
      // The degree sign is a complete unit on its own, so "30°" works.
      let end = index + 1;
      if (char !== "°") while (end < text.length && IDENT_PART.test(text[end])) end += 1;
      tokens.push({ type: "ident", text: text.slice(index, end) });
      index = end;
      continue;
    }
    const op = char === "·" || char === "×" ? "*" : char === "−" ? "-" : char;
    if ("+-*/^(),".includes(op)) {
      tokens.push({ type: "op", text: op });
      index += 1;
      continue;
    }
    throw new CalcError(`Unexpected character “${char}”.`);
  }
  return tokens;
}

/** The identifier a multiplicative operand names, looking through a power. */
function unitTarget(node: Node): Extract<Node, { type: "ident" }> | null {
  if (node.type === "ident") return node;
  if (node.type === "binary" && node.op === "^" && node.left.type === "ident") return node.left;
  return null;
}

class Parser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): Node {
    if (this.tokens.length === 0) throw new CalcError("Missing expression.");
    const node = this.additive();
    const extra = this.peek();
    if (extra) throw new CalcError(`Unexpected “${extra.text}”.`);
    return node;
  }

  /** Display units: every unit name means the unit, even if it was redefined. */
  parseUnits(): Node {
    const node = this.parse();
    const mark = (child: Node): void => {
      if (child.type === "ident") child.unit = Boolean(unitNamed(child.name));
      else if (child.type === "neg") mark(child.operand);
      else if (child.type === "binary") {
        mark(child.left);
        mark(child.right);
      }
    };
    mark(node);
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private isOp(text: string): boolean {
    const token = this.peek();
    return token?.type === "op" && token.text === text;
  }

  private expectOp(text: string): void {
    if (!this.isOp(text)) throw new CalcError(`Expected “${text}”.`);
    this.index += 1;
  }

  private additive(): Node {
    let node = this.multiplicative();
    while (this.isOp("+") || this.isOp("-")) {
      const op = this.tokens[this.index++].text as "+" | "-";
      node = { type: "binary", op, left: node, right: this.multiplicative() };
    }
    return node;
  }

  /**
   * Juxtaposition ("5 kg", "2 π r") multiplies, as in handwritten maths. Unit
   * names written straight after a number ("9.81 m/s^2") form a unit chain,
   * which ends at the first operand that is not a unit name. Whether a chained
   * name that is also a variable means the unit is settled at evaluation, by
   * readsAsUnit.
   */
  private multiplicative(): Node {
    let node = this.unary();
    let chain: UnitChain | null = null;
    for (;;) {
      let right: Node;
      if (this.isOp("*") || this.isOp("/")) {
        const op = this.tokens[this.index++].text as "*" | "/";
        right = this.unary();
        node = { type: "binary", op, left: node, right };
      } else {
        const next = this.peek();
        if (!next || (next.type === "op" && next.text !== "(")) return node;
        const startsChain = node.type === "number";
        right = this.power();
        node = { type: "binary", op: "*", left: node, right, implicit: true };
        if (startsChain) chain = { names: [], endedByOperand: false };
      }
      const target = unitTarget(right);
      if (chain && target && unitNamed(target.name)) {
        target.unit = true;
        target.chain = chain;
        chain.names.push(target.name);
      } else if (chain) {
        chain.endedByOperand = chain.names.length > 0;
        chain = null;
      }
    }
  }

  private unary(): Node {
    if (this.isOp("-")) {
      this.index += 1;
      return { type: "neg", operand: this.unary() };
    }
    if (this.isOp("+")) {
      this.index += 1;
      return this.unary();
    }
    return this.power();
  }

  private power(): Node {
    const base = this.primary();
    if (!this.isOp("^")) return base;
    this.index += 1;
    return { type: "binary", op: "^", left: base, right: this.unary() };
  }

  private primary(): Node {
    const token = this.peek();
    if (!token) throw new CalcError("Expression ends too early.");
    this.index += 1;
    if (token.type === "number") {
      return { type: "number", text: token.text, value: token.value };
    }
    if (token.type === "ident") {
      if (!this.isOp("(")) return { type: "ident", name: token.text };
      this.index += 1;
      const args: Node[] = [];
      if (!this.isOp(")")) {
        args.push(this.additive());
        while (this.isOp(",")) {
          this.index += 1;
          args.push(this.additive());
        }
      }
      this.expectOp(")");
      return { type: "call", name: token.text, args };
    }
    if (token.text === "(") {
      const node = this.additive();
      this.expectOp(")");
      return node;
    }
    throw new CalcError(`Unexpected “${token.text}”.`);
  }
}

function parseExpression(text: string): Node {
  return new Parser(tokenize(text)).parse();
}

function parseUnits(text: string): Node {
  return new Parser(tokenize(text)).parseUnits();
}

// ---------------------------------------------------------------------------
// Evaluation

type UserFunction = { params: string[]; body: Node };

type Scope = {
  variables: Map<string, Quantity>;
  functions: Map<string, UserFunction>;
  calls: number;
};

function unitNamed(name: string): Quantity | undefined {
  return UNITS[UNIT_ALIASES[name] ?? name];
}

function sameDims(a: Dims, b: Dims): boolean {
  return a.every((value, index) => Math.abs(value - b[index]) < EPSILON);
}

function isDimensionless(quantity: Quantity): boolean {
  return sameDims(quantity.dims, DIMENSIONLESS);
}

function requireDimensionless(quantity: Quantity, what: string): number {
  if (!isDimensionless(quantity)) throw new CalcError(`${what} must be unitless.`);
  return quantity.value;
}

function finite(quantity: Quantity): Quantity {
  if (!Number.isFinite(quantity.value)) throw new CalcError("The result is undefined or infinite.");
  return quantity;
}

const BUILTINS: Record<string, (args: Quantity[]) => Quantity> = {
  sqrt: ([x]) => ({ value: Math.sqrt(x.value), dims: x.dims.map((d) => d / 2) }),
  abs: ([x]) => ({ value: Math.abs(x.value), dims: x.dims }),
  sin: ([x]) => ({ value: Math.sin(requireDimensionless(x, "An angle")), dims: DIMENSIONLESS }),
  cos: ([x]) => ({ value: Math.cos(requireDimensionless(x, "An angle")), dims: DIMENSIONLESS }),
  tan: ([x]) => ({ value: Math.tan(requireDimensionless(x, "An angle")), dims: DIMENSIONLESS }),
  asin: ([x]) => ({ value: Math.asin(requireDimensionless(x, "The argument")), dims: DIMENSIONLESS }),
  acos: ([x]) => ({ value: Math.acos(requireDimensionless(x, "The argument")), dims: DIMENSIONLESS }),
  atan: ([x]) => ({ value: Math.atan(requireDimensionless(x, "The argument")), dims: DIMENSIONLESS }),
  ln: ([x]) => ({ value: Math.log(requireDimensionless(x, "A logarithm's argument")), dims: DIMENSIONLESS }),
  log: ([x]) => ({ value: Math.log10(requireDimensionless(x, "A logarithm's argument")), dims: DIMENSIONLESS }),
  exp: ([x]) => ({ value: Math.exp(requireDimensionless(x, "An exponent")), dims: DIMENSIONLESS }),
  floor: ([x]) => ({ value: Math.floor(x.value), dims: x.dims }),
  ceil: ([x]) => ({ value: Math.ceil(x.value), dims: x.dims }),
  round: ([x]) => ({ value: Math.round(x.value), dims: x.dims }),
  min: (args) => extremum(args, Math.min),
  max: (args) => extremum(args, Math.max)
};

const BUILTIN_ARITY: Record<string, number> = { min: -1, max: -1 };

function extremum(args: Quantity[], pick: (...values: number[]) => number): Quantity {
  const first = args[0];
  if (args.some((arg) => !sameDims(arg.dims, first.dims))) {
    throw new CalcError("Every value must have the same units.");
  }
  return { value: pick(...args.map((arg) => arg.value)), dims: first.dims };
}

/**
 * Whether a unit-named identifier means the unit. Display units and names no
 * variable shadows always do. A shadowed name is still a unit when the chain
 * also holds an unshadowed unit ("9.81 m/s^2" with a mass m), and is the
 * variable when only shadowed names lead into another operand ("0.5 m v^2").
 * A shadowed name alone ("5 m") could be either, so it is reported.
 */
function readsAsUnit(node: Extract<Node, { type: "ident" }>, isVariable: (name: string) => boolean): boolean {
  if (!node.unit) return false;
  const chain = node.chain;
  if (!chain || !isVariable(node.name)) return true;
  if (chain.names.some((name) => !isVariable(name))) return true;
  if (chain.endedByOperand) return false;
  throw new CalcError(
    `${node.name} is both a unit and a variable here. Write *${node.name} to use the variable, or rename it.`
  );
}

function lookup(name: string, scope: Scope, locals: Map<string, Quantity>): Quantity | undefined {
  return locals.get(name) ?? scope.variables.get(name) ?? CONSTANTS[name] ?? unitNamed(name);
}

function multiply(left: Quantity, right: Quantity): Quantity {
  return finite({ value: left.value * right.value, dims: left.dims.map((d, i) => d + right.dims[i]) });
}

/** "x (y + 1)" parses as a call; when x is a value rather than a function, it multiplies. */
function valueBeforeParentheses(node: Node, scope: Scope, locals: Map<string, Quantity>): Quantity | undefined {
  if (node.type !== "call" || node.args.length !== 1) return undefined;
  if (scope.functions.has(node.name) || BUILTINS[node.name]) return undefined;
  return lookup(node.name, scope, locals);
}

function evaluate(node: Node, scope: Scope, locals: Map<string, Quantity>, depth: number): Quantity {
  switch (node.type) {
    case "number":
      return { value: node.value, dims: DIMENSIONLESS };
    case "ident": {
      if (readsAsUnit(node, (name) => locals.has(name) || scope.variables.has(name))) {
        return unitNamed(node.name)!;
      }
      const value = lookup(node.name, scope, locals);
      if (value) return value;
      if (scope.functions.has(node.name) || BUILTINS[node.name]) {
        throw new CalcError(`${node.name} is a function; call it like ${node.name}(x).`);
      }
      throw new CalcError(`${node.name} is not defined.`);
    }
    case "neg": {
      const operand = evaluate(node.operand, scope, locals, depth);
      return { value: -operand.value, dims: operand.dims };
    }
    case "binary": {
      const value = node.op === "^" ? valueBeforeParentheses(node.left, scope, locals) : undefined;
      if (value && node.left.type === "call") {
        // "x (y)^2" is x·y², not (x·y)².
        const power: Node = { type: "binary", op: "^", left: node.left.args[0], right: node.right };
        return multiply(value, evaluate(power, scope, locals, depth));
      }
      const left = evaluate(node.left, scope, locals, depth);
      const right = evaluate(node.right, scope, locals, depth);
      switch (node.op) {
        case "+":
        case "-":
          if (!sameDims(left.dims, right.dims)) {
            throw new CalcError(`The units don't match: ${plainUnit(left.dims)} and ${plainUnit(right.dims)}.`);
          }
          return finite({ value: node.op === "+" ? left.value + right.value : left.value - right.value, dims: left.dims });
        case "*":
          return multiply(left, right);
        case "/":
          if (right.value === 0) throw new CalcError("Division by zero.");
          return finite({ value: left.value / right.value, dims: left.dims.map((d, i) => d - right.dims[i]) });
        case "^": {
          const exponent = requireDimensionless(right, "An exponent");
          return finite({ value: left.value ** exponent, dims: left.dims.map((d) => d * exponent) });
        }
      }
      break;
    }
    case "call": {
      if (depth > MAX_DEPTH || ++scope.calls > MAX_CALLS) {
        throw new CalcError("The calculation is too deep. Check for a function that calls itself.");
      }
      const args = node.args.map((arg) => evaluate(arg, scope, locals, depth + 1));
      const user = scope.functions.get(node.name);
      if (user) {
        if (args.length !== user.params.length) {
          throw new CalcError(`${node.name} takes ${user.params.length} argument${user.params.length === 1 ? "" : "s"}.`);
        }
        const inner = new Map(user.params.map((param, index) => [param, args[index]]));
        return evaluate(user.body, scope, inner, depth + 1);
      }
      const builtin = BUILTINS[node.name];
      if (!builtin) {
        const value = valueBeforeParentheses(node, scope, locals);
        if (value) return multiply(value, args[0]);
        throw new CalcError(`${node.name} is not a known function.`);
      }
      const arity = BUILTIN_ARITY[node.name] ?? 1;
      if (arity === 1 ? args.length !== 1 : args.length === 0) {
        throw new CalcError(`${node.name} takes ${arity === 1 ? "one argument" : "at least one argument"}.`);
      }
      return finite(builtin(args));
    }
  }
  throw new CalcError("Could not evaluate that expression.");
}

// ---------------------------------------------------------------------------
// Formatting

type FormattedNumber = { mantissa: string; exponent: number | null };

function formatNumber(value: number): FormattedNumber {
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e9 || magnitude < 1e-4)) {
    const [mantissa, exponent] = value.toExponential(3).split("e");
    return { mantissa: trimZeros(mantissa), exponent: Number(exponent) };
  }
  const text = magnitude >= 1 ? value.toFixed(3) : value.toPrecision(4);
  return { mantissa: trimZeros(text), exponent: null };
}

function trimZeros(text: string): string {
  const trimmed = text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
  return trimmed === "-0" ? "0" : trimmed;
}

function exponentText(value: number): string {
  return trimZeros(value.toFixed(3));
}

type UnitPart = { symbol: string; power: number };

function unitParts(quantityDims: Dims): UnitPart[] {
  const named = DISPLAY_UNITS.find(([, unitDims]) => sameDims(unitDims, quantityDims));
  if (named) return [{ symbol: named[0], power: 1 }];
  return quantityDims
    .map((power, index) => ({ symbol: BASE_SYMBOLS[index], power }))
    .filter((part) => Math.abs(part.power) > EPSILON);
}

function plainUnit(quantityDims: Dims): string {
  const parts = unitParts(quantityDims);
  if (parts.length === 0) return "no units";
  return parts.map((part) => part.power === 1 ? part.symbol : `${part.symbol}^${exponentText(part.power)}`).join("·");
}

function latexUnitSymbol(symbol: string): string {
  return `\\mathrm{${symbol.replace(/μ/g, "\\mu ").replace(/Ω/g, "\\Omega ")}}`;
}

function latexUnitPart(part: UnitPart, power: number): string {
  const symbol = latexUnitSymbol(part.symbol);
  return power === 1 ? symbol : `${symbol}^{${exponentText(power)}}`;
}

function latexDims(quantityDims: Dims): string {
  const parts = unitParts(quantityDims);
  const numerator = parts.filter((part) => part.power > 0).map((part) => latexUnitPart(part, part.power));
  const denominator = parts.filter((part) => part.power < 0).map((part) => latexUnitPart(part, -part.power));
  if (denominator.length === 0) return numerator.join("\\cdot ");
  return `\\frac{${numerator.join("\\cdot ") || "1"}}{${denominator.join("\\cdot ")}}`;
}

function plainNumber(value: number): string {
  const { mantissa, exponent } = formatNumber(value);
  return exponent === null ? mantissa : `${mantissa}·10^${exponent}`;
}

function latexNumber(value: number): string {
  const { mantissa, exponent } = formatNumber(value);
  return exponent === null ? mantissa : `${mantissa}\\cdot 10^{${exponent}}`;
}

type Kind = "variable" | "unit" | "constant" | "function";

function latexIdentifier(name: string, kind: Kind): string {
  if (kind === "unit") {
    if (name === "°") return "^{\\circ}";
    return latexUnitSymbol(UNIT_ALIASES[name] ?? name);
  }
  if (name === "pi" || name === "π") return "\\pi ";
  const [base, ...rest] = name.split("_");
  const subscript = rest.join("_");
  let head: string;
  if (GREEK.has(base)) head = `\\${base} `;
  else if (kind === "function") head = `\\operatorname{${base}}`;
  else head = base.length > 1 && !/^[Ͱ-Ͽ]+'*$/.test(base) ? `\\mathit{${base}}` : base;
  if (!subscript) return head;
  return `{${head}}_{\\mathrm{${subscript.replace(/_/g, "\\_")}}}`;
}

const PRECEDENCE: Record<Node["type"] | "+" | "-" | "*" | "/" | "^", number> = {
  "+": 1, "-": 1, "*": 2, "/": 2, neg: 3, "^": 4, number: 5, ident: 5, call: 5, binary: 0
};

function precedenceOf(node: Node): number {
  return node.type === "binary" ? PRECEDENCE[node.op] : PRECEDENCE[node.type];
}

type Classifier = (name: string) => Kind;

function toLatex(node: Node, classify: Classifier): string {
  const wrap = (child: Node, minimum: number) => {
    const latex = toLatex(child, classify);
    return precedenceOf(child) < minimum ? `\\left(${latex}\\right)` : latex;
  };
  switch (node.type) {
    case "number":
      return node.text.replace(/[eE]([+-]?\d+)$/, (_m, exponent) => `\\cdot 10^{${Number(exponent)}}`);
    case "ident": {
      let unit: boolean;
      try {
        unit = readsAsUnit(node, (name) => classify(name) === "variable");
      } catch {
        unit = true;
      }
      return latexIdentifier(node.name, unit ? "unit" : classify(node.name));
    }
    case "neg":
      return `-${wrap(node.operand, 3)}`;
    case "call": {
      const args = node.args.map((arg) => toLatex(arg, classify));
      if (node.name === "sqrt" && args.length === 1 && classify(node.name) !== "function") {
        return `\\sqrt{${args[0]}}`;
      }
      if (node.name === "abs" && args.length === 1 && classify(node.name) !== "function") {
        return `\\left|${args[0]}\\right|`;
      }
      const kind = classify(node.name);
      if (kind !== "function" && !BUILTINS[node.name]) {
        return `${latexIdentifier(node.name, kind)}\\left(${args.join(", ")}\\right)`;
      }
      return `${latexIdentifier(node.name, "function")}\\left(${args.join(", ")}\\right)`;
    }
    case "binary":
      switch (node.op) {
        case "+":
          return `${wrap(node.left, 1)} + ${wrap(node.right, 1)}`;
        case "-":
          return `${wrap(node.left, 1)} - ${wrap(node.right, 2)}`;
        case "*": {
          const glue = node.right.type === "ident" && node.right.name === "°"
            && (node.right.unit || classify("°") === "unit")
            ? ""
            : node.implicit ? "\\," : "\\cdot ";
          return `${wrap(node.left, 2)}${glue}${wrap(node.right, 3)}`;
        }
        case "/":
          return `\\frac{${toLatex(node.left, classify)}}{${toLatex(node.right, classify)}}`;
        case "^":
          return `{${wrap(node.left, 5)}}^{${toLatex(node.right, classify)}}`;
      }
  }
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, "/")
    .replace(/[{}$%#&_]/g, (char) => `\\${char}`)
    // MathJax text mode has no escape for these, so use look-alikes.
    .replace(/\^/g, "ˆ")
    .replace(/~/g, "˜");
}

// ---------------------------------------------------------------------------
// Worksheet lines

export type CalcLine =
  | { kind: "blank" }
  | { kind: "text"; text: string }
  | { kind: "math"; source: string; latex: string; plain: string }
  | { kind: "error"; source: string; message: string };

export type CalcWorksheet = { lines: CalcLine[] };

const DEFINITION = /^\s*([^\s(:=]+)\s*(?:\(([^)]*)\))?\s*:=(.*)$/;
const IDENTIFIER = new RegExp(`^${IDENT_START.source}${IDENT_PART.source}*$`);

function splitEvaluation(text: string): { expression: string; evaluate: boolean; unit: string } {
  const index = text.indexOf("=");
  if (index < 0) return { expression: text, evaluate: false, unit: "" };
  if (text.indexOf("=", index + 1) >= 0) throw new CalcError("Use one “=” per line.");
  return { expression: text.slice(0, index), evaluate: true, unit: text.slice(index + 1).trim() };
}

function formatResult(
  result: Quantity,
  unitText: string,
  scope: Scope,
  classify: Classifier
): { latex: string; plain: string } {
  if (!unitText) {
    const unitLatex = isDimensionless(result) ? "" : `\\,${latexDims(result.dims)}`;
    const unitPlain = isDimensionless(result) ? "" : ` ${plainUnit(result.dims)}`;
    return { latex: `${latexNumber(result.value)}${unitLatex}`, plain: `${plainNumber(result.value)}${unitPlain}` };
  }
  const unitNode = parseUnits(unitText);
  const unit = evaluate(unitNode, scope, new Map(), 0);
  if (!sameDims(unit.dims, result.dims)) {
    throw new CalcError(`The result is in ${plainUnit(result.dims)}, which can't be shown in ${unitText}.`);
  }
  if (unit.value === 0) throw new CalcError(`${unitText} can't be used as a display unit.`);
  const value = result.value / unit.value;
  const unitLatex = toLatex(unitNode, classify);
  const glue = unitText === "°" ? "" : "\\,";
  return {
    latex: `${latexNumber(value)}${glue}${unitLatex}`,
    plain: `${plainNumber(value)}${unitText === "°" ? "" : " "}${unitText}`
  };
}

function evaluateLine(line: string, scope: Scope): CalcLine {
  const definition = DEFINITION.exec(line);
  // Built-in functions are only recognised in call position, so "5 min"
  // still reads as minutes. "function" here means a user-defined function.
  const classify = (locals: Set<string>): Classifier => (name) => {
    if (locals.has(name)) return "variable";
    if (scope.functions.has(name)) return "function";
    if (scope.variables.has(name)) return "variable";
    if (CONSTANTS[name]) return "constant";
    if (unitNamed(name)) return "unit";
    return "variable";
  };

  if (definition) {
    const name = definition[1];
    if (!IDENTIFIER.test(name)) throw new CalcError(`“${name}” can't be used as a name.`);
    const params = definition[2] === undefined
      ? null
      : definition[2].split(",").map((param) => param.trim()).filter(Boolean);
    if (params?.some((param) => !IDENTIFIER.test(param))) {
      throw new CalcError("Function parameters must be simple names.");
    }
    const { expression, evaluate: show, unit } = splitEvaluation(definition[3]);
    const body = parseExpression(expression);
    const locals = new Set(params ?? []);
    const bodyLatex = toLatex(body, classify(locals));
    const lhsLatex = params
      ? `${latexIdentifier(name, "function")}\\left(${params.map((param) => latexIdentifier(param, "variable")).join(", ")}\\right)`
      : latexIdentifier(name, "variable");

    if (params) {
      if (show) throw new CalcError("A function definition can't show a value.");
      scope.functions.set(name, { params, body });
      scope.variables.delete(name);
      return { kind: "math", source: line, latex: `${lhsLatex} \\mathrel{:=} ${bodyLatex}`, plain: line.trim() };
    }

    const value = evaluate(body, scope, new Map(), 0);
    scope.variables.set(name, value);
    scope.functions.delete(name);
    const latex = `${lhsLatex} \\mathrel{:=} ${bodyLatex}`;
    if (!show) return { kind: "math", source: line, latex, plain: line.trim() };
    const result = formatResult(value, unit, scope, classify(new Set()));
    return {
      kind: "math",
      source: line,
      latex: `${latex} = ${result.latex}`,
      plain: `${line.slice(0, line.indexOf("=", line.indexOf(":=") + 2)).trim()} = ${result.plain}`
    };
  }

  const { expression, evaluate: show, unit } = splitEvaluation(line);
  const node = parseExpression(expression);
  const classifier = classify(new Set());
  const latex = toLatex(node, classifier);
  if (!show) {
    evaluate(node, scope, new Map(), 0);
    return { kind: "math", source: line, latex, plain: line.trim() };
  }
  const result = formatResult(evaluate(node, scope, new Map(), 0), unit, scope, classifier);
  return {
    kind: "math",
    source: line,
    latex: `${latex} = ${result.latex}`,
    plain: `${expression.trim()} = ${result.plain}`
  };
}

/** Evaluates every line in order. Errors stay on their own line. */
export function evaluateWorksheet(source: string): CalcWorksheet {
  const text = source.trim();
  if (!text) throw new CalcError("Add a calculation first.");
  if (text.length > MAX_CALC_SOURCE_LENGTH) throw new CalcError("That calculation is too large to render.");
  const rawLines = text.split(/\r?\n/);
  if (rawLines.length > MAX_LINES) throw new CalcError(`Keep a calculation to ${MAX_LINES} lines or fewer.`);

  const scope: Scope = { variables: new Map(), functions: new Map(), calls: 0 };
  const lines = rawLines.map((line): CalcLine => {
    const trimmed = line.trim();
    if (!trimmed) return { kind: "blank" };
    if (trimmed.startsWith("#")) return { kind: "text", text: trimmed.replace(/^#+\s*/, "") };
    scope.calls = 0;
    try {
      return evaluateLine(line, scope);
    } catch (error) {
      return {
        kind: "error",
        source: trimmed,
        message: error instanceof CalcError ? error.message : "Could not evaluate this line."
      };
    }
  });
  return { lines };
}

/** One LaTeX array, one row per line, for MathJax. */
export function worksheetToLatex(worksheet: CalcWorksheet): string {
  const rows: string[] = [];
  for (const line of worksheet.lines) {
    switch (line.kind) {
      case "blank":
        if (rows.length > 0 && rows[rows.length - 1] !== "") rows.push("");
        break;
      case "text":
        rows.push(`\\text{${escapeText(line.text)}}`);
        break;
      case "math":
        // Array cells default to text style, which shrinks fractions.
        rows.push(`\\displaystyle ${line.latex}`);
        break;
      case "error":
        rows.push(
          `\\text{${escapeText(line.source)}}\\quad`
          + `\\color{#c0392b}{\\text{${escapeText(line.message)}}}`
        );
        break;
    }
  }
  while (rows[rows.length - 1] === "") rows.pop();
  if (rows.length === 0) throw new CalcError("Add a calculation first.");
  return `\\begin{array}{l}${rows.join("\\\\[0.4em]")}\\end{array}`;
}

/** Evaluated worksheet as readable text for plain-text export. */
export function worksheetToPlainText(source: string): string {
  let worksheet: CalcWorksheet;
  try {
    worksheet = evaluateWorksheet(source);
  } catch {
    return source.trim();
  }
  return worksheet.lines
    .map((line) => {
      switch (line.kind) {
        case "blank":
          return "";
        case "text":
          return line.text;
        case "math":
          return line.plain;
        case "error":
          return `${line.source}  [${line.message}]`;
      }
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
