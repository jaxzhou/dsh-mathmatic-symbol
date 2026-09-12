/**
 * A tiny, safe arithmetic expression compiler for figure coordinates and
 * curve definitions.
 *
 * The plugin must never `eval` model-authored text, so expressions are
 * tokenized and compiled into closures by a recursive-descent parser. The
 * grammar supports:
 *
 *   - numbers (including `1e-3`), `( )`, `+ - * / %` and right-associative `^`
 *   - implicit multiplication: `2x`, `3sin(x)`, `2(x+1)`, `x y`
 *   - constants `pi`, `π`, `tau`, `e`, `phi`
 *   - one- and two-argument functions (`sin`, `sqrt`, `atan2`, `log`, …)
 *   - backslash-prefixed names so LaTeX habits work: `\sin(x)`
 *
 * Compiled expressions are cached by source text. Unknown variables, unknown
 * functions, wrong arity, and over-deep nesting are hard errors: a silently
 * wrong coordinate is worse than a failed render.
 *
 * @module @jaxzhou/dsh-mathmatic-symbol/expr
 */

/** Values in scope while a compiled expression evaluates. */
export type ExprVars = Readonly<Record<string, number>>

/** One compiled, reusable expression. */
export type CompiledExpr = (vars: ExprVars) => number

interface FunctionDef {
  minArgs: number
  maxArgs: number
  apply: (args: readonly number[]) => number
}

/** Named mathematical constants available to every expression. */
const CONSTANTS: Readonly<Record<string, number>> = Object.freeze({
  pi: Math.PI,
  π: Math.PI,
  tau: Math.PI * 2,
  e: Math.E,
  phi: (1 + Math.sqrt(5)) / 2,
})

function define1(names: readonly string[], fn: (x: number) => number): [string, FunctionDef][] {
  return names.map(name => [name, { minArgs: 1, maxArgs: 1, apply: args => fn(args[0] as number) }])
}

function define2(names: readonly string[], fn: (a: number, b: number) => number): [string, FunctionDef][] {
  return names.map(name => [name, { minArgs: 2, maxArgs: 2, apply: args => fn(args[0] as number, args[1] as number) }])
}

/** Supported functions, by lower-case name. */
const FUNCTIONS: ReadonlyMap<string, FunctionDef> = new Map<string, FunctionDef>([
  ...define1(['sin'], Math.sin),
  ...define1(['cos'], Math.cos),
  ...define1(['tan'], Math.tan),
  ...define1(['asin', 'arcsin'], Math.asin),
  ...define1(['acos', 'arccos'], Math.acos),
  ...define1(['atan', 'arctan'], Math.atan),
  ...define1(['sinh'], Math.sinh),
  ...define1(['cosh'], Math.cosh),
  ...define1(['tanh'], Math.tanh),
  ...define1(['asinh'], Math.asinh),
  ...define1(['acosh'], Math.acosh),
  ...define1(['atanh'], Math.atanh),
  ...define1(['sqrt'], Math.sqrt),
  ...define1(['cbrt'], Math.cbrt),
  ...define1(['abs'], Math.abs),
  ...define1(['exp'], Math.exp),
  ...define1(['ln', 'log'], Math.log),
  ...define1(['log2'], Math.log2),
  ...define1(['log10'], Math.log10),
  ...define1(['floor'], Math.floor),
  ...define1(['ceil'], Math.ceil),
  ...define1(['round'], Math.round),
  ...define1(['trunc'], Math.trunc),
  ...define1(['sign'], Math.sign),
  ...define1(['cot'], x => 1 / Math.tan(x)),
  ...define1(['sec'], x => 1 / Math.cos(x)),
  ...define1(['csc'], x => 1 / Math.sin(x)),
  ...define2(['atan2'], Math.atan2),
  ...define2(['pow'], (a, b) => a ** b),
  ...define2(['hypot'], Math.hypot),
  ...define2(['min'], Math.min),
  ...define2(['max'], Math.max),
  ...define2(['mod'], (a, b) => a % b),
  ...define2(['gcd'], (a, b) => {
    let x = Math.abs(Math.trunc(a))
    let y = Math.abs(Math.trunc(b))
    while (y > 0) [x, y] = [y, x % y]
    return x
  }),
])

