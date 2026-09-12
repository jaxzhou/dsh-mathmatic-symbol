/**
 * `math_convert` — turn an existing formula, SVG, or SVG file into embeddable
 * images.
 *
 * This is the "make it an image for my document" tool: it rasterizes an SVG
 * that came from anywhere, sanitizes foreign SVG, re-emits a standalone SVG
 * with explicit pixel dimensions, and returns the same embed snippets as the
 * generators. A PNG source is passed through (no decode/re-encode).
 *
 * @module @jaxzhou/dsh-mathmatic-symbol/tools/convert
 */

import path from 'node:path'
import type { ResolvedMathConfig } from '../config.ts'
import type { PluginContext, ToolDefinition, ToolRunContext } from '../dsh.ts'
import { readWorkspaceBytes, readWorkspaceText } from '../output.ts'
import { readPngSize } from '../raster.ts'
import { sanitizeSvg } from '../sanitize.ts'
import { isSafeColor } from '../svg.ts'
import { renderFormulaSvg, stripMathDelimiters } from './formula.ts'
import {
  assertKnownKeys,
  COMMON_PARAMETERS,
  createTool,
  parseCommonArgs,
  publishExistingImage,
  publishSvg,
  resolveWorkspaceRoot,
} from './shared.ts'

const TOOL = 'math_convert'

const OWN_KEYS = ['source', 'font_size', 'color'] as const
const ALL_KEYS: readonly string[] = [...OWN_KEYS, ...Object.keys(COMMON_PARAMETERS)]
const SOURCE_KEYS = ['latex', 'display', 'svg', 'path'] as const

/** Maximum SVG text accepted for conversion. */
const MAX_SVG_CHARS = 2 * 1024 * 1024

/** Maximum PNG accepted for passthrough. */
const MAX_PNG_BYTES = 20 * 1024 * 1024

/**
 * Build the `math_convert` tool.
 * @param ctx - the plugin context (used for optional preview admission).
 * @param config - the resolved plugin configuration.
 * @returns the registry-ready tool definition.
 */
