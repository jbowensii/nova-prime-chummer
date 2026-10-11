// SR6 formulas and issues on the made-up fixture plus made-up gear (tests/fixtures/issues/sr6-gear.xml): loading them,
// the edits layer clearing an issue or a formula, prices worked out by formula, and Review's cited note.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateXML } from 'xmllint-wasm'
import { describe, expect, it } from 'vitest'
import { priced } from '../../src/sr6/engine/budgets'
import { sr6Data } from '../../src/sr6/engine/data'
import { catalogFind, resolveEntry, sr6EntryXml } from '../../src/sr6/engine/load'
import { validateSr6 } from '../../src/sr6/engine/rules'
import { bookValue, formulaRange } from '../../src/sr6/engine/values'
import { blankSr6, type Sr6Purchase } from '../../src/sr6/model/character'
import { buildOf, fixtureCatalog, fixtureCreation, STONE } from './fixture'

const GEAR = readFileSync('tests/fixtures/issues/sr6-gear.xml', 'utf8')
const entries = GEAR.match(/<gear [\s\S]*<\/gear>/)![0]
const EDITS = (body: string) => `<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="edits" version="1">${body}</sr6:data>`
/** the fixture with the made-up gear added to its gear file, and `edits` in place of its edits layer */
const catalog = (edits?: string) => fixtureCatalog((file, xml) => file.endsWith('crb/gear.xml') ? xml.replace('</sr6:data>', `${entries}\n</sr6:data>`)
  : edits !== undefined && file.endsWith('edits/edits.xml') ? EDITS(edits) : xml)
const line = (id: string, rating?: number, qty = 1): Sr6Purchase => ({ uid: id, kind: 'gear', id, qty, accessories: [], ...rating ? { rating } : {} })

it('the made-up file fits the SR6 gear schema', async () => {
  const dir = 'public/data/sr6/schema', schema = (f: string) => ({ fileName: f, contents: readFileSync(join(dir, f), 'utf8') })
  expect((await validateXML({ xml: { fileName: 'gear.xml', contents: GEAR }, schema: schema('gear.xsd'), preload: [schema('common.xsd')] })).errors).toEqual([])
  const misplaced = GEAR.replace('<name>Flare Kit</name><formula field="cost">R * 200</formula>', '<formula field="cost">R * 200</formula><name>Flare Kit</name>')
  expect((await validateXML({ xml: { fileName: 'gear.xml', contents: misplaced }, schema: schema('gear.xsd'), preload: [schema('common.xsd')] })).valid).toBe(false)
})

describe('loading', () => {
  const c = catalog()
  const e = (id: string) => resolveEntry(c, 'gear', id)!  // (a rated entry is read by id; its levels are the listed entries)
  it('reads formulas and issues apart from the parts; the attribute stays as printed', () => {
    expect(e('crb.flare-kit')).toMatchObject({ attrs: { cost: 'Rating × 200' }, parts: [], formulas: [{ field: 'cost', expr: 'R * 200' }] })
    expect(e('crb.null-box').issues).toEqual([{ field: 'avail', code: 'missing', page: 91, note: 'no availability printed' }])
    expect(e('crb.tier-lamp').formulas).toEqual([{ field: 'cost', expr: 'tier(R; 1-3: 100; 4-6: 250)' }, { field: 'avail', expr: 'R / 2', round: 'down' }])
    expect(e('crb.flare-tin').formulas![0]).toMatchObject({ unit: 'flares', qty: '10' })
  })
  it('an entry without them has neither', () => {
    expect(c.entries.gear.get('crb.zap-scope')).not.toHaveProperty('formulas')
    expect(c.entries.gear.get('crb.zap-scope')).not.toHaveProperty('issues')
  })
  it('a formula with a broken ref is an issue of its entry', () => {
    expect(e('crb.ghost-link').issues).toEqual([{ field: 'cost', code: 'unreadable',
      note: 'its formula: it refers to gear:crb.nowhere’s cost, which isn’t in the catalog' }])
  })
  it('writes formulas back (never issues) before <text>', () => {
    expect(sr6EntryXml(e('crb.tier-lamp'))).toContain('<formula field="cost">tier(R; 1-3: 100; 4-6: 250)</formula><formula field="avail" round="down">R / 2</formula><text/>')
    expect(sr6EntryXml(e('crb.null-box'))).not.toContain('<issue')
  })
})

