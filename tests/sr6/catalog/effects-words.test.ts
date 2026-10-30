// The words and conditions of an SR6 effect (src/sr6/catalog/domain/effects.ts): every target and value form the hover cards print,
// each effect operation, an effect's state, and the less usual ways bonuses are read (a chosen skill or attribute, a
// grant at a level, an attribute maximum from a table). Invented values.
import { expect, test } from 'vitest'
import { bonusValue, effectBonuses, effectState, effectText, effectValue, linkedEntries, maxEffects, targetText } from '../../../src/sr6/catalog/domain/effects'
import type { Sr6Entry, Sr6Part } from '../../../src/sr6/formats/domain/types'
import { made } from './fixture'

const fx = (target: string, op: string, value: string, more: Record<string, string> = {}): Sr6Part => ({
  tag: 'effect',
  attrs: { target, op, value, ...more },
  text: '',
})
const link = (attrs: Record<string, string>): Sr6Part => ({ tag: 'link', attrs, text: '' })

test('target words, by kind', () => {
  const words: [string, string][] = [
    ['attr:wil', 'Willpower'],
    ['attr:zzz', 'zzz'],
    ['attr-max:log', 'maximum Logic'],
    ['attr-max:zzz', 'maximum zzz'],
    ['skill:choice', 'a chosen skill'],
    ['skill:close-combat', 'Close Combat'],
    ['skill-max:choice', 'a chosen skill’s maximum'],
    ['skill-max:close-combat', 'maximum Close Combat'],
    ['action-max:wrest', 'the Wrest action’s maximum bonus'],
    ['sense:low-light', 'Low Light'],
    ['pool:chase', 'the chase pool’s Edge'],
    ['pool:defense-test', 'the Defense Test pool'],
    ['pricemod:armor', 'armor and clothing prices'],
    ['pricemod:cyberware', 'Cyberware prices'],
    ['complex-form:static-veil', 'the Static Veil complex form'],
    ['test:attr-cha', 'tests using Charisma'],
    ['test:attr-zzz', 'tests using zzz'],
    ['test:spell-combat', 'Combat spells'],
    ['test:all', 'all tests'],
    ['test:other', 'those tests'],
    ['test:social', 'Social tests'],
    ['derived:defense', 'Defense Rating'],
    ['derived:odd-thing', 'Odd Thing'],
    ['derived:adept-drain-attribute', 'adept drain resisted with'],
    ['derived:wound-penalty', 'wound penalty'],
    ['derived:wound-threshold', 'wound threshold (boxes)'],
    ['derived:drain-value', 'Drain Value'],
    ['item:damage-type', 'damage type'],
    ['matrix:overwatch', 'Overwatch Score'],
    ['matrix:choice', 'a chosen Matrix attribute'],
    ['matrix:data-processing', 'Data Processing'],
    ['item:ar', 'Attack Rating'],
    ['limb-attr:agi', 'the limb’s own Agility'],
    ['derived:matrix-defense', 'Matrix Defense Rating'],
    ['test:defense-astral', 'astral defense tests'],
    ['test:defense-spell-direct', 'defense tests against direct combat spells'],
    ['test:defense-spell-indirect', 'defense tests against indirect combat spells'],
    ['item:odd-stat', 'Odd Stat'],
    ['action:wrest', 'the Wrest Edge action'],
    ['lifestyle:comforts', 'Comforts (lifestyle points)'],
    ['resource:starting-nuyen', 'Starting Nuyen'],
    ['mystery:thing', 'mystery:thing'],
  ]
  for (const [t, w] of words) expect(targetText(t), t).toBe(w)
})

test('value words: per rating, after the first level, a band list, a formula over an attribute, a percent, and the book’s own forms', () => {
  const sets: [string, string][] = [
    // an op=set effect prints its value as is, through valueText
    ['R', 'rating'],
    ['-R', '−rating'],
    ['R-1', '(rating − 1)'],
    ['R*2-2', '2 × (rating − 2)'],
    ['R[1,1,2]', '1/1/2 by rating'],
    ['edg/2 RD', 'Edge ÷ 2 (round down)'],
    ['-wil/2 RU', '-Willpower ÷ 2 (round up)'],
    ['bod/3', 'Body ÷ 3'],
    ['odd-attr/2', 'odd attr ÷ 2'],
    ['agi', 'Agility'],
    ['-str', '−Strength'],
    ['xyz', 'xyz'],
    ['1,0,x,-1', '+1/–/— (removed)/-1'],
    ['N', 'native'],
    ['R/-R', '+rating on-road, −rating off-road'],
    ['0.25', '25%'],
    ['R*3', '3 × rating'],
    ['2.5*R', '2.5 × rating'],
    ['7', '7'],
  ]
  for (const [v, w] of sets) expect(effectText(fx('derived:defense', 'set', v)), v).toBe(`Defense Rating ${w}`)
})

