// A catalog entry's effects as the engine uses them (src/sr6/catalog/domain/effects.ts): the values it reads, the test types
// shown on every pool they cover, links to the entries an entry grants or works as, attribute maxima, condition
// monitor boxes, the words the hover card shows. Made-up fixture entries, invented numbers.
import { expect, test } from 'vitest'
import type { Sr6Build } from '../../../src/sr6/formats/domain/character'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'
import type { Sr6Data } from '../../../src/sr6/catalog/domain/data'
import type { Sr6Part } from '../../../src/sr6/formats/domain/types'
import { attrMax, augmentBonus, bracketNotes, conditionalBonuses, notesText } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { deriveSr6 } from '../../../src/sr6/runner-builder/domain/creation/derive'
import { bonusValue, effectBonuses, effectText, effectValue, testSkills } from '../../../src/sr6/catalog/domain/effects'
import { effectNotes } from '../../../src/sr6/runner-builder/ui/view'
import { buildOf, GLIM, made } from './fixture'

const fx = (target: string, op: string, value: string, more: Record<string, string> = {}): Sr6Part => ({
  tag: 'effect',
  attrs: { target, op, value, ...more },
  text: '',
})
const runner = (): Sr6Build => buildOf('priority', { letters: 'CABDA', metatype: GLIM })
const give = (d: Sr6Data, id: string, ...parts: Sr6Part[]) => {
  d.entry('qualities', id)!.parts.push(...parts)
}

test('a value: a number, so much per rating, or a formula shown only', () => {
  expect(effectValue('2')).toEqual({ value: 2 })
  expect(effectValue('-1')).toEqual({ value: -1 })
  expect(effectValue('R')).toEqual({ value: 1, perRating: true })
  expect(effectValue('-R')).toEqual({ value: -1, perRating: true })
  expect(effectValue('R*2')).toEqual({ value: 2, perRating: true })
  expect(effectValue('2*R')).toEqual({ value: 2, perRating: true })
  expect(effectValue('edg/2')).toBeUndefined()
  expect(effectValue('0,1,1,0,0')).toBeUndefined()
  // owner decisions 2026-10-11: a level after the first, the book's own value per rating
  expect(effectValue('R-1')).toEqual({ value: 1, perRating: true, minus: 1 })
  expect(effectValue('R*2-2')).toEqual({ value: 2, perRating: true, minus: 2 })
  expect(effectValue('R[1,1,2,2]')).toEqual({ value: 1, byRating: [1, 1, 2, 2] })
  expect([1, 2, 3].map(r => bonusValue({ value: 1, perRating: true, minus: 1 }, r))).toEqual([0, 1, 2])
  expect([1, 3, 9].map(r => bonusValue({ value: 1, byRating: [1, 1, 2, 2] }, r))).toEqual([1, 2, 2])
  expect(bonusValue({ value: 2, perRating: true }, 3)).toBe(6)
  expect(bonusValue({ value: 2 }, 3)).toBe(2)
})

test('what others get against the entry is never the runner’s: shown, not counted (owner decision 16, 2026-10-11)', () => {
  const { data } = made({
    data: d => give(d, 'crb.knack', fx('skill:perception', 'edge', '1', { affects: 'others' }), fx('attr:agi', 'add', '1', { affects: 'others' })),
  })
  expect(effectBonuses(data, data.entry('qualities', 'crb.knack'))).toEqual([])
  expect(effectText(fx('skill:perception', 'edge', '1', { affects: 'others' }))).toBe('others get: +1 Edge on Perception tests (affects others)')
})

test('the words for a level after the first, a value per rating and a removed band', () => {
  expect(effectText(fx('skill:stealth', 'add', 'R-1'))).toBe('+(rating − 1) Stealth dice')
  expect(effectText(fx('item:dv', 'add', 'R[1,1,2,2]'))).toBe('1/1/2/2 by rating Damage Value')
  expect(effectText(fx('item:ar', 'add', '2,1,-2,0,x'))).toBe('+2/+1/-2/–/— (removed) Attack Rating')
  expect(effectText(fx('action-max:take-aim', 'add', 'R'))).toBe('+rating the Take Aim action’s maximum bonus')
})

test('a test type covers the skills the book lists, or the skills linked to an attribute', () => {
  const { data } = made()
  expect(testSkills(data, 'attr-cha')).toEqual(['crb.gab'])
  expect(testSkills(data, 'mental')).toContain('crb.tinkering')
  expect(testSkills(data, 'damage-resistance')).toEqual([])
})

