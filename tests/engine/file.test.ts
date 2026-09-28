import { test, expect } from 'vitest'
import { blankCharacter, parseCharacterFile, serialize, snapshotEntries } from '../../src/engine/file'
import { buildCatalog } from '../../src/engine/load'
import { validate } from '../../src/engine/validate'
import { base, cat } from '../helpers'

const testChar = () => {
  const ch = blankCharacter()
  ch.identity.name = 'Fixture Runner'
  ch.build.items = [{ uid: 'it-armor', catalogId: 'light-armor', kind: 'armor', name: 'Armor jacket', armor: 3 }]
  return ch
}

test('round-trip keeps the character intact', () => {
  const ch = testChar()
  const r = parseCharacterFile(serialize(ch))
  expect(r).toEqual({ ok: true, character: ch })
})

test('bad files are rejected with a reason, never thrown', () => {
  expect(parseCharacterFile('{')).toMatchObject({ ok: false, reason: expect.stringContaining('JSON') })
  const noBuild = { ...testChar(), build: undefined }
  expect(parseCharacterFile(JSON.stringify(noBuild))).toMatchObject({ ok: false, reason: expect.stringContaining('build') })
  expect(parseCharacterFile(JSON.stringify({ ...testChar(), formatVersion: 99 }))).toMatchObject({ ok: false, reason: expect.stringContaining('newer version') })
  expect(parseCharacterFile('[]')).toMatchObject({ ok: false })
})

test('snapshots keep an entry printable after its catalog data disappears, flagged ref.unknown', () => {
  const ch = snapshotEntries(cat, testChar())
  expect(ch.build.items.find(i => i.catalogId === 'light-armor')!.snapshot!.armor).toBe(3)
  const noArmor = base.map(f => f.file === 'armor.xml'
    ? { ...f, xml: f.xml.replace(/<item id="light-armor"[\s\S]*?<\/item>/, '') } : f)
  const reduced = buildCatalog(noArmor)
  expect(reduced.items.has('light-armor')).toBe(false)
  const v = validate(reduced, ch)
  expect(v.some(x => x.code === 'ref.unknown' && x.path === 'items.it-armor')).toBe(true)
  expect(ch.build.items.some(i => i.uid === 'it-armor')).toBe(true)
})
