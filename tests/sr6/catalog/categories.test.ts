// Categories (src/sr6/catalog/domain/categories.ts) on the made-up fixture: a bare part shown with its category, searched by its
// composed names; an accessory category fits its host's exact category (or kind); the accessory action refuses another
// host's accessory; Review flags an accessory on the wrong host and accessories over the host's capacity.
import { expect, test } from 'vitest'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { capacityOf, capacityRemaining, capacityUsed, entryLabel, entrySearch, fitsHost, offeredOn } from '../../../src/sr6/catalog/domain/categories'
import { validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import { deriveSr6 } from '../../../src/sr6/runner-builder/domain/creation/derive'
import { priced } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'
import { buildOf, fixtureCatalog, made, STONE } from './fixture'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import type { Sr6Entry } from '../../../src/sr6/formats/domain/types'

function setup() {
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'ACDBE', metatype: STONE })
  ch.identity.metatype = STONE
  const { data, cr } = made()
  return { ch, b: ch.build, data, cr, act: (op: Parameters<typeof apply>[1]) => apply(ch.build, op, data, cr) }
}

test('a Capacity host installs an accessory that fits a slot it does not carry (the Capacity governs); a slot-only host still needs the slot', () => {
  const c = fixtureCatalog()
  const e = (kind: Sr6Entry['kind'], id: string, attrs: Record<string, string>, parts: object[] = []): Sr6Entry =>
    ({ id, kind, name: id, source: 'CRB', page: 1, attrs, text: '', parts }) as never
  // a cyberlimb-style Capacity host with NO cyberlimb-implant slot, plus accessories that FIT that (undeclared) slot
  c.entries.augmentations.set('t.limb', e('augmentations', 't.limb', { capacity: '8', type: 'cyberware', category: 'Cyberlimb' }))
  c.entries.augmentations.set(
    't.fit2',
    e('augmentations', 't.fit2', { capacity: '[2]', type: 'cyberware' }, [{ tag: 'fits', attrs: { slot: 'cyberlimb-implant' } }]),
  )
  c.entries.augmentations.set(
    't.fit9',
    e('augmentations', 't.fit9', { capacity: '[9]', type: 'cyberware' }, [{ tag: 'fits', attrs: { slot: 'cyberlimb-implant' } }]),
  )
  // a slot-only host (no Capacity) and an accessory that fits a slot it does not declare
  c.entries.weapons.set('t.gun', e('weapons', 't.gun', { category: 'Weapon' }))
  c.entries.gear.set('t.scope', e('gear', 't.scope', {}, [{ tag: 'fits', attrs: { slot: 'top' } }]))
  const data = sr6Data(c)
  const { cr } = made()
  const b = buildOf('priority', { letters: 'ACDBE', metatype: STONE })
  const act = (op: Parameters<typeof apply>[1]) => apply(b, op, data, cr)
  act({ op: 'purchase', kind: 'augmentations', id: 't.limb' })
  const limb = b.purchases[0]
  expect(act({ op: 'accessory', host: limb.uid, kind: 'augmentations', id: 't.fit2' })).toEqual({ ok: true }) // Capacity 8 governs; the missing slot no longer refuses
  expect(act({ op: 'accessory', host: limb.uid, kind: 'augmentations', id: 't.fit9' })).toEqual({ ok: false, reason: 'Not enough remaining capacity.' }) // over Capacity still refused
  act({ op: 'purchase', kind: 'weapons', id: 't.gun' })
  const gun = b.purchases[1]
  expect(act({ op: 'accessory', host: gun.uid, kind: 'gear', id: 't.scope' })).toEqual({ ok: false, reason: 'No compatible mount slot remaining.' }) // slot-only host still enforces
})

test('a bare part shows its category; the printed name stays the name; search finds the composed names', () => {
  const { data } = setup()
  const limb = data.entry('augmentations', 'crb.limb-synthetic')!
  expect(limb.name).toBe('Limb (synthetic)')
  expect(entryLabel(limb)).toBe('Torqlimb: Limb (synthetic)')
  expect(entrySearch(limb)).toContain('Torqlimb Limb (synthetic)')
  expect(entrySearch(limb)).toContain('Synthetic torqlimb')
  expect(entryLabel(data.entry('augmentations', 'crb.glow-eyes')!)).toBe('Glow Eyes') // a named item: as printed
})

