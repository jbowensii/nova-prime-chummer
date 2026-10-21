// The formula parser's error messages and limits (src/core/shared/formula.ts): each way a formula is refused says why, with the
// position; unicode minus and times read; deep nesting stops; a result that is no number is no price.
import { describe, expect, it } from 'vitest'
import { evalFormula, fieldName, parseFormula, type Formula } from '../../../src/engine/formula'

const f = (expr: string, more: Partial<Formula> = {}): Formula => ({ field: 'cost', expr, ...more })
const err = (expr: string) => evalFormula(f(expr), { R: 1 }).error

describe('each refusal says why', () => {
  it.each([
    ['R +', 'the formula ends too soon'],
    ['(1 + 2', 'expected “)” at 7'],
    ['2 $ 3', 'can’t read “$ 3”'],
    ['1 2', 'can’t read “2”'],
    ['hello', 'unknown name “hello”'],
    ['opt.', 'an option needs its id (opt.<id>) at 4'],
    ['tier(R; x: 1)', 'expected a whole number at 9'],
    ['tier(R)', 'tier() needs at least one “from-to: value”'],
    ['tier(R; 1-3 5)', 'expected “:” at 13'],
    ['ref(crb.kit, cost)', 'ref() starts with kind:id'],
    ['ref(gear:crb.kit cost)', 'ref() starts with kind:id'],
    ['ref(gear:crb.kit, 9cost)', 'ref() needs a field name second'],
    ['ceil(1, 2)', 'ceil() takes one value'],
    ['min(1)', 'min() takes two or more values'],
    ['1 / 0', 'it divides by zero'],
  ])('%s', (expr, why) => expect(err(expr)).toContain(why))
  it('the whole message names the formula', () => {
    expect(err('hello')).toBe('can’t read the formula “hello”: unknown name “hello”')
  })
})

describe('reading', () => {
  it('unicode times and minus read as * and -; a leading decimal point is a number; a minus before a group negates it', () => {
    expect(evalFormula(f('3 × 4 – 2 − 1'), {}).n).toBe(9)
    expect(evalFormula(f('.5 * 4'), {}).n).toBe(2)
    expect(evalFormula(f('-(2 + 3)'), {}).n).toBe(-5)
    expect(evalFormula(f('- - 2'), {}).n).toBe(2)
  })
  it('a long chain of parentheses is refused as too deep; a modest one is fine', () => {
    expect(err('('.repeat(45) + '1' + ')'.repeat(45))).toContain('the formula nests too deeply')
    expect(evalFormula(f('('.repeat(10) + '2' + ')'.repeat(10)), {}).n).toBe(2)
  })
  it('a ref with a rating expression, and a tier with a single-number band beside an open band', () => {
    const r = evalFormula(f('ref(gear:crb.kit, cost, R + 1)'), { R: 2 }, (k, id, field, rating) => (rating === 3 ? 30 : null))
    expect(r.n).toBe(30)
    expect(evalFormula(f('tier(R; 1: 10; 2+: 20)'), { R: 5 }).n).toBe(20)
  })
  it('a result that is not a number is no price, never 0', () => {
    const r = evalFormula(f('R * 1000000'), { R: Number.POSITIVE_INFINITY })
    expect(r).toMatchObject({ n: null, error: 'it doesn’t work out to a number' })
  })
  it('negative zero is zero', () => {
    expect(Object.is(evalFormula(f('-0'), {}).n, 0)).toBe(true)
    expect(Object.is(evalFormula(f('0 * -1'), {}).n, 0)).toBe(true)
  })
  it('parseFormula returns the tree for a plain number', () => {
    expect(parseFormula('7')).toEqual({ t: 'num', v: 7 })
  })
})

describe('field names', () => {
  it('a known field has its sentence name, any other is itself', () => {
    expect(fieldName('avail')).toBe('availability')
    expect(fieldName('dv')).toBe('damage')
    expect(fieldName('strange')).toBe('strange')
  })
})
