import assert from 'node:assert/strict'
import { readdir, mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { apply, inject, name } from '../lib/index.js'
import { assertSupportedSchema, assertValueMatches } from './helpers/schema.mjs'

/** One fake Cordis context: a tool map, optional services, and effect disposal. */
function createHost(services = {}) {
  const tools = new Map()
  const disposers = []
  const effects = []
  const ctx = {
    tools: {
      register(definition) {
        if (tools.has(definition.name)) throw new Error(`duplicate tool ${definition.name}`)
        tools.set(definition.name, definition)
        const dispose = () => tools.delete(definition.name)
        disposers.push(dispose)
        return dispose
      },
    },
    get(serviceName) {
      return services[serviceName]
    },
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') effects.push(dispose)
      return () => {}
    },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  }
  return { ctx, tools, disposers, effects }
}

const workspace = await mkdtemp(path.join(tmpdir(), 'dsh-math-contract-'))
const exec = { signal: new AbortController().signal, agent: { session: { header: { cwd: workspace } } } }

function mount(config) {
  const host = createHost()
  apply(host.ctx, config)
  return host
}

test('the artifact exports the Host module shape the loader needs', () => {
  assert.equal(name, 'math-symbol')
  assert.deepEqual(inject, ['tools'])
  assert.equal(typeof apply, 'function')
})

test('apply registers exactly the three math tools with supported schemas', () => {
  const { tools } = mount({})
  assert.deepEqual([...tools.keys()].sort(), ['math_convert', 'math_figure', 'math_formula'])
  for (const tool of tools.values()) {
    assert.equal(typeof tool.description, 'string')
    assert.ok(tool.description.length > 40)
    assert.equal(tool.parameters.type, 'object')
    assert.equal(tool.parameters.additionalProperties, false)
    for (const required of tool.parameters.required ?? []) {
      assert.ok(Object.hasOwn(tool.parameters.properties, required), `${tool.name}: required ${required} must be declared`)
    }
    for (const [property, schema] of Object.entries(tool.parameters.properties)) {
      assertSupportedSchema(schema, `${tool.name}.parameters.${property}`)
    }
    assertSupportedSchema(tool.output.schema, `${tool.name}.output.schema`)
    assert.equal(typeof tool.output.render, 'function')
    assert.equal(typeof tool.execute, 'function')
    assert.equal(typeof tool.finalizeContent, 'function')
  }
})

test('unloading the plugin removes every registration', () => {
  const { ctx, tools, disposers, effects } = mount({})
  assert.equal(tools.size, 3)
  for (const dispose of disposers) dispose()
  for (const effect of effects) effect()
  assert.equal(tools.size, 0)
})

test('math_formula writes both images and returns an embed-ready value', async () => {
  const { tools } = mount({})
  const tool = tools.get('math_formula')
  const value = await tool.execute({ latex: '\\frac{a}{b} = \\sqrt{c}', scale: 2 }, exec)
  assertValueMatches(tool.output.schema, value)

  assert.equal(value.kind, 'formula')
  assert.equal(value.display, true)
  assert.match(value.svg_path, /^math\/formula-[0-9a-f]{12}\.svg$/)
  assert.match(value.png_path, /^math\/formula-[0-9a-f]{12}\.png$/)
  assert.equal(value.svg_bytes, (await stat(path.join(workspace, value.svg_path))).size)
  assert.equal(value.png_bytes, (await stat(path.join(workspace, value.png_path))).size)
  assert.equal(value.pixel_width, value.width * 2)
  assert.equal(value.scale, 2)

  const svg = await readFile(path.join(workspace, value.svg_path), 'utf8')
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'))
  const png = await readFile(path.join(workspace, value.png_path))
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47])

  assert.equal(value.embed.markdown_svg, `![\\frac{a}{b} = \\sqrt{c}](${value.svg_path})`)
  assert.ok(value.embed.markdown_png.includes(value.png_path))
  assert.ok(value.embed.html_svg.startsWith('<img src="math/formula-'))
  assert.ok(value.embed.latex_png.startsWith('\\includegraphics[width='))
  assert.equal(value.data_uri_svg, null)
  assert.equal(value.data_uri_png, null)
  assert.equal(value.previewed, false)
})

