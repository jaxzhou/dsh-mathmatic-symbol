/**
 * Mirror of the Harness system-prompt variable rules.
 *
 * `renderPrompt` interpolates `{{name}}` inside every section's text and throws
 * when a group does not match `[a-z][a-z0-9_]*`. A plugin that writes a literal
 * double-braced token into prompt text therefore breaks *every* prompt assembly,
 * which is what happened to the document tool's placeholder in 0.1.1. These
 * helpers let the suite fail on that at test time instead of at request time.
 */

/** Variable names the Harness accepts. */
const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/
/** One complete group at the start of a string (`GROUP_AT` in the Harness). */
const GROUP_AT = /^\{\{([^{}]*)\}\}/

/**
 * Assert that text is safe to place in a system-prompt section.
 * @param {string} text - the candidate prompt text.
 * @param {string} label - where the text came from, for the failure message.
 */
export function assertPromptSafe(text, label) {
  if (typeof text !== 'string') throw new Error(`${label}: expected a string`)
  for (let open = text.indexOf('{{'); open >= 0; open = text.indexOf('{{', open + 2)) {
    const group = GROUP_AT.exec(text.slice(open))
    if (group === null) {
      // A later closing brace makes the reference malformed; otherwise it is prose.
      if (text.indexOf('}}', open + 2) >= 0) {
        throw new Error(`${label}: malformed prompt variable reference at "${text.slice(open, open + 16)}"`)
      }
      continue
    }
    const name = group[1]
    if (!VARIABLE_NAME.test(name)) {
      throw new Error(`${label}: the Harness would reject "{{${name}}}" (names match ${String(VARIABLE_NAME)})`)
    }
  }
}

/**
 * Assert that every prompt-facing string of a tool set is interpolation-safe.
 * @param {Map<string, any>} tools - registered tool definitions.
 * @param {string} label - prefix for failure messages.
 */
export function assertToolsPromptSafe(tools, label = 'tools') {
  for (const tool of tools.values()) {
    assertPromptSafe(tool.description, `${label}.${tool.name}.description`)
    for (const [name, schema] of Object.entries(tool.parameters.properties ?? {})) {
      if (typeof schema.description === 'string') {
        assertPromptSafe(schema.description, `${label}.${tool.name}.parameters.${name}`)
      }
    }
  }
}
