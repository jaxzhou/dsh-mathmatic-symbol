/**
 * Declarative geometry and function figures → SVG.
 *
 * A figure is a JSON spec: a canvas, an optional coordinate frame, and an
 * ordered list of elements. Coordinates are mathematical (y grows upward) and
 * may be expressions over the spec's `vars`, so a parameterized construction
 * is one value away from a static one. Points can be named and referenced by
 * label, which is what makes "draw the median from A to BC" expressible
 * without recomputing coordinates by hand.
 *
 * Everything is emitted in one SVG user space (pixels): the transform from
 * math coordinates happens once, at emit time. Labels are typeset by MathJax
 * as glyph paths, so a figure needs no fonts and rasterizes identically
 * everywhere.
 *
 * @module @jaxzhou/dsh-mathmatic-symbol/figure
 */

import { compileExpression, evaluateExpression, type ExprVars } from './expr.ts'
import { inlineTexFragment, renderTex } from './latex.ts'
import { escapeAttribute, formatNumber, isSafeColor } from './svg.ts'

/** Canvas defaults. */
const DEFAULT_WIDTH = 480
const DEFAULT_HEIGHT = 360
const DEFAULT_PADDING = 16

/** Palette and geometry defaults. */
const DEFAULT_INK = '#1f2937'
const AXIS_COLOR = '#94a3b8'
const GRID_COLOR = '#e2e8f0'
const LABEL_COLOR = '#0f172a'
const DEFAULT_STROKE = 1.6
const LABEL_SIZE = 14
const TICK_SIZE = 12
const TITLE_SIZE = 18
const ARROW_SIZE = 8
const ANGLE_RADIUS = 30
const RIGHT_ANGLE_SIZE = 10
const MAX_ELEMENTS = 200
const MAX_SAMPLES = 4000
const MAX_GRID_LINES = 120
const MAX_TICKS = 40

/** One `[min, max]` numeric range. */
type Range = [number, number]

type StrokeStyle = 'solid' | 'dashed' | 'dotted'
type ArrowSpec = 'none' | 'end' | 'both' | 'start'

/** Stored, resolved geometry, still in math coordinates. */
type Prim =
  | {
    kind: 'polyline'
    pts: [number, number][]
    closed: boolean
    color: string
    width: number
    style: StrokeStyle
    arrow: ArrowSpec
    fill: string | null
    fillOpacity: number
  }
  | {
    kind: 'ellipse'
    cx: number
    cy: number
    r: number
    color: string
    width: number
    style: StrokeStyle
    fill: string | null
    fillOpacity: number
  }
  | {
    kind: 'arc'
    cx: number
    cy: number
    r: number
    a0: number
    a1: number
    color: string
    width: number
    style: StrokeStyle
    arrow: ArrowSpec
  }
  | { kind: 'dot'; x: number; y: number; color: string; size: number; filled: boolean }
  | {
    kind: 'label'
    x: number
    y: number
    tex: string
    size: number
    color: string
    dx: number
    dy: number
    anchor: 'start' | 'middle' | 'end'
    valign: 'baseline' | 'middle' | 'top' | 'bottom'
    rotate: number
  }
  | {
    kind: 'angle'
    vx: number
    vy: number
    u1: [number, number]
    u2: [number, number]
    radiusPx: number
    right: boolean
    color: string
    width: number
    label: string | null
    labelSize: number
  }

/** A straight line whose visible extent depends on the final viewport. */
interface InfiniteLine {
  a: [number, number]
  b: [number, number]
  mode: 'infinite' | 'ray' | 'segment'
  color: string
  width: number
  style: StrokeStyle
  arrow: ArrowSpec
  label: string | null
  labelSize: number
  labelOffset: [number, number]
}

interface Bounds {
  x0: number
  x1: number
  y0: number
  y1: number
}

/** Options accepted by {@link renderFigure}. */
export interface FigureRenderOptions {
  /** Default `background` when the spec omits one. */
  background?: string
  /** Default `padding` when the spec omits one. */
  padding?: number
  /** Identifier stamped on the root element; keeps multiple figures distinguishable. */
  idSeed?: string
}

/** A rendered figure. */
export interface FigureRenderResult {
  svg: string
  width: number
  height: number
  warnings: string[]
  /** Canonical JSON of the accepted spec (bounded). */
  source: string
  /** Parts that make the content hash, in order. */
  hashParts: string[]
}

/** Resolution state for one figure. */
interface ResolveState {
  vars: Record<string, number>
  points: Map<string, [number, number]>
  prims: Prim[]
  lines: InfiniteLine[]
  warnings: string[]
  hasPlot: boolean
  minX: number
  maxX: number
  minY: number
  maxY: number
  touched: boolean
}

function fail(path: string, message: string): never {
  throw new Error(`figure spec: ${path} ${message}`)
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'must be an object')
  return value as Record<string, unknown>
}

function assertKeys(raw: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const unknown = Object.keys(raw).filter(key => !allowed.includes(key))
  if (unknown.length > 0) {
    fail(path, `has unknown key(s) ${unknown.map(key => `"${key}"`).join(', ')}; allowed: ${allowed.join(', ')}`)
  }
}

