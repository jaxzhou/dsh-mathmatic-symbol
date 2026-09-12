/**
 * @jaxzhou/dsh-mathmatic-symbol — generated Host bundle. Do not edit; run `npm run build`.
 */

// src/svg.ts
var HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
var NAMED_COLOR = /^[a-zA-Z]{3,24}$/;
var FUNCTIONAL_COLOR = /^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s/]+\)$/;
function isSafeColor(value) {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return false;
  return HEX_COLOR.test(trimmed) || NAMED_COLOR.test(trimmed) || FUNCTIONAL_COLOR.test(trimmed);
}
function formatNumber(value, maxDecimals = 3) {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);
  const rounded = Number(value.toFixed(maxDecimals));
  return String(rounded);
}
function escapeAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
function colorize(markup, color) {
  return markup.replaceAll("currentColor", color);
}

// src/config.ts
var DEFAULTS = {
  outputDir: "math",
  scale: 4,
  color: "#000000",
  background: "transparent",
  padding: 8,
  fontSize: 16,
  preview: false,
  dataUri: false
};
function fail(name2, expectation) {
  throw new Error(`math-symbol config: "${name2}" ${expectation}`);
}
function readNumber(value, name2, min, max) {
  if (value === void 0) return void 0;
  if (typeof value !== "number" || !Number.isFinite(value)) fail(name2, "must be a finite number");
  if (value < min || value > max) fail(name2, `must be between ${min} and ${max}`);
  return value;
}
function readBoolean(value, name2) {
  if (value === void 0) return void 0;
  if (typeof value !== "boolean") fail(name2, "must be a boolean");
  return value;
}
function readString(value, name2) {
  if (value === void 0) return void 0;
  if (typeof value !== "string" || value.trim().length === 0) fail(name2, "must be a non-empty string");
  return value.trim();
}
function resolveConfig(input) {
  if (input !== void 0 && (typeof input !== "object" || input === null || Array.isArray(input))) {
    throw new Error("math-symbol config: expected an object");
  }
  const raw = input ?? {};
  const outputDir = readString(raw.outputDir, "outputDir") ?? DEFAULTS.outputDir;
  if (outputDir.startsWith("/") || outputDir.includes("..")) {
    fail("outputDir", 'must be a workspace-relative directory without ".."');
  }
  const color = readString(raw.color, "color") ?? DEFAULTS.color;
  if (!isSafeColor(color)) fail("color", 'must be a flat CSS color such as "#111827"');
  const background = readString(raw.background, "background") ?? DEFAULTS.background;
  if (background !== "transparent" && !isSafeColor(background)) {
    fail("background", 'must be "transparent" or a flat CSS color');
  }
  const workspaceRoot = readString(raw.workspaceRoot, "workspaceRoot");
  const resolved = {
    outputDir,
    scale: readNumber(raw.scale, "scale", 0.25, 16) ?? DEFAULTS.scale,
    color,
    background,
    padding: Math.round(readNumber(raw.padding, "padding", 0, 128) ?? DEFAULTS.padding),
    fontSize: readNumber(raw.fontSize, "fontSize", 6, 96) ?? DEFAULTS.fontSize,
    preview: readBoolean(raw.preview, "preview") ?? DEFAULTS.preview,
    dataUri: readBoolean(raw.dataUri, "dataUri") ?? DEFAULTS.dataUri
  };
  if (workspaceRoot !== void 0) resolved.workspaceRoot = workspaceRoot;
  return resolved;
}

// src/expr.ts
var CONSTANTS = Object.freeze({
  pi: Math.PI,
  \u03C0: Math.PI,
  tau: Math.PI * 2,
  e: Math.E,
  phi: (1 + Math.sqrt(5)) / 2
});
function define1(names, fn) {
  return names.map((name2) => [name2, { minArgs: 1, maxArgs: 1, apply: (args) => fn(args[0]) }]);
}
function define2(names, fn) {
  return names.map((name2) => [name2, { minArgs: 2, maxArgs: 2, apply: (args) => fn(args[0], args[1]) }]);
}
var FUNCTIONS = new Map([
  ...define1(["sin"], Math.sin),
  ...define1(["cos"], Math.cos),
  ...define1(["tan"], Math.tan),
  ...define1(["asin", "arcsin"], Math.asin),
  ...define1(["acos", "arccos"], Math.acos),
  ...define1(["atan", "arctan"], Math.atan),
  ...define1(["sinh"], Math.sinh),
  ...define1(["cosh"], Math.cosh),
  ...define1(["tanh"], Math.tanh),
  ...define1(["asinh"], Math.asinh),
  ...define1(["acosh"], Math.acosh),
  ...define1(["atanh"], Math.atanh),
  ...define1(["sqrt"], Math.sqrt),
  ...define1(["cbrt"], Math.cbrt),
  ...define1(["abs"], Math.abs),
  ...define1(["exp"], Math.exp),
  ...define1(["ln", "log"], Math.log),
  ...define1(["log2"], Math.log2),
  ...define1(["log10"], Math.log10),
  ...define1(["floor"], Math.floor),
  ...define1(["ceil"], Math.ceil),
  ...define1(["round"], Math.round),
  ...define1(["trunc"], Math.trunc),
  ...define1(["sign"], Math.sign),
  ...define1(["cot"], (x) => 1 / Math.tan(x)),
  ...define1(["sec"], (x) => 1 / Math.cos(x)),
  ...define1(["csc"], (x) => 1 / Math.sin(x)),
  ...define2(["atan2"], Math.atan2),
  ...define2(["pow"], (a, b) => a ** b),
  ...define2(["hypot"], Math.hypot),
  ...define2(["min"], Math.min),
  ...define2(["max"], Math.max),
  ...define2(["mod"], (a, b) => a % b),
  ...define2(["gcd"], (a, b) => {
    let x = Math.abs(Math.trunc(a));
    let y = Math.abs(Math.trunc(b));
    while (y > 0) [x, y] = [y, x % y];
    return x;
  })
]);
var MAX_DEPTH = 64;
var MAX_SOURCE_LENGTH = 2e3;
var IDENT_START = /[\p{L}_]/u;
var IDENT_PART = /[\p{L}\p{N}_]/u;
function tokenize(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === " " || char === "	" || char === "\n" || char === "\r") {
      index += 1;
      continue;
    }
    if (char === "\\") {
      index += 1;
      if (index >= source.length || !IDENT_START.test(source[index])) {
        throw new Error(`unexpected "\\" at position ${index - 1}`);
      }
      continue;
    }
    if (char >= "0" && char <= "9" || char === ".") {
      const start = index;
      while (index < source.length && /[0-9]/.test(source[index])) index += 1;
      if (source[index] === ".") {
        index += 1;
        while (index < source.length && /[0-9]/.test(source[index])) index += 1;
      }
      if (source[index] === "e" || source[index] === "E") {
        const expStart = index;
        index += 1;
        if (source[index] === "+" || source[index] === "-") index += 1;
        if (index < source.length && /[0-9]/.test(source[index])) {
          while (index < source.length && /[0-9]/.test(source[index])) index += 1;
        } else {
          index = expStart;
        }
      }
      const literal = source.slice(start, index);
      const value = Number(literal);
      if (!Number.isFinite(value)) throw new Error(`"${literal}" is not a finite number`);
      tokens.push({ kind: "number", value });
      continue;
    }
    if (IDENT_START.test(char)) {
      const start = index;
      while (index < source.length && IDENT_PART.test(source[index])) index += 1;
      tokens.push({ kind: "ident", value: source.slice(start, index) });
      continue;
    }
    if (char === "(") {
      tokens.push({ kind: "lparen" });
      index += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ kind: "rparen" });
      index += 1;
      continue;
    }
    if (char === ",") {
      tokens.push({ kind: "comma" });
      index += 1;
      continue;
    }
    if (char === "+" || char === "-" || char === "*" || char === "/" || char === "%" || char === "^") {
      tokens.push({ kind: "op", value: char });
      index += 1;
      continue;
    }
    throw new Error(`unexpected character "${char}" at position ${index}`);
  }
  if (tokens.length === 0) throw new Error("the expression is empty");
  return tokens;
}
var compiled = /* @__PURE__ */ new Map();
function compileExpression(source) {
  const cached = compiled.get(source);
  if (cached !== void 0) return cached;
  if (source.length > MAX_SOURCE_LENGTH) {
    throw new Error(`the expression is longer than ${MAX_SOURCE_LENGTH} characters`);
  }
  const tokens = tokenize(source);
  let position = 0;
  let depth = 0;
  const peek = () => tokens[position];
  const enter = () => {
    depth += 1;
    if (depth > MAX_DEPTH) throw new Error(`the expression nests deeper than ${MAX_DEPTH} levels`);
  };
  const leave = () => {
    depth -= 1;
  };
  const startsPrimary = (token) => token !== void 0 && (token.kind === "number" || token.kind === "ident" || token.kind === "lparen");
  const parseExpression = () => {
    enter();
    let left = parseTerm();
    for (; ; ) {
      const token = peek();
      if (token?.kind === "op" && (token.value === "+" || token.value === "-")) {
        position += 1;
        const right = parseTerm();
        const previous = left;
        left = token.value === "+" ? (vars) => previous(vars) + right(vars) : (vars) => previous(vars) - right(vars);
        continue;
      }
      break;
    }
    leave();
    return left;
  };
  const parseTerm = () => {
    enter();
    let left = parseUnary();
    for (; ; ) {
      const token = peek();
      if (token?.kind === "op" && (token.value === "*" || token.value === "/" || token.value === "%")) {
        position += 1;
        const right = parseUnary();
        const previous = left;
        left = token.value === "*" ? (vars) => previous(vars) * right(vars) : token.value === "/" ? (vars) => previous(vars) / right(vars) : (vars) => previous(vars) % right(vars);
        continue;
      }
      if (startsPrimary(token)) {
        const right = parseUnary();
        const previous = left;
        left = (vars) => previous(vars) * right(vars);
        continue;
      }
      break;
    }
    leave();
    return left;
  };
  const parseUnary = () => {
    enter();
    const token = peek();
    if (token?.kind === "op" && (token.value === "-" || token.value === "+")) {
      position += 1;
      const operand = parseUnary();
      leave();
      return token.value === "-" ? (vars) => -operand(vars) : operand;
    }
    const power = parsePower();
    leave();
    return power;
  };
  const parsePower = () => {
    enter();
    const base = parsePrimary();
    const token = peek();
    if (token?.kind === "op" && token.value === "^") {
      position += 1;
      const exponent = parseUnary();
      leave();
      return (vars) => base(vars) ** exponent(vars);
    }
    leave();
    return base;
  };
  const parsePrimary = () => {
    enter();
    const token = peek();
    if (token === void 0) throw new Error('the expression ends unexpectedly: a missing operand or an unclosed "("');
    if (token.kind === "number") {
      position += 1;
      const value = token.value;
      leave();
      return () => value;
    }
    if (token.kind === "lparen") {
      position += 1;
      const inner = parseExpression();
      const closing = peek();
      if (closing?.kind !== "rparen") throw new Error('a "(" is not closed');
      position += 1;
      leave();
      return inner;
    }
    if (token.kind === "ident") {
      position += 1;
      const name2 = token.value;
      const definition = FUNCTIONS.get(name2.toLowerCase());
      if (definition !== void 0 && peek()?.kind === "lparen") {
        position += 1;
        const args = [parseExpression()];
        while (peek()?.kind === "comma") {
          position += 1;
          args.push(parseExpression());
        }
        const closing = peek();
        if (closing?.kind !== "rparen") throw new Error(`the call to "${name2}(\u2026" is not closed`);
        position += 1;
        if (args.length < definition.minArgs || args.length > definition.maxArgs) {
          const arity = definition.minArgs === definition.maxArgs ? `${definition.minArgs}` : `${definition.minArgs}\u2013${definition.maxArgs}`;
          throw new Error(`"${name2}" takes ${arity} argument(s), not ${args.length}`);
        }
        leave();
        return (vars) => definition.apply(args.map((argument) => argument(vars)));
      }
      if (CONSTANTS[name2] !== void 0) {
        const value = CONSTANTS[name2];
        leave();
        return () => value;
      }
      const lower = name2.toLowerCase();
      if (CONSTANTS[lower] !== void 0) {
        const value = CONSTANTS[lower];
        leave();
        return () => value;
      }
      leave();
      return (vars) => {
        const value = vars[name2];
        if (value === void 0) throw new Error(`unknown variable "${name2}"`);
        if (!Number.isFinite(value)) throw new Error(`the variable "${name2}" is not a finite number`);
        return value;
      };
    }
    throw new Error(`unexpected token in the expression at position ${position}`);
  };
  const root = parseExpression();
  if (position !== tokens.length) throw new Error(`unexpected trailing input at token ${position}`);
  if (compiled.size > 512) compiled.clear();
  compiled.set(source, root);
  return root;
}
function evaluateExpression(source, vars = {}) {
  return compileExpression(source)(vars);
}
function clearExpressionCache() {
  compiled.clear();
}

