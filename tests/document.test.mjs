import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { apply, assembleDocument, mathToolGuidance, scanDocument } from '../lib/index.js'
import { createHost, createSystemPrompt } from './helpers/host.mjs'
import { assertPromptSafe, assertToolsPromptSafe } from './helpers/prompt.mjs'
import { assertSupportedSchema, assertValueMatches } from './helpers/schema.mjs'

// ---------------------------------------------------------------- scanning

test('scanDocument splits text, math, and figure tokens', () => {
  const segments = scanDocument('Area $A=\\pi r^2$ of\n\n$$\\int_0^1 x\\,dx$$\n\n[[figure:triangle]] done')
  assert.deepEqual(segments.map(segment => segment.kind), ['text', 'math', 'text', 'math', 'text', 'figure', 'text'])
  assert.deepEqual(segments[1], { kind: 'math', index: 0, tex: 'A=\\pi r^2', display: false })
  assert.deepEqual(segments[3], { kind: 'math', index: 1, tex: '\\int_0^1 x\\,dx', display: true })
  assert.deepEqual(segments[5], { kind: 'figure', index: 2, name: 'triangle' })
})

test('scanDocument leaves prose dollars, unterminated math, and bad tokens alone', () => {
  const segments = scanDocument('Costs $5 and $10 (see $x and [[figure:bad name]]).')
  assert.equal(segments.length, 1)
  assert.equal(segments[0].kind, 'text')
  assert.ok(segments[0].text.includes('$5 and $10'))
  assert.ok(segments[0].text.includes('$x'))
  assert.ok(segments[0].text.includes('[[figure:bad name]]'))
})

test('scanDocument preserves an escaped dollar verbatim', () => {
  const segments = scanDocument('price \\$9 and $x$')
  assert.equal(segments[0].text, 'price \\$9 and ')
  assert.deepEqual(segments[1], { kind: 'math', index: 0, tex: 'x', display: false })
})

test('the legacy double-brace placeholder still resolves, for 0.1.1 bodies', () => {
  const segments = scanDocument('see {{figure:triangle}} and [[figure:square]]')
  assert.deepEqual(segments.map(segment => segment.kind), ['text', 'figure', 'text', 'figure'])
  assert.deepEqual(segments[1], { kind: 'figure', index: 0, name: 'triangle' })
  assert.deepEqual(segments[3], { kind: 'figure', index: 1, name: 'square' })
})

test('inline math never spans a line break', () => {
  const segments = scanDocument('a $b\nc$ d')
  assert.equal(segments.length, 1)
  assert.equal(segments[0].text, 'a $b\nc$ d')
})

// --------------------------------------------------------------- assembly

const mathSegments = scanDocument('Before $$x^2$$ and $y$ after. [[figure:plot]]')
const placements = new Map([
  [0, { reference: 'assets/f.svg', width: 100, height: 40, depthPx: 0, alt: 'x^2', variant: 'svg' }],
  [1, { reference: 'assets/g.svg', width: 20, height: 16, depthPx: 4, alt: 'y', variant: 'svg' }],
  [2, { reference: 'assets/plot.svg', width: 300, height: 200, depthPx: 0, alt: 'plot', variant: 'svg' }],
])

test('display and inline math become images in the syntax of each format', () => {
  const markdown = assembleDocument({ format: 'markdown', segments: mathSegments, math: 'image', placements }).text
  assert.ok(markdown.includes('![x^2](assets/f.svg)'))
  assert.ok(markdown.includes('![y](assets/g.svg)'))
  assert.ok(markdown.includes('![plot](assets/plot.svg)'))

  const html = assembleDocument({ format: 'html', segments: mathSegments, math: 'image', placements }).text
  assert.ok(html.startsWith('<!DOCTYPE html>'))
  assert.ok(html.includes('<p style="text-align:center"><img src="assets/f.svg" width="100" height="40"'))
  assert.ok(html.includes('style="vertical-align:-4px"'), 'inline math is baseline-aligned')
  assert.ok(html.includes('<title>Document</title>'))
  assert.ok(!html.includes('cdn.jsdelivr.net'), 'image math needs no MathJax bootstrap')

  const latex = assembleDocument({ format: 'latex', segments: mathSegments, math: 'image', placements }).text
  assert.ok(latex.includes('\\documentclass[11pt]{article}'))
  assert.ok(latex.includes('\\usepackage{graphicx}'))
  assert.ok(latex.includes('\\begin{center}\n\\includegraphics[width=2.65cm]{assets/f.svg}\n\\end{center}'))
  assert.ok(latex.includes('\\raisebox{-3.00pt}{\\includegraphics[width=0.53cm]{assets/g.svg}}'))
  assert.ok(latex.endsWith('\\end{document}\n'))
})

