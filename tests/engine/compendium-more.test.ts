// Why a compendium file is refused (src/engine/compendium.ts readCompendium): each error names its cause; and what a
// campaign sees of compendiums shared with another one.
import { expect, test } from 'vitest'
import { blankNpc, buildCatalog, characterToXml, readCompendium } from '../../src/engine'
import { forCampaign } from '../../src/engine/compendium'
import { compendiumXml } from '../../src/engine'
import type { Compendium } from '../../src/model/types'
import { catFiles } from '../helpers'

const NS = 'urn:chummer-anarchy2:data:1'
const file = (attrs: string, body = '') => `<ca2:data xmlns:ca2="${NS}" kind="compendium" version="1" ${attrs}>${body}</ca2:data>`
const OK = 'id="0123456789ab" name="Mine" source="STREET" sharing="private"'
const why = (xml: string) => {
  const r = readCompendium(xml)
  return r.ok ? 'ok' : r.error
}

test('each refusal says what is wrong', () => {
  expect(why('<ca2:data')).toBe('Not valid XML.')
  expect(why(`<ca2:data xmlns:ca2="${NS}" kind="items" version="1"/>`)).toBe('Not a compendium file (root must be <ca2:data kind="compendium">).')
  expect(why(file('name="Mine" source="STREET" sharing="private"'))).toBe('The compendium has no id or name.')
  expect(why(file('id="x" source="STREET" sharing="private"'))).toBe('The compendium has no id or name.')
  expect(why(file('id="x" name="Mine" source="no good" sharing="private"'))).toBe('"no good" isn’t a valid source id.')
  expect(why(file('id="x" name="Mine" sharing="private"'))).toBe('"" isn’t a valid source id.')
  expect(why(file('id="x" name="Mine" source="STREET" sharing="everyone"'))).toBe('Unknown sharing "everyone".')
  expect(why(file('id="x" name="Mine" source="STREET"'))).toBe('Unknown sharing "".')
  expect(why(file(OK))).toBe('ok')
})

test('an entry must cite the compendium’s source, be of a kind a compendium holds', () => {
  expect(why(file(OK, '<amp id="a" source="OTHER" page="1" type="cyberware"><name>A</name></amp>'))).toBe(
    '<amp> a cites "OTHER", not the compendium’s source STREET.',
  )
  expect(why(file(OK, '<amp id="a" page="1" type="cyberware"><name>A</name></amp>'))).toBe('<amp> a cites "", not the compendium’s source STREET.')
  expect(why(file(OK, '<spell id="s" source="STREET"/>'))).toBe('<spell> can’t be in a compendium.')
  expect(why(file(OK, '<item source="STREET"><name>Nameless</name></item>'))).toBe('ok') // (no id is not refused here)
})

test('an NPC in it must be a readable character with an npc block', () => {
  const plain = blankNpc('npc', 'regular')
  delete plain.npc
  const xml = (ch: string) => file(OK, ch.replace(/^<\?xml[^>]*\?>\s*/, ''))
  expect(why(xml(characterToXml(plain)))).toMatch(/has no <npc> block\.$/)
  expect(why(xml('<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" id="x"/>'))).toMatch(/^<character> x: /)
  const good = blankNpc('critter', 'regular')
  const r = readCompendium(xml(characterToXml(good)))
  expect(r.ok && r.compendium.npcs).toHaveLength(1)
})

test('a campaign’s compendium reads back its campaign and revision; another sharing leaves them out', () => {
  const c = readCompendium(file('id="x" name="Mine" source="STREET" sharing="campaign" campaign="abc" rev="4"'))
  expect(c.ok && c.compendium).toMatchObject({ sharing: 'campaign', campaign: 'abc', rev: 4 })
  const p = readCompendium(file('id="x" name="Mine" source="STREET" sharing="private" campaign="abc"'))
  expect(p.ok && p.compendium.campaign).toBeUndefined()
  expect(p.ok && p.compendium.rev).toBeUndefined()
})

const comp = (source: string, sharing: Compendium['sharing'], campaign?: string): Compendium => ({
  id: `id-${source}`,
  name: source,
  source,
  sharing,
  campaign,
  updatedAt: '2026-10-02T00:00:00.000Z',
  amps: [{ id: `${source}.amp`, type: 'cyberware', name: 'A', effects: [], narrative: '', source, page: 1 }],
  items: [{ id: `${source}.item`, kind: 'gear', name: 'I', text: '', source, page: 1 }],
  vehicles: [{ id: `${source}.veh`, name: 'V', pilot: 1, body: 1, handling: 1, speed: 1, armor: 0, mount: 'none', source, page: 1 }],
  npcs: [],
})

test('a campaign sees its own compendiums’ entries, not those shared with another campaign; none shared elsewhere is the same catalog', () => {
  const files = [
    ...catFiles,
    ...[comp('MINE', 'campaign', 'c1'), comp('OTHER', 'campaign', 'c2'), comp('OPEN', 'private')].map(k => ({
      file: `custom/${k.source}.xml`,
      xml: compendiumXml(k),
      overlay: true,
      owner: 'u1',
    })),
  ]
  const c = buildCatalog(files)
  const mine = forCampaign(c, 'c1')
  expect([...mine.amps.keys()].filter(k => /^(MINE|OTHER|OPEN)\./.test(k))).toEqual(expect.arrayContaining(['MINE.amp', 'OPEN.amp']))
  expect(mine.amps.has('OTHER.amp')).toBe(false)
  expect(mine.items.has('OTHER.item')).toBe(false)
  expect(mine.vehicles.has('OTHER.veh')).toBe(false)
  expect(mine.vehicles.has('MINE.veh')).toBe(true)
  expect(forCampaign(c, 'c2').amps.has('MINE.amp')).toBe(false)
  expect(forCampaign(c, undefined).amps.has('MINE.amp')).toBe(false)
  expect(forCampaign(buildCatalog(catFiles), 'c1')).toEqual(buildCatalog(catFiles))
})
