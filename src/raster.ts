/**
 * SVG → PNG rasterization through the optional native `@resvg/resvg-js`
 * binding.
 *
 * The dependency is imported lazily and its failure is a typed, recoverable
 * error: a platform without a prebuilt binding still gets SVG output, embed
 * snippets, and a warning instead of a broken plugin. System fonts are not
 * loaded, which is correct for this plugin because every SVG it produces
 * paints glyphs as paths.
 *
 * @module @jaxzhou/dsh-mathmatic-symbol/raster
 */

import { isSafeColor } from './svg.ts'

/** Raised when the rasterizer cannot be loaded on this platform. */
export class RasterUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RasterUnavailableError'
  }
}

/** Raster output plus the exact decoded pixel size. */
export interface RasterResult {
  data: Uint8Array
  width: number
  height: number
}

type ResvgModule = typeof import('@resvg/resvg-js')

let resvgPromise: Promise<ResvgModule> | undefined

async function loadResvg(): Promise<ResvgModule> {
  resvgPromise ??= import('@resvg/resvg-js').catch((error: unknown) => {
    resvgPromise = undefined
    const detail = error instanceof Error ? error.message : String(error)
    throw new RasterUnavailableError(
      `PNG output needs the optional "@resvg/resvg-js" native binding, which failed to load (${detail}). `
      + 'SVG output is unaffected; install a prebuilt binding or use format "svg".',
    )
  })
  return resvgPromise
}

/**
 * Read the intrinsic size from a PNG's IHDR chunk.
 * @param data - complete PNG bytes.
 * @returns the pixel width/height, or `undefined` when the bytes are not a PNG.
 */
export function readPngSize(data: Uint8Array): { width: number; height: number } | undefined {
  if (data.length < 24) return undefined
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (const [index, byte] of signature.entries()) {
    if (data[index] !== byte) return undefined
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  if (width === 0 || height === 0) return undefined
  return { width, height }
}

/**
 * Rasterize one SVG document to PNG.
 * @param svg - complete SVG text.
 * @param options - zoom factor and optional opaque background color.
 * @returns the PNG bytes and their exact pixel size.
 * @throws RasterUnavailableError when the binding is missing.
 * @throws Error when the SVG itself cannot be parsed or rendered.
 */
export async function rasterizePng(
  svg: string,
  options: { scale: number; background?: string },
): Promise<RasterResult> {
  const resvg = await loadResvg()
  const background = options.background !== undefined && options.background !== 'transparent'
    ? options.background
    : undefined
  if (background !== undefined && !isSafeColor(background)) {
    throw new Error(`"${background}" is not a supported background color`)
  }
  let rendered: { asPng(): Uint8Array }
  try {
    const renderer = new resvg.Resvg(svg, {
      fitTo: { mode: 'zoom', value: options.scale },
      font: { loadSystemFonts: false },
      ...background !== undefined ? { background } : {},
    })
    rendered = renderer.render()
  } catch (error: unknown) {
    throw new Error(`the SVG could not be rasterized: ${error instanceof Error ? error.message : String(error)}`)
  }
  const data = new Uint8Array(rendered.asPng())
  const size = readPngSize(data)
  if (size === undefined) throw new Error('the rasterizer returned bytes that are not a PNG')
  return { data, ...size }
}
