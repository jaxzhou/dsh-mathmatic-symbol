/**
 * A fake Cordis host for plugin tests: a tool map, optional services, effect
 * disposal, and a `ctx.inject` that resolves immediately when its dependencies
 * are already present.
 */

/**
 * Build one fake plugin context.
 * @param {Record<string, unknown>} services - services `ctx.get` and `ctx.inject` should answer.
 */
export function createHost(services = {}) {
  const tools = new Map()
  const disposers = []
  const effects = []
  const injections = []
  const ctx = {
    tools: {
      register(definition) {
        if (tools.has(definition.name)) throw new Error(`duplicate tool ${definition.name}`)
        tools.set(definition.name, definition)
        const dispose = () => tools.delete(definition.name)
        disposers.push(dispose)
        return dispose
      },
      get(toolName) {
        return tools.get(toolName)
      },
    },
    get(serviceName) {
      return services[serviceName]
    },
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') effects.push(dispose)
      return () => {}
    },
    inject(deps, callback) {
      injections.push([...deps])
      if (deps.every(dep => services[dep] !== undefined)) callback(ctx)
      return () => {}
    },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  }
  // Cordis exposes services as both `ctx.get(name)` and `ctx.<name>`; plugins
  // read the property, so the fake host must provide it too.
  for (const [serviceName, service] of Object.entries(services)) {
    if (!(serviceName in ctx)) ctx[serviceName] = service
  }
  return { ctx, tools, disposers, effects, injections }
}

/** A fake `ctx.systemPrompt` that records sections and answers order lookups. */
export function createSystemPrompt(orders = {}) {
  const sections = []
  return {
    sections,
    section(spec) {
      sections.push(spec)
      return () => {}
    },
    getSectionOrder(sectionName) {
      return orders[sectionName] ?? 0
    },
  }
}
