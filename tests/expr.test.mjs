import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compileExpression, evaluateExpression } from '../lib/index.js'

test('arithmetic precedence and associativity', () => {
  assert.equal(evaluateExpression('1 + 2 * 3'), 7)
  assert.equal(evaluateExpression('(1 + 2) * 3'), 9)
  assert.equal(evaluateExpression('2 - 3 - 4'), -5)
  assert.equal(evaluateExpression('2 ^ 3 ^ 2'), 512)
  assert.equal(evaluateExpression('-2 ^ 2'), -4)
  assert.equal(evaluateExpression('7 % 4'), 3)
})

test('implicit multiplication', () => {
  assert.equal(evaluateExpression('2x', { x: 5 }), 10)
  assert.equal(evaluateExpression('2(x + 1)', { x: 4 }), 10)
  assert.equal(evaluateExpression('x y', { x: 3, y: 4 }), 12)
  assert.equal(evaluateExpression('2x^2', { x: 3 }), 18)
})

test('functions, constants, and LaTeX-style names', () => {
  assert.equal(evaluateExpression('sin(pi / 2)'), 1)
  assert.ok(Math.abs(evaluateExpression('\\cos(0) + \\sin(\\pi / 2)') - 2) < 1e-12)
  assert.equal(evaluateExpression('sqrt(9) + abs(-4)'), 7)
  assert.equal(evaluateExpression('max(2, 7)'), 7)
  assert.equal(evaluateExpression('atan2(0, -1)'), Math.PI)
  assert.ok(Math.abs(evaluateExpression('ln(e)') - 1) < 1e-12)
  assert.equal(evaluateExpression('round(2.4)'), 2)
  assert.equal(evaluateExpression('gcd(12, 18)'), 6)
})

test('scientific notation is a number, not implicit multiplication', () => {
  assert.equal(evaluateExpression('1e-3'), 0.001)
  assert.equal(evaluateExpression('2.5E2'), 250)
})

test('unknown variables and functions fail loudly', () => {
  assert.throws(() => evaluateExpression('nope + 1'), /unknown variable "nope"/)
  assert.throws(() => evaluateExpression('frobnicate(2)'), /unknown variable "frobnicate"/)
  assert.throws(() => evaluateExpression('sin(1, 2)'), /takes 1 argument/)
  assert.throws(() => evaluateExpression('sin('), /unclosed|not closed/)
  assert.throws(() => evaluateExpression(''), /empty/)
  assert.throws(() => evaluateExpression('1 # 2'), /unexpected character/)
})

test('deep nesting is rejected rather than overflowing the stack', () => {
  const deep = `${'('.repeat(200)}1${')'.repeat(200)}`
  assert.throws(() => evaluateExpression(deep), /nests deeper/)
})

test('compiled expressions are reusable and cached', () => {
  const first = compileExpression('a + b')
  const second = compileExpression('a + b')
  assert.equal(first, second)
  assert.equal(first({ a: 1, b: 2 }), 3)
  assert.equal(first({ a: 10, b: 20 }), 30)
})
