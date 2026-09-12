/**
 * Plugin configuration: the values a profile's patch row may override, with
 * validation that fails at mount time rather than silently clamping a typo.
 *
 * @module @jaxzhou/dsh-mathmatic-symbol/config
 */

import { isSafeColor } from './svg.ts'

/** Raw configuration as it appears in a Cordis row. */
export interface MathPluginConfig {
  /** Directory (workspace-relative) for generated assets. */
  outputDir?: string
  /** Default raster zoom factor for PNG output. */
  scale?: number
  /** Default ink color for formulas and figures. */
  color?: string
  /** Default figure background; `transparent` is the default. */
  background?: string
  /** Default transparent margin in pixels. */
  padding?: number
  /** Default fragment size in pixels (one em). */
  fontSize?: number
  /** Default for the per-call `preview` flag. */
  preview?: boolean
  /** Default for the per-call `data_uri` flag. */
  dataUri?: boolean
  /** Override the workspace root (testing/hosted compositions only). */
  workspaceRoot?: string
}

/** Configuration after defaults and validation. */
export interface ResolvedMathConfig {
  outputDir: string
  scale: number
  color: string
  background: string
  padding: number
  fontSize: number
  preview: boolean
  dataUri: boolean
  workspaceRoot?: string
}

const DEFAULTS = {
  outputDir: 'math',
  scale: 4,
  color: '#000000',
  background: 'transparent',
  padding: 8,
  fontSize: 16,
  preview: false,
  dataUri: false,
} as const

function fail(name: string, expectation: string): never {
  throw new Error(`math-symbol config: "${name}" ${expectation}`)
}

function readNumber(value: unknown, name: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(name, 'must be a finite number')
  if (value < min || value > max) fail(name, `must be between ${min} and ${max}`)
  return value
}

function readBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') fail(name, 'must be a boolean')
  return value
}

function readString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim().length === 0) fail(name, 'must be a non-empty string')
  return value.trim()
}

/**
 * Apply defaults and validate one plugin configuration object.
 * @param input - the raw config from the Cordis row (may be undefined).
 * @returns the resolved configuration.
 * @throws Error naming the offending field.
 */
export function resolveConfig(input: unknown): ResolvedMathConfig {
  if (input !== undefined && (typeof input !== 'object' || input === null || Array.isArray(input))) {
    throw new Error('math-symbol config: expected an object')
  }
  const raw = (input ?? {}) as MathPluginConfig

  const outputDir = readString(raw.outputDir, 'outputDir') ?? DEFAULTS.outputDir
  if (outputDir.startsWith('/') || outputDir.includes('..')) {
    fail('outputDir', 'must be a workspace-relative directory without ".."')
  }

  const color = readString(raw.color, 'color') ?? DEFAULTS.color
  if (!isSafeColor(color)) fail('color', 'must be a flat CSS color such as "#111827"')

  const background = readString(raw.background, 'background') ?? DEFAULTS.background
  if (background !== 'transparent' && !isSafeColor(background)) {
    fail('background', 'must be "transparent" or a flat CSS color')
  }

  const workspaceRoot = readString(raw.workspaceRoot, 'workspaceRoot')

  const resolved: ResolvedMathConfig = {
    outputDir,
    scale: readNumber(raw.scale, 'scale', 0.25, 16) ?? DEFAULTS.scale,
    color,
    background,
    padding: Math.round(readNumber(raw.padding, 'padding', 0, 128) ?? DEFAULTS.padding),
    fontSize: readNumber(raw.fontSize, 'fontSize', 6, 96) ?? DEFAULTS.fontSize,
    preview: readBoolean(raw.preview, 'preview') ?? DEFAULTS.preview,
    dataUri: readBoolean(raw.dataUri, 'dataUri') ?? DEFAULTS.dataUri,
  }
  if (workspaceRoot !== undefined) resolved.workspaceRoot = workspaceRoot
  return resolved
}
