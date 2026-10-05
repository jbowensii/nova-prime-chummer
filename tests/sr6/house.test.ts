// Phase 3, SR6: players' runners use compendium entries (src/sr6/engine/house.ts). A runner sees the compendiums shared
// with its own campaign and the table's, keeps copies of the compendium entries it uses (house), and once a compendium is
// unshared or deleted prices, validates and exports the same, with a "source no longer available" note. Made-up entries.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { priced } from '../../src/sr6/engine/budgets'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/engine/charxml'
import { sr6CompendiumXml } from '../../src/sr6/engine/compendium'
import { sr6Data } from '../../src/sr6/engine/data'
import { exportSr6Runner } from '../../src/sr6/engine/export'
import { forSr6Campaign, houseNotes, keepSr6House, withSr6House } from '../../src/sr6/engine/house'
import { buildSr6Catalog } from '../../src/sr6/engine/load'
import { validateSr6 } from '../../src/sr6/engine/rules'
import { blankSr6, type Sr6Character } from '../../src/sr6/model/character'
import type { Sr6Compendium, Sr6Entry, Sr6Kind } from '../../src/sr6/model/types'
import { fixtureCatalog, fixtureCreation } from './fixture'

const entry = (kind: Sr6Kind, id: string, name: string, attrs: Record<string, string>, source = 'STREET'): Sr6Entry =>
  ({ id, kind, name, source, page: 1, attrs, parts: [], text: 'Our own words.' })
const kit: Sr6Compendium = { id: '0123456789ab', name: 'Street Kit', source: 'STREET', sharing: 'campaign', campaign: 'abcdef012345',
  updatedAt: '2026-10-05T00:00:00.000Z', npcs: [], entries: [
    entry('qualities', 'street.lucky-socks', 'Lucky Socks', { kind: 'positive', karma: '7' }),
    entry('weapons', 'street.zap-stick', 'Zap Stick', { category: 'Clubs', dv: '3S', cost: '120', avail: '2' }),
  ] }
const table: Sr6Compendium = { ...kit, id: '0123456789ac', name: 'Table Kit', source: 'TABKIT', sharing: 'table', campaign: undefined,
  entries: [entry('gear', 'tabkit.torch', 'Torch', { category: 'Tools', cost: '25', avail: '1' }, 'TABKIT')] }
const overlay = (comp: Sr6Compendium) => ({ file: `compendiums/gm1/${comp.id}.xml`, xml: sr6CompendiumXml(comp), overlay: true, publisher: 'GM', owner: 'gm1' })
const without = fixtureCatalog()
// the fixture's files plus the two compendiums, as the app loads a catalog with extras
const withComps = (() => { const c = fixtureCatalog(); const x = buildSr6Catalog([overlay(kit), overlay(table)]); for (const s of x.sources.values()) c.sources.set(s.id, s)
  for (const [k, m] of Object.entries(x.entries)) for (const e of m.values()) c.entries[k as Sr6Kind].set(e.id, e); return c })()
const cr = fixtureCreation()

function runner(campaign?: string): Sr6Character {
  const ch = blankSr6('priority', 'r1', '2026-10-05T00:00:00.000Z')
  ch.campaign = campaign
  ch.build.qualities = [{ uid: 'q1', id: 'street.lucky-socks', level: 1, name: 'Lucky Socks' }]
  ch.build.purchases = [{ uid: 'p1', kind: 'weapons', id: 'street.zap-stick', qty: 1, accessories: [] },
    { uid: 'p2', kind: 'gear', id: 'tabkit.torch', qty: 2, accessories: [] }]
  return keepSr6House(withComps, ch)
}

test('a runner sees its own campaign’s compendiums and the table’s; not another campaign’s', () => {
  expect(withComps.sources.get('STREET')!.compendium).toEqual({ id: kit.id, owner: 'gm1', campaign: 'abcdef012345' })
  expect(forSr6Campaign(withComps, 'abcdef012345')).toBe(withComps)
  for (const c of [forSr6Campaign(withComps, 'ffffffffffff'), forSr6Campaign(withComps, undefined)]) {
    expect(c.entries.qualities.has('street.lucky-socks')).toBe(false)
    expect(c.entries.weapons.has('street.zap-stick')).toBe(false)
    expect(c.entries.gear.has('tabkit.torch')).toBe(true)
    expect(c.entries.skills).toBe(withComps.entries.skills) // untouched kinds are shared
  }
})