function optionalNumber(
  raw: Record<string, unknown>,
  key: string,
  path: string,
  min?: number,
  max?: number,
): number | undefined {
  const value = raw[key]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${path}.${key}`, 'must be a finite number')
  if (min !== undefined && value < min) fail(`${path}.${key}`, `must be at least ${min}`)
  if (max !== undefined && value > max) fail(`${path}.${key}`, `must be at most ${max}`)
  return value
}

function numberField(raw: Record<string, unknown>, key: string, path: string, fallback: number): number {
  return optionalNumber(raw, key, path) ?? fallback
}

function optionalBoolean(raw: Record<string, unknown>, key: string, path: string): boolean | undefined {
  const value = raw[key]
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') fail(`${path}.${key}`, 'must be a boolean')
  return value
}

function optionalString(raw: Record<string, unknown>, key: string, path: string): string | undefined {
  const value = raw[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length === 0) fail(`${path}.${key}`, 'must be a non-empty string')
  return value
}

function readColor(raw: Record<string, unknown>, key: string, path: string, fallback: string): string {
  const value = optionalString(raw, key, path)
  if (value === undefined) return fallback
  if (!isSafeColor(value)) fail(`${path}.${key}`, `"${value}" is not a flat CSS color`)
  return value
}

function readStyle(raw: Record<string, unknown>, path: string): StrokeStyle {
  const value = optionalString(raw, 'style', path) ?? 'solid'
  if (value !== 'solid' && value !== 'dashed' && value !== 'dotted') {
    fail(`${path}.style`, 'must be "solid", "dashed", or "dotted"')
  }
  return value
}

function readArrow(raw: Record<string, unknown>, path: string, fallback: ArrowSpec): ArrowSpec {
  const value = optionalString(raw, 'arrow', path) ?? fallback
  if (value !== 'none' && value !== 'end' && value !== 'both' && value !== 'start') {
    fail(`${path}.arrow`, 'must be "none", "end", "start", or "both"')
  }
  return value
}

function readRange(raw: Record<string, unknown>, key: string, path: string): Range | undefined {
  const value = raw[key]
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length !== 2) fail(`${path}.${key}`, 'must be a [min, max] pair')
  const first = value[0]
  const second = value[1]
  if (typeof first !== 'number' || typeof second !== 'number' || !Number.isFinite(first) || !Number.isFinite(second)) {
    fail(`${path}.${key}`, 'must be a [min, max] pair of finite numbers')
  }
  if (first >= second) fail(`${path}.${key}`, 'must satisfy min < max')
  return [first, second]
}

function readOffset(raw: Record<string, unknown>, path: string, fallback: [number, number]): [number, number] {
  const value = raw.label_offset
  if (value === undefined) return fallback
  if (!Array.isArray(value) || value.length !== 2) {
    fail(`${path}.label_offset`, 'must be a [dx, dy] pair')
  }
  const first = value[0]
  const second = value[1]
  if (typeof first !== 'number' || typeof second !== 'number' || !Number.isFinite(first) || !Number.isFinite(second)) {
    fail(`${path}.label_offset`, 'must be a [dx, dy] pair of finite numbers in screen pixels (y grows downward)')
  }
  return [first, second]
}

function readAnchor(raw: Record<string, unknown>, path: string, fallback: 'start' | 'middle' | 'end'): 'start' | 'middle' | 'end' {
  const value = optionalString(raw, 'anchor', path) ?? fallback
  if (value !== 'start' && value !== 'middle' && value !== 'end') fail(`${path}.anchor`, 'must be "start", "middle", or "end"')
  return value
}

function readValign(
  raw: Record<string, unknown>,
  path: string,
  fallback: 'baseline' | 'middle' | 'top' | 'bottom',
): 'baseline' | 'middle' | 'top' | 'bottom' {
  const value = optionalString(raw, 'valign', path) ?? fallback
  if (value !== 'baseline' && value !== 'middle' && value !== 'top' && value !== 'bottom') {
    fail(`${path}.valign`, 'must be "baseline", "middle", "top", or "bottom"')
  }
  return value
}

function readFill(raw: Record<string, unknown>, path: string): { fill: string | null; fillOpacity: number } {
  const fill = optionalString(raw, 'fill', path)
  if (fill === undefined || fill === 'none') return { fill: null, fillOpacity: 0 }
  if (!isSafeColor(fill)) fail(`${path}.fill`, `"${fill}" is not a flat CSS color`)
  return { fill, fillOpacity: optionalNumber(raw, 'fill_opacity', path, 0, 1) ?? 0.18 }
}

function extend(state: ResolveState, x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  if (!state.touched) {
    state.minX = x
    state.maxX = x
    state.minY = y
    state.maxY = y
    state.touched = true
    return
  }
  state.minX = Math.min(state.minX, x)
  state.maxX = Math.max(state.maxX, x)
  state.minY = Math.min(state.minY, y)
  state.maxY = Math.max(state.maxY, y)
}

/** Evaluate one coordinate: a literal number or an expression over `vars`. */
function scalar(raw: unknown, path: string, vars: ExprVars): number {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) fail(path, 'must be a finite number')
    return raw
  }
  if (typeof raw === 'string') {
    try {
      const value = evaluateExpression(raw, vars)
      if (!Number.isFinite(value)) fail(path, `"${raw}" evaluated to ${String(value)}, which is not a usable coordinate`)
      return value
    } catch (error: unknown) {
      fail(path, `"${raw}" is not a usable expression: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  fail(path, 'must be a number or an expression string')
}

function pointRef(raw: unknown, path: string, state: ResolveState): [number, number] {
  if (typeof raw === 'string') {
    const found = state.points.get(raw)
    if (found === undefined) {
      const known = [...state.points.keys()]
      fail(path, `references unknown point "${raw}"${known.length > 0 ? `; defined so far: ${known.join(', ')}` : '; define it with a "point" element first'}`)
    }
    return [found[0], found[1]]
  }
  if (Array.isArray(raw) && raw.length === 2) {
    return [scalar(raw[0], `${path}[0]`, state.vars), scalar(raw[1], `${path}[1]`, state.vars)]
  }
  fail(path, 'must be a point label string or an [x, y] pair')
}

function pointList(raw: unknown, path: string, state: ResolveState): [number, number][] {
  if (!Array.isArray(raw) || raw.length === 0) fail(path, 'must be a non-empty array of points')
  return raw.map((item, index) => pointRef(item, `${path}[${index}]`, state))
}

/** Resolve `vars` in declaration order so later entries may use earlier ones. */
function resolveVars(raw: unknown): Record<string, number> {
  if (raw === undefined) return {}
  const record = asRecord(raw, '"vars"')
  const resolved: Record<string, number> = {}
  for (const [name, value] of Object.entries(record)) {
    if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name)) fail(`"vars.${name}"`, 'must be a valid identifier')
    resolved[name] = scalar(value, `"vars.${name}"`, resolved)
  }
  return resolved
}

const ELEMENT_KEYS: Readonly<Record<string, readonly string[]>> = {
  point: ['type', 'at', 'label', 'label_offset', 'label_size', 'size', 'color', 'open'],
  segment: ['type', 'from', 'to', 'color', 'width', 'style', 'arrow', 'label', 'label_offset', 'label_size'],
  line: ['type', 'through', 'color', 'width', 'style', 'extend', 'label', 'label_offset', 'label_size'],
  ray: ['type', 'from', 'through', 'color', 'width', 'style', 'arrow'],
  vector: ['type', 'from', 'to', 'color', 'width', 'style', 'arrow', 'label', 'label_offset', 'label_size'],
  circle: ['type', 'center', 'radius', 'through', 'color', 'width', 'style', 'fill', 'fill_opacity'],
  arc: ['type', 'center', 'radius', 'start', 'end', 'color', 'width', 'style', 'arrow'],
  polygon: ['type', 'points', 'color', 'width', 'style', 'fill', 'fill_opacity', 'closed', 'label', 'label_size'],
  polyline: ['type', 'points', 'color', 'width', 'style', 'arrow', 'fill', 'fill_opacity', 'closed', 'label', 'label_size'],
  angle: ['type', 'at', 'from', 'to', 'radius', 'label', 'label_size', 'color', 'width', 'right'],
  curve: ['type', 'y', 'domain', 'samples', 'color', 'width', 'style'],
  parametric: ['type', 'x', 'y', 'range', 'samples', 'color', 'width', 'style'],
  polar: ['type', 'r', 'range', 'samples', 'color', 'width', 'style'],
  text: ['type', 'at', 'text', 'size', 'color', 'anchor', 'valign', 'rotate'],
}

