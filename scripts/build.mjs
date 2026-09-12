/**
 * Build the one runtime artifact this plugin ships.
 *
 * `lib/index.js` is the Host half: plain ESM for Node, loaded by the Harness
 * Cordis loader from the package's `main`/`exports` path.
 *
 * Two runtime dependencies stay EXTERNAL and are resolved from the package's
 * own `node_modules` at run time:
 *
 *   - `mathjax-full`     — pure JS, TeX → SVG. Imported lazily on first use so
 *                          booting the plugin stays cheap.
 *   - `@resvg/resvg-js`  — optional native rasterizer. Imported lazily so a
 *                          platform without a prebuilt binding loses PNG
 *                          output instead of failing the whole plugin.
 *
 * Everything else is inlined, so the Host module has no other runtime module
 * request. Nothing in the bundle imports a `@deepseek-ai/*` package: this
 * plugin registers through the structural `ctx.tools.register` contract, so a
 * second copy of the Harness registry is never created.
 */
import { build } from 'esbuild'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Package name; also the identity every artifact and row must agree on. */
const ID = '@jaxzhou/dsh-mathmatic-symbol'

const EXTERNAL = ['mathjax-full', 'mathjax-full/*', '@resvg/resvg-js']

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

await mkdir(resolve(root, 'lib'), { recursive: true })

await build({
  absWorkingDir: root,
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  external: EXTERNAL,
  logLevel: 'info',
  banner: {
    js: `/**\n * ${ID} — generated Host bundle. Do not edit; run \`npm run build\`.\n */`,
  },
})

/**
 * Fail the build when the artifact lost a shape the Harness loader or this
 * plugin's own lazy-loading contract requires.
 */
async function verify() {
  const host = await readFile(resolve(root, 'lib/index.js'), 'utf8')
  const problems = []
  if (!/\bexport\s*\{/.test(host)) problems.push('bundle exports nothing')
  if (!/export\s*\{[^}]*\bapply\b/.test(host)) problems.push('bundle does not export apply')
  if (!/export\s*\{[^}]*\bname\b/.test(host)) problems.push('bundle does not export name')
  if (!host.includes('inject')) problems.push('bundle does not declare inject')
  if (!host.includes('"mathjax-full/js/mathjax.js"') && !host.includes("'mathjax-full/js/mathjax.js'")) {
    problems.push('lazy mathjax import missing')
  }
  if (!/import\(\s*["']@resvg\/resvg-js["']\s*\)/.test(host)) {
    problems.push('lazy @resvg/resvg-js dynamic import missing')
  }
  if (/^import[^\n]*@resvg\/resvg-js/m.test(host)) {
    problems.push('@resvg/resvg-js must not be imported eagerly')
  }
  if (/@deepseek-ai\//.test(host)) {
    problems.push('bundle imports a @deepseek-ai package; the Host contract is structural')
  }
  if (problems.length > 0) throw new Error(`build verification failed: ${problems.join(', ')}`)
  console.log(`[${ID}] built lib/index.js (${(host.length / 1024).toFixed(1)} KiB)`)
}

await verify()