export function createConvertTool(ctx: PluginContext, config: ResolvedMathConfig): ToolDefinition {
  return createTool({
    name: TOOL,
    description:
      'Convert a formula, an inline SVG string, or an existing workspace SVG/PNG file into embeddable image files for a '
      + 'document: rasterize to PNG, normalize/clean the SVG, and return Markdown/HTML/LaTeX snippets plus optional base64 '
      + 'data URIs. Use it to turn a hand-written or pasted SVG into a PNG, or to re-emit an SVG with explicit pixel '
      + 'dimensions. Foreign SVG is sanitized (no scripts, event handlers, DOCTYPE, or external references) and any removal '
      + 'is reported as a warning.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['source'],
      properties: {
        source: {
          type: 'object',
          additionalProperties: false,
          description: 'Exactly one of: {"latex":"…", display?} to typeset TeX; {"svg":"<svg …>"} for inline SVG; {"path":"math/foo.svg"} for a workspace file (.svg or .png).',
          properties: {
            latex: { type: 'string', description: 'TeX math source; rendered like math_formula.' },
            display: { type: 'boolean', default: true, description: 'Display style for a LaTeX source.' },
            svg: { type: 'string', description: 'Inline SVG document text.' },
            path: { type: 'string', description: 'Workspace-relative path to an .svg or .png file.' },
          },
        },
        font_size: {
          type: 'number',
          default: 16,
          description: 'Fragment size in pixels for a LaTeX source (default 16, from plugin config).',
        },
        color: {
          type: 'string',
          default: '#000000',
          description: 'Ink color for a LaTeX source (default "#000000").',
        },
        ...COMMON_PARAMETERS,
      },
    },
    async execute(raw: Record<string, unknown>, exec: ToolRunContext) {
      assertKnownKeys(raw, ALL_KEYS, TOOL)
      const sourceRaw = raw.source
      if (typeof sourceRaw !== 'object' || sourceRaw === null || Array.isArray(sourceRaw)) {
        throw new Error(`${TOOL}: "source" must be an object with exactly one of "latex", "svg", or "path"`)
      }
      const source = sourceRaw as Record<string, unknown>
      assertKnownKeys(source, SOURCE_KEYS, `${TOOL} source`)
      const present = (['latex', 'svg', 'path'] as const).filter(key => source[key] !== undefined)
      if (present.length !== 1) {
        throw new Error(`${TOOL}: "source" must contain exactly one of "latex", "svg", or "path" (found ${present.length})`)
      }
      const kind = present[0] as 'latex' | 'svg' | 'path'
      const args = parseCommonArgs(raw, config, TOOL)
      const root = resolveWorkspaceRoot(config, exec)
      const warnings: string[] = []

      if (kind === 'latex') {
        const latexRaw = source.latex
        if (typeof latexRaw !== 'string' || latexRaw.trim().length === 0) {
          throw new Error(`${TOOL}: "source.latex" must be a non-empty string`)
        }
        const latex = stripMathDelimiters(latexRaw)
        if (latex.length === 0) throw new Error(`${TOOL}: "source.latex" is empty after removing math delimiters`)
        const displayRaw = source.display
        if (displayRaw !== undefined && typeof displayRaw !== 'boolean') {
          throw new Error(`${TOOL}: "source.display" must be a boolean`)
        }
        const fontSize = raw.font_size === undefined ? config.fontSize : raw.font_size
        if (typeof fontSize !== 'number' || !Number.isFinite(fontSize) || fontSize < 6 || fontSize > 96) {
          throw new Error(`${TOOL}: "font_size" must be a number between 6 and 96`)
        }
        const color = raw.color === undefined ? config.color : raw.color
        if (typeof color !== 'string' || !isSafeColor(color)) {
          throw new Error(`${TOOL}: "color" must be a flat CSS color such as "#111827"`)
        }
        const formula = await renderFormulaSvg(latex, {
          display: displayRaw ?? true,
          fontSize,
          color,
          padding: args.padding,
          background: args.background,
        })
        return publishSvg({
          kind: 'formula',
          source: latex,
          display: displayRaw ?? true,
          altText: latex.length > 80 ? `${latex.slice(0, 77)}…` : latex,
          prefix: 'formula',
          hashParts: [latex, String(displayRaw ?? true), String(fontSize), color, args.background, String(args.padding)],
          svgText: formula.svg,
          svgWidth: formula.width,
          svgHeight: formula.height,
          warnings: [...warnings, ...formula.warnings],
          config,
          args,
          root,
          ctx,
          exec,
        })
      }

      if (kind === 'svg') {
        const svgRaw = source.svg
        if (typeof svgRaw !== 'string' || svgRaw.trim().length === 0) {
          throw new Error(`${TOOL}: "source.svg" must be a non-empty SVG string`)
        }
        const sanitized = sanitizeSvg(svgRaw)
        warnings.push(...sanitized.removed.map(item => `removed ${item} from the input SVG`))
        return publishSvg({
          kind: 'image',
          source: '<inline svg>',
          display: false,
          altText: 'SVG image',
          prefix: 'image',
          hashParts: [sanitized.svg, args.background],
          svgText: sanitized.svg,
          svgWidth: sanitized.width,
          svgHeight: sanitized.height,
          warnings,
          config,
          args,
          root,
          ctx,
          exec,
        })
      }

      const requested = source.path
      if (typeof requested !== 'string' || requested.trim().length === 0) {
        throw new Error(`${TOOL}: "source.path" must be a non-empty workspace-relative path`)
      }
      const extension = path.extname(requested).toLowerCase()
      if (extension === '.png') {
        const { data, target } = await readWorkspaceBytes(root, requested, MAX_PNG_BYTES)
        const size = readPngSize(data)
        if (size === undefined) throw new Error(`${TOOL}: "${requested}" is not a readable PNG`)
        if (args.format === 'svg') throw new Error(`${TOOL}: a PNG source cannot produce an SVG; use format "png" or "both"`)
        return publishExistingImage({
          kind: 'image',
          source: requested,
          altText: path.basename(requested),
          target,
          width: size.width,
          height: size.height,
          bytes: data.byteLength,
          warnings,
          args,
          ctx,
          exec,
        })
      }
      if (extension !== '.svg') {
        throw new Error(`${TOOL}: "source.path" must end in .svg or .png (got "${extension || 'no extension'}")`)
      }
      const { text } = await readWorkspaceText(root, requested, MAX_SVG_CHARS)
      const sanitized = sanitizeSvg(text)
      warnings.push(...sanitized.removed.map(item => `removed ${item} from the input SVG`))
      return publishSvg({
        kind: 'image',
        source: requested,
        display: false,
        altText: path.basename(requested),
        prefix: path.basename(requested, extension),
        hashParts: [sanitized.svg, args.background],
        svgText: sanitized.svg,
        svgWidth: sanitized.width,
        svgHeight: sanitized.height,
        warnings,
        config,
        args: { ...args, path: args.path ?? requested },
        root,
        ctx,
        exec,
      })
    },
  })
}
