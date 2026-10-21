// Phase 3, Anarchy: players' runners use compendium entries. A runner sees the compendiums shared with its own campaign
// (forCampaign), keeps a copy of every compendium entry it uses (keepHouse), and keeps working, exporting and printing
// them once the compendium is unshared or deleted, with a "source no longer available" note. Made-up entries only.
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import { expect, test } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { characterToXml, xmlToCharacter } from '../../src/engine/charxml'
import { compendiumXml, forCampaign } from '../../src/engine/compendium'
import { derive, vehicleStats } from '../../src/engine/derive'
import { exportRunners } from '../../src/engine/export'
import { blankCharacter, keepHouse, snapshotEntries } from '../../src/engine/file'
import { buildCatalog } from '../../src/engine/load'
import { price } from '../../src/engine/price'
import { validate } from '../../src/engine/validate'
import type { Character, Compendium } from '../../src/model/types'
import { catFiles } from '../helpers'

const ref = { source: 'STREET', page: 1 }
const street: Compendium = {
  id: '0123456789ab',
  name: 'Street Gear',
  source: 'STREET',
  sharing: 'campaign',
  campaign: 'abcdef012345',
  updatedAt: '2026-10-02T00:00:00.000Z',
  amps: [],
  npcs: [],
  items: [{ id: 'street.pipe', kind: 'weapon', name: 'Lead Pipe', dv: 'STR+1', ranges: 'OK/-/-/-', text: 'Heavy.', ...ref }],
  vehicles: [{ id: 'street.scooter', name: 'Scooter', pilot: 1, body: 4, handling: 3, speed: 2, armor: 0, mount: 'none', ...ref }],
}
const table: Compendium = {
  ...street,
  id: '0123456789ac',
  name: 'Table Kit',
  source: 'KIT',
  sharing: 'table',
  campaign: undefined,
  vehicles: [],
  items: [{ id: 'kit.torch', kind: 'gear', name: 'Torch', text: '', source: 'KIT', page: 1 }],
}
const file = (comp: Compendium) => ({ file: `compendiums/gm1/${comp.id}.xml`, xml: compendiumXml(comp), overlay: true, publisher: 'Game Master', owner: 'gm1' })
const withComps = buildCatalog([...catFiles, file(street), file(table)])
const without = buildCatalog(catFiles)

/** A runner in `campaign` with the pipe, the torch and a vehicle amp on the scooter, as the editor saves it. */
function runner(campaign?: string): Character {
  const ch = blankCharacter()
  ch.identity.streetName = 'Pipe'
  ch.campaign = campaign
  const pipe = withComps.items.get('street.pipe')!,
    torch = withComps.items.get('kit.torch')!
  ch.build.items = [
    { uid: 'i1', catalogId: pipe.id, kind: 'weapon', name: pipe.name, snapshot: pipe },
    { uid: 'i2', catalogId: torch.id, kind: 'gear', name: torch.name, snapshot: torch },
  ]
  ch.build.amps = [{ uid: 'v1', type: 'vehicle', name: 'My Scooter', narrative: '', effects: [], vehicle: 'street.scooter' }]
  return keepHouse(withComps, ch)
}

test('a runner sees the compendiums shared with its own campaign and the table’s, not another campaign’s', () => {
  expect(withComps.sources.get('STREET')!.compendium).toEqual({ id: street.id, owner: 'gm1', campaign: 'abcdef012345' })
  expect(withComps.sources.get('KIT')!.compendium).toEqual({ id: table.id, owner: 'gm1' })
  const mine = forCampaign(withComps, 'abcdef012345'),
    other = forCampaign(withComps, 'ffffffffffff'),
    none = forCampaign(withComps, undefined)
  expect(mine).toBe(withComps)
  for (const c of [other, none]) {
    expect(c.items.has('street.pipe')).toBe(false)
    expect(c.vehicles.has('street.scooter')).toBe(false)
    expect(c.items.has('kit.torch')).toBe(true)
    expect(c.vehicles.size).toBe(withComps.vehicles.size - 1)
  }
  expect(forCampaign(without, undefined)).toBe(without)
})

test('keepHouse copies a compendium vehicle’s chassis and keeps the items’ snapshots; book entries are left alone', () => {
  const ch = runner('abcdef012345')
  expect(ch.build.amps[0].chassis).toEqual(withComps.vehicles.get('street.scooter'))
  const book = { ...ch, build: { ...ch.build, amps: [{ ...ch.build.amps[0], vehicle: 'small-drone', chassis: undefined }] } }
  expect(keepHouse(withComps, book).build.amps[0].chassis).toBeUndefined()
  // once gone, the copies stay
  expect(keepHouse(without, ch)).toBe(ch)
})

test('once the compendiums are gone the runner prices, derives and exports the same, noted “no longer available”', () => {
  const ch = runner('abcdef012345')
  expect(price(without, ch).total).toBe(price(withComps, ch).total)
  expect(vehicleStats(without, ch.build.amps[0])).toEqual(vehicleStats(withComps, ch.build.amps[0]))
  expect(derive(without, ch).weapons.map(w => w.dv)).toEqual(derive(withComps, ch).weapons.map(w => w.dv))
  const v = validate(without, ch)
  expect(v.filter(x => x.code === 'ref.unknown')).toEqual([])
  expect(v.filter(x => x.code === 'ref.gone').map(x => [x.path, x.severity, x.message])).toEqual([
    ['amps.v1', 'warning', 'My Scooter: its source STREET is no longer available; the runner keeps its own copy.'],
    ['items.i1', 'warning', 'Lead Pipe: its source STREET is no longer available; the runner keeps its own copy.'],
    ['items.i2', 'warning', 'Torch: its source KIT is no longer available; the runner keeps its own copy.'],
  ])
  expect(validate(withComps, ch).filter(x => x.code === 'ref.gone')).toEqual([])
  // Foundry export: the entries' data is in the file, and it is a valid one
  const f = JSON.parse(JSON.stringify(exportRunners(without, [ch], { descriptions: true, now: '2026-10-05T00:00:00.000Z', appVersion: 'x' })))
  const r = f.runners[0]
  expect(r.items.find((i: { uid: string }) => i.uid === 'i1')).toMatchObject({ name: 'Lead Pipe', source: 'STREET', page: 1, description: 'Heavy.' })
  expect(r.vehicles[0]).toMatchObject({ chassisId: 'street.scooter', chassis: 'Scooter', body: 4, handling: 3 })
  const check = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(
    JSON.parse(readFileSync('public/data/schema/export.schema.json', 'utf8')),
  )
  expect(check(f), JSON.stringify(check.errors)).toBe(true)
})

test('the runner file keeps the copies (chassis included) and validates against character.xsd', async () => {
  const ch = snapshotEntries(withComps, runner('abcdef012345'))
  const xml = characterToXml(ch)
  expect(xml).toContain('<chassis><vehicle id="street.scooter"')
  const back = xmlToCharacter(xml)
  if (!back.ok) throw new Error(back.reason)
  expect(back.character.build.amps[0].chassis).toEqual(ch.build.amps[0].chassis)
  expect(back.character.build.items.find(i => i.uid === 'i1')!.snapshot).toEqual(ch.build.items.find(i => i.uid === 'i1')!.snapshot)
  expect(vehicleStats(without, back.character.build.amps[0])?.body).toBe(4)
  const schema = (n: string) => ({ fileName: n, contents: readFileSync(`public/data/schema/${n}`, 'utf8') })
  const r = await validateXML({ xml: { fileName: 'c.xml', contents: xml }, schema: schema('character.xsd') })
  expect(r.errors.map(e => e.message)).toEqual([])
})
