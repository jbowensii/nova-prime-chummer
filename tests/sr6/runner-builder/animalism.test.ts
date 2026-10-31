// Animalism (Bestial Nature; Commlink6's SR6AnimalismController) on made-up entries: 10 + the grade in Karma for each grade,
// outside initiation's metamagic count, capped at creation (default 2) and off when the table says so.
import { expect, test } from 'vitest'
import { animalismGrade, animalismKarma, isAnimalism } from '../../../src/sr6/runner-builder/domain/creation/animalism'
import { karmaBudget } from '../../../src/sr6/runner-builder/domain/creation/karma'
import { makeProvider } from '../../../src/sr6/runner-builder/domain/creation/providers'
import { validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import { blankSr6, type Sr6Pick } from '../../../src/sr6/formats/domain/character'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import type { CreationValue } from '../../../src/sr6/table-setup/domain/creation'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from '../catalog/fixture'

const POWERS = {
  file: 'custom/sr6/imported/zz/metamagics.xml',
  xml:
    '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="metamagics" version="1">' +
    '<metamagic id="zz.slink" source="ZZ" page="1" class="ANIMALISM"><name>Slink</name></metamagic>' +
    '<metamagic id="zz.fury" source="ZZ" page="1" class="ANIMALISM" perLevel="true"><name>Fury</name></metamagic>' +
    '<metamagic id="zz.howl" source="ZZ" page="1" class="ANIMALISM"><name>Howl</name></metamagic></sr6:data>',
}
const world = (rules: Record<string, CreationValue> = {}) => {
  const data = sr6Data(fixtureCatalog(undefined, [POWERS])),
    cr = fixtureCreation()
  for (const [key, value] of Object.entries(rules)) cr.set(key, { key, value })
  return { data, cr }
}
const pick = (id: string, level?: number): Sr6Pick => ({ uid: id, kind: 'metamagics', id, level })
const runner = (picks: Sr6Pick[]) => {
  const ch = blankSr6('priority', 'r1', '2026-10-31T00:00:00Z')
  ch.build = { ...buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'adept' }), picks }
  return ch
}
const codes = (w: ReturnType<typeof world>, ch: ReturnType<typeof runner>) => validateSr6(w.data, w.cr, ch).map(v => v.code)

test('each animalism grade costs 10 + the grade; a power with levels is a grade a level', () => {
  const w = world()
  const ch = runner([pick('zz.slink'), pick('zz.fury', 2)])
  expect(isAnimalism(w.data.entry('metamagics', 'zz.slink'))).toBe(true)
  expect(isAnimalism(w.data.entry('metamagics', 'crb.glow-point'))).toBe(false)
  expect(animalismGrade(ch.build, w.data)).toBe(3)
  expect(animalismKarma(ch.build, w.data)).toBe(11 + 12 + 13)
  const line = karmaBudget(ch.build, w.data, w.cr, makeProvider('priority', w.data, w.cr)).breakdown.find(l => l.key === 'animalism')
  expect(line?.amount).toBe(36)
})

test('animalism powers are not initiation metamagics; the grade at creation is capped at 2 by default', () => {
  const w = world()
  const two = runner([pick('zz.slink'), pick('zz.howl')])
  expect(codes(w, two)).not.toContain('magic.metamagicCount')
  expect(codes(w, two)).not.toContain('magic.animalismMax')
  const three = runner([pick('zz.slink'), pick('zz.howl'), pick('zz.fury')])
  expect(codes(w, three)).toContain('magic.animalismMax')
  expect(codes(world({ animalismMaxAtCreation: 3 }), three)).not.toContain('magic.animalismMax')
})

test('a table that turns animalism off flags any animalism power', () => {
  const ch = runner([pick('zz.slink')])
  expect(codes(world(), ch)).not.toContain('magic.animalismOff')
  expect(codes(world({ allowAnimalism: false }), ch)).toContain('magic.animalismOff')
})
