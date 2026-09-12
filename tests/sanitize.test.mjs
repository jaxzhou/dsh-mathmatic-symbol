import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sanitizeSvg } from '../lib/index.js'

const ROOT = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10">'

test('scripts, foreign markup, and DOCTYPE are removed and reported', () => {
  const result = sanitizeSvg(
    `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>`
    + `${ROOT}<script>steal()</script><foreignObject><div/></foreignObject>`
    + '<rect width="20" height="10"/></svg>',
  )
  assert.ok(!result.svg.includes('<script'))
  assert.ok(!result.svg.includes('foreignObject'))
  assert.ok(!result.svg.includes('DOCTYPE'))
  assert.ok(!result.svg.includes('<?xml'))
  assert.ok(result.removed.includes('<script>'))
  assert.ok(result.removed.includes('a DOCTYPE'))
})

test('event handlers are removed in every quoting style', () => {
  const result = sanitizeSvg(`${ROOT}<rect width="1" height="1" onload="x()" onclick='y()' onerror=z()/></svg>`)
  assert.ok(!/on(load|click|error)/.test(result.svg))
  assert.ok(result.removed.includes('an event handler'))
})

test('external references are neutralized, same-document fragments survive', () => {
  const result = sanitizeSvg(
    `${ROOT}<a xlink:href="https://evil.example/x"><rect width="1" height="1"/></a>`
    + '<use href="#local"/><image href="data:image/png;base64,AAAA"/></svg>',
  )
  assert.ok(!result.svg.includes('evil.example'))
  assert.ok(result.svg.includes('href="#local"'))
  assert.ok(result.svg.includes('data:image/png;base64,AAAA'))
  assert.ok(result.removed.includes('an external reference'))
})

test('remote paint servers are replaced with none', () => {
  const result = sanitizeSvg(`${ROOT}<rect width="20" height="10" fill="url(https://evil.example/p.svg#g)"/>`
    + '<rect width="1" height="1" fill="url(#local)"/></svg>')
  assert.ok(!result.svg.includes('evil.example'))
  assert.ok(result.svg.includes('fill="none"'))
  assert.ok(result.svg.includes('fill="url(#local)"'))
  assert.ok(result.removed.includes('an external paint reference'))
})

test('unsafe inline styles are dropped, harmless ones survive', () => {
  const result = sanitizeSvg(`${ROOT}<rect width="1" height="1" style="background:url(http://evil/x)"/>`
    + '<rect width="1" height="1" style="fill:#ff0000"/></svg>')
  assert.ok(!result.svg.includes('evil'))
  assert.ok(result.svg.includes('style="fill:#ff0000"'))
})

test('size comes from width/height, then from the viewBox, and is refused without either', () => {
  assert.deepEqual(
    { width: sanitizeSvg(ROOT).width, height: sanitizeSvg(ROOT).height },
    { width: 20, height: 10 },
  )
  const viewBoxOnly = sanitizeSvg('<svg viewBox="0 0 123 45"><rect width="1" height="1"/></svg>')
  assert.deepEqual({ width: viewBoxOnly.width, height: viewBoxOnly.height }, { width: 123, height: 45 })
  assert.ok(viewBoxOnly.svg.includes('xmlns="http://www.w3.org/2000/svg"'))
  assert.throws(() => sanitizeSvg('<svg><rect width="1" height="1"/></svg>'), /must declare width\/height or a viewBox/)
  assert.throws(() => sanitizeSvg('<div>not svg</div>'), /does not contain an <svg> root/)
})
