/**
 * `math_figure` — declarative geometry/function figure → image files.
 *
 * @module @jaxzhou/dsh-mathmatic-symbol/tools/figure
 */

import type { ResolvedMathConfig } from '../config.ts'
import type { PluginContext, ToolDefinition, ToolRunContext } from '../dsh.ts'
import { renderFigure } from '../figure.ts'
import {
  assertKnownKeys,
  COMMON_PARAMETERS,
  createTool,
  parseCommonArgs,
  publishSvg,
  resolveWorkspaceRoot,
} from './shared.ts'

const TOOL = 'math_figure'

const OWN_KEYS = ['figure'] as const
const ALL_KEYS: readonly string[] = [...OWN_KEYS, ...Object.keys(COMMON_PARAMETERS)]

/** Model-facing documentation of the figure spec, kept next to the schema. */
const SPEC_HELP = [
  'The spec is {"width"?,"height"?,"padding"?,"background"?,"xRange"?,"yRange"?,"aspect"?,"vars"?,"grid"?,"axes"?,"title"?,"elements":[…]}.',
  'Coordinates are mathematical (y grows upward); "xRange"/"yRange" are [min,max] and auto-fit from the elements when omitted.',
  '"vars" defines named numbers that coordinate expressions may use, e.g. {"a":3,"b":"2*a"} then "at":["a","b"].',
  '"aspect" is "equal" (default: circles stay circles) or "stretch". "grid" is true|{step,color}; "axes" is true|{color,labels} and defaults to true when the spec has curve/parametric/polar elements.',
  'A point is [x,y] with number-or-expression entries, or a string naming an earlier point element with a "label".',
  'Elements:',
  '· point {at, label?, label_offset?, label_size?, size?, color?, open?} — label_offset is screen px, y down.',
  '· segment {from, to, style?, arrow?, color?, width?, label?, label_offset?}; vector = segment with arrow "end".',
  '· line {through:[p,p], extend?:"both"|"forward"|"backward"|"none", …} and ray {from, through, …}.',
  '· polyline/polygon {points:[p,…], closed?, fill?, fill_opacity?, label?}.',
  '· circle {center, radius} or {center, through}; arc {center, radius, start, end} with degrees, counter-clockwise.',
  '· angle {at, from, to, radius?, right?, label?} — the arc between two rays; right:true draws the square marker.',
  '· curve {y:"sin(x)", domain?, samples?}; parametric {x:"cos(t)", y:"sin(3t)", range?}; polar {r:"2cos(3theta)", range?}.',
  '· text {at, text:"\\\\alpha", size?, anchor?, valign?, rotate?}.',
  'Every label and text is LaTeX, so write "A_1", "\\\\alpha", "\\\\frac{\\\\pi}{2}"; use "\\\\text{…}" for upright words.',
].join('\n')

/**
 * Build the `math_figure` tool.
 * @param ctx - the plugin context (used for optional preview admission).
 * @param config - the resolved plugin configuration.
 * @returns the registry-ready tool definition.
 */
export function createFigureTool(ctx: PluginContext, config: ResolvedMathConfig): ToolDefinition {
  return createTool({
    name: TOOL,
    description:
      'Draw a mathematical figure — geometry constructions and function/polar/parametric plots — as a self-contained SVG '
      + 'image plus a PNG raster, write both into the session workspace, and return paths and document snippets. Figures '
      + 'are declared, not coded: a JSON spec of elements in mathematical coordinates, with named points, expressions over '
      + 'named variables, and LaTeX labels. Use this for triangles, circles, angles, axes, unit circles, rose curves, '
      + 'spirals, and any "draw the diagram" request.\n\n'
      + SPEC_HELP,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['figure'],
      properties: {
        figure: {
          type: 'object',
          additionalProperties: true,
          description: 'The figure spec. See the tool description for the full element catalog.',
          examples: [{
            width: 420,
            height: 320,
            xRange: [-1, 5],
            yRange: [-1, 4],
            axes: true,
            elements: [
              { type: 'polygon', points: [[0, 0], [4, 0], [0, 3]], fill: '#93c5fd33', label: null },
              { type: 'point', at: [0, 0], label: 'A', label_offset: [-12, 10] },
              { type: 'point', at: [4, 0], label: 'B', label_offset: [10, 10] },
              { type: 'point', at: [0, 3], label: 'C', label_offset: [-12, -10] },
              { type: 'angle', at: [4, 0], from: [0, 0], to: [0, 3], label: '\\beta' },
              { type: 'angle', at: [0, 0], from: [4, 0], to: [0, 3], right: true },
            ],
          }],
        },
        ...COMMON_PARAMETERS,
      },
    },
    async execute(raw: Record<string, unknown>, exec: ToolRunContext) {
      assertKnownKeys(raw, ALL_KEYS, TOOL)
      const figure = raw.figure
      if (typeof figure !== 'object' || figure === null || Array.isArray(figure)) {
        throw new Error(`${TOOL}: "figure" must be a JSON object`)
      }
      const args = parseCommonArgs(raw, config, TOOL)
      const root = resolveWorkspaceRoot(config, exec)
      const warnings: string[] = []
      if (args.background !== 'transparent') warnings.push(`background "${args.background}" applies to both the SVG and the PNG`)
      const rendered = await renderFigure(figure, {
        background: args.background,
        padding: args.padding,
      })
      return publishSvg({
        kind: 'figure',
        source: rendered.source,
        display: false,
        altText: typeof (figure as Record<string, unknown>).title === 'string'
          ? (figure as Record<string, unknown>).title as string
          : 'mathematical figure',
        prefix: 'figure',
        hashParts: rendered.hashParts,
        svgText: rendered.svg,
        svgWidth: rendered.width,
        svgHeight: rendered.height,
        warnings: [...warnings, ...rendered.warnings],
        config,
        args,
        root,
        ctx,
        exec,
      })
    },
  })
}
