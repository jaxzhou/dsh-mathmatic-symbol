/**
 * Shared tool plumbing: argument parsing, the emit pipeline that turns an SVG
 * string into files plus a canonical value, and the optional inline-image
 * preview.
 *
 * @module @jaxzhou/dsh-mathmatic-symbol/tools/shared
 */

import path from 'node:path'
import type { ResolvedMathConfig } from '../config.ts'
import type {
  AttachmentStore,
  ContentBlock,
  ImageAttachmentRef,
  LlmService,
  PluginContext,
  ToolDefinition,
  ToolResultLike,
  ToolRunContext,
} from '../dsh.ts'
import { buildEmbeds } from '../embed.ts'
import { contentHash, planOutputTarget, safeBaseName, writeOutput } from '../output.ts'
import { RasterUnavailableError, rasterizePng } from '../raster.ts'
import { isSafeColor } from '../svg.ts'
import { formatMathImageValue, MATH_IMAGE_VALUE_SCHEMA, type MathImageValue } from '../value.ts'

/** Image previews admitted for one call, keyed by the execution identity. */
const previewRefs = new WeakMap<ToolRunContext, ImageAttachmentRef>()

/** Normalized common options every tool accepts. */
export interface CommonArgs {
  format: 'svg' | 'png' | 'both'
  scale: number
  background: string
  padding: number
  path: string | undefined
  name: string | undefined
  dataUri: boolean
  preview: boolean
}

/**
 * The parameter schema fragment shared by all three tools, in raw JSON Schema
 * (this plugin registers raw tools, so `parameters` is passed through to the
 * provider unchanged).
 */
export const COMMON_PARAMETERS: Record<string, unknown> = {
  format: {
    type: 'string',
    enum: ['svg', 'png', 'both'],
    default: 'both',
    description: 'Which artifact(s) to write. "svg" is vector and needs no rasterizer; "png" is raster-only; "both" (default) writes both.',
  },
  scale: {
    type: 'number',
    default: 4,
    description: 'PNG zoom factor; pixel size = CSS size × scale. Defaults to the plugin config (4).',
  },
  background: {
    type: 'string',
    default: 'transparent',
    description: 'Background color for the PNG ("transparent" or a flat CSS color such as "#ffffff").',
  },
  padding: {
    type: 'number',
    default: 8,
    description: 'Transparent margin in pixels around the drawing at 1×.',
  },
  path: {
    type: 'string',
    description: 'Workspace-relative output file (".svg"/".png") or directory. Defaults to the configured output directory with a content-addressed name.',
  },
  name: {
    type: 'string',
    description: 'Optional human-readable file base name, e.g. "pythagoras". Sanitized; the content hash is used when omitted.',
  },
  data_uri: {
    type: 'boolean',
    default: false,
    description: 'Also return base64 data URIs for documents that cannot reference a sibling file.',
  },
  preview: {
    type: 'boolean',
    default: false,
    description: 'Also attach the PNG to this result for inline display, when the active model declares image input and a durable attachment store is mounted.',
  },
}

/** Reject unknown keys loudly: a typo must not be silently ignored. */
export function assertKnownKeys(raw: Record<string, unknown>, allowed: readonly string[], toolName: string): void {
  const unknown = Object.keys(raw).filter(key => !allowed.includes(key))
  if (unknown.length > 0) {
    throw new Error(`${toolName}: unknown argument(s) ${unknown.map(key => `"${key}"`).join(', ')}; supported: ${allowed.join(', ')}`)
  }
}

/** Narrow the raw model arguments to a JSON object. */
export function readObject(args: unknown, toolName: string): Record<string, unknown> {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new Error(`${toolName}: arguments must be a JSON object`)
  }
  return args as Record<string, unknown>
}

function readString(raw: Record<string, unknown>, key: string, toolName: string): string | undefined {
  const value = raw[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`${toolName}: "${key}" must be a string`)
  const trimmed = value.trim()
  if (trimmed.length === 0) throw new Error(`${toolName}: "${key}" must not be empty`)
  if (trimmed.includes('\u0000')) throw new Error(`${toolName}: "${key}" must not contain a NUL character`)
  return trimmed
}