test('the rule changes of the effects review read as sentences: the drain attribute, the wound penalty and threshold, the Drain Value, the damage type', () => {
  expect(effectText(fx('derived:adept-drain-attribute', 'set', 'log'))).toBe('adept drain resisted with Logic')
  expect(effectText(fx('derived:adept-drain-attribute', 'set', 'choice'))).toBe('adept drain resisted with a chosen attribute')
  expect(effectText(fx('derived:adept-drain-attribute', 'set', 'tradition'))).toBe('adept drain resisted with the tradition’s attribute')
  expect(effectText(fx('derived:wound-penalty', 'add', '-1', { switch: 'conditional', when: 'acting for the ideal' }))).toBe(
    '-1 wound penalty (acting for the ideal)',
  )
  expect(effectText(fx('derived:wound-threshold', 'add', 'R'))).toBe('+rating wound threshold (boxes)')
  expect(effectText(fx('derived:drain-value', 'add', '2'))).toBe('+2 Drain Value')
  expect(effectText(fx('item:damage-type', 'set', 'S'))).toBe('damage type Stun')
  expect(effectText(fx('item:damage-type', 'set', 'S(e)'))).toBe('damage type Stun (electrical)')
  expect(effectText(fx('derived:unarmed-damage', 'set', 'P'))).toBe('unarmed damage Physical')
})

test('every effect operation reads as a sentence; a price change and a sense are signed or bare', () => {
  expect(effectText(fx('derived:defense', 'add', '2'))).toBe('+2 Defense Rating')
  expect(effectText(fx('derived:defense', 'add', '-2'))).toBe('-2 Defense Rating')
  expect(effectText(fx('derived:defense', 'add', 'R*-1'))).toBe('-1 × rating Defense Rating')
  expect(effectText(fx('pricemod:gear', 'mult', '0.5'))).toBe('gear prices +50%')
  expect(effectText(fx('pricemod:gear', 'mult', '-0.5'))).toBe('gear prices -0.5')
  expect(effectText(fx('sense:low-light', 'add', '1'))).toBe('Low Light')
  expect(effectText(fx('test:social', 'edge-cost', '2'))).toBe('Edge boosts and actions cost 2 more on Social tests')
  expect(effectText(fx('test:social', 'edge-cost-set', '1'))).toBe('Social tests costs 1 Edge')
  expect(effectText(fx('test:social', 'no-edge-gain', '1'))).toBe('no Edge gained on Social tests')
  expect(effectText(fx('test:social', 'wild-die', '1'))).toBe('a wild die on Social tests')
  expect(effectText(fx('test:social', 'hits', '1'))).toBe('+1 hits on Social tests')
  expect(effectText(fx('test:social', 'threshold', '-1'))).toBe('threshold -1 on Social tests')
  expect(effectText({ tag: 'effect', attrs: { target: 'derived:defense', op: 'add' }, text: '' })).toBe('+ Defense Rating')
})

test('who is affected and how an effect is switched show in the sentence', () => {
  expect(effectText(fx('derived:defense', 'add', '1', { affects: 'target' }))).toBe('on the target: +1 Defense Rating')
  expect(effectText(fx('derived:defense', 'add', '1', { affects: 'others', when: 'near' }))).toBe('others get: +1 Defense Rating (near, affects others)')
  expect(effectText(fx('derived:defense', 'add', '1', { affects: 'caster' }))).toBe('+1 Defense Rating (affects the caster)')
  expect(effectText(fx('derived:defense', 'add', '1', { switch: 'conditional', when: 'in the dark' }))).toBe('+1 Defense Rating (in the dark)')
  expect(effectText(fx('skill:athletics', 'add', '2', { spec: 'climbing' }))).toBe('+2 Athletics (climbing) dice')
  expect(effectText(fx('skill:athletics', 'edge', '1'))).toBe('+1 Edge on Athletics tests')
  expect(effectText(fx('skill:choice', 'add', '1'))).toBe('+1 a chosen skill')
  expect(effectText(link({ rel: 'as', name: 'Knack' }))).toBe('works as Knack')
  expect(effectText(link({ rel: 'grants', name: 'Knack' }))).toBe('grants Knack')
})

test('an effect’s state: low confidence, the target’s, switched or conditional, link grants, or plainly applied', () => {
  expect(effectState(fx('derived:defense', 'add', '1'))).toBe('applied')
  expect(effectState(fx('derived:defense', 'add', '1', { confidence: 'low' }))).toBe('low')
  expect(effectState(fx('derived:defense', 'add', '1', { affects: 'target' }))).toBe('target')
  expect(effectState(fx('derived:defense', 'add', '1', { affects: 'others' }))).toBe('target')
  expect(effectState(fx('derived:defense', 'add', '1', { switch: 'wireless' }))).toBe('conditional')
  expect(effectState(fx('derived:defense', 'add', '1', { when: 'x' }))).toBe('conditional')
  expect(effectState(fx('skill:athletics', 'add', '1', { spec: 'x' }))).toBe('conditional')
  expect(effectState(link({ name: 'Knack' }))).toBe('applied')
  expect(effectState(link({ name: 'Knack', when: 'in animal form' }))).toBe('conditional')
})

