# @jaxzhou/dsh-mathmatic-symbol — contributor notes

## DeepSeek Harness plugin development

Before changing plugin code, read <https://dsh.pub/develop-plugin.md>
completely. Follow the pinned runtime contract and verification boundaries
there; this repository's own rules below remain authoritative.

## What this repository is

A **Host-only** DSH plugin (delivery track: Host). It ships one runtime
artifact — `lib/index.js` — which registers three model-facing tools on the
Harness tool registry. There is no browser half, no `dsh.client` declaration,
and no Remote/service contribution.

## Rules for this repository

- **The extension point is inspected, never guessed.** `ctx.tools.register()`
  and the enforced output-schema subset were read from
  `packages/core/tools/src/{index,json-schema}.ts` at the verified Harness
  version before any code was written. Re-inspect the target version before
  changing registration, the value schema, or the image-content path.
- **No `@deepseek-ai/*` runtime imports.** `src/dsh.ts` is a structural mirror
  of the few seams this plugin uses (`ctx.tools`, `ctx.get`, `ctx.effect`,
  `ContentBlock`, image attachment admission). Tools are registered as raw
  JSON-Schema definitions, so a second copy of the Harness registry is never
  created inside the process and `instanceof` identities stay intact. Adding a
  runtime import of a Harness package is an architectural change, not a
  convenience.
- **The canonical value is the API.** `output.schema` is validated by the
  registry and read directly by PTC-mode programs; human prose belongs in
  `output.render`. Any new field must stay inside the Harness's supported
  schema subset (see `tests/helpers/schema.mjs`, which pins the same rules).
- **Everything is a string in, a file out.** No tool may write outside the
  calling session's workspace (`src/output.ts` proves containment, including
  through symlinks), and nothing may be written silently: every downgrade
  (missing rasterizer, refused preview, sanitized input, skipped sample) lands
  in the value's `warnings`.
- **Never `eval` model text.** Figure expressions go through
  `src/expr.ts`, a hand-written recursive-descent compiler with a depth cap.
- **Sanitize at the boundary.** `math_convert` accepts SVG from the model and
  from disk; `src/sanitize.ts` strips scripts, foreign markup, event handlers,
  DOCTYPE, external references, remote paint servers, and fetching styles, and
  reports every removal.
- **Labels are paths, not fonts.** Every text run is typeset by MathJax with
  `fontCache: 'none'`, which is what makes SVG output font-free and PNG output
  deterministic. Do not reintroduce `<text>` elements or a font dependency.
- **Build before committing.** `npm run check` runs the typecheck, the bundle
  build with its artifact-shape verification, and the test suite. `lib/` is
  committed output: never hand-edit it.
- **Cleanup rides effects.** Registrations go through `ctx.tools.register()`,
  and the fragment/expression caches are released by the plugin's own
  `ctx.effect` disposer.
