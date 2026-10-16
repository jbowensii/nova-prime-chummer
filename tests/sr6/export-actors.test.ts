// What the export carries for the Foundry module's Eden Vehicle and Critter actors (owner 2026-10-16, BUILDER Q12): a
// runner's vehicles and drones (their mods, a weapon's mount, autosofts, the mods built in, slot shifts, seats taken out,
// a Designer design) and critters (stat block, class, training, companion qualities, critterware and gear), and a
// critter the GM designs (the NPC path). Invented entries, invented numbers.
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import { expect, test } from 'vitest'
import { designCritter, redesign } from '../../src/sr6/engine/critterdesign'
import { boughtDesign } from '../../src/sr6/engine/design'
import { critterTraining, exportSr6Runners } from '../../src/sr6/engine/export'
import { blankSr6Npc } from '../../src/sr6/engine/npc'
import { sr6Data } from '../../src/sr6/engine/data'
import { blankSr6, type Sr6Character } from '../../src/sr6/model/character'
import { designCatalog } from './design-fixture'
import { fixtureCreation } from './fixture'
import { mara, SAMPLE_OPTS, sampleWorld } from './samples'

const schema = new Ajv2020({ strict: false, validateFormats: false }).compile(JSON.parse(readFileSync('public/data/schema/sr6-export.schema.json', 'utf8')))
const valid = (f: unknown) => expect(schema(f), JSON.stringify(schema.errors)).toBe(true)

test('a drone: its numbers, a drone, its built-in mod; its mod (do-it-yourself), mount, mounted weapon and autosoft', () => {
  const w = sampleWorld(),
    f = exportSr6Runners(w.c, w.data, w.cr, [mara(w)], SAMPLE_OPTS)
  valid(f)
  const r = f.runners![0],
    drone = r.purchases.find(p => p.uid === 'v2')!
  expect(drone.values.vehicle).toEqual({ handling: [3, 3], accel: [8, 8], interval: [10, 10], topSpeed: 80, body: 6, armor: 3, pilot: 3, sensor: 3, seats: 0 })
  expect(drone.attrs.class).toBe('DRONE_MEDIUM/AIR')
  expect(drone.vehicle).toEqual({ drone: true, builtin: ['Made-up plating 2'] })
  const fit = (uid: string) => drone.accessories.find(a => a.uid === uid)!
  expect(fit('v2m')).toMatchObject({
    diy: true,
    effects: [
      { target: 'item:handling', value: '-1' },
      { target: 'item:top-speed', value: '10' },
    ],
  })
  expect(fit('v2w')).toMatchObject({ kind: 'weapons', mount: 'v2h', values: { dv: 3, modes: ['SA', 'BF'], ammo: 30 } })
  expect(fit('v2h')).not.toHaveProperty('mount')
  expect(fit('v2a')).toMatchObject({ kind: 'programs', attrs: { type: 'autosoft' }, values: { rating: 3 } })
  // a vehicle that is no drone, with nothing built in
  expect(r.purchases.find(p => p.uid === 'v1')!.vehicle).toEqual({ drone: false, builtin: [] })
})

test('seats taken out for cargo and mod slot shifts go with the vehicle; its seats are what is left', () => {
  const w = sampleWorld(),
    m = mara(w)
  Object.assign(
    m.build.purchases.find(p => p.uid === 'v1')!,
    { seatsRemoved: 1, slotShifts: [{ from: 'chassis', to: 'electronics' }] },
  )
  const f = exportSr6Runners(w.c, w.data, w.cr, [m], SAMPLE_OPTS)
  valid(f)
  const bike = f.runners![0].purchases.find(p => p.uid === 'v1')!
  expect(bike.values.vehicle!.seats).toBe(0)
  expect(bike.vehicle).toEqual({ drone: false, builtin: [], seatsRemoved: 1, slotShifts: [{ from: 'chassis', to: 'electronics' }] })
})

