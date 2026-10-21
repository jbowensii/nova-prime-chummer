import { describe, expect, test } from 'vitest'
import { buildCatalog, collectFiles, type SourceFile } from '../../../src/ca2/catalog/domain/load'
import { cat, catFiles, loadDir, MINI } from '../../helpers'

// The made-up fixture's edits layer (tests/fixtures/mini/custom/edits): TEST's Signal Jammer renamed and
// described, and a new entry under the house-rule source TABLE.
const NS = 'xmlns:ca2="urn:chummer-anarchy2:data:1"'
const gear = (id: string, name: string, source = 'TEST') => `<item id="${id}" kind="gear" source="${source}" page="9"><name>${name}</name><text></text></item>`
const file = (path: string, kind: string, body: string): SourceFile => ({
  file: path,
  xml: `<ca2:data ${NS} kind="${kind}" version="1">${body}</ca2:data>`,
  overlay: true,
})

describe('edits layer', () => {
  test('an edit replaces the imported entry, keeps the original and is marked', () => {
    expect(cat.errors).toEqual([])
    const j = cat.items.get('test.signal-jammer')!
    expect(j).toMatchObject({ name: 'Signal Jammer Mk II', edited: true, text: 'Jams every signal in the room.' })
    expect(cat.original.items.get('test.signal-jammer')).toMatchObject({ name: 'Signal Jammer', source: 'TEST' })
    expect(cat.items.get('test.nano-tape')!.edited).toBeUndefined()
  })

  test('a new entry carries its house-rule source', () => {
    expect(cat.items.get('table.lucky-charm')).toMatchObject({ name: 'Lucky Charm', source: 'TABLE', edited: true })
    expect(cat.original.items.has('table.lucky-charm')).toBe(false)
    expect(cat.sources.get('TABLE')).toMatchObject({ canon: false, origin: 'user', name: 'Test Table Rules' })
  })

  test('load order: imports, then edits, then the house rules of custom/index.xml', async () => {
    const extra: Record<string, string> = {
      'custom/index.xml': '<overlays><file href="house.xml"/></overlays>',
      'custom/house.xml': file('', 'gear', gear('test.signal-jammer', 'House Jammer')).xml,
    }
    const disk = await loadDir(MINI)
    const { files } = await collectFiles(async p => extra[p] ?? (p.startsWith('data/') ? null : (disk.find(f => f.file === p)?.xml ?? null)))
    const at = (f: string) => files.findIndex(x => x.file === f)
    expect(at('custom/edits/sources.xml')).toBeGreaterThan(at('custom/imported/testc/items.xml'))
    expect(at('custom/edits/edits.xml')).toBeGreaterThan(at('custom/edits/sources.xml'))
    expect(at('custom/edits/texts.xml')).toBeGreaterThan(at('custom/edits/edits.xml'))
    expect(at('custom/house.xml')).toBeGreaterThan(at('custom/edits/texts.xml'))
    const c = buildCatalog([...catFiles, { file: 'custom/house.xml', xml: extra['custom/house.xml'], overlay: true }])
    expect(c.items.get('test.signal-jammer')!.name).toBe('House Jammer')
    expect(c.items.get('test.signal-jammer')!.edited).toBeUndefined()
  })

  test('removing the edit restores the book version', () => {
    const c = buildCatalog(catFiles.filter(f => !f.file.startsWith('custom/edits/')))
    expect(c.items.get('test.signal-jammer')).toMatchObject({ name: 'Signal Jammer', text: '' })
    expect(c.items.get('test.signal-jammer')!.edited).toBeUndefined()
    expect(c.original.items.size).toBe(0)
  })

  test('an edit without a description keeps the book’s; amps and rules too', () => {
    const c = buildCatalog([
      ...catFiles.filter(f => !f.file.startsWith('custom/edits/')),
      file(
        'custom/texts/test.xml',
        'texts',
        '<text of="items" id="test.nano-tape">Heals one wound.</text>' +
          '<text of="amps" id="test.keen-eye">Sharp.</text><text of="rules" id="test.gadget-basics">Roll less.</text>',
      ),
      file(
        'custom/edits/edits.xml',
        'edits',
        gear('test.nano-tape', 'Nano Tape+') +
          '<amp id="test.keen-eye" type="quality" printedRating="5" source="TEST" page="1"><name>Keen Eye</name><narrative></narrative></amp>' +
          '<rule id="test.gadget-basics" sheet="test" source="TEST" page="11"><title>Risk</title><text></text></rule>',
      ),
    ])
    expect(c.errors).toEqual([])
    expect(c.items.get('test.nano-tape')).toMatchObject({ name: 'Nano Tape+', text: 'Heals one wound.', edited: true })
    expect(c.amps.get('test.keen-eye')).toMatchObject({ printedRating: 5, narrative: 'Sharp.', edited: true })
    expect(c.original.amps.get('test.keen-eye')!.printedRating).toBe(4)
    expect(c.rules.get('test.gadget-basics')).toMatchObject({ title: 'Risk', text: 'Roll less.', edited: true })
    expect(c.original.rules.get('test.gadget-basics')!.title).toBe('Risk Reduction (spec)')
  })
})
