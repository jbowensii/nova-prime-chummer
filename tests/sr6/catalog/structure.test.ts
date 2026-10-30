// The item structure (src/sr6/catalog/domain/structure.ts): read from an entry's slot, fits, variant, relevance and flag children
// and its modonly, size and ammoClass attributes. Made-up entry.
import { expect, test } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { readFileSync } from 'node:fs'
import { toEntry } from '../../../src/sr6/formats/domain/entryxml'
import { fit, fitsOnly, mountSlots, requirementsOf, structureOf } from '../../../src/sr6/catalog/domain/structure'
import type { Sr6Entry } from '../../../src/sr6/formats/domain/types'
import { effectBonuses, maxEffects } from '../../../src/sr6/catalog/domain/effects'
import type { Sr6Data } from '../../../src/sr6/catalog/domain/data'

const NS = 'urn:chummer-sr6:data:1'
const doc = `<?xml version="1.0" encoding="UTF-8"?>
<sr6:data xmlns:sr6="${NS}" kind="weapons" version="1">
  <weapon id="zz.widget" source="ZZ" page="3" category="Zed" size="Military" ammoClass="Heavy" modonly="true" avail="2" cost="10">
    <name>Widget</name><slot id="under" value="2"/><slot id="top"/><fits slot="internal"/><slot id="software" value="99" unit="capacity" maxSize="1"/><fits slot="vehicle-weapon" cost="1" mode="embedded" rule="W"/><variant name="Long"/><variant name="Short"/>
    <relevance topic="combat"/><flag>codemod</flag>
    <modifier kind="valmod" type="ATTRIBUTE" ref="AGILITY" value="1"/><prerequisite kind="datareq" type="QUALITY" ref="zed"/><selection type="SKILL"/><text/>
  </weapon>
</sr6:data>`

test('structureOf reads the slots, fits, variants, relevance, flags and the add-on, size and ammunition class', () => {
  const el = new DOMParser().parseFromString(doc, 'text/xml').getElementsByTagName('weapon')[0]
  expect(structureOf(toEntry(el, 'weapons'))).toEqual({
    slots: [{ id: 'under', value: '2' }, { id: 'top' }, { id: 'software', value: '99', unit: 'capacity', maxSize: '1' }],
    fits: ['internal', 'vehicle-weapon'],
    usages: [{ slot: 'internal' }, { slot: 'vehicle-weapon', cost: '1', mode: 'embedded', rule: 'W' }],
    variants: ['Long', 'Short'],
    relevance: ['combat'],
    flags: ['codemod'],
    modifiers: [{ kind: 'valmod', type: 'ATTRIBUTE', ref: 'AGILITY', value: '1' }],
    prerequisites: [{ kind: 'datareq', type: 'QUALITY', ref: 'zed' }],
    selections: [{ type: 'SKILL' }],
    modOnly: true,
    size: 'Military',
    ammoClass: 'Heavy',
  })
})

test('an entry with none of them has an empty structure', () => {
  const el = new DOMParser()
    .parseFromString(doc.replace(/<(slot|fits|variant|relevance|modifier|prerequisite|selection)[^>]*\/>|<flag>.*?<\/flag>/g, ''), 'text/xml')
    .getElementsByTagName('weapon')[0]
  const s = structureOf(toEntry(el, 'weapons'))
  expect([s.slots, s.fits, s.variants, s.relevance, s.flags]).toEqual([[], [], [], [], []])
})

test('the data schema accepts the structure', async () => {
  const dir = 'public/data/sr6/schema/'
  const r = await validateXML({
    xml: [{ fileName: 'w.xml', contents: doc }],
    schema: [{ fileName: 'weapons.xsd', contents: readFileSync(dir + 'weapons.xsd', 'utf8') }],
    preload: [{ fileName: 'common.xsd', contents: readFileSync(dir + 'common.xsd', 'utf8') }],
  })
  expect(r.errors.map(e => e.message)).toEqual([])
})

