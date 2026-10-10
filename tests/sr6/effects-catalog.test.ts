// A catalog entry's effects as the engine uses them (src/sr6/engine/effects.ts): the values it reads, the test types
// shown on every pool they cover, links to the entries an entry grants or works as, attribute maxima, condition
// monitor boxes, the words the hover card shows. Made-up fixture entries, invented numbers.
import { expect, test } from 'vitest'
import type { Sr6Build } from '../../src/sr6/model/character'
import { blankSr6 } from '../../src/sr6/model/character'
import type { Sr6Data } from '../../src/sr6/engine/data'
import type { Sr6Part } from '../../src/sr6/model/types'
import { attrMax, augmentBonus, conditionalBonuses } from '../../src/sr6/engine/budgets'
import { deriveSr6 } from '../../src/sr6/engine/derive'
import { effectBonuses, effectText, effectValue, testSkills } from '../../src/sr6/engine/effects'
import { effectNotes } from '../../src/sr6/print/view'
import { buildOf, GLIM, made } from './fixture'

const fx = (target: string, op: string, value: string, more: Record<string, string> = {}): Sr6Part => ({ tag: 'effect', attrs: { target, op, value, ...more }, text: '' })
const runner = (): Sr6Build => buildOf('priority', { letters: 'CABDA', metatype: GLIM })
const give = (d: Sr6Data, id: string, ...parts: Sr6Part[]) => { d.entry('qualities', id)!.parts.push(...parts) }

test('a value: a number, so much per rating, or a formula shown only', () => {
  expect(effectValue('2')).toEqual({ value: 2 })
  expect(effectValue('-1')).toEqual({ value: -1 })
  expect(effectValue('R')).toEqual({ value: 1, perRating: true })
  expect(effectValue('-R')).toEqual({ value: -1, perRating: true })
  expect(effectValue('R*2')).toEqual({ value: 2, perRating: true })
  expect(effectValue('2*R')).toEqual({ value: 2, perRating: true })
  expect(effectValue('edg/2')).toBeUndefined()
  expect(effectValue('0,1,1,0,0')).toBeUndefined()
})

test('a test type covers the skills the book lists, or the skills linked to an attribute', () => {
  const { data } = made()
  expect(testSkills(data, 'attr-cha')).toEqual(['crb.gab'])
  expect(testSkills(data, 'mental')).toContain('crb.tinkering')
  expect(testSkills(data, 'damage-resistance')).toEqual([])
})

test('an entry’s effects apply: attributes, boxes, a test type’s pools; low-confidence and conditional ones are shown only', () => {
  const { data, cr } = made({ data: d => give(d, 'crb.knack', fx('attr:bod', 'add', '1'), fx('derived:stun-monitor', 'add', '2'),
    fx('derived:overflow', 'add', 'R'), fx('test:attr-cha', 'add', '2'), fx('attr:agi', 'add', '1', { confidence: 'low', switch: 'activated' }),
    fx('test:attr-cha', 'add', '1', { confidence: 'low', switch: 'conditional', when: 'haggling' })) })
  const b = runner()
  const before = deriveSr6(data, cr, { ...blankSr6(b.method, 't'), build: structuredClone(b) })
  b.qualities.push({ uid: 'q', id: 'crb.knack', level: 1 })
  const ch = { ...blankSr6(b.method, 't'), build: b }, d = deriveSr6(data, cr, ch)
  expect(d.attrs.bod.augmented).toBe(before.attrs.bod.augmented + 1)
  expect(d.attrs.agi.augmented).toBe(before.attrs.agi.augmented)  // (activated: shown, not applied)
  expect(d.monitors.stun).toBe((before.monitors.stun ?? 0) + 2)
  expect(d.monitors.overflow).toBe(before.monitors.overflow + 1 + 1)  // (+1 Body, +1 a level)
  expect(augmentBonus(b, data, 'skill', 'crb.gab')).toBe(2)
  expect(conditionalBonuses(b, data, 'crb.gab')).toEqual([])  // (a low-confidence one isn't even shown with the pool)
})

test('a link: the entry it grants or works as gives its effects, by id or by its printed name', () => {
  const { data } = made({ data: d => {
    give(d, 'crb.stoneskin', fx('derived:defense', 'add', '2'))
    give(d, 'crb.knack', { tag: 'link', attrs: { rel: 'grants', name: 'Stoneskin', kind: 'qualities' }, text: '' })
    give(d, 'crb.lucky-streak', { tag: 'link', attrs: { rel: 'as', name: 'Knack', kind: 'qualities', ref: 'crb.knack' }, text: '' })
  } })
  expect(effectBonuses(data, data.entry('qualities', 'crb.knack'))).toEqual([{ target: 'defense', value: 2 }])
  expect(effectBonuses(data, data.entry('qualities', 'crb.lucky-streak'))).toEqual([{ target: 'defense', value: 2 }])
})

test('an attribute maximum: a quality’s table sets it, its prose raises it; a chosen attribute’s is the player’s', () => {
  const { data, cr } = made({ data: d => {
    give(d, 'crb.knack', fx('attr-max:str', 'set', '9'), fx('attr-max:choice', 'add', '1'))
    give(d, 'crb.stoneskin', fx('attr-max:bod', 'add', 'R'))
  } })
  const b = runner(), base = (k: 'str' | 'bod') => attrMax(data, cr, b, k)!
  const str = base('str'), bod = base('bod')
  b.qualities.push({ uid: 'k', id: 'crb.knack', level: 1 }, { uid: 's', id: 'crb.stoneskin', level: 2 })
  expect(attrMax(data, cr, b, 'str')).toBe(9)
  expect(attrMax(data, cr, b, 'bod')).toBe(bod + 2)
  expect(str).not.toBe(9)
})

test('the quality the settings name (Built Tough, Dermal Deposits) counts once, when its own effects add the same', () => {
  const { data, cr } = made({ rules: { builtToughQuality: 'crb.lucky-streak' }, data: d => give(d, 'crb.lucky-streak', fx('derived:physical-monitor', 'add', 'R')) })
  const b = runner(), plain = deriveSr6(data, cr, { ...blankSr6(b.method, 't'), build: structuredClone(b) }).monitors.physical!
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
  const { data } = made({ data: d => give(d, 'crb.knack', fx('attr:bod', 'add', '1'), fx('test:attr-cha', 'edge', '1'),
    fx('attr:agi', 'add', '1', { confidence: 'low', switch: 'activated' }), { tag: 'link', attrs: { rel: 'grants', name: 'Stoneskin' }, text: '' }) })
  const b = runner()
  b.qualities.push({ uid: 'q', id: 'crb.knack', level: 1 })
  expect(effectNotes(b, data).map(x => x.text)).toEqual(['+1 Edge on tests using Charisma', 'activated: +1 Agility', 'grants Stoneskin'])
})