function pushPolyline(
  state: ResolveState,
  pts: [number, number][],
  path: string,
  element: Record<string, unknown>,
  options: { closed: boolean; arrow: ArrowSpec; fill: string | null; fillOpacity: number },
): void {
  state.prims.push({
    kind: 'polyline',
    pts,
    closed: options.closed,
    color: readColor(element, 'color', path, DEFAULT_INK),
    width: numberField(element, 'width', path, DEFAULT_STROKE),
    style: readStyle(element, path),
    arrow: options.arrow,
    fill: options.fill,
    fillOpacity: options.fillOpacity,
  })
  for (const [x, y] of pts) extend(state, x, y)
}

function pushLabel(state: ResolveState, label: {
  x: number
  y: number
  tex: string
  size: number
  color: string
  dx: number
  dy: number
  anchor?: 'start' | 'middle' | 'end'
  valign?: 'baseline' | 'middle' | 'top' | 'bottom'
  rotate?: number
}): void {
  state.prims.push({
    kind: 'label',
    x: label.x,
    y: label.y,
    tex: label.tex,
    size: label.size,
    color: label.color,
    dx: label.dx,
    dy: label.dy,
    anchor: label.anchor ?? 'middle',
    valign: label.valign ?? 'middle',
    rotate: label.rotate ?? 0,
  })
}