test('an accessory fits its host category exactly, or a book-only one its kind by the kind’s word', () => {
  const { data } = setup()
  const e = (k: Parameters<typeof data.entry>[0], id: string) => data.entry(k, id)!
  const limb = e('augmentations', 'crb.limb-synthetic'),
    eyes = e('augmentations', 'crb.glow-eyes'),
    gun = e('weapons', 'crb.zap-gun')
  expect(fitsHost(data.categories, e('augmentations', 'crb.plating'), limb)).toBe(true)
  expect(fitsHost(data.categories, e('augmentations', 'crb.plating'), eyes)).toBe(false)
  expect(fitsHost(data.categories, e('augmentations', 'crb.glare-filter'), limb)).toBe(false)
  expect(fitsHost(data.categories, e('gear', 'crb.zap-scope'), gun)).toBe(true) // fits "Weapon": book-only (no Commlink6 usage), so every weapon
  // (an entry Commlink6 knows: an item enhancement by its requirements, a stand-alone item never)
  const scope = e('gear', 'crb.zap-scope')
  const as = (attrs: Record<string, string>, parts = scope.parts) => ({ ...scope, attrs: { ...scope.attrs, ...attrs }, parts })
  const rifleOnly = [
    { tag: 'prerequisite', attrs: { kind: 'valuereq', type: 'ITEM_ATTRIBUTE', ref: 'ITEMTYPE', value: 'WEAPON_FIREARMS', group: '1' }, text: '' },
  ]
  expect(fitsHost(data.categories, as({ usage: 'enhancement' }), gun)).toBe(true)
  expect(
    fitsHost(data.categories, as({ usage: 'enhancement' }, [...scope.parts, ...rifleOnly] as typeof scope.parts), {
      ...gun,
      attrs: { ...gun.attrs, class: 'WEAPON_CLOSE_COMBAT/BLADES' },
    }),
  ).toBe(false)
  expect(
    fitsHost(data.categories, as({ usage: 'enhancement' }, [...scope.parts, ...rifleOnly] as typeof scope.parts), {
      ...gun,
      attrs: { ...gun.attrs, class: 'WEAPON_FIREARMS/SHOTGUNS' },
    }),
  ).toBe(true)
  expect(fitsHost(data.categories, as({ usage: 'carried' }), gun)).toBe(false)
  expect(fitsHost(data.categories, e('gear', 'crb.zap-scope'), limb)).toBe(false)
  expect(fitsHost(data.categories, eyes, limb)).toBeNull() // no accessory: nothing to check
  expect([capacityOf(limb), capacityUsed(e('augmentations', 'crb.plating'), 3), capacityUsed(e('augmentations', 'crb.glare-filter'))]).toEqual([6, 3, 2])
})

