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