// src/latex.ts
var UNITS_PER_EM = 1e3;
var EX_PER_EM = 442;
var CONTAINER_WIDTH = 1e7;
var EXCLUDED_PACKAGES = /* @__PURE__ */ new Set([
  "html",
  // \class \style \cssId \href — markup injection into the SVG
  "require",
  // pulls arbitrary further packages at parse time
  "autoload",
  // lazy package loading; unnecessary when all are loaded
  "action",
  // \toggle-style interactive markup
  "annotation",
  // MathML annotation payloads
  "semantics",
  // MathML annotation wrappers
  "noerrors"
  // would hide TeX errors instead of rendering them
]);
var runtimePromise;
var fragmentCache = /* @__PURE__ */ new Map();
async function createRuntime() {
  const [mathjaxModule, texModule, svgModule, adaptorModule, handlerModule, packagesModule] = await Promise.all([
    import("mathjax-full/js/mathjax.js"),
    import("mathjax-full/js/input/tex.js"),
    import("mathjax-full/js/output/svg.js"),
    import("mathjax-full/js/adaptors/liteAdaptor.js"),
    import("mathjax-full/js/handlers/html.js"),
    import("mathjax-full/js/input/tex/AllPackages.js")
  ]);
  const adaptor = adaptorModule.liteAdaptor();
  handlerModule.RegisterHTMLHandler(adaptor);
  const packages = packagesModule.AllPackages.filter((name2) => !EXCLUDED_PACKAGES.has(name2));
  const tex = new texModule.TeX({ packages: [...packages] });
  const svg = new svgModule.SVG({ fontCache: "none" });
  const document = mathjaxModule.mathjax.document("", { InputJax: tex, OutputJax: svg });
  return {
    convert(source, display) {
      const node = document.convert(source, {
        display,
        em: UNITS_PER_EM,
        ex: EX_PER_EM,
        containerWidth: CONTAINER_WIDTH
      });
      return adaptor.outerHTML(node);
    }
  };
}
async function getRuntime() {
  runtimePromise ??= createRuntime().catch((error) => {
    runtimePromise = void 0;
    throw new Error(`MathJax could not be loaded: ${error instanceof Error ? error.message : String(error)}`);
  });
  return runtimePromise;
}
function parseViewBox(markup, tex) {
  const match = /\sviewBox="([^"]+)"/.exec(markup);
  const numbers = match?.[1]?.trim().split(/[\s,]+/).map(Number);
  if (numbers === void 0 || numbers.length !== 4 || numbers.some((value) => !Number.isFinite(value))) {
    throw new Error(`MathJax produced an SVG without a usable viewBox for "${tex}"`);
  }
  return { minY: numbers[1], width: numbers[2], height: numbers[3] };
}
async function renderTex(tex, display) {
  const source = tex.trim();
  if (source.length === 0) throw new Error("the LaTeX source is empty");
  const key = `${display ? "D" : "I"}\0${source}`;
  const cached = fragmentCache.get(key);
  if (cached !== void 0) return cached;
  const runtime = await getRuntime();
  let html;
  try {
    html = runtime.convert(source, display);
  } catch (error) {
    throw new Error(`the LaTeX did not parse: ${error instanceof Error ? error.message : String(error)}`);
  }
  const outer = /<svg[\s\S]*?<\/svg>/.exec(html)?.[0];
  if (outer === void 0) throw new Error("MathJax produced no SVG for the given LaTeX");
  const viewBox = parseViewBox(outer, source);
  const inner = outer.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const rendered = {
    inner,
    width: viewBox.width,
    height: viewBox.height,
    above: Math.max(0, -viewBox.minY),
    depth: Math.max(0, viewBox.minY + viewBox.height),
    errored: inner.includes('data-mml-node="merror"')
  };
  if (fragmentCache.size > 512) fragmentCache.clear();
  fragmentCache.set(key, rendered);
  return rendered;
}
function clearTexCache() {
  fragmentCache.clear();
}
function standaloneTexSvg(rendered, options) {
  const scale = options.fontSize / UNITS_PER_EM;
  const padding = options.padding;
  const width = Math.max(1, Math.ceil(rendered.width * scale + padding * 2));
  const height = Math.max(1, Math.ceil(rendered.height * scale + padding * 2));
  const background = options.background !== void 0 && options.background !== "transparent" ? `<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeAttribute(options.background)}"/>` : "";
  const body = colorize(rendered.inner, options.color);
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">` + background + `<g transform="translate(${formatNumber(padding)} ${formatNumber(padding + rendered.above * scale)}) scale(${formatNumber(scale, 6)})">${body}</g></svg>`,
    width,
    height
  };
}
function inlineTexFragment(rendered, x, y, options) {
  const scale = options.fontSize / UNITS_PER_EM;
  const width = rendered.width * scale;
  const above = rendered.above * scale;
  const depth = rendered.depth * scale;
  let translateX = x;
  if (options.anchor === "middle") translateX = x - width / 2;
  else if (options.anchor === "end") translateX = x - width;
  let translateY = y;
  if (options.valign === "middle") translateY = y - (depth - above) / 2;
  else if (options.valign === "top") translateY = y + above;
  else if (options.valign === "bottom") translateY = y - depth;
  const rotate = options.rotate !== void 0 && options.rotate !== 0 ? ` rotate(${formatNumber(options.rotate)})` : "";
  return `<g transform="translate(${formatNumber(translateX)} ${formatNumber(translateY)})${rotate} scale(${formatNumber(scale, 6)})">${colorize(rendered.inner, options.color)}</g>`;
}