test('an entry’s effects apply: attributes, boxes, a test type’s pools; low-confidence and conditional ones are shown only', () => {
  const { data, cr } = made({
    data: d =>
      give(
        d,
        'crb.knack',
        fx('attr:bod', 'add', '1'),
        fx('derived:stun-monitor', 'add', '2'),
        fx('derived:overflow', 'add', 'R'),
        fx('test:attr-cha', 'add', '2'),
        fx('attr:agi', 'add', '1', { confidence: 'low', switch: 'activated' }),
        fx('test:attr-cha', 'add', '1', { confidence: 'low', switch: 'conditional', when: 'haggling' }),
      ),
  })
  const b = runner()
  const before = deriveSr6(data, cr, { ...blankSr6(b.method, 't'), build: structuredClone(b) })
  b.qualities.push({ uid: 'q', id: 'crb.knack', level: 1 })
  const ch = { ...blankSr6(b.method, 't'), build: b },
    d = deriveSr6(data, cr, ch)
  expect(d.attrs.bod.augmented).toBe(before.attrs.bod.augmented + 1)
  expect(d.attrs.agi.augmented).toBe(before.attrs.agi.augmented) // (activated: shown, not applied)
  expect(d.monitors.stun).toBe((before.monitors.stun ?? 0) + 2)
  expect(d.monitors.overflow).toBe(before.monitors.overflow + 1 + 1) // (+1 Body, +1 a level)
  expect(augmentBonus(b, data, 'skill', 'crb.gab')).toBe(2)
  expect(conditionalBonuses(b, data, 'crb.gab')).toEqual([]) // (a low-confidence one isn't even shown with the pool)
})

test('a link: the entry it grants or works as gives its effects, by id or by its printed name', () => {
  const { data } = made({
    data: d => {
      give(d, 'crb.stoneskin', fx('derived:defense', 'add', '2'))
      give(d, 'crb.knack', { tag: 'link', attrs: { rel: 'grants', name: 'Stoneskin', kind: 'qualities' }, text: '' })
      give(d, 'crb.lucky-streak', { tag: 'link', attrs: { rel: 'as', name: 'Knack', kind: 'qualities', ref: 'crb.knack' }, text: '' })
    },
  })
  expect(effectBonuses(data, data.entry('qualities', 'crb.knack'))).toEqual([{ target: 'defense', value: 2 }])
  expect(effectBonuses(data, data.entry('qualities', 'crb.lucky-streak'))).toEqual([{ target: 'defense', value: 2 }])
})

test('an attribute maximum: a quality’s table sets it, its prose raises it; a chosen attribute’s is the player’s', () => {
  const { data, cr } = made({
    data: d => {
      give(d, 'crb.knack', fx('attr-max:str', 'set', '9'), fx('attr-max:choice', 'add', '1'))
      give(d, 'crb.stoneskin', fx('attr-max:bod', 'add', 'R'))
    },
  })
  const b = runner(),
    base = (k: 'str' | 'bod') => attrMax(data, cr, b, k)!
  const str = base('str'),
    bod = base('bod')
  b.qualities.push({ uid: 'k', id: 'crb.knack', level: 1 }, { uid: 's', id: 'crb.stoneskin', level: 2 })
  expect(attrMax(data, cr, b, 'str')).toBe(9)
  expect(attrMax(data, cr, b, 'bod')).toBe(bod + 2)
  expect(str).not.toBe(9)
})

test('the quality the settings name (Built Tough, Dermal Deposits) counts once, when its own effects add the same', () => {
  const { data, cr } = made({
    rules: { builtToughQuality: 'crb.lucky-streak' },
    data: d => give(d, 'crb.lucky-streak', fx('derived:physical-monitor', 'add', 'R')),
  })
  const b = runner(),
    plain = deriveSr6(data, cr, { ...blankSr6(b.method, 't'), build: structuredClone(b) }).monitors.physical!
  b.qualities.push({ uid: 'q', id: 'crb.lucky-streak', level: 2 })
  expect(deriveSr6(data, cr, { ...blankSr6(b.method, 't'), build: b }).monitors.physical).toBe(plain + 2)
})

test('the words an effect shows', () => {
  expect(effectText(fx('test:social', 'edge', '1'))).toBe('+1 Edge on Social tests')
  expect(effectText(fx('skill:close-combat', 'add', 'R', { switch: 'wireless', confidence: 'low' }))).toBe('wireless: +rating Close Combat dice')
  expect(effectText(fx('test:attr-cha', 'no-edge', '1'))).toBe('no Edge spent on tests using Charisma')
  expect(effectText(fx('skill:athletics', 'edge-cost', '-1', { when: 'climbing' }))).toBe('Edge boosts and actions cost 1 less on Athletics tests (climbing)')
  expect(effectText(fx('attr-max:str', 'set', '9'))).toBe('maximum Strength 9')
  expect(effectText(fx('item:ar', 'add', '2,0,-1,-2,-3'))).toBe('+2/–/-1/-2/-3 Attack Rating')
  expect(effectText(fx('test:other', 'edge', '1', { when: 'juggling' }))).toBe('+1 Edge on tests for juggling')
  expect(effectText({ tag: 'link', attrs: { rel: 'grants', name: 'Glow Step', level: '1', when: 'adept' }, text: '' })).toBe('grants Glow Step 1 (adept)')
})

