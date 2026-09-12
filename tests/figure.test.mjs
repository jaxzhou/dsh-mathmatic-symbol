import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderFigure } from '../lib/index.js'

/** Extract every `d` attribute from the emitted SVG. */
function paths(svg) {
  return [...svg.matchAll(/<path d="([^"]+)"/g)].map(match => match[1])
}

test('named points drive the geometry: a right triangle lands on exact pixels', async () => {
  const rendered = await renderFigure({
    width: 420,
    height: 320,
    padding: 16,
    xRange: [-1, 5],
    yRange: [-1, 4],
    axes: false,
    elements: [
      { type: 'polygon', points: [[0, 0], [4, 0], [0, 3]] },
      { type: 'point', at: [0, 0], label: 'A' },
      { type: 'segment', from: 'A', to: [4, 0] },
    ],
  })
  // With equal aspect the x range widens to 5 * (388/288) = 6.7361 around its center.
  const scale = 388 / (5 * (388 / 288))
  const x = value => 16 + (value + 1.36806) * scale
  const y = value => 16 + (4 - value) * scale
  const expected = `M${x(0).toFixed(1)} ${y(0).toFixed(1)} L${x(4).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(3).toFixed(1)} Z`
  assert.ok(paths(rendered.svg).includes(expected), `expected ${expected} in ${paths(rendered.svg).join(' | ')}`)
})

test('a right-angle marker is a three-point square path at the vertex', async () => {
  const rendered = await renderFigure({
    width: 300,
    height: 300,
    padding: 10,
    xRange: [0, 4],
    yRange: [0, 4],
    axes: false,
    elements: [
      { type: 'point', at: [0, 0], label: 'O' },
      { type: 'point', at: [4, 0], label: 'X' },
      { type: 'point', at: [0, 4], label: 'Y' },
      { type: 'angle', at: [0, 0], from: [4, 0], to: [0, 4], right: true },
    ],
  })
  const square = paths(rendered.svg).find(path => path.split('L').length === 3 && !path.includes('A'))
  assert.ok(square !== undefined, 'a right-angle marker path must exist')
  const points = square.match(/-?\d+(?:\.\d+)? -?\d+(?:\.\d+)?/g)
  assert.equal(points.length, 3)
})

test('expressions and vars resolve, and unknown points are refused', async () => {
  const rendered = await renderFigure({
    width: 200,
    height: 200,
    axes: false,
    vars: { a: 2, b: '3 * a' },
    elements: [
      { type: 'point', at: ['a', 'b'], label: 'P' },
      { type: 'point', at: ['b', 0], label: 'Q' },
      { type: 'segment', from: 'P', to: 'Q' },
    ],
  })
  assert.equal(rendered.warnings.length, 0)
  await assert.rejects(
    renderFigure({ elements: [{ type: 'segment', from: 'Z', to: [1, 1] }] }),
    /references unknown point "Z"/,
  )
})

test('function, parametric, and polar elements sample into paths', async () => {
  const rendered = await renderFigure({
    width: 320,
    height: 320,
    xRange: [-3, 3],
    yRange: [-3, 3],
    elements: [
      { type: 'curve', y: 'sin(x)', color: '#1d4ed8' },
      { type: 'parametric', x: 'cos(t)', y: 'sin(2t)', range: [0, 6.283185307179586] },
      { type: 'polar', r: '2cos(3theta)', range: [0, 3.141592653589793] },
    ],
  })
  assert.ok(paths(rendered.svg).length >= 3)
  assert.equal(rendered.warnings.length, 0)
})

test('out-of-domain samples are skipped with a warning, not a crash', async () => {
  const rendered = await renderFigure({
    width: 240,
    height: 240,
    elements: [{ type: 'curve', y: 'ln(x)', domain: [-2, 5] }],
  })
  assert.ok(rendered.warnings.some(warning => /outside the function's domain/.test(warning)))
})

test('axes default on for plots and off for pure geometry', async () => {
  const geometry = await renderFigure({ width: 200, height: 200, elements: [{ type: 'segment', from: [0, 0], to: [1, 1] }] })
  const plot = await renderFigure({
    width: 200,
    height: 200,
    xRange: [-1, 1],
    yRange: [-1, 1],
    elements: [{ type: 'curve', y: 'x^2' }],
  })
  const tickCount = svg => (svg.match(/<line /g) ?? []).length
  assert.equal(tickCount(geometry.svg), 0)
  assert.ok(tickCount(plot.svg) > 6, 'a plot must draw axes and ticks')
})

test('grid lines are drawn when asked', async () => {
  const rendered = await renderFigure({
    width: 200,
    height: 200,
    xRange: [-2, 2],
    yRange: [-2, 2],
    axes: false,
    grid: true,
    elements: [{ type: 'point', at: [0, 0] }],
  })
  assert.ok((rendered.svg.match(/<line /g) ?? []).length >= 6)
})

test('the spec is validated with a path-annotated error', async () => {
  await assert.rejects(renderFigure(null), /must be an object/)
  await assert.rejects(renderFigure({ elements: 'nope' }), /"elements" must be an array/)
  await assert.rejects(
    renderFigure({ elements: [{ type: 'segment', from: [0, 0], to: [1, 1], colour: 'red' }] }),
    /elements\[0\] has unknown key\(s\) "colour"/,
  )
  await assert.rejects(
    renderFigure({ elements: [{ type: 'circle', center: [0, 0] }] }),
    /elements\[0\] needs a positive "radius" or a "through" point/,
  )
  await assert.rejects(
    renderFigure({ elements: [{ type: 'curve', y: 'nosuch(2)' }] }),
    /not a usable expression|unknown variable/,
  )
})

test('ids and element names are deterministic for identical specs', async () => {
  const spec = { width: 200, height: 200, elements: [{ type: 'point', at: [1, 1], label: 'A' }] }
  const first = await renderFigure(spec, { idSeed: 'demo' })
  const second = await renderFigure(spec, { idSeed: 'demo' })
  assert.equal(first.svg, second.svg)
  assert.deepEqual(first.hashParts, second.hashParts)
})
