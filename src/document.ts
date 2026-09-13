/**
 * Document assembly: scan a document body for math and figure references, then
 * write a Markdown, HTML, or LaTeX file whose images are already in place.
 *
 * The body is the author's text. Two tokens are recognized:
 *
 *   - `$…$` and `$$…$$` — inline and display math (with `\$` as a literal
 *     dollar, and the usual "no leading/trailing space" rule for `$…$` so prose
 *     about money is not silently typeset)
 *   - `[[figure:name]]` — the named entry from the call's `figures` object. The
 *     earlier double-brace spelling is still accepted on input, but no
 *     prompt-facing text may contain it: the Harness interpolates `{{name}}` in
 *     system-prompt sections and rejects names outside `[a-z][a-z0-9_]*`.
 *
 * The scanner is pure and format-agnostic; insertion is a separate step, because
 * only then are the file paths (or data URIs) known.
 *
 * @module @jaxzhou/dsh-mathmatic-symbol/document
 */

import { escapeAttribute, escapeText, formatNumber } from './svg.ts'

/** Document formats this plugin can assemble. */
export type DocumentFormat = 'markdown' | 'html' | 'latex'

/** How math is carried into the document. */
export type DocumentMath = 'native' | 'image'

/** One piece of a scanned body. */
export type DocumentSegment =
  | { kind: 'text'; text: string }
  | { kind: 'math'; index: number; tex: string; display: boolean }
  | { kind: 'figure'; index: number; name: string }

/** Where one rendered image lives, and how it must be referenced. */
export interface DocumentPlacement {
  /** Format-appropriate reference: a path relative to the document, or a data URI. */
  reference: string
  width: number
  height: number
  /** Ink below the baseline in CSS px (inline math only). */
  depthPx: number
  /** Alternative text. */
  alt: string
  /** The variant that `reference` points at. */
  variant: 'svg' | 'png'
}

/** File extension per document format. */
export const DOCUMENT_EXTENSION: Readonly<Record<DocumentFormat, string>> = {
  markdown: '.md',
  html: '.html',
  latex: '.tex',
}

/** The image variant each format prefers. */
const PREFERRED_VARIANT: Readonly<Record<DocumentFormat, 'svg' | 'png'>> = {
  markdown: 'svg',
  html: 'svg',
  latex: 'png', // \includegraphics cannot read SVG without extra packages
}

/** Which variant a format may reference at all. */
export function allowedVariants(format: DocumentFormat): readonly ('svg' | 'png')[] {
  return format === 'latex' ? ['png'] : ['svg', 'png']
}

/** The preferred variant for a format, given what the call actually produced. */
export function preferredVariant(format: DocumentFormat, produced: readonly ('svg' | 'png')[]): 'svg' | 'png' {
  const preferred = PREFERRED_VARIANT[format]
  if (produced.includes(preferred)) return preferred
  const fallback = produced[0]
  if (fallback === undefined) throw new Error('no image variant was produced')
  return fallback
}

/**
 * Figure-placeholder forms the scanner accepts, in priority order. The
 * double-brace form is a legacy alias kept so a body written against 0.1.1 still
 * resolves; only the bracket form is advertised, because `{{…}}` is reserved for
 * system-prompt variable interpolation.
 */
const FIGURE_TOKEN_FORMS: readonly { open: string; close: string }[] = [
  { open: '[[figure:', close: ']]' },
  { open: '{{figure:', close: '}}' },
]

/** Read one figure placeholder at `cursor`, or `undefined` when none starts there. */
function readFigureToken(body: string, cursor: number): { name: string; next: number } | undefined {
  const character = body[cursor]
  if (character !== '[' && character !== '{') return undefined
  for (const form of FIGURE_TOKEN_FORMS) {
    if (!body.startsWith(form.open, cursor)) continue
    const close = body.indexOf(form.close, cursor + form.open.length)
    if (close < 0) continue
    const name = body.slice(cursor + form.open.length, close).trim()
    if (!/^[A-Za-z0-9_-]+$/.test(name)) continue
    return { name, next: close + form.close.length }
  }
  return undefined
}