test('rendered text is the model-facing projection of the same value', async () => {
  const { tools } = mount({})
  const tool = tools.get('math_formula')
  const value = await tool.execute({ latex: 'x^2', format: 'svg' }, exec)
  const blocks = tool.output.render({ latex: 'x^2' }, value)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].type, 'text')
  assert.match(blocks[0].text, /^<math kind="formula" display="true"/)
  assert.ok(blocks[0].text.includes(value.svg_path))
  assert.ok(blocks[0].text.endsWith('</math>'))
})

test('identical input is content-addressed to the same file', async () => {
  const { tools } = mount({})
  const tool = tools.get('math_formula')
  const first = await tool.execute({ latex: 'e^{i\\pi} + 1 = 0' }, exec)
  const second = await tool.execute({ latex: 'e^{i\\pi} + 1 = 0' }, exec)
  assert.equal(first.svg_path, second.svg_path)
  assert.equal(first.png_path, second.png_path)
})

test('name, format, directory paths, and data URIs are honored', async () => {
  const { tools } = mount({})
  const tool = tools.get('math_formula')
  const named = await tool.execute({ latex: 'a^2+b^2=c^2', name: 'Pythagoras!', format: 'svg' }, exec)
  assert.equal(named.svg_path, 'math/Pythagoras.svg')
  assert.equal(named.png_path, null)
  assert.equal(named.png_bytes, 0)
  assert.equal(named.embed.markdown_png, '')
  assert.equal(named.embed.latex_png, '')

  const placed = await tool.execute({ latex: 'y = mx + b', path: 'assets/diagrams', format: 'both' }, exec)
  assert.match(placed.svg_path, /^assets\/diagrams\/formula-[0-9a-f]{12}\.svg$/)

  const inlined = await tool.execute({ latex: 'z', data_uri: true, format: 'both' }, exec)
  assert.ok(inlined.data_uri_svg.startsWith('data:image/svg+xml;base64,'))
  assert.ok(inlined.data_uri_png.startsWith('data:image/png;base64,'))
  const decoded = Buffer.from(inlined.data_uri_png.split(',')[1], 'base64')
  assert.deepEqual([...decoded.subarray(1, 4)], [0x50, 0x4e, 0x47])
})

test('paths cannot escape the session workspace', async () => {
  const { tools } = mount({})
  const tool = tools.get('math_formula')
  await assert.rejects(tool.execute({ latex: 'x', path: '../escape.svg' }, exec), /outside the session workspace/)
  await assert.rejects(tool.execute({ latex: 'x', path: '/tmp/absolute-escape.svg' }, exec), /outside the session workspace/)
})

test('unknown and malformed arguments fail loudly', async () => {
  const { tools } = mount({})
  const tool = tools.get('math_formula')
  await assert.rejects(tool.execute({ latex: 'x', colour: 'red' }, exec), /unknown argument\(s\) "colour"/)
  await assert.rejects(tool.execute({}, exec), /"latex" must be a non-empty string/)
  await assert.rejects(tool.execute({ latex: 'x', format: 'jpeg' }, exec), /"format" must be one of/)
  await assert.rejects(tool.execute({ latex: 'x', scale: 999 }, exec), /"scale" must be between/)
  await assert.rejects(tool.execute({ latex: 'x', background: 'url(http://evil)' }, exec), /"background" must be "transparent" or a flat CSS color/)
})

test('embed snippets place the PNG at the 1× display size, not the raster size', async () => {
  const { tools } = mount({})
  const value = await tools.get('math_formula').execute({ latex: 'x', scale: 4 }, exec)
  assert.equal(value.pixel_width, value.width * 4)
  assert.ok(value.embed.html_png.includes(`width="${value.width}" height="${value.height}"`), value.embed.html_png)
  assert.ok(value.embed.html_svg.includes(`width="${value.width}" height="${value.height}"`))
  const centimeters = ((value.width / 96) * 2.54).toFixed(2)
  assert.ok(value.embed.latex_png.includes(`width=${centimeters}cm`), value.embed.latex_png)
  assert.ok(value.embed.latex_svg.includes(`width=${centimeters}cm`))
})

test('an unavailable inline preview degrades to a warning, never an error', async () => {
  const { tools } = mount({})
  const value = await tools.get('math_formula').execute({ latex: 'q', preview: true }, exec)
  assert.equal(value.previewed, false)
  assert.ok(value.warnings.some(warning => /inline preview unavailable/.test(warning)))
})