test('another host’s accessory is fitted, an error a GM may approve; Review flags a host over capacity', () => {
  const { b, data, cr, ch, act } = setup()
  expect(act({ op: 'purchase', kind: 'augmentations', id: 'crb.limb-synthetic' })).toEqual({ ok: true })
  const limb = b.purchases[0]
  expect(act({ op: 'accessory', host: limb.uid, kind: 'augmentations', id: 'crb.plating', rating: 3 })).toEqual({ ok: true })
  expect(act({ op: 'accessory', host: limb.uid, kind: 'augmentations', id: 'crb.plating', rating: 3 })).toEqual({ ok: true })
  const codes = () => validateSr6(data, cr, ch).filter(v => v.code.startsWith('catalog.') && v.code !== 'catalog.formula')
  expect(codes()).toEqual([]) // 3 + 3 of 6
  // the eyeware's glare filter on the limb: fitted (it takes 2 more capacity)
  // add-time: 6 of 6 used, so the filter is refused and capacity is not exceeded
  expect(act({ op: 'accessory', host: limb.uid, kind: 'augmentations', id: 'crb.glare-filter' })).toEqual({
    ok: false,
    reason: 'Not enough remaining capacity.',
  })
  expect(limb.accessories).toHaveLength(2)
  // an over-full file (imported, or a rule changed) is still flagged: force the line in
  limb.accessories.push({ ...limb.accessories[0], uid: 'forced', id: 'crb.glare-filter', name: 'Glare filter', rating: undefined })
  const v = codes()
  expect(v.map(x => x.code).sort()).toEqual(['catalog.accessoryHost', 'catalog.capacity'])
  expect(v.find(x => x.code === 'catalog.accessoryHost')).toMatchObject({
    severity: 'error',
    source: 'CRB',
    page: 283,
    path: `augmentations.${limb.uid}`,
    message: 'Eyeware accessory: Glare filter is for Eyeware, not Torqlimb: Limb (synthetic).',
  })
  expect(v.find(x => x.code === 'catalog.capacity')!.message).toBe('Torqlimb: Limb (synthetic): its accessories take 8 capacity; it has 6.')
  // fitted into the host's capacity, an accessory costs no Essence of its own (the glare filter's 0.1: the limb's 1 alone)
  expect(priced(limb, data, cr).essence).toBe(1)
  ch.overrides = [{ code: 'catalog.accessoryHost', path: `augmentations.${limb.uid}`, note: 'GM ok' }]
  expect(codes().find(x => x.code === 'catalog.accessoryHost')?.approved).toBe(true)
})

