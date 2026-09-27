import { test, expect } from 'vitest'
import { parseCharacterFile, serialize, snapshotEntries } from '../../src/engine/file'
import { buildCatalog } from '../../src/engine/load'
import { validate } from '../../src/engine/validate'
import { base, cat, sample } from '../helpers'

test('round-trip keeps the character intact', () => {
  const ch = sample('lightning')
  const r = parseCharacterFile(serialize(ch))
  expect(r).toEqual({ ok: true, character: ch })
})

test('bad files are rejected with a reason, never thrown', () => {
  expect(parseCharacterFile('{')).toMatchObject({ ok: false, reason: expect.stringContaining('JSON') })
  const noBuild = { ...sample('lightning'), build: undefined }
  expect(parseCharacterFile(JSON.stringify(noBuild))).toMatchObject({ ok: false, reason: expect.stringContaining('build') })
  expect(parseCharacterFile(JSON.stringify({ ...sample('lightning'), formatVersion: 99 }))).toMatchObject({ ok: false, reason: expect.stringContaining('newer version') })
  expect(parseCharacterFile('[]')).toMatchObject({ ok: false })
})

test('snapshots keep an entry printable after its catalog data disappears, flagged ref.unknown', () => {
  const ch = snapshotEntries(cat, sample('lightning'))
  expect(ch.build.items.find(i => i.catalogId === 'light-armor')!.snapshot!.armor).toBe(3)
  const noArmor = base.map(f => f.file === 'armor.xml'
    ? { ...f, xml: f.xml.replace(/<item id="light-armor"[\s\S]*?<\/item>/, '') } : f)
  const reduced = buildCatalog(noArmor)
  expect(reduced.items.has('light-armor')).toBe(false)
  const v = validate(reduced, ch)
  expect(v.some(x => x.code === 'ref.unknown' && x.path === 'items.it-armor')).toBe(true)
  expect(ch.build.items.some(i => i.uid === 'it-armor')).toBe(true)
})