test('Commlink6’s own rule data on an entry changes none of the maths: only the entry’s <effect>s are applied', () => {
  const xml = (extra: string) => `<?xml version="1.0" encoding="UTF-8"?>
<sr6:data xmlns:sr6="${NS}" kind="qualities" version="1">
  <quality id="zz.q" source="ZZ" page="1" kind="positive" karma="5"><name>Zed</name><effect target="attr:agi" op="add" value="1"/>${extra}<text/></quality>
</sr6:data>`
  const entry = (extra: string) => toEntry(new DOMParser().parseFromString(xml(extra), 'text/xml').getElementsByTagName('quality')[0], 'qualities')
  const plain = entry(''),
    withData = entry(
      '<modifier kind="valmod" type="ATTRIBUTE" ref="AGILITY" value="2"/><modifier kind="checkmod" type="SKILL" ref="stealth" value="3"/><prerequisite kind="datareq" type="METATYPE" ref="troll"/><selection type="SKILL"/>',
    )
  const data = {} as Sr6Data
  expect(effectBonuses(data, withData)).toEqual(effectBonuses(data, plain))
  expect(effectBonuses(data, plain).length).toBe(1)
  expect(maxEffects(withData)).toEqual(maxEffects(plain))
  expect(structureOf(withData).modifiers).toHaveLength(2)
})

// the one fit engine (fit plan Stages 3-4), one test per gate, invented entries
const item = (attrs: Record<string, string>, kids = '', kind = 'gear', name = 'X'): Sr6Entry =>
  toEntry(
    new DOMParser()
      .parseFromString(
        `<sr6:data xmlns:sr6="${NS}"><x id="zz.${Math.random()}" source="ZZ" page="1" ${Object.entries(attrs)
          .map(([k, v]) => `${k}="${v}"`)
          .join(' ')}><name>${name}</name>${kids}</x></sr6:data>`,
        'text/xml',
      )
      .getElementsByTagName('x')[0],
    kind as 'gear',
  )

test('fit: the hook layer; cyberware never fits a drone (no hook), a GM-added slot counts, a removed one does not', () => {
  const drone = item({ class: 'DRONE_SMALL/GROUND' }, '<slot id="vehicle-chassis" value="3" unit="capacity"/>')
  const ware = item({ class: 'CYBERWARE/CYBER_BODYWARE' }, '<fits slot="cyberlimb-implant" cost="2" mode="implanted"/>')
  expect(fit(drone, ware, [])).toMatchObject({ ok: false, reason: 'hook' })
  expect(fit(drone, ware, [], 1, [{ id: 'cyberlimb-implant', value: '4', unit: 'capacity' }]).ok).toBe(true)
  const mod = item({}, '<fits slot="vehicle-chassis" cost="1"/>')
  expect(fit(drone, mod, []).ok).toBe(true)
  expect(fit(drone, mod, [], 1, [], ['vehicle-chassis']).reason).toBe('hook')
  expect(fit(drone, item({}), []).ok).toBeNull() // (declares no usage: nothing to check by hook)
})

test('fit: capacity in points, one item per one-item hook, alternatives, no limit at 99', () => {
  const limb = item({}, '<slot id="cyberlimb-implant" value="4" unit="capacity"/>')
  const two = item({}, '<fits slot="cyberlimb-implant" cost="2"/>')
  const three = item({}, '<fits slot="cyberlimb-implant" cost="3"/>')
  expect(fit(limb, three, [{ uid: 'a', entry: two }])).toMatchObject({ ok: false, reason: 'room' })
  expect(fit(limb, two, [{ uid: 'a', entry: two }]).ok).toBe(true)
  const gun = item({}, '<slot id="top" unit="one" value="1"/><slot id="under" unit="one" value="1"/><slot id="firearms-external" value="99" unit="capacity"/>')
  const either = item({}, '<fits slot="top"/><fits slot="under"/>'),
    topOnly = item({}, '<fits slot="top"/>')
  // (the smartgun-style either goes under so the top-only scope still fits)
  expect(fit(gun, topOnly, [{ uid: 'a', entry: either }]).ok).toBe(true)
  expect(
    fit(gun, topOnly, [
      { uid: 'a', entry: either },
      { uid: 'b', entry: topOnly },
    ]).reason,
  ).toBe('room')
  const sling = item({}, '<fits slot="firearms-external"/>')
  expect(
    fit(
      gun,
      sling,
      Array.from({ length: 150 }, (_, i) => ({ uid: `s${i}`, entry: sling })),
    ).ok,
  ).toBe(true)
  expect(mountSlots(gun, [{ uid: 'a', entry: either }]).occupied.get('a')).toBe('top')
})

test('fit: a hook’s maxSize caps one item (a small drone’s half hardpoint)', () => {
  const drone = item({}, '<slot id="vehicle-hardpoint" value="0.5" unit="capacity" maxSize="0.5"/>')
  expect(fit(drone, item({}, '<fits slot="vehicle-hardpoint" cost="1"/>'), [])).toMatchObject({ ok: false, reason: 'size' })
  expect(fit(drone, item({}, '<fits slot="vehicle-hardpoint" cost="0.5"/>'), []).ok).toBe(true)
})