test('the sheet lists what the numbers don’t hold: switched effects, rule kinds and links', () => {
  const { data } = made({
    data: d =>
      give(
        d,
        'crb.knack',
        fx('attr:bod', 'add', '1'),
        fx('test:attr-cha', 'edge', '1'),
        fx('attr:agi', 'add', '1', { confidence: 'low', switch: 'activated' }),
        { tag: 'link', attrs: { rel: 'grants', name: 'Stoneskin' }, text: '' },
      ),
  })
  const b = runner()
  b.qualities.push({ uid: 'q', id: 'crb.knack', level: 1 })
  expect(effectNotes(b, data).map(x => x.text)).toEqual(['+1 Edge on tests using Charisma', 'activated: +1 Agility', 'grants Stoneskin'])
})

test('switchable and conditional effects count in the bracketed total; a specialization’s in its pool; a spell’s on its target never', () => {
  const { data, cr } = made({
    data: d => {
      give(
        d,
        'crb.knack',
        fx('attr:bod', 'add', '1'),
        fx('attr:agi', 'add', '2', { switch: 'wireless' }),
        fx('test:attr-cha', 'add', '3', { when: 'haggling' }),
        fx('skill:gab', 'add', '2', { spec: 'Haggling' }),
      )
      d.entry('spells', 'crb.glow-ward')!.parts.push(
        fx('attr:rea', 'add', '1', { switch: 'sustained', affects: 'caster' }),
        fx('attr:str', 'add', '4', { switch: 'sustained', affects: 'target' }),
      )
    },
  })
  const b = runner()
  b.skills = [...b.skills.filter(s => s.id !== 'crb.gab'), { id: 'crb.gab', points: 2, karma: 0 }]
  const base = deriveSr6(data, cr, { ...blankSr6(b.method, 't'), build: structuredClone(b) })
  b.qualities.push({ uid: 'q', id: 'crb.knack', level: 1 })
  b.picks.push({ uid: 'p', kind: 'spells', id: 'crb.glow-ward' })
  const ch = { ...blankSr6(b.method, 't'), build: b }
  const at = (d: { attrs: typeof base.attrs }, k: 'bod' | 'agi' | 'rea' | 'str') => d.attrs[k].augmented - base.attrs[k].augmented
  let d = deriveSr6(data, cr, ch)
  expect([at(d, 'bod'), at(d, 'agi'), at(d, 'rea'), at(d, 'str')]).toEqual([1, 0, 0, 0])
  expect([at(d.on, 'bod'), at(d.on, 'agi'), at(d.on, 'rea'), at(d.on, 'str')]).toEqual([1, 2, 1, 0]) // (never the target's +4)
  const gab = (x: { pools: typeof base.pools }) => x.pools.find(p => p.skill === 'crb.gab')!
  const plain = gab(base).dp
  expect(gab(d).dp).toBe(plain)
  expect(gab(d.on).dp).toBe(plain + 3 + 2) // (haggling, and the specialization the runner hasn't)
  expect(
    conditionalBonuses(b, data, 'crb.gab')
      .map(x => x.value)
      .sort(),
  ).toEqual([2, 3])
  b.skills = [...b.skills.filter(s => s.id !== 'crb.gab'), { id: 'crb.gab', points: 2, karma: 0, spec: 'haggling' }]
  d = deriveSr6(data, cr, ch)
  const specDice = Number(cr.get('specDice')?.value)
  expect(gab(d).specDp).toBe(gab(d).dp + specDice + 2)
  expect(gab(d.on).dp).toBe(gab(d).dp + 3) // (its specialization's bonus is in the specialization's pool, not the skill's)
})

test('each bracketed bonus is named: its switch or condition, and a spell’s caster', () => {
  const { data } = made({
    data: d => {
      give(d, 'crb.knack', fx('attr:agi', 'add', '2', { switch: 'wireless' }), fx('attr:agi', 'add', '1', { when: 'in darkness' }), fx('attr:agi', 'add', '1'))
      d.entry('spells', 'crb.glow-ward')!.parts.push(fx('attr:agi', 'add', '1', { switch: 'sustained', affects: 'caster' }))
    },
  })
  const b = runner()
  b.qualities.push({ uid: 'q', id: 'crb.knack', level: 1 })
  b.picks.push({ uid: 'p', kind: 'spells', id: 'crb.glow-ward' })
  expect(
    notesText(bracketNotes(b, data, 'agi'))
      .split('\n')
      .sort(),
  ).toEqual(['+1 Glow Ward (sustained, affects the caster)', '+1 Knack (in darkness)', '+2 Knack (wireless)'])
  expect(effectText(fx('attr:agi', 'add', '1', { switch: 'sustained', affects: 'caster' }))).toBe('sustained: +1 Agility (affects the caster)')
  expect(effectNotes(b, data).map(x => x.text)).toContain('☐ +1 Agility (in darkness)') // (a tick box on the sheet, owner 2026-10-11)
})
