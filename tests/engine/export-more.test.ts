// Anarchy export edges (src/engine/export.ts): the ledger as lines for every kind of entry (including the older events),
// items with their own numbers, effects with every field, and the book export without descriptions. Invented data.
import { expect, test } from 'vitest'
import { appendEvent, finalize, makeAdvance, makeAmpAdd, makeAmpModify, makeBuy, makeEarn, makeKnowledge, makeNote, makeSell, makeSpec, voidEvent } from '../../src/engine/career'
import { exportBooks, exportEffects, exportRunners, parseRanges, sheetDisplayName } from '../../src/engine/export'
import { blankCharacter } from '../../src/engine/file'
import type { AmpEntry, Character } from '../../src/model/types'
import { cat, legacy } from '../helpers'

const OPTS = { descriptions: false, now: '2026-10-02T09:15:00.000Z', appVersion: '0.6.0' }
const amp = (uid: string, name: string): AmpEntry => ({ uid, catalogId: 'test.rush', type: 'equipment', name, narrative: 'Hidden text.', effects: cat.amps.get('test.rush')!.effects, linkedItem: 'i' })

test('range words: ok, disadvantage, none, in any case and spacing; missing parts are none', () => {
  expect(parseRanges('OK/Dis./–/ok')).toEqual({ melee: 'ok', short: 'disadvantage', medium: 'none', long: 'ok' })
  expect(parseRanges(' dis/ OK ')).toEqual({ melee: 'disadvantage', short: 'ok', medium: 'none', long: 'none' })
  expect(parseRanges(undefined)).toEqual({ melee: 'none', short: 'none', medium: 'none', long: 'none' })
})

test('a sheet’s display name: the table’s, else the id title-cased, else Rules', () => {
  expect(sheetDisplayName('base')).toBe('Basics')
  expect(sheetDisplayName('street-magic_rules')).toBe('Street Magic Rules')
  expect(sheetDisplayName('')).toBe('Rules')
  expect(sheetDisplayName('--')).toBe('Rules')
})

test('every entry of the ledger is a line with its amount: earnings add, a finalize sets, anything priced is minus its cost', () => {
  let ch: Character = legacy(finalize(cat, blankCharacter()))
  ch.identity.streetName = 'Ledger'
  ch.build.items.push({ uid: 'knife', kind: 'weapon', name: 'Made-up knife' })
  ch.build.amps.push(amp('a1', 'Rush'))
  ch.build.skills.push({ id: 'stealth', rating: 2, specs: [] })
  const add = amp('a2', 'Second Rush')
  const events = [
    makeEarn(40, 'The Dock Job', '2026-10-01'), makeNote('Met a fixer'), makeBuy(cat, { uid: 'gun', kind: 'weapon', name: 'Made-up gun' }), makeSell('knife'), makeSell('gun'),
    makeAmpAdd(cat, ch, add), makeAmpModify(cat, ch, amp('a1', 'Rush Mk2')), makeAdvance(cat, ch, 'skills.stealth', 3), makeSpec(cat, 'stealth', 'custom:shadowing'),
    makeKnowledge(cat, { name: 'Old maps', kind: 'knowledge' }),
  ]
  ch = events.reduce(appendEvent, ch)
  const r = exportRunners(cat, [ch], OPTS).runners![0]
  expect(r.ledger.map(l => [l.type, l.summary])).toEqual([
    ['earn', 'The Dock Job'], ['note', 'Met a fixer'], ['buy', 'Bought Made-up gun'], ['sell', 'sell'], ['sell', 'Sold Made-up gun'], ['amp-add', 'Added amp Second Rush'],
    ['amp-modify', 'Changed amp Rush Mk2'], ['advance', 'Advanced skills.stealth from 2 to 3'], ['spec-add', 'Specialization shadowing'], ['knowledge-add', 'Knowledge Old maps']])
  // (a sold item the build no longer holds and no buy named is only "sell")
  expect(r.ledger[0].amount).toBe(40)
  expect(r.ledger[1].amount).toBe(0)
  expect(r.ledger[3].amount).toBe(0)   // a sale records no refund
  expect(r.ledger[2].amount).toBeLessThanOrEqual(0)
  expect(r.ledger[7].amount).toBe(-(events[7] as { cost: number }).cost)
  // a voided entry is not listed
  const voided = voidEvent(ch, events[1].id, 'no')
  expect(exportRunners(cat, [voided], OPTS).runners![0].ledger.map(l => l.type)).not.toContain('note')
})