test('the figure tool writes a figure and reports generator warnings', async () => {
  const { tools } = mount({})
  const tool = tools.get('math_figure')
  const value = await tool.execute({
    figure: {
      width: 240,
      height: 240,
      xRange: [-1, 4],
      yRange: [-1, 4],
      elements: [
        { type: 'point', at: [0, 0], label: 'A' },
        { type: 'point', at: [3, 0], label: 'B' },
        { type: 'circle', center: 'A', through: 'B' },
        { type: 'angle', at: 'A', from: 'B', to: [0, 3], label: '\\alpha' },
      ],
    },
  }, exec)
  assertValueMatches(tool.output.schema, value)
  assert.equal(value.kind, 'figure')
  assert.equal(value.display, false)
  assert.match(value.svg_path, /^math\/figure-[0-9a-f]{12}\.svg$/)
  assert.equal(value.width, 240)
  assert.equal(value.height, 240)
  assert.ok(value.source.startsWith('{"width":240'))

  await assert.rejects(tool.execute({ figure: { elements: [{ type: 'nope' }] } }, exec), /not a known element type/)
  await assert.rejects(tool.execute({ figure: 'not an object' }, exec), /"figure" must be a JSON object/)
})

test('math_convert handles inline SVG, LaTeX, and PNG passthrough', async () => {
  const { tools } = mount({})
  const tool = tools.get('math_convert')

  const svgSource = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" onload="x()"><script>bad()</script><rect width="40" height="20" fill="#0369a1"/></svg>'
  const converted = await tool.execute({ source: { svg: svgSource }, scale: 2, format: 'both' }, exec)
  assertValueMatches(tool.output.schema, converted)
  assert.match(converted.svg_path, /^math\/image-[0-9a-f]{12}\.svg$/)
  assert.deepEqual({ width: converted.pixel_width, height: converted.pixel_height }, { width: 80, height: 40 })
  assert.ok(converted.warnings.some(warning => /removed <script>/.test(warning)))
  assert.ok(converted.warnings.some(warning => /removed an event handler/.test(warning)))
  const written = await readFile(path.join(workspace, converted.svg_path), 'utf8')
  assert.ok(!written.includes('<script'))

  const fromLatex = await tool.execute({ source: { latex: '$$\\alpha$$' }, format: 'svg' }, exec)
  assert.equal(fromLatex.source, '\\alpha')

  const pngSource = await tool.execute({ source: { path: converted.png_path } }, exec)
  assert.equal(pngSource.kind, 'image')
  assert.equal(pngSource.png_path, converted.png_path)
  assert.equal(pngSource.svg_path, null)
  assert.ok(pngSource.embed.markdown_png.includes(converted.png_path))

  // An SVG file is re-emitted next to itself unless another path is given.
  const fromFile = await tool.execute({ source: { path: converted.svg_path }, format: 'svg' }, exec)
  assert.equal(fromFile.svg_path, converted.svg_path)

  await assert.rejects(tool.execute({ source: {} }, exec), /exactly one of "latex", "svg", or "path"/)
  await assert.rejects(tool.execute({ source: { latex: 'x', svg: '<svg/>' } }, exec), /exactly one of "latex", "svg", or "path"/)
  await assert.rejects(tool.execute({ source: { path: 'math/missing.svg' } }, exec), /ENOENT|no such file/)
  await assert.rejects(tool.execute({ source: { path: 'math/notes.txt' } }, exec), /must end in \.svg or \.png/)
})

test('the default output directory is configurable and still workspace-confined', async () => {
  const { tools } = mount({ outputDir: 'generated/math', scale: 2, color: '#334155' })
  const value = await tools.get('math_formula').execute({ latex: 'a' }, exec)
  assert.match(value.svg_path, /^generated\/math\/formula-[0-9a-f]{12}\.svg$/)
  const listing = await readdir(path.join(workspace, 'generated', 'math'))
  assert.equal(listing.length, 2)
})

test('invalid configuration fails at mount time', () => {
  assert.throws(() => mount({ outputDir: '../escape' }), /workspace-relative directory/)
  assert.throws(() => mount({ scale: 99 }), /"scale" must be between/)
  assert.throws(() => mount({ color: 'url(http://evil)' }), /"color" must be a flat CSS color/)
  assert.throws(() => mount({ preview: 'yes' }), /"preview" must be a boolean/)
  assert.throws(() => mount('nope'), /expected an object/)
})
