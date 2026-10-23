// The traditions index grouping (src/sr6/catalog/domain/traditions.ts) on invented traditions.
import { expect, test } from 'vitest'
import { traditionGroups } from '../../../src/sr6/catalog/domain/traditions'
import type { Sr6Catalog, Sr6Entry } from '../../../src/sr6/formats/domain/types'
import { fixtureCatalog } from './fixture'

const trad = (name: string, drain?: string): Sr6Entry => ({
  id: `x.${name}`,
  kind: 'traditions',
  name,
  source: 'CRB',
  page: 1,
  attrs: drain ? { drain } : {},
  parts: [],
  text: '',
})
const withTraditions = (...ts: Sr6Entry[]): Sr6Catalog => {
  const c = fixtureCatalog()
  c.entries.traditions = new Map(ts.map(t => [t.id, t]))
  return c
}

test('traditions fall into Logic, Charisma, Intuition in that order, by name within each', () => {
  const g = traditionGroups(withTraditions(trad('Zeta', 'int'), trad('Beta', 'cha'), trad('Alpha', 'log'), trad('Aleph', 'int'), trad('Gamma', 'LOG')))
  expect(g.map(x => x.label)).toEqual(['Logic-Based', 'Charisma-Based', 'Intuition-Based'])
  expect(g.map(x => x.traditions.map(t => t.name))).toEqual([['Alpha', 'Gamma'], ['Beta'], ['Aleph', 'Zeta']])
})

test('a tradition with no usable drain is in no group; no traditions leaves three empty groups', () => {
  expect(traditionGroups(withTraditions(trad('Odd'), trad('Weird', 'wil'))).flatMap(x => x.traditions)).toEqual([])
  expect(traditionGroups(withTraditions()).map(x => x.traditions.length)).toEqual([0, 0, 0])
})
