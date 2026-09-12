/**
 * Shared SVG serialization helpers: deterministic number formatting, XML
 * escaping, safe color/identifier validation, and color substitution for
 * MathJax output (which paints with `currentColor`).
 *
 * @module @jaxzhou/dsh-mathmatic-symbol/svg
 */

/** Hex colors (3/4/6/8 digits), CSS color keywords, and rgb/hsl functions. */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const NAMED_COLOR = /^[a-zA-Z]{3,24}$/
const FUNCTIONAL_COLOR = /^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s/]+\)$/

/**
 * Whether a string is a color this plugin is willing to write into an SVG
 * presentation attribute. Function-style `url(…)` paint servers and anything
 * with markup characters are refused: the plugin only ever draws flat colors.
 * @param value - candidate color attribute value.
 * @returns whether the value is a flat color or `none`.
 */
export function isSafeColor(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 64) return false
  return HEX_COLOR.test(trimmed) || NAMED_COLOR.test(trimmed) || FUNCTIONAL_COLOR.test(trimmed)
}

/**
 * Format a number for an SVG attribute or `d` path: no exponent notation, no
 * trailing zeros, and a hard decimal cap so byte output stays predictable.
 * @param value - the number to format.
 * @param maxDecimals - maximum fraction digits.
 * @returns the formatted literal.
 */
export function formatNumber(value: number, maxDecimals = 3): string {
  if (!Number.isFinite(value)) return '0'
  if (Number.isInteger(value)) return String(value)
  const rounded = Number(value.toFixed(maxDecimals))
  return String(rounded)
}

/** Escape one XML attribute value (double-quoted). */
export function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

/** Escape one XML text node. */
export function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/**
 * Reduce an arbitrary string to a safe SVG/XML identifier body.
 * @param value - the raw identifier.
 * @param fallback - returned when nothing usable remains.
 * @returns `[A-Za-z0-9_-]{1,64}`.
 */
export function safeId(value: string, fallback = 'id'): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
  return cleaned.length > 0 ? cleaned : fallback
}

/**
 * Substitute MathJax's `currentColor` paint with one concrete color so the
 * output does not depend on the embedding document's CSS.
 * @param markup - MathJax SVG fragment.
 * @param color - the concrete color to paint with.
 * @returns the fragment with every `currentColor` replaced.
 */
export function colorize(markup: string, color: string): string {
  return markup.replaceAll('currentColor', color)
}
