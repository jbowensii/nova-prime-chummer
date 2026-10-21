import { expect, test } from 'vitest'
import { buildCatalog } from '../../src/engine/load'
import { toAmp, toItem, toRule } from '../../src/engine/parse'
import { entryXml } from '../../src/engine/compendium'
import { editState } from '../../src/ui/editTrigger'
import { cat, catFiles } from '../helpers'

const el = (xml: string) => new DOMParser().parseFromString(xml, 'text/xml').documentElement

test('edit states: changed from the book, added under a house rule, orphaned when the book is gone', () => {
  expect(editState(cat, 'items', cat.items.get('test.nano-tape')!)).toBe('book')
  expect(editState(cat, 'items', cat.items.get('test.signal-jammer')!)).toBe('changed')
  expect(editState(cat, 'items', cat.items.get('table.lucky-charm')!)).toBe('added')
  // the TEST book removed: its edit stays, with no original and no house-rule source
  const gone = buildCatalog(catFiles.filter(f => !f.file.startsWith('custom/imported/test/')))
  expect(editState(gone, 'items', gone.items.get('test.signal-jammer')!)).toBe('orphan')
})

test('entries go out in the data format with empty text and read back the same', () => {
  const strip = <T extends { edited?: boolean }>(e: T) => {
    const { edited, ...rest } = e
    void edited
    return rest
  }
  const rush = cat.amps.get('test.rush')!,
    jammer = cat.items.get('test.signal-jammer')!,
    rule = cat.rules.get('test.gadget-basics')!
  expect(toAmp(el(entryXml('amps', rush)))).toEqual({ ...rush, narrative: '' })
  expect(toItem(el(entryXml('items', { ...jammer, dv: 'STR+1', name: 'A & <b>' })))).toEqual({ ...strip(jammer), dv: 'STR+1', name: 'A & <b>', text: '' })
  expect(toRule(el(entryXml('rules', rule)))).toEqual({ ...rule, text: '' })
})
