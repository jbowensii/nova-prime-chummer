// Old unscoped catalog ids (src/engine/rescope.ts): scoped by the snapshot's source, else by name and kind with the canon
// book winning and the lowest source id breaking ties whatever the catalog's order; ids already scoped or unmatched stay;
// the ledger's events are rescoped too; a runner with nothing to remap is returned as it is.
import { expect, test } from 'vitest'
import { rescope } from '../../src/engine/rescope'
import { blankCharacter } from '../../src/engine/file'
import type { AmpEntry, Catalog, ItemEntry } from '../../src/model/types'
import { cat } from '../helpers'

const item = (catalogId: string, more: Partial<ItemEntry> = {}): ItemEntry => ({ uid: 'i', catalogId, kind: 'gear', name: 'Nano Tape', ...more })
const amp = (catalogId: string, more: Partial<AmpEntry> = {}): AmpEntry => ({
  uid: 'a',
  catalogId,
  type: 'equipment',
  name: 'Rush',
  narrative: '',
  effects: [],
  ...more,
})
const withItems = (ids: string[]): Catalog => ({ ...cat, items: new Map([...cat.items].filter(([id]) => ids.includes(id))) })
const run = (it: ItemEntry, c: Catalog = cat) => {
  const ch = blankCharacter()
  ch.build.items = [it]
  return rescope(c, ch).build.items[0].catalogId
}

test('an id the catalog has is left alone; a runner with nothing to remap is the same object', () => {
  const ch = blankCharacter()
  ch.build.items = [item('test.nano-tape'), { uid: 'free', kind: 'gear', name: 'Rope' }]
  expect(rescope(cat, ch)).toBe(ch)
})

test('an unscoped id takes its snapshot’s source as a prefix when that entry exists', () => {
  const snapshot = { ...cat.items.get('test2.nano-tape')! }
  expect(run(item('nano-tape', { snapshot }))).toBe('test2.nano-tape')
})

test('with no snapshot, the same name and kind in a canon book wins over the others', () => {
  expect(run(item('nano-tape'))).toBe('testc.nano-tape')
})

test('among books of the same standing the lowest source id wins, whatever the catalog’s order', () => {
  const forward = withItems(['test.nano-tape', 'test2.nano-tape']),
    backward = withItems(['test2.nano-tape', 'test.nano-tape'])
  expect(run(item('nano-tape'), forward)).toBe('test.nano-tape')
  expect(run(item('nano-tape'), backward)).toBe('test.nano-tape')
  const canon = withItems(['testc.nano-tape', 'test.nano-tape'])
  expect(run(item('nano-tape'), canon)).toBe('testc.nano-tape')
  expect(run(item('nano-tape'), withItems(['test.nano-tape', 'testc.nano-tape']))).toBe('testc.nano-tape')
})

test('an id already scoped by its snapshot’s source (an entry that is gone) stays; one that matches nothing stays; a different kind does not match', () => {
  const snapshot = { ...cat.items.get('test.nano-tape')!, id: 'test.gone' }
  expect(run(item('test.gone', { snapshot }))).toBe('test.gone')
  expect(run(item('mystery', { name: 'Unheard Of' }))).toBe('mystery')
  expect(run(item('nano-tape', { kind: 'weapon' }))).toBe('nano-tape')
})

test('a name written with other case and spacing still matches; the snapshot’s name is used before the runner’s own', () => {
  expect(run(item('nano-tape', { name: '  NANO   tape ' }))).toBe('testc.nano-tape')
  const snapshot = { ...cat.items.get('test.signal-jammer')!, id: 'gone' }
  expect(run(item('gone-thing', { name: 'Something Else', snapshot: { ...snapshot, source: 'ELSE' } }))).toBe('test.signal-jammer')
})

test('amps are rescoped the same way: by snapshot source, else by name and type', () => {
  const ch = blankCharacter()
  ch.build.amps = [
    amp('rush', { snapshot: { ...cat.amps.get('test.rush')! } }),
    amp('rush', { uid: 'b', name: 'Rush (Equipment)' }),
    amp('nothing', { uid: 'c', name: 'No Such Thing' }),
    amp('test.rush', { uid: 'd' }),
  ]
  const out = rescope(cat, ch).build.amps.map(a => a.catalogId)
  expect(out).toEqual(['test.rush', 'testc.rush', 'nothing', 'test.rush'])
  const gone = blankCharacter()
  gone.build.amps = [amp('test.gone', { snapshot: { ...cat.amps.get('test.rush')!, id: 'test.gone' } })]
  expect(rescope(cat, gone)).toBe(gone)
  const wrongType = blankCharacter()
  wrongType.build.amps = [amp('rush', { type: 'cyberware' })]
  expect(rescope(cat, wrongType)).toBe(wrongType)
})

test('the ledger’s buys, added amps and modified amps are rescoped; other events pass through', () => {
  const ch = blankCharacter()
  ch.career = [
    { id: '1', at: 't', type: 'buy', cost: 1, item: item('nano-tape') },
    { id: '2', at: 't', type: 'buy', cost: 1, item: item('test.nano-tape') },
    { id: '3', at: 't', type: 'amp-add', cost: 1, amp: amp('rush', { name: 'Rush (Equipment)' }) },
    { id: '4', at: 't', type: 'amp-add', cost: 1, amp: amp('test.rush') },
    { id: '5', at: 't', type: 'amp-modify', ampUid: 'a', cost: 1, before: amp('rush', { name: 'Rush (Equipment)' }), after: amp('test.rush') },
    { id: '6', at: 't', type: 'amp-modify', ampUid: 'a', cost: 1, before: amp('test.rush'), after: amp('rush', { name: 'Rush (Equipment)' }) },
    { id: '7', at: 't', type: 'amp-modify', ampUid: 'a', cost: 1, before: amp('test.rush'), after: amp('test.rush') },
    { id: '8', at: 't', type: 'note', text: 'hi' },
  ]
  const out = rescope(cat, ch).career
  expect(out[0]).toMatchObject({ item: { catalogId: 'testc.nano-tape' } })
  expect(out[1]).toBe(ch.career[1])
  expect(out[2]).toMatchObject({ amp: { catalogId: 'testc.rush' } })
  expect(out[3]).toBe(ch.career[3])
  expect(out[4]).toMatchObject({ before: { catalogId: 'testc.rush' }, after: { catalogId: 'test.rush' } })
  expect(out[5]).toMatchObject({ before: { catalogId: 'test.rush' }, after: { catalogId: 'testc.rush' } })
  expect(out[6]).toBe(ch.career[6])
  expect(out[7]).toBe(ch.career[7])
})
