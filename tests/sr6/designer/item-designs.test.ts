// The Weapon and Cyberware designers (src/sr6/designer/ui/ItemDesigner.tsx): a design is edited on a one-line scratch
// runner through the same engine steps as the Customise page, so its price, Essence and Availability match the same build
// made on a runner; it round-trips through the design file; bought onto a runner it arrives fully built. Invented entries.
import { expect, test } from 'vitest'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { boughtItemDesign, customLimb, limbIncrease, limbOf } from '../../../src/sr6/runner-builder/domain/assets/builders'
import { priced } from '../../../src/sr6/runner-builder/domain/creation/purchases'
import { runAct } from '../../../src/sr6/runner-builder/ui/editor'
import { sr6Data, type Sr6Data } from '../../../src/sr6/catalog/domain/data'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { blankSr6, type Sr6Character, type Sr6Purchase } from '../../../src/sr6/formats/domain/character'
import type { CreationRules } from '../../../src/sr6/table-setup/domain/creation'
import { newItemDesign, scratchOf } from '../../../src/sr6/designer/ui/ItemDesigner'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from '../catalog/fixture'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const at = 'source="ZZ" page="1"'
const WEAPONS = `<sr6:data ${NS} kind="weapons" version="1">
  <weapon id="zz.scope" ${at} category="Weapon accessory" class="ACCESSORY/WEAPON_ACCESSORY" avail="3" cost="300"><name>Zap Scope</name><effect target="item:ar" op="add" value="0,0,2,2,2"/><fits slot="top"/></weapon>
  <weapon id="zz.rifle" ${at} category="Assault rifle" dv="4P" ar="4/10/8/6/2" modes="SA/BF/FA" ammo="30(c)" avail="2" cost="500"><name>Zap Rifle</name>
    <slot id="top" unit="one" value="1"/><slot id="barrel" unit="one" value="1"/></weapon>
</sr6:data>`
const world = () => ({ data: sr6Data(fixtureCatalog(undefined, [{ file: 'custom/sr6/imported/zz/weapons.xml', xml: WEAPONS }])), cr: fixtureCreation() })
const runner = (purchases: Sr6Purchase[]): Sr6Character => ({ ...blankSr6('priority'), build: { ...buildOf('priority', { metatype: GLIM }), purchases } })
const rifle = (): Sr6Purchase => ({ uid: 'r1', kind: 'weapons', id: 'zz.rifle', qty: 1, accessories: [] })
const ok = (r: { ch: Sr6Character } | { error: string }) => {
  if ('error' in r) throw new Error(r.error)
  return r.ch.build.purchases[0]
}
const money = (x: Sr6Purchase, data: Sr6Data, cr: CreationRules) => (p => ({ cost: p.cost, avail: p.avail, essence: p.essence }))(priced(x, data, cr))
const roundTrip = (doc: Sr6Character) => {
  const back = xmlToSr6(sr6ToXml(doc))
  if (!back.ok) throw new Error(back.reason)
  return back.character
}

test('a weapon design: same price and Availability as the same build on Customise; bought, it arrives fully built', () => {
  const { data, cr } = world()
  const fit = { op: 'accessory' as const, host: 'r1', kind: 'weapons' as const, id: 'zz.scope' }
  const onRunner = ok(runAct(runner([rifle()]), fit, data, cr)) // the Customise page
  const designed = ok(runAct(scratchOf(rifle()), fit, data, cr)) // the Weapon designer's scratch runner
  expect(money(designed, data, cr)).toEqual(money(onRunner, data, cr))
  const doc = roundTrip(newItemDesign('weapon', designed, 'Long gun', false))
  expect(doc.itemDesign).toMatchObject({ kind: 'weapon', line: { id: 'zz.rifle', accessories: [{ id: 'zz.scope' }] } })
  expect(doc.itemDesign!.approved).toBeUndefined()
  const b = runner([]).build
  expect(apply(b, { op: 'design', line: boughtItemDesign(doc) }, data, cr).ok).toBe(true)
  expect(money(b.purchases[0], data, cr)).toEqual(money(onRunner, data, cr))
  expect([b.purchases[0].design, b.purchases[0].accessories[0].id]).toEqual([doc.id, 'zz.scope'])
  expect(newItemDesign('weapon', designed, 'GM gun', true).itemDesign!.approved).toBe(true)
})

test('a cyberware design: a custom limb with an increase prices and costs Essence as the Customise page’s', () => {
  const { data, cr } = world()
  const limb = customLimb('arm', 'synthetic')
  // the designer's stepper takes the Customise page's step: a custom add-on on the limb
  const designed = ok(runAct(scratchOf(limb), { op: 'custom', host: limb.uid, line: limbIncrease('str', 3) }, data, cr))
  const made = customLimb('arm', 'synthetic', { str: 3 })
  expect(money(designed, data, cr)).toEqual(money(made, data, cr))
  const doc = roundTrip(newItemDesign('cyberware', designed, 'Strong arm', false))
  expect(doc.itemDesign!.kind).toBe('cyberware')
  const b = runner([]).build
  expect(apply(b, { op: 'design', line: boughtItemDesign(doc) }, data, cr).ok).toBe(true)
  expect(limbOf(b.purchases[0])!.inc.str).toBe(3)
  expect(money(b.purchases[0], data, cr)).toEqual(money(made, data, cr))
})