test('a vehicle’s accessories go through the same fit engine: an autosoft in the drone’s software hook fits, a mod for a hook it lacks does not', () => {
  const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
  const extra = [
    {
      file: 'zz-drone',
      xml: `<sr6:data ${NS} kind="vehicles" version="1"><vehicle id="t.drone" source="CRB" page="1" category="Small drone" body="3" pilot="2" avail="2" cost="2000" class="DRONE_SMALL/GROUND"><name>Test Drone</name><slot id="software" value="1" unit="capacity"/><slot id="vehicle-chassis" value="3" unit="capacity"/></vehicle></sr6:data>`,
    },
    {
      file: 'zz-autosoft',
      xml: `<sr6:data ${NS} kind="gear" version="1"><gear id="t.autosoft" source="CRB" page="1" category="Autosoft" avail="4" cost="500"><name>Test Autosoft</name><fits slot="software" mode="embedded"/></gear><gear id="t.tripod" source="CRB" page="1" category="Tripod" usage="carried" avail="2" cost="100"><name>Test Tripod</name></gear><gear id="t.refill" source="CRB" page="1" category="Drone" usage="carried" avail="2" cost="10" class="DRONE_SMALL/GROUND"><name>Test Refill</name></gear><gear id="t.tyres" source="CRB" page="1" category="Tyres" avail="4" cost="500"><name>Test Tyres</name><fits slot="vehicle-tires" mode="embedded"/></gear></sr6:data>`,
    },
  ]
  const data = sr6Data(fixtureCatalog((_, x) => x, extra))
  const { cr } = made()
  expect(fitsHost(data.categories, data.entry('gear', 't.autosoft')!, data.entry('vehicles', 't.drone')!)).toBe(true)
  expect(fitsHost(data.categories, data.entry('gear', 't.tyres')!, data.entry('vehicles', 't.drone')!)).toBe(false)
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'ACDBE', metatype: STONE })
  const b = ch.build
  const act = (op: Parameters<typeof apply>[1]) => apply(b, op, data, cr)
  act({ op: 'purchase', kind: 'vehicles', id: 't.drone' })
  b.purchases[0].accessories.push({ uid: 'a1', kind: 'gear', id: 't.autosoft', name: 'Test Autosoft', accessories: [] })
  expect(validateSr6(data, cr, ch).map(v => v.code)).not.toContain('catalog.accessoryHost')
  // tyres on a drone (no tyre hook: Commlink6 gives drones none), as an imported file would carry them
  b.purchases[0].accessories.push({ uid: 'a2', kind: 'gear', id: 't.tyres', name: 'Test Tyres', accessories: [] })
  expect(validateSr6(data, cr, ch).find(v => v.code === 'catalog.accessoryHost')?.message).toBe('Test Tyres goes into vehicle-tires, not Test Drone.')
  // a stand-alone item an older file has fitted: kept, a warning, not the fit error
  // (a refill of its host, a carried item of the host's own class, is no warning)
  b.purchases[0].accessories.push({ uid: 'a9', kind: 'gear', id: 't.refill', name: 'Test Refill', accessories: [] })
  expect(validateSr6(data, cr, ch).map(v => v.code)).not.toContain('catalog.carried')
  b.purchases[0].accessories.pop()
  b.purchases[0].accessories.push({ uid: 'a3', kind: 'gear', id: 't.tripod', name: 'Test Tripod', accessories: [] })
  const v = validateSr6(data, cr, ch)
  expect(v.find(x => x.code === 'catalog.carried')).toMatchObject({
    severity: 'warning',
    message: 'Test Tripod is carried on its own, not fitted to Test Drone.',
  })
  expect(v.filter(x => x.code === 'catalog.accessoryHost')).toHaveLength(1) // (the tyres only)
  expect(b.purchases[0].accessories).toHaveLength(3)
  b.purchases[0].accessories.pop()
  // a GM's added slot makes it fit
  b.purchases[0].addedSlots = [{ id: 'vehicle-tires', value: '1' }]
  expect(validateSr6(data, cr, ch).map(v => v.code)).not.toContain('catalog.accessoryHost')
})
test('an accessory’s bonuses are its host’s: the limb’s own STR and armor change, the runner’s attributes don’t', () => {
  const { b, data, cr, ch, act } = setup()
  act({ op: 'purchase', kind: 'augmentations', id: 'crb.limb-synthetic' })
  const limb = b.purchases[0]
  act({ op: 'accessory', host: limb.uid, kind: 'augmentations', id: 'crb.plating', rating: 2 })
  const plate = limb.accessories[0]
  const before = deriveSr6(data, cr, ch)
  expect(
    act({
      op: 'bonus',
      uid: plate.uid,
      bonuses: [
        { target: 'str', value: 2 },
        { target: 'defense', value: 1, perRating: true },
      ],
    }),
  ).toEqual({ ok: true })
  const d = deriveSr6(data, cr, ch)
  expect(d.attrs.str).toEqual(before.attrs.str) // the runner's Strength: unchanged
  expect(d.defenseRating).toBe(before.defenseRating)
  expect(d.hosts).toEqual([
    {
      uid: limb.uid,
      name: 'Torqlimb: Limb (synthetic)',
      values: [
        { target: 'str', value: before.attrs.str.natural + 2 },
        { target: 'defense', value: 2 },
      ],
      text: `STR ${before.attrs.str.natural + 2}, Armor +2`,
    },
  ])
  // a bonus on the line itself is still the runner's
  act({ op: 'bonus', uid: limb.uid, bonuses: [{ target: 'str', value: 1 }] })
  expect(deriveSr6(data, cr, ch).attrs.str.augmented).toBe(before.attrs.str.augmented + 1)
  // over its capacity: a Review error
  act({ op: 'accessory', host: limb.uid, kind: 'augmentations', id: 'crb.plating', rating: 3 })
  act({ op: 'accessory', host: limb.uid, kind: 'augmentations', id: 'crb.plating', rating: 3 })
  limb.accessories.push({ ...limb.accessories[0], uid: 'forced' }) // add-time refuses it; Review still flags an over-full file
  expect(validateSr6(data, cr, ch).find(v => v.code === 'catalog.capacity')).toMatchObject({
    severity: 'error',
    message: 'Torqlimb: Limb (synthetic): its accessories take 7 capacity; it has 6.',
  })
})