test('fitsOnly: an embedded usage of its own; a synthesized (W/I) or carried/implanted one leaves the item standalone', () => {
  expect(fitsOnly(structureOf(item({}, '<fits slot="top"/>')))).toBe(true)
  expect(fitsOnly(structureOf(item({}, '<fits slot="vehicle-weapon" mode="embedded" rule="W"/>')))).toBe(false)
  expect(fitsOnly(structureOf(item({}, '<fits slot="cyberlimb-implant" mode="implanted"/>')))).toBe(false)
})

test('requirementsOf: as Commlink6, DATA_ITEM tests only (a selreq with no apply passes); a holster’s gun-type group always', () => {
  const pistol = item({ class: 'WEAPON_FIREARMS/PISTOLS_HEAVY', size: 'Small', category: 'Heavy Pistols', ammo: '6(cy)' })
  const rifle = item({ class: 'WEAPON_FIREARMS/RIFLE_ASSAULT', size: 'Large', category: 'Assault Rifles', ammo: '30(c)' })
  const sizes =
    '<prerequisite kind="valuereq" type="ITEM_ATTRIBUTE" ref="WEAPON_SIZE" value="TINY" group="1"/><prerequisite kind="valuereq" type="ITEM_ATTRIBUTE" ref="WEAPON_SIZE" value="SMALL" group="1"/>'
  const holster = item({}, sizes, 'gear', 'Concealable holster')
  expect(requirementsOf(holster, pistol).failed).toEqual([])
  expect(requirementsOf(holster, rifle).failed).toEqual(['weapon size tiny or weapon size small'])
  // (the same group on anything else: its members carry no apply, so Commlink6 passes it, a silencer's subtype list too)
  expect(requirementsOf(item({}, sizes, 'gear', 'Silencer'), rifle).failed).toEqual([])
  const sel = (apply: string) =>
    item(
      {},
      `<prerequisite kind="datareq" type="ITEMSUBTYPE" ref="SHOTGUNS" group="1"${apply}/><prerequisite kind="datareq" type="ITEMSUBTYPE" ref="RIFLE_SNIPER" group="1"${apply}/>`,
    )
  expect(requirementsOf(sel(' apply="DATA_ITEM"'), rifle).failed).toEqual(['itemsubtype shotguns or itemsubtype rifle sniper'])
  expect(requirementsOf(sel(''), rifle).failed).toEqual([])
  const ammo = item({}, '<prerequisite kind="datareq" type="ITEMSUBTYPE" ref="RIFLE_ASSAULT" apply="DATA_ITEM"/>')
  expect(requirementsOf(ammo, pistol).failed).toEqual(['itemsubtype rifle assault'])
  expect(requirementsOf(ammo, rifle).failed).toEqual([])
  // (the owner's WEAPON_TYPE exclusion has no apply: Commlink6 would not test it, so neither does the app)
  expect(requirementsOf(item({}, '<prerequisite kind="valuereq" type="WEAPON_TYPE" ref="revolvers" negate="true"/>'), pistol).failed).toEqual([]) // (no apply and no group: Commlink6 does not test it at embed time; an unknown test is listed, never failed)
  expect(requirementsOf(item({}, '<prerequisite kind="datareq" type="ITEMTYPE" ref="BOWS"/>'), pistol).failed).toEqual([])
  expect(requirementsOf(item({}, '<prerequisite kind="valuereq" type="ITEM_ATTRIBUTE" ref="PILOT" value="3" apply="DATA_ITEM"/>'), pistol)).toEqual({
    failed: [],
    unchecked: ['pilot 3'],
  })
  // a variant's own tests (`variant`): one variant's set holding is enough (Commlink6's variant choice)
  const v = (s: string, varid: string) => `<prerequisite kind="datareq" type="ITEMSUBTYPE" ref="${s}" apply="DATA_ITEM" variant="${varid}"/>`
  const either = item({}, v('RIFLE_ASSAULT', 'long') + v('PISTOLS_HEAVY', 'short'))
  expect(requirementsOf(either, pistol).failed).toEqual([])
  expect(requirementsOf(either, rifle).failed).toEqual([])
  expect(requirementsOf(item({}, v('SHOTGUNS', 'long') + v('HOLDOUTS', 'short')), rifle).failed).toEqual(['itemsubtype shotguns or itemsubtype holdouts'])
})