test('values: numbers, per-rating forms, tables; formulas stay unread', () => {
  expect(effectValue('+3')).toEqual({ value: 3 })
  expect(effectValue(' 2.5 ')).toEqual({ value: 2.5 })
  expect(effectValue('R')).toEqual({ value: 1, perRating: true })
  expect(effectValue('-R')).toEqual({ value: -1, perRating: true })
  expect(effectValue('R*2-2')).toEqual({ value: 2, perRating: true, minus: 2 })
  expect(effectValue('2*R')).toEqual({ value: 2, perRating: true })
  expect(effectValue('R[1,2,3]')).toEqual({ value: 1, byRating: [1, 2, 3] })
  expect(effectValue('edg/2')).toBeUndefined()
  expect(effectValue(undefined)).toBeUndefined()
  expect(effectValue('')).toBeUndefined()
})

test('a bonus at a rating: flat, per rating, less its minus (never below nothing), or its table’s entry (clamped to the table)', () => {
  expect(bonusValue({ value: 2 }, 5)).toBe(2)
  expect(bonusValue({ value: 2, perRating: true }, 3)).toBe(6)
  expect(bonusValue({ value: 2, perRating: true, minus: 2 }, 1)).toBe(0)
  expect(bonusValue({ value: 2, perRating: true, minus: 2 }, 3)).toBe(4)
  expect(bonusValue({ value: 1, byRating: [1, 2, 4] }, 2)).toBe(2)
  expect(bonusValue({ value: 1, byRating: [1, 2, 4] }, 9)).toBe(4)
  expect(bonusValue({ value: 1, byRating: [1, 2, 4] }, 0)).toBe(1)
})

const give = (e: Sr6Entry | undefined, ...parts: Sr6Part[]) => {
  e!.parts = [...e!.parts, ...parts]
}

test('a chosen skill or attribute is the one the note names; an attribute maximum beside it keeps the choice for the maximum', () => {
  const { data } = made()
  const q = data.entry('qualities', 'crb.knack')!
  give(q, fx('skill:choice', 'add', '2'), fx('attr:choice', 'add', '1'))
  expect(effectBonuses(data, q, 0, { skill: 'crb.gab', attr: 'cha' })).toEqual([
    { target: 'skill', skill: 'crb.gab', value: 2 },
    { target: 'cha', value: 1 },
  ])
  expect(effectBonuses(data, q)).toEqual([]) // no choice made: nothing to count
  const m = data.entry('qualities', 'crb.stoneskin')!
  give(m, fx('attr:choice', 'add', '1'), fx('attr-max:choice', 'add', '1'))
  expect(effectBonuses(data, m, 0, { attr: 'cha' })).toEqual([]) // beside an attr-max:choice, the choice is the maximum's
})

test('effects with a condition, a switch, a spec or a target keep them; an unknown skill name or a test type with no skill adds nothing', () => {
  const { data } = made()
  const q = data.entry('qualities', 'crb.butterfingers')!
  give(
    q,
    fx('attr:bod', 'add', 'R', { when: 'wounded', switch: 'activated', affects: 'caster' }),
    fx('skill:no-such-skill', 'add', '1'),
    fx('skill:tinkering', 'add', '1', { spec: 'gadgets' }),
    fx('test:resistance', 'add', '1'),
    fx('unknown:thing', 'add', '1'),
    fx('attr:bod', 'add', '1', { switch: 'bogus' }),
  )
  expect(effectBonuses(data, q)).toEqual([
    { target: 'bod', value: 1, perRating: true, when: 'wounded', switch: 'activated', affects: 'caster' },
    { target: 'skill', skill: 'crb.tinkering', value: 1, spec: 'gadgets' },
    { target: 'bod', value: 1 },
  ])
})

test('a grant with a condition passes it on to every effect it brings; armor does not add its Defense effect twice; links do not recurse forever', () => {
  const { data } = made()
  const a = data.entry('qualities', 'crb.knack')!,
    b = data.entry('qualities', 'crb.stoneskin')!
  give(b, fx('derived:defense', 'add', '2'), link({ rel: 'grants', name: 'Knack', kind: 'qualities', ref: 'crb.knack' }))
  give(a, link({ rel: 'grants', name: 'Stoneskin', kind: 'qualities', ref: 'crb.stoneskin', when: 'in animal form' }))
  const got = effectBonuses(data, a)
  expect(got[0]).toEqual({ target: 'defense', value: 2, when: 'in animal form' })
  expect(got.length).toBeLessThanOrEqual(3) // a cycle stops two levels down
  const armor = data.entry('armor', 'crb.padded-vest')!
  give(armor, fx('derived:defense', 'add', '1'), fx('derived:physical-monitor', 'add', '1'))
  expect(effectBonuses(data, armor)).toEqual([{ target: 'physical', value: 1 }])
})

