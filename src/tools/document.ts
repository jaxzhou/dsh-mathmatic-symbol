/**
 * `math_document` — assemble a Markdown, HTML, or LaTeX document with the
 * generated formulas and figures already inserted.
 *
 * This is the tool that removes the last hand-written step: instead of asking
 * the model to render images, invent paths, and splice them into a document, the
 * body is written with `$…$` / `$$…$$` / `{{figure:name}}` tokens and the tool
 * renders, names, writes, and references every image — correctly relative to
 * the document, in the syntax of the chosen format, optionally inlined as data
 * URIs so the file stands alone.
 *
 * @module @jaxzhou/dsh-mathmatic-symbol/tools/document
 */

import path from 'node:path'
import type { ResolvedMathConfig } from '../config.ts'
import type { PluginContext, ToolDefinition, ToolRunContext } from '../dsh.ts'
import {
  allowedVariants,
  assembleDocument,
  DOCUMENT_EXTENSION,
  preferredVariant,
  scanDocument,
  type DocumentFormat,
  type DocumentMath,
  type DocumentPlacement,
} from '../document.ts'
import { renderFormulaSvg, stripMathDelimiters } from '../formula.ts'
import { renderFigure } from '../figure.ts'
import { contentHash, resolveInsideWorkspace, safeBaseName, toRelative, writeOutput, type OutputTarget } from '../output.ts'
import { RasterUnavailableError, rasterizePng } from '../raster.ts'
import { isSafeColor } from '../svg.ts'
import {
  assertKnownKeys,
  createTool,
  resolveWorkspaceRoot,
} from './shared.ts'
import { formatMathDocumentValue, MATH_DOCUMENT_VALUE_SCHEMA, type MathDocumentImage, type MathDocumentValue } from '../value.ts'

const TOOL = 'math_document'

const PARAMETER_KEYS = [
  'path', 'format', 'body', 'title', 'math', 'image_format', 'figures',
  'assets_dir', 'self_contained', 'scale', 'background', 'color', 'font_size', 'mathjax',
] as const

type ImageFormat = 'svg' | 'png' | 'both'

/** One rendered image, before it is named or written. */
interface RenderedAsset {
  /** Base name without extension. */
  baseName: string
  /** Token / alt bookkeeping for the value. */
  alt: string
  svgText?: string
  svgWidth?: number
  svgHeight?: number
  pngBytes?: Uint8Array
  pngWidth?: number
  pngHeight?: number
  depthPx: number
  warnings: string[]
}

/** Paths written for one asset. */
interface WrittenAsset {
  svgPath?: string
  svgHostPath?: string
  pngPath?: string
  pngHostPath?: string
  svgWidth?: number
  svgHeight?: number
  pngWidth?: number
  pngHeight?: number
}

function readString(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`${TOOL}: "${key}" must be a string`)
  return value
}

function readBoolean(raw: Record<string, unknown>, key: string): boolean | undefined {
  const value = raw[key]
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`${TOOL}: "${key}" must be a boolean`)
  return value
}

function readNumber(raw: Record<string, unknown>, key: string, min: number, max: number): number | undefined {
  const value = raw[key]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${TOOL}: "${key}" must be a finite number`)
  if (value < min || value > max) throw new Error(`${TOOL}: "${key}" must be between ${min} and ${max}`)
  return value
}

function readEnum<T extends string>(
  raw: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = readString(raw, key)
  if (value === undefined) return undefined
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${TOOL}: "${key}" must be one of ${allowed.map(item => `"${item}"`).join(', ')}`)
  }
  return value as T
}

/**
 * Build the `math_document` tool.
 * @param ctx - the plugin context (used for optional preview admission elsewhere).
 * @param config - the resolved plugin configuration.
 * @returns the registry-ready tool definition.
 */