test('native math stays markup, and HTML gains a MathJax bootstrap', () => {
  const html = assembleDocument({ format: 'html', segments: mathSegments, math: 'native', placements }).text
  assert.ok(html.includes('$$x^2$$'))
  assert.ok(html.includes('$y$'))
  assert.ok(html.includes('cdn.jsdelivr.net/npm/mathjax@3'))
  assert.ok(!html.includes('<img src="assets/f.svg"'))

  const quiet = assembleDocument({ format: 'html', segments: mathSegments, math: 'native', placements, mathjax: false }).text
  assert.ok(!quiet.includes('cdn.jsdelivr.net'))

  // A document without math needs no bootstrap even in native mode.
  const plain = assembleDocument({
    format: 'html',
    segments: scanDocument('just [[figure:plot]]'),
    math: 'native',
    placements: new Map([[0, placements.get(2)]]),
  }).text
  assert.ok(!plain.includes('cdn.jsdelivr.net'))
})

test('titles are placed per format', () => {
  const markdown = assembleDocument({ format: 'markdown', segments: scanDocument('Body'), math: 'native', placements: new Map(), title: 'Report' }).text
  assert.ok(markdown.startsWith('# Report\n\nBody'))
  const withHeading = assembleDocument({ format: 'markdown', segments: scanDocument('# Own\n\nBody'), math: 'native', placements: new Map(), title: 'Report' }).text
  assert.ok(withHeading.startsWith('# Own'), 'an existing heading wins')
  const latex = assembleDocument({ format: 'latex', segments: scanDocument('Body'), math: 'native', placements: new Map(), title: 'Report' }).text
  assert.ok(latex.includes('\\section*{Report}'))
})

test('HTML unescapes a literal dollar; Markdown and LaTeX keep the escape', () => {
  const segments = scanDocument('costs \\$9')
  assert.ok(assembleDocument({ format: 'html', segments, math: 'native', placements: new Map() }).text.includes('costs $9'))
  assert.ok(assembleDocument({ format: 'markdown', segments, math: 'native', placements: new Map() }).text.includes('costs \\$9'))
})

test('a missing placement is an assembly error, never a silent gap', () => {
  assert.throws(
    () => assembleDocument({ format: 'markdown', segments: mathSegments, math: 'image', placements: new Map() }),
    /no image was produced for segment 0/,
  )
})

// ------------------------------------------------------------ the tool

function mount(config) {
  const host = createHost()
  apply(host.ctx, config)
  return host
}

/** Every document test gets its own workspace, so asset listings are exact. */
async function freshMount(config) {
  const workspace = await mkdtemp(path.join(tmpdir(), 'dsh-math-doc-'))
  const exec = { signal: new AbortController().signal, agent: { session: { header: { cwd: workspace } } } }
  return { ...mount(config), workspace, exec }
}

const TRIANGLE = {
  width: 240,
  height: 200,
  xRange: [-1, 4],
  yRange: [-1, 3],
  title: '\\text{Right triangle}',
  elements: [
    { type: 'polygon', points: [[0, 0], [3, 0], [0, 2]] },
    { type: 'point', at: [0, 0], label: 'A' },
    { type: 'point', at: [3, 0], label: 'B' },
    { type: 'point', at: [0, 2], label: 'C' },
    { type: 'angle', at: [0, 0], from: [3, 0], to: [0, 2], right: true },
  ],
}