test('links: a named entry at a level takes that level of its family; one with no level takes the entry; a self-link is skipped', () => {
  const { data } = made()
  const q = data.entry('qualities', 'crb.knack')!
  give(
    q,
    link({ rel: 'grants', name: 'Lucky Streak', kind: 'qualities', ref: 'crb.lucky-streak', level: '2' }),
    link({ rel: 'grants', name: 'Knack', kind: 'qualities', ref: 'crb.knack' }),
    link({ rel: 'grants', name: 'Nothing Like This' }),
  )
  expect(linkedEntries(data, q).map(l => l.entry.id)).toEqual(['crb.lucky-streak.2'])
  expect(linkedEntries(data, undefined)).toEqual([])
  const bare = { ...data, named: undefined, atLevel: undefined } as unknown as typeof data
  give(q, link({ rel: 'grants', name: 'Stoneskin', kind: 'qualities', ref: 'crb.stoneskin', level: '3' }))
  expect(linkedEntries(bare, q).map(l => l.entry.id)).toContain('crb.stoneskin')
})

test('links: a link marked copied is not followed again (the importer put the linked entry’s effects on the entry)', () => {
  const { data } = made()
  const q = data.entry('qualities', 'crb.knack')!
  give(
    q,
    link({ rel: 'grants', name: 'Stoneskin', kind: 'qualities', ref: 'crb.stoneskin', copied: 'yes' }),
    link({ rel: 'grants', name: 'Lucky Streak', kind: 'qualities', ref: 'crb.lucky-streak' }),
  )
  expect(linkedEntries(data, q).map(l => l.entry.id)).toEqual(['crb.lucky-streak'])
})

test('attribute maxima: a set, an add per rating, a chosen attribute’s; low confidence, conditional and unknown attributes are skipped', () => {
  const e = {
    parts: [
      fx('attr-max:str', 'set', '9'),
      fx('attr-max:str', 'add', '1'),
      fx('attr-max:agi', 'add', 'R'),
      fx('attr-max:choice', 'add', '1'),
      fx('attr-max:bod', 'add', '1', { confidence: 'low' }),
      fx('attr-max:wil', 'add', '1', { when: 'x' }),
      fx('attr-max:zzz', 'add', '1'),
      fx('attr-max:log', 'mult', '2'),
      fx('attr-max:cha', 'add', 'edg/2'),
      fx('attr:int', 'add', '1'),
    ],
  } as unknown as Sr6Entry
  expect(maxEffects(e)).toEqual({ str: { set: 9, add: 1 }, agi: { add: 1, perRating: true }, choice: { add: 1 }, log: { add: 0 } })
  expect(maxEffects(undefined)).toEqual({})
})

test('a skill’s ranks as a value (rank:con) is shown in words and never applied', () => {
  const p = fx('derived:composure', 'add', 'rank:con', { switch: 'conditional', when: 'if you do' })
  expect(effectText(p)).toBe('+Con ranks Composure (if you do)')
  expect(effectValue('rank:con')).toBeUndefined()
  const { data } = made()
  const e = { id: 'x.y', kind: 'qualities', name: 'Y', source: 'X', page: 1, attrs: {}, parts: [p], text: '' } as unknown as Sr6Entry
  expect(effectBonuses(data, e)).toEqual([])
})

test('a threshold the entry sets (threshold-set) reads as the new threshold', () => {
  expect(effectText(fx('test:surprise', 'threshold-set', '2'))).toBe('threshold 2 on Surprise tests')
  expect(effectText(fx('test:toxin-resistance', 'threshold', '-1'))).toBe('threshold -1 on Toxin Resistance tests')
})

test('a base damage value over Strength (str/2+1) is shown in words and never applied', () => {
  const p = fx('derived:unarmed-dv', 'set', 'str/2+1')
  expect(effectText(p)).toBe('unarmed Damage Value Strength ÷ 2 + 1')
  const { data } = made()
  const e = { id: 'x.y', kind: 'qualities', name: 'Y', source: 'X', page: 1, attrs: {}, parts: [p], text: '' } as unknown as Sr6Entry
  expect(effectBonuses(data, e)).toEqual([])
})

test('a multiplier on a value (x0.75) is shown in words and never applied', () => {
  const p = fx('item:dv', 'set', 'x0.75')
  expect(effectText(p)).toBe('Damage Value × 0.75')
  expect(effectValue('x0.75')).toBeUndefined()
})