export function createDocumentTool(ctx: PluginContext, config: ResolvedMathConfig): ToolDefinition {
  void ctx
  return createTool<MathDocumentValue>({
    name: TOOL,
    output: { schema: MATH_DOCUMENT_VALUE_SCHEMA, render: formatMathDocumentValue },
    description:
      'Assemble a document (Markdown, HTML, or LaTeX) with mathematical formulas and figures already rendered and '
      + 'inserted. Write the body with $inline$ / $$display$$ math and {{figure:name}} placeholders; pass the figures as a '
      + 'name → math_figure spec map. The tool renders every formula and figure, names and writes the images beside the '
      + 'document, and inserts them in the syntax of the chosen format — relative paths by default, or base64 data URIs '
      + 'with self_contained for a single self-sufficient file. LaTeX output needs PNG images (image_format "png" or '
      + '"both"); HTML output with math "native" includes a MathJax bootstrap. Use this instead of hand-writing image '
      + 'paths or embedding markup yourself.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'body'],
      properties: {
        path: {
          type: 'string',
          description: 'Workspace-relative document path. The format extension is appended when missing (.md/.html/.tex) and must match "format" when present.',
        },
        body: {
          type: 'string',
          description: 'The document body. Markdown, HTML, or LaTeX matching "format". Use $…$ for inline math, $$…$$ for display math, \\$ for a literal dollar, and {{figure:name}} for a figure from "figures".',
        },
        format: {
          type: 'string',
          enum: ['markdown', 'html', 'latex'],
          default: 'markdown',
          description: 'Document syntax and output extension (default "markdown").',
        },
        title: {
          type: 'string',
          description: 'Optional title: the HTML <title>, a prefixed "# " heading for Markdown (when the body has none), or a \\section* for LaTeX.',
        },
        math: {
          type: 'string',
          enum: ['native', 'image'],
          default: 'native',
          description: '"native" (default) leaves formulas as markup for the renderer to typeset; "image" replaces every formula with a rendered image (needed for Word, plain-text pipelines, or when the user asks for formula images).',
        },
        image_format: {
          type: 'string',
          enum: ['svg', 'png', 'both'],
          default: 'both',
          description: 'Image variants to produce. Markdown/HTML reference SVG, LaTeX references PNG. "both" (default) writes both so the assets stay reusable.',
        },
        figures: {
          type: 'object',
          additionalProperties: true,
          description: 'Map of placeholder name → math_figure spec, e.g. {"triangle": {"width":420, …, "elements":[…]}}. Only figures referenced by {{figure:name}} are rendered.',
        },
        assets_dir: {
          type: 'string',
          description: 'Directory for the generated images, workspace-relative. Defaults to "<document name>-assets" beside the document.',
        },
        self_contained: {
          type: 'boolean',
          default: false,
          description: 'Inline every image as a base64 data URI so the document is a single file. Not available for LaTeX output; no asset files are written in this mode.',
        },
        scale: {
          type: 'number',
          default: 4,
          description: 'PNG zoom factor (default from plugin config).',
        },
        background: {
          type: 'string',
          default: 'transparent',
          description: 'Background for the generated images ("transparent" or a flat color).',
        },
        color: {
          type: 'string',
          default: '#000000',
          description: 'Ink color for rendered formulas (default from plugin config).',
        },
        font_size: {
          type: 'number',
          default: 16,
          description: 'Formula font size in pixels (6–96).',
        },
        mathjax: {
          type: 'boolean',
          default: true,
          description: 'For HTML with math "native": include a MathJax CDN bootstrap so $…$ and $$…$$ typeset. Set false to supply your own.',
        },
      },
    },
    async execute(raw: Record<string, unknown>, exec: ToolRunContext) {
      assertKnownKeys(raw, PARAMETER_KEYS, TOOL)

      const requestedPath = readString(raw, 'path')
      if (requestedPath === undefined || requestedPath.trim().length === 0) {
        throw new Error(`${TOOL}: "path" must be a non-empty workspace-relative path`)
      }
      const bodyRaw = raw.body
      if (typeof bodyRaw !== 'string' || bodyRaw.trim().length === 0) {
        throw new Error(`${TOOL}: "body" must be a non-empty string`)
      }
      const format: DocumentFormat = readEnum(raw, 'format', ['markdown', 'html', 'latex'] as const) ?? 'markdown'
      const math: DocumentMath = readEnum(raw, 'math', ['native', 'image'] as const) ?? 'native'
      const imageFormat: ImageFormat = readEnum(raw, 'image_format', ['svg', 'png', 'both'] as const) ?? 'both'
      const selfContained = readBoolean(raw, 'self_contained') ?? false
      const mathjax = readBoolean(raw, 'mathjax') ?? true
      const title = readString(raw, 'title')
      const scale = readNumber(raw, 'scale', 0.25, 16) ?? config.scale
      const fontSize = readNumber(raw, 'font_size', 6, 96) ?? config.fontSize
      const background = readString(raw, 'background') ?? config.background
      const color = readString(raw, 'color') ?? config.color
      if (background !== 'transparent' && !isSafeColor(background)) {
        throw new Error(`${TOOL}: "background" must be "transparent" or a flat CSS color`)
      }
      if (!isSafeColor(color)) throw new Error(`${TOOL}: "color" must be a flat CSS color such as "#111827"`)

      const extension = DOCUMENT_EXTENSION[format]
      const knownExtensions: readonly string[] = ['.md', '.markdown', '.html', '.htm', '.tex', '.latex']
      const lower = requestedPath.toLowerCase()
      const hasKnownExtension = knownExtensions.some(candidate => lower.endsWith(candidate))
      if (hasKnownExtension && !lower.endsWith(extension) && !(format === 'html' && lower.endsWith('.htm'))) {
        throw new Error(`${TOOL}: "path" ends in a different document extension than format "${format}" (${extension})`)
      }
      const documentRelative = hasKnownExtension ? requestedPath : `${requestedPath}${extension}`

      if (format === 'latex' && selfContained) {
        throw new Error(`${TOOL}: self_contained is not available for LaTeX output; \\includegraphics needs a file`)
      }
      const variants: readonly ('svg' | 'png')[] = imageFormat === 'both' ? ['svg', 'png'] : [imageFormat]
      const usable = allowedVariants(format)
      if (!variants.some(variant => usable.includes(variant))) {
        throw new Error(
          `${TOOL}: LaTeX documents embed raster images; use image_format "png" or "both" (got "${imageFormat}")`,
        )
      }

      const figuresRaw = raw.figures
      if (figuresRaw !== undefined && (typeof figuresRaw !== 'object' || figuresRaw === null || Array.isArray(figuresRaw))) {
        throw new Error(`${TOOL}: "figures" must be an object mapping names to figure specs`)
      }
      const figures = (figuresRaw ?? {}) as Record<string, unknown>

      const root = resolveWorkspaceRoot(config, exec)
      const segments = scanDocument(bodyRaw)
      const warnings: string[] = []

      // --- which figures were referenced?
      const referenced = [...new Set(segments.filter(segment => segment.kind === 'figure').map(segment => segment.name))]
      for (const name of referenced) {
        if (!Object.hasOwn(figures, name)) {
          const available = Object.keys(figures)
          throw new Error(
            `${TOOL}: {{figure:${name}}} has no spec in "figures"`
            + (available.length > 0 ? `; provided: ${available.join(', ')}` : '; "figures" is empty'),
          )
        }
      }
      for (const name of Object.keys(figures)) {
        if (!referenced.includes(name)) warnings.push(`figure "${name}" was provided but never referenced by {{figure:${name}}}`)
      }

      // --- render every distinct asset once
      const assets = new Map<number, RenderedAsset>()
      const renderCache = new Map<string, RenderedAsset>()
      const rasterize = async (svg: string): Promise<{ bytes: Uint8Array; width: number; height: number } | undefined> => {
        try {
          const raster = await rasterizePng(svg, { scale, background })
          return { bytes: raster.data, width: raster.width, height: raster.height }
        } catch (error: unknown) {
          const reason = error instanceof RasterUnavailableError
            ? error.message
            : `PNG output failed: ${error instanceof Error ? error.message : String(error)}`
          warnings.push(reason)
          return undefined
        }
      }

      for (const segment of segments) {
        if (segment.kind === 'text') continue
        if (segment.kind === 'math' && math === 'native') continue

        if (segment.kind === 'math') {
          const tex = stripMathDelimiters(segment.tex)
          if (tex.length === 0) throw new Error(`${TOOL}: a math token is empty after removing delimiters`)
          const key = `math\u0000${segment.display}\u0000${tex}`
          let asset = renderCache.get(key)
          if (asset === undefined) {
            const formula = await renderFormulaSvg(tex, {
              display: segment.display,
              fontSize,
              color,
              padding: config.padding,
              background,
            })
            asset = {
              baseName: `formula-${contentHash([tex, String(segment.display), String(fontSize), color, background, String(config.padding)])}`,
              alt: tex,
              svgText: formula.svg,
              svgWidth: formula.width,
              svgHeight: formula.height,
              depthPx: segment.display ? 0 : formula.depthPx,
              warnings: formula.warnings,
            }
            if (variants.includes('png')) {
              const raster = await rasterize(formula.svg)
              if (raster !== undefined) {
                asset.pngBytes = raster.bytes
                asset.pngWidth = raster.width
                asset.pngHeight = raster.height
              }
            }
            renderCache.set(key, asset)
          }
          assets.set(segment.index, asset)
          continue
        }

        const key = `figure\u0000${segment.name}`
        let asset = renderCache.get(key)
        if (asset === undefined) {
          const spec = figures[segment.name]
          const figure = await renderFigure(spec, { background, padding: config.padding })
          const specTitle = typeof spec === 'object' && spec !== null && !Array.isArray(spec)
            ? (spec as Record<string, unknown>).title
            : undefined
          asset = {
            baseName: `${safeBaseName(segment.name, 'figure')}-${contentHash(figure.hashParts)}`,
            alt: typeof specTitle === 'string' && specTitle.length > 0 ? specTitle : segment.name,
            svgText: figure.svg,
            svgWidth: figure.width,
            svgHeight: figure.height,
            depthPx: 0,
            warnings: figure.warnings,
          }
          if (variants.includes('png')) {
            const raster = await rasterize(figure.svg)
            if (raster !== undefined) {
              asset.pngBytes = raster.bytes
              asset.pngWidth = raster.width
              asset.pngHeight = raster.height
            }
          }
          renderCache.set(key, asset)
        }
        assets.set(segment.index, asset)
      }

      // --- resolve output locations
      const documentHostPath = await resolveInsideWorkspace(root, documentRelative)
      const documentTarget: OutputTarget = {
        hostPath: documentHostPath,
        relativePath: toRelative(root, documentHostPath),
        root,
      }
      const documentDirectory = path.posix.dirname(documentTarget.relativePath)
      const documentBase = path.posix.basename(documentTarget.relativePath, extension)
      const assetsRelative = readString(raw, 'assets_dir') ?? path.posix.join(documentDirectory === '.' ? '' : documentDirectory, `${documentBase}-assets`)

      let assetsDirectory: string | null = null
      let assetsHostPath: string | null = null
      if (!selfContained && assets.size > 0) {
        assetsHostPath = await resolveInsideWorkspace(root, assetsRelative)
        assetsDirectory = toRelative(root, assetsHostPath)
      }

      // --- write the assets
      const written = new Map<number, WrittenAsset>()
      for (const [index, asset] of assets) {
        const writes: WrittenAsset = {}
        if (assetsHostPath !== null) {
          if (asset.svgText !== undefined && variants.includes('svg')) {
            const target: OutputTarget = {
              hostPath: path.join(assetsHostPath, `${asset.baseName}.svg`),
              relativePath: path.posix.join(assetsDirectory as string, `${asset.baseName}.svg`),
              root,
            }
            await writeOutput(target, asset.svgText)
            writes.svgPath = target.relativePath
            writes.svgHostPath = target.hostPath
            writes.svgWidth = asset.svgWidth
            writes.svgHeight = asset.svgHeight
          }
          if (asset.pngBytes !== undefined && variants.includes('png')) {
            const target: OutputTarget = {
              hostPath: path.join(assetsHostPath, `${asset.baseName}.png`),
              relativePath: path.posix.join(assetsDirectory as string, `${asset.baseName}.png`),
              root,
            }
            await writeOutput(target, asset.pngBytes)
            writes.pngPath = target.relativePath
            writes.pngHostPath = target.hostPath
            writes.pngWidth = asset.pngWidth
            writes.pngHeight = asset.pngHeight
          }
        }
        written.set(index, writes)
      }

      // --- place every image in the document
      const placements = new Map<number, DocumentPlacement>()
      const images: MathDocumentImage[] = []
      for (const segment of segments) {
        if (segment.kind === 'text') continue
        if (segment.kind === 'math' && math === 'native') continue
        const asset = assets.get(segment.index)
        const writes = written.get(segment.index)
        if (asset === undefined || writes === undefined) throw new Error(`${TOOL}: internal error — missing asset for segment ${segment.index}`)

        // What the renderer produced (not what was written): a self-contained
        // document inlines the bytes without writing asset files.
        const produced: ('svg' | 'png')[] = []
        if (asset.svgText !== undefined) produced.push('svg')
        if (asset.pngBytes !== undefined) produced.push('png')
        const label = segment.kind === 'math' ? 'a formula' : `figure "${segment.name}"`
        if (produced.length === 0) throw new Error(`${TOOL}: no image variant could be produced for ${label}`)
        if (format === 'latex' && asset.pngBytes === undefined) {
          throw new Error(`${TOOL}: LaTeX output needs a PNG for ${label}, but rasterization failed — see the warnings`)
        }
        const variant = preferredVariant(format, produced)
        const displayWidth = asset.svgWidth ?? (asset.pngWidth !== undefined ? asset.pngWidth / scale : 0)
        const displayHeight = asset.svgHeight ?? (asset.pngHeight !== undefined ? asset.pngHeight / scale : 0)

        let reference: string
        if (selfContained) {
          const bytes = variant === 'svg' ? asset.svgText : asset.pngBytes
          if (bytes === undefined) throw new Error(`${TOOL}: no ${variant} data was rendered for self_contained output`)
          const base64 = Buffer.from(bytes as string | Uint8Array).toString('base64')
          reference = variant === 'svg' ? `data:image/svg+xml;base64,${base64}` : `data:image/png;base64,${base64}`
        } else {
          const relative = variant === 'svg' ? writes.svgPath : writes.pngPath
          if (relative === undefined) throw new Error(`${TOOL}: the ${variant} variant was not written`)
          // Reference relative to the document, not to the workspace root.
          const fromDirectory = path.posix.dirname(documentTarget.relativePath)
          reference = path.posix.relative(fromDirectory === '.' ? '' : fromDirectory, relative)
        }

        placements.set(segment.index, {
          reference,
          width: Math.round(displayWidth),
          height: Math.round(displayHeight),
          depthPx: asset.depthPx,
          alt: asset.alt,
          variant,
        })
        if (asset.warnings.length > 0) warnings.push(...asset.warnings)
        images.push({
          token: segment.kind === 'math' ? (segment.display ? `$$${segment.tex}$$` : `$${segment.tex}$`) : `{{figure:${segment.name}}}`,
          kind: segment.kind === 'math' ? 'formula' : 'figure',
          alt: asset.alt,
          variant,
          svg_path: writes.svgPath ?? null,
          svg_host_path: writes.svgHostPath ?? null,
          png_path: writes.pngPath ?? null,
          png_host_path: writes.pngHostPath ?? null,
          width: Math.round(displayWidth),
          height: Math.round(displayHeight),
          pixel_width: writes.pngWidth ?? 0,
          pixel_height: writes.pngHeight ?? 0,
        })
      }

      // --- assemble and write the document
      const assembled = assembleDocument({
        format,
        segments,
        math,
        placements,
        ...title !== undefined ? { title } : {},
        mathjax,
      })
      warnings.push(...assembled.warnings)
      const documentBytes = await writeOutput(documentTarget, assembled.text)

      const value: MathDocumentValue = {
        kind: 'document',
        format,
        math,
        self_contained: selfContained,
        doc_path: documentTarget.relativePath,
        doc_host_path: documentTarget.hostPath,
        doc_bytes: documentBytes,
        assets_dir: assetsDirectory,
        images,
        warnings,
      }
      return value
    },
  })
}
