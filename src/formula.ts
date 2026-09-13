/**
 * Formula rendering shared by the `math_formula`, `math_convert`, and
 * `math_document` tools: delimiter cleanup plus one standalone SVG (and its
 * baseline depth, which inline document images need).
 *
 * @module @jaxzhou/dsh-mathmatic-symbol/formula
 */

import { renderTex, standaloneTexSvg } from './latex.ts'

/** MathJax's internal units per em, mirrored for the depth conversion. */
const UNITS_PER_EM = 1000

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

/** Options for {@link renderFormulaSvg}. */
export interface FormulaSvgOptions {
  /** Display style or inline style. */
  display: boolean
  /** Pixels per em. */
  fontSize: number
  /** Ink color. */
  color: string
  /** Transparent margin in pixels. */
  padding: number
  /** `transparent` or a flat background color. */
  background: string
}

/** One rendered formula image. */
export interface FormulaSvg {
  svg: string
  width: number
  height: number
  /** Ink below the baseline in CSS px — used to align inline document images. */
  depthPx: number
  warnings: string[]
}

/**
 * Render one formula into a standalone SVG with its warnings.
 * @param latex - bare TeX math source (delimiters already stripped).
 * @param options - style and canvas options.
 * @returns the SVG text, its intrinsic size, baseline depth, and warnings.
 */
export async function renderFormulaSvg(latex: string, options: FormulaSvgOptions): Promise<FormulaSvg> {
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
  return { svg, width, height, depthPx: (rendered.depth / UNITS_PER_EM) * options.fontSize, warnings }
}