test('math_document writes Markdown with images referenced relative to the document', async () => {
  const { tools, exec, workspace } = await freshMount({})
  const tool = tools.get('math_document')
  const value = await tool.execute({
    path: 'docs/report.md',
    body: '# Area\n\nThe area is $A=\\pi r^2$.\n\n$$A = \\int_0^1 2\\pi r\\,dr$$\n\n[[figure:triangle]]\n',
    math: 'image',
    figures: { triangle: TRIANGLE },
  }, exec)
  assertValueMatches(tool.output.schema, value)
  assertSupportedSchema(tool.output.schema)

  assert.equal(value.kind, 'document')
  assert.equal(value.format, 'markdown')
  assert.equal(value.doc_path, 'docs/report.md')
  assert.equal(value.assets_dir, 'docs/report-assets')
  assert.equal(value.images.length, 3)
  assert.deepEqual(value.images.map(image => image.kind), ['formula', 'formula', 'figure'])
  assert.equal(value.images[0].variant, 'svg')
  assert.ok(value.images[0].svg_path.startsWith('docs/report-assets/formula-'))
  assert.ok(value.images[2].svg_path.startsWith('docs/report-assets/triangle-'))

  const document = await readFile(path.join(workspace, 'docs/report.md'), 'utf8')
  assert.ok(document.startsWith('# Area'))
  // References are relative to docs/, not to the workspace root.
  assert.ok(document.includes(`![A=\\pi r^2](report-assets/formula-`), document)
  assert.ok(document.includes('](report-assets/formula-'))
  assert.ok(document.includes('![\\text{Right triangle}](report-assets/triangle-'))
  assert.equal(value.doc_bytes, (await stat(path.join(workspace, 'docs/report.md'))).size)

  const assets = await readdir(path.join(workspace, 'docs/report-assets'))
  assert.equal(assets.length, 6, 'three images × svg+png')
  assert.ok((await stat(path.join(workspace, value.images[0].png_path))).size > 0)
  assert.match(tool.output.render({}, value)[0].text, /^<document format="markdown" path="docs\/report\.md"/)
})

test('math_document writes LaTeX with PNG images and a baseline-raised inline formula', async () => {
  const { tools, exec, workspace } = await freshMount({})
  const value = await tools.get('math_document').execute({
    path: 'paper.tex',
    body: 'The identity $e^{i\\pi}+1=0$ holds.\n\n[[figure:triangle]]',
    format: 'latex',
    math: 'image',
    figures: { triangle: TRIANGLE },
  }, exec)

  assert.equal(value.doc_path, 'paper.tex')
  assert.ok(value.images.every(image => image.variant === 'png'))
  const document = await readFile(path.join(workspace, 'paper.tex'), 'utf8')
  assert.ok(document.includes('\\usepackage{graphicx}'))
  assert.ok(document.includes('\\raisebox{'), 'inline math is raised by its depth')
  assert.ok(document.includes('\\includegraphics[width='))
  assert.ok(!document.includes('.svg'), 'LaTeX never references SVG')
})

test('LaTeX output refuses an SVG-only image format', async () => {
  const { tools, exec } = await freshMount({})
  await assert.rejects(
    tools.get('math_document').execute({ path: 'a.tex', body: '$x$', format: 'latex', image_format: 'svg', math: 'image' }, exec),
    /LaTeX documents embed raster images; use image_format "png" or "both"/,
  )
})

test('self_contained inlines data URIs and writes no asset files', async () => {
  const { tools, exec, workspace } = await freshMount({})
  const value = await tools.get('math_document').execute({
    path: 'docs/standalone.html',
    body: '<h1>Proof</h1><p>Since $a^2+b^2=c^2$ …</p>[[figure:triangle]]',
    format: 'html',
    math: 'image',
    self_contained: true,
    figures: { triangle: TRIANGLE },
  }, exec)

  assert.equal(value.self_contained, true)
  assert.equal(value.assets_dir, null)
  assert.ok(value.images.every(image => image.svg_path === null && image.png_path === null))
  const document = await readFile(path.join(workspace, 'docs/standalone.html'), 'utf8')
  assert.ok(document.includes('src="data:image/svg+xml;base64,'))
  assert.ok(!document.includes('report-assets'))
  assert.deepEqual(await readdir(path.join(workspace, 'docs')), ['standalone.html'])
})

test('self_contained is refused for LaTeX', async () => {
  const { tools, exec } = await freshMount({})
  await assert.rejects(
    tools.get('math_document').execute({ path: 'a.tex', body: '$x$', format: 'latex', self_contained: true }, exec),
    /self_contained is not available for LaTeX output/,
  )
})

test('native math renders no images and keeps the formulas as markup', async () => {
  const { tools, exec, workspace } = await freshMount({})
  const value = await tools.get('math_document').execute({
    path: 'notes.md',
    body: 'Euler: $e^{i\\pi}+1=0$\n\n[[figure:triangle]]',
    figures: { triangle: TRIANGLE },
  }, exec)
  assert.equal(value.math, 'native')
  assert.equal(value.images.length, 1, 'only the figure becomes an image')
  const document = await readFile(path.join(workspace, 'notes.md'), 'utf8')
  assert.ok(document.includes('$e^{i\\pi}+1=0$'))
  assert.ok(document.includes('![\\text{Right triangle}]('))
})

