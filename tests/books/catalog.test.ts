// Book-catalog XML content: gear/spells/amps as shipped in the owner's private imports (oracle),
// plus amptypes and weapons/armor ids that stay in public/data forever. See tests/data/catalog.test.ts
// for the checks that don't need the book catalogs.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from 'vitest'
import { BOOKS_DIR } from '../helpers'
import { describeBooks } from './_gate'

const doc = (dir: string, f: string) => new DOMParser().parseFromString(readFileSync(join(dir, f), 'utf8'), 'text/xml')
const entries = (dir: string, f: string) => [...doc(dir, f).documentElement.children]
const ids = (dir: string, f: string) => new Set(entries(dir, f).map(e => e.getAttribute('id')))

describeBooks('book catalog XML', () => {
  test('every book catalog kind has entries', () => {
    for (const f of ['gear.xml', 'spells.xml', 'amps.xml']) expect(entries(BOOKS_DIR, f).length).toBeGreaterThan(0)
  })

  test('every amp type exists', () => {
    const types = ids('public/data', 'amptypes.xml')
    for (const a of entries(BOOKS_DIR, 'amps.xml')) expect(types.has(a.getAttribute('type'))).toBe(true)
  })

  test('book entries used by the samples exist', () => {
    const amps = ids(BOOKS_DIR, 'amps.xml'), spells = ids(BOOKS_DIR, 'spells.xml')
    for (const id of ['ares-wired-reflexes', 'sustaining-focus', 'empathic-sense', 'vocal-control', 'flashing-smile',
      'danger-sense', 'concealment', 'well-stocked-closet', 'cat-mentor-spirit-mystery-secret']) expect(amps, id).toContain(id)
    for (const id of ['spell-lightning-bolt', 'spell-heal', 'spell-invisibility', 'spell-mask', 'spell-phantasm',
      'spell-confusion', 'spell-detect-enemies']) expect(spells, id).toContain(id)
    expect(ids('public/data', 'weapons.xml')).toContain('heavy-pistol')
    expect(ids('public/data', 'armor.xml')).toContain('light-armor')
  })

  test('equipment amps priced from the book carry their base item', () => {
    const predator = entries(BOOKS_DIR, 'amps.xml').find(a => a.getAttribute('id') === 'ares-predator-iv-heavy-pistol')!
    expect(predator.querySelector('item')!.getAttribute('kind')).toBe('weapon')
    expect(predator.querySelector('effect')!.getAttribute('param')).toBe('ranged-weapons.pistols')
  })
})
