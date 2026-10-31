// Drake and shifter player characters (Commlink6's SR6DrakeController and SR6ShifterGenerator) on made-up entries: an aware
// drake's dracogenesis powers at 5 + n Karma, none for a latent drake; shifter add-ons priced together (never below 0),
// outside the six and the negative cap, only with the Shifter quality; no shifter technomancer; the pick round-trips.
import { expect, test } from 'vitest'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { dracogenesisKarma, drakeKind, isShifter, shifterAddOnKarma } from '../../../src/sr6/runner-builder/domain/creation/drake'
import { karmaBudget, qualityKarma } from '../../../src/sr6/runner-builder/domain/creation/karma'
import { makeProvider } from '../../../src/sr6/runner-builder/domain/creation/providers'
import { validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import { blankSr6, type MagicKind } from '../../../src/sr6/formats/domain/character'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from '../catalog/fixture'

const Q = (id: string, name: string, karma: number, kind = 'positive', extra = '') =>
  `<quality id="zz.${id}" source="ZZ" page="1" kind="${kind}" karma="${karma}"${extra}><name>${name}</name></quality>`
const FILES = [
  {
    file: 'custom/sr6/imported/zz/qualities.xml',
    xml:
      '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="qualities" version="1">' +
      Q('drake', 'Drake', 50, 'positive', ' uncounted="true"') +
      Q('latent-drake', 'Latent Drake', 25, 'positive', ' uncounted="true"') +
      Q('shifter-furry', 'Shifter (Furry)', 20) +
      Q('claws', 'Claws (Shifter add-on)', 6) +
      Q('keen-nose', 'Keen Nose (Shifter add-on)', 4) +
      Q('allergy', 'Silver Allergy (Shifter add-on)', 15, 'negative') +
      '</sr6:data>',
  },
  {
    file: 'custom/sr6/imported/zz/critterpowers.xml',
    xml:
      '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="critterpowers" version="1">' +
      '<critterpower id="zz.fear" source="ZZ" page="1" class="DRACOGENESIS_POWER"><name>Fear</name></critterpower>' +
      '<critterpower id="zz.toughness" source="ZZ" page="1" class="DRACOGENESIS_POWER"><name>Toughness</name></critterpower></sr6:data>',
  },
]
const world = () => ({ data: sr6Data(fixtureCatalog(undefined, FILES)), cr: fixtureCreation() })
const runner = (magic: MagicKind = 'adept') => {
  const ch = blankSr6('priority', 'r1', '2026-10-31T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic })
  return ch
}
const codes = (w: ReturnType<typeof world>, ch: ReturnType<typeof runner>) => validateSr6(w.data, w.cr, ch).map(v => v.code)

test('an aware drake learns dracogenesis powers at 5 + n Karma each; a latent drake none', () => {
  const w = world(),
    ch = runner(),
    b = ch.build
  apply(b, { op: 'quality', id: 'zz.drake' }, w.data, w.cr)
  expect(drakeKind(b, w.data)).toBe('aware')
  for (const id of ['zz.fear', 'zz.toughness']) expect(apply(b, { op: 'pick', kind: 'critterpowers', id }, w.data, w.cr)).toEqual({ ok: true })
  expect(dracogenesisKarma(b)).toBe(6 + 7)
  expect(karmaBudget(b, w.data, w.cr, makeProvider('priority', w.data, w.cr)).breakdown.find(l => l.key === 'dracogenesis')?.amount).toBe(13)
  expect(codes(w, ch)).not.toContain('drake.powers')
  expect(codes(w, ch)).not.toContain('magic.spellsAllowed')
  b.qualities = []
  apply(b, { op: 'quality', id: 'zz.latent-drake' }, w.data, w.cr)
  expect(drakeKind(b, w.data)).toBe('latent')
  expect(codes(w, ch)).toContain('drake.powers')
  const r = xmlToSr6(sr6ToXml(ch))
  if (!r.ok) throw new Error(r.reason)
  expect(r.character.build.picks.filter(x => x.kind === 'critterpowers').map(x => x.id)).toEqual(['zz.fear', 'zz.toughness'])
})

test('shifter add-ons cost their Karma together, never below 0, outside the quality Karma and the six', () => {
  const w = world(),
    ch = runner(),
    b = ch.build
  apply(b, { op: 'quality', id: 'zz.claws' }, w.data, w.cr)
  expect(codes(w, ch)).toContain('shifter.addOns') // (no Shifter quality yet)
  apply(b, { op: 'quality', id: 'zz.shifter-furry' }, w.data, w.cr)
  apply(b, { op: 'quality', id: 'zz.keen-nose' }, w.data, w.cr)
  expect(isShifter(b, w.data)).toBe(true)
  expect(codes(w, ch)).not.toContain('shifter.addOns')
  expect(shifterAddOnKarma(b, w.data)).toBe(10)
  expect(qualityKarma(b, w.data, w.cr).pos).toBe(20) // (the Shifter quality alone)
  apply(b, { op: 'quality', id: 'zz.allergy' }, w.data, w.cr)
  expect(shifterAddOnKarma(b, w.data)).toBe(0) // (10 − 15, floored)
  expect(qualityKarma(b, w.data, w.cr).neg).toBe(0)
})

test('a shifter technomancer is stopped', () => {
  const w = world(),
    ch = runner('technomancer')
  apply(ch.build, { op: 'quality', id: 'zz.shifter-furry' }, w.data, w.cr)
  expect(codes(w, ch)).toContain('shifter.resonance')
  expect(codes(w, runner('technomancer'))).not.toContain('shifter.resonance')
})