// src/figure.ts
var DEFAULT_WIDTH = 480;
var DEFAULT_HEIGHT = 360;
var DEFAULT_PADDING = 16;
var DEFAULT_INK = "#1f2937";
var AXIS_COLOR = "#94a3b8";
var GRID_COLOR = "#e2e8f0";
var LABEL_COLOR = "#0f172a";
var DEFAULT_STROKE = 1.6;
var LABEL_SIZE = 14;
var TICK_SIZE = 12;
var TITLE_SIZE = 18;
var ARROW_SIZE = 8;
var ANGLE_RADIUS = 30;
var RIGHT_ANGLE_SIZE = 10;
var MAX_ELEMENTS = 200;
var MAX_SAMPLES = 4e3;
var MAX_GRID_LINES = 120;
var MAX_TICKS = 40;
function fail2(path4, message) {
  throw new Error(`figure spec: ${path4} ${message}`);
}
function asRecord(value, path4) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail2(path4, "must be an object");
  return value;
}
function assertKeys(raw, allowed, path4) {
  const unknown = Object.keys(raw).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    fail2(path4, `has unknown key(s) ${unknown.map((key) => `"${key}"`).join(", ")}; allowed: ${allowed.join(", ")}`);
  }
}
function optionalNumber(raw, key, path4, min, max) {
  const value = raw[key];
  if (value === void 0) return void 0;
  if (typeof value !== "number" || !Number.isFinite(value)) fail2(`${path4}.${key}`, "must be a finite number");
  if (min !== void 0 && value < min) fail2(`${path4}.${key}`, `must be at least ${min}`);
  if (max !== void 0 && value > max) fail2(`${path4}.${key}`, `must be at most ${max}`);
  return value;
}
function numberField(raw, key, path4, fallback) {
  return optionalNumber(raw, key, path4) ?? fallback;
}
function optionalBoolean(raw, key, path4) {
  const value = raw[key];
  if (value === void 0) return void 0;
  if (typeof value !== "boolean") fail2(`${path4}.${key}`, "must be a boolean");
  return value;
}
function optionalString(raw, key, path4) {
  const value = raw[key];
  if (value === void 0) return void 0;
  if (typeof value !== "string" || value.length === 0) fail2(`${path4}.${key}`, "must be a non-empty string");
  return value;
}
function readColor(raw, key, path4, fallback) {
  const value = optionalString(raw, key, path4);
  if (value === void 0) return fallback;
  if (!isSafeColor(value)) fail2(`${path4}.${key}`, `"${value}" is not a flat CSS color`);
  return value;
}
function readStyle(raw, path4) {
  const value = optionalString(raw, "style", path4) ?? "solid";
  if (value !== "solid" && value !== "dashed" && value !== "dotted") {
    fail2(`${path4}.style`, 'must be "solid", "dashed", or "dotted"');
  }
  return value;
}
function readArrow(raw, path4, fallback) {
  const value = optionalString(raw, "arrow", path4) ?? fallback;
  if (value !== "none" && value !== "end" && value !== "both" && value !== "start") {
    fail2(`${path4}.arrow`, 'must be "none", "end", "start", or "both"');
  }
  return value;
}
function readRange(raw, key, path4) {
  const value = raw[key];
  if (value === void 0) return void 0;
  if (!Array.isArray(value) || value.length !== 2) fail2(`${path4}.${key}`, "must be a [min, max] pair");
  const first = value[0];
  const second = value[1];
  if (typeof first !== "number" || typeof second !== "number" || !Number.isFinite(first) || !Number.isFinite(second)) {
    fail2(`${path4}.${key}`, "must be a [min, max] pair of finite numbers");
  }
  if (first >= second) fail2(`${path4}.${key}`, "must satisfy min < max");
  return [first, second];
}
function readOffset(raw, path4, fallback) {
  const value = raw.label_offset;
  if (value === void 0) return fallback;
  if (!Array.isArray(value) || value.length !== 2) {
    fail2(`${path4}.label_offset`, "must be a [dx, dy] pair");
  }
  const first = value[0];
  const second = value[1];
  if (typeof first !== "number" || typeof second !== "number" || !Number.isFinite(first) || !Number.isFinite(second)) {
    fail2(`${path4}.label_offset`, "must be a [dx, dy] pair of finite numbers in screen pixels (y grows downward)");
  }
  return [first, second];
}
function readAnchor(raw, path4, fallback) {
  const value = optionalString(raw, "anchor", path4) ?? fallback;
  if (value !== "start" && value !== "middle" && value !== "end") fail2(`${path4}.anchor`, 'must be "start", "middle", or "end"');
  return value;
}
function readValign(raw, path4, fallback) {
  const value = optionalString(raw, "valign", path4) ?? fallback;
  if (value !== "baseline" && value !== "middle" && value !== "top" && value !== "bottom") {
    fail2(`${path4}.valign`, 'must be "baseline", "middle", "top", or "bottom"');
  }
  return value;
}
function readFill(raw, path4) {
  const fill = optionalString(raw, "fill", path4);
  if (fill === void 0 || fill === "none") return { fill: null, fillOpacity: 0 };
  if (!isSafeColor(fill)) fail2(`${path4}.fill`, `"${fill}" is not a flat CSS color`);
  return { fill, fillOpacity: optionalNumber(raw, "fill_opacity", path4, 0, 1) ?? 0.18 };
}
function extend(state, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (!state.touched) {
    state.minX = x;
    state.maxX = x;
    state.minY = y;
    state.maxY = y;
    state.touched = true;
    return;
  }
  state.minX = Math.min(state.minX, x);
  state.maxX = Math.max(state.maxX, x);
  state.minY = Math.min(state.minY, y);
  state.maxY = Math.max(state.maxY, y);
}
function scalar(raw, path4, vars) {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) fail2(path4, "must be a finite number");
    return raw;
  }
  if (typeof raw === "string") {
    try {
      const value = evaluateExpression(raw, vars);
      if (!Number.isFinite(value)) fail2(path4, `"${raw}" evaluated to ${String(value)}, which is not a usable coordinate`);
      return value;
    } catch (error) {
      fail2(path4, `"${raw}" is not a usable expression: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  fail2(path4, "must be a number or an expression string");
}
function pointRef(raw, path4, state) {
  if (typeof raw === "string") {
    const found = state.points.get(raw);
    if (found === void 0) {
      const known = [...state.points.keys()];
      fail2(path4, `references unknown point "${raw}"${known.length > 0 ? `; defined so far: ${known.join(", ")}` : '; define it with a "point" element first'}`);
    }
    return [found[0], found[1]];
  }
  if (Array.isArray(raw) && raw.length === 2) {
    return [scalar(raw[0], `${path4}[0]`, state.vars), scalar(raw[1], `${path4}[1]`, state.vars)];
  }
  fail2(path4, "must be a point label string or an [x, y] pair");
}
function pointList(raw, path4, state) {
  if (!Array.isArray(raw) || raw.length === 0) fail2(path4, "must be a non-empty array of points");
  return raw.map((item, index) => pointRef(item, `${path4}[${index}]`, state));
}
function resolveVars(raw) {
  if (raw === void 0) return {};
  const record = asRecord(raw, '"vars"');
  const resolved = {};
  for (const [name2, value] of Object.entries(record)) {
    if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name2)) fail2(`"vars.${name2}"`, "must be a valid identifier");
    resolved[name2] = scalar(value, `"vars.${name2}"`, resolved);
  }
  return resolved;
}
var ELEMENT_KEYS = {
  point: ["type", "at", "label", "label_offset", "label_size", "size", "color", "open"],
  segment: ["type", "from", "to", "color", "width", "style", "arrow", "label", "label_offset", "label_size"],
  line: ["type", "through", "color", "width", "style", "extend", "label", "label_offset", "label_size"],
  ray: ["type", "from", "through", "color", "width", "style", "arrow", "label", "label_offset", "label_size"],
  vector: ["type", "from", "to", "color", "width", "style", "arrow", "label", "label_offset", "label_size"],
  circle: ["type", "center", "radius", "through", "color", "width", "style", "fill", "fill_opacity"],
  arc: ["type", "center", "radius", "start", "end", "color", "width", "style", "arrow"],
  polygon: ["type", "points", "color", "width", "style", "fill", "fill_opacity", "closed", "label", "label_size"],
  polyline: ["type", "points", "color", "width", "style", "arrow", "fill", "fill_opacity", "closed", "label", "label_size"],
  angle: ["type", "at", "from", "to", "radius", "label", "label_size", "color", "width", "right"],
  curve: ["type", "y", "domain", "samples", "color", "width", "style"],
  parametric: ["type", "x", "y", "range", "samples", "color", "width", "style"],
  polar: ["type", "r", "range", "samples", "color", "width", "style"],
  text: ["type", "at", "text", "size", "color", "anchor", "valign", "rotate"]
};
function pushPolyline(state, pts, path4, element, options) {
  state.prims.push({
    kind: "polyline",
    pts,
    closed: options.closed,
    color: readColor(element, "color", path4, DEFAULT_INK),
    width: numberField(element, "width", path4, DEFAULT_STROKE),
    style: readStyle(element, path4),
    arrow: options.arrow,
    fill: options.fill,
    fillOpacity: options.fillOpacity
  });
  for (const [x, y] of pts) extend(state, x, y);
}
function pushLabel(state, label) {
  state.prims.push({
    kind: "label",
    x: label.x,
    y: label.y,
    tex: label.tex,
    size: label.size,
    color: label.color,
    dx: label.dx,
    dy: label.dy,
    anchor: label.anchor ?? "middle",
    valign: label.valign ?? "middle",
    rotate: label.rotate ?? 0
  });
}
function midpoint(from, to) {
  return [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
}
function centroid(points) {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point[0];
    y += point[1];
  }
  return [x / points.length, y / points.length];
}
function unitVector(x, y, path4) {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length < 1e-9) fail2(path4, "coincides with the vertex, so no angle can be drawn");
  return [x / length, y / length];
}
function arcExtremes(a0, a1) {
  const low = Math.min(a0, a1);
  const high = Math.max(a0, a1);
  const angles = [a0, a1];
  for (let quarter = 0; quarter < 8; quarter += 1) {
    const candidate = quarter * Math.PI / 2;
    for (let k = -4; k <= 4; k += 1) {
      const value = candidate + k * 2 * Math.PI;
      if (value >= low && value <= high) angles.push(value);
    }
  }
  return angles;
}
function resolveElement(raw, index, state) {
  const path4 = `elements[${index}]`;
  const element = asRecord(raw, path4);
  const type = element.type;
  if (typeof type !== "string") fail2(`${path4}.type`, "must be a string naming the element type");
  const allowed = ELEMENT_KEYS[type];
  if (allowed === void 0) {
    fail2(`${path4}.type`, `"${type}" is not a known element type; known types: ${Object.keys(ELEMENT_KEYS).join(", ")}`);
  }
  assertKeys(element, allowed, path4);
  switch (type) {
    case "point": {
      const at = pointRef(element.at, `${path4}.at`, state);
      const label = optionalString(element, "label", path4);
      if (label !== void 0) state.points.set(label, at);
      state.prims.push({
        kind: "dot",
        x: at[0],
        y: at[1],
        color: readColor(element, "color", path4, DEFAULT_INK),
        size: numberField(element, "size", path4, 3),
        filled: !(optionalBoolean(element, "open", path4) ?? false)
      });
      if (label !== void 0) {
        const [dx, dy] = readOffset(element, path4, [10, -10]);
        pushLabel(state, {
          x: at[0],
          y: at[1],
          tex: label,
          size: numberField(element, "label_size", path4, LABEL_SIZE),
          color: LABEL_COLOR,
          dx,
          dy
        });
      }
      extend(state, at[0], at[1]);
      return;
    }
    case "segment":
    case "vector": {
      const from = pointRef(element.from, `${path4}.from`, state);
      const to = pointRef(element.to, `${path4}.to`, state);
      pushPolyline(state, [from, to], path4, element, {
        closed: false,
        arrow: readArrow(element, path4, type === "vector" ? "end" : "none"),
        fill: null,
        fillOpacity: 0
      });
      const label = optionalString(element, "label", path4);
      if (label !== void 0) {
        const [dx, dy] = readOffset(element, path4, [0, -10]);
        const [x, y] = midpoint(from, to);
        pushLabel(state, { x, y, tex: label, size: numberField(element, "label_size", path4, LABEL_SIZE), color: LABEL_COLOR, dx, dy });
      }
      return;
    }
    case "polyline":
    case "polygon": {
      const points = pointList(element.points, `${path4}.points`, state);
      const closed = optionalBoolean(element, "closed", path4) ?? type === "polygon";
      const { fill, fillOpacity } = readFill(element, path4);
      pushPolyline(state, points, path4, element, {
        closed,
        arrow: readArrow(element, path4, "none"),
        fill,
        fillOpacity
      });
      const label = optionalString(element, "label", path4);
      if (label !== void 0) {
        const [x, y] = centroid(points);
        pushLabel(state, { x, y, tex: label, size: numberField(element, "label_size", path4, LABEL_SIZE), color: LABEL_COLOR, dx: 0, dy: 0 });
      }
      return;
    }
    case "line": {
      const through = pointList(element.through, `${path4}.through`, state);
      if (through.length !== 2) fail2(`${path4}.through`, "must contain exactly two points");
      const a = through[0];
      const b = through[1];
      const extendMode = optionalString(element, "extend", path4) ?? "both";
      if (extendMode !== "both" && extendMode !== "forward" && extendMode !== "backward" && extendMode !== "none") {
        fail2(`${path4}.extend`, 'must be "both", "forward", "backward", or "none"');
      }
      state.lines.push({
        a,
        b,
        mode: extendMode === "both" ? "infinite" : extendMode === "none" ? "segment" : extendMode,
        color: readColor(element, "color", path4, DEFAULT_INK),
        width: numberField(element, "width", path4, DEFAULT_STROKE),
        style: readStyle(element, path4),
        arrow: readArrow(element, path4, "none"),
        label: optionalString(element, "label", path4) ?? null,
        labelSize: numberField(element, "label_size", path4, LABEL_SIZE),
        labelOffset: readOffset(element, path4, [0, -10])
      });
      extend(state, a[0], a[1]);
      extend(state, b[0], b[1]);
      return;
    }
    case "ray": {
      const from = pointRef(element.from, `${path4}.from`, state);
      const through = pointRef(element.through, `${path4}.through`, state);
      state.lines.push({
        a: from,
        b: through,
        mode: "forward",
        color: readColor(element, "color", path4, DEFAULT_INK),
        width: numberField(element, "width", path4, DEFAULT_STROKE),
        style: readStyle(element, path4),
        arrow: readArrow(element, path4, "end"),
        label: optionalString(element, "label", path4) ?? null,
        labelSize: numberField(element, "label_size", path4, LABEL_SIZE),
        labelOffset: readOffset(element, path4, [0, -10])
      });
      extend(state, from[0], from[1]);
      extend(state, through[0], through[1]);
      return;
    }
    case "circle": {
      const center = pointRef(element.center, `${path4}.center`, state);
      const through = element.through === void 0 ? void 0 : pointRef(element.through, `${path4}.through`, state);
      const declared = optionalNumber(element, "radius", path4, 0);
      const radius = declared ?? (through !== void 0 ? Math.hypot(through[0] - center[0], through[1] - center[1]) : void 0);
      if (radius === void 0 || radius <= 0) fail2(path4, 'needs a positive "radius" or a "through" point');
      const { fill, fillOpacity } = readFill(element, path4);
      state.prims.push({
        kind: "ellipse",
        cx: center[0],
        cy: center[1],
        r: radius,
        color: readColor(element, "color", path4, DEFAULT_INK),
        width: numberField(element, "width", path4, DEFAULT_STROKE),
        style: readStyle(element, path4),
        fill,
        fillOpacity
      });
      extend(state, center[0] - radius, center[1] - radius);
      extend(state, center[0] + radius, center[1] + radius);
      return;
    }
    case "arc": {
      const center = pointRef(element.center, `${path4}.center`, state);
      const radius = optionalNumber(element, "radius", path4, 0);
      if (radius === void 0 || radius <= 0) fail2(path4, 'needs a positive "radius"');
      const start = optionalNumber(element, "start", path4);
      const end = optionalNumber(element, "end", path4);
      if (start === void 0 || end === void 0) fail2(path4, 'needs "start" and "end" angles in degrees');
      const a0 = start * Math.PI / 180;
      const a1 = end * Math.PI / 180;
      state.prims.push({
        kind: "arc",
        cx: center[0],
        cy: center[1],
        r: radius,
        a0,
        a1,
        color: readColor(element, "color", path4, DEFAULT_INK),
        width: numberField(element, "width", path4, DEFAULT_STROKE),
        style: readStyle(element, path4),
        arrow: readArrow(element, path4, "none")
      });
      for (const angle of arcExtremes(a0, a1)) {
        extend(state, center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle));
      }
      return;
    }
    case "angle": {
      const at = pointRef(element.at, `${path4}.at`, state);
      const from = pointRef(element.from, `${path4}.from`, state);
      const to = pointRef(element.to, `${path4}.to`, state);
      state.prims.push({
        kind: "angle",
        vx: at[0],
        vy: at[1],
        u1: unitVector(from[0] - at[0], from[1] - at[1], `${path4}.from`),
        u2: unitVector(to[0] - at[0], to[1] - at[1], `${path4}.to`),
        radiusPx: numberField(element, "radius", path4, ANGLE_RADIUS),
        right: optionalBoolean(element, "right", path4) ?? false,
        color: readColor(element, "color", path4, DEFAULT_INK),
        width: numberField(element, "width", path4, DEFAULT_STROKE),
        label: optionalString(element, "label", path4) ?? null,
        labelSize: numberField(element, "label_size", path4, LABEL_SIZE)
      });
      extend(state, at[0], at[1]);
      return;
    }
    case "curve": {
      const expression = optionalString(element, "y", path4);
      if (expression === void 0) fail2(path4, 'needs "y" (an expression in x)');
      const domain = readRange(element, "domain", path4) ?? [-5, 5];
      const samples = Math.round(numberField(element, "samples", path4, 400));
      if (samples < 2 || samples > MAX_SAMPLES) fail2(`${path4}.samples`, `must be between 2 and ${MAX_SAMPLES}`);
      state.hasPlot = true;
      const compiled2 = compileExpression(expression);
      const pts = [];
      let failures = 0;
      let firstError;
      for (let i = 0; i < samples; i += 1) {
        const x = domain[0] + (domain[1] - domain[0]) * i / (samples - 1);
        try {
          const y = compiled2({ ...state.vars, x });
          if (Number.isFinite(y)) pts.push([x, y]);
          else failures += 1;
        } catch (error) {
          failures += 1;
          firstError ??= error instanceof Error ? error.message : String(error);
        }
      }
      if (pts.length < 2) {
        fail2(`${path4}.y`, `"${expression}" produced no drawable points on ${JSON.stringify(domain)}${firstError !== void 0 ? ` (${firstError})` : ""}`);
      }
      if (failures > 0) state.warnings.push(`${path4}: ${failures} sample(s) were outside the function's domain and were skipped`);
      pushPolyline(state, pts, path4, element, { closed: false, arrow: "none", fill: null, fillOpacity: 0 });
      return;
    }
    case "parametric": {
      const xExpression = optionalString(element, "x", path4);
      const yExpression = optionalString(element, "y", path4);
      if (xExpression === void 0 || yExpression === void 0) fail2(path4, 'needs "x" and "y" expressions in t');
      const range = readRange(element, "range", path4) ?? [0, Math.PI * 2];
      const samples = Math.round(numberField(element, "samples", path4, 400));
      if (samples < 2 || samples > MAX_SAMPLES) fail2(`${path4}.samples`, `must be between 2 and ${MAX_SAMPLES}`);
      state.hasPlot = true;
      const compiledX = compileExpression(xExpression);
      const compiledY = compileExpression(yExpression);
      const pts = [];
      let failures = 0;
      let firstError;
      for (let i = 0; i < samples; i += 1) {
        const t = range[0] + (range[1] - range[0]) * i / (samples - 1);
        try {
          const x = compiledX({ ...state.vars, t });
          const y = compiledY({ ...state.vars, t });
          if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
          else failures += 1;
        } catch (error) {
          failures += 1;
          firstError ??= error instanceof Error ? error.message : String(error);
        }
      }
      if (pts.length < 2) fail2(path4, `produced no drawable points${firstError !== void 0 ? ` (${firstError})` : ""}`);
      if (failures > 0) state.warnings.push(`${path4}: ${failures} sample(s) were skipped`);
      pushPolyline(state, pts, path4, element, { closed: false, arrow: "none", fill: null, fillOpacity: 0 });
      return;
    }
    case "polar": {
      const rExpression = optionalString(element, "r", path4);
      if (rExpression === void 0) fail2(path4, 'needs "r" (an expression in theta)');
      const range = readRange(element, "range", path4) ?? [0, Math.PI * 2];
      const samples = Math.round(numberField(element, "samples", path4, 400));
      if (samples < 2 || samples > MAX_SAMPLES) fail2(`${path4}.samples`, `must be between 2 and ${MAX_SAMPLES}`);
      state.hasPlot = true;
      const compiled2 = compileExpression(rExpression);
      const pts = [];
      let failures = 0;
      let firstError;
      for (let i = 0; i < samples; i += 1) {
        const theta = range[0] + (range[1] - range[0]) * i / (samples - 1);
        try {
          const r = compiled2({ ...state.vars, theta, \u03B8: theta, t: theta });
          const x = r * Math.cos(theta);
          const y = r * Math.sin(theta);
          if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
          else failures += 1;
        } catch (error) {
          failures += 1;
          firstError ??= error instanceof Error ? error.message : String(error);
        }
      }
      if (pts.length < 2) fail2(path4, `produced no drawable points${firstError !== void 0 ? ` (${firstError})` : ""}`);
      if (failures > 0) state.warnings.push(`${path4}: ${failures} sample(s) were skipped`);
      pushPolyline(state, pts, path4, element, { closed: false, arrow: "none", fill: null, fillOpacity: 0 });
      return;
    }
    case "text": {
      const at = pointRef(element.at, `${path4}.at`, state);
      const text = optionalString(element, "text", path4);
      if (text === void 0) fail2(path4, 'needs "text"');
      pushLabel(state, {
        x: at[0],
        y: at[1],
        tex: text,
        size: numberField(element, "size", path4, LABEL_SIZE),
        color: readColor(element, "color", path4, LABEL_COLOR),
        dx: 0,
        dy: 0,
        anchor: readAnchor(element, path4, "middle"),
        valign: readValign(element, path4, "middle"),
        rotate: numberField(element, "rotate", path4, 0)
      });
      extend(state, at[0], at[1]);
      return;
    }
    default:
      fail2(`${path4}.type`, `"${type}" is declared but not implemented`);
  }
}
function clipLine(a, b, bounds, mode) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = mode === "infinite" || mode === "backward" ? -1e6 : 0;
  let t1 = mode === "infinite" || mode === "forward" ? 1e6 : mode === "backward" ? 0 : 1;
  const tests = [
    [-dx, a[0] - bounds.x0],
    [dx, bounds.x1 - a[0]],
    [-dy, a[1] - bounds.y0],
    [dy, bounds.y1 - a[1]]
  ];
  for (const [p, q] of tests) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return void 0;
      continue;
    }
    const ratio = q / p;
    if (p < 0) t0 = Math.max(t0, ratio);
    else t1 = Math.min(t1, ratio);
    if (t0 > t1) return void 0;
  }
  return [
    [a[0] + dx * t0, a[1] + dy * t0],
    [a[0] + dx * t1, a[1] + dy * t1]
  ];
}
function niceStep(span, target = 8) {
  const raw = span / target;
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const exponent = Math.floor(Math.log10(raw));
  const base = 10 ** exponent;
  for (const multiplier of [1, 2, 2.5, 5, 10]) {
    if (raw <= multiplier * base) return multiplier * base;
  }
  return 10 * base;
}
function formatTick(value, step) {
  if (Math.abs(value) < step * 1e-6) return "0";
  const rounded = Number(value.toPrecision(12));
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}
function makeTransform(bounds, width, height, padding, aspect) {
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const spanX = bounds.x1 - bounds.x0;
  const spanY = bounds.y1 - bounds.y0;
  if (aspect === "stretch") {
    const sx = availableWidth / spanX;
    const sy = availableHeight / spanY;
    return {
      sx,
      sy,
      x: (value) => padding + (value - bounds.x0) * sx,
      y: (value) => padding + (bounds.y1 - value) * sy
    };
  }
  const scale = Math.min(availableWidth / spanX, availableHeight / spanY);
  const offsetX = padding + (availableWidth - spanX * scale) / 2;
  const offsetY = padding + (availableHeight - spanY * scale) / 2;
  return {
    sx: scale,
    sy: scale,
    x: (value) => offsetX + (value - bounds.x0) * scale,
    y: (value) => offsetY + (bounds.y1 - value) * scale
  };
}
function dashAttributes(style, width) {
  if (style === "dashed") {
    return ` stroke-dasharray="${formatNumber(Math.max(4, width * 4))} ${formatNumber(Math.max(3, width * 3))}"`;
  }
  if (style === "dotted") {
    return ` stroke-dasharray="0.01 ${formatNumber(Math.max(2.5, width * 2.5))}" stroke-linecap="round"`;
  }
  return "";
}
function strokeAttributes(color, width, style) {
  return ` fill="none" stroke="${escapeAttribute(color)}" stroke-width="${formatNumber(width)}"${dashAttributes(style, width)}`;
}
function outlineAttributes(color, width, style) {
  return ` stroke="${escapeAttribute(color)}" stroke-width="${formatNumber(width)}"${dashAttributes(style, width)}`;
}
function arrowMarkup(from, to, color, size = ARROW_SIZE) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 1e-6) return "";
  const ux = dx / length;
  const uy = dy / length;
  const baseX = to[0] - ux * size;
  const baseY = to[1] - uy * size;
  const halfWidth = size * 0.42;
  const first = `${formatNumber(baseX - uy * halfWidth)} ${formatNumber(baseY + ux * halfWidth)}`;
  const second = `${formatNumber(baseX + uy * halfWidth)} ${formatNumber(baseY - ux * halfWidth)}`;
  return `<polygon points="${first} ${second} ${formatNumber(to[0])} ${formatNumber(to[1])}" fill="${escapeAttribute(color)}"/>`;
}
function pathData(points, closed) {
  const parts = [];
  for (const [index, point] of points.entries()) {
    parts.push(`${index === 0 ? "M" : "L"}${formatNumber(point[0])} ${formatNumber(point[1])}`);
  }
  if (closed) parts.push("Z");
  return parts.join(" ");
}
function visibleRuns(points, width, height, margin) {
  const runs = [];
  let current = [];
  for (const point of points) {
    const inside = point[0] >= -margin && point[0] <= width + margin && point[1] >= -margin && point[1] <= height + margin;
    if (inside) current.push(point);
    else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);
  return runs;
}
function emitPolyline(prim, transform, width, height) {
  const pixelPoints = prim.pts.map(([x, y]) => [transform.x(x), transform.y(y)]);
  const filled = prim.fill !== null;
  const attributes = filled ? ` fill="${escapeAttribute(prim.fill)}" fill-opacity="${formatNumber(prim.fillOpacity)}" stroke="${escapeAttribute(prim.color)}" stroke-width="${formatNumber(prim.width)}"${dashAttributes(prim.style, prim.width)}` : ` fill="none" stroke="${escapeAttribute(prim.color)}" stroke-width="${formatNumber(prim.width)}"` + dashAttributes(prim.style, prim.width);
  const markup = [];
  const runs = prim.closed ? [pixelPoints] : visibleRuns(pixelPoints, width, height, 24);
  for (const run of runs) {
    if (run.length < 2) continue;
    markup.push(`<path d="${pathData(run, prim.closed)}"${attributes}/>`);
  }
  if (prim.arrow !== "none" && pixelPoints.length >= 2) {
    const first = pixelPoints[0];
    const second = pixelPoints[1];
    const last = pixelPoints[pixelPoints.length - 1];
    const beforeLast = pixelPoints[pixelPoints.length - 2];
    if (prim.arrow === "end" || prim.arrow === "both") markup.push(arrowMarkup(beforeLast, last, prim.color));
    if (prim.arrow === "start" || prim.arrow === "both") markup.push(arrowMarkup(second, first, prim.color));
  }
  return markup.join("");
}
async function emitPrim(prim, transform) {
  switch (prim.kind) {
    case "polyline":
      return "";
    // emitted by the caller so the viewport size is available
    case "ellipse": {
      const fill = prim.fill !== null ? ` fill="${escapeAttribute(prim.fill)}" fill-opacity="${formatNumber(prim.fillOpacity)}"` : ' fill="none"';
      return `<ellipse cx="${formatNumber(transform.x(prim.cx))}" cy="${formatNumber(transform.y(prim.cy))}" rx="${formatNumber(prim.r * transform.sx)}" ry="${formatNumber(prim.r * transform.sy)}"${fill}${outlineAttributes(prim.color, prim.width, prim.style)}/>`;
    }
    case "arc": {
      const start = [transform.x(prim.cx + prim.r * Math.cos(prim.a0)), transform.y(prim.cy + prim.r * Math.sin(prim.a0))];
      const end = [transform.x(prim.cx + prim.r * Math.cos(prim.a1)), transform.y(prim.cy + prim.r * Math.sin(prim.a1))];
      const delta = prim.a1 - prim.a0;
      const path4 = `<path d="M${formatNumber(start[0])} ${formatNumber(start[1])} A${formatNumber(prim.r * transform.sx)} ${formatNumber(prim.r * transform.sy)} 0 ${Math.abs(delta) > Math.PI ? 1 : 0} ${delta >= 0 ? 0 : 1} ${formatNumber(end[0])} ${formatNumber(end[1])}"${strokeAttributes(prim.color, prim.width, prim.style)}/>`;
      if (prim.arrow === "none") return path4;
      const direction = delta >= 0 ? 1 : -1;
      const tangent = [-Math.sin(prim.a1) * direction * transform.sx, -Math.cos(prim.a1) * direction * transform.sy];
      const tail = [end[0] - tangent[0] * 0.2, end[1] - tangent[1] * 0.2];
      return path4 + arrowMarkup(tail, end, prim.color);
    }
    case "dot": {
      const fill = prim.filled ? escapeAttribute(prim.color) : "#ffffff";
      return `<circle cx="${formatNumber(transform.x(prim.x))}" cy="${formatNumber(transform.y(prim.y))}" r="${formatNumber(prim.size)}" fill="${fill}" stroke="${escapeAttribute(prim.color)}" stroke-width="1.4"/>`;
    }
    case "label": {
      const rendered = await renderTex(prim.tex, false);
      return inlineTexFragment(rendered, transform.x(prim.x) + prim.dx, transform.y(prim.y) + prim.dy, {
        color: prim.color,
        fontSize: prim.size,
        anchor: prim.anchor,
        valign: prim.valign,
        rotate: prim.rotate
      });
    }
    case "angle": {
      const vertex = [transform.x(prim.vx), transform.y(prim.vy)];
      const d1 = [prim.u1[0] * transform.sx, -prim.u1[1] * transform.sy];
      const d2 = [prim.u2[0] * transform.sx, -prim.u2[1] * transform.sy];
      const u1 = unitVector(d1[0], d1[1], "angle");
      const u2 = unitVector(d2[0], d2[1], "angle");
      const a0 = Math.atan2(u1[1], u1[0]);
      const a1 = Math.atan2(u2[1], u2[0]);
      let delta = a1 - a0;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      const markup = [];
      if (prim.right) {
        const size = Math.min(RIGHT_ANGLE_SIZE, prim.radiusPx);
        const p1 = [vertex[0] + u1[0] * size, vertex[1] + u1[1] * size];
        const p2 = [vertex[0] + (u1[0] + u2[0]) * size, vertex[1] + (u1[1] + u2[1]) * size];
        const p3 = [vertex[0] + u2[0] * size, vertex[1] + u2[1] * size];
        markup.push(`<path d="${pathData([p1, p2, p3], false)}"${strokeAttributes(prim.color, prim.width, "solid")}/>`);
      } else {
        const radius = prim.radiusPx;
        const start = [vertex[0] + u1[0] * radius, vertex[1] + u1[1] * radius];
        const end = [vertex[0] + u2[0] * radius, vertex[1] + u2[1] * radius];
        markup.push(`<path d="M${formatNumber(start[0])} ${formatNumber(start[1])} A${formatNumber(radius)} ${formatNumber(radius)} 0 ${Math.abs(delta) > Math.PI ? 1 : 0} ${delta >= 0 ? 1 : 0} ${formatNumber(end[0])} ${formatNumber(end[1])}"${strokeAttributes(prim.color, prim.width, "solid")}/>`);
      }
      if (prim.label !== null) {
        const mid = a0 + delta / 2;
        const distance = prim.radiusPx * 1.6;
        const rendered = await renderTex(prim.label, false);
        markup.push(inlineTexFragment(rendered, vertex[0] + Math.cos(mid) * distance, vertex[1] + Math.sin(mid) * distance, {
          color: prim.color,
          fontSize: prim.labelSize,
          anchor: "middle",
          valign: "middle"
        }));
      }
      return markup.join("");
    }
    default:
      return "";
  }
}
var AXES_KEYS = ["color", "labels"];
var GRID_KEYS = ["step", "color"];
function readAxes(raw) {
  if (raw === void 0) return { enabled: false, labelsEnabled: true, color: AXIS_COLOR };
  if (typeof raw === "boolean") return { enabled: raw, labelsEnabled: true, color: AXIS_COLOR };
  const record = asRecord(raw, '"axes"');
  assertKeys(record, AXES_KEYS, '"axes"');
  return {
    enabled: true,
    labelsEnabled: optionalBoolean(record, "labels", '"axes"') ?? true,
    color: readColor(record, "color", '"axes"', AXIS_COLOR)
  };
}
function readGrid(raw) {
  if (raw === void 0) return { enabled: false, step: void 0, color: GRID_COLOR };
  if (typeof raw === "boolean") return { enabled: raw, step: void 0, color: GRID_COLOR };
  const record = asRecord(raw, '"grid"');
  assertKeys(record, GRID_KEYS, '"grid"');
  return {
    enabled: true,
    step: optionalNumber(record, "step", '"grid"', 1e-9),
    color: readColor(record, "color", '"grid"', GRID_COLOR)
  };
}
var TOP_LEVEL_KEYS = [
  "width",
  "height",
  "padding",
  "background",
  "xRange",
  "yRange",
  "aspect",
  "vars",
  "grid",
  "axes",
  "title",
  "elements"
];
function computeBounds(state, xRange, yRange, width, height, padding, aspect) {
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  let auto;
  if (state.touched) {
    const marginX = (state.maxX - state.minX) * 0.06 || 1;
    const marginY = (state.maxY - state.minY) * 0.06 || 1;
    auto = {
      x0: state.minX - marginX,
      x1: state.maxX + marginX,
      y0: state.minY - marginY,
      y1: state.maxY + marginY
    };
  } else {
    auto = { x0: -5, x1: 5, y0: -3, y1: 3 };
  }
  let bounds;
  if (xRange !== void 0 && yRange !== void 0) {
    bounds = { x0: xRange[0], x1: xRange[1], y0: yRange[0], y1: yRange[1] };
  } else if (xRange !== void 0) {
    const spanY = (xRange[1] - xRange[0]) * (availableHeight / availableWidth);
    const center = (auto.y0 + auto.y1) / 2;
    bounds = { x0: xRange[0], x1: xRange[1], y0: center - spanY / 2, y1: center + spanY / 2 };
  } else if (yRange !== void 0) {
    const spanX = (yRange[1] - yRange[0]) * (availableWidth / availableHeight);
    const center = (auto.x0 + auto.x1) / 2;
    bounds = { x0: center - spanX / 2, x1: center + spanX / 2, y0: yRange[0], y1: yRange[1] };
  } else {
    bounds = auto;
  }
  if (aspect === "equal") {
    const targetRatio = availableWidth / availableHeight;
    const spanX = bounds.x1 - bounds.x0;
    const spanY = bounds.y1 - bounds.y0;
    const ratio = spanX / spanY;
    if (ratio < targetRatio) {
      const wanted = spanY * targetRatio;
      const center = (bounds.x0 + bounds.x1) / 2;
      bounds = { ...bounds, x0: center - wanted / 2, x1: center + wanted / 2 };
    } else if (ratio > targetRatio) {
      const wanted = spanX / targetRatio;
      const center = (bounds.y0 + bounds.y1) / 2;
      bounds = { ...bounds, y0: center - wanted / 2, y1: center + wanted / 2 };
    }
  }
  if (bounds.x1 - bounds.x0 < 1e-9) bounds = { ...bounds, x0: bounds.x0 - 1, x1: bounds.x1 + 1 };
  if (bounds.y1 - bounds.y0 < 1e-9) bounds = { ...bounds, y0: bounds.y0 - 1, y1: bounds.y1 + 1 };
  return bounds;
}
function emitGrid(bounds, transform, grid) {
  const stepX = grid.step ?? niceStep(bounds.x1 - bounds.x0);
  const stepY = grid.step ?? niceStep(bounds.y1 - bounds.y0);
  const parts = [];
  const stroke = ` stroke="${escapeAttribute(grid.color)}" stroke-width="1"`;
  let drawn = 0;
  for (let value = Math.ceil(bounds.x0 / stepX) * stepX; value <= bounds.x1 && drawn < MAX_GRID_LINES; value += stepX) {
    if (Math.abs(value) > stepX * 1e-6) {
      const x = transform.x(value);
      parts.push(`<line x1="${formatNumber(x)}" y1="${formatNumber(transform.y(bounds.y0))}" x2="${formatNumber(x)}" y2="${formatNumber(transform.y(bounds.y1))}"${stroke}/>`);
      drawn += 1;
    }
  }
  for (let value = Math.ceil(bounds.y0 / stepY) * stepY; value <= bounds.y1 && drawn < MAX_GRID_LINES; value += stepY) {
    if (Math.abs(value) > stepY * 1e-6) {
      const y = transform.y(value);
      parts.push(`<line x1="${formatNumber(transform.x(bounds.x0))}" y1="${formatNumber(y)}" x2="${formatNumber(transform.x(bounds.x1))}" y2="${formatNumber(y)}"${stroke}/>`);
      drawn += 1;
    }
  }
  return parts.join("");
}
async function emitAxes(bounds, transform, axes, grid, width, height) {
  const parts = [];
  const stepX = grid.step ?? niceStep(bounds.x1 - bounds.x0);
  const stepY = grid.step ?? niceStep(bounds.y1 - bounds.y0);
  const axisY = Math.min(Math.max(0, bounds.y0), bounds.y1);
  const axisX = Math.min(Math.max(0, bounds.x0), bounds.x1);
  const axisYPixel = transform.y(axisY);
  const axisXPixel = transform.x(axisX);
  const stroke = ` stroke="${escapeAttribute(axes.color)}" stroke-width="1.4"`;
  parts.push(`<line x1="${formatNumber(transform.x(bounds.x0))}" y1="${formatNumber(axisYPixel)}" x2="${formatNumber(transform.x(bounds.x1))}" y2="${formatNumber(axisYPixel)}"${stroke}/>`);
  parts.push(`<line x1="${formatNumber(axisXPixel)}" y1="${formatNumber(transform.y(bounds.y0))}" x2="${formatNumber(axisXPixel)}" y2="${formatNumber(transform.y(bounds.y1))}"${stroke}/>`);
  parts.push(arrowMarkup([transform.x(bounds.x1) - 14, axisYPixel], [transform.x(bounds.x1), axisYPixel], axes.color, 8));
  parts.push(arrowMarkup([axisXPixel, transform.y(bounds.y1) + 14], [axisXPixel, transform.y(bounds.y1)], axes.color, 8));
  if (axes.labelsEnabled) {
    const xLabel = await renderTex("x", false);
    const yLabel = await renderTex("y", false);
    parts.push(inlineTexFragment(xLabel, width - 2, axisYPixel - 5, {
      color: axes.color,
      fontSize: TICK_SIZE + 2,
      anchor: "end",
      valign: "bottom"
    }));
    parts.push(inlineTexFragment(yLabel, axisXPixel + 9, 2, {
      color: axes.color,
      fontSize: TICK_SIZE + 2,
      anchor: "start",
      valign: "top"
    }));
  }
  const labelBelow = axisYPixel < height / 2;
  const labelLeft = axisXPixel > width / 2;
  const xAxisAtZero = Math.abs(axisY) < stepY * 1e-6;
  let ticks = 0;
  for (let value = Math.ceil(bounds.x0 / stepX) * stepX; value <= bounds.x1 && ticks < MAX_TICKS; value += stepX) {
    const x = transform.x(value);
    parts.push(`<line x1="${formatNumber(x)}" y1="${formatNumber(axisYPixel - 3)}" x2="${formatNumber(x)}" y2="${formatNumber(axisYPixel + 3)}"${stroke}/>`);
    const label = await renderTex(formatTick(value, stepX), false);
    parts.push(inlineTexFragment(label, x, axisYPixel + (labelBelow ? 5 : -5), {
      color: axes.color,
      fontSize: TICK_SIZE,
      anchor: "middle",
      valign: labelBelow ? "top" : "bottom"
    }));
    ticks += 1;
  }
  ticks = 0;
  for (let value = Math.ceil(bounds.y0 / stepY) * stepY; value <= bounds.y1 && ticks < MAX_TICKS; value += stepY) {
    if (xAxisAtZero && Math.abs(value) < stepY * 1e-6) continue;
    const y = transform.y(value);
    parts.push(`<line x1="${formatNumber(axisXPixel - 3)}" y1="${formatNumber(y)}" x2="${formatNumber(axisXPixel + 3)}" y2="${formatNumber(y)}"${stroke}/>`);
    const label = await renderTex(formatTick(value, stepY), false);
    parts.push(inlineTexFragment(label, axisXPixel + (labelLeft ? -5 : 5), y, {
      color: axes.color,
      fontSize: TICK_SIZE,
      anchor: labelLeft ? "end" : "start",
      valign: "middle"
    }));
    ticks += 1;
  }
  return parts.join("");
}
async function renderFigure(spec, options = {}) {
  const root = asRecord(spec, "spec");
  assertKeys(root, TOP_LEVEL_KEYS, "spec");
  const width = Math.round(numberField(root, "width", "spec", DEFAULT_WIDTH));
  const height = Math.round(numberField(root, "height", "spec", DEFAULT_HEIGHT));
  if (width < 40 || width > 4e3) fail2('"width"', "must be between 40 and 4000");
  if (height < 40 || height > 4e3) fail2('"height"', "must be between 40 and 4000");
  const padding = Math.round(numberField(root, "padding", "spec", options.padding ?? DEFAULT_PADDING));
  if (padding < 0 || padding * 2 >= Math.min(width, height)) fail2('"padding"', "must leave a positive drawing area");
  const background = optionalString(root, "background", "spec") ?? options.background ?? "transparent";
  if (background !== "transparent" && !isSafeColor(background)) {
    fail2('"background"', 'must be "transparent" or a flat CSS color');
  }
  const aspectRaw = optionalString(root, "aspect", "spec") ?? "equal";
  if (aspectRaw !== "equal" && aspectRaw !== "stretch") fail2('"aspect"', 'must be "equal" or "stretch"');
  const xRange = readRange(root, "xRange", "spec");
  const yRange = readRange(root, "yRange", "spec");
  const grid = readGrid(root.grid);
  const axes = readAxes(root.axes);
  const title = optionalString(root, "title", "spec");
  const elementsRaw = root.elements;
  if (!Array.isArray(elementsRaw)) fail2('"elements"', "must be an array");
  if (elementsRaw.length > MAX_ELEMENTS) fail2('"elements"', `must contain at most ${MAX_ELEMENTS} elements`);
  const state = {
    vars: resolveVars(root.vars),
    points: /* @__PURE__ */ new Map(),
    prims: [],
    lines: [],
    warnings: [],
    hasPlot: false,
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
    touched: false
  };
  for (const [index, element] of elementsRaw.entries()) resolveElement(element, index, state);
  const bounds = computeBounds(state, xRange, yRange, width, height, padding, aspectRaw);
  const axesEnabled = axes.enabled || root.axes === void 0 && state.hasPlot;
  const transform = makeTransform(bounds, width, height, padding, aspectRaw);
  const parts = [];
  if (background !== "transparent") {
    parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeAttribute(background)}"/>`);
  }
  if (grid.enabled) parts.push(emitGrid(bounds, transform, grid));
  if (axesEnabled) parts.push(await emitAxes(bounds, transform, axes, grid, width, height));
  for (const line of state.lines) {
    const clipped = clipLine(line.a, line.b, bounds, line.mode);
    if (clipped === void 0) continue;
    parts.push(emitPolyline({
      kind: "polyline",
      pts: clipped,
      closed: false,
      color: line.color,
      width: line.width,
      style: line.style,
      arrow: line.arrow,
      fill: null,
      fillOpacity: 0
    }, transform, width, height));
    if (line.label !== null) {
      const [mx, my] = midpoint(clipped[0], clipped[1]);
      const rendered = await renderTex(line.label, false);
      parts.push(inlineTexFragment(rendered, transform.x(mx) + line.labelOffset[0], transform.y(my) + line.labelOffset[1], {
        color: LABEL_COLOR,
        fontSize: line.labelSize,
        anchor: "middle",
        valign: "middle"
      }));
    }
  }
  for (const prim of state.prims) {
    parts.push(prim.kind === "polyline" ? emitPolyline(prim, transform, width, height) : await emitPrim(prim, transform));
  }
  if (title !== void 0) {
    const rendered = await renderTex(title, false);
    parts.push(inlineTexFragment(rendered, width / 2, padding / 2, {
      color: LABEL_COLOR,
      fontSize: TITLE_SIZE,
      anchor: "middle",
      valign: "top"
    }));
  }
  const idSeed = (options.idSeed ?? "figure").replace(/[^A-Za-z0-9_-]/g, "") || "figure";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" data-figure="${escapeAttribute(idSeed)}">` + parts.join("") + "</svg>";
  const serialized = JSON.stringify(spec) ?? "{}";
  return {
    svg,
    width,
    height,
    warnings: state.warnings,
    source: serialized.length > 8e3 ? `${serialized.slice(0, 8e3)}\u2026` : serialized,
    hashParts: [serialized, background, String(padding), String(width), String(height), aspectRaw]
  };
}

