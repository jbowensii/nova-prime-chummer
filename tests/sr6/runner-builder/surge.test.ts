// SURGE (Sixth World Companion; Commlink6's CommonQualityGenerator) on made-up entries: metagenic Karma capped at 30, a
// collective paid once with its qualities free (and kept through a metatype change), its metatypes and choice checked, and
// the save format.
import { expect, test } from 'vitest'
import { apply, setMetatype } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { collectiveGrants, surgeKarma } from '../../../src/sr6/runner-builder/domain/creation/surge'
import { karmaBudget } from '../../../src/sr6/runner-builder/domain/creation/karma'
import { makeProvider } from '../../../src/sr6/runner-builder/domain/creation/providers'
import { validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM, STONE } from '../catalog/fixture'

const Q = (id: string, karma: number, kind = 'positive', extra = '') =>
  `<quality id="zz.${id}" source="ZZ" page="1" kind="${kind}" karma="${karma}" class="METAGENIC"${extra}><name>${id.replace(/-/g, ' ')}</name></quality>`
const FILES = [
  {
    file: 'custom/sr6/imported/zz/qualities.xml',
    xml:
      '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="qualities" version="1">' +
      Q('beak', 5) +
      Q('feathers', 4) +
      Q('unusual-hair', 3) +
      Q('quills', 10) +
      Q('granite', 15) +
      Q('tusks', 8) +
      Q('avian', 4, 'negative') +
      '</sr6:data>',
  },
  {
    file: 'custom/sr6/imported/zz/qualitysets.xml',
    xml:
      '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="qualitysets" version="1">' +
      '<qualityset id="zz.raptor" source="ZZ" page="1" karma="15" metatypes="Glimmerkin"><name>Raptor</name>' +
      '<modifier kind="itemmod" type="QUALITY" ref="beak"/><modifier kind="itemmod" type="QUALITY" ref="CHOICE"/>' +
      '<modifier kind="itemmod" type="QUALITY" ref="feathers"/><modifier kind="itemmod" type="QUALITY" ref="unusual_hair"/>' +
      '<modifier kind="itemmod" type="QUALITY" ref="wings"/><selection type="QUALITY" options="feathers,unusual_hair"/></qualityset></sr6:data>',
  },
]
const world = () => ({ data: sr6Data(fixtureCatalog(undefined, FILES)), cr: fixtureCreation() })
const runner = () => {
  const ch = blankSr6('priority', 'r1', '2026-10-31T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  return ch
}
const codes = (w: ReturnType<typeof world>, ch: ReturnType<typeof runner>) => validateSr6(w.data, w.cr, ch).map(v => v.code)

test('metagenic qualities picked add up their printed Karma, positive and negative; over 30 is an error', () => {
  const w = world(),
    ch = runner()
  for (const id of ['zz.quills', 'zz.granite', 'zz.avian']) apply(ch.build, { op: 'quality', id }, w.data, w.cr)
  expect(surgeKarma(ch.build, w.data)).toBe(29)
  expect(codes(w, ch)).not.toContain('quality.surgeCap')
  apply(ch.build, { op: 'quality', id: 'zz.tusks' }, w.data, w.cr)
  expect(surgeKarma(ch.build, w.data)).toBe(37)
  expect(codes(w, ch)).toContain('quality.surgeCap')
})

test('a collective costs its Karma once and gives its qualities free, its choice among them', () => {
  const w = world(),
    ch = runner(),
    b = ch.build
  const set = w.data.entry('qualitysets', 'zz.raptor')!
  expect(collectiveGrants(w.data, set).map(g => g.ref)).toEqual(['beak', 'wings'])
  expect(apply(b, { op: 'collective', id: 'zz.raptor' }, w.data, w.cr)).toEqual({ ok: true })
  expect(codes(w, ch)).toContain('quality.surgeCollective') // (no choice yet; `wings` not in the catalog)
  apply(b, { op: 'collective', id: 'zz.raptor', choice: 'unusual_hair' }, w.data, w.cr)
  expect(b.qualities.filter(q => q.free).map(q => q.id)).toEqual(expect.arrayContaining(['zz.beak', 'zz.unusual-hair']))
  expect(b.qualities.some(q => q.id === 'zz.feathers')).toBe(false)
  expect(surgeKarma(b, w.data)).toBe(0)
  const k = karmaBudget(b, w.data, w.cr, makeProvider('priority', w.data, w.cr)).breakdown
  expect(k.find(l => l.key === 'surgeCollective')?.amount).toBe(15)
  expect(k.find(l => l.key === 'qualityPos')).toBeUndefined()
  // (a metatype change redoes the free traits; the collective's come back, and the metatype it doesn't list is flagged)
  setMetatype(ch, STONE, w.data)
  expect(b.qualities.filter(q => q.free).map(q => q.id)).toEqual(expect.arrayContaining(['zz.beak', 'zz.unusual-hair']))
  expect(validateSr6(w.data, w.cr, ch).find(v => v.code === 'quality.surgeCollective' && /not this metatype/.test(v.message))).toBeTruthy()
  apply(b, { op: 'collective', id: '' }, w.data, w.cr)
  expect(b.surgeCollective).toBeUndefined()
  expect(b.qualities.some(q => q.id === 'zz.beak')).toBe(false)
})

test('the collective and its choice round-trip', () => {
  const w = world(),
    ch = runner()
  apply(ch.build, { op: 'collective', id: 'zz.raptor', choice: 'feathers' }, w.data, w.cr)
  const r = xmlToSr6(sr6ToXml(ch))
  if (!r.ok) throw new Error(r.reason)
  const back = r.character.build
  expect([back.surgeCollective, back.surgeChoice]).toEqual(['zz.raptor', 'feathers'])
})