function midpoint(from: [number, number], to: [number, number]): [number, number] {
  return [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
}

function centroid(points: readonly [number, number][]): [number, number] {
  let x = 0
  let y = 0
  for (const point of points) {
    x += point[0]
    y += point[1]
  }
  return [x / points.length, y / points.length]
}

function unitVector(x: number, y: number, path: string): [number, number] {
  const length = Math.hypot(x, y)
  if (!Number.isFinite(length) || length < 1e-9) fail(path, 'coincides with the vertex, so no angle can be drawn')
  return [x / length, y / length]
}

/** Angles on the swept arc that touch a quadrant, plus both endpoints. */
function arcExtremes(a0: number, a1: number): number[] {
  const low = Math.min(a0, a1)
  const high = Math.max(a0, a1)
  const angles = [a0, a1]
  for (let quarter = 0; quarter < 8; quarter += 1) {
    const candidate = (quarter * Math.PI) / 2
    for (let k = -4; k <= 4; k += 1) {
      const value = candidate + k * 2 * Math.PI
      if (value >= low && value <= high) angles.push(value)
    }
  }
  return angles
}

function resolveElement(raw: unknown, index: number, state: ResolveState): void {
  const path = `elements[${index}]`
  const element = asRecord(raw, path)
  const type = element.type
  if (typeof type !== 'string') fail(`${path}.type`, 'must be a string naming the element type')
  const allowed = ELEMENT_KEYS[type]
  if (allowed === undefined) {
    fail(`${path}.type`, `"${type}" is not a known element type; known types: ${Object.keys(ELEMENT_KEYS).join(', ')}`)
  }
  assertKeys(element, allowed, path)

  switch (type) {
    case 'point': {
      const at = pointRef(element.at, `${path}.at`, state)
      const label = optionalString(element, 'label', path)
      if (label !== undefined) state.points.set(label, at)
      state.prims.push({
        kind: 'dot',
        x: at[0],
        y: at[1],
        color: readColor(element, 'color', path, DEFAULT_INK),
        size: numberField(element, 'size', path, 3),
        filled: !(optionalBoolean(element, 'open', path) ?? false),
      })
      if (label !== undefined) {
        const [dx, dy] = readOffset(element, path, [10, -10])
        pushLabel(state, {
          x: at[0],
          y: at[1],
          tex: label,
          size: numberField(element, 'label_size', path, LABEL_SIZE),
          color: LABEL_COLOR,
          dx,
          dy,
        })
      }
      extend(state, at[0], at[1])
      return
    }
    case 'segment':
    case 'vector': {
      const from = pointRef(element.from, `${path}.from`, state)
      const to = pointRef(element.to, `${path}.to`, state)
      pushPolyline(state, [from, to], path, element, {
        closed: false,
        arrow: readArrow(element, path, type === 'vector' ? 'end' : 'none'),
        fill: null,
        fillOpacity: 0,
      })
      const label = optionalString(element, 'label', path)
      if (label !== undefined) {
        const [dx, dy] = readOffset(element, path, [0, -10])
        const [x, y] = midpoint(from, to)
        pushLabel(state, { x, y, tex: label, size: numberField(element, 'label_size', path, LABEL_SIZE), color: LABEL_COLOR, dx, dy })
      }
      return
    }
    case 'polyline':
    case 'polygon': {
      const points = pointList(element.points, `${path}.points`, state)
      const closed = optionalBoolean(element, 'closed', path) ?? type === 'polygon'
      const { fill, fillOpacity } = readFill(element, path)
      pushPolyline(state, points, path, element, {
        closed,
        arrow: readArrow(element, path, 'none'),
        fill,
        fillOpacity,
      })
      const label = optionalString(element, 'label', path)
      if (label !== undefined) {
        const [x, y] = centroid(points)
        pushLabel(state, { x, y, tex: label, size: numberField(element, 'label_size', path, LABEL_SIZE), color: LABEL_COLOR, dx: 0, dy: 0 })
      }
      return
    }
    case 'line':
    case 'ray': {
      const through = pointList(element.through, `${path}.through`, state)
      if (through.length !== 2) fail(`${path}.through`, 'must contain exactly two points')
      const a = through[0] as [number, number]
      const b = through[1] as [number, number]
      const extendMode = optionalString(element, 'extend', path) ?? 'both'
      if (extendMode !== 'both' && extendMode !== 'forward' && extendMode !== 'backward' && extendMode !== 'none') {
        fail(`${path}.extend`, 'must be "both", "forward", "backward", or "none"')
      }
      state.lines.push({
        a,
        b,
        mode: type === 'ray' ? 'ray' : extendMode === 'none' ? 'segment' : 'infinite',
        color: readColor(element, 'color', path, DEFAULT_INK),
        width: numberField(element, 'width', path, DEFAULT_STROKE),
        style: readStyle(element, path),
        arrow: readArrow(element, path, type === 'ray' ? 'end' : 'none'),
        label: optionalString(element, 'label', path) ?? null,
        labelSize: numberField(element, 'label_size', path, LABEL_SIZE),
        labelOffset: readOffset(element, path, [0, -10]),
      })
      extend(state, a[0], a[1])
      extend(state, b[0], b[1])
      return
    }
    case 'circle': {
      const center = pointRef(element.center, `${path}.center`, state)
      const through = element.through === undefined ? undefined : pointRef(element.through, `${path}.through`, state)
      const declared = optionalNumber(element, 'radius', path, 0)
      const radius = declared ?? (through !== undefined ? Math.hypot(through[0] - center[0], through[1] - center[1]) : undefined)
      if (radius === undefined || radius <= 0) fail(path, 'needs a positive "radius" or a "through" point')
      const { fill, fillOpacity } = readFill(element, path)
      state.prims.push({
        kind: 'ellipse',
        cx: center[0],
        cy: center[1],
        r: radius,
        color: readColor(element, 'color', path, DEFAULT_INK),
        width: numberField(element, 'width', path, DEFAULT_STROKE),
        style: readStyle(element, path),
        fill,
        fillOpacity,
      })
      extend(state, center[0] - radius, center[1] - radius)
      extend(state, center[0] + radius, center[1] + radius)
      return
    }
    case 'arc': {
      const center = pointRef(element.center, `${path}.center`, state)
      const radius = optionalNumber(element, 'radius', path, 0)
      if (radius === undefined || radius <= 0) fail(path, 'needs a positive "radius"')
      const start = optionalNumber(element, 'start', path)
      const end = optionalNumber(element, 'end', path)
      if (start === undefined || end === undefined) fail(path, 'needs "start" and "end" angles in degrees')
      const a0 = (start * Math.PI) / 180
      const a1 = (end * Math.PI) / 180
      state.prims.push({
        kind: 'arc',
        cx: center[0],
        cy: center[1],
        r: radius,
        a0,
        a1,
        color: readColor(element, 'color', path, DEFAULT_INK),
        width: numberField(element, 'width', path, DEFAULT_STROKE),
        style: readStyle(element, path),
        arrow: readArrow(element, path, 'none'),
      })
      for (const angle of arcExtremes(a0, a1)) {
        extend(state, center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle))
      }
      return
    }
    case 'angle': {
      const at = pointRef(element.at, `${path}.at`, state)
      const from = pointRef(element.from, `${path}.from`, state)
      const to = pointRef(element.to, `${path}.to`, state)
      state.prims.push({
        kind: 'angle',
        vx: at[0],
        vy: at[1],
        u1: unitVector(from[0] - at[0], from[1] - at[1], `${path}.from`),
        u2: unitVector(to[0] - at[0], to[1] - at[1], `${path}.to`),
        radiusPx: numberField(element, 'radius', path, ANGLE_RADIUS),
        right: optionalBoolean(element, 'right', path) ?? false,
        color: readColor(element, 'color', path, DEFAULT_INK),
        width: numberField(element, 'width', path, DEFAULT_STROKE),
        label: optionalString(element, 'label', path) ?? null,
        labelSize: numberField(element, 'label_size', path, LABEL_SIZE),
      })
      extend(state, at[0], at[1])
      return
    }
    case 'curve': {
      const expression = optionalString(element, 'y', path)
      if (expression === undefined) fail(path, 'needs "y" (an expression in x)')
      const domain = readRange(element, 'domain', path) ?? [-5, 5]
      const samples = Math.round(numberField(element, 'samples', path, 400))
      if (samples < 2 || samples > MAX_SAMPLES) fail(`${path}.samples`, `must be between 2 and ${MAX_SAMPLES}`)
      state.hasPlot = true
      const compiled = compileExpression(expression)
      const pts: [number, number][] = []
      let failures = 0
      let firstError: string | undefined
      for (let i = 0; i < samples; i += 1) {
        const x = domain[0] + ((domain[1] - domain[0]) * i) / (samples - 1)
        try {
          const y = compiled({ ...state.vars, x })
          if (Number.isFinite(y)) pts.push([x, y])
          else failures += 1
        } catch (error: unknown) {
          failures += 1
          firstError ??= error instanceof Error ? error.message : String(error)
        }
      }
      if (pts.length < 2) {
        fail(`${path}.y`, `"${expression}" produced no drawable points on ${JSON.stringify(domain)}${firstError !== undefined ? ` (${firstError})` : ''}`)
      }
      if (failures > 0) state.warnings.push(`${path}: ${failures} sample(s) were outside the function's domain and were skipped`)
      pushPolyline(state, pts, path, element, { closed: false, arrow: 'none', fill: null, fillOpacity: 0 })
      return
    }
    case 'parametric': {
      const xExpression = optionalString(element, 'x', path)
      const yExpression = optionalString(element, 'y', path)
      if (xExpression === undefined || yExpression === undefined) fail(path, 'needs "x" and "y" expressions in t')
      const range = readRange(element, 'range', path) ?? [0, Math.PI * 2]
      const samples = Math.round(numberField(element, 'samples', path, 400))
      if (samples < 2 || samples > MAX_SAMPLES) fail(`${path}.samples`, `must be between 2 and ${MAX_SAMPLES}`)
      state.hasPlot = true
      const compiledX = compileExpression(xExpression)
      const compiledY = compileExpression(yExpression)
      const pts: [number, number][] = []
      let failures = 0
      let firstError: string | undefined
      for (let i = 0; i < samples; i += 1) {
        const t = range[0] + ((range[1] - range[0]) * i) / (samples - 1)
        try {
          const x = compiledX({ ...state.vars, t })
          const y = compiledY({ ...state.vars, t })
          if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y])
          else failures += 1
        } catch (error: unknown) {
          failures += 1
          firstError ??= error instanceof Error ? error.message : String(error)
        }
      }
      if (pts.length < 2) fail(path, `produced no drawable points${firstError !== undefined ? ` (${firstError})` : ''}`)
      if (failures > 0) state.warnings.push(`${path}: ${failures} sample(s) were skipped`)
      pushPolyline(state, pts, path, element, { closed: false, arrow: 'none', fill: null, fillOpacity: 0 })
      return
    }
    case 'polar': {
      const rExpression = optionalString(element, 'r', path)
      if (rExpression === undefined) fail(path, 'needs "r" (an expression in theta)')
      const range = readRange(element, 'range', path) ?? [0, Math.PI * 2]
      const samples = Math.round(numberField(element, 'samples', path, 400))
      if (samples < 2 || samples > MAX_SAMPLES) fail(`${path}.samples`, `must be between 2 and ${MAX_SAMPLES}`)
      state.hasPlot = true
      const compiled = compileExpression(rExpression)
      const pts: [number, number][] = []
      let failures = 0
      let firstError: string | undefined
      for (let i = 0; i < samples; i += 1) {
        const theta = range[0] + ((range[1] - range[0]) * i) / (samples - 1)
        try {
          const r = compiled({ ...state.vars, theta, θ: theta, t: theta })
          const x = r * Math.cos(theta)
          const y = r * Math.sin(theta)
          if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y])
          else failures += 1
        } catch (error: unknown) {
          failures += 1
          firstError ??= error instanceof Error ? error.message : String(error)
        }
      }
      if (pts.length < 2) fail(path, `produced no drawable points${firstError !== undefined ? ` (${firstError})` : ''}`)
      if (failures > 0) state.warnings.push(`${path}: ${failures} sample(s) were skipped`)
      pushPolyline(state, pts, path, element, { closed: false, arrow: 'none', fill: null, fillOpacity: 0 })
      return
    }
    case 'text': {
      const at = pointRef(element.at, `${path}.at`, state)
      const text = optionalString(element, 'text', path)
      if (text === undefined) fail(path, 'needs "text"')
      pushLabel(state, {
        x: at[0],
        y: at[1],
        tex: text,
        size: numberField(element, 'size', path, LABEL_SIZE),
        color: readColor(element, 'color', path, LABEL_COLOR),
        dx: 0,
        dy: 0,
        anchor: readAnchor(element, path, 'middle'),
        valign: readValign(element, path, 'middle'),
        rotate: numberField(element, 'rotate', path, 0),
      })
      extend(state, at[0], at[1])
      return
    }
    default:
      fail(`${path}.type`, `"${type}" is declared but not implemented`)
  }
}