// src/raster.ts
var RasterUnavailableError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "RasterUnavailableError";
  }
};
var resvgPromise;
async function loadResvg() {
  resvgPromise ??= import("@resvg/resvg-js").catch((error) => {
    resvgPromise = void 0;
    const detail = error instanceof Error ? error.message : String(error);
    throw new RasterUnavailableError(
      `PNG output needs the optional "@resvg/resvg-js" native binding, which failed to load (${detail}). SVG output is unaffected; install a prebuilt binding or use format "svg".`
    );
  });
  return resvgPromise;
}
function readPngSize(data) {
  if (data.length < 24) return void 0;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (const [index, byte] of signature.entries()) {
    if (data[index] !== byte) return void 0;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0) return void 0;
  return { width, height };
}
async function rasterizePng(svg, options) {
  const resvg = await loadResvg();
  const background = options.background !== void 0 && options.background !== "transparent" ? options.background : void 0;
  if (background !== void 0 && !isSafeColor(background)) {
    throw new Error(`"${background}" is not a supported background color`);
  }
  let rendered;
  try {
    const renderer = new resvg.Resvg(svg, {
      fitTo: { mode: "zoom", value: options.scale },
      font: { loadSystemFonts: false },
      ...background !== void 0 ? { background } : {}
    });
    rendered = renderer.render();
  } catch (error) {
    throw new Error(`the SVG could not be rasterized: ${error instanceof Error ? error.message : String(error)}`);
  }
  const data = new Uint8Array(rendered.asPng());
  const size = readPngSize(data);
  if (size === void 0) throw new Error("the rasterizer returned bytes that are not a PNG");
  return { data, ...size };
}