test('remaining capacity is the host’s capacity minus what its accessories take; a refused over-fill leaves it unchanged', () => {
  const { b, data, act } = setup()
  const limb = data.entry('augmentations', 'crb.limb-synthetic')!,
    plating = data.entry('augmentations', 'crb.plating')!
  expect(capacityRemaining(limb, [])).toBe(capacityOf(limb))
  expect(capacityRemaining(limb, [{ entry: plating, rating: 3 }])).toBe(capacityOf(limb)! - capacityUsed(plating, 3))
  expect(capacityRemaining(undefined, [{ entry: plating, rating: 3 }])).toBeNull() // no capacity printed: unbounded
  act({ op: 'purchase', kind: 'augmentations', id: 'crb.limb-synthetic' })
  const host = b.purchases[0]
  expect(act({ op: 'accessory', host: host.uid, kind: 'augmentations', id: 'crb.plating', rating: 3 })).toEqual({ ok: true })
  expect(act({ op: 'accessory', host: host.uid, kind: 'augmentations', id: 'crb.plating', rating: 3 })).toEqual({ ok: true })
  expect(act({ op: 'accessory', host: host.uid, kind: 'augmentations', id: 'crb.plating', rating: 3 })).toEqual({
    ok: false,
    reason: 'Not enough remaining capacity.',
  })
  expect(host.accessories).toHaveLength(2)
  expect(
    capacityRemaining(
      limb,
      host.accessories.map(a => ({ entry: data.entry('augmentations', a.id!), rating: 3 })),
    ),
  ).toBe(capacityOf(limb)! - 2 * capacityUsed(plating, 3))
})

test('a ranged capacity (glasses 1–4) is the chosen rating, so it is filled by CL6 capacity points, not left unbounded', () => {
  const glasses = (r: string) => ({ attrs: { capacity: r } }) as Sr6Entry
  const low = { attrs: { capacity: '[1]' } } as Sr6Entry // Low-light vision
  const smart = { attrs: { capacity: '[2]' } } as Sr6Entry // Smartlink
  expect(capacityOf(glasses('1–4'), 3)).toBe(3) // Capacity equals the rating, not null/unbounded
  expect(capacityOf(glasses('1–4'), 5)).toBe(4) // clamped to the printed range
  // a Capacity-3 pair holds Low-light [1] + Smartlink [2] exactly; nothing more fits
  expect(capacityRemaining(glasses('1–4'), [{ entry: low }, { entry: smart }], 3)).toBe(0)
  expect(capacityRemaining(glasses('1–4'), [{ entry: low }, { entry: smart }, { entry: low }], 3)).toBe(-1)
})

test('raising a fitted accessory’s rating may not overfill its host (the add-time guard, on rate)', () => {
  const { b, act } = setup()
  act({ op: 'purchase', kind: 'augmentations', id: 'crb.limb-synthetic' })
  const host = b.purchases[0]
  act({ op: 'accessory', host: host.uid, kind: 'augmentations', id: 'crb.plating', rating: 3 })
  act({ op: 'accessory', host: host.uid, kind: 'augmentations', id: 'crb.plating', rating: 1 })
  act({ op: 'accessory', host: host.uid, kind: 'augmentations', id: 'crb.plating', rating: 1 })
  const low = host.accessories[1],
    was = structuredClone(low)
  expect(act({ op: 'rate', uid: low.uid, rating: 3 })).toEqual({ ok: false, reason: 'Not enough remaining capacity.' })
  expect(low).toEqual(was)
  expect(act({ op: 'rate', uid: low.uid, rating: 2 })).toEqual({ ok: true })
})

test('the picker offers a slotted host only the accessories that fit it: a weapon accessory is never offered to cyberears', () => {
  const e = (kind: Sr6Entry['kind'], id: string, attrs: Record<string, string>, parts: object[] = []): Sr6Entry =>
    ({ id, kind, name: id, source: 'CRB', page: 1, attrs, text: '', parts }) as never
  const index = new Map<string, Sr6Entry[]>() // no category records: only the slots decide
  const ears = e('augmentations', 'crb.ears', { capacity: '4' }, [{ tag: 'slot', attrs: { id: 'cyberear-implant', value: '4' } }])
  const audio = e('gear', 'crb.audio', {}, [{ tag: 'fits', attrs: { slot: 'cyberear-implant' } }])
  const flashlight = e('weapons', 'crb.flashlight', {}, [{ tag: 'fits', attrs: { slot: 'top' } }])
  const bare = e('gear', 'crb.bare', {}) // declares nothing (a pre-categories import)
  const taking = () => true
  expect(offeredOn(index, audio, ears, taking, () => true)).toBe(true)
  expect(offeredOn(index, flashlight, ears, taking, () => true)).toBe(false) // declared a fit, not this host's
  expect(offeredOn(index, bare, ears, taking, () => true)).toBe(false) // a slot-based host takes no undeclared fall-through
  const plain = e('weapons', 'crb.gun', {})
  expect(offeredOn(index, bare, plain, taking, () => true)).toBe(true) // a host with no slots still takes it by `filter`
  expect(offeredOn(index, flashlight, plain, undefined, () => true)).toBe(false) // a line that takes any gear: not a declared fit
  expect(offeredOn(index, bare, plain, undefined, () => false)).toBe(true)
})