function readNumber(
  raw: Record<string, unknown>,
  key: string,
  toolName: string,
  min: number,
  max: number,
): number | undefined {
  const value = raw[key]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${toolName}: "${key}" must be a finite number`)
  }
  if (value < min || value > max) throw new Error(`${toolName}: "${key}" must be between ${min} and ${max}`)
  return value
}

function readBoolean(raw: Record<string, unknown>, key: string, toolName: string): boolean | undefined {
  const value = raw[key]
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`${toolName}: "${key}" must be a boolean`)
  return value
}

/**
 * Parse the common option subset, applying config defaults.
 * @param raw - the validated argument object.
 * @param config - the resolved plugin config.
 * @param toolName - used in error messages.
 * @returns normalized common options.
 */
export function parseCommonArgs(
  raw: Record<string, unknown>,
  config: ResolvedMathConfig,
  toolName: string,
): CommonArgs {
  const format = readString(raw, 'format', toolName) ?? 'both'
  if (format !== 'svg' && format !== 'png' && format !== 'both') {
    throw new Error(`${toolName}: "format" must be one of "svg", "png", "both"`)
  }
  const background = readString(raw, 'background', toolName) ?? config.background
  if (background !== 'transparent' && !isSafeColor(background)) {
    throw new Error(`${toolName}: "background" must be "transparent" or a flat CSS color`)
  }
  const args: CommonArgs = {
    format,
    scale: readNumber(raw, 'scale', toolName, 0.25, 16) ?? config.scale,
    background,
    padding: Math.round(readNumber(raw, 'padding', toolName, 0, 128) ?? config.padding),
    path: readString(raw, 'path', toolName),
    name: readString(raw, 'name', toolName),
    dataUri: readBoolean(raw, 'data_uri', toolName) ?? config.dataUri,
    preview: readBoolean(raw, 'preview', toolName) ?? config.preview,
  }
  return args
}

/**
 * The workspace root a call writes into: explicit config first, then the
 * calling session's working directory, then the process directory.
 * @param config - the resolved plugin config.
 * @param exec - the tool execution.
 * @returns an absolute directory path.
 */
export function resolveWorkspaceRoot(config: ResolvedMathConfig, exec: ToolRunContext): string {
  if (config.workspaceRoot !== undefined) return path.resolve(config.workspaceRoot)
  const fromSession = exec.agent?.session.header.cwd
  if (fromSession !== undefined && fromSession.length > 0) return path.resolve(fromSession)
  return process.cwd()
}

/** Input to the shared SVG emit pipeline. */
export interface PublishSvgInput {
  kind: 'formula' | 'figure' | 'image'
  source: string
  display: boolean
  altText: string
  prefix: string
  hashParts: readonly string[]
  svgText: string
  svgWidth: number
  svgHeight: number
  /** Warnings collected by the generator before publication. */
  warnings: readonly string[]
  config: ResolvedMathConfig
  args: CommonArgs
  root: string
  ctx: PluginContext
  exec: ToolRunContext
}

/**
 * Write an SVG (and its PNG raster when wanted), admit an inline preview, and
 * assemble the canonical value.
 *
 * Degradation is explicit: a missing rasterizer, a failed raster, or a refused
 * preview each turn into a warning on the value, and a PNG-only request that
 * cannot be satisfied still writes the SVG rather than nothing.
 *
 * @param input - the generated SVG and the call context.
 * @returns the canonical tool value.
 */
export async function publishSvg(input: PublishSvgInput): Promise<MathImageValue> {
  const { config, args, root } = input
  const warnings = [...input.warnings]
  const baseName = safeBaseName(args.name, `${input.prefix}-${contentHash(input.hashParts)}`)

  let svgPath: string | null = null
  let svgHostPath: string | null = null
  let svgBytes = 0
  let pngPath: string | null = null
  let pngHostPath: string | null = null
  let pngBytes = 0
  let pngData: Uint8Array | undefined
  let pngSize: { width: number; height: number } | undefined

  const writeSvg = async (): Promise<void> => {
    if (svgPath !== null) return
    const target = await planOutputTarget(root, config.outputDir, args.path, baseName, '.svg')
    svgBytes = await writeOutput(target, input.svgText)
    svgPath = target.relativePath
    svgHostPath = target.hostPath
  }

  if (args.format !== 'png') await writeSvg()

  if (args.format !== 'svg') {
    try {
      const raster = await rasterizePng(input.svgText, { scale: args.scale, background: args.background })
      const target = await planOutputTarget(root, config.outputDir, args.path, baseName, '.png')
      pngBytes = await writeOutput(target, raster.data)
      pngPath = target.relativePath
      pngHostPath = target.hostPath
      pngData = raster.data
      pngSize = { width: raster.width, height: raster.height }
    } catch (error: unknown) {
      const reason = error instanceof RasterUnavailableError
        ? error.message
        : `PNG output failed: ${error instanceof Error ? error.message : String(error)}`
      warnings.push(reason)
      if (svgPath === null) {
        await writeSvg()
        warnings.push('wrote the SVG instead of the requested PNG')
      }
    }
  }

  const svgImage = svgPath !== null
    ? { relativePath: svgPath, width: input.svgWidth, height: input.svgHeight }
    : undefined
  const pngImage = pngPath !== null && pngSize !== undefined
    ? { relativePath: pngPath, width: pngSize.width, height: pngSize.height }
    : undefined
  const { embed, data_uri_svg, data_uri_png } = buildEmbeds(input.altText, {
    ...svgImage !== undefined ? { svg: svgImage } : {},
    ...pngImage !== undefined ? { png: pngImage } : {},
  }, {
    dataUri: args.dataUri,
    svgText: input.svgText,
    ...pngData !== undefined ? { pngBytes: pngData } : {},
  })

  let previewed = false
  if (args.preview) {
    if (pngData === undefined) {
      warnings.push('inline preview was requested but no PNG was produced')
    } else {
      const admitted = await admitPreview(input.ctx, input.exec, pngData, `${baseName}.png`)
      if ('ref' in admitted) {
        previewRefs.set(input.exec, admitted.ref)
        previewed = true
      } else {
        warnings.push(`inline preview unavailable: ${admitted.reason}`)
      }
    }
  }

  const scale = args.scale
  return {
    kind: input.kind,
    source: input.source,
    display: input.display,
    svg_path: svgPath,
    svg_host_path: svgHostPath,
    png_path: pngPath,
    png_host_path: pngHostPath,
    width: Math.round(svgImage?.width ?? (pngSize !== undefined ? pngSize.width / args.scale : input.svgWidth)),
    height: Math.round(svgImage?.height ?? (pngSize !== undefined ? pngSize.height / args.scale : input.svgHeight)),
    pixel_width: pngSize?.width ?? Math.round(input.svgWidth * args.scale),
    pixel_height: pngSize?.height ?? Math.round(input.svgHeight * args.scale),
    scale,
    svg_bytes: svgBytes,
    png_bytes: pngBytes,
    embed,
    data_uri_svg,
    data_uri_png,
    previewed,
    warnings,
  }
}

/**
 * Build a canonical value for an image that already exists on disk (PNG
 * passthrough in `math_convert`): no rendering, just embed snippets.
 * @param input - the existing file and the call context.
 * @returns the canonical tool value.
 */
export async function publishExistingImage(input: {
  kind: 'image'
  source: string
  altText: string
  target: { hostPath: string; relativePath: string }
  width: number
  height: number
  bytes: number
  warnings: readonly string[]
  args: CommonArgs
  ctx: PluginContext
  exec: ToolRunContext
}): Promise<MathImageValue> {
  const { embed } = buildEmbeds(input.altText, {
    png: { relativePath: input.target.relativePath, width: input.width, height: input.height },
  }, { dataUri: false })
  const previewed = false
  const warnings = [...input.warnings]
  if (input.args.preview) {
    warnings.push('inline preview unavailable: this is an existing image file, not a rendered PNG')
  }
  return {
    kind: 'image',
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
    warnings,
  }
}

/** Result of an inline-preview admission attempt. */
type PreviewAdmission = { ref: ImageAttachmentRef } | { reason: string }

/**
 * Durably store one PNG for inline display, but only after proving the active
 * model declares image input. Mirrors the Harness MCP bridge's admission
 * order: capability proof first, storage second, degrade to text on refusal.
 */
async function admitPreview(
  ctx: PluginContext,
  exec: ToolRunContext,
  data: Uint8Array,
  name: string,
): Promise<PreviewAdmission> {
  const attachments = ctx.get('attachments') as AttachmentStore | undefined
  if (attachments === undefined || typeof attachments.saveImage !== 'function') {
    return { reason: 'no durable attachment store is mounted in this profile' }
  }
  const llm = ctx.get('llm') as LlmService | undefined
  const routed = exec.agent?.session.requestHeader?.()?.config
  const provider = routed?.provider ?? exec.agent?.options?.provider
  const model = routed?.model ?? exec.agent?.options?.model
  if (llm === undefined || provider === undefined || model === undefined) {
    return { reason: 'the active model route could not be resolved' }
  }
  let modalities: readonly string[] | undefined
  try {
    modalities = (await llm.resolveModelInfo(provider, model, exec.signal)).inputModalities
  } catch {
    return { reason: 'the active model route could not be verified' }
  }
  if (modalities === undefined || !modalities.includes('image')) {
    return { reason: `model "${model}" does not declare image input` }
  }
  if (exec.signal.aborted) return { reason: 'the call was canceled before the image could be stored' }
  try {
    return { ref: await attachments.saveImage({ data, mediaType: 'image/png', name }) }
  } catch (error: unknown) {
    return { reason: `durable image storage rejected the result (${error instanceof Error ? error.message : String(error)})` }
  }
}

/**
 * Append the admitted preview image to a successful result. Total and
 * non-throwing, as the `finalizeContent` contract requires.
 */
export function finalizePreview(exec: ToolRunContext, result: ToolResultLike): ContentBlock[] | undefined {
  const ref = previewRefs.get(exec)
  if (ref === undefined || result.isError) return undefined
  return [...result.content, { type: 'image', attachment: ref }]
}

/** The shape each tool file provides to {@link createTool}. */
export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute(args: Record<string, unknown>, exec: ToolRunContext): Promise<MathImageValue>
}

/**
 * Wrap one tool implementation into a registry-ready definition whose output
 * contract is the shared canonical value.
 * @param spec - the tool's name, schema, and body.
 * @returns the definition passed to `ctx.tools.register`.
 */
export function createTool(spec: ToolSpec): ToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: MATH_IMAGE_VALUE_SCHEMA,
      render(_args: unknown, value: unknown): ContentBlock[] {
        return [{ type: 'text', text: formatMathImageValue(value as MathImageValue) }]
      },
    },
    execute: (args: unknown, exec: ToolRunContext) => spec.execute(readObject(args, spec.name), exec),
    finalizeContent: finalizePreview,
  }
}