// src/sanitize.ts
var MAX_SVG_BYTES = 2 * 1024 * 1024;
var FORBIDDEN_ELEMENTS = [
  "script",
  "foreignObject",
  "iframe",
  "object",
  "embed",
  "style",
  "audio",
  "video",
  "animate",
  "animateTransform",
  "set",
  "handler"
];
function attrNumber(tag, name2) {
  const match = new RegExp(`\\s${name2}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
  if (match?.[1] === void 0) return void 0;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) && value > 0 ? value : void 0;
}
function viewBoxSize(tag) {
  const match = /\sviewBox\s*=\s*"([^"]*)"/i.exec(tag);
  const numbers = match?.[1]?.trim().split(/[\s,]+/).map(Number);
  if (numbers === void 0 || numbers.length !== 4) return void 0;
  const width = numbers[2];
  const height = numbers[3];
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return void 0;
  return { width, height };
}
function sanitizeSvg(input) {
  if (input.length > MAX_SVG_BYTES) {
    throw new Error(`the SVG is larger than ${MAX_SVG_BYTES} bytes`);
  }
  const removed = /* @__PURE__ */ new Set();
  let svg = input;
  svg = svg.replace(/<\?xml[\s\S]*?\?>/gi, () => {
    removed.add("an XML declaration");
    return "";
  });
  svg = svg.replace(/<!DOCTYPE[\s\S]*?>/gi, () => {
    removed.add("a DOCTYPE");
    return "";
  });
  svg = svg.replace(/<!--[\s\S]*?-->/g, () => {
    removed.add("a comment");
    return "";
  });
  for (const element of FORBIDDEN_ELEMENTS) {
    const paired = new RegExp(`<${element}\\b[\\s\\S]*?</${element}\\s*>`, "gi");
    svg = svg.replace(paired, () => {
      removed.add(`<${element}>`);
      return "";
    });
    const single = new RegExp(`<${element}\\b[^>]*?/?>`, "gi");
    svg = svg.replace(single, () => {
      removed.add(`<${element}>`);
      return "";
    });
  }
  svg = svg.replace(/\son[a-zA-Z-]+\s*=\s*"[^"]*"/g, () => {
    removed.add("an event handler");
    return "";
  });
  svg = svg.replace(/\son[a-zA-Z-]+\s*=\s*'[^']*'/g, () => {
    removed.add("an event handler");
    return "";
  });
  svg = svg.replace(/\son[a-zA-Z-]+\s*=\s*[^\s>]+/g, () => {
    removed.add("an event handler");
    return "";
  });
  svg = svg.replace(/(\s(?:xlink:)?href\s*=\s*)("[^"]*"|'[^']*')/gi, (match, prefix, quoted) => {
    const raw = quoted.slice(1, -1).trim();
    const isFragment = raw.startsWith("#");
    const isEmbedded = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(raw);
    if (isFragment || isEmbedded) return match;
    if (raw.length > 0) removed.add("an external reference");
    return `${prefix}"#"`;
  });
  svg = svg.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, (match, quoted) => {
    const raw = quoted.slice(1, -1);
    if (/url\s*\(|javascript:|expression\s*\(|[<>]/i.test(raw)) {
      removed.add("an unsafe style attribute");
      return "";
    }
    return match;
  });
  svg = svg.replace(/\s([a-zA-Z-]+)\s*=\s*("[^"]*"|'[^']*')/g, (match, name2, quoted) => {
    const raw = quoted.slice(1, -1);
    if (!/url\s*\(/i.test(raw)) return match;
    const safe = raw.replace(/url\s*\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (reference, _quote, target) => target.trim().startsWith("#") ? reference : "none");
    if (safe === raw) return match;
    removed.add("an external paint reference");
    return ` ${name2}="${safe.replaceAll('"', "&quot;")}"`;
  });
  svg = svg.replace(/(\s[a-zA-Z-]+\s*=\s*)url\s*\(\s*(?!#)([^)]*)\)/gi, (_match, prefix) => {
    removed.add("an external paint reference");
    return `${prefix}"none"`;
  });
  const rootStart = /<svg\b[^>]*>/i.exec(svg);
  if (rootStart === null) throw new Error("the input does not contain an <svg> root element");
  let root = rootStart[0];
  if (!/\sxmlns\s*=/i.test(root)) {
    root = root.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    svg = svg.slice(0, rootStart.index) + root + svg.slice(rootStart.index + rootStart[0].length);
  }
  const viewBox = viewBoxSize(root);
  const width = attrNumber(root, "width") ?? viewBox?.width;
  const height = attrNumber(root, "height") ?? viewBox?.height;
  if (width === void 0 || height === void 0) {
    throw new Error("the SVG must declare width/height or a viewBox so it can be sized");
  }
  return { svg, width, height, removed: [...removed] };
}