test('a vehicle bought from a Designer design: the design’s numbers, its id, its own mods and universal slots built in', () => {
  const c = designCatalog(),
    data = sr6Data(c),
    cr = fixtureCreation()
  const doc = blankSr6('priority', 'des-1', '2026-10-16T00:00:00.000Z')
  doc.identity.streetName = 'Red Zip'
  doc.design = {
    kind: 'vehicle',
    chassis: 'zz.zip-frame',
    powertrain: 'zz.roller',
    console: 'zz.brainbox',
    options: [{ id: 'zz.easily-modified', level: 2 }],
    mods: [{ uid: 'm1', kind: 'gear', id: 'zz.zap-grip', qty: 1, accessories: [] }],
  }
  const runner: Sr6Character = blankSr6('karma', 'r1', '2026-10-16T00:00:00.000Z')
  runner.build.purchases = [boughtDesign(doc, data, cr, 'v9')]
  const f = exportSr6Runners(c, data, cr, [runner], SAMPLE_OPTS)
  valid(f)
  const v = f.runners![0].purchases[0]
  expect(v).toMatchObject({ uid: 'v9', kind: 'vehicles', id: 'design.des-1', name: 'Red Zip', source: 'DC' })
  expect(v.values.vehicle).toMatchObject({ body: 10, topSpeed: 160, accel: [10, 10] })
  expect(v.vehicle).toEqual({ drone: false, builtin: ['Zap Grip', '4 more universal mod slots'], design: 'des-1' })
})

test('a critter: its stat block, class, training, companion qualities (positive or not) and gear', () => {
  const w = sampleWorld(),
    f = exportSr6Runners(w.c, w.data, w.cr, [mara(w)], SAMPLE_OPTS)
  const k = f.runners![0].purchases.find(p => p.uid === 'k2')!
  expect(k.critter).toEqual({
    class: 'exotic',
    tamed: false,
    commands: 2,
    training: 1,
    trained: [
      { what: 'command', name: 'Unnamed command', taught: false },
      { what: 'command', name: 'Unnamed command', taught: false },
      { what: 'training', name: 'Unnamed special training', taught: true },
    ],
    qualities: [{ uid: 'k2q', id: 'mur.test-loyal', level: 1, name: 'Made-up Loyal', positive: true }],
  })
  expect(k.npc).toMatchObject({ kind: 'critter', from: { id: 'mus.fake-hound' } })
  expect(k.npc!.lines).toContainEqual({ part: 'powers', text: 'Made-up Glow, Fake Bite' })
  expect(k.npc!.stats.find(s => s.key === 'bod')).toMatchObject({ value: '5' })
  expect(k.accessories.map(a => [a.uid, a.name])).toEqual([['k2c', 'Made-up Collar']])
  // the one accessor the training goes through
  expect(critterTraining({ uid: 'x', kind: 'critters', qty: 1, accessories: [] }, w.data)).toEqual({ commands: 0, training: 0, trained: [] })
})

test('a critter the GM designs goes out on the NPC path: kind critter, its generated powers line', () => {
  const w = sampleWorld(),
    ch = blankSr6Npc('critter', undefined, SAMPLE_OPTS.now)
  ch.identity.streetName = 'Made-up Mudpup'
  designCritter(ch.npc!, w.data, w.cr)
  redesign(ch.npc!, w.data, w.cr, n => {
    Object.assign(n.stats, { bod: '3', rea: '4', int: '2' })
    n.design!.powers.push({ id: 'mus.made-up-glow', name: 'Made-up Glow' })
  })
  const f = exportSr6Runners(w.c, w.data, w.cr, [ch], SAMPLE_OPTS)
  valid(f)
  const r = f.runners![0]
  expect(r.streetName).toBe('Made-up Mudpup')
  expect(r.npc).toMatchObject({ kind: 'critter' })
  expect(r.npc!.lines).toContainEqual({ part: 'powers', text: 'Made-up Glow' })
  expect(r.npc!.stats.find(s => s.key === 'init')).toMatchObject({ value: '6 + 1D6' })
})
