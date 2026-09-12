#!/usr/bin/env node
/**
 * Render one figure spec to SVG + PNG without booting a Harness profile.
 *
 * This is the "try it in a checkout" path for the specs in `examples/`: the
 * plugin's drawing code is a plain library call, so a spec can be previewed
 * with nothing but this repository and its dependencies.
 *
 *   node scripts/render-example.mjs
 *   node scripts/render-example.mjs examples/rose.json
 *   node scripts/render-example.mjs examples/function-plot.json out --scale=2
 *
 * The spec file is the value of the `math_figure` tool's `figure` parameter.
 * Output goes to `.tmp/examples/` by default (git-ignored), named after the
 * spec file.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rasterizePng, renderFigure } from '../lib/index.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flags = argv.filter(argument => argument.startsWith('--'))
const positional = argv.filter(argument => !argument.startsWith('--'))

const specPath = positional[0] ?? 'examples/triangle.json'
const outDir = positional[1] ?? '.tmp/examples'
const scaleFlag = flags.find(flag => flag.startsWith('--scale='))
const scale = scaleFlag === undefined ? 4 : Number(scaleFlag.slice('--scale='.length))

if (!Number.isFinite(scale) || scale <= 0 || scale > 16) {
  console.error(`render-example: --scale must be a number between 0 and 16 (got "${scaleFlag ?? ''}")`)
  process.exit(2)
}

const absoluteSpec = path.resolve(root, specPath)
let spec
try {
  spec = JSON.parse(await readFile(absoluteSpec, 'utf8'))
} catch (error) {
  console.error(`render-example: could not read a JSON spec from ${absoluteSpec}: ${error.message}`)
  process.exit(2)
}

const figure = await renderFigure(spec).catch((error) => {
  console.error(`render-example: ${error.message}`)
  process.exit(1)
})
const raster = await rasterizePng(figure.svg, { scale, background: spec.background ?? 'transparent' }).catch((error) => {
  console.error(`render-example: ${error.message}`)
  process.exit(1)
})

const base = path.basename(specPath).replace(/\.json$/i, '')
const target = path.resolve(root, outDir)
await mkdir(target, { recursive: true })
const svgPath = path.join(target, `${base}.svg`)
const pngPath = path.join(target, `${base}.png`)
await writeFile(svgPath, figure.svg)
await writeFile(pngPath, raster.data)

console.log(`${path.relative(root, svgPath)}  ${figure.width}x${figure.height}  ${(figure.svg.length / 1024).toFixed(1)} KiB`)
console.log(`${path.relative(root, pngPath)}  ${raster.width}x${raster.height}  ${(raster.data.byteLength / 1024).toFixed(1)} KiB`)
for (const warning of figure.warnings) console.log(`warning: ${warning}`)