// src/tools/convert.ts
import path3 from "node:path";

// src/output.ts
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
var temporaryCounter = 0;
function contentHash(parts) {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 12);
}
function safeBaseName(name2, fallback) {
  if (name2 === void 0) return fallback;
  const cleaned = name2.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+/, "").replace(/[.-]+$/, "").slice(0, 64);
  return cleaned.length > 0 ? cleaned : fallback;
}
function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
async function resolveInsideWorkspace(root, requested) {
  const absolute = path.isAbsolute(requested) ? path.resolve(requested) : path.resolve(root, requested);
  if (absolute === path.resolve(root) || !isInside(path.resolve(root), absolute)) {
    throw new Error(`"${requested}" is outside the session workspace (${root})`);
  }
  const realRoot = await realpath(root).catch(() => path.resolve(root));
  let existing = absolute;
  while (!existsSync(existing) && path.dirname(existing) !== existing) existing = path.dirname(existing);
  const realExisting = await realpath(existing).catch(() => existing);
  if (!isInside(realRoot, realExisting) && realExisting !== realRoot) {
    throw new Error(`"${requested}" resolves outside the session workspace through a symbolic link`);
  }
  return absolute;
}
async function planOutputTarget(root, outputDir, requested, baseName, extension) {
  const relative = requested === void 0 ? path.join(outputDir, `${baseName}${extension}`) : /\.(?:svg|png)$/i.test(requested) ? requested : path.join(requested, `${baseName}${extension}`);
  const hostPath = await resolveInsideWorkspace(root, relative);
  return { hostPath, relativePath: toRelative(root, hostPath), root };
}
function toRelative(root, hostPath) {
  return path.relative(root, hostPath).split(path.sep).join("/");
}
async function writeOutput(target, data) {
  await mkdir(path.dirname(target.hostPath), { recursive: true });
  temporaryCounter += 1;
  const temporary = `${target.hostPath}.${process.pid}.${temporaryCounter}.tmp`;
  await writeFile(temporary, data);
  await rename(temporary, target.hostPath);
  return typeof data === "string" ? Buffer.byteLength(data) : data.byteLength;
}
async function readWorkspaceText(root, requested, maxBytes) {
  const hostPath = await resolveInsideWorkspace(root, requested);
  const info = await stat(hostPath);
  if (!info.isFile()) throw new Error(`"${requested}" is not a regular file`);
  if (info.size > maxBytes) throw new Error(`"${requested}" is larger than ${maxBytes} bytes`);
  const text = await readFile(hostPath, { encoding: "utf8" });
  return { text, target: { hostPath, relativePath: toRelative(root, hostPath), root } };
}
async function readWorkspaceBytes(root, requested, maxBytes) {
  const hostPath = await resolveInsideWorkspace(root, requested);
  const info = await stat(hostPath);
  if (!info.isFile()) throw new Error(`"${requested}" is not a regular file`);
  if (info.size > maxBytes) throw new Error(`"${requested}" is larger than ${maxBytes} bytes`);
  const data = await readFile(hostPath);
  return { data: new Uint8Array(data), target: { hostPath, relativePath: toRelative(root, hostPath), root } };
}

// src/tools/shared.ts
import path2 from "node:path";

// src/embed.ts
function latexSnippet(image) {
  const centimeters = (image.width / 96 * 2.54).toFixed(2);
  return `\\includegraphics[width=${centimeters}cm]{${image.relativePath}}`;
}
function markdownSnippet(alt, image) {
  return `![${alt}](${image.relativePath})`;
}
function htmlSnippet(alt, image) {
  return `<img src="${escapeAttribute(image.relativePath)}" width="${image.width}" height="${image.height}" alt="${escapeAttribute(alt)}">`;
}
function buildEmbeds(altText, images, options) {
  const alt = altText.replace(/[[\]\n\r]/g, " ").slice(0, 200);
  const svg = images.svg;
  const png = images.png;
  const embed = {
    markdown_svg: svg !== void 0 ? markdownSnippet(alt, svg) : "",
    markdown_png: png !== void 0 ? markdownSnippet(alt, png) : "",
    html_svg: svg !== void 0 ? htmlSnippet(alt, svg) : "",
    html_png: png !== void 0 ? htmlSnippet(alt, png) : "",
    latex_svg: svg !== void 0 ? `% requires \\usepackage{svg} or a raster fallback
${latexSnippet(svg)}` : "",
    latex_png: png !== void 0 ? latexSnippet(png) : ""
  };
  const wantsSvgUri = options.dataUri && options.svgText !== void 0;
  const wantsPngUri = options.dataUri && options.pngBytes !== void 0;
  const data_uri_svg = wantsSvgUri ? `data:image/svg+xml;base64,${Buffer.from(options.svgText, "utf8").toString("base64")}` : null;
  const data_uri_png = wantsPngUri ? `data:image/png;base64,${Buffer.from(options.pngBytes).toString("base64")}` : null;
  return { embed, data_uri_svg, data_uri_png };
}

// src/value.ts
var nullableString = { oneOf: [{ type: "string" }, { type: "null" }] };
var MATH_IMAGE_VALUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "source",
    "display",
    "svg_path",
    "svg_host_path",
    "png_path",
    "png_host_path",
    "width",
    "height",
    "pixel_width",
    "pixel_height",
    "scale",
    "svg_bytes",
    "png_bytes",
    "embed",
    "data_uri_svg",
    "data_uri_png",
    "previewed",
    "warnings"
  ],
  properties: {
    kind: { type: "string", enum: ["formula", "figure", "image"] },
    source: { type: "string" },
    display: { type: "boolean" },
    svg_path: nullableString,
    svg_host_path: nullableString,
    png_path: nullableString,
    png_host_path: nullableString,
    width: { type: "number" },
    height: { type: "number" },
    pixel_width: { type: "number" },
    pixel_height: { type: "number" },
    scale: { type: "number" },
    svg_bytes: { type: "integer" },
    png_bytes: { type: "integer" },
    embed: {
      type: "object",
      additionalProperties: false,
      required: ["markdown_svg", "markdown_png", "html_svg", "html_png", "latex_svg", "latex_png"],
      properties: {
        markdown_svg: { type: "string" },
        markdown_png: { type: "string" },
        html_svg: { type: "string" },
        html_png: { type: "string" },
        latex_svg: { type: "string" },
        latex_png: { type: "string" }
      }
    },
    data_uri_svg: nullableString,
    data_uri_png: nullableString,
    previewed: { type: "boolean" },
    warnings: { type: "array", items: { type: "string" } }
  }
};
function kibibytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}
function formatMathImageValue(value) {
  const lines = [
    `<math kind="${value.kind}"${value.kind === "formula" ? ` display="${value.display}"` : ""} width="${value.width}" height="${value.height}">`
  ];
  if (value.svg_path !== null) lines.push(`svg: ${value.svg_path} (${kibibytes(value.svg_bytes)}, ${value.width}x${value.height} at 1x)`);
  if (value.png_path !== null) lines.push(`png: ${value.png_path} (${kibibytes(value.png_bytes)}, ${value.pixel_width}x${value.pixel_height})`);
  if (value.svg_path === null && value.png_path === null) lines.push("files: none were written");
  const firstMarkdown = value.embed.markdown_svg !== "" ? value.embed.markdown_svg : value.embed.markdown_png;
  if (firstMarkdown !== "") lines.push(`markdown: ${firstMarkdown}`);
  if (value.embed.html_svg !== "") lines.push(`html: ${value.embed.html_svg}`);
  else if (value.embed.html_png !== "") lines.push(`html: ${value.embed.html_png}`);
  if (value.embed.latex_png !== "") lines.push(`latex: ${value.embed.latex_png}`);
  else if (value.embed.latex_svg !== "") lines.push(`latex: ${value.embed.latex_svg}`);
  if (value.previewed) lines.push("preview: attached to this result");
  for (const warning of value.warnings) lines.push(`warning: ${warning}`);
  lines.push("</math>");
  return lines.join("\n");
}