/** Liang–Barsky clip of a parametric line against the viewport rectangle. */
function clipLine(
  a: [number, number],
  b: [number, number],
  bounds: Bounds,
  mode: InfiniteLine['mode'],
): [[number, number], [number, number]] | undefined {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  let t0 = mode === 'segment' ? 0 : -1e6
  let t1 = mode === 'segment' ? 1 : 1e6
  const tests: readonly [number, number][] = [
    [-dx, a[0] - bounds.x0],
    [dx, bounds.x1 - a[0]],
    [-dy, a[1] - bounds.y0],
    [dy, bounds.y1 - a[1]],
  ]
  for (const [p, q] of tests) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return undefined
      continue
    }
    const ratio = q / p
    if (p < 0) t0 = Math.max(t0, ratio)
    else t1 = Math.min(t1, ratio)
    if (t0 > t1) return undefined
  }
  return [
    [a[0] + dx * t0, a[1] + dy * t0],
    [a[0] + dx * t1, a[1] + dy * t1],
  ]
}

function niceStep(span: number, target = 8): number {
  const raw = span / target
  if (!Number.isFinite(raw) || raw <= 0) return 1
  const exponent = Math.floor(Math.log10(raw))
  const base = 10 ** exponent
  for (const multiplier of [1, 2, 2.5, 5, 10]) {
    if (raw <= multiplier * base) return multiplier * base
  }
  return 10 * base
}

function formatTick(value: number, step: number): string {
  if (Math.abs(value) < step * 1e-6) return '0'
  const rounded = Number(value.toPrecision(12))
  if (Number.isInteger(rounded)) return String(rounded)
  return String(rounded)
}

interface Transform {
  sx: number
  sy: number
  x: (value: number) => number
  y: (value: number) => number
}

function makeTransform(
  bounds: Bounds,
  width: number,
  height: number,
  padding: number,
  aspect: 'equal' | 'stretch',
): Transform {
  const availableWidth = Math.max(1, width - padding * 2)
  const availableHeight = Math.max(1, height - padding * 2)
  const spanX = bounds.x1 - bounds.x0
  const spanY = bounds.y1 - bounds.y0
  if (aspect === 'stretch') {
    const sx = availableWidth / spanX
    const sy = availableHeight / spanY
    return {
      sx,
      sy,
      x: value => padding + (value - bounds.x0) * sx,
      y: value => padding + (bounds.y1 - value) * sy,
    }
  }
  const scale = Math.min(availableWidth / spanX, availableHeight / spanY)
  const offsetX = padding + (availableWidth - spanX * scale) / 2
  const offsetY = padding + (availableHeight - spanY * scale) / 2
  return {
    sx: scale,
    sy: scale,
    x: value => offsetX + (value - bounds.x0) * scale,
    y: value => offsetY + (bounds.y1 - value) * scale,
  }
}

function dashAttributes(style: StrokeStyle, width: number): string {
  if (style === 'dashed') {
    return ` stroke-dasharray="${formatNumber(Math.max(4, width * 4))} ${formatNumber(Math.max(3, width * 3))}"`
  }
  if (style === 'dotted') {
    return ` stroke-dasharray="0.01 ${formatNumber(Math.max(2.5, width * 2.5))}" stroke-linecap="round"`
  }
  return ''
}

function strokeAttributes(color: string, width: number, style: StrokeStyle): string {
  return ` fill="none" stroke="${escapeAttribute(color)}" stroke-width="${formatNumber(width)}"${dashAttributes(style, width)}`
}

/** Stroke-only attributes, for shapes that already declare their own fill. */
function outlineAttributes(color: string, width: number, style: StrokeStyle): string {
  return ` stroke="${escapeAttribute(color)}" stroke-width="${formatNumber(width)}"${dashAttributes(style, width)}`
}

function arrowMarkup(from: [number, number], to: [number, number], color: string, size = ARROW_SIZE): string {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const length = Math.hypot(dx, dy)
  if (!Number.isFinite(length) || length < 1e-6) return ''
  const ux = dx / length
  const uy = dy / length
  const baseX = to[0] - ux * size
  const baseY = to[1] - uy * size
  const halfWidth = size * 0.42
  const first = `${formatNumber(baseX - uy * halfWidth)} ${formatNumber(baseY + ux * halfWidth)}`
  const second = `${formatNumber(baseX + uy * halfWidth)} ${formatNumber(baseY - ux * halfWidth)}`
  return `<polygon points="${first} ${second} ${formatNumber(to[0])} ${formatNumber(to[1])}"`
    + ` fill="${escapeAttribute(color)}"/>`
}

function pathData(points: readonly [number, number][], closed: boolean): string {
  const parts: string[] = []
  for (const [index, point] of points.entries()) {
    parts.push(`${index === 0 ? 'M' : 'L'}${formatNumber(point[0])} ${formatNumber(point[1])}`)
  }
  if (closed) parts.push('Z')
  return parts.join(' ')
}

/** Split a sampled pixel path into runs that stay near the viewport. */
function visibleRuns(points: readonly [number, number][], width: number, height: number, margin: number): [number, number][][] {
  const runs: [number, number][][] = []
  let current: [number, number][] = []
  for (const point of points) {
    const inside = point[0] >= -margin && point[0] <= width + margin && point[1] >= -margin && point[1] <= height + margin
    if (inside) current.push(point)
    else if (current.length > 0) {
      runs.push(current)
      current = []
    }
  }
  if (current.length > 0) runs.push(current)
  return runs
}

function emitPolyline(prim: Extract<Prim, { kind: 'polyline' }>, transform: Transform, width: number, height: number): string {
  const pixelPoints = prim.pts.map(([x, y]) => [transform.x(x), transform.y(y)] as [number, number])
  const filled = prim.fill !== null
  const attributes = filled
    ? ` fill="${escapeAttribute(prim.fill as string)}" fill-opacity="${formatNumber(prim.fillOpacity)}"`
      + ` stroke="${escapeAttribute(prim.color)}" stroke-width="${formatNumber(prim.width)}"${dashAttributes(prim.style, prim.width)}`
    : ` fill="none" stroke="${escapeAttribute(prim.color)}" stroke-width="${formatNumber(prim.width)}"`
      + dashAttributes(prim.style, prim.width)
  const markup: string[] = []
  const runs = prim.closed ? [pixelPoints] : visibleRuns(pixelPoints, width, height, 24)
  for (const run of runs) {
    if (run.length < 2) continue
    markup.push(`<path d="${pathData(run, prim.closed)}"${attributes}/>`)
  }
  if (prim.arrow !== 'none' && pixelPoints.length >= 2) {
    const first = pixelPoints[0] as [number, number]
    const second = pixelPoints[1] as [number, number]
    const last = pixelPoints[pixelPoints.length - 1] as [number, number]
    const beforeLast = pixelPoints[pixelPoints.length - 2] as [number, number]
    if (prim.arrow === 'end' || prim.arrow === 'both') markup.push(arrowMarkup(beforeLast, last, prim.color))
    if (prim.arrow === 'start' || prim.arrow === 'both') markup.push(arrowMarkup(second, first, prim.color))
  }
  return markup.join('')
}

