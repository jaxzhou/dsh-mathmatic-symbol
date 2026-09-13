import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile, readdir, mkdtemp, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'
import { rasterizePng, renderFigure } from '../lib/index.js'

const run = promisify(execFile)
const root = path.resolve(import.meta.dirname, '..')

async function exampleFiles() {
  const files = (await readdir(path.join(root, 'examples'))).filter(file => file.endsWith('.json')).sort()
  return files
}

test('every example spec is valid JSON and renders warning-free', async () => {
  const files = await exampleFiles()
  assert.ok(files.length >= 4, `expected at least 4 example specs, found ${files.length}`)
  for (const file of files) {
    const spec = JSON.parse(await readFile(path.join(root, 'examples', file), 'utf8'))
    const figure = await renderFigure(spec)
    assert.deepEqual(figure.warnings, [], `${file} produced warnings`)
    assert.ok(figure.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), `${file} did not produce a standalone SVG`)
    assert.ok(figure.svg.length > 500, `${file} produced a suspiciously small SVG`)
    assert.ok(figure.width >= 40 && figure.height >= 40, `${file} produced an unusable canvas`)
  }
})

test('every example spec rasterizes to a PNG of the expected size', async () => {
  for (const file of await exampleFiles()) {
    const spec = JSON.parse(await readFile(path.join(root, 'examples', file), 'utf8'))
    const figure = await renderFigure(spec)
    const raster = await rasterizePng(figure.svg, { scale: 2 })
    assert.deepEqual(
      { width: raster.width, height: raster.height },
      { width: figure.width * 2, height: figure.height * 2 },
      `${file} rasterized to the wrong size`,
    )
  }
})

test('the documented render-example command works for a source checkout', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'dsh-math-example-'))
  const { stdout } = await run(process.execPath, [
    path.join(root, 'scripts', 'render-example.mjs'),
    'examples/function-plot.json',
    outDir,
    '--scale=2',
  ], { cwd: root })
  assert.match(stdout, /function-plot\.svg\s+480x300/)
  assert.match(stdout, /function-plot\.png\s+960x600/)
  assert.ok(!stdout.includes('warning:'), `unexpected warnings: ${stdout}`)
  assert.ok((await stat(path.join(outDir, 'function-plot.svg'))).size > 500)
  assert.ok((await stat(path.join(outDir, 'function-plot.png'))).size > 500)
})

test('media/demo.png and media/demo.svg are exactly what examples/unit-circle.json renders', async () => {
  const spec = JSON.parse(await readFile(path.join(root, 'examples', 'unit-circle.json'), 'utf8'))
  const figure = await renderFigure(spec, { idSeed: 'demo' })
  const raster = await rasterizePng(figure.svg, { scale: 2, background: '#ffffff' })
  assert.equal(await readFile(path.join(root, 'media', 'demo.svg'), 'utf8'), figure.svg, 'media/demo.svg is stale')
  assert.ok(
    (await readFile(path.join(root, 'media', 'demo.png'))).equals(Buffer.from(raster.data)),
    'media/demo.png is stale; re-render examples/unit-circle.json',
  )
})

test('the render-example command refuses a bad spec and a bad scale', async () => {
  await assert.rejects(
    run(process.execPath, [path.join(root, 'scripts', 'render-example.mjs'), 'package.json', '--scale=2'], { cwd: root }),
    error => {
      assert.match(String(error.stderr), /render-example: figure spec/)
      return true
    },
  )
  await assert.rejects(
    run(process.execPath, [path.join(root, 'scripts', 'render-example.mjs'), 'examples/triangle.json', '--scale=99'], { cwd: root }),
    error => {
      assert.match(String(error.stderr), /--scale must be a number between 0 and 16/)
      return true
    },
  )
})

test('both READMEs embed the session recording, and the media stays sane', async () => {
  const gif = await stat(path.join(root, 'media', 'demo.gif'))
  const mp4 = await stat(path.join(root, 'media', 'demo.mp4'))
  assert.ok(gif.size > 100_000 && gif.size < 12 * 1024 * 1024, `media/demo.gif is ${gif.size} bytes`)
  assert.ok(mp4.size > 100_000 && mp4.size < 40 * 1024 * 1024, `media/demo.mp4 is ${mp4.size} bytes`)
  for (const file of ['README.md', 'README.zh.md']) {
    const text = await readFile(path.join(root, file), 'utf8')
    assert.ok(text.includes('](media/demo.gif)'), `${file} does not embed the animated demo`)
    assert.ok(text.includes('(media/demo.mp4)'), `${file} does not link the full-quality video`)
  }
})

test('both READMEs point at the examples, the demo, and the published name', async () => {
  for (const file of ['README.md', 'README.zh.md']) {
    const text = await readFile(path.join(root, file), 'utf8')
    assert.ok(text.includes('examples/triangle.json'), `${file} does not reference the example specs`)
    assert.ok(text.includes('media/demo.png'), `${file} does not show the demo image`)
    assert.ok(text.includes('@jaxzhou/dsh-mathmatic-symbol'), `${file} does not name the package`)
    assert.ok(text.includes('dsh plugin --profile web add'), `${file} omits the install command`)
    assert.ok(text.includes('jaxzhou-mathmatic-symbol'), `${file} omits the row id used to disable the plugin`)
  }
})
