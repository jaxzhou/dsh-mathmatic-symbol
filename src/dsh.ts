/**
 * Structural view of the DeepSeek Harness plugin contract this package uses.
 *
 * The plugin deliberately does NOT import `@deepseek-ai/*` values. It
 * registers raw JSON-Schema tools through the long-standing
 * `ctx.tools.register(definition)` seam, so it cannot create a second copy of
 * the Host tool registry (and its `instanceof` identities) inside the process.
 * Only the shapes below cross that seam; they were inspected against DeepSeek
 * Harness `0.1.5-rc.2`:
 *
 *   - `packages/core/tools/src/index.ts` — `ToolRuntime.register`, `ToolDefinition`
 *   - `packages/core/tools/src/json-schema.ts` — the enforced output-schema subset
 *   - `packages/llm/llm/src/types.ts` — `ContentBlock` / `ImageBlock`
 *   - `packages/attachment/attachment/src/index.ts` — `ctx.attachments.saveImage`
 *   - `packages/mcp/mcp-client/src/tools.ts` — the image-admission pattern
 *   - `packages/fs/tool-fs/src/session-cwd.ts` — `exec.agent.session.header.cwd`
 *
 * A structural mirror is a compatibility risk, not a promise: the README
 * states the verified Harness version, and the contract test pins the shapes
 * this file declares.
 */

/** One model-facing content block. This plugin emits only `text` and `image`. */
export interface ContentBlock {
  type: string
  [key: string]: unknown
}

/** Durable, serializable reference to one immutable normalized image. */
export interface ImageAttachmentRef {
  attachmentId: string
  mediaType: string
  bytes: number
  width: number
  height: number
  name?: string
}

/** Durable image storage seam (`ctx.attachments`). */
export interface AttachmentStore {
  saveImage(input: { data: Uint8Array; mediaType: 'image/png'; name?: string }): Promise<ImageAttachmentRef>
}

/** One resolved model route's declared capabilities. */
export interface ModelInfo {
  inputModalities?: readonly string[]
}

/** Model info seam (`ctx.llm`), read only to prove image input capability. */
export interface LlmService {
  resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<ModelInfo>
}

/** The part of an agent a tool execution can observe. */
export interface AgentLike {
  options?: { provider?: string; model?: string }
  session: {
    header: { cwd?: string }
    requestHeader?(): { config?: { provider?: string; model?: string } } | undefined
  }
}

/** Immutable per-call identity and cancellation handed to `execute`. */
export interface ToolRunContext {
  readonly signal: AbortSignal
  readonly agent?: AgentLike
}

/** The normalized outcome `finalizeContent` observes. */
export interface ToolResultLike {
  readonly content: ContentBlock[]
  readonly isError: boolean
  readonly value: unknown
}

/** Tool-owned canonical output contract. */
export interface ToolOutputDefinition {
  schema: Record<string, unknown>
  render(args: unknown, value: unknown): ContentBlock[]
}

/** One registered tool: schema plus execution and the optional content finalizer. */
export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: ToolOutputDefinition
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>
  finalizeContent?(exec: ToolRunContext, result: ToolResultLike): ContentBlock[] | undefined
}

/** Cordis logger shape, used defensively (`ctx.logger?.debug?.(…)`). */
export interface PluginLogger {
  debug?(message: string): void
  info?(message: string): void
  warn?(message: string): void
  error?(message: string): void
}

/** The Cordis services and helpers this plugin uses. */
export interface PluginContext {
  tools: { register(definition: ToolDefinition): () => void }
  /** Optional-service lookup; unregistered names return `undefined`. */
  get(name: string): unknown
  /** Lifecycle-scoped registration; the callback may return a disposer. */
  effect(callback: () => void | (() => void)): () => void
  logger?: PluginLogger
}