/**
 * Split a document body into text, math, and figure-reference segments.
 *
 * `\$` is preserved verbatim so each output format can interpret the escape in
 * its own way; an unterminated `$` stays literal text.
 *
 * @param body - the author's body text.
 * @returns the ordered segments.
 */
export function scanDocument(body: string): DocumentSegment[] {
  const segments: DocumentSegment[] = []
  let text = ''
  let cursor = 0
  let counter = 0

  const flushText = (): void => {
    if (text.length > 0) {
      segments.push({ kind: 'text', text })
      text = ''
    }
  }

  while (cursor < body.length) {
    const character = body[cursor] as string

    if (character === '\\' && body[cursor + 1] === '$') {
      text += '\\$'
      cursor += 2
      continue
    }

    const figureToken = readFigureToken(body, cursor)
    if (figureToken !== undefined) {
      flushText()
      segments.push({ kind: 'figure', index: counter, name: figureToken.name })
      counter += 1
      cursor = figureToken.next
      continue
    }

    if (character === '$') {
      const display = body[cursor + 1] === '$'
      const open = display ? 2 : 1
      let scan = cursor + open
      let close = -1
      while (scan < body.length) {
        const candidate = body[scan] as string
        if (candidate === '\\') {
          scan += 2
          continue
        }
        if (candidate === '$' && (!display || body[scan + 1] === '$')) {
          const content = body.slice(cursor + open, scan)
          const usable = display || (content.length > 0 && !/^\s/.test(content) && !/\s$/.test(content))
          if (usable) {
            close = scan
            break
          }
        }
        if (!display && candidate === '\n') break // inline math never spans lines
        scan += 1
      }
      if (close >= 0) {
        const tex = body.slice(cursor + open, close).trim()
        if (tex.length > 0) {
          flushText()
          segments.push({ kind: 'math', index: counter, tex, display })
          counter += 1
          cursor = close + open
          continue
        }
      }
    }

    text += character
    cursor += 1
  }

  flushText()
  return segments
}

/** Everything {@link assembleDocument} needs beyond the segments. */
export interface AssembleDocumentInput {
  format: DocumentFormat
  segments: readonly DocumentSegment[]
  math: DocumentMath
  /** Placements by segment index (math and figure segments alike). */
  placements: ReadonlyMap<number, DocumentPlacement>
  /** Document title: HTML `<title>`, a Markdown H1 when absent, a LaTeX `\section*`. */
  title?: string
  /** Include the MathJax CDN bootstrap for HTML with native math. */
  mathjax?: boolean
}

/** MathJax v3 bootstrap so `$…$` and `$$…$$` typeset in a plain HTML document. */
const MATHJAX_BOOTSTRAP = `<script>
  window.MathJax = {
    tex: { inlineMath: [['$', '$'], ['\\\\(', '\\\\)']], displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']] },
  };
</script>
<script async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
`

function hasMath(segments: readonly DocumentSegment[]): boolean {
  return segments.some(segment => segment.kind === 'math')
}

function centimeters(width: number): string {
  return `${((width / 96) * 2.54).toFixed(2)}cm`
}

function points(pixels: number): string {
  return `${(pixels * 0.75).toFixed(2)}pt`
}

/** Inline reference for one placement. */
function inlineReference(format: DocumentFormat, placement: DocumentPlacement): string {
  if (format === 'html') {
    // Baseline-align the image the way the fragment would sit in a text line.
    const shift = placement.depthPx > 0.5 ? ` style="vertical-align:${formatNumber(-placement.depthPx)}px"` : ''
    return `<img src="${escapeAttribute(placement.reference)}" width="${Math.round(placement.width)}"`
      + ` height="${Math.round(placement.height)}" alt="${escapeAttribute(placement.alt)}"${shift}>`
  }
  if (format === 'markdown') return `![${placement.alt.replace(/[[\]\n\r]/g, ' ')}](${placement.reference})`
  // LaTeX: raise the box by its depth so the ink sits on the baseline.
  const raise = placement.depthPx > 0.5 ? `\\raisebox{${points(-placement.depthPx)}}` : ''
  return `${raise}{\\includegraphics[width=${centimeters(placement.width)}]{${placement.reference}}}`
}

