// The shared formula parser (src/engine/formula.ts), with made-up formulas.
import { describe, expect, it } from 'vitest'
import { evalFormula, formulaText, issueNote, parseFormula, type Formula, type RefLookup } from '../../src/engine/formula'

const f = (expr: string, more: Partial<Formula> = {}): Formula => ({ field: 'cost', expr, ...more })
const n = (expr: string, vars = {}, ref?: RefLookup, more: Partial<Formula> = {}) => evalFormula(f(expr, more), vars, ref).n

describe('arithmetic', () => {
  it('reads numbers, + - * / and parentheses, × before +', () => {
    expect(n('2 + 3 * 4')).toBe(14)
    expect(n('(2 + 3) * 4')).toBe(20)
    expect(n('10 - 2 - 3')).toBe(5)
    expect(n('-3 + 5')).toBe(2)
    expect(n('R × 200', { R: 3 })).toBe(600)
  })
  it('rounds up by default, down when asked; Essence to two decimals', () => {
    expect(n('R / 2', { R: 3 })).toBe(2)
    expect(n('R / 2', { R: 3 }, undefined, { round: 'down' })).toBe(1)
    expect(n('0.1 * 3')).toBe(1) // 0.30000000000000004 rounds up to a whole nuyen…
    expect(n('0.1 * 3', {}, undefined, { field: 'essence' })).toBe(0.3) // …but Essence keeps its decimals
    expect(n('R * 1.5', { R: 2 })).toBe(3) // no float drift past a whole number
  })
  it('ceil, floor, min and max', () => {
    expect(n('ceil(R / 3) * 10', { R: 4 })).toBe(20)
    expect(n('floor(R / 3) * 10', { R: 5 })).toBe(10)
    expect(n('min(R * 100, 400)', { R: 6 })).toBe(400)
    expect(n('max(R, 2, 5)', { R: 3 })).toBe(5)
  })
})

describe('variables', () => {
  it('R, Q, M, B and opt.<id>', () => {
    expect(n('B * Q', { B: 20, Q: 3 })).toBe(60)
    expect(n('M * 1000', { M: 4 })).toBe(4000)
    expect(n('100 + opt.smart-link * 50', { opt: { 'smart-link': 2 } })).toBe(200)
    expect(n('opt.x-1', { opt: { x: 5 } })).toBe(4) // a dash before a digit is a minus
  })
  it('H: the item an add-on goes on (a material multiplying the ammunition it is loaded in)', () => {
    expect(n('H * 5', { H: 30 })).toBe(150)
    expect(evalFormula(f('H * 2'), {}).notes).toEqual(['not fitted to an item: worked out with 1 (its price is a multiple of the item it goes on)'])
  })
  it('a missing variable counts as 1, with a note', () => {
    const r = evalFormula(f('R * 200'), {})
    expect(r).toMatchObject({ n: 200, notes: ['no rating given: worked out at rating 1'] })
    expect(evalFormula(f('B + opt.mod'), {}).notes).toEqual(['no printed value: worked out with 1', 'option mod not given: counted as 1'])
  })
  it('says when the quantity is inside (the line’s whole price)', () => {
    expect(evalFormula(f('B * Q'), { B: 1, Q: 1 }).usesQ).toBe(true)
    expect(evalFormula(f('R * 2'), { R: 1 }).usesQ).toBe(false)
  })
})

describe('tier', () => {
  const t = 'tier(R; 1-3: 100; 4-6: R * 50; 7+: 999)'
  it('takes the value of the band the number falls in', () => {
    expect([1, 3, 4, 6, 7, 12].map(R => n(t, { R }))).toEqual([100, 100, 200, 300, 999, 999])
  })
  it('a single number is a band; outside every band is no value', () => {
    expect(n('tier(R; 2: 5)', { R: 2 })).toBe(5)
    expect(evalFormula(f('tier(R; 1-3: 100)'), { R: 9 })).toMatchObject({ n: null, error: 'tier() has no value for 9' })
  })
})

describe('ref', () => {
  const book: Record<string, number> = { 'gear:crb.kit cost 1': 200, 'gear:crb.kit cost 3': 600 }
  const ref: RefLookup = (kind, id, field, r) => book[`${kind}:${id} ${field} ${r ?? 1}`] ?? null
  it('another entry’s value, at this rating or the one given', () => {
    expect(n('ref(gear:crb.kit, cost) + 50', { R: 3 }, ref)).toBe(650)
    expect(n('ref(gear:crb.kit, cost, 1) * 2', { R: 3 }, ref)).toBe(400)
  })
  it('a broken ref leaves no number (never 0) and says why', () => {
    expect(evalFormula(f('ref(gear:crb.gone, cost)'), { R: 1 }, ref))
      .toMatchObject({ n: null, error: 'it refers to gear:crb.gone’s cost, which isn’t in the catalog' })
    expect(evalFormula(f('ref(gear:crb.kit, cost)'), {}).n).toBeNull() // no lookup at all
  })
})

describe('what it refuses', () => {
  it.each(['R +', '2 ** 3', 'Math.max(1)', 'constructor', 'alert(1)', 'R; 1', 'tier(R)', 'ref(crb.kit, cost)', 'min(1)', '1 / 0'])('%s', expr => {
    const r = evalFormula(f(expr), { R: 1 })
    expect(r.n).toBeNull()
    expect(r.error).toBeTruthy()
  })
  it('a very long formula', () => expect(() => parseFormula('1+'.repeat(400) + '1')).toThrow('too long'))
})

describe('as shown', () => {
  it('reads as words, with ¥ and the unit', () => {
    expect(formulaText(f('R * 200'))).toBe('Rating × 200¥')
    expect(formulaText(f('B', { unit: 'rounds', qty: '10' }), '20')).toBe('20¥ per 10 rounds')
    expect(formulaText(f('H * 0.1'))).toBe('The item it goes on × 0.1¥') // H: the item an add-on fits, named like the others
    expect(formulaText(f('B * 2'))).toBe('Printed value × 2¥')
    expect(formulaText({ field: 'avail', expr: 'R/2' })).toBe('Rating ÷ 2')
  })
  it('Review’s note for an issue', () => {
    expect(issueNote('Null Box', { field: 'avail', code: 'missing', page: 91, note: '' }))
      .toBe('Null Box: the book prints no availability, set it in Game data or an override file.')
    expect(issueNote('Odd Blade', { field: 'dv', code: 'unreadable', note: '' })).toBe('Odd Blade: the app can’t read the book’s damage, set it in Game data or an override file.')
  })
})