async function emitPrim(prim: Prim, transform: Transform): Promise<string> {
  switch (prim.kind) {
    case 'polyline':
      return '' // emitted by the caller so the viewport size is available
    case 'ellipse': {
      const fill = prim.fill !== null
        ? ` fill="${escapeAttribute(prim.fill)}" fill-opacity="${formatNumber(prim.fillOpacity)}"`
        : ' fill="none"'
      return `<ellipse cx="${formatNumber(transform.x(prim.cx))}" cy="${formatNumber(transform.y(prim.cy))}"`
        + ` rx="${formatNumber(prim.r * transform.sx)}" ry="${formatNumber(prim.r * transform.sy)}"`
        + `${fill}${outlineAttributes(prim.color, prim.width, prim.style)}/>`
    }
    case 'arc': {
      const start: [number, number] = [transform.x(prim.cx + prim.r * Math.cos(prim.a0)), transform.y(prim.cy + prim.r * Math.sin(prim.a0))]
      const end: [number, number] = [transform.x(prim.cx + prim.r * Math.cos(prim.a1)), transform.y(prim.cy + prim.r * Math.sin(prim.a1))]
      const delta = prim.a1 - prim.a0
      const path = `<path d="M${formatNumber(start[0])} ${formatNumber(start[1])}`
        + ` A${formatNumber(prim.r * transform.sx)} ${formatNumber(prim.r * transform.sy)} 0`
        + ` ${Math.abs(delta) > Math.PI ? 1 : 0} ${delta >= 0 ? 0 : 1}`
        + ` ${formatNumber(end[0])} ${formatNumber(end[1])}"`
        + `${strokeAttributes(prim.color, prim.width, prim.style)}/>`
      if (prim.arrow === 'none') return path
      const direction = delta >= 0 ? 1 : -1
      const tangent: [number, number] = [-Math.sin(prim.a1) * direction * transform.sx, -Math.cos(prim.a1) * direction * transform.sy]
      const tail: [number, number] = [end[0] - tangent[0] * 0.2, end[1] - tangent[1] * 0.2]
      return path + arrowMarkup(tail, end, prim.color)
    }
    case 'dot': {
      const fill = prim.filled ? escapeAttribute(prim.color) : '#ffffff'
      return `<circle cx="${formatNumber(transform.x(prim.x))}" cy="${formatNumber(transform.y(prim.y))}"`
        + ` r="${formatNumber(prim.size)}" fill="${fill}" stroke="${escapeAttribute(prim.color)}" stroke-width="1.4"/>`
    }
    case 'label': {
      const rendered = await renderTex(prim.tex, false)
      return inlineTexFragment(rendered, transform.x(prim.x) + prim.dx, transform.y(prim.y) + prim.dy, {
        color: prim.color,
        fontSize: prim.size,
        anchor: prim.anchor,
        valign: prim.valign,
        rotate: prim.rotate,
      })
    }
    case 'angle': {
      const vertex: [number, number] = [transform.x(prim.vx), transform.y(prim.vy)]
      const d1: [number, number] = [prim.u1[0] * transform.sx, -prim.u1[1] * transform.sy]
      const d2: [number, number] = [prim.u2[0] * transform.sx, -prim.u2[1] * transform.sy]
      const u1 = unitVector(d1[0], d1[1], 'angle')
      const u2 = unitVector(d2[0], d2[1], 'angle')
      const a0 = Math.atan2(u1[1], u1[0])
      const a1 = Math.atan2(u2[1], u2[0])
      let delta = a1 - a0
      while (delta > Math.PI) delta -= 2 * Math.PI
      while (delta < -Math.PI) delta += 2 * Math.PI
      const markup: string[] = []
      if (prim.right) {
        const size = Math.min(RIGHT_ANGLE_SIZE, prim.radiusPx)
        const p1: [number, number] = [vertex[0] + u1[0] * size, vertex[1] + u1[1] * size]
        const p2: [number, number] = [vertex[0] + (u1[0] + u2[0]) * size, vertex[1] + (u1[1] + u2[1]) * size]
        const p3: [number, number] = [vertex[0] + u2[0] * size, vertex[1] + u2[1] * size]
        markup.push(`<path d="${pathData([p1, p2, p3], false)}"${strokeAttributes(prim.color, prim.width, 'solid')}/>`)
      } else {
        const radius = prim.radiusPx
        const start: [number, number] = [vertex[0] + u1[0] * radius, vertex[1] + u1[1] * radius]
        const end: [number, number] = [vertex[0] + u2[0] * radius, vertex[1] + u2[1] * radius]
        markup.push(`<path d="M${formatNumber(start[0])} ${formatNumber(start[1])}`
          + ` A${formatNumber(radius)} ${formatNumber(radius)} 0 ${Math.abs(delta) > Math.PI ? 1 : 0} ${delta >= 0 ? 1 : 0}`
          + ` ${formatNumber(end[0])} ${formatNumber(end[1])}"${strokeAttributes(prim.color, prim.width, 'solid')}/>`)
      }
      if (prim.label !== null) {
        const mid = a0 + delta / 2
        const distance = prim.radiusPx * 1.6
        const rendered = await renderTex(prim.label, false)
        markup.push(inlineTexFragment(rendered, vertex[0] + Math.cos(mid) * distance, vertex[1] + Math.sin(mid) * distance, {
          color: prim.color,
          fontSize: prim.labelSize,
          anchor: 'middle',
          valign: 'middle',
        }))
      }
      return markup.join('')
    }
    default:
      return ''
  }
}

const AXES_KEYS = ['color', 'labels'] as const
const GRID_KEYS = ['step', 'color'] as const

function readAxes(raw: unknown): { enabled: boolean; labelsEnabled: boolean; color: string } {
  if (raw === undefined) return { enabled: false, labelsEnabled: true, color: AXIS_COLOR }
  if (typeof raw === 'boolean') return { enabled: raw, labelsEnabled: true, color: AXIS_COLOR }
  const record = asRecord(raw, '"axes"')
  assertKeys(record, AXES_KEYS, '"axes"')
  return {
    enabled: true,
    labelsEnabled: optionalBoolean(record, 'labels', '"axes"') ?? true,
    color: readColor(record, 'color', '"axes"', AXIS_COLOR),
  }
}