describe('values', () => {
  const c = catalog(), find = catalogFind(c), e = (id: string) => resolveEntry(c, 'gear', id)!
  it('a formula at the rating; its range over the ratings', () => {
    expect(bookValue(e('crb.flare-kit'), 'cost', 3, find)).toMatchObject({ n: 600, ok: true })
    expect(formulaRange(e('crb.flare-kit'), 'cost', find)).toEqual([200, 1200])
    expect([1, 3, 4, 6].map(r => bookValue(e('crb.tier-lamp'), 'cost', r, find).n)).toEqual([100, 100, 250, 250])
    expect([1, 3, 5].map(r => bookValue(e('crb.tier-lamp'), 'avail', r, find).n)).toEqual([0, 1, 2])
  })
  it('B is the printed value; a ref reads another entry at the rating it names', () => {
    expect(bookValue(e('crb.flare-tin'), 'cost', undefined, find).n).toBe(20)
    expect(bookValue(e('crb.flare-pack'), 'cost', undefined, find).n).toBe(450)
  })
  it('a ref reads another book’s entry: the catalog is merged, its ids scoped by source', () => {
    // (Deadly Arts' foci are priced as the core rulebook's spell focus: `ref(gear:crb.spell-focus, cost, R)`)
    const da = `<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="gear" version="1"><gear id="da.glow-focus" source="DA" page="9"
      category="Foci" cost="As flare kit"><name>Glow Focus</name><formula field="cost">ref(gear:crb.flare-kit, cost, R)</formula></gear></sr6:data>`
    const both = fixtureCatalog((file, xml) => file.endsWith('crb/gear.xml') ? xml.replace('</sr6:data>', `${entries}
</sr6:data>`) : xml,
      [{ file: 'custom/sr6/imported/da/gear.xml', xml: da }])
    const glow = both.entries.gear.get('da.glow-focus')!
    expect(glow.issues ?? []).toEqual([])
    expect(bookValue(glow, 'cost', 3, catalogFind(both))).toMatchObject({ n: 600, ok: true })
  })
  it('a broken ref is unpriced, never 0', () => {
    expect(bookValue(e('crb.ghost-link'), 'cost', 1, find)).toMatchObject({ n: null, ok: false })
    expect(formulaRange(e('crb.ghost-link'), 'cost', find)).toBeNull()
  })
})

describe('prices in the builder', () => {
  const data = sr6Data(catalog()), cr = fixtureCreation()
  it('works a line out at its rating and quantity', () => {
    expect(priced(line('crb.flare-kit', 4, 2), data, cr)).toMatchObject({ cost: 1600, ok: true, notes: [] })
    expect(priced(line('crb.tier-lamp', 5), data, cr)).toMatchObject({ cost: 250, avail: 2 })
  })
  it('notes a rating the line doesn’t have', () => {
    const c = catalog()
    delete resolveEntry(c, 'gear', 'crb.flare-kit')!.attrs.rating // an unrated item whose formula wants one
    expect(priced(line('crb.flare-kit'), sr6Data(c), cr)).toMatchObject({ cost: 200, notes: ['cost: no rating given: worked out at rating 1'] })
  })
  it('a broken formula leaves the line unpriced', () => {
    expect(priced(line('crb.ghost-link'), data, cr)).toMatchObject({ cost: 0, ok: false, unpriced: true })
  })
})

describe('edits', () => {
  it('an edit that sets the field clears its issue; the book’s stays in original', () => {
    const c = catalog('<gear id="crb.null-box" source="CRB" page="271" category="survival" cost="150" avail="4" by="eve"><name>Null Box</name><text/></gear>')
    expect(c.entries.gear.get('crb.null-box')).toMatchObject({ edited: true, attrs: { avail: '4' } })
    expect(c.entries.gear.get('crb.null-box')).not.toHaveProperty('issues')
    expect(c.original.get('gear/crb.null-box')!.issues).toHaveLength(1)
  })
  it('an edit of another field keeps the issue, and the book’s formulas', () => {
    const c = catalog('<gear id="crb.null-box" source="CRB" page="271" category="tools" cost="150" by="eve"><name>Null Box</name><text/></gear>'
      + '<gear id="crb.flare-kit" source="CRB" page="270" category="survival" rating="1–6" avail="3" cost="Rating × 200" by="eve"><name>Flare Kit</name><text/></gear>')
    expect(c.entries.gear.get('crb.null-box')!.issues).toHaveLength(1)
    expect(resolveEntry(c, 'gear', 'crb.flare-kit')!.formulas).toEqual([{ field: 'cost', expr: 'R * 200' }])
    expect(c.entries.gear.get('crb.flare-kit.3')!.formulas).toEqual([{ field: 'cost', expr: 'R * 200' }])  // (the levels follow the edit)
  })
  it('an edit that sets the cost drops the book’s cost formula', () => {
    const c = catalog('<gear id="crb.flare-kit" source="CRB" page="270" category="survival" rating="1–6" avail="2" cost="Rating × 150" by="eve"><name>Flare Kit</name><text/></gear>')
    const e = resolveEntry(c, 'gear', 'crb.flare-kit')!
    expect(e).not.toHaveProperty('formulas')
    expect(bookValue(e, 'cost', 2).n).toBe(300)
    expect(bookValue(c.entries.gear.get('crb.flare-kit.2')!, 'cost', 2).n).toBe(300)
  })
})

describe('Review', () => {
  const setup = (...ids: string[]) => {
    const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
    ch.build = buildOf('priority', { letters: 'ACDBE', metatype: STONE })
    ch.identity.metatype = STONE
    ch.build.purchases = ids.map(id => line(id))
    return validateSr6(sr6Data(catalog()), fixtureCreation(), ch)
  }
  it('notes an entry with an issue the runner uses, cited, as a note', () => {
    expect(setup('crb.null-box').filter(v => v.code === 'catalog.issue')).toEqual([{ code: 'catalog.issue', severity: 'warning', path: 'gear.crb.null-box',
      message: 'Null Box: the book prints no availability, set it in Game data or an override file.', source: 'CRB', page: 91 }])
  })
  it('only for the entries the runner uses', () => {
    expect(setup('crb.flare-kit').filter(v => v.code === 'catalog.issue')).toEqual([])
  })
})
