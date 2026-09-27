import { readFileSync } from 'node:fs'
import { test, expect } from 'vitest'

const doc = (f: string) => new DOMParser().parseFromString(readFileSync(`public/data/${f}`, 'utf8'), 'text/xml')
const entries = (f: string) => [...doc(f).documentElement.children]
const ids = (f: string) => new Set(entries(f).map(e => e.getAttribute('id')))

test('every catalog kind has entries', () => {
  for (const f of ['gear.xml', 'weapons.xml', 'armor.xml', 'spells.xml', 'amps.xml']) expect(entries(f).length).toBeGreaterThan(0)
})

test('weapons: specialist is true or absent; every armor has a rating', () => {
  for (const w of entries('weapons.xml')) expect([null, 'true']).toContain(w.getAttribute('specialist'))
  for (const a of entries('armor.xml')) expect(Number(a.getAttribute('armor'))).toBeGreaterThanOrEqual(1)
})

test('every amp type exists', () => {
  const types = ids('amptypes.xml')
  for (const a of entries('amps.xml')) expect(types.has(a.getAttribute('type'))).toBe(true)
})

test('book entries used by the samples exist', () => {
  const amps = ids('amps.xml'), spells = ids('spells.xml'), weapons = ids('weapons.xml'), armor = ids('armor.xml')
  for (const id of ['ares-wired-reflexes', 'sustaining-focus', 'empathic-sense', 'vocal-control', 'flashing-smile',
    'danger-sense', 'concealment', 'well-stocked-closet', 'cat-mentor-spirit-mystery-secret']) expect(amps, id).toContain(id)
  for (const id of ['spell-lightning-bolt', 'spell-heal', 'spell-invisibility', 'spell-mask', 'spell-phantasm',
    'spell-confusion', 'spell-detect-enemies']) expect(spells, id).toContain(id)
  expect(weapons).toContain('heavy-pistol')
  expect(armor).toContain('light-armor')
})

test('equipment amps priced from the book carry their base item', () => {
  const predator = entries('amps.xml').find(a => a.getAttribute('id') === 'ares-predator-iv-heavy-pistol')!
  expect(predator.querySelector('item')!.getAttribute('kind')).toBe('weapon')
  expect(predator.querySelector('effect')!.getAttribute('param')).toBe('ranged-weapons.pistols')
})
