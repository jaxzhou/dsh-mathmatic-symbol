# Contributing

`@jaxzhou/dsh-mathmatic-symbol` is a Host-side DeepSeek Harness plugin. Read
[AGENTS.md](AGENTS.md) first; it states the rules that keep this plugin inside
the Harness contract.

## Commands

```sh
npm install
npm run check      # typecheck -> build -> test  (do this before every commit)
npm run typecheck  # tsc --noEmit
npm run build      # esbuild -> lib/index.js + lib/index.js.map
npm test           # node --test tests/*.test.mjs
```

`lib/` is committed output. Change `src/`, run `npm run build`, and commit the
resulting `lib/` files in the same commit.

## Repository layout

| Path | What it is |
| --- | --- |
| `src/index.ts` | Host entry: `name`, `inject`, `apply`, plus the pure-function surface used by tests |
| `src/dsh.ts` | Structural mirror of the Harness seams this plugin uses (no `@deepseek-ai/*` runtime imports) |
| `examples/` | Figure specs referenced by both READMEs; `tests/examples.test.mjs` renders every one of them |
| `scripts/render-example.mjs` | Renders one example spec to SVG + PNG without booting a profile |
| `src/latex.ts` | MathJax v3 TeX → font-free SVG fragments, standalone SVG, and inline fragments |
| `src/figure.ts` | Figure-spec validation, resolution, and SVG drawing |
| `src/formula.ts` | Shared formula rendering (delimiters + standalone SVG + baseline depth) |
| `src/document.ts` | Document scanning (`$…$`, `$$…$$`, `{{figure:name}}`) and per-format assembly |
| `src/prompt.ts` | The `tool:math-symbol` system-prompt section and its guidance text |
| `src/expr.ts` | Safe arithmetic expression compiler for coordinates and curves |
| `src/raster.ts` | Lazy `@resvg/resvg-js` SVG → PNG |
| `src/sanitize.ts` | SVG sanitizer for the conversion boundary |
| `src/embed.ts` | Markdown/HTML/LaTeX/data-URI snippets |
| `src/output.ts` | Workspace-confined paths, content-addressed names, atomic writes |
| `src/value.ts` | The canonical value type, its supported-subset JSON Schema, and the text projection |
| `src/tools/` | The four tool definitions and their shared publish pipeline |
| `src/tools/document.ts` | Renders a document's formulas/figures, writes them, and inserts them |
| `tests/` | `node:test` suites, including a real end-to-end pass over the emitted files |

## Dependencies

Two runtime dependencies, both declared in `dependencies` and both **external**
in the bundle:

- `mathjax-full` (pinned `^3.2.2`) converts TeX to SVG. It is imported lazily
  on first use. MathJax v4 moved to `@mathjax/src` with a different module
  layout and no `AllPackages`; migrating requires re-validating
  `fontCache: 'none'` output, the excluded-extension list, and the unit/scale
  assumptions in `src/latex.ts`.
- `@resvg/resvg-js` rasterizes SVG to PNG. It is optional in practice: the
  import is lazy and its failure is a typed `RasterUnavailableError` that
  degrades the call to SVG-only output with a warning. System fonts are never
  loaded, which is correct because every glyph this plugin emits is a path.

Everything else is inlined by `scripts/build.mjs`, which also fails the build
if the artifact loses its exported `name`/`apply`/`inject`, stops importing
MathJax lazily, starts importing the rasterizer eagerly, or starts importing a
`@deepseek-ai/*` package.

## Adding a figure element

1. Add the type's allowed keys to `ELEMENT_KEYS` in `src/figure.ts`.
2. Resolve it in `resolveElement` into one of the `Prim` shapes, extending the
   auto-computed bounds for every coordinate you add.
3. Emit it in `emitPrim` (or `emitPolyline`) in pixel space.
4. Add a test in `tests/figure.test.mjs` asserting the emitted geometry, not
   just that rendering succeeded.
5. Document it in the `math_figure` description (`src/tools/figure.ts`) and in
   both READMEs.

## Adding a tool

Register it through `createTool` in `src/tools/shared.ts`. A tool whose result is
not the shared math-image value passes its own `output: { schema, render }`; the
schema must stay inside the Harness's supported subset (`tests/helpers/schema.mjs`
mirrors that enforcement, and `assertSupportedJsonSchema` is the real check). Add
the name to `TOOL_NAMES` in `src/prompt.ts` so the steering section can mention
it, and cover both the value and the guidance in `tests/document.test.mjs`.

## Verifying a change against a real Harness

Unit tests do not prove the plugin mounts. A complete check needs an installed
Harness (verified against `0.1.5-rc.2`):

```sh
# 1. The output schema must satisfy the registry's own enforcement.
node --input-type=module -e "
const h = await import('@deepseek-ai/dsh-tools')
const { apply } = await import('./lib/index.js')
const tools = new Map()
apply({ tools: { register: d => { tools.set(d.name, d); return () => {} } }, get: () => undefined, effect: cb => { cb(); return () => {} } })
for (const t of tools.values()) h.assertSupportedJsonSchema(t.output.schema)
console.log('schemas accepted:', [...tools.keys()].join(', '))
"

# 2. Install into a disposable profile and confirm the layer and row resolve.
dsh --profile mathcheck --from-default-profile headless --dump-config
dsh plugin --profile mathcheck add "$PWD"
dsh --profile mathcheck --dump-config | grep -A 2 jaxzhou-mathmatic-symbol

# 3. Boot the profile: a missing credential must be the only failure, which
#    proves the plugin row mounted before the model call.
dsh --profile mathcheck "render E = mc^2"
```

For the strongest local check, boot a profile whose bundles are
`@deepseek-ai/dsh-base` plus this plugin and read the live registry:

```js
const ctx = await boot('dsh', '<profile>/cordis.yml', patches)
console.log(ctx.get('tools').schemas().filter(s => s.name.startsWith('math_')))
```

That is exactly how tool registration, the output schema, the canonical value,
and `render()` were verified for the initial release.

## Releasing

```sh
npm run check
npm version patch
npm publish            # publishConfig: public on the npm registry
git push --follow-tags
```

The bundle's row id (`jaxzhou-mathmatic-symbol`) and package name
(`@jaxzhou/dsh-mathmatic-symbol`) are runtime identity: do not rename either
without a major version and a note in the README.
