import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rasterizePng, readPngSize, renderFigure, renderTex, standaloneTexSvg } from '../lib/index.js'

test('readPngSize reads the IHDR chunk and rejects non-PNG bytes', () => {
  const fake = new Uint8Array(24)
  fake.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  new DataView(fake.buffer).setUint32(16, 640)
  new DataView(fake.buffer).setUint32(20, 480)
  assert.deepEqual(readPngSize(fake), { width: 640, height: 480 })
  assert.equal(readPngSize(new Uint8Array([1, 2, 3])), undefined)
})

test('a formula rasterizes at the requested zoom with exact pixel dimensions', async () => {
  const rendered = await renderTex('\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}', true)
  const { svg, width, height } = standaloneTexSvg(rendered, { color: '#000000', fontSize: 16, padding: 8, background: 'transparent' })
  const raster = await rasterizePng(svg, { scale: 3 })
  assert.deepEqual({ width: raster.width, height: raster.height }, { width: width * 3, height: height * 3 })
  assert.deepEqual(readPngSize(raster.data), { width: width * 3, height: height * 3 })
})

test('the raster is opaque where asked and transparent otherwise', async () => {
  const rendered = await renderTex('x', false)
  const { svg } = standaloneTexSvg(rendered, { color: '#000000', fontSize: 16, padding: 4, background: 'transparent' })
  const transparent = await rasterizePng(svg, { scale: 1 })
  const opaque = await rasterizePng(svg, { scale: 1, background: '#ffffff' })
  assert.ok(transparent.data.byteLength > 0)
  assert.ok(opaque.data.byteLength > 0)
  // An opaque background compresses differently from a transparent one.
  assert.notEqual(transparent.data.byteLength, opaque.data.byteLength)
})

test('a figure rasterizes to the canvas size times the scale', async () => {
  const figure = await renderFigure({
    width: 200,
    height: 150,
    xRange: [-1, 1],
    yRange: [-1, 1],
    elements: [{ type: 'circle', center: [0, 0], radius: 0.5 }],
  })
  const raster = await rasterizePng(figure.svg, { scale: 2 })
  assert.deepEqual({ width: raster.width, height: raster.height }, { width: 400, height: 300 })
})

test('refused backgrounds and unrasterizable input fail with a message', async () => {
  await assert.rejects(rasterizePng('<svg/>', { scale: 1, background: 'url(http://evil)' }), /not a supported background/)
  await assert.rejects(rasterizePng('this is not SVG at all', { scale: 1 }), /could not be rasterized/)
})
