// Owner rulings 2026-10-31 on the special creation paths (made-up entries): the table settings for Animalism and SURGE,
// animalism for a mundane, a metavariant's SURGE collective, and the shifter's animal form with what the data gives it.
import { expect, test } from 'vitest'
import { apply, setMagic } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { animalForm } from '../../../src/sr6/runner-builder/domain/creation/drake'
import { collectiveFits } from '../../../src/sr6/runner-builder/domain/creation/surge'
import { validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import { blankSr6, type MagicKind } from '../../../src/sr6/formats/domain/character'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { CREATION_KEYS, type CreationValue } from '../../../src/sr6/table-setup/domain/creation'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from '../catalog/fixture'

const FILES = [
  {
    file: 'custom/sr6/imported/zz/metamagics.xml',
    xml:
      '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="metamagics" version="1">' +
      '<metamagic id="zz.slink" source="ZZ" page="1" class="ANIMALISM"><name>Slink</name></metamagic></sr6:data>',
  },
  {
    file: 'custom/sr6/imported/zz/metatypes.xml',
    xml:
      '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="metatypes" version="1">' +
      '<metatype id="zz.hobgoblin" source="ZZ" page="1"><name>Hobgoblin</name><range attr="bod" min="1" max="6"/><range attr="agi" min="1" max="6"/>' +
      '<range attr="rea" min="1" max="6"/><range attr="str" min="1" max="6"/><range attr="wil" min="1" max="6"/><range attr="log" min="1" max="6"/>' +
      '<range attr="int" min="1" max="6"/><range attr="cha" min="1" max="6"/><range attr="edg" min="1" max="6"/><text/></metatype></sr6:data>',
  },
  {
    file: 'custom/sr6/imported/zz/qualities.xml',
    xml:
      '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="qualities" version="1">' +
      '<quality id="zz.tusks" source="ZZ" page="1" kind="positive" karma="8" class="METAGENIC"><name>Tusks</name></quality>' +
      '<quality id="zz.shifter-furry" source="ZZ" page="1" kind="positive" karma="15" cl6="shifter"><name>Shifter (Furry)</name>' +
      '<modifier kind="itemmod" type="QUALITY" ref="shift"/><modifier kind="itemmod" type="CRITTER_POWER" ref="natural_weapon"/></quality>' +
      '<quality id="zz.shifter-feathery" source="ZZ" page="1" kind="positive" karma="18" cl6="shifter"><name>Shifter (Feathery)</name></quality>' +
      '<quality id="zz.might" source="ZZ" page="1" kind="positive" karma="8" perLevel="true" maxLevel="4"><name>Shifter Might (Shifter add-on)</name>' +
      '<modifier kind="valmod" type="ATTRIBUTE" ref="STRENGTH" value="1" apply="ANIMAL"/></quality></sr6:data>',
  },
  {
    file: 'custom/sr6/imported/zz/qualitysets.xml',
    xml:
      '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="qualitysets" version="1">' +
      '<qualityset id="zz.tuskers" source="ZZ" page="1" karma="8" metatypes="Ork"><name>Tuskers</name>' +
      '<modifier kind="itemmod" type="QUALITY" ref="tusks"/></qualityset></sr6:data>',
  },
]
const world = (rules: Record<string, CreationValue> = {}) => {
  const data = sr6Data(fixtureCatalog(undefined, FILES)),
    cr = fixtureCreation()
  for (const [key, value] of Object.entries(rules)) cr.set(key, { key, value })
  return { data, cr }
}
const runner = (magic: MagicKind = 'mundane', metatype = GLIM) => {
  const ch = blankSr6('priority', 'r1', '2026-10-31T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype, magic })
  return ch
}
const codes = (w: ReturnType<typeof world>, ch: ReturnType<typeof runner>) => validateSr6(w.data, w.cr, ch).map(v => v.code)

test('Animalism and SURGE are table settings on Table setup', () => {
  const keys = CREATION_KEYS.map(k => k.key)
  expect(keys).toEqual(expect.arrayContaining(['allowAnimalism', 'animalismMaxAtCreation', 'allowSurge']))
})

test('a mundane may take animalism: kept through a magic kind change, never flagged as a metamagic it can’t have', () => {
  const w = world(),
    ch = runner('adept')
  apply(ch.build, { op: 'pick', kind: 'metamagics', id: 'zz.slink' }, w.data, w.cr)
  setMagic(ch, 'mundane', w.data, w.cr)
  expect(ch.build.picks.map(x => x.id)).toEqual(['zz.slink'])
  expect(codes(w, ch)).not.toContain('magic.spellsAllowed')
  expect(codes(world({ allowAnimalism: false }), ch)).toContain('magic.animalismOff')
})

test('SURGE off: a metagenic quality or a collective is flagged, a new collective refused', () => {
  const off = world({ allowSurge: false }),
    ch = runner()
  expect(apply(ch.build, { op: 'collective', id: 'zz.tuskers' }, off.data, off.cr)).toEqual({ ok: false, reason: 'rule-off' })
  apply(ch.build, { op: 'quality', id: 'zz.tusks' }, off.data, off.cr)
  expect(codes(off, ch)).toContain('quality.surgeOff')
  expect(codes(world(), ch)).not.toContain('quality.surgeOff')
})

test('a metavariant counts as its base metatype for a SURGE collective', () => {
  const w = world(),
    ch = runner('mundane', 'zz.hobgoblin')
  apply(ch.build, { op: 'collective', id: 'zz.tuskers' }, w.data, w.cr)
  expect(collectiveFits(ch.build, w.data)).toBe(true)
  expect(collectiveFits(runner().build && { ...ch.build, metatype: GLIM }, w.data)).toBe(false)
})

test('the shifter’s animal form: picked among the Shifter forms, its grants and the add-ons’ animal attributes from the data', () => {
  const w = world(),
    ch = runner('adept'),
    b = ch.build
  apply(b, { op: 'quality', id: 'zz.shifter-feathery' }, w.data, w.cr)
  const uid = b.qualities[0].uid
  expect(apply(b, { op: 'shifterForm', id: 'zz.shifter-furry' }, w.data, w.cr)).toEqual({ ok: true })
  expect(b.qualities.map(q => [q.uid, q.id])).toEqual([[uid, 'zz.shifter-furry']])
  expect(apply(b, { op: 'quality', id: 'zz.might' }, w.data, w.cr)).toEqual({ ok: true })
  const a = animalForm(b, w.data)
  expect(a.grants).toEqual(['shift', 'natural weapon'])
  expect(a.attrs).toEqual({ str: 1 })
  expect(apply(b, { op: 'shifterForm', id: 'zz.tusks' }, w.data, w.cr)).toEqual({ ok: false, reason: 'unknown' })
})
