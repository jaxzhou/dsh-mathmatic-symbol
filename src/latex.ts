/**
 * LaTeX → SVG through MathJax v3, configured for self-contained output.
 *
 * Two choices make the result usable as a plain image file:
 *
 *   - `fontCache: 'none'` inlines every glyph as a `<path>`, so the SVG has no
 *     `<use>`/`<defs>` and no external font dependency. It also means many
 *     fragments can be composed into one figure without id collisions.
 *   - The document is rendered at `em = 1000`, which makes MathJax's internal
 *     units equal to pixels, so a fragment can be re-scaled by a single
 *     `scale(fontSize / 1000)`.
 *
 * The `html` TeX extension (which enables `\class`, `\style`, `\cssId`,
 * `\href`) is excluded, as are the autoload/require extensions that would let
 * a formula pull in more packages; the SVG is additionally sanitized at the
 * file boundary.
 *
 * @module @jaxzhou/dsh-mathmatic-symbol/latex
 */

import { colorize, escapeAttribute, formatNumber } from './svg.ts'

/** MathJax internal units per em. */
const UNITS_PER_EM = 1000

/** MathJax's default x-height ratio; only affects the reported `ex` width. */
const EX_PER_EM = 442

/** Effectively disables MathJax's automatic line breaking. */
const CONTAINER_WIDTH = 10_000_000

/** TeX extensions refused even though `AllPackages` ships them. */
const EXCLUDED_PACKAGES: ReadonlySet<string> = new Set([
  'html', // \class \style \cssId \href — markup injection into the SVG
  'require', // pulls arbitrary further packages at parse time
  'autoload', // lazy package loading; unnecessary when all are loaded
  'action', // \toggle-style interactive markup
  'annotation', // MathML annotation payloads
  'semantics', // MathML annotation wrappers
  'noerrors', // would hide TeX errors instead of rendering them
])

/** One rendered fragment: geometry in MathJax units (== px at `em = 1000`). */
export interface RenderedTex {
  /** Inner `<g>` markup, already including MathJax's own `scale(1, -1)`. */
  inner: string
  /** Ink width in units. */
  width: number
  /** Ink height in units. */
  height: number
  /** Ink above the baseline in units. */
  above: number
  /** Ink below the baseline in units. */
  depth: number
  /** Whether MathJax flagged a parse/render error inside the fragment. */
  errored: boolean
}

interface MathRuntime {
  convert(tex: string, display: boolean): string
}

let runtimePromise: Promise<MathRuntime> | undefined
const fragmentCache = new Map<string, RenderedTex>()

async function createRuntime(): Promise<MathRuntime> {
  const [mathjaxModule, texModule, svgModule, adaptorModule, handlerModule, packagesModule] = await Promise.all([
    import('mathjax-full/js/mathjax.js'),
    import('mathjax-full/js/input/tex.js'),
    import('mathjax-full/js/output/svg.js'),
    import('mathjax-full/js/adaptors/liteAdaptor.js'),
    import('mathjax-full/js/handlers/html.js'),
    import('mathjax-full/js/input/tex/AllPackages.js'),
  ])
  const adaptor = adaptorModule.liteAdaptor()
  handlerModule.RegisterHTMLHandler(adaptor)
  const packages = (packagesModule.AllPackages as readonly string[])
    .filter(name => !EXCLUDED_PACKAGES.has(name))
  const tex = new texModule.TeX({ packages: [...packages] })
  const svg = new svgModule.SVG({ fontCache: 'none' })
  const document = mathjaxModule.mathjax.document('', { InputJax: tex, OutputJax: svg })
  return {
    convert(source: string, display: boolean): string {
      const node = document.convert(source, {
        display,
        em: UNITS_PER_EM,
        ex: EX_PER_EM,
        containerWidth: CONTAINER_WIDTH,
      })
      return adaptor.outerHTML(node)
    },
  }
}

async function getRuntime(): Promise<MathRuntime> {
  runtimePromise ??= createRuntime().catch((error: unknown) => {
    runtimePromise = undefined
    throw new Error(`MathJax could not be loaded: ${error instanceof Error ? error.message : String(error)}`)
  })
  return runtimePromise
}

function parseViewBox(markup: string, tex: string): { minY: number; width: number; height: number } {
  const match = /\sviewBox="([^"]+)"/.exec(markup)
  const numbers = match?.[1]?.trim().split(/[\s,]+/).map(Number)
  if (numbers === undefined || numbers.length !== 4 || numbers.some(value => !Number.isFinite(value))) {
    throw new Error(`MathJax produced an SVG without a usable viewBox for "${tex}"`)
  }
  return { minY: numbers[1] as number, width: numbers[2] as number, height: numbers[3] as number }
}