test('unused figures warn, unknown placeholders fail', async () => {
  const { tools, exec } = await freshMount({})
  const unused = await tools.get('math_document').execute({
    path: 'unused.md',
    body: 'no figures here',
    figures: { triangle: TRIANGLE },
  }, exec)
  assert.ok(unused.warnings.some(warning => /"triangle" was provided but never referenced/.test(warning)))

  await assert.rejects(
    tools.get('math_document').execute({ path: 'bad.md', body: '[[figure:missing]]', figures: { triangle: TRIANGLE } }, exec),
    /\[\[figure:missing\]\] has no spec in "figures"; provided: triangle/,
  )
})

test('math_document validates its arguments', async () => {
  const { tools, exec } = await freshMount({})
  const tool = tools.get('math_document')
  await assert.rejects(tool.execute({ body: 'x' }, exec), /"path" must be a non-empty/)
  await assert.rejects(tool.execute({ path: 'a.md' }, exec), /"body" must be a non-empty string/)
  await assert.rejects(tool.execute({ path: 'a.md', body: 'x', format: 'docx' }, exec), /"format" must be one of/)
  await assert.rejects(tool.execute({ path: 'a.md', body: 'x', math: 'maybe' }, exec), /"math" must be one of/)
  await assert.rejects(tool.execute({ path: 'a.tex', body: 'x' }, exec), /different document extension/)
  await assert.rejects(tool.execute({ path: 'a.md', body: 'x', figures: [] }, exec), /"figures" must be an object/)
  await assert.rejects(tool.execute({ path: 'a.md', body: 'x', extra: 1 }, exec), /unknown argument\(s\) "extra"/)
  await assert.rejects(tool.execute({ path: '../escape.md', body: 'x' }, exec), /outside the session workspace/)
  await assert.rejects(tool.execute({ path: 'a.md', body: 'x', background: 'url(http://evil)' }, exec), /must be "transparent" or a flat CSS color/)
})

// -------------------------------------------------------- prompt steering

test('mathToolGuidance states the trigger, the tools, and the no-hand-rolling rule', () => {
  assert.equal(mathToolGuidance([]), '')
  const guidance = mathToolGuidance(['math_formula', 'math_figure', 'math_convert', 'math_document'])
  assert.ok(guidance.includes('math_formula'))
  assert.ok(guidance.includes('math_figure'))
  assert.ok(guidance.includes('math_document'))
  assert.ok(guidance.includes('do not re-derive paths'))
  assert.ok(guidance.includes('Ordinary chat answers keep using LaTeX text directly'))
  const partial = mathToolGuidance(['math_formula'])
  assert.ok(partial.includes('math_formula'))
  assert.ok(!partial.includes('math_figure'))
})

test('no prompt-facing text contains a double-braced group', () => {
  const systemPrompt = createSystemPrompt({ TOOL_REPORT: 2900 })
  const host = createHost({ systemPrompt })
  apply(host.ctx, {})
  const guidance = systemPrompt.sections[0].text({ scope: undefined })
  assertPromptSafe(guidance, 'guidance')
  assertToolsPromptSafe(host.tools)
  // The document tool's own placeholder must be advertised in the safe spelling.
  assert.ok(guidance.includes('[[figure:name]]'), 'guidance must name the bracket placeholder')
})

test('apply registers four tools and the guidance section', () => {
  const systemPrompt = createSystemPrompt({ TOOL_REPORT: 2900 })
  const host = createHost({ systemPrompt })
  apply(host.ctx, {})
  assert.deepEqual([...host.tools.keys()].sort(), ['math_convert', 'math_document', 'math_figure', 'math_formula'])
  assert.deepEqual(host.injections, [['systemPrompt']])
  assert.equal(systemPrompt.sections.length, 1)
  const section = systemPrompt.sections[0]
  assert.equal(section.name, 'tool:math-symbol')
  assert.equal(section.order, 2900)
  const text = section.text({ scope: undefined })
  assert.ok(text.includes('math_document'))
  // With no tools visible, the guidance collapses instead of naming dead tools.
  const barePrompt = createSystemPrompt()
  const bare = createHost({ systemPrompt: barePrompt })
  apply(bare.ctx, {})
  for (const dispose of bare.disposers) dispose()
  assert.equal(barePrompt.sections[0].text({ scope: undefined }), '')
})
