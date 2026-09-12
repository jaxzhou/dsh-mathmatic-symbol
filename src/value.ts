/**
 * The canonical value every tool returns, its JSON Schema in the Harness's
 * enforced output subset, and the model-facing text projection.
 *
 * The canonical value is the programmatic API (PTC mode reads it directly), so
 * it carries paths, byte counts, intrinsic sizes, and embed snippets — never
 * rendered prose. `render()` turns the same value into the compact text the
 * model sees.
 *
 * @module @jaxzhou/dsh-mathmatic-symbol/value
 */

import type { EmbedSnippets } from './embed.ts'

/** One nullable string node in the enforced output-schema subset. */
const nullableString = { oneOf: [{ type: 'string' }, { type: 'null' }] } as const

/** The canonical result of every tool in this plugin. */
export interface MathImageValue {
  /** Which generator produced the artifact. */
  kind: 'formula' | 'figure' | 'image'
  /** LaTeX source, figure spec JSON, or the input descriptor. */
  source: string
  /** Whether the source was typeset in display style. */
  display: boolean
  /** Workspace-relative SVG path, or null. */
  svg_path: string | null
  /** Absolute host SVG path, or null. */
  svg_host_path: string | null
  /** Workspace-relative PNG path, or null. */
  png_path: string | null
  /** Absolute host PNG path, or null. */
  png_host_path: string | null
  /** Reference width in CSS px at 1×. */
  width: number
  /** Reference height in CSS px at 1×. */
  height: number
  /** Raster pixel width (0 when no raster was produced). */
  pixel_width: number
  /** Raster pixel height (0 when no raster was produced). */
  pixel_height: number
  /** Raster zoom factor that was applied. */
  scale: number
  /** SVG byte length (0 when no SVG was produced). */
  svg_bytes: number
  /** PNG byte length (0 when no raster was produced). */
  png_bytes: number
  /** Ready-to-paste document snippets; unavailable formats are empty strings. */
  embed: EmbedSnippets
  /** `data:image/svg+xml;base64,…` when requested and available. */
  data_uri_svg: string | null
  /** `data:image/png;base64,…` when requested and available. */
  data_uri_png: string | null
  /** Whether the PNG was also attached to this result for inline display. */
  previewed: boolean
  /** Non-fatal problems: degraded output, sanitized input, skipped samples. */
  warnings: string[]
}

/** The output schema, restricted to keywords `assertSupportedJsonSchema` accepts. */
export const MATH_IMAGE_VALUE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'kind', 'source', 'display',
    'svg_path', 'svg_host_path', 'png_path', 'png_host_path',
    'width', 'height', 'pixel_width', 'pixel_height', 'scale',
    'svg_bytes', 'png_bytes', 'embed',
    'data_uri_svg', 'data_uri_png', 'previewed', 'warnings',
  ],
  properties: {
    kind: { type: 'string', enum: ['formula', 'figure', 'image'] },
    source: { type: 'string' },
    display: { type: 'boolean' },
    svg_path: nullableString,
    svg_host_path: nullableString,
    png_path: nullableString,
    png_host_path: nullableString,
    width: { type: 'number' },
    height: { type: 'number' },
    pixel_width: { type: 'number' },
    pixel_height: { type: 'number' },
    scale: { type: 'number' },
    svg_bytes: { type: 'integer' },
    png_bytes: { type: 'integer' },
    embed: {
      type: 'object',
      additionalProperties: false,
      required: ['markdown_svg', 'markdown_png', 'html_svg', 'html_png', 'latex_svg', 'latex_png'],
      properties: {
        markdown_svg: { type: 'string' },
        markdown_png: { type: 'string' },
        html_svg: { type: 'string' },
        html_png: { type: 'string' },
        latex_svg: { type: 'string' },
        latex_png: { type: 'string' },
      },
    },
    data_uri_svg: nullableString,
    data_uri_png: nullableString,
    previewed: { type: 'boolean' },
    warnings: { type: 'array', items: { type: 'string' } },
  },
}

function kibibytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`
}

/**
 * Project one canonical value into the compact text the model reads.
 * @param value - the tool's canonical result.
 * @returns one text block body: paths, sizes, embed snippets, and warnings.
 */
export function formatMathImageValue(value: MathImageValue): string {
  const lines: string[] = [
    `<math kind="${value.kind}"${value.kind === 'formula' ? ` display="${value.display}"` : ''}`
    + ` width="${value.width}" height="${value.height}">`,
  ]
  if (value.svg_path !== null) lines.push(`svg: ${value.svg_path} (${kibibytes(value.svg_bytes)}, ${value.width}x${value.height} at 1x)`)
  if (value.png_path !== null) lines.push(`png: ${value.png_path} (${kibibytes(value.png_bytes)}, ${value.pixel_width}x${value.pixel_height})`)
  if (value.svg_path === null && value.png_path === null) lines.push('files: none were written')
  const firstMarkdown = value.embed.markdown_svg !== '' ? value.embed.markdown_svg : value.embed.markdown_png
  if (firstMarkdown !== '') lines.push(`markdown: ${firstMarkdown}`)
  if (value.embed.html_svg !== '') lines.push(`html: ${value.embed.html_svg}`)
  else if (value.embed.html_png !== '') lines.push(`html: ${value.embed.html_png}`)
  if (value.embed.latex_png !== '') lines.push(`latex: ${value.embed.latex_png}`)
  else if (value.embed.latex_svg !== '') lines.push(`latex: ${value.embed.latex_svg}`)
  if (value.previewed) lines.push('preview: attached to this result')
  for (const warning of value.warnings) lines.push(`warning: ${warning}`)
  lines.push('</math>')
  return lines.join('\n')
}
