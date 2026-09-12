/**
 * `math_formula` — LaTeX math → image files.
 *
 * @module @jaxzhou/dsh-mathmatic-symbol/tools/formula
 */

import type { ResolvedMathConfig } from '../config.ts'
import type { PluginContext, ToolDefinition, ToolRunContext } from '../dsh.ts'
import { renderTex, standaloneTexSvg } from '../latex.ts'
import { isSafeColor } from '../svg.ts'
import {
  assertKnownKeys,
  COMMON_PARAMETERS,
  createTool,
  parseCommonArgs,
  publishSvg,
  resolveWorkspaceRoot,
} from './shared.ts'

const TOOL = 'math_formula'

const OWN_KEYS = ['latex', 'display', 'font_size', 'color'] as const
const ALL_KEYS: readonly string[] = [...OWN_KEYS, ...Object.keys(COMMON_PARAMETERS)]

/**
 * Remove one layer of common math delimiters or a wrapping display environment
 * so a model that answers with `$$…$$` or `\begin{equation}…\end{equation}`
 * still renders.
 * @param input - the raw formula text.
 * @returns the bare TeX math source.
 */
export function stripMathDelimiters(input: string): string {
  let source = input.trim()
  const wrapped: readonly (readonly [string, string])[] = [
    ['$$', '$$'],
    ['\\[', '\\]'],
    ['\\(', '\\)'],
    ['$', '$'],
  ]
  for (const [open, close] of wrapped) {
    if (source.startsWith(open) && source.endsWith(close) && source.length > open.length + close.length) {
      source = source.slice(open.length, source.length - close.length).trim()
      break
    }
  }
  const environment = /^\\begin\{([a-zA-Z*]+)\}([\s\S]*)\\end\{\1\}$/.exec(source)
  const displayEnvironments = ['equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'displaymath', 'math']
  if (environment !== null && displayEnvironments.includes(environment[1] as string)) {
    source = (environment[2] as string).trim()
  }
  return source
}

/**
 * Render one formula into a standalone SVG with its warnings.
 * @param latex - bare TeX math source (delimiters already stripped).
 * @param options - style and canvas options.
 * @returns the SVG text, its intrinsic size, and non-fatal warnings.
 */
export async function renderFormulaSvg(
  latex: string,
  options: { display: boolean; fontSize: number; color: string; padding: number; background: string },
): Promise<{ svg: string; width: number; height: number; warnings: string[] }> {
  const rendered = await renderTex(latex, options.display)
  const warnings: string[] = []
  if (rendered.errored) {
    warnings.push('MathJax reported a typesetting error; the image contains an error marker — check the LaTeX source')
  }
  const { svg, width, height } = standaloneTexSvg(rendered, {
    color: options.color,
    fontSize: options.fontSize,
    padding: options.padding,
    background: options.background,
  })
  return { svg, width, height, warnings }
}

/**
 * Build the `math_formula` tool.
 * @param ctx - the plugin context (used for optional preview admission).
 * @param config - the resolved plugin configuration.
 * @returns the registry-ready tool definition.
 */
export function createFormulaTool(ctx: PluginContext, config: ResolvedMathConfig): ToolDefinition {
  return createTool({
    name: TOOL,
    description:
      'Typeset a LaTeX math formula into a self-contained SVG image plus a PNG raster, write both into the session '
      + 'workspace, and return paths and ready-to-paste document snippets. Every glyph is embedded as a vector path, so '
      + 'the SVG needs no fonts and renders identically in browsers, Word, and LaTeX pipelines. Pass bare TeX math; '
      + 'surrounding $, $$, \\[ \\], \\( \\), or a display environment are tolerated and stripped. Use this whenever a '
      + 'formula must appear as an image in a document, slide, or web page.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['latex'],
      properties: {
        latex: {
          type: 'string',
          description: 'The TeX math source, e.g. "\\\\int_0^\\\\infty e^{-x^2}\\\\,dx = \\\\frac{\\\\sqrt{\\\\pi}}{2}". Do not include $ or \\\\begin{equation}.',
        },
        display: {
          type: 'boolean',
          default: true,
          description: 'true (default) typesets display style (operators get limits, fractions stay large); false uses inline style.',
        },
        font_size: {
          type: 'number',
          default: 16,
          description: 'Fragment size in pixels for one em (default 16, from plugin config).',
        },
        color: {
          type: 'string',
          default: '#000000',
          description: 'Ink color as a flat CSS color (default "#000000"): "#1f2937", "navy", "rgb(17,24,39)".',
        },
        ...COMMON_PARAMETERS,
      },
    },
    async execute(raw: Record<string, unknown>, exec: ToolRunContext) {
      assertKnownKeys(raw, ALL_KEYS, TOOL)
      const latexRaw = raw.latex
      if (typeof latexRaw !== 'string' || latexRaw.trim().length === 0) {
        throw new Error(`${TOOL}: "latex" must be a non-empty string`)
      }
      if (latexRaw.length > 20_000) throw new Error(`${TOOL}: "latex" is longer than 20000 characters`)
      const latex = stripMathDelimiters(latexRaw)
      if (latex.length === 0) throw new Error(`${TOOL}: "latex" is empty after removing math delimiters`)

      const displayRaw = raw.display
      if (displayRaw !== undefined && typeof displayRaw !== 'boolean') {
        throw new Error(`${TOOL}: "display" must be a boolean`)
      }
      const display = displayRaw ?? true

      const fontSizeRaw = raw.font_size
      if (fontSizeRaw !== undefined && (typeof fontSizeRaw !== 'number' || !Number.isFinite(fontSizeRaw))) {
        throw new Error(`${TOOL}: "font_size" must be a finite number`)
      }
      const fontSize = fontSizeRaw ?? config.fontSize
      if (fontSize < 6 || fontSize > 96) throw new Error(`${TOOL}: "font_size" must be between 6 and 96`)

      const colorRaw = raw.color
      if (colorRaw !== undefined && (typeof colorRaw !== 'string' || !isSafeColor(colorRaw))) {
        throw new Error(`${TOOL}: "color" must be a flat CSS color such as "#111827"`)
      }
      const color = colorRaw ?? config.color

      const args = parseCommonArgs(raw, config, TOOL)
      const root = resolveWorkspaceRoot(config, exec)
      const formula = await renderFormulaSvg(latex, {
        display,
        fontSize,
        color,
        padding: args.padding,
        background: args.background,
      })
      return publishSvg({
        kind: 'formula',
        source: latex,
        display,
        altText: latex.length > 80 ? `${latex.slice(0, 77)}…` : latex,
        prefix: 'formula',
        hashParts: [latex, String(display), String(fontSize), color, args.background, String(args.padding)],
        svgText: formula.svg,
        svgWidth: formula.width,
        svgHeight: formula.height,
        warnings: formula.warnings,
        config,
        args,
        root,
        ctx,
        exec,
      })
    },
  })
}
