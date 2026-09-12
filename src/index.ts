/**
 * Host half of the `@jaxzhou/dsh-mathmatic-symbol` plugin.
 *
 * Registers three model-facing tools on the Harness tool registry:
 *
 *   - `math_formula` — LaTeX math → SVG + PNG image files and embed snippets
 *   - `math_figure`  — declarative geometry/function figure → SVG + PNG
 *   - `math_convert` — an existing formula/SVG/SVG file → embeddable images
 *
 * Registration goes through the structural `ctx.tools.register(definition)`
 * seam and the returned disposer is owned by the Cordis effect, so unloading
 * the plugin row unregisters every tool. The plugin reads no durable state,
 * writes only inside the calling session's workspace, and touches the network
 * never.
 *
 * @module @jaxzhou/dsh-mathmatic-symbol
 */

import { resolveConfig, type MathPluginConfig } from './config.ts'
import type { PluginContext } from './dsh.ts'
import { clearExpressionCache, compileExpression, evaluateExpression } from './expr.ts'
import { renderFigure } from './figure.ts'
import { clearTexCache, inlineTexFragment, renderTex, standaloneTexSvg } from './latex.ts'
import { readPngSize, rasterizePng, RasterUnavailableError } from './raster.ts'
import { sanitizeSvg } from './sanitize.ts'
import { createConvertTool } from './tools/convert.ts'
import { createFigureTool } from './tools/figure.ts'
import { createFormulaTool, stripMathDelimiters } from './tools/formula.ts'

/** This plugin's identity inside the Host Loader. */
export const name = 'math-symbol'

/** The tool registry must be mounted before this plugin can contribute. */
export const inject = ['tools']

/**
 * Register the math tools and own their disposal.
 * @param ctx - the Host plugin context.
 * @param config - optional configuration from the profile's patch row.
 * @throws Error when the configuration is invalid; nothing is registered.
 */
export function apply(ctx: PluginContext, config?: MathPluginConfig): void {
  const resolved = resolveConfig(config)
  ctx.tools.register(createFormulaTool(ctx, resolved))
  ctx.tools.register(createFigureTool(ctx, resolved))
  ctx.tools.register(createConvertTool(ctx, resolved))
  // MathJax fragments and compiled expressions are content-keyed caches with
  // no external handles; releasing them on unload keeps a reloaded plugin from
  // inheriting stale geometry.
  ctx.effect(() => () => {
    clearTexCache()
    clearExpressionCache()
  })
}

/*
 * Pure-function surface, exported for the repository's own tests and for
 * programmatic reuse (a Scriptable Host caller can compose figures without the
 * tool layer). None of these touch the tool registry.
 */
export { compileExpression, evaluateExpression, renderFigure, renderTex, standaloneTexSvg, inlineTexFragment }
export { sanitizeSvg, rasterizePng, readPngSize, RasterUnavailableError, clearTexCache, clearExpressionCache }
export { stripMathDelimiters, resolveConfig }
export type { MathPluginConfig }
