/**
 * Document embed snippets for one generated image.
 *
 * A generated artifact is only useful once it is inside a document, so every
 * tool returns ready-to-paste Markdown, HTML, and LaTeX, plus optional
 * base64 data URIs for documents that cannot reference a sibling file. Keys
 * for an unavailable format are empty strings, never stale content.
 *
 * @module @jaxzhou/dsh-mathmatic-symbol/embed
 */

import { escapeAttribute } from './svg.ts'

/** One image that embed snippets may reference. */
export interface EmbedImage {
  /** Workspace-relative path with `/` separators. */
  relativePath: string
  /** Intrinsic pixel width. */
  width: number
  /** Intrinsic pixel height. */
  height: number
}

/** Ready-to-paste document snippets; `''` when that format was not produced. */
export interface EmbedSnippets {
  markdown_svg: string
  markdown_png: string
  html_svg: string
  html_png: string
  latex_svg: string
  latex_png: string
}

/** Embed snippets plus optional data URIs. */
export interface EmbedResult {
  embed: EmbedSnippets
  data_uri_svg: string | null
  data_uri_png: string | null
}

function latexSnippet(image: EmbedImage): string {
  // 96 CSS px per inch is the conventional conversion for a 1× raster.
  const centimeters = ((image.width / 96) * 2.54).toFixed(2)
  return `\\includegraphics[width=${centimeters}cm]{${image.relativePath}}`
}

function markdownSnippet(alt: string, image: EmbedImage): string {
  return `![${alt}](${image.relativePath})`
}

function htmlSnippet(alt: string, image: EmbedImage): string {
  return `<img src="${escapeAttribute(image.relativePath)}" width="${image.width}"`
    + ` height="${image.height}" alt="${escapeAttribute(alt)}">`
}

/**
 * Build the embed block for one result.
 * @param altText - short description used for Markdown/HTML alternative text.
 * @param images - the SVG and/or PNG that exist on disk.
 * @param options - whether data URIs are wanted, plus the bytes to encode.
 * @returns snippets and data URIs.
 */
export function buildEmbeds(
  altText: string,
  images: { svg?: EmbedImage; png?: EmbedImage },
  options: { dataUri: boolean; svgText?: string; pngBytes?: Uint8Array },
): EmbedResult {
  const alt = altText.replace(/[[\]\n\r]/g, ' ').slice(0, 200)
  const svg = images.svg
  const png = images.png
  const embed: EmbedSnippets = {
    markdown_svg: svg !== undefined ? markdownSnippet(alt, svg) : '',
    markdown_png: png !== undefined ? markdownSnippet(alt, png) : '',
    html_svg: svg !== undefined ? htmlSnippet(alt, svg) : '',
    html_png: png !== undefined ? htmlSnippet(alt, png) : '',
    latex_svg: svg !== undefined
      ? `% requires \\usepackage{svg} or a raster fallback\n${latexSnippet(svg)}`
      : '',
    latex_png: png !== undefined ? latexSnippet(png) : '',
  }
  const wantsSvgUri = options.dataUri && options.svgText !== undefined
  const wantsPngUri = options.dataUri && options.pngBytes !== undefined
  const data_uri_svg = wantsSvgUri
    ? `data:image/svg+xml;base64,${Buffer.from(options.svgText as string, 'utf8').toString('base64')}`
    : null
  const data_uri_png = wantsPngUri
    ? `data:image/png;base64,${Buffer.from(options.pngBytes as Uint8Array).toString('base64')}`
    : null
  return { embed, data_uri_svg, data_uri_png }
}