/** Maximum nesting depth, enforced while parsing rather than at stack overflow. */
const MAX_DEPTH = 64

/** Maximum accepted source length; expression input is model-authored. */
const MAX_SOURCE_LENGTH = 2_000

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'ident'; value: string }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' | '%' | '^' }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'comma' }

const IDENT_START = /[\p{L}_]/u
const IDENT_PART = /[\p{L}\p{N}_]/u

/** Split one expression source into tokens, or throw a positioned error. */
function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < source.length) {
    const char = source[index] as string
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      index += 1
      continue
    }
    if (char === '\\') {
      // LaTeX habit: `\sin`, `\theta`. The backslash is not part of the name.
      index += 1
      if (index >= source.length || !IDENT_START.test(source[index] as string)) {
        throw new Error(`unexpected "\\" at position ${index - 1}`)
      }
      continue
    }
    if ((char >= '0' && char <= '9') || char === '.') {
      const start = index
      while (index < source.length && /[0-9]/.test(source[index] as string)) index += 1
      if (source[index] === '.') {
        index += 1
        while (index < source.length && /[0-9]/.test(source[index] as string)) index += 1
      }
      if (source[index] === 'e' || source[index] === 'E') {
        const expStart = index
        index += 1
        if (source[index] === '+' || source[index] === '-') index += 1
        if (index < source.length && /[0-9]/.test(source[index] as string)) {
          while (index < source.length && /[0-9]/.test(source[index] as string)) index += 1
        } else {
          index = expStart
        }
      }
      const literal = source.slice(start, index)
      const value = Number(literal)
      if (!Number.isFinite(value)) throw new Error(`"${literal}" is not a finite number`)
      tokens.push({ kind: 'number', value })
      continue
    }
    if (IDENT_START.test(char)) {
      const start = index
      while (index < source.length && IDENT_PART.test(source[index] as string)) index += 1
      tokens.push({ kind: 'ident', value: source.slice(start, index) })
      continue
    }
    if (char === '(') { tokens.push({ kind: 'lparen' }); index += 1; continue }
    if (char === ')') { tokens.push({ kind: 'rparen' }); index += 1; continue }
    if (char === ',') { tokens.push({ kind: 'comma' }); index += 1; continue }
    if (char === '+' || char === '-' || char === '*' || char === '/' || char === '%' || char === '^') {
      tokens.push({ kind: 'op', value: char })
      index += 1
      continue
    }
    throw new Error(`unexpected character "${char}" at position ${index}`)
  }
  if (tokens.length === 0) throw new Error('the expression is empty')
  return tokens
}

const compiled = new Map<string, CompiledExpr>()

/**
 * Compile one expression source into a reusable closure.
 * @param source - the expression text.
 * @returns a closure evaluating the expression against the given variables.
 * @throws Error naming the offending token when the source does not parse.
 */