test('a Rigger Command Console that fits slot rcc is offered on a host with an rcc slot, though it is an electronics device on an augmentation', () => {
  const e = (kind: Sr6Entry['kind'], id: string, attrs: Record<string, string>, parts: object[] = []): Sr6Entry =>
    ({ id, kind, name: id, source: 'CRB', page: 1, attrs, text: '', parts }) as never
  const index = new Map<string, Sr6Entry[]>()
  const host = e('augmentations', 'dc.rcc-headware', { category: 'Headware' }, [{ tag: 'slot', attrs: { id: 'rcc' } }])
  const console_ = e('electronics', 'crb.horizon-overseer', { category: 'Rigger command console' }, [{ tag: 'fits', attrs: { slot: 'rcc' } }])
  expect(
    offeredOn(
      index,
      console_,
      host,
      () => false,
      () => false,
    ),
  ).toBe(true)
})

test('a spare clip (and the Predator magazine as gear) fits a firearm carrying the firearms-external slot, and is not offered as standalone gear', () => {
  const e = (kind: Sr6Entry['kind'], id: string, parts: object[]): Sr6Entry =>
    ({ id, kind, name: id, source: 'CRB', page: 1, attrs: {}, text: '', parts }) as never
  const gun = e('weapons', 't.gun', [{ tag: 'slot', attrs: { id: 'firearms-external' } }])
  const clip = e('weapons', 't.clip', [{ tag: 'fits', attrs: { slot: 'firearms-external' } }])
  const mag = e('gear', 't.mag', [{ tag: 'fits', attrs: { slot: 'firearms-external' } }])
  const index = new Map<string, Sr6Entry[]>()
  expect(fitsHost(index, clip, gun)).toBe(true)
  expect(fitsHost(index, mag, gun)).toBe(true)
  expect(offeredOn(index, mag, undefined, undefined, () => true)).toBe(false)
})

test('a modonly item (CL6 modonly="true") is never offered standalone, only embedded in a host it fits', () => {
  const e = (kind: Sr6Entry['kind'], id: string, attrs: Record<string, string>, parts: object[] = []): Sr6Entry =>
    ({ id, kind, name: id, source: 'CRB', page: 1, attrs, text: '', parts }) as never
  const index = new Map<string, Sr6Entry[]>()
  // a core vehicle mod: modonly, fits a vehicle's chassis slot
  const host = e('vehicles', 't.van', {}, [{ tag: 'slot', attrs: { id: 'vehicle-chassis' } }])
  const coremod = e('gear', 't.coremod', { modonly: 'true' }, [{ tag: 'fits', attrs: { slot: 'vehicle-chassis' } }])
  // a modonly item with no declared fit and no category: still never standalone
  const bareMod = e('gear', 't.baremod', { modonly: 'true' })
  expect(offeredOn(index, coremod, host, undefined, () => true)).toBe(true) // embedded in its host
  expect(offeredOn(index, coremod, undefined, undefined, () => true)).toBe(false) // never standalone
  expect(offeredOn(index, bareMod, undefined, undefined, () => true)).toBe(false)
  expect(
    offeredOn(
      index,
      bareMod,
      undefined,
      () => true,
      () => false,
    ),
  ).toBe(false) // not even on a take-any line
})
