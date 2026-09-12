# dsh-mathmatic-symbol

[![npm](https://img.shields.io/npm/v/@jaxzhou/dsh-mathmatic-symbol.svg)](https://www.npmjs.com/package/@jaxzhou/dsh-mathmatic-symbol)
[![license](https://img.shields.io/npm/l/@jaxzhou/dsh-mathmatic-symbol.svg)](LICENSE)

English | [中文](README.zh.md)

> The npm package name is **`@jaxzhou/dsh-mathmatic-symbol`**.

Three tools for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness):
**typeset LaTeX formulas into images**, **draw mathematical figures from a
declarative spec**, and **convert a formula or SVG into an image ready to embed
in a document**. Every artifact is a **font-free SVG** (all glyphs are outline
paths) plus an optional **PNG**, returned with snippets you can paste straight
into Markdown, HTML, or LaTeX.

```sh
dsh plugin --profile web add @jaxzhou/dsh-mathmatic-symbol
dsh --profile web
```

![Sine and cosine on the unit circle: gridded axes, a radius arrow, dashed
projections, a theta arc, and a LaTeX title](media/demo.png)

*Produced by `math_figure`: unit circle, $\sin\theta$/$\cos\theta$ projections,
angle arc, and a LaTeX title — every glyph is a vector path, so no font is
needed anywhere.*

## The three tools

| Tool | What it does | Typical request |
| --- | --- | --- |
| **`math_formula`** | LaTeX math → SVG + PNG | "turn this formula into an image for my doc" |
| **`math_figure`** | Declarative geometry/function figure → SVG + PNG | "draw a unit circle / triangle / rose curve" |
| **`math_convert`** | Formula, inline SVG, or workspace SVG/PNG → embeddable images | "convert this SVG to PNG" |

All three return the same structured result: paths (workspace-relative and
absolute), byte sizes, intrinsic and pixel dimensions, and `embed.markdown_svg`,
`embed.html_png`, `embed.latex_png`, and friends.

## Formulas

```
math_formula({
  latex: "\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}",
  display: true,
  format: "both",
  scale: 4,
  name: "gaussian-integral"
})
```

- `$…$`, `$$…$$`, `\[…\]`, `\(…\)`, and `\begin{equation}…\end{equation}` are
  stripped automatically, so a model may pass bare TeX.
- Every glyph is a `<path>`; the SVG contains no `<defs>`, `<use>`, `id`, or
  `font-family`, so it renders identically in browsers, Word, and LaTeX
  pipelines.
- A syntax error is never silent: the result carries a `warnings` entry and the
  image shows MathJax's own error marker.

## Figures

`math_figure` takes a JSON spec: a canvas, an optional coordinate frame, and an
ordered list of elements. Coordinates are **mathematical** (y grows upward) and
may be expressions over the spec's `vars`. A point can be named and then
referenced by that name in later elements.

```json
{
  "width": 420, "height": 320,
  "xRange": [-1, 5], "yRange": [-1, 4],
  "axes": true, "grid": true, "aspect": "equal",
  "vars": { "a": 3, "b": "2 * a" },
  "elements": [
    { "type": "polygon", "points": [[0, 0], [4, 0], [0, "a"]], "fill": "#93c5fd", "fill_opacity": 0.25 },
    { "type": "point", "at": [0, 0], "label": "A", "label_offset": [-14, 12] },
    { "type": "point", "at": [4, 0], "label": "B", "label_offset": [14, 12] },
    { "type": "point", "at": [0, "a"], "label": "C", "label_offset": [-14, -12] },
    { "type": "segment", "from": "A", "to": "B", "label": "c", "label_offset": [0, 14] },
    { "type": "angle", "at": "B", "from": "A", "to": "C", "label": "\\beta" },
    { "type": "angle", "at": "A", "from": "B", "to": "C", "right": true }
  ]
}
```

### Element reference

| Element | Key fields |
| --- | --- |
| `point` | `at`, `label` (LaTeX), `label_offset` (screen px, y down), `size`, `open` |
| `segment` / `vector` | `from`, `to`, `style` (solid/dashed/dotted), `arrow` (none/end/start/both), `label` |
| `line` / `ray` | `through` (two points), `extend` (both/forward/backward/none, `line` only) |
| `polyline` / `polygon` | `points`, `closed`, `fill`, `fill_opacity`, `label` |
| `circle` | `center` + `radius`, or `center` + `through` |
| `arc` | `center`, `radius`, `start`, `end` (degrees, counter-clockwise) |
| `angle` | `at`, `from`, `to`, `radius` (px), `right` (square marker), `label` |
| `curve` | `y: "sin(x)"`, `domain`, `samples` |
| `parametric` | `x`, `y` in `t`, `range`, `samples` |
| `polar` | `r: "2cos(3theta)"`, `range`, `samples` |
| `text` | `at`, `text` (LaTeX), `size`, `anchor`, `valign`, `rotate` |

Top-level fields: `width`, `height`, `padding`, `background`, `xRange`,
`yRange`, `aspect` (`equal` keeps circles circular, the default), `vars`,
`grid` (`true` or `{ step, color }`), `axes` (`true` or `{ color, labels }`;
defaults on when the spec contains `curve`/`parametric`/`polar`), `title`
(LaTeX), and `elements`.

Coordinate expressions support `+ - * / % ^`, implicit multiplication (`2x`),
`pi`/`e`/`tau`, and `sin cos tan asin acos atan atan2 sinh cosh tanh sqrt cbrt
abs exp ln log log2 log10 floor ceil round sign min max pow hypot mod gcd cot
sec csc`. Every text run is LaTeX — use `\text{…}` for upright words.

## Embedding into documents

Each call returns ready-to-paste snippets (formats that were not produced are
empty strings):

| Field | Shape |
| --- | --- |
| `embed.markdown_svg` / `embed.markdown_png` | `![…](math/formula-….svg)` |
| `embed.html_svg` / `embed.html_png` | `<img src="…" width="…" height="…" alt="…">` |
| `embed.latex_svg` / `embed.latex_png` | `\includegraphics[width=…cm]{…}` |
| `data_uri_svg` / `data_uri_png` | `data:image/…;base64,…` with `data_uri: true` |

Shared parameters: `format` (`svg`/`png`/`both`, default `both`), `scale` (PNG
zoom, default 4), `background` (`transparent` or a flat color), `padding`,
`path` (output file or directory, workspace-relative), `name` (file base name;
a content hash is used when omitted), `data_uri`, and `preview`.

Artifacts land in the workspace's `math/` directory by default and are named by
content hash, so re-running the same input overwrites the same file instead of
accumulating copies.

With `preview: true`, the PNG is also attached to the result for inline display
when the active model declares image input and the deployment mounts a durable
attachment store. When it does not, the call degrades to a `warnings` entry —
never an error.

## Requirements

DeepSeek Harness **0.1.5-rc.2**, any profile (this is a Host tool set, so
`headless` and `web` both work). No Web UI is required. Node ≥ 22.19.

## Install

```sh
dsh plugin --profile web add @jaxzhou/dsh-mathmatic-symbol
dsh --profile web
```

Local checkout or a git ref works too — the runtime artifact is committed, so
nothing builds at install time:

```sh
dsh plugin --profile web add /path/to/dsh-mathmatic-symbol
dsh plugin --profile web add github:jaxzhou/dsh-mathmatic-symbol
```

Confirm the layer resolved:

```sh
dsh --profile web --dump-config | grep -A 2 jaxzhou-mathmatic-symbol
```

## Configuration

Write it into the profile's `cordis.patch.yml` (applied after every bundle
layer):

```yaml
- id: jaxzhou-mathmatic-symbol
  config:
    outputDir: math        # asset directory, workspace-relative
    scale: 4               # default PNG zoom
    color: '#000000'       # default formula ink
    background: transparent
    padding: 8
    fontSize: 16           # pixels per em for formulas
    preview: false         # default inline preview
    dataUri: false         # default data-URI output
```

Invalid configuration fails at mount time; nothing is silently clamped or
ignored.

## Disable and uninstall

```yaml
- id: jaxzhou-mathmatic-symbol
  disabled: true
```

```sh
dsh plugin --profile web remove @jaxzhou/dsh-mathmatic-symbol
```

## Privacy and authority

- **Writes only inside the workspace.** Every output path is resolved against
  the calling session's working directory and checked against symlinked
  ancestors; an escaping path is refused. By default only content-addressed
  files under `math/` are created.
- **No network.** Typesetting, drawing, and rasterizing are entirely local
  (MathJax and resvg are dependencies, not services).
- **No credentials, no session data.** The plugin touches no service other than
  the optional `ctx.attachments.saveImage()`, holds no file permissions, and
  writes no session logs.
- **No model-authored code is executed.** Figure expressions go through a
  hand-written recursive-descent compiler with depth and length caps — never
  `eval`. LaTeX excludes the `html`/`require`/`autoload` extensions, and SVG
  passed to `math_convert` is sanitized (scripts, foreign markup, event
  handlers, DOCTYPE, external references, and remote paint servers are removed
  and reported one by one).
- **Degrades on purpose.** Rasterization needs a native binding; when it is
  unavailable the call still returns SVG output and says so in `warnings`.

## Known limitations

- **Text is paths.** Labels are outlined, so they are not selectable or
  searchable inside the SVG. That is exactly why the images render without any
  font installed.
- **`math_convert` PNG input is pass-through.** Existing PNGs are not
  re-encoded and JPEG/WebP/GIF dimensions are not parsed; file input accepts
  only `.svg` and `.png`.
- **PNG needs the native binding.** Without a prebuilt `@resvg/resvg-js` for the
  platform, only SVG output is available.
- **`aspect: "equal"` adjusts the view.** When both `xRange` and `yRange` are
  given, the narrower axis is widened to keep a uniform scale (like
  matplotlib's `adjustable="datalim"`), so the axes may extend slightly past
  the ranges you asked for.
- **One figure per call.** There is no multi-panel/subplot syntax; draw several
  elements on one canvas or make several calls.
- **No 3-D and no implicit curves.** Only planar explicit functions,
  parametric curves, and polar curves.

## Contributing

Build, artifact model, dependency policy, and the real-Harness verification
steps live in [CONTRIBUTING.md](CONTRIBUTING.md); repository rules are in
[AGENTS.md](AGENTS.md).

## License

MIT — see [LICENSE](LICENSE).