// src/tools/shared.ts
var previewRefs = /* @__PURE__ */ new WeakMap();
var COMMON_PARAMETERS = {
  format: {
    type: "string",
    enum: ["svg", "png", "both"],
    default: "both",
    description: 'Which artifact(s) to write. "svg" is vector and needs no rasterizer; "png" is raster-only; "both" (default) writes both.'
  },
  scale: {
    type: "number",
    default: 4,
    description: "PNG zoom factor; pixel size = CSS size \xD7 scale. Defaults to the plugin config (4)."
  },
  background: {
    type: "string",
    default: "transparent",
    description: 'Background color for the PNG ("transparent" or a flat CSS color such as "#ffffff").'
  },
  padding: {
    type: "number",
    default: 8,
    description: "Transparent margin in pixels around the drawing at 1\xD7."
  },
  path: {
    type: "string",
    description: 'Workspace-relative output file (".svg"/".png") or directory. Defaults to the configured output directory with a content-addressed name.'
  },
  name: {
    type: "string",
    description: 'Optional human-readable file base name, e.g. "pythagoras". Sanitized; the content hash is used when omitted.'
  },
  data_uri: {
    type: "boolean",
    default: false,
    description: "Also return base64 data URIs for documents that cannot reference a sibling file."
  },
  preview: {
    type: "boolean",
    default: false,
    description: "Also attach the PNG to this result for inline display, when the active model declares image input and a durable attachment store is mounted."
  }
};
function assertKnownKeys(raw, allowed, toolName) {
  const unknown = Object.keys(raw).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${toolName}: unknown argument(s) ${unknown.map((key) => `"${key}"`).join(", ")}; supported: ${allowed.join(", ")}`);
  }
}
function readObject(args, toolName) {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    throw new Error(`${toolName}: arguments must be a JSON object`);
  }
  return args;
}
function readString2(raw, key, toolName) {
  const value = raw[key];
  if (value === void 0) return void 0;
  if (typeof value !== "string") throw new Error(`${toolName}: "${key}" must be a string`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${toolName}: "${key}" must not be empty`);
  if (trimmed.includes("\0")) throw new Error(`${toolName}: "${key}" must not contain a NUL character`);
  return trimmed;
}
function readNumber2(raw, key, toolName, min, max) {
  const value = raw[key];
  if (value === void 0) return void 0;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${toolName}: "${key}" must be a finite number`);
  }
  if (value < min || value > max) throw new Error(`${toolName}: "${key}" must be between ${min} and ${max}`);
  return value;
}
function readBoolean2(raw, key, toolName) {
  const value = raw[key];
  if (value === void 0) return void 0;
  if (typeof value !== "boolean") throw new Error(`${toolName}: "${key}" must be a boolean`);
  return value;
}
function parseCommonArgs(raw, config, toolName) {
  const format = readString2(raw, "format", toolName) ?? "both";
  if (format !== "svg" && format !== "png" && format !== "both") {
    throw new Error(`${toolName}: "format" must be one of "svg", "png", "both"`);
  }
  const background = readString2(raw, "background", toolName) ?? config.background;
  if (background !== "transparent" && !isSafeColor(background)) {
    throw new Error(`${toolName}: "background" must be "transparent" or a flat CSS color`);
  }
  const args = {
    format,
    scale: readNumber2(raw, "scale", toolName, 0.25, 16) ?? config.scale,
    background,
    padding: Math.round(readNumber2(raw, "padding", toolName, 0, 128) ?? config.padding),
    path: readString2(raw, "path", toolName),
    name: readString2(raw, "name", toolName),
    dataUri: readBoolean2(raw, "data_uri", toolName) ?? config.dataUri,
    preview: readBoolean2(raw, "preview", toolName) ?? config.preview
  };
  return args;
}
function resolveWorkspaceRoot(config, exec) {
  if (config.workspaceRoot !== void 0) return path2.resolve(config.workspaceRoot);
  const fromSession = exec.agent?.session.header.cwd;
  if (fromSession !== void 0 && fromSession.length > 0) return path2.resolve(fromSession);
  return process.cwd();
}
async function publishSvg(input) {
  const { config, args, root } = input;
  const warnings = [...input.warnings];
  const baseName = safeBaseName(args.name, `${input.prefix}-${contentHash(input.hashParts)}`);
  let svgPath = null;
  let svgHostPath = null;
  let svgBytes = 0;
  let pngPath = null;
  let pngHostPath = null;
  let pngBytes = 0;
  let pngData;
  let pngSize;
  const writeSvg = async () => {
    if (svgPath !== null) return;
    const target = await planOutputTarget(root, config.outputDir, args.path, baseName, ".svg");
    svgBytes = await writeOutput(target, input.svgText);
    svgPath = target.relativePath;
    svgHostPath = target.hostPath;
  };
  if (args.format !== "png") await writeSvg();
  if (args.format !== "svg") {
    try {
      const raster = await rasterizePng(input.svgText, { scale: args.scale, background: args.background });
      const target = await planOutputTarget(root, config.outputDir, args.path, baseName, ".png");
      pngBytes = await writeOutput(target, raster.data);
      pngPath = target.relativePath;
      pngHostPath = target.hostPath;
      pngData = raster.data;
      pngSize = { width: raster.width, height: raster.height };
    } catch (error) {
      const reason = error instanceof RasterUnavailableError ? error.message : `PNG output failed: ${error instanceof Error ? error.message : String(error)}`;
      warnings.push(reason);
      if (svgPath === null) {
        await writeSvg();
        warnings.push("wrote the SVG instead of the requested PNG");
      }
    }
  }
  const svgImage = svgPath !== null ? { relativePath: svgPath, width: input.svgWidth, height: input.svgHeight } : void 0;
  const pngImage = pngPath !== null ? { relativePath: pngPath, width: input.svgWidth, height: input.svgHeight } : void 0;
  const { embed, data_uri_svg, data_uri_png } = buildEmbeds(input.altText, {
    ...svgImage !== void 0 ? { svg: svgImage } : {},
    ...pngImage !== void 0 ? { png: pngImage } : {}
  }, {
    dataUri: args.dataUri,
    svgText: input.svgText,
    ...pngData !== void 0 ? { pngBytes: pngData } : {}
  });
  let previewed = false;
  if (args.preview) {
    if (pngData === void 0) {
      warnings.push("inline preview was requested but no PNG was produced");
    } else {
      const admitted = await admitPreview(input.ctx, input.exec, pngData, `${baseName}.png`);
      if ("ref" in admitted) {
        previewRefs.set(input.exec, admitted.ref);
        previewed = true;
      } else {
        warnings.push(`inline preview unavailable: ${admitted.reason}`);
      }
    }
  }
  const scale = args.scale;
  return {
    kind: input.kind,
    source: input.source,
    display: input.display,
    svg_path: svgPath,
    svg_host_path: svgHostPath,
    png_path: pngPath,
    png_host_path: pngHostPath,
    width: Math.round(svgImage?.width ?? (pngSize !== void 0 ? pngSize.width / args.scale : input.svgWidth)),
    height: Math.round(svgImage?.height ?? (pngSize !== void 0 ? pngSize.height / args.scale : input.svgHeight)),
    pixel_width: pngSize?.width ?? Math.round(input.svgWidth * args.scale),
    pixel_height: pngSize?.height ?? Math.round(input.svgHeight * args.scale),
    scale,
    svg_bytes: svgBytes,
    png_bytes: pngBytes,
    embed,
    data_uri_svg,
    data_uri_png,
    previewed,
    warnings
  };
}
async function publishExistingImage(input) {
  const { embed } = buildEmbeds(input.altText, {
    png: { relativePath: input.target.relativePath, width: input.width, height: input.height }
  }, { dataUri: false });
  const previewed = false;
  const warnings = [...input.warnings];
  if (input.args.preview) {
    warnings.push("inline preview unavailable: this is an existing image file, not a rendered PNG");
  }
  return {
    kind: "image",
    source: input.source,
    display: false,
    svg_path: null,
    svg_host_path: null,
    png_path: input.target.relativePath,
    png_host_path: input.target.hostPath,
    width: input.width,
    height: input.height,
    pixel_width: input.width,
    pixel_height: input.height,
    scale: 1,
    svg_bytes: 0,
    png_bytes: input.bytes,
    embed,
    data_uri_svg: null,
    data_uri_png: null,
    previewed,
    warnings
  };
}
async function admitPreview(ctx, exec, data, name2) {
  const attachments = ctx.get("attachments");
  if (attachments === void 0 || typeof attachments.saveImage !== "function") {
    return { reason: "no durable attachment store is mounted in this profile" };
  }
  const llm = ctx.get("llm");
  const routed = exec.agent?.session.requestHeader?.()?.config;
  const provider = routed?.provider ?? exec.agent?.options?.provider;
  const model = routed?.model ?? exec.agent?.options?.model;
  if (llm === void 0 || provider === void 0 || model === void 0) {
    return { reason: "the active model route could not be resolved" };
  }
  let modalities;
  try {
    modalities = (await llm.resolveModelInfo(provider, model, exec.signal)).inputModalities;
  } catch {
    return { reason: "the active model route could not be verified" };
  }
  if (modalities === void 0 || !modalities.includes("image")) {
    return { reason: `model "${model}" does not declare image input` };
  }
  if (exec.signal.aborted) return { reason: "the call was canceled before the image could be stored" };
  try {
    return { ref: await attachments.saveImage({ data, mediaType: "image/png", name: name2 }) };
  } catch (error) {
    return { reason: `durable image storage rejected the result (${error instanceof Error ? error.message : String(error)})` };
  }
}
function finalizePreview(exec, result) {
  const ref = previewRefs.get(exec);
  if (ref === void 0 || result.isError) return void 0;
  return [...result.content, { type: "image", attachment: ref }];
}
function createTool(spec) {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: MATH_IMAGE_VALUE_SCHEMA,
      render(_args, value) {
        return [{ type: "text", text: formatMathImageValue(value) }];
      }
    },
    execute: (args, exec) => spec.execute(readObject(args, spec.name), exec),
    finalizeContent: finalizePreview
  };
}

// src/tools/formula.ts
var TOOL = "math_formula";
var OWN_KEYS = ["latex", "display", "font_size", "color"];
var ALL_KEYS = [...OWN_KEYS, ...Object.keys(COMMON_PARAMETERS)];
function stripMathDelimiters(input) {
  let source = input.trim();
  const wrapped = [
    ["$$", "$$"],
    ["\\[", "\\]"],
    ["\\(", "\\)"],
    ["$", "$"]
  ];
  for (const [open, close] of wrapped) {
    if (source.startsWith(open) && source.endsWith(close) && source.length > open.length + close.length) {
      source = source.slice(open.length, source.length - close.length).trim();
      break;
    }
  }
  const environment = /^\\begin\{([a-zA-Z*]+)\}([\s\S]*)\\end\{\1\}$/.exec(source);
  const displayEnvironments = ["equation", "equation*", "align", "align*", "gather", "gather*", "displaymath", "math"];
  if (environment !== null && displayEnvironments.includes(environment[1])) {
    source = environment[2].trim();
  }
  return source;
}
async function renderFormulaSvg(latex, options) {
  const rendered = await renderTex(latex, options.display);
  const warnings = [];
  if (rendered.errored) {
    warnings.push("MathJax reported a typesetting error; the image contains an error marker \u2014 check the LaTeX source");
  }
  const { svg, width, height } = standaloneTexSvg(rendered, {
    color: options.color,
    fontSize: options.fontSize,
    padding: options.padding,
    background: options.background
  });
  return { svg, width, height, warnings };
}
function createFormulaTool(ctx, config) {
  return createTool({
    name: TOOL,
    description: "Typeset a LaTeX math formula into a self-contained SVG image plus a PNG raster, write both into the session workspace, and return paths and ready-to-paste document snippets. Every glyph is embedded as a vector path, so the SVG needs no fonts and renders identically in browsers, Word, and LaTeX pipelines. Pass bare TeX math; surrounding $, $$, \\[ \\], \\( \\), or a display environment are tolerated and stripped. Use this whenever a formula must appear as an image in a document, slide, or web page.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["latex"],
      properties: {
        latex: {
          type: "string",
          description: 'The TeX math source, e.g. "\\\\int_0^\\\\infty e^{-x^2}\\\\,dx = \\\\frac{\\\\sqrt{\\\\pi}}{2}". Do not include $ or \\\\begin{equation}.'
        },
        display: {
          type: "boolean",
          default: true,
          description: "true (default) typesets display style (operators get limits, fractions stay large); false uses inline style."
        },
        font_size: {
          type: "number",
          default: 16,
          description: "Fragment size in pixels for one em (default 16, from plugin config)."
        },
        color: {
          type: "string",
          default: "#000000",
          description: 'Ink color as a flat CSS color (default "#000000"): "#1f2937", "navy", "rgb(17,24,39)".'
        },
        ...COMMON_PARAMETERS
      }
    },
    async execute(raw, exec) {
      assertKnownKeys(raw, ALL_KEYS, TOOL);
      const latexRaw = raw.latex;
      if (typeof latexRaw !== "string" || latexRaw.trim().length === 0) {
        throw new Error(`${TOOL}: "latex" must be a non-empty string`);
      }
      if (latexRaw.length > 2e4) throw new Error(`${TOOL}: "latex" is longer than 20000 characters`);
      const latex = stripMathDelimiters(latexRaw);
      if (latex.length === 0) throw new Error(`${TOOL}: "latex" is empty after removing math delimiters`);
      const displayRaw = raw.display;
      if (displayRaw !== void 0 && typeof displayRaw !== "boolean") {
        throw new Error(`${TOOL}: "display" must be a boolean`);
      }
      const display = displayRaw ?? true;
      const fontSizeRaw = raw.font_size;
      if (fontSizeRaw !== void 0 && (typeof fontSizeRaw !== "number" || !Number.isFinite(fontSizeRaw))) {
        throw new Error(`${TOOL}: "font_size" must be a finite number`);
      }
      const fontSize = fontSizeRaw ?? config.fontSize;
      if (fontSize < 6 || fontSize > 96) throw new Error(`${TOOL}: "font_size" must be between 6 and 96`);
      const colorRaw = raw.color;
      if (colorRaw !== void 0 && (typeof colorRaw !== "string" || !isSafeColor(colorRaw))) {
        throw new Error(`${TOOL}: "color" must be a flat CSS color such as "#111827"`);
      }
      const color = colorRaw ?? config.color;
      const args = parseCommonArgs(raw, config, TOOL);
      const root = resolveWorkspaceRoot(config, exec);
      const formula = await renderFormulaSvg(latex, {
        display,
        fontSize,
        color,
        padding: args.padding,
        background: args.background
      });
      return publishSvg({
        kind: "formula",
        source: latex,
        display,
        altText: latex.length > 80 ? `${latex.slice(0, 77)}\u2026` : latex,
        prefix: "formula",
        hashParts: [latex, String(display), String(fontSize), color, args.background, String(args.padding)],
        svgText: formula.svg,
        svgWidth: formula.width,
        svgHeight: formula.height,
        warnings: formula.warnings,
        config,
        args,
        root,
        ctx,
        exec
      });
    }
  });
}

// src/tools/convert.ts
var TOOL2 = "math_convert";
var OWN_KEYS2 = ["source", "font_size", "color"];
var ALL_KEYS2 = [...OWN_KEYS2, ...Object.keys(COMMON_PARAMETERS)];
var SOURCE_KEYS = ["latex", "display", "svg", "path"];
var MAX_SVG_CHARS = 2 * 1024 * 1024;
var MAX_PNG_BYTES = 20 * 1024 * 1024;
function createConvertTool(ctx, config) {
  return createTool({
    name: TOOL2,
    description: "Convert a formula, an inline SVG string, or an existing workspace SVG/PNG file into embeddable image files for a document: rasterize to PNG, normalize/clean the SVG, and return Markdown/HTML/LaTeX snippets plus optional base64 data URIs. Use it to turn a hand-written or pasted SVG into a PNG, or to re-emit an SVG with explicit pixel dimensions. Foreign SVG is sanitized (no scripts, event handlers, DOCTYPE, or external references) and any removal is reported as a warning.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["source"],
      properties: {
        source: {
          type: "object",
          additionalProperties: false,
          description: 'Exactly one of: {"latex":"\u2026", display?} to typeset TeX; {"svg":"<svg \u2026>"} for inline SVG; {"path":"math/foo.svg"} for a workspace file (.svg or .png).',
          properties: {
            latex: { type: "string", description: "TeX math source; rendered like math_formula." },
            display: { type: "boolean", default: true, description: "Display style for a LaTeX source." },
            svg: { type: "string", description: "Inline SVG document text." },
            path: { type: "string", description: "Workspace-relative path to an .svg or .png file." }
          }
        },
        font_size: {
          type: "number",
          default: 16,
          description: "Fragment size in pixels for a LaTeX source (default 16, from plugin config)."
        },
        color: {
          type: "string",
          default: "#000000",
          description: 'Ink color for a LaTeX source (default "#000000").'
        },
        ...COMMON_PARAMETERS
      }
    },
    async execute(raw, exec) {
      assertKnownKeys(raw, ALL_KEYS2, TOOL2);
      const sourceRaw = raw.source;
      if (typeof sourceRaw !== "object" || sourceRaw === null || Array.isArray(sourceRaw)) {
        throw new Error(`${TOOL2}: "source" must be an object with exactly one of "latex", "svg", or "path"`);
      }
      const source = sourceRaw;
      assertKnownKeys(source, SOURCE_KEYS, `${TOOL2} source`);
      const present = ["latex", "svg", "path"].filter((key) => source[key] !== void 0);
      if (present.length !== 1) {
        throw new Error(`${TOOL2}: "source" must contain exactly one of "latex", "svg", or "path" (found ${present.length})`);
      }
      const kind = present[0];
      const args = parseCommonArgs(raw, config, TOOL2);
      const root = resolveWorkspaceRoot(config, exec);
      const warnings = [];
      if (kind === "latex") {
        const latexRaw = source.latex;
        if (typeof latexRaw !== "string" || latexRaw.trim().length === 0) {
          throw new Error(`${TOOL2}: "source.latex" must be a non-empty string`);
        }
        const latex = stripMathDelimiters(latexRaw);
        if (latex.length === 0) throw new Error(`${TOOL2}: "source.latex" is empty after removing math delimiters`);
        const displayRaw = source.display;
        if (displayRaw !== void 0 && typeof displayRaw !== "boolean") {
          throw new Error(`${TOOL2}: "source.display" must be a boolean`);
        }
        const fontSize = raw.font_size === void 0 ? config.fontSize : raw.font_size;
        if (typeof fontSize !== "number" || !Number.isFinite(fontSize) || fontSize < 6 || fontSize > 96) {
          throw new Error(`${TOOL2}: "font_size" must be a number between 6 and 96`);
        }
        const color = raw.color === void 0 ? config.color : raw.color;
        if (typeof color !== "string" || !isSafeColor(color)) {
          throw new Error(`${TOOL2}: "color" must be a flat CSS color such as "#111827"`);
        }
        const formula = await renderFormulaSvg(latex, {
          display: displayRaw ?? true,
          fontSize,
          color,
          padding: args.padding,
          background: args.background
        });
        return publishSvg({
          kind: "formula",
          source: latex,
          display: displayRaw ?? true,
          altText: latex.length > 80 ? `${latex.slice(0, 77)}\u2026` : latex,
          prefix: "formula",
          hashParts: [latex, String(displayRaw ?? true), String(fontSize), color, args.background, String(args.padding)],
          svgText: formula.svg,
          svgWidth: formula.width,
          svgHeight: formula.height,
          warnings: [...warnings, ...formula.warnings],
          config,
          args,
          root,
          ctx,
          exec
        });
      }
      if (kind === "svg") {
        const svgRaw = source.svg;
        if (typeof svgRaw !== "string" || svgRaw.trim().length === 0) {
          throw new Error(`${TOOL2}: "source.svg" must be a non-empty SVG string`);
        }
        const sanitized2 = sanitizeSvg(svgRaw);
        warnings.push(...sanitized2.removed.map((item) => `removed ${item} from the input SVG`));
        return publishSvg({
          kind: "image",
          source: "<inline svg>",
          display: false,
          altText: "SVG image",
          prefix: "image",
          hashParts: [sanitized2.svg, args.background],
          svgText: sanitized2.svg,
          svgWidth: sanitized2.width,
          svgHeight: sanitized2.height,
          warnings,
          config,
          args,
          root,
          ctx,
          exec
        });
      }
      const requested = source.path;
      if (typeof requested !== "string" || requested.trim().length === 0) {
        throw new Error(`${TOOL2}: "source.path" must be a non-empty workspace-relative path`);
      }
      const extension = path3.extname(requested).toLowerCase();
      if (extension === ".png") {
        const { data, target } = await readWorkspaceBytes(root, requested, MAX_PNG_BYTES);
        const size = readPngSize(data);
        if (size === void 0) throw new Error(`${TOOL2}: "${requested}" is not a readable PNG`);
        if (args.format === "svg") throw new Error(`${TOOL2}: a PNG source cannot produce an SVG; use format "png" or "both"`);
        return publishExistingImage({
          kind: "image",
          source: requested,
          altText: path3.basename(requested),
          target,
          width: size.width,
          height: size.height,
          bytes: data.byteLength,
          warnings,
          args,
          ctx,
          exec
        });
      }
      if (extension !== ".svg") {
        throw new Error(`${TOOL2}: "source.path" must end in .svg or .png (got "${extension || "no extension"}")`);
      }
      const { text } = await readWorkspaceText(root, requested, MAX_SVG_CHARS);
      const sanitized = sanitizeSvg(text);
      warnings.push(...sanitized.removed.map((item) => `removed ${item} from the input SVG`));
      return publishSvg({
        kind: "image",
        source: requested,
        display: false,
        altText: path3.basename(requested),
        prefix: path3.basename(requested, extension),
        hashParts: [sanitized.svg, args.background],
        svgText: sanitized.svg,
        svgWidth: sanitized.width,
        svgHeight: sanitized.height,
        warnings,
        config,
        args: { ...args, path: args.path ?? requested },
        root,
        ctx,
        exec
      });
    }
  });
}

// src/tools/figure.ts
var TOOL3 = "math_figure";
var OWN_KEYS3 = ["figure"];
var ALL_KEYS3 = [...OWN_KEYS3, ...Object.keys(COMMON_PARAMETERS)];
var SPEC_HELP = [
  'The spec is {"width"?,"height"?,"padding"?,"background"?,"xRange"?,"yRange"?,"aspect"?,"vars"?,"grid"?,"axes"?,"title"?,"elements":[\u2026]}.',
  'Coordinates are mathematical (y grows upward); "xRange"/"yRange" are [min,max] and auto-fit from the elements when omitted.',
  '"vars" defines named numbers that coordinate expressions may use, e.g. {"a":3,"b":"2*a"} then "at":["a","b"].',
  '"aspect" is "equal" (default: circles stay circles) or "stretch". "grid" is true|{step,color}; "axes" is true|{color,labels} and defaults to true when the spec has curve/parametric/polar elements.',
  'A point is [x,y] with number-or-expression entries, or a string naming an earlier point element with a "label".',
  "Elements:",
  "\xB7 point {at, label?, label_offset?, label_size?, size?, color?, open?} \u2014 label_offset is screen px, y down.",
  '\xB7 segment {from, to, style?, arrow?, color?, width?, label?, label_offset?}; vector = segment with arrow "end".',
  '\xB7 line {through:[p,p], extend?:"both"|"forward"|"backward"|"none", \u2026} and ray {from, through, \u2026}.',
  "\xB7 polyline/polygon {points:[p,\u2026], closed?, fill?, fill_opacity?, label?}.",
  "\xB7 circle {center, radius} or {center, through}; arc {center, radius, start, end} with degrees, counter-clockwise.",
  "\xB7 angle {at, from, to, radius?, right?, label?} \u2014 the arc between two rays; right:true draws the square marker.",
  '\xB7 curve {y:"sin(x)", domain?, samples?}; parametric {x:"cos(t)", y:"sin(3t)", range?}; polar {r:"2cos(3theta)", range?}.',
  '\xB7 text {at, text:"\\\\alpha", size?, anchor?, valign?, rotate?}.',
  'Every label and text is LaTeX, so write "A_1", "\\\\alpha", "\\\\frac{\\\\pi}{2}"; use "\\\\text{\u2026}" for upright words.'
].join("\n");
function createFigureTool(ctx, config) {
  return createTool({
    name: TOOL3,
    description: 'Draw a mathematical figure \u2014 geometry constructions and function/polar/parametric plots \u2014 as a self-contained SVG image plus a PNG raster, write both into the session workspace, and return paths and document snippets. Figures are declared, not coded: a JSON spec of elements in mathematical coordinates, with named points, expressions over named variables, and LaTeX labels. Use this for triangles, circles, angles, axes, unit circles, rose curves, spirals, and any "draw the diagram" request.\n\n' + SPEC_HELP,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["figure"],
      properties: {
        figure: {
          type: "object",
          additionalProperties: true,
          description: "The figure spec. See the tool description for the full element catalog.",
          examples: [{
            width: 420,
            height: 320,
            xRange: [-1, 5],
            yRange: [-1, 4],
            axes: true,
            elements: [
              { type: "polygon", points: [[0, 0], [4, 0], [0, 3]], fill: "#93c5fd33", label: null },
              { type: "point", at: [0, 0], label: "A", label_offset: [-12, 10] },
              { type: "point", at: [4, 0], label: "B", label_offset: [10, 10] },
              { type: "point", at: [0, 3], label: "C", label_offset: [-12, -10] },
              { type: "angle", at: [4, 0], from: [0, 0], to: [0, 3], label: "\\beta" },
              { type: "angle", at: [0, 0], from: [4, 0], to: [0, 3], right: true }
            ]
          }]
        },
        ...COMMON_PARAMETERS
      }
    },
    async execute(raw, exec) {
      assertKnownKeys(raw, ALL_KEYS3, TOOL3);
      const figure = raw.figure;
      if (typeof figure !== "object" || figure === null || Array.isArray(figure)) {
        throw new Error(`${TOOL3}: "figure" must be a JSON object`);
      }
      const args = parseCommonArgs(raw, config, TOOL3);
      const root = resolveWorkspaceRoot(config, exec);
      const warnings = [];
      if (args.background !== "transparent") warnings.push(`background "${args.background}" applies to both the SVG and the PNG`);
      const rendered = await renderFigure(figure, {
        background: args.background,
        padding: args.padding
      });
      return publishSvg({
        kind: "figure",
        source: rendered.source,
        display: false,
        altText: typeof figure.title === "string" ? figure.title : "mathematical figure",
        prefix: "figure",
        hashParts: rendered.hashParts,
        svgText: rendered.svg,
        svgWidth: rendered.width,
        svgHeight: rendered.height,
        warnings: [...warnings, ...rendered.warnings],
        config,
        args,
        root,
        ctx,
        exec
      });
    }
  });
}

// src/index.ts
var name = "math-symbol";
var inject = ["tools"];
function apply(ctx, config) {
  const resolved = resolveConfig(config);
  ctx.tools.register(createFormulaTool(ctx, resolved));
  ctx.tools.register(createFigureTool(ctx, resolved));
  ctx.tools.register(createConvertTool(ctx, resolved));
  ctx.effect(() => () => {
    clearTexCache();
    clearExpressionCache();
  });
}
export {
  RasterUnavailableError,
  apply,
  clearExpressionCache,
  clearTexCache,
  compileExpression,
  evaluateExpression,
  inject,
  inlineTexFragment,
  name,
  rasterizePng,
  readPngSize,
  renderFigure,
  renderTex,
  resolveConfig,
  sanitizeSvg,
  standaloneTexSvg,
  stripMathDelimiters
};
//# sourceMappingURL=index.js.map
