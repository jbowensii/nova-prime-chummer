// Sub-options and variants (behaviour-gap plan Stage 2; catalog structure.ts subChoices/withOptions): picking a
// SUBSELECT option adds its karma or nuyen and turns on its effects; a variant's price and essence replace the entry's;
// a required pick left open is a Review warning. Made-up entries and numbers.
import { expect, test } from 'vitest'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { effectsOf, qualityCost, priced } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { subChoices, withOptions } from '../../../src/sr6/catalog/domain/structure'
import { validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import { blankSr6, type Sr6Character } from '../../../src/sr6/formats/domain/character'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { buildOf, fixtureCatalog, fixtureCreation } from '../catalog/fixture'

const QUAL = `<quality id="crb.zz-allergy" source="CRB" page="74" kind="negative" karma="2" karmaMax="20"><name>Zz Allergy</name>
  <selection type="SUBSELECT" ref="severity"/>
  <option choice="severity" id="mild" name="Mild"/><option choice="severity" id="severe" name="Severe" cost="6"/>
  <effect target="attr:bod" op="add" value="-2" option="severity.mild"/><effect target="attr:bod" op="add" value="-4" option="severity.severe"/><text/></quality>`
const GEAR = `<gear id="crb.zz-binder" source="CRB" page="9" category="Zed" cost="300" avail="2"><name>Zz Binder</name>
  <option choice="resist" id="r1" name="Res 1"/><option choice="resist" id="r4" name="Res 4" cost="50" avail="3"/><text/></gear>
  <gear id="crb.zz-limb" source="CRB" page="9" category="Zed" cost="20000" essence="1"><name>Zz Limb</name>
  <variant name="Full" price="20000" essence="1" required="true"/><variant name="Hand" price="6000" essence="0.25" required="true"/>
  <effect target="attr:bod" op="add" value="1"/><effect target="attr:bod" op="add" value="2" variant="Full"/><text/></gear>`
const data = sr6Data(
  fixtureCatalog((f, x) =>
    f.endsWith('crb/qualities.xml')
      ? x.replace('</sr6:data>', `${QUAL}\n</sr6:data>`)
      : f.endsWith('crb/gear.xml')
        ? x.replace('</sr6:data>', `${GEAR}\n</sr6:data>`)
        : x,
  ),
)
const cr = fixtureCreation()
function runner(): Sr6Character {
  const ch = blankSr6('priority', 'r1', '2026-10-31T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA' })
  return ch
}

test('subChoices lists the sub-option picks and a priced variant list as a required pick', () => {
  expect(subChoices(data.entry('qualities', 'crb.zz-allergy')).map(c => [c.ref, c.options.map(o => o.id), c.required])).toEqual([
    ['severity', ['mild', 'severe'], true],
  ])
  expect(subChoices(data.entry('gear', 'crb.zz-limb'))[0]).toMatchObject({
    ref: '@variant',
    required: true,
    options: [
      { id: 'Full', price: 20000 },
      { id: 'Hand', essence: 0.25 },
    ],
  })
})

test("a quality's sub-option adds its karma, and only the picked option's effect counts", () => {
  const ch = runner()
  ch.build.qualities.push({ uid: 'q1', id: 'crb.zz-allergy', level: 1 })
  const v = data.qualities['crb.zz-allergy']
  expect(qualityCost(ch.build.qualities[0], v)).toBe(2)
  expect(effectsOf(data, ch.build.qualities[0])).toEqual([])
  expect(validateSr6(data, cr, ch).some(x => x.code === 'choice.option')).toBe(true)
  expect(apply(ch.build, { op: 'lineOptions', uid: 'q1', ref: 'severity', value: 'nope' }, data, cr)).toEqual({ ok: false, reason: 'unknown-option' })
  expect(apply(ch.build, { op: 'lineOptions', uid: 'q1', ref: 'severity', value: 'severe' }, data, cr)).toEqual({ ok: true })
  expect(qualityCost(ch.build.qualities[0], v)).toBe(8)
  expect(effectsOf(data, ch.build.qualities[0]).map(b => b.value)).toEqual([-4])
  expect(validateSr6(data, cr, ch).some(x => x.code === 'choice.option')).toBe(false)
  // (kept through a save)
  expect(xmlToSr6(sr6ToXml(ch)).ok && (xmlToSr6(sr6ToXml(ch)) as { character: Sr6Character }).character.build.qualities[0].options).toEqual({
    severity: 'severe',
  })
})

test("an item's option adds its nuyen and availability; a variant's price and essence replace the entry's and its effect replaces the entry's own", () => {
  const ch = runner()
  ch.build.purchases.push({ uid: 'p1', kind: 'gear', id: 'crb.zz-binder', qty: 1, accessories: [], options: { resist: 'r4' } })
  ch.build.purchases.push({ uid: 'p2', kind: 'gear', id: 'crb.zz-limb', qty: 1, accessories: [], options: { '@variant': 'Hand' } })
  expect(priced(ch.build.purchases[0], data, cr)).toMatchObject({ cost: 350, avail: 3 })
  expect(priced(ch.build.purchases[1], data, cr)).toMatchObject({ cost: 6000, essence: 0.25 })
  expect(effectsOf(data, ch.build.purchases[1]).map(b => b.value)).toEqual([1])
  ch.build.purchases[1].options = { '@variant': 'Full' }
  expect(effectsOf(data, ch.build.purchases[1]).map(b => b.value)).toEqual([2])
  expect(withOptions(data.entry('gear', 'crb.zz-limb'))!.parts.filter(p => p.tag === 'effect')).toHaveLength(1)
})

test('a book sample with a printed price and no picks keeps that price', () => {
  const v = { karma: -2, karmaMax: -20, optionKarma: { 'a.b': 3 } } as never
  expect(qualityCost({ id: 'x', level: 1, karma: 11 } as never, v)).toBe(11)
  expect(qualityCost({ id: 'x', level: 1, karma: 11, options: { a: 'b' } } as never, v)).toBe(5)
})
