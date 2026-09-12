import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inlineTexFragment, renderTex, standaloneTexSvg, stripMathDelimiters } from '../lib/index.js'

test('a rendered fragment is font-free and id-free', async () => {
  const rendered = await renderTex('\\frac{a}{b} = \\sqrt{x^2 + 1}', true)
  assert.ok(rendered.width > 0 && rendered.height > 0)
  assert.ok(rendered.above > 0)
  assert.ok(rendered.depth >= 0)
  assert.equal(rendered.errored, false)
  // Glyphs must be inlined as paths: no shared defs, no <use>, no ids, no fonts.
  assert.ok(rendered.inner.includes('<path'))
  for (const forbidden of ['<defs', '<use', 'id="', 'font-family', 'xlink:href']) {
    assert.ok(!rendered.inner.includes(forbidden), `fragment must not contain ${forbidden}`)
  }
})

test('the standalone SVG carries explicit pixel dimensions and a concrete color', async () => {
  const rendered = await renderTex('E = mc^2', false)
  const { svg, width, height } = standaloneTexSvg(rendered, {
    color: '#123456',
    fontSize: 16,
    padding: 6,
    background: 'transparent',
  })
  assert.match(svg, new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`))
  assert.match(svg, new RegExp(`viewBox="0 0 ${width} ${height}"`))
  assert.ok(!svg.includes('currentColor'), 'color must be concrete, not inherited')
  assert.ok(svg.includes('#123456'))
  assert.ok(!svg.includes('<rect'), 'a transparent background adds no rect')
  assert.ok(width > 12 && height > 12)
})

test('a request for an opaque background paints one full-canvas rect', async () => {
  const rendered = await renderTex('x', false)
  const { svg, width, height } = standaloneTexSvg(rendered, {
    color: '#000000',
    fontSize: 16,
    padding: 4,
    background: '#ffffff',
  })
  assert.ok(svg.includes(`<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`))
})

test('inline fragments are positioned by anchor and valign', async () => {
  const rendered = await renderTex('A', false)
  const middle = inlineTexFragment(rendered, 100, 100, { color: '#000000', fontSize: 14, anchor: 'middle', valign: 'middle' })
  const start = inlineTexFragment(rendered, 100, 100, { color: '#000000', fontSize: 14, anchor: 'start', valign: 'baseline' })
  const shift = (markup) => Number(/translate\(([-\d.]+) /.exec(markup)[1])
  assert.ok(shift(middle) < shift(start), 'middle anchoring shifts left of start anchoring')
  assert.match(start, /translate\(100 100\)/)
})

test('invalid TeX renders as an error marker rather than throwing', async () => {
  const rendered = await renderTex('\\frac{', true)
  assert.equal(rendered.errored, true)
})

test('empty source is refused', async () => {
  await assert.rejects(renderTex('   ', true), /empty/)
})

test('common math delimiters and display environments are stripped', () => {
  assert.equal(stripMathDelimiters('$$x^2$$'), 'x^2')
  assert.equal(stripMathDelimiters('$x^2$'), 'x^2')
  assert.equal(stripMathDelimiters('\\[x^2\\]'), 'x^2')
  assert.equal(stripMathDelimiters('\\(x^2\\)'), 'x^2')
  assert.equal(stripMathDelimiters('\\begin{equation}a=b\\end{equation}'), 'a=b')
  assert.equal(stripMathDelimiters('x^2'), 'x^2')
})
