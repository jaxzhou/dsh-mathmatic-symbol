/**
 * Minimal validator for the Harness's enforced output-schema subset.
 *
 * The Host registry calls `assertSupportedJsonSchema(output.schema)` and then
 * validates every canonical value against it. This test-local validator keeps
 * the plugin's own suite honest about the same two contracts without
 * importing a `@deepseek-ai/*` package.
 */

const CONSTRAINT_KEYWORDS = new Set(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const'])
const ANNOTATION_KEYWORDS = new Set(['description', 'title', 'default', 'examples'])
const TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])

/**
 * Assert that a schema node only uses keywords the enforced subset accepts.
 * @param {unknown} node - the schema node.
 * @param {string} path - location used in error messages.
 */
export function assertSupportedSchema(node, path = 'schema') {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    throw new Error(`${path} must be a schema object`)
  }
  for (const key of Object.keys(node)) {
    if (!CONSTRAINT_KEYWORDS.has(key) && !ANNOTATION_KEYWORDS.has(key)) {
      throw new Error(`${path}.${key} is not a supported keyword`)
    }
  }
  const hasType = Object.hasOwn(node, 'type')
  const hasOneOf = Object.hasOwn(node, 'oneOf')
  if (hasType && hasOneOf) throw new Error(`${path} cannot declare both type and oneOf`)
  if (hasOneOf) {
    if (!Array.isArray(node.oneOf) || node.oneOf.length < 2) throw new Error(`${path}.oneOf needs at least two branches`)
    node.oneOf.forEach((branch, index) => assertSupportedSchema(branch, `${path}.oneOf[${index}]`))
    return
  }
  if (!hasType) return
  if (typeof node.type !== 'string' || !TYPES.has(node.type)) throw new Error(`${path}.type is unsupported`)
  const allowed = {
    properties: ['object'],
    required: ['object'],
    additionalProperties: ['object'],
    items: ['array'],
    enum: ['string', 'number', 'integer', 'boolean', 'null'],
    const: ['string', 'number', 'integer', 'boolean', 'null'],
  }
  for (const [key, types] of Object.entries(allowed)) {
    if (Object.hasOwn(node, key) && !types.includes(node.type)) throw new Error(`${path}.${key} is not valid on ${node.type}`)
  }
  if (node.type === 'object' && node.properties !== undefined) {
    for (const [name, child] of Object.entries(node.properties)) assertSupportedSchema(child, `${path}.properties.${name}`)
    if (Array.isArray(node.required)) {
      for (const name of node.required) {
        if (!Object.hasOwn(node.properties, name)) throw new Error(`${path}.required names "${name}", which is not declared`)
      }
    }
  }
  if (node.type === 'array' && node.items !== undefined) assertSupportedSchema(node.items, `${path}.items`)
}

/**
 * Validate one canonical value against a supported schema.
 * @param {object} schema - the schema node.
 * @param {unknown} value - the value to check.
 * @param {string} path - location used in error messages.
 */
export function assertValueMatches(schema, value, path = 'value') {
  if (Object.hasOwn(schema, 'oneOf')) {
    const matches = schema.oneOf.filter(branch => {
      try {
        assertValueMatches(branch, value, path)
        return true
      } catch {
        return false
      }
    })
    if (matches.length !== 1) throw new Error(`${path} matched ${matches.length} oneOf branches`)
    return
  }
  switch (schema.type) {
    case undefined:
      return
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`)
      for (const name of schema.required ?? []) {
        if (!Object.hasOwn(value, name)) throw new Error(`${path}.${name} is missing`)
      }
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!Object.hasOwn(schema.properties ?? {}, key)) throw new Error(`${path}.${key} is undeclared`)
        }
      }
      for (const [name, child] of Object.entries(schema.properties ?? {})) {
        if (Object.hasOwn(value, name)) assertValueMatches(child, value[name], `${path}.${name}`)
      }
      return
    }
    case 'array': {
      if (!Array.isArray(value)) throw new Error(`${path} must be an array`)
      if (schema.items !== undefined) value.forEach((item, index) => assertValueMatches(schema.items, item, `${path}[${index}]`))
      return
    }
    case 'string':
      if (typeof value !== 'string') throw new Error(`${path} must be a string`)
      break
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number`)
      break
    case 'integer':
      if (!Number.isInteger(value)) throw new Error(`${path} must be an integer`)
      break
    case 'boolean':
      if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`)
      break
    case 'null':
      if (value !== null) throw new Error(`${path} must be null`)
      break
    default:
      throw new Error(`${path} has unsupported type ${String(schema.type)}`)
  }
  if (schema.const !== undefined && value !== schema.const) throw new Error(`${path} must equal ${String(schema.const)}`)
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) throw new Error(`${path} is not one of ${schema.enum.join(', ')}`)
}
