// Anarchy formulas and issues on the made-up catalog plus made-up items (tests/fixtures/issues/ca2-items.xml): loading
// them, an item's price by formula, the edits layer clearing an issue, and Review's cited note.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateXML } from 'xmllint-wasm'
import { describe, expect, it } from 'vitest'
import { blankCharacter, buildCatalog, catalogItem, itemCost, itemPrice, validate } from '../../src/engine'
import type { ItemEntry } from '../../src/model/types'
import { catFiles } from '../helpers'

const ITEMS = readFileSync('tests/fixtures/issues/ca2-items.xml', 'utf8')
const EDITS = (body: string) => `<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="edits" version="1">${body}</ca2:data>`
/** the made-up catalog with the items as an imported book's file (before the edits layer), and `edits` in its place */
function catalog(edits?: string) {
  const files = catFiles.map(f => (edits !== undefined && f.file === 'custom/edits/edits.xml' ? { ...f, xml: EDITS(edits) } : f))
  const at = files.findIndex(f => f.file.startsWith('custom/edits/'))
  files.splice(at, 0, { file: 'custom/imported/test/issues.xml', xml: ITEMS, overlay: true })
  return buildCatalog(files)
}
const entry = (id: string, c = catalog()): ItemEntry => { const i = c.items.get(id)!; return { uid: id, catalogId: id, kind: i.kind, name: i.name, snapshot: i } }

it('the made-up file fits the items schema', async () => {
  const schema = (f: string) => ({ fileName: f, contents: readFileSync(join('public/data/schema', f), 'utf8') })
  expect((await validateXML({ xml: { fileName: 'items.xml', contents: ITEMS }, schema: schema('items.xsd'), preload: [schema('common.xsd')] })).errors).toEqual([])
})

describe('loading', () => {
  const c = catalog()
  it('reads an item’s formulas and issues', () => {
    expect(c.items.get('test.flash-pack')!.formulas).toEqual([{ field: 'cost', expr: 'B * 3' }])
    expect(c.items.get('test.odd-blade')!.issues).toEqual([{ field: 'dv', code: 'missing', page: 12, note: 'no damage printed' }])
    expect(c.items.get('test.nano-tape')).not.toHaveProperty('issues')
  })
})

describe('prices', () => {
  const c = catalog()
  it('a cost formula prices the item, B the standard price', () => {
    const i = entry('test.flash-pack', c)
    expect(itemCost(c.pricing, i, catalogItem(c, i))).toBe(3 * c.pricing.equipment)
    expect(itemPrice(c.pricing, i, catalogItem(c, i))).toMatchObject({ base: c.pricing.equipment, formula: { expr: 'B * 3' }, notes: [] })
  })
  it('a GM’s price still wins', () => {
    const i = { ...entry('test.flash-pack', c), price: 100 }
    expect(itemCost(c.pricing, i, catalogItem(c, i))).toBe(100)
  })
  it('a formula that can’t be worked out leaves the standard price, and says why', () => {
    const i = entry('test.flash-pack', c), cat = { ...catalogItem(c, i)!, formulas: [{ field: 'cost', expr: 'ref(items:test.gone, cost)' }] }
    expect(itemPrice(c.pricing, i, cat)).toMatchObject({ n: c.pricing.equipment, error: expect.stringContaining('isn’t in the catalog') })
  })
})

describe('edits', () => {
  it('an edit that sets the field clears its issue; the book’s stays in original', () => {
    const c = catalog('<item id="test.odd-blade" kind="weapon" source="TEST" page="12" dv="STR+2" ranges="OK/-/-/-" by="eve"><name>Odd Blade</name><text></text></item>')
    expect(c.items.get('test.odd-blade')).toMatchObject({ edited: true, dv: 'STR+2' })
    expect(c.items.get('test.odd-blade')).not.toHaveProperty('issues')
    expect(c.original.items.get('test.odd-blade')!.issues).toHaveLength(1)
  })
  it('an edit keeps the book’s formulas (the edits layer doesn’t store them)', () => {
    const c = catalog('<item id="test.flash-pack" kind="gear" source="TEST" page="11" category="lights" by="eve"><name>Flash Pack</name><text></text></item>')
    expect(c.items.get('test.flash-pack')!.formulas).toEqual([{ field: 'cost', expr: 'B * 3' }])
  })
})

describe('Review', () => {
  it('notes an item with an issue the runner has, cited', () => {
    const c = catalog(), ch = blankCharacter()
    ch.build.items.push(entry('test.odd-blade', c), entry('test.flash-pack', c))
    expect(validate(c, ch).filter(v => v.code.startsWith('catalog.'))).toEqual([{ code: 'catalog.issue', severity: 'warning', path: 'items.test.odd-blade',
      message: 'Odd Blade: the book prints no damage, set it in Game data or an override file.', source: 'TEST', page: 12 }])
  })
})