function readGrid(raw: unknown): { enabled: boolean; step: number | undefined; color: string } {
  if (raw === undefined) return { enabled: false, step: undefined, color: GRID_COLOR }
  if (typeof raw === 'boolean') return { enabled: raw, step: undefined, color: GRID_COLOR }
  const record = asRecord(raw, '"grid"')
  assertKeys(record, GRID_KEYS, '"grid"')
  return {
    enabled: true,
    step: optionalNumber(record, 'step', '"grid"', 1e-9),
    color: readColor(record, 'color', '"grid"', GRID_COLOR),
  }
}

const TOP_LEVEL_KEYS = [
  'width', 'height', 'padding', 'background', 'xRange', 'yRange', 'aspect',
  'vars', 'grid', 'axes', 'title', 'elements',
] as const

function computeBounds(
  state: ResolveState,
  xRange: Range | undefined,
  yRange: Range | undefined,
  width: number,
  height: number,
  padding: number,
  aspect: 'equal' | 'stretch',
): Bounds {
  const availableWidth = Math.max(1, width - padding * 2)
  const availableHeight = Math.max(1, height - padding * 2)

  let auto: Bounds
  if (state.touched) {
    const marginX = (state.maxX - state.minX) * 0.06 || 1
    const marginY = (state.maxY - state.minY) * 0.06 || 1
    auto = {
      x0: state.minX - marginX,
      x1: state.maxX + marginX,
      y0: state.minY - marginY,
      y1: state.maxY + marginY,
    }
  } else {
    auto = { x0: -5, x1: 5, y0: -3, y1: 3 }
  }

  let bounds: Bounds
  if (xRange !== undefined && yRange !== undefined) {
    bounds = { x0: xRange[0], x1: xRange[1], y0: yRange[0], y1: yRange[1] }
  } else if (xRange !== undefined) {
    const spanY = (xRange[1] - xRange[0]) * (availableHeight / availableWidth)
    const center = (auto.y0 + auto.y1) / 2
    bounds = { x0: xRange[0], x1: xRange[1], y0: center - spanY / 2, y1: center + spanY / 2 }
  } else if (yRange !== undefined) {
    const spanX = (yRange[1] - yRange[0]) * (availableWidth / availableHeight)
    const center = (auto.x0 + auto.x1) / 2
    bounds = { x0: center - spanX / 2, x1: center + spanX / 2, y0: yRange[0], y1: yRange[1] }
  } else {
    bounds = auto
  }

  if (aspect === 'equal') {
    const targetRatio = availableWidth / availableHeight
    const spanX = bounds.x1 - bounds.x0
    const spanY = bounds.y1 - bounds.y0
    const ratio = spanX / spanY
    if (ratio < targetRatio) {
      const wanted = spanY * targetRatio
      const center = (bounds.x0 + bounds.x1) / 2
      bounds = { ...bounds, x0: center - wanted / 2, x1: center + wanted / 2 }
    } else if (ratio > targetRatio) {
      const wanted = spanX / targetRatio
      const center = (bounds.y0 + bounds.y1) / 2
      bounds = { ...bounds, y0: center - wanted / 2, y1: center + wanted / 2 }
    }
  }
  if (bounds.x1 - bounds.x0 < 1e-9) bounds = { ...bounds, x0: bounds.x0 - 1, x1: bounds.x1 + 1 }
  if (bounds.y1 - bounds.y0 < 1e-9) bounds = { ...bounds, y0: bounds.y0 - 1, y1: bounds.y1 + 1 }
  return bounds
}

function emitGrid(bounds: Bounds, transform: Transform, grid: { step: number | undefined; color: string }): string {
  const stepX = grid.step ?? niceStep(bounds.x1 - bounds.x0)
  const stepY = grid.step ?? niceStep(bounds.y1 - bounds.y0)
  const parts: string[] = []
  const stroke = ` stroke="${escapeAttribute(grid.color)}" stroke-width="1"`
  let drawn = 0
  for (let value = Math.ceil(bounds.x0 / stepX) * stepX; value <= bounds.x1 && drawn < MAX_GRID_LINES; value += stepX) {
    if (Math.abs(value) > stepX * 1e-6) {
      const x = transform.x(value)
      parts.push(`<line x1="${formatNumber(x)}" y1="${formatNumber(transform.y(bounds.y0))}" x2="${formatNumber(x)}" y2="${formatNumber(transform.y(bounds.y1))}"${stroke}/>`)
      drawn += 1
    }
  }
  for (let value = Math.ceil(bounds.y0 / stepY) * stepY; value <= bounds.y1 && drawn < MAX_GRID_LINES; value += stepY) {
    if (Math.abs(value) > stepY * 1e-6) {
      const y = transform.y(value)
      parts.push(`<line x1="${formatNumber(transform.x(bounds.x0))}" y1="${formatNumber(y)}" x2="${formatNumber(transform.x(bounds.x1))}" y2="${formatNumber(y)}"${stroke}/>`)
      drawn += 1
    }
  }
  return parts.join('')
}