export function compileExpression(source: string): CompiledExpr {
  const cached = compiled.get(source)
  if (cached !== undefined) return cached
  if (source.length > MAX_SOURCE_LENGTH) {
    throw new Error(`the expression is longer than ${MAX_SOURCE_LENGTH} characters`)
  }
  const tokens = tokenize(source)
  let position = 0
  let depth = 0

  const peek = (): Token | undefined => tokens[position]

  const enter = (): void => {
    depth += 1
    if (depth > MAX_DEPTH) throw new Error(`the expression nests deeper than ${MAX_DEPTH} levels`)
  }
  const leave = (): void => { depth -= 1 }

  const startsPrimary = (token: Token | undefined): boolean =>
    token !== undefined && (token.kind === 'number' || token.kind === 'ident' || token.kind === 'lparen')

  const parseExpression = (): CompiledExpr => {
    enter()
    let left = parseTerm()
    for (;;) {
      const token = peek()
      if (token?.kind === 'op' && (token.value === '+' || token.value === '-')) {
        position += 1
        const right = parseTerm()
        const previous = left
        left = token.value === '+'
          ? vars => previous(vars) + right(vars)
          : vars => previous(vars) - right(vars)
        continue
      }
      break
    }
    leave()
    return left
  }

  const parseTerm = (): CompiledExpr => {
    enter()
    let left = parseUnary()
    for (;;) {
      const token = peek()
      if (token?.kind === 'op' && (token.value === '*' || token.value === '/' || token.value === '%')) {
        position += 1
        const right = parseUnary()
        const previous = left
        left = token.value === '*'
          ? vars => previous(vars) * right(vars)
          : token.value === '/'
            ? vars => previous(vars) / right(vars)
            : vars => previous(vars) % right(vars)
        continue
      }
      // Implicit multiplication: `2x`, `3sin(x)`, `2(x+1)`, `x y`.
      if (startsPrimary(token)) {
        const right = parseUnary()
        const previous = left
        left = vars => previous(vars) * right(vars)
        continue
      }
      break
    }
    leave()
    return left
  }

  const parseUnary = (): CompiledExpr => {
    enter()
    const token = peek()
    if (token?.kind === 'op' && (token.value === '-' || token.value === '+')) {
      position += 1
      const operand = parseUnary()
      leave()
      return token.value === '-' ? vars => -operand(vars) : operand
    }
    const power = parsePower()
    leave()
    return power
  }

  const parsePower = (): CompiledExpr => {
    enter()
    const base = parsePrimary()
    const token = peek()
    if (token?.kind === 'op' && token.value === '^') {
      position += 1
      const exponent = parseUnary()
      leave()
      return vars => base(vars) ** exponent(vars)
    }
    leave()
    return base
  }

  const parsePrimary = (): CompiledExpr => {
    enter()
    const token = peek()
    if (token === undefined) throw new Error('the expression ends unexpectedly: a missing operand or an unclosed "("')
    if (token.kind === 'number') {
      position += 1
      const value = token.value
      leave()
      return () => value
    }
    if (token.kind === 'lparen') {
      position += 1
      const inner = parseExpression()
      const closing = peek()
      if (closing?.kind !== 'rparen') throw new Error('a "(" is not closed')
      position += 1
      leave()
      return inner
    }
    if (token.kind === 'ident') {
      position += 1
      const name = token.value
      const definition = FUNCTIONS.get(name.toLowerCase())
      if (definition !== undefined && peek()?.kind === 'lparen') {
        position += 1
        const args: CompiledExpr[] = [parseExpression()]
        while (peek()?.kind === 'comma') {
          position += 1
          args.push(parseExpression())
        }
        const closing = peek()
        if (closing?.kind !== 'rparen') throw new Error(`the call to "${name}(…" is not closed`)
        position += 1
        if (args.length < definition.minArgs || args.length > definition.maxArgs) {
          const arity = definition.minArgs === definition.maxArgs
            ? `${definition.minArgs}`
            : `${definition.minArgs}–${definition.maxArgs}`
          throw new Error(`"${name}" takes ${arity} argument(s), not ${args.length}`)
        }
        leave()
        return vars => definition.apply(args.map(argument => argument(vars)))
      }
      if (CONSTANTS[name] !== undefined) {
        const value = CONSTANTS[name] as number
        leave()
        return () => value
      }
      const lower = name.toLowerCase()
      if (CONSTANTS[lower] !== undefined) {
        const value = CONSTANTS[lower] as number
        leave()
        return () => value
      }
      leave()
      return (vars) => {
        const value = vars[name]
        if (value === undefined) throw new Error(`unknown variable "${name}"`)
        if (!Number.isFinite(value)) throw new Error(`the variable "${name}" is not a finite number`)
        return value
      }
    }
    throw new Error(`unexpected token in the expression at position ${position}`)
  }

  const root = parseExpression()
  if (position !== tokens.length) throw new Error(`unexpected trailing input at token ${position}`)
  if (compiled.size > 512) compiled.clear()
  compiled.set(source, root)
  return root
}

/**
 * Evaluate one expression against the given variables.
 * @param source - the expression text.
 * @param vars - named values in scope.
 * @returns the numeric result (may be `NaN`/`Infinity` for out-of-domain input).
 */
export function evaluateExpression(source: string, vars: ExprVars = {}): number {
  return compileExpression(source)(vars)
}

/** Drop every cached compilation (used by the plugin's disposal effect). */
export function clearExpressionCache(): void {
  compiled.clear()
}