test('a sale of something the runner no longer has, or an entry without a name, is the bare type; a logged change lists its lines; a finalize its balance', () => {
  const fin = finalize(cat, blankCharacter())
  const edited = structuredClone(fin)
  edited.build.attributes.agi = 3
  const logged = { ...edited, career: [...edited.career, { id: 'c1', at: 'x', type: 'change' as const, changes: [{ key: 'attr:agi', label: 'Finesse', from: '2', to: '3' }, { key: 'k', label: 'Knife', to: '' }], cost: 4 }] }
  const ledger = (c: Character) => exportRunners(cat, [c], OPTS).runners![0].ledger
  expect(ledger(logged).map(l => [l.type, l.summary])).toEqual([['finalize', 'Creation finished'], ['change', 'Finesse: 2 → 3; Added Knife']])
  expect(ledger(logged)[0].amount).toBe((fin.career[0] as { remaining: number }).remaining)
  expect(ledger(logged)[1].amount).toBe(-4)
  const legacySale = appendEvent(legacy(fin), makeSell('gone'))
  expect(ledger(legacySale)).toEqual([expect.objectContaining({ type: 'sell', summary: 'sell', amount: 0 })])
})

test('an item carries its own numbers over the catalog’s; armor keeps its overlay; an NPC without a metatype is named by its kind', () => {
  const ch = blankCharacter()
  ch.build.items = [
    { uid: 'w', kind: 'weapon', name: 'Own blade', dv: '7P', ranges: 'OK/Dis./–/–', specialist: true, note: 'Custom grip' },
    { uid: 'a', kind: 'armor', name: 'Own vest', armor: 2, over: 'coat' },
    { uid: 'b', kind: 'armor', name: 'Plain vest' },
    { uid: 's', catalogId: 'gone.thing', kind: 'gear', name: 'Snap', snapshot: { ...cat.items.get('test.nano-tape')!, id: 'gone.thing', text: 'Snapshot text.' } },
  ]
  const r = exportRunners(cat, [ch], { ...OPTS, descriptions: true }).runners![0]
  expect(r.items.find(i => i.uid === 'w')).toMatchObject({ note: 'Custom grip', weapon: { dvText: '7P', ranges: { melee: 'ok', short: 'disadvantage', medium: 'none', long: 'none' }, specialist: true } })
  expect(r.items.find(i => i.uid === 'a')!.armor).toEqual({ value: 2, over: 'coat' })
  expect(r.items.find(i => i.uid === 'b')!.armor).toEqual({ value: 0 })
  expect(r.items.find(i => i.uid === 's')).toMatchObject({ source: 'TEST', description: 'Snapshot text.', canon: false })
  const npc = blankCharacter()
  npc.npc = { kind: 'spirit', tier: 'regular' }
  npc.identity.metatype = ''
  expect(exportRunners(cat, [npc], OPTS).runners![0].metatype.name).toBe('Spirit')
  const unknown = blankCharacter()
  unknown.identity.metatype = 'gone-meta'
  expect(exportRunners(cat, [unknown], OPTS).runners![0].metatype.name).toBe('gone-meta')
  const bare = blankCharacter()
  bare.identity.metatype = ''
  expect(exportRunners(cat, [bare], OPTS).runners![0].metatype.name).toBe('')
})

test('an effect lists everything the pick says; an unknown effect falls back to its id', () => {
  const [full, unknown] = exportEffects(cat, [
    { ref: 'rr-spec', param: 'close-combat.blades', value: 2, note: 'n', switch: 'activated', when: 'in the dark', confidence: 'low', from: 'quality', affects: 'target', unpriced: true },
    { ref: 'no-such-effect' }])
  expect(full).toMatchObject({ id: 'rr-spec', param: 'close-combat.blades', value: 2, note: 'n', switch: 'activated', when: 'in the dark', confidence: 'low', from: 'quality', affects: 'target', unpriced: true })
  expect(typeof full.name).toBe('string')
  expect(full.applied).toBe(false)
  expect(unknown).toMatchObject({ id: 'no-such-effect', name: 'no-such-effect', category: '', line: 'no-such-effect' })
})

test('the book export: sources the catalog lacks are skipped, and descriptions and rule texts come only when asked', () => {
  const off = exportBooks(cat, ['TEST', 'NOPE'], [{ name: 'Rule', text: 'Invented.' }], OPTS)
  expect(off.books!.map(b => b.source.id)).toEqual(['TEST'])
  expect(off.tableRules).toEqual([{ name: 'Rule', text: '' }])
  const book = off.books![0]
  expect(book.amps.every(a => a.description === undefined)).toBe(true)
  expect(book.items.every(i => i.description === undefined)).toBe(true)
  const on = exportBooks(cat, ['TEST'], [{ name: 'Rule', text: 'Invented.' }], { ...OPTS, descriptions: true })
  expect(on.tableRules).toEqual([{ name: 'Rule', text: 'Invented.' }])
  expect(on.books![0].rules.some(r => r.sheetName)).toBe(true)
})