async function emitAxes(
  bounds: Bounds,
  transform: Transform,
  axes: { labelsEnabled: boolean; color: string },
  grid: { step: number | undefined },
  width: number,
  height: number,
): Promise<string> {
  const parts: string[] = []
  const stepX = grid.step ?? niceStep(bounds.x1 - bounds.x0)
  const stepY = grid.step ?? niceStep(bounds.y1 - bounds.y0)
  const axisY = Math.min(Math.max(0, bounds.y0), bounds.y1)
  const axisX = Math.min(Math.max(0, bounds.x0), bounds.x1)
  const axisYPixel = transform.y(axisY)
  const axisXPixel = transform.x(axisX)
  const stroke = ` stroke="${escapeAttribute(axes.color)}" stroke-width="1.4"`

  parts.push(`<line x1="${formatNumber(transform.x(bounds.x0))}" y1="${formatNumber(axisYPixel)}" x2="${formatNumber(transform.x(bounds.x1))}" y2="${formatNumber(axisYPixel)}"${stroke}/>`)
  parts.push(`<line x1="${formatNumber(axisXPixel)}" y1="${formatNumber(transform.y(bounds.y0))}" x2="${formatNumber(axisXPixel)}" y2="${formatNumber(transform.y(bounds.y1))}"${stroke}/>`)
  parts.push(arrowMarkup([transform.x(bounds.x1) - 14, axisYPixel], [transform.x(bounds.x1), axisYPixel], axes.color, 8))
  parts.push(arrowMarkup([axisXPixel, transform.y(bounds.y1) + 14], [axisXPixel, transform.y(bounds.y1)], axes.color, 8))

  if (axes.labelsEnabled) {
    const xLabel = await renderTex('x', false)
    const yLabel = await renderTex('y', false)
    parts.push(inlineTexFragment(xLabel, width - 2, axisYPixel - 5, {
      color: axes.color, fontSize: TICK_SIZE + 2, anchor: 'end', valign: 'bottom',
    }))
    parts.push(inlineTexFragment(yLabel, axisXPixel + 9, 2, {
      color: axes.color, fontSize: TICK_SIZE + 2, anchor: 'start', valign: 'top',
    }))
  }

  const labelBelow = axisYPixel < height / 2
  const labelLeft = axisXPixel > width / 2
  const xAxisAtZero = Math.abs(axisY) < stepY * 1e-6
  let ticks = 0
  for (let value = Math.ceil(bounds.x0 / stepX) * stepX; value <= bounds.x1 && ticks < MAX_TICKS; value += stepX) {
    const x = transform.x(value)
    parts.push(`<line x1="${formatNumber(x)}" y1="${formatNumber(axisYPixel - 3)}" x2="${formatNumber(x)}" y2="${formatNumber(axisYPixel + 3)}"${stroke}/>`)
    const label = await renderTex(formatTick(value, stepX), false)
    parts.push(inlineTexFragment(label, x, axisYPixel + (labelBelow ? 5 : -5), {
      color: axes.color, fontSize: TICK_SIZE, anchor: 'middle', valign: labelBelow ? 'top' : 'bottom',
    }))
    ticks += 1
  }
  ticks = 0
  for (let value = Math.ceil(bounds.y0 / stepY) * stepY; value <= bounds.y1 && ticks < MAX_TICKS; value += stepY) {
    if (xAxisAtZero && Math.abs(value) < stepY * 1e-6) continue
    const y = transform.y(value)
    parts.push(`<line x1="${formatNumber(axisXPixel - 3)}" y1="${formatNumber(y)}" x2="${formatNumber(axisXPixel + 3)}" y2="${formatNumber(y)}"${stroke}/>`)
    const label = await renderTex(formatTick(value, stepY), false)
    parts.push(inlineTexFragment(label, axisXPixel + (labelLeft ? -5 : 5), y, {
      color: axes.color, fontSize: TICK_SIZE, anchor: labelLeft ? 'end' : 'start', valign: 'middle',
    }))
    ticks += 1
  }
  return parts.join('')
}

/**
 * Validate, resolve, and render one figure spec.
 * @param spec - the untrusted spec object.
 * @param options - defaults supplied by the plugin config.
 * @returns the SVG text, its size, warnings, and hash inputs.
 * @throws Error naming the offending spec path.
 */
export async function renderFigure(spec: unknown, options: FigureRenderOptions = {}): Promise<FigureRenderResult> {
  const root = asRecord(spec, 'spec')
  assertKeys(root, TOP_LEVEL_KEYS, 'spec')

  const width = Math.round(numberField(root, 'width', 'spec', DEFAULT_WIDTH))
  const height = Math.round(numberField(root, 'height', 'spec', DEFAULT_HEIGHT))
  if (width < 40 || width > 4000) fail('"width"', 'must be between 40 and 4000')
  if (height < 40 || height > 4000) fail('"height"', 'must be between 40 and 4000')
  const padding = Math.round(numberField(root, 'padding', 'spec', options.padding ?? DEFAULT_PADDING))
  if (padding < 0 || padding * 2 >= Math.min(width, height)) fail('"padding"', 'must leave a positive drawing area')

  const background = optionalString(root, 'background', 'spec') ?? options.background ?? 'transparent'
  if (background !== 'transparent' && !isSafeColor(background)) {
    fail('"background"', 'must be "transparent" or a flat CSS color')
  }

  const aspectRaw = optionalString(root, 'aspect', 'spec') ?? 'equal'
  if (aspectRaw !== 'equal' && aspectRaw !== 'stretch') fail('"aspect"', 'must be "equal" or "stretch"')

  const xRange = readRange(root, 'xRange', 'spec')
  const yRange = readRange(root, 'yRange', 'spec')
  const grid = readGrid(root.grid)
  const axes = readAxes(root.axes)
  const title = optionalString(root, 'title', 'spec')

  const elementsRaw = root.elements
  if (!Array.isArray(elementsRaw)) fail('"elements"', 'must be an array')
  if (elementsRaw.length > MAX_ELEMENTS) fail('"elements"', `must contain at most ${MAX_ELEMENTS} elements`)

  const state: ResolveState = {
    vars: resolveVars(root.vars),
    points: new Map(),
    prims: [],
    lines: [],
    warnings: [],
    hasPlot: false,
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
    touched: false,
  }
  for (const [index, element] of elementsRaw.entries()) resolveElement(element, index, state)

  const bounds = computeBounds(state, xRange, yRange, width, height, padding, aspectRaw)
  const axesEnabled = axes.enabled || (root.axes === undefined && state.hasPlot)
  const transform = makeTransform(bounds, width, height, padding, aspectRaw)

  const parts: string[] = []
  if (background !== 'transparent') {
    parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeAttribute(background)}"/>`)
  }
  if (grid.enabled) parts.push(emitGrid(bounds, transform, grid))
  if (axesEnabled) parts.push(await emitAxes(bounds, transform, axes, grid, width, height))

  for (const line of state.lines) {
    const clipped = clipLine(line.a, line.b, bounds, line.mode)
    if (clipped === undefined) continue
    parts.push(emitPolyline({
      kind: 'polyline',
      pts: clipped,
      closed: false,
      color: line.color,
      width: line.width,
      style: line.style,
      arrow: line.arrow,
      fill: null,
      fillOpacity: 0,
    }, transform, width, height))
    if (line.label !== null) {
      const [mx, my] = midpoint(clipped[0], clipped[1])
      const rendered = await renderTex(line.label, false)
      parts.push(inlineTexFragment(rendered, transform.x(mx) + line.labelOffset[0], transform.y(my) + line.labelOffset[1], {
        color: LABEL_COLOR,
        fontSize: line.labelSize,
        anchor: 'middle',
        valign: 'middle',
      }))
    }
  }

  for (const prim of state.prims) {
    parts.push(prim.kind === 'polyline' ? emitPolyline(prim, transform, width, height) : await emitPrim(prim, transform))
  }

  if (title !== undefined) {
    const rendered = await renderTex(title, false)
    parts.push(inlineTexFragment(rendered, width / 2, padding / 2, {
      color: LABEL_COLOR,
      fontSize: TITLE_SIZE,
      anchor: 'middle',
      valign: 'top',
    }))
  }

  const idSeed = (options.idSeed ?? 'figure').replace(/[^A-Za-z0-9_-]/g, '') || 'figure'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`
    + ` viewBox="0 0 ${width} ${height}" role="img" data-figure="${escapeAttribute(idSeed)}">`
    + parts.join('')
    + '</svg>'

  const serialized = JSON.stringify(spec) ?? '{}'
  return {
    svg,
    width,
    height,
    warnings: state.warnings,
    source: serialized.length > 8000 ? `${serialized.slice(0, 8000)}…` : serialized,
    hashParts: [serialized, background, String(padding), String(width), String(height), aspectRaw],
  }
}