/**
 * Typeset one TeX math expression into a font-free SVG fragment.
 * @param tex - TeX math source (no `$` delimiters).
 * @param display - `true` for display style, `false` for inline style.
 * @returns the fragment and its ink geometry, in units of 1/1000 em.
 */
export async function renderTex(tex: string, display: boolean): Promise<RenderedTex> {
  const source = tex.trim()
  if (source.length === 0) throw new Error('the LaTeX source is empty')
  const key = `${display ? 'D' : 'I'}\u0000${source}`
  const cached = fragmentCache.get(key)
  if (cached !== undefined) return cached

  const runtime = await getRuntime()
  let html: string
  try {
    html = runtime.convert(source, display)
  } catch (error: unknown) {
    throw new Error(`the LaTeX did not parse: ${error instanceof Error ? error.message : String(error)}`)
  }
  const outer = /<svg[\s\S]*?<\/svg>/.exec(html)?.[0]
  if (outer === undefined) throw new Error('MathJax produced no SVG for the given LaTeX')
  const viewBox = parseViewBox(outer, source)
  const inner = outer.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')

  const rendered: RenderedTex = {
    inner,
    width: viewBox.width,
    height: viewBox.height,
    above: Math.max(0, -viewBox.minY),
    depth: Math.max(0, viewBox.minY + viewBox.height),
    errored: inner.includes('data-mml-node="merror"'),
  }
  if (fragmentCache.size > 512) fragmentCache.clear()
  fragmentCache.set(key, rendered)
  return rendered
}

/** Drop the fragment cache (used by the plugin's disposal effect). */
export function clearTexCache(): void {
  fragmentCache.clear()
}

/** Options shared by the standalone and inline SVG emitters. */
export interface TexSvgOptions {
  /** Concrete paint color; the fragment's `currentColor` is replaced by it. */
  color: string
  /** Fragment font size in pixels (one em). */
  fontSize: number
}

/**
 * Emit a complete, standalone SVG document for one fragment — the file form
 * used for `format: "svg"` output and for embedding into documents.
 * @param rendered - the fragment to place.
 * @param options - paint color, font size, padding, and optional background.
 * @returns the SVG text and its intrinsic pixel size.
 */
export function standaloneTexSvg(
  rendered: RenderedTex,
  options: TexSvgOptions & { padding: number; background?: string },
): { svg: string; width: number; height: number } {
  const scale = options.fontSize / UNITS_PER_EM
  const padding = options.padding
  const width = Math.max(1, Math.ceil(rendered.width * scale + padding * 2))
  const height = Math.max(1, Math.ceil(rendered.height * scale + padding * 2))
  const background = options.background !== undefined && options.background !== 'transparent'
    ? `<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeAttribute(options.background)}"/>`
    : ''
  const body = colorize(rendered.inner, options.color)
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`
      + ` viewBox="0 0 ${width} ${height}" role="img">`
      + background
      + `<g transform="translate(${formatNumber(padding)} ${formatNumber(padding + rendered.above * scale)})`
      + ` scale(${formatNumber(scale, 6)})">${body}</g>`
      + '</svg>',
    width,
    height,
  }
}

/** How a text fragment is aligned against its anchor point. */
export interface TexAnchor {
  /** Horizontal anchor. */
  anchor?: 'start' | 'middle' | 'end'
  /** Vertical anchor. */
  valign?: 'baseline' | 'middle' | 'top' | 'bottom'
  /** Rotation in degrees, clockwise, about the anchor point. */
  rotate?: number
}

/**
 * Emit one `<g>` that places a fragment at a point in the parent SVG's user
 * space — the composition primitive the figure builder uses for every label,
 * tick, and title.
 * @param rendered - the fragment to place.
 * @param x - anchor x in parent units.
 * @param y - anchor y in parent units.
 * @param options - paint color, font size, alignment, and rotation.
 * @returns the `<g>` element markup.
 */
export function inlineTexFragment(
  rendered: RenderedTex,
  x: number,
  y: number,
  options: TexSvgOptions & TexAnchor,
): string {
  const scale = options.fontSize / UNITS_PER_EM
  const width = rendered.width * scale
  const above = rendered.above * scale
  const depth = rendered.depth * scale

  let translateX = x
  if (options.anchor === 'middle') translateX = x - width / 2
  else if (options.anchor === 'end') translateX = x - width

  let translateY = y
  if (options.valign === 'middle') translateY = y - (depth - above) / 2
  else if (options.valign === 'top') translateY = y + above
  else if (options.valign === 'bottom') translateY = y - depth

  const rotate = options.rotate !== undefined && options.rotate !== 0
    ? ` rotate(${formatNumber(options.rotate)})`
    : ''
  return `<g transform="translate(${formatNumber(translateX)} ${formatNumber(translateY)})${rotate}`
    + ` scale(${formatNumber(scale, 6)})">${colorize(rendered.inner, options.color)}</g>`
}
