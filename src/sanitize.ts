/**
 * Sanitize an SVG document before it is written to a file or handed to the
 * rasterizer.
 *
 * The plugin only ever *generates* SVG, but `math_convert` also accepts SVG
 * text from the model or from a file in the workspace. Everything crossing
 * that boundary is rewritten to a conservative subset: no scripts, no foreign
 * markup, no event handlers, no external references, no `DOCTYPE` (which can
 * define entities), and no CSS that can fetch a URL. Anything removed is
 * reported back so the removal is never silent.
 *
 * @module @jaxzhou/dsh-mathmatic-symbol/sanitize
 */

/** Largest SVG document this plugin will accept for conversion. */
const MAX_SVG_BYTES = 2 * 1024 * 1024

/** Elements removed wholesale, paired or self-closing. */
const FORBIDDEN_ELEMENTS = [
  'script',
  'foreignObject',
  'iframe',
  'object',
  'embed',
  'style',
  'audio',
  'video',
  'animate',
  'animateTransform',
  'set',
  'handler',
] as const

/** The sanitized document, its intrinsic size, and what was removed. */
export interface SanitizedSvg {
  svg: string
  width: number
  height: number
  removed: string[]
}

function attrNumber(tag: string, name: string): number | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)
  if (match?.[1] === undefined) return undefined
  const value = Number.parseFloat(match[1])
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function viewBoxSize(tag: string): { width: number; height: number } | undefined {
  const match = /\sviewBox\s*=\s*"([^"]*)"/i.exec(tag)
  const numbers = match?.[1]?.trim().split(/[\s,]+/).map(Number)
  if (numbers === undefined || numbers.length !== 4) return undefined
  const width = numbers[2] as number
  const height = numbers[3] as number
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined
  return { width, height }
}

/**
 * Rewrite one SVG document into the plugin's safe subset.
 * @param input - the raw SVG text.
 * @returns the sanitized document with its intrinsic pixel size.
 * @throws Error when the input is too large or has no `<svg>` root.
 */
export function sanitizeSvg(input: string): SanitizedSvg {
  if (input.length > MAX_SVG_BYTES) {
    throw new Error(`the SVG is larger than ${MAX_SVG_BYTES} bytes`)
  }
  const removed = new Set<string>()
  let svg = input

  svg = svg.replace(/<\?xml[\s\S]*?\?>/gi, () => { removed.add('an XML declaration'); return '' })
  svg = svg.replace(/<!DOCTYPE[\s\S]*?>/gi, () => { removed.add('a DOCTYPE'); return '' })
  svg = svg.replace(/<!--[\s\S]*?-->/g, () => { removed.add('a comment'); return '' })

  for (const element of FORBIDDEN_ELEMENTS) {
    const paired = new RegExp(`<${element}\\b[\\s\\S]*?</${element}\\s*>`, 'gi')
    svg = svg.replace(paired, () => { removed.add(`<${element}>`); return '' })
    const single = new RegExp(`<${element}\\b[^>]*?/?>`, 'gi')
    svg = svg.replace(single, () => { removed.add(`<${element}>`); return '' })
  }

  svg = svg.replace(/\son[a-zA-Z-]+\s*=\s*"[^"]*"/g, () => { removed.add('an event handler'); return '' })
  svg = svg.replace(/\son[a-zA-Z-]+\s*=\s*'[^']*'/g, () => { removed.add('an event handler'); return '' })
  svg = svg.replace(/\son[a-zA-Z-]+\s*=\s*[^\s>]+/g, () => { removed.add('an event handler'); return '' })

  svg = svg.replace(/(\s(?:xlink:)?href\s*=\s*)("[^"]*"|'[^']*')/gi, (match: string, prefix: string, quoted: string) => {
    const raw = quoted.slice(1, -1).trim()
    const isFragment = raw.startsWith('#')
    const isEmbedded = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(raw)
    if (isFragment || isEmbedded) return match
    if (raw.length > 0) removed.add('an external reference')
    return `${prefix}"#"`
  })

  svg = svg.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, (match: string, quoted: string) => {
    const raw = quoted.slice(1, -1)
    if (/url\s*\(|javascript:|expression\s*\(|[<>]/i.test(raw)) {
      removed.add('an unsafe style attribute')
      return ''
    }
    return match
  })

  // Paint servers: only same-document fragments are allowed, so a figure can
  // never make a viewer fetch a remote resource through fill/stroke/filter.
  svg = svg.replace(/\s([a-zA-Z-]+)\s*=\s*("[^"]*"|'[^']*')/g, (match: string, name: string, quoted: string) => {
    const raw = quoted.slice(1, -1)
    if (!/url\s*\(/i.test(raw)) return match
    const safe = raw.replace(/url\s*\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (reference: string, _quote: string, target: string) =>
      target.trim().startsWith('#') ? reference : 'none')
    if (safe === raw) return match
    removed.add('an external paint reference')
    return ` ${name}="${safe.replaceAll('"', '&quot;')}"`
  })

  svg = svg.replace(/(\s[a-zA-Z-]+\s*=\s*)url\s*\(\s*(?!#)([^)]*)\)/gi, (_match: string, prefix: string) => {
    removed.add('an external paint reference')
    return `${prefix}"none"`
  })

  const rootStart = /<svg\b[^>]*>/i.exec(svg)
  if (rootStart === null) throw new Error('the input does not contain an <svg> root element')
  let root = rootStart[0]
  if (!/\sxmlns\s*=/i.test(root)) {
    root = root.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"')
    svg = svg.slice(0, rootStart.index) + root + svg.slice(rootStart.index + rootStart[0].length)
  }
  const viewBox = viewBoxSize(root)
  const width = attrNumber(root, 'width') ?? viewBox?.width
  const height = attrNumber(root, 'height') ?? viewBox?.height
  if (width === undefined || height === undefined) {
    throw new Error('the SVG must declare width/height or a viewBox so it can be sized')
  }
  return { svg, width, height, removed: [...removed] }
}
