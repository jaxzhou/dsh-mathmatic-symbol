/**
 * Host half of the `@jaxzhou/dsh-mathmatic-symbol` plugin.
 *
 * Registers four model-facing tools on the Harness tool registry:
 *
 *   - `math_formula`  — LaTeX math → SVG + PNG image files and embed snippets
 *   - `math_figure`   — declarative geometry/function figure → SVG + PNG
 *   - `math_convert`  — an existing formula/SVG/SVG file → embeddable images
 *   - `math_document` — a Markdown/HTML/LaTeX document with those images inserted
 *
 * plus one ordered system-prompt section that tells the model *when* to use them
 * (an image or a document file is the deliverable) and not to hand-write SVG,
 * LaTeX-rendering, or plotting code instead. That section is registered through
 * `ctx.inject(['systemPrompt'], …)` so a composition without a system prompt
 * still gets the tools.
 *
 * Registration goes through the structural `ctx.tools.register(definition)`
 * seam and every disposer is owned by a Cordis effect, so unloading the plugin
 * row removes the tools, the guidance, and the caches. The plugin reads no
 * durable state, writes only inside the calling session's workspace, and never
 * touches the network.
 *
 * @module @jaxzhou/dsh-mathmatic-symbol
 */

import { resolveConfig, type MathPluginConfig } from './config.ts'
import type { PluginContext } from './dsh.ts'
import { clearExpressionCache, compileExpression, evaluateExpression } from './expr.ts'
import { renderFigure } from './figure.ts'
import { renderFormulaSvg, stripMathDelimiters } from './formula.ts'
import { clearTexCache, inlineTexFragment, renderTex, standaloneTexSvg } from './latex.ts'
import { registerMathPromptSection } from './prompt.ts'
import { readPngSize, rasterizePng, RasterUnavailableError } from './raster.ts'
import { sanitizeSvg } from './sanitize.ts'
import { allowedVariants, assembleDocument, preferredVariant, scanDocument } from './document.ts'
import { createConvertTool } from './tools/convert.ts'
import { createDocumentTool } from './tools/document.ts'
import { createFigureTool } from './tools/figure.ts'
import { createFormulaTool } from './tools/formula.ts'

/** This plugin's identity inside the Host Loader. */
export const name = 'math-symbol'

/** The tool registry must be mounted before this plugin can contribute. */
export const inject = ['tools']

/**
 * Register the math tools, the prompt guidance, and the cache cleanup.
 * @param ctx - the Host plugin context.
 * @param config - optional configuration from the profile's patch row.
 * @throws Error when the configuration is invalid; nothing is registered.
 */
export function apply(ctx: PluginContext, config?: MathPluginConfig): void {
  const resolved = resolveConfig(config)
  ctx.tools.register(createFormulaTool(ctx, resolved))
  ctx.tools.register(createFigureTool(ctx, resolved))
  ctx.tools.register(createConvertTool(ctx, resolved))
  ctx.tools.register(createDocumentTool(ctx, resolved))
  // Prompt guidance is a separate optional capability: a composition without a
  // system prompt still gets the tools, it just loses the "use these instead of
  // writing your own renderer" instruction.
  if (typeof ctx.inject === 'function') {
    ctx.inject(['systemPrompt'], (promptCtx) => {
      registerMathPromptSection(promptCtx)
    })
  } else {
    registerMathPromptSection(ctx)
  }
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
 * programmatic reuse (a Scriptable Host caller can compose figures and
 * documents without the tool layer). None of these touch the tool registry.
 */
export { compileExpression, evaluateExpression, renderFigure, renderTex, standaloneTexSvg, inlineTexFragment }
export { renderFormulaSvg, stripMathDelimiters }
export { sanitizeSvg, rasterizePng, readPngSize, RasterUnavailableError, clearTexCache, clearExpressionCache }
export { scanDocument, assembleDocument, preferredVariant, allowedVariants }
export { mathToolGuidance, registerMathPromptSection, PROMPT_SECTION_NAME } from './prompt.ts'
export { resolveConfig }
export type { MathPluginConfig }
