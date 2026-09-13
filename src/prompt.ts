/**
 * System-prompt guidance for the math tools.
 *
 * Tool descriptions say what a tool *can* do; this section says *when* to reach
 * for it and what not to do instead. Without it a model happily hand-writes SVG,
 * shells out to a plotting library, or invents image paths — exactly the work
 * this plugin exists to replace.
 *
 * The section is deliberately on-demand: it states the trigger (an image or a
 * document file is the deliverable, or the user asks for one) and keeps plain
 * LaTeX in normal chat answers. Its text collapses to an empty string whenever
 * none of the tools are visible in the calling scope, mirroring how built-in
 * tool guidance behaves.
 *
 * The text must never contain a double-braced group: the Harness interpolates
 * `{{name}}` in section text and throws on a name outside `[a-z][a-z0-9_]*`, so a
 * literal placeholder like the document tool's would break every prompt
 * assembly. Figures are therefore spelled `[[figure:name]]` throughout.
 *
 * @module @jaxzhou/dsh-mathmatic-symbol/prompt
 */

import type { PluginContext } from './dsh.ts'

/** The four tool names this section steers the model toward. */
const TOOL_NAMES = ['math_formula', 'math_figure', 'math_convert', 'math_document'] as const

/** Unique prompt-section name. */
export const PROMPT_SECTION_NAME = 'tool:math-symbol'

/**
 * Build the guidance for whichever of the tools are visible.
 * @param available - the visible tool names.
 * @returns the section text, or an empty string.
 */
export function mathToolGuidance(available: readonly string[]): string {
  if (available.length === 0) return ''
  const bullets: string[] = []
  if (available.includes('math_formula')) {
    bullets.push('- `math_formula` — LaTeX math → a font-free SVG image plus an optional PNG.')
  }
  if (available.includes('math_figure')) {
    bullets.push(
      '- `math_figure` — geometry constructions and function/parametric/polar plots from a JSON spec '
      + '(points, segments, lines, polygons, circles, arcs, angles, curves). Declare the elements; do not draw by hand.',
    )
  }
  if (available.includes('math_convert')) {
    bullets.push('- `math_convert` — an existing SVG string, formula, or workspace SVG/PNG file → an embeddable image; also sanitizes foreign SVG.')
  }
  if (available.includes('math_document')) {
    bullets.push(
      '- `math_document` — assemble a Markdown/HTML/LaTeX document whose formulas and figures are already rendered and '
      + 'inserted. Write the body with `$inline$`, `$$display$$`, and `[[figure:name]]` tokens; pass `figures` as a '
      + 'name → spec map. This replaces writing image paths or embedding markup by hand.',
    )
  }
  return 'Math and figures: when a formula or a geometric/function figure is needed as an *image*, or a document with '
    + 'such images embedded is the deliverable (or the user asks for one), use these tools rather than writing your own '
    + 'rendering code:\n'
    + bullets.join('\n')
    + '\nEvery call writes the image files into the session workspace, names them content-addressed, and returns paths '
    + 'plus ready-to-paste Markdown/HTML/LaTeX snippets — use what the tool returns; do not re-derive paths, re-encode '
    + 'images, or re-implement the rendering with SVG, LaTeX tooling, or a plotting library. Ordinary chat answers keep '
    + 'using LaTeX text directly; these tools are for image or document deliverables.'
}

/**
 * Register the guidance section when the deployment mounts a system prompt.
 * @param ctx - the plugin context (or an injected child context).
 */
export function registerMathPromptSection(ctx: PluginContext): void {
  const systemPrompt = ctx.systemPrompt
  if (systemPrompt === undefined) return
  systemPrompt.section({
    name: PROMPT_SECTION_NAME,
    order: systemPrompt.getSectionOrder('TOOL_REPORT'),
    text: ({ scope }) => {
      const available = TOOL_NAMES.filter(name => ctx.tools.get?.(name, scope) !== undefined)
      return mathToolGuidance(available)
    },
  })
}
