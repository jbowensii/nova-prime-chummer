import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { blankNpc, buildCatalog, characterToXml, collectFiles, compendiumXml, readCompendium, xmlToCharacter } from '../../src/engine'
import type { Compendium } from '../../src/model/types'
import { catFiles, MINI } from '../helpers'

// made-up entries only
const npc = (() => {
  const ch = blankNpc('critter', 'regular')
  ch.identity.name = 'Sewer Gator'
  ch.identity.portrait = 'data:image/png;base64,iVBORw0KGgo='
  return ch
})()
const read = (xml: string) => {
  const r = readCompendium(xml)
  if (!r.ok) throw new Error(r.error)
  return r.compendium
}
const ref = { source: 'STREET', page: 1 }
const street: Compendium = {
  id: '0123456789ab',
  name: 'Street Gear',
  source: 'STREET',
  sharing: 'campaign',
  campaign: 'abcdef012345',
  rev: 3,
  updatedAt: '2026-10-02T00:00:00.000Z',
  amps: [{ id: 'street.zap-glove', type: 'cyberware', name: 'Zap Glove', effects: [{ ref: 'init-1' }], narrative: 'Our own words & <tags>.', ...ref }],
  items: [
    { id: 'street.pipe', kind: 'weapon', name: 'Lead Pipe', dv: 'STR+1', ranges: 'OK/-/-/-', text: 'Heavy.', ...ref },
    { id: 'street.coat', kind: 'armor', name: 'Rain Coat', armor: 2, text: 'Wet.', ...ref },
    { id: 'street.torch', kind: 'gear', name: 'Torch', category: 'tools', text: '', ...ref },
    { id: 'street.glow', kind: 'spell', name: 'Glow', category: 'illusion', text: 'Shiny.', ...ref },
    { id: 'street.ping', kind: 'complex-form', name: 'Ping', category: 'instant', text: 'Beep.', ...ref },
  ],
  vehicles: [{ id: 'street.scooter', name: 'Scooter', pilot: 1, body: 4, handling: 3, speed: 2, flyingSpeed: undefined, armor: 0, mount: 'none', ...ref }],
  npcs: [npc],
}
const npcRead = () => {
  const r = xmlToCharacter(characterToXml(npc))
  if (!r.ok) throw new Error(r.reason)
  return r.character
}

test('a compendium round-trips: entries keep their own text, the NPC its portrait and npc block', () => {
  const back = read(compendiumXml(street))
  expect(back).toEqual({ ...street, npcs: [npcRead()] })
  expect(back.npcs[0].npc).toEqual({ kind: 'critter', tier: 'regular' })
  expect(back.npcs[0].identity.portrait).toBe(npc.identity.portrait)
  const priv = read(compendiumXml({ ...street, sharing: 'private', campaign: undefined, rev: undefined, npcs: [] }))
  expect(priv).toEqual({ ...street, sharing: 'private', campaign: undefined, rev: undefined, npcs: [] })
})

test('readCompendium refuses a wrong root or kind, an entry citing another source, an NPC without <npc>', () => {
  const xml = compendiumXml(street)
  const bad = [
    xml.replace('kind="compendium"', 'kind="gear"'),
    '<nope/>',
    'not xml',
    xml.replace(/(id="street\.pipe"[^>]*?)source="STREET"/, '$1source="CRB"'),
    compendiumXml({ ...street, npcs: [{ ...npc, npc: undefined }] }),
  ]
  for (const b of bad) expect(readCompendium(b).ok, b.slice(0, 200)).toBe(false)
})

const disk = (p: string) => {
  try {
    return readFileSync(p.startsWith('data/') ? `public/${p}` : join(MINI, p.replace(/^custom\//, '')), 'utf8')
  } catch {
    return null
  }
}
const mini = async (p: string) => (p.startsWith('data/') && p !== 'data/sources.xml' ? null : disk(p))
const file = (xml: string, owner = 'gm1') => ({ file: `compendiums/${owner}/${street.id}.xml`, xml, overlay: true, publisher: 'Game Master', owner })

test('a compendium overlay adds its entries under its own house source; its NPCs stay out of the catalog', async () => {
  const extra = file(compendiumXml(street))
  const { files } = await collectFiles(mini, [extra])
  expect(files.at(-1)).toBe(extra) // the mini fixture has no custom/index.xml: extras load last
  const c = buildCatalog(files)
  expect(c.errors).toEqual([])
  expect(c.sources.get('STREET')).toEqual({
    id: 'STREET',
    name: 'Street Gear',
    publisher: 'Game Master',
    canon: false,
    origin: 'user',
    compendium: { id: street.id, owner: 'gm1', campaign: 'abcdef012345' },
  })
  expect(c.amps.get('street.zap-glove')!.narrative).toBe('Our own words & <tags>.')
  expect(c.items.get('street.pipe')).toMatchObject({ kind: 'weapon', dv: 'STR+1', source: 'STREET' })
  expect(c.vehicles.get('street.scooter')!.body).toBe(4)
  expect([...c.items.values(), ...c.amps.values()].some(e => e.name === 'Sewer Gator')).toBe(false)
  expect(c.files.at(-1)).toMatchObject({ file: extra.file, kind: 'compendium', entries: 7 })
  // a broken compendium is reported and skipped
  const broken = buildCatalog([...catFiles, file(compendiumXml({ ...street, npcs: [{ ...npc, npc: undefined }] }))])
  expect(broken.errors).toEqual([expect.objectContaining({ file: extra.file })])
  expect(broken.items.has('street.pipe')).toBe(false)
  // a book or house source that took its id later keeps it: the compendium is reported and skipped
  const book = [...buildCatalog(catFiles).sources.keys()][0]
  const clash = buildCatalog([...catFiles, file(compendiumXml({ ...street, source: book, amps: [], items: [], vehicles: [] }))])
  expect(clash.errors).toEqual([expect.objectContaining({ file: extra.file })])
  expect(clash.sources.get(book)!.compendium).toBeUndefined()
})

test('extras load after the edits layer and before custom/index.xml, so a house rule with the same id wins', async () => {
  const house = `<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="weapons" version="1"><item id="street.pipe" kind="weapon" dv="STR+5" source="TABLE" page="2"><name>House Pipe</name><text/></item></ca2:data>`
  const extra = file(compendiumXml(street))
  const get = async (p: string) => (p === 'custom/index.xml' ? '<overlays><file href="house.xml"/></overlays>' : p === 'custom/house.xml' ? house : mini(p))
  const { files } = await collectFiles(get, [extra])
  const order = files.map(f => f.file)
  expect(order.indexOf(extra.file)).toBeGreaterThan(order.indexOf('custom/edits/edits.xml'))
  expect(order.indexOf(extra.file)).toBeLessThan(order.indexOf('custom/house.xml'))
  expect(buildCatalog(files).items.get('street.pipe')!.name).toBe('House Pipe')
})

test('a written compendium validates against compendium.xsd', async () => {
  const schema = (n: string) => ({ fileName: n, contents: readFileSync(`public/data/schema/${n}`, 'utf8') })
  const valid = async (xml: string) =>
    (
      await validateXML({
        xml: { fileName: 'c.xml', contents: xml },
        schema: schema('compendium.xsd'),
        preload: [schema('common.xsd'), schema('character.xsd')],
      })
    ).errors.map(e => e.message)
  expect(await valid(compendiumXml(street))).toEqual([])
  expect(await valid(compendiumXml(street).replace('sharing="campaign"', 'sharing="world"'))).not.toEqual([])
})