/** Block (display) reference for one placement. */
function displayReference(format: DocumentFormat, placement: DocumentPlacement): string {
  if (format === 'html') {
    return `<p style="text-align:center"><img src="${escapeAttribute(placement.reference)}"`
      + ` width="${Math.round(placement.width)}" height="${Math.round(placement.height)}"`
      + ` alt="${escapeAttribute(placement.alt)}"></p>`
  }
  if (format === 'markdown') return `![${placement.alt.replace(/[[\]\n\r]/g, ' ')}](${placement.reference})`
  return `\\begin{center}\n\\includegraphics[width=${centimeters(placement.width)}]{${placement.reference}}\n\\end{center}`
}

/** Escape text that must not be read as markup in the target format. */
function renderText(format: DocumentFormat, text: string): string {
  // Markdown and LaTeX accept `\$` as a literal dollar; HTML has no escape.
  return format === 'html' ? text.replaceAll('\\$', '$') : text
}

/**
 * Assemble the document text from scanned segments and resolved placements.
 * @param input - segments, placements, and format options.
 * @returns the complete document text and any assembly warnings.
 * @throws Error when a math or figure segment has no placement.
 */
export function assembleDocument(input: AssembleDocumentInput): { text: string; warnings: string[] } {
  const warnings: string[] = []
  const pieces: string[] = []
  let titleUsed = false

  for (const segment of input.segments) {
    if (segment.kind === 'text') {
      pieces.push(renderText(input.format, segment.text))
      continue
    }
    // Native math is markup, not an image: no placement is needed for it.
    if (segment.kind === 'math' && input.math === 'native') {
      pieces.push(segment.display ? `$$${segment.tex}$$` : `$${segment.tex}$`)
      continue
    }
    const placement = input.placements.get(segment.index)
    if (placement === undefined) {
      throw new Error(`document assembly: no image was produced for segment ${segment.index}`)
    }
    if (segment.kind === 'math') {
      if (segment.display) pieces.push(displayReference(input.format, placement))
      else pieces.push(inlineReference(input.format, placement))
      continue
    }
    pieces.push(displayReference(input.format, placement))
  }

  const leading: string[] = []
  if (input.title !== undefined && input.title.length > 0) {
    if (input.format === 'markdown') {
      const bodyStarts = input.segments.find(segment => segment.kind === 'text')
      const startsWithHeading = bodyStarts?.kind === 'text' && /^\s*#/.test(bodyStarts.text)
      if (!startsWithHeading) {
        leading.push(`# ${input.title}\n\n`)
        titleUsed = true
      }
    } else if (input.format === 'latex') {
      leading.push(`\\section*{${input.title}}\n`)
      titleUsed = true
    }
  }
  void titleUsed

  const content = [...leading, ...pieces].join('')
  if (input.format === 'markdown') {
    return { text: `${content.trimEnd()}\n`, warnings }
  }
  if (input.format === 'html') {
    const needsMathJax = input.math === 'native' && hasMath(input.segments) && (input.mathjax ?? true)
    const title = input.title ?? 'Document'
    return {
      text: '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        + `<title>${escapeText(title)}</title>\n`
        + (needsMathJax ? MATHJAX_BOOTSTRAP : '')
        + `</head>\n<body>\n${content.trim()}\n</body>\n</html>\n`,
      warnings,
    }
  }
  return {
    text: '\\documentclass[11pt]{article}\n'
      + '\\usepackage{graphicx}\n'
      + '\\usepackage{amsmath,amssymb}\n'
      + '\\begin{document}\n'
      + `${content.trim()}\n`
      + '\\end{document}\n',
    warnings,
  }
}
