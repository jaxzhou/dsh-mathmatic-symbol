# dsh-mathmatic-symbol

[![npm](https://img.shields.io/npm/v/@jaxzhou/dsh-mathmatic-symbol.svg)](https://www.npmjs.com/package/@jaxzhou/dsh-mathmatic-symbol)
[![license](https://img.shields.io/npm/l/@jaxzhou/dsh-mathmatic-symbol.svg)](LICENSE)

[English](README.md) | 中文

> npm 包名是 **`@jaxzhou/dsh-mathmatic-symbol`**。

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 增加三个
工具：**把 LaTeX 公式排成图片**、**用声明式规格画出数学图形**、**把公式／SVG
转成可嵌入文档的图片**。所有产物都是**自带字形轮廓的 SVG**（不依赖字体）与按需
生成的 **PNG**，并附带可直接粘贴进 Markdown / HTML / LaTeX 的片段。

```sh
dsh plugin --profile web add @jaxzhou/dsh-mathmatic-symbol
dsh --profile web
```

![单位圆上的正弦与余弦：网格坐标轴、半径箭头、虚线投影、θ 角弧，以及 LaTeX
标题](media/demo.png)

*由 `math_figure` 生成：单位圆、$\sin\theta$／$\cos\theta$ 投影、角度弧与 LaTeX
标题，全部字形都是矢量路径，因此不依赖任何字体。*

## 三个工具

| 工具 | 做什么 | 典型说法 |
|---|---|---|
| **`math_formula`** | LaTeX 公式 → SVG + PNG | “把这个公式做成图片放进文档” |
| **`math_figure`** | 声明式几何／函数图形 → SVG + PNG | “画个单位圆／三角形／玫瑰线” |
| **`math_convert`** | 已有公式／SVG 字符串／工作区 SVG/PNG 文件 → 可嵌入图片 | “把这段 SVG 转成 PNG” |

三者返回同一个结构化结果：文件路径（相对与绝对）、字节数、原始尺寸、像素尺寸，
以及 `embed.markdown_svg`、`embed.html_png`、`embed.latex_png` 等嵌入片段。

## 公式

```
math_formula({
  latex: "\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}",
  display: true,
  format: "both",
  scale: 4,
  name: "gaussian-integral"
})
```

- `$…$`、`$$…$$`、`\[…\]`、`\(…\)`、`\begin{equation}…\end{equation}` 都会被自动
  剥掉，模型直接给裸 TeX 也行。
- 每个字形都是 `<path>`，SVG 里没有 `<defs>`／`<use>`／`id`／`font-family`，因此
  渲染结果在浏览器、Word、LaTeX 流程里完全一致。
- 公式语法错误不会静默：结果里会带 `warnings`，图片本身也会画出 MathJax 的错误
  标记。

## 图形

`math_figure` 的 `figure` 是一个 JSON 规格：画布、可选坐标框、以及一串元素。坐标
是**数学坐标**（y 向上），可以是数字，也可以是 `vars` 上的表达式；点名后可以在后
续元素里按名字引用。

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

### 元素一览

| 元素 | 关键字段 |
|---|---|
| `point` | `at`、`label`（LaTeX）、`label_offset`（屏幕像素，y 向下）、`size`、`open` |
| `segment` / `vector` | `from`、`to`、`style`（solid/dashed/dotted）、`arrow`（none/end/start/both）、`label` |
| `line` / `ray` | `through` 两点、`extend`（both/forward/backward/none，仅 `line`） |
| `polyline` / `polygon` | `points`、`closed`、`fill`、`fill_opacity`、`label` |
| `circle` | `center` + `radius`，或 `center` + `through` |
| `arc` | `center`、`radius`、`start`、`end`（角度，逆时针） |
| `angle` | `at`、`from`、`to`、`radius`（像素）、`right`（直角小方块）、`label` |
| `curve` | `y: "sin(x)"`、`domain`、`samples` |
| `parametric` | `x`、`y`（以 `t` 为参数）、`range`、`samples` |
| `polar` | `r: "2cos(3theta)"`、`range`、`samples` |
| `text` | `at`、`text`（LaTeX）、`size`、`anchor`、`valign`、`rotate` |

顶层字段：`width`、`height`、`padding`、`background`、`xRange`、`yRange`、
`aspect`（`equal` 保持圆是圆，默认）、`vars`、`grid`（`true` 或
`{ step, color }`）、`axes`（`true` 或 `{ color, labels }`；含
`curve`/`parametric`/`polar` 时默认开启）、`title`（LaTeX）、`elements`。

坐标表达式支持 `+ - * / % ^`、`2x` 这样的隐式乘法、`pi`/`e`/`tau`、以及
`sin cos tan asin acos atan atan2 sinh cosh tanh sqrt cbrt abs exp ln log log2
log10 floor ceil round sign min max pow hypot mod gcd cot sec csc`。所有文字
（刻度、点名、标题）都是 LaTeX，用 `\text{…}` 写正体文字。

## 嵌入文档

每次调用都会返回现成的片段（未生成的格式为空字符串）：

| 字段 | 形态 |
|---|---|
| `embed.markdown_svg` / `embed.markdown_png` | `![…](math/formula-….svg)` |
| `embed.html_svg` / `embed.html_png` | `<img src="…" width="…" height="…" alt="…">` |
| `embed.latex_svg` / `embed.latex_png` | `\includegraphics[width=…cm]{…}` |
| `data_uri_svg` / `data_uri_png` | `data:image/…;base64,…`，需要 `data_uri: true` |

常用参数（三个工具共享）：`format`（`svg`/`png`/`both`，默认 `both`）、`scale`
（PNG 放大倍数，默认 4）、`background`（`transparent` 或具体颜色）、`padding`、
`path`（输出文件或目录，工作区相对路径）、`name`（文件名，省略则用内容哈希）、
`data_uri`、`preview`。

产物默认写到工作区的 `math/` 目录，文件名按内容哈希命名，因此同样的输入重复调用
只会覆盖同一个文件，不会堆积。

`preview: true` 时，若当前模型声明支持图片输入且部署挂了附件存储，PNG 会作为图片
块附加到本次结果里直接显示；不满足条件时会降级为一条 `warnings`，绝不报错。

## 环境要求

DeepSeek Harness **0.1.5-rc.2**，任意 profile（Host 工具，`headless` 与 `web`
都可用）。不需要 Web 界面。Node ≥ 22.19。

## 安装

```sh
dsh plugin --profile web add @jaxzhou/dsh-mathmatic-symbol
dsh --profile web
```

本地检出或 git ref 也可以（运行产物已提交，无需构建）：

```sh
dsh plugin --profile web add /path/to/dsh-mathmatic-symbol
dsh plugin --profile web add github:jaxzhou/dsh-mathmatic-symbol
```

确认层已生效：

```sh
dsh --profile web --dump-config | grep -A 2 jaxzhou-mathmatic-symbol
```

## 配置

配置文件写在 profile 的 `cordis.patch.yml`（在所有 bundle 层之后应用）：

```yaml
- id: jaxzhou-mathmatic-symbol
  config:
    outputDir: math        # 产物目录（工作区相对路径）
    scale: 4               # PNG 默认放大倍数
    color: '#000000'       # 公式默认墨色
    background: transparent
    padding: 8
    fontSize: 16           # 公式一个 em 的像素数
    preview: false         # 默认是否内联预览
    dataUri: false         # 默认是否返回 data URI
```

配置不合法会在挂载时直接报错，不会被悄悄取整或忽略。

## 停用与卸载

```yaml
- id: jaxzhou-mathmatic-symbol
  disabled: true
```

```sh
dsh plugin --profile web remove @jaxzhou/dsh-mathmatic-symbol
```

## 隐私与权限

- **只写工作区**：输出路径一律解析到调用会话的工作目录内并做符号链接检查；越界
  路径直接报错。默认只写 `math/` 下的内容寻址文件。
- **不联网**：排版、绘图、栅格化全部离线完成（MathJax 与 resvg 都是本地依赖）。
- **不读凭据、不落会话数据**：除可选的 `ctx.attachments.saveImage()` 外不接触任何
  服务；插件自身不持有文件权限，也不写会话日志。
- **不执行模型给的代码**：图形表达式走自写的递归下降编译器（深度与长度上限），
  绝不 `eval`；LaTeX 排除了 `html`/`require`/`autoload` 等扩展，`math_convert`
  输入的 SVG 会被清洗（脚本、事件处理器、DOCTYPE、外部引用、远程 paint 全部移除
  并逐条记录）。
- **按需降级**：栅格化依赖原生绑定，缺失时自动只产出 SVG，并在 `warnings` 里说明。

## 已知限制

- **文字即路径**：所有文字都排版成字形轮廓，SVG 里的文字不可选中、不参与搜索；
  这正是它在任何环境都不缺字体的原因。
- **`math_convert` 的 PNG 只做直通**：不做重新编码，也不读取 JPEG/WebP/GIF 的
  尺寸；文件输入只接受 `.svg` 与 `.png`。
- **PNG 需要原生绑定**：`@resvg/resvg-js` 对当前平台没有预编译产物时，只有 SVG。
- **`aspect: "equal"` 会调整视窗**：同时给了 `xRange`/`yRange` 时，为保持等比例，
  较窄的一维会被扩展（类似 matplotlib 的 `adjustable="datalim"`），因此坐标轴可
  能略微超出你给的区间。
- **一次一张图**：没有子图／多面板语法；多张图请分别调用，或把多个元素画在同一
  画布里。
- **无 3D 与隐函数**：只有平面显式函数、参数曲线与极坐标曲线。

## 参与开发

构建、产物模型、依赖策略与真机验证步骤见 [CONTRIBUTING.md](CONTRIBUTING.md)，
仓库规则见 [AGENTS.md](AGENTS.md)。

## 许可证

MIT —— 见 [LICENSE](LICENSE)。
