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

/** One image inserted into a generated document. */
export interface MathDocumentImage {
  /** The token that was replaced: `$…$`, `$$…$$`, or `{{figure:name}}`. */
  token: string
  /** What produced it. */
  kind: 'formula' | 'figure'
  /** Alternative text written into the document. */
  alt: string
  /** The variant the document references. */
  variant: 'svg' | 'png'
  /** Workspace-relative SVG path, or null (self-contained documents write no assets). */
  svg_path: string | null
  /** Absolute host SVG path, or null. */
  svg_host_path: string | null
  /** Workspace-relative PNG path, or null. */
  png_path: string | null
  /** Absolute host PNG path, or null. */
  png_host_path: string | null
  /** Display width in CSS px at 1×. */
  width: number
  /** Display height in CSS px at 1×. */
  height: number
  /** Raster pixel width (0 when no raster was produced). */
  pixel_width: number
  /** Raster pixel height (0 when no raster was produced). */
  pixel_height: number
}

/** The canonical result of `math_document`. */
export interface MathDocumentValue {
  kind: 'document'
  /** Document syntax that was written. */
  format: 'markdown' | 'html' | 'latex'
  /** Whether formulas stayed as markup or became images. */
  math: 'native' | 'image'
  /** Whether images were inlined as data URIs instead of referenced. */
  self_contained: boolean
  /** Workspace-relative document path. */
  doc_path: string
  /** Absolute host document path. */
  doc_host_path: string
  /** Document byte length. */
  doc_bytes: number
  /** Workspace-relative asset directory, or null when nothing was written beside the document. */
  assets_dir: string | null
  /** Every image inserted, in document order. */
  images: MathDocumentImage[]
  /** Non-fatal problems: unused figures, degraded variants, skipped samples. */
  warnings: string[]
}

/** The `math_document` output schema, in the Harness's supported subset. */
export const MATH_DOCUMENT_VALUE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'kind', 'format', 'math', 'self_contained',
    'doc_path', 'doc_host_path', 'doc_bytes', 'assets_dir', 'images', 'warnings',
  ],
  properties: {
    kind: { type: 'string', enum: ['document'] },
    format: { type: 'string', enum: ['markdown', 'html', 'latex'] },
    math: { type: 'string', enum: ['native', 'image'] },
    self_contained: { type: 'boolean' },
    doc_path: { type: 'string' },
    doc_host_path: { type: 'string' },
    doc_bytes: { type: 'integer' },
    assets_dir: nullableString,
    images: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'token', 'kind', 'alt', 'variant',
          'svg_path', 'svg_host_path', 'png_path', 'png_host_path',
          'width', 'height', 'pixel_width', 'pixel_height',
        ],
        properties: {
          token: { type: 'string' },
          kind: { type: 'string', enum: ['formula', 'figure'] },
          alt: { type: 'string' },
          variant: { type: 'string', enum: ['svg', 'png'] },
          svg_path: nullableString,
          svg_host_path: nullableString,
          png_path: nullableString,
          png_host_path: nullableString,
          width: { type: 'number' },
          height: { type: 'number' },
          pixel_width: { type: 'number' },
          pixel_height: { type: 'number' },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
}

/**
 * Project one document value into the compact text the model reads.
 * @param value - the tool's canonical result.
 * @returns one text block body: the document, its assets, and every insertion.
 */
export function formatMathDocumentValue(value: MathDocumentValue): string {
  const lines: string[] = [
    `<document format="${value.format}" path="${value.doc_path}" bytes="${value.doc_bytes}"`
    + ` math="${value.math}" self_contained="${value.self_contained}">`,
  ]
  if (value.assets_dir !== null) lines.push(`assets: ${value.assets_dir} (${value.images.length} image${value.images.length === 1 ? '' : 's'})`)
  else lines.push(`assets: none — images are inlined in the document (${value.images.length})`)
  const shown = value.images.slice(0, 30)
  for (const image of shown) {
    const target = image.variant === 'png' ? image.png_path : image.svg_path
    lines.push(`  ${image.token} → ${target ?? '(inlined)'} (${image.width}x${image.height})`)
  }
  if (value.images.length > shown.length) lines.push(`  … and ${value.images.length - shown.length} more`)
  for (const warning of value.warnings) lines.push(`warning: ${warning}`)
  lines.push('</document>')
  return lines.join('\n')
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
