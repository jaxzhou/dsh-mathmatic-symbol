/**
 * Workspace-scoped file output: name derivation, path containment, atomic
 * writes, and bounded reads.
 *
 * Every path a tool writes or reads is resolved against the calling session's
 * workspace root and must stay inside it, including through symlinked
 * ancestors. Names are content-addressed by default, so re-running the same
 * formula or figure overwrites the same file instead of filling the workspace
 * with duplicates.
 *
 * @module @jaxzhou/dsh-mathmatic-symbol/output
 */

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** One resolved output location. */
export interface OutputTarget {
  /** Absolute host path. */
  hostPath: string
  /** Path relative to the workspace root, with `/` separators for documents. */
  relativePath: string
  /** Absolute workspace root the target was resolved against. */
  root: string
}

let temporaryCounter = 0

/**
 * Derive a short, stable digest over the inputs that determine an artifact.
 * @param parts - ordered input strings.
 * @returns 12 lowercase hex characters.
 */
export function contentHash(parts: readonly string[]): string {
  const hash = createHash('sha256')
  for (const part of parts) {
    hash.update(part)
    hash.update('\u0000')
  }
  return hash.digest('hex').slice(0, 12)
}

/**
 * Reduce a caller-supplied name to a safe file base name.
 * @param name - the requested name, if any.
 * @param fallback - used when the name is absent or reduces to nothing.
 * @returns `[A-Za-z0-9._-]{1,64}` without a leading dot.
 */
export function safeBaseName(name: string | undefined, fallback: string): string {
  if (name === undefined) return fallback
  const cleaned = name
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+/, '')
    .replace(/[.-]+$/, '')
    .slice(0, 64)
  return cleaned.length > 0 ? cleaned : fallback
}

/** Whether `candidate` is `root` itself or a descendant of it. */
function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/**
 * Resolve one caller-supplied path against the workspace root and prove it
 * cannot leave the workspace, including through symlinked ancestors.
 * @param root - the workspace root (absolute).
 * @param requested - the caller path, absolute or root-relative.
 * @returns the absolute target path.
 * @throws Error when the path escapes the workspace.
 */
export async function resolveInsideWorkspace(root: string, requested: string): Promise<string> {
  const absolute = path.isAbsolute(requested) ? path.resolve(requested) : path.resolve(root, requested)
  if (absolute === path.resolve(root) || !isInside(path.resolve(root), absolute)) {
    throw new Error(`"${requested}" is outside the session workspace (${root})`)
  }
  const realRoot = await realpath(root).catch(() => path.resolve(root))
  let existing = absolute
  while (!existsSync(existing) && path.dirname(existing) !== existing) existing = path.dirname(existing)
  const realExisting = await realpath(existing).catch(() => existing)
  if (!isInside(realRoot, realExisting) && realExisting !== realRoot) {
    throw new Error(`"${requested}" resolves outside the session workspace through a symbolic link`)
  }
  return absolute
}

/**
 * Resolve where one artifact should be written.
 * @param root - workspace root.
 * @param outputDir - default directory (root-relative) for generated assets.
 * @param requested - optional caller path: a file (with the wanted extension), or a directory.
 * @param baseName - content-addressed base name without extension.
 * @param extension - the artifact extension, including the dot.
 * @returns the resolved target.
 */
export async function planOutputTarget(
  root: string,
  outputDir: string,
  requested: string | undefined,
  baseName: string,
  extension: '.svg' | '.png',
): Promise<OutputTarget> {
  const relative = requested === undefined
    ? path.join(outputDir, `${baseName}${extension}`)
    : /\.(?:svg|png)$/i.test(requested)
      ? requested
      : path.join(requested, `${baseName}${extension}`)
  const hostPath = await resolveInsideWorkspace(root, relative)
  return { hostPath, relativePath: toRelative(root, hostPath), root }
}

/** Render an absolute path relative to the workspace root, with `/` separators. */
export function toRelative(root: string, hostPath: string): string {
  return path.relative(root, hostPath).split(path.sep).join('/')
}

/**
 * Write bytes to a target atomically (temporary sibling, then rename).
 * @param target - the resolved output location.
 * @param data - the file content.
 * @returns the number of bytes written.
 */
export async function writeOutput(target: OutputTarget, data: string | Uint8Array): Promise<number> {
  await mkdir(path.dirname(target.hostPath), { recursive: true })
  temporaryCounter += 1
  const temporary = `${target.hostPath}.${process.pid}.${temporaryCounter}.tmp`
  await writeFile(temporary, data)
  await rename(temporary, target.hostPath)
  return typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength
}

/**
 * Read a UTF-8 text file from inside the workspace.
 * @param root - workspace root.
 * @param requested - the caller path.
 * @param maxBytes - refusal threshold.
 * @returns the file text and its resolved location.
 */
export async function readWorkspaceText(
  root: string,
  requested: string,
  maxBytes: number,
): Promise<{ text: string; target: OutputTarget }> {
  const hostPath = await resolveInsideWorkspace(root, requested)
  const info = await stat(hostPath)
  if (!info.isFile()) throw new Error(`"${requested}" is not a regular file`)
  if (info.size > maxBytes) throw new Error(`"${requested}" is larger than ${maxBytes} bytes`)
  const text = await readFile(hostPath, { encoding: 'utf8' })
  return { text, target: { hostPath, relativePath: toRelative(root, hostPath), root } }
}

/** Read raw bytes from inside the workspace. */
export async function readWorkspaceBytes(
  root: string,
  requested: string,
  maxBytes: number,
): Promise<{ data: Uint8Array; target: OutputTarget }> {
  const hostPath = await resolveInsideWorkspace(root, requested)
  const info = await stat(hostPath)
  if (!info.isFile()) throw new Error(`"${requested}" is not a regular file`)
  if (info.size > maxBytes) throw new Error(`"${requested}" is larger than ${maxBytes} bytes`)
  const data = await readFile(hostPath)
  return { data: new Uint8Array(data), target: { hostPath, relativePath: toRelative(root, hostPath), root } }
}