test('keepSr6House copies the compendium entries a runner uses, never a book’s, and keeps them once gone', () => {
  const ch = runner('abcdef012345')
  expect(ch.house!.map(e => e.id)).toEqual(['street.lucky-socks', 'street.zap-stick', 'tabkit.torch'])
  const book = [...without.entries.weapons.values()][0]
  const more = keepSr6House(withComps, { ...ch, build: { ...ch.build, purchases: [...ch.build.purchases, { uid: 'p3', kind: 'weapons', id: book.id, qty: 1, accessories: [] }] } })
  expect(more.house!.map(e => e.id)).not.toContain(book.id)
  expect(keepSr6House(without, ch)).toBe(ch) // gone: the copies stay
  const sold = keepSr6House(without, { ...ch, build: { ...ch.build, purchases: [], qualities: [] } })
  expect(sold.house).toBeUndefined() // nothing used: nothing kept
})

test('once gone, the copies price, validate and export as before, noted on Review', () => {
  const ch = runner('abcdef012345')
  const live = sr6Data(withComps), { c, gone } = withSr6House(without, ch), kept = sr6Data(c)
  expect(gone.map(e => e.id)).toEqual(['street.lucky-socks', 'street.zap-stick', 'tabkit.torch'])
  expect(kept.qualities['street.lucky-socks']).toEqual(live.qualities['street.lucky-socks'])
  expect(priced(ch.build.purchases[0], kept, cr)).toEqual(priced(ch.build.purchases[0], live, cr))
  expect(priced(ch.build.purchases[0], kept, cr).cost).toBe(120)
  const missing = (d: typeof live) => validateSr6(d, cr, ch).filter(v => v.code === 'catalog.missing').map(v => v.message)
  expect(missing(sr6Data(without))).toHaveLength(3) // what it would be without the copies
  expect(missing(kept)).toEqual([])
  expect(houseNotes(without, gone).map(v => [v.code, v.severity, v.message])).toEqual([
    ['catalog.gone', 'warning', 'Lucky Socks: its source STREET is no longer available; the runner keeps its own copy.'],
    ['catalog.gone', 'warning', 'Zap Stick: its source STREET is no longer available; the runner keeps its own copy.'],
    ['catalog.gone', 'warning', 'Torch: its source TABKIT is no longer available; the runner keeps its own copy.'],
  ])
  expect(withSr6House(withComps, ch)).toEqual({ c: withComps, gone: [] })
  // the Foundry export works from the copies by itself
  const opts = { descriptions: true, now: '2026-10-05T00:00:00.000Z', appVersion: 'x' }
  const out = exportSr6Runner(without, sr6Data(without), cr, ch, opts)
  expect(out).toEqual(exportSr6Runner(withComps, live, cr, ch, opts))
  expect(out.qualities[0]).toMatchObject({ id: 'street.lucky-socks', name: 'Lucky Socks', source: 'STREET', description: 'Our own words.' })
  expect(out.purchases[0]).toMatchObject({ id: 'street.zap-stick', name: 'Zap Stick', values: { cost: 120 } })
})

test('the runner file keeps its copies and validates against character.xsd', async () => {
  const ch = runner('abcdef012345'), xml = sr6ToXml(ch)
  expect(xml).toContain('<house><quality id="street.lucky-socks" source="STREET" page="1"')
  const back = xmlToSr6(xml)
  if (!back.ok) throw new Error(back.reason)
  expect(back.character.house).toEqual(ch.house)
  expect(back.character).toEqual(ch)
  const r = await validateXML({ xml: { fileName: 'r.xml', contents: xml }, schema: { fileName: 'character.xsd', contents: readFileSync('public/data/sr6/schema/character.xsd', 'utf8') } })
  expect(r.errors.map(e => e.message)).toEqual([])
  // an entry of no catalog kind is refused, and dropped on repair
  const odd = xml.replace('<house>', '<house><bogus id="x"/>')
  expect(xmlToSr6(odd).ok).toBe(false)
  const fix: string[] = [], fixed = xmlToSr6(odd, { repair: fix })
  expect(fixed.ok && fixed.character.house).toEqual(ch.house)
  expect(fix).toHaveLength(1)
})
