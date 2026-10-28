// choiceOptions: what a choice power or quality may be for, as values noteAttr / noteSkill read back. Made-up entries on the fixture catalog.
import { expect, test } from 'vitest'
import { choiceOptions, choiceSelectOptions, noteAttr, noteSkill } from '../../../src/sr6/runner-builder/domain/creation/choices'
import type { Sr6Entry, Sr6Part } from '../../../src/sr6/formats/domain/types'
import { made } from '../catalog/fixture'

const entry = (name: string, parts: Sr6Part[] = []) => ({ id: 'x.' + name, kind: 'adeptpowers', name, attrs: {}, parts }) as unknown as Sr6Entry
const part = (tag: string, attrs: Record<string, string>): Sr6Part => ({ tag, text: '', attrs })

test('an attribute choice with the book’s options offers exactly those', () => {
  const { data } = made()
  const e = entry('Attribute Boost (Attribute)', [part('selection', { type: 'ATTRIBUTE', ref: 'CHOICE', options: 'BODY,AGILITY,REACTION,STRENGTH' })])
  const c = choiceOptions(data, e)!
  expect(c.kind).toBe('attribute')
  expect(c.options.map(o => o.value)).toEqual(['Body', 'Agility', 'Reaction', 'Strength'])
  expect(c.options.map(o => noteAttr(o.value))).toEqual(['bod', 'agi', 'rea', 'str'])
})

test('an attribute choice with no options offers the eight core attributes', () => {
  const { data } = made()
  const c = choiceOptions(data, entry('Improved Thing', [part('effect', { target: 'attr:choice' })]))!
  expect(c.options.map(o => o.value)).toEqual(['Body', 'Agility', 'Reaction', 'Strength', 'Willpower', 'Logic', 'Intuition', 'Charisma'])
  expect(choiceOptions(data, entry('Exceptional (Attribute)'))?.kind).toBe('attribute')
})

test('a skill choice offers the skills, each read back by noteSkill; a plain entry offers none', () => {
  const { data } = made()
  const c = choiceOptions(data, entry('Improved Ability', [part('modifier', { type: 'SKILL', ref: 'CHOICE' })]))!
  expect(c.kind).toBe('skill')
  expect(c.options.length).toBe(Object.keys(data.skills).length)
  for (const o of c.options) expect(data.skills[noteSkill(data, o.value) ?? '']?.name).toBe(o.value)
  expect(choiceOptions(data, entry('Plain Power'))).toBeUndefined()
  expect(choiceOptions(data, undefined)).toBeUndefined()
})

test('a skill choice with the book’s options keeps multi-word skill names (no splitting on spaces)', () => {
  const { data } = made()
  const multi = Object.values(data.skills).find(s => s.name.includes(' '))
  const single = Object.values(data.skills).find(s => !s.name.includes(' '))!
  const names = [multi?.name, single.name].filter(Boolean) as string[]
  const e = entry('Aptitude (Skill)', [part('selection', { type: 'SKILL', ref: 'CHOICE', options: names.join(',') })])
  const c = choiceOptions(data, e)!
  expect(c.kind).toBe('skill')
  expect(c.options.map(o => o.value)).toEqual(names)
})

test('choiceSelectOptions keeps a still-valid note that is not one of the listed values', () => {
  const { data } = made()
  const c = choiceOptions(data, entry('Improved Thing', [part('effect', { target: 'attr:choice' })]))!
  expect(choiceSelectOptions(c, 'AGI')[0]).toEqual({ value: 'AGI', label: 'AGI' }) // an older free-text note stays shown
  expect(choiceSelectOptions(c, 'Body')).toHaveLength(c.options.length) // already listed: not duplicated
  expect(choiceSelectOptions(c, '')).toHaveLength(c.options.length)
})

// Stage B: the <selection> part is the universal choice marker, across attribute / skill / quality / matrix domains.
test('an attribute selection behind a non-ATTRIBUTE modifier (a Way’s drain attr) still offers those attributes', () => {
  const { data } = made()
  const e = entry('Burnout’s Way', [
    part('modifier', { kind: 'itemmod', type: 'DRAIN_ADEPT', ref: 'CHOICE:x' }),
    part('selection', { type: 'ATTRIBUTE', options: 'AGILITY,REACTION,STRENGTH' }),
  ])
  const c = choiceOptions(data, e)!
  expect(c.kind).toBe('attribute')
  expect(c.options.map(o => o.value)).toEqual(['Agility', 'Reaction', 'Strength'])
  expect(c.options.map(o => noteAttr(o.value))).toEqual(['agi', 'rea', 'str'])
})

test('a skill selection whose options are skill ids resolves to the catalog skill names', () => {
  const { data } = made()
  const [id, name] = Object.entries(data.skills)[0] // [skillId, {name,...}]
  const e = entry('Artisan’s Way', [part('selection', { type: 'SKILL', options: id })])
  const c = choiceOptions(data, e)!
  expect(c.kind).toBe('skill')
  expect(c.options.map(o => o.value)).toEqual([(name as { name: string }).name])
})

test('a quality selection (Finding Your Way) offers the named Way qualities, underscore ids mapped to the catalog', () => {
  const { data } = made()
  const ids = Object.keys(data.qualities).slice(0, 2)
  if (ids.length < 2) return // fixture has <2 qualities: nothing to assert
  const e = entry('Finding Your Way', [part('selection', { type: 'QUALITY', options: ids.map(i => i.replace(/-/g, '_')).join(',') })])
  const c = choiceOptions(data, e)!
  expect(c.kind).toBe('quality')
  expect(c.options.map(o => o.value)).toEqual(ids.map(i => data.qualities[i].name))
})

test('a matrix selection offers the Matrix attributes with readable labels', () => {
  const { data } = made()
  const e = entry('Matrix Attribute Advancement', [part('selection', { type: 'ITEM_ATTRIBUTE', options: 'ATTACK,SLEAZE,DATA_PROCESSING,FIREWALL' })])
  const c = choiceOptions(data, e)!
  expect(c.kind).toBe('matrix')
  expect(c.options.map(o => o.value)).toEqual(['Attack', 'Sleaze', 'Data Processing', 'Firewall'])
})

test('a free-text selection (TEXT) stays a text box — no dropdown', () => {
  const { data } = made()
  expect(choiceOptions(data, entry('Bane', [part('selection', { type: 'TEXT' })]))).toBeUndefined()
})
