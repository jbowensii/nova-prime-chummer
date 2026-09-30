// tests/engine/export.test.ts
// Chummer Anarchy export v1: runners as the engine sees them (made-up books in tests/fixtures/mini).
import { describe, expect, test } from 'vitest'
import { derive } from '../../src/engine/derive'
import { exportBooks, exportRunners, parseRanges } from '../../src/engine/export'
import { appendEvent, makeBuy } from '../../src/engine/career'
import { blankCharacter } from '../../src/engine/file'
import type { Character } from '../../src/model/types'
import { cat } from '../helpers'
import Ajv2020 from 'ajv/dist/2020'
import { readFileSync } from 'node:fs'

const OPTS = { descriptions: true, now: '2026-10-02T09:15:00.000Z', appVersion: '0.6.0' }
const rush = (): Character => {
  const ch = blankCharacter()
  ch.identity.streetName = 'Test Runner'
  ch.build.amps = [{ uid: 'a', catalogId: 'testc.rush', type: 'equipment', name: 'Rush', narrative: 'Made-up text.',
    effects: cat.amps.get('testc.rush')!.effects, linkedItem: 'i' }]
  ch.build.items = [{ uid: 'i', kind: 'gear', name: 'Rush' }]
  return ch
}

describe('export: runners', () => {
  test('the envelope', () => {
    const f = exportRunners(cat, [rush()], OPTS)
    expect(f).toMatchObject({ format: 'chummer-anarchy2-export', version: 1, kind: 'runners', exportedAt: OPTS.now,
      app: { name: 'Chummer Anarchy 2.0', version: '0.6.0' }, descriptions: true })
    expect(f.runners).toHaveLength(1)
    expect(f.books).toBeUndefined()
  })
  test('numbers are the engine’s own', () => {
    const ch = rush(), d = derive(cat, ch), r = exportRunners(cat, [ch], OPTS).runners![0]
    expect(r.streetName).toBe('Test Runner')
    expect(r.essence).toBe(d.essence)
    expect(r.monitor).toEqual(d.monitor)
    expect(r.attributes).toEqual(d.build.attributes)
    expect(r.amps[0]).toMatchObject({ uid: 'a', catalogId: 'testc.rush', source: 'TESTC', canon: true, name: 'Rush' })
    expect(r.amps[0].effects.every(e => typeof e.name === 'string' && e.name.length > 0)).toBe(true)
  })
  test('descriptions only when asked', () => {
    expect(exportRunners(cat, [rush()], OPTS).runners![0].amps[0].description).toBe('Made-up text.')
    expect(exportRunners(cat, [rush()], { ...OPTS, descriptions: false }).runners![0].amps[0].description).toBeUndefined()
  })
  test('a finalized runner exports its current build, not its baseline', () => {
    // a pre-0.5.5 runner: finalized without a "Creation finished" entry, so its events apply on top of the baseline build
    let ch: Character = { ...rush(), finalizedAt: OPTS.now }
    ch = appendEvent(ch, { id: 'e1', at: OPTS.now, type: 'earn', amount: 5000, run: 'Made-up run', date: '2026-10-01' })
    ch = appendEvent(ch, makeBuy(cat, { uid: 'bought', kind: 'gear', name: 'Made-up rope' }))
    const r = exportRunners(cat, [ch], OPTS).runners![0]
    expect(r.finalized).toBe(true)
    expect(ch.build.items.map(i => i.uid)).not.toContain('bought') // the baseline lacks it
    expect(r.items.map(i => i.uid)).toContain('bought')
    expect(r.nuyen.balance).toBeGreaterThanOrEqual(0)
    expect(r.ledger.some(l => l.type === 'earn' && l.amount === 5000)).toBe(true)
  })
  test('weapons and armor', () => {
    const ch = rush()
    ch.build.items.push(
      { uid: 'w', kind: 'weapon', name: 'Made-up pistol', dv: '4P', ranges: 'OK/OK/Dis./–', specialist: true },
      { uid: 'v', kind: 'armor', name: 'Made-up vest', armor: 2 })
    const its = exportRunners(cat, [ch], OPTS).runners![0].items
    const w = its.find(i => i.uid === 'w')!.weapon!, v = its.find(i => i.uid === 'v')!.armor!
    expect(w).toMatchObject({ dvText: '4P', specialist: true, ranges: { melee: 'ok', short: 'ok', medium: 'disadvantage', long: 'none' } })
    expect(w.dv).toBe(derive(cat, ch).weapons.find(x => x.uid === 'w')!.dv)
    expect(v.value).toBe(2)
  })
  test('item descriptions only when asked', () => {
    const ch = rush()
    ch.build.items.push({ uid: 'n', kind: 'gear', name: 'Made-up kit',
      snapshot: { id: 'x.kit', source: 'TESTC', page: 1, name: 'Made-up kit', kind: 'gear', text: 'Kit text.' } as never })
    const get = (descriptions: boolean) => exportRunners(cat, [ch], { ...OPTS, descriptions }).runners![0].items.find(i => i.uid === 'n')!
    expect(get(true).description).toBe('Kit text.')
    expect(get(false).description).toBeUndefined()
  })
  test('ranges become ok / disadvantage / none', () => {
    expect(parseRanges('OK/OK/Dis./–')).toEqual({ melee: 'ok', short: 'ok', medium: 'disadvantage', long: 'none' })
    expect(parseRanges('')).toEqual({ melee: 'none', short: 'none', medium: 'none', long: 'none' })
  })
  test('nothing about the account', () => {
    const json = JSON.stringify(exportRunners(cat, [{ ...rush(), campaign: 'c1' }], OPTS))
    expect(json).not.toMatch(/"(owner|ownerName|campaign|password|session)"\s*:/)
  })
})

describe('export: books', () => {
  test('only the ticked books, each entry cited, canon flagged', () => {
    const f = exportBooks(cat, ['TEST', 'TESTC'], [], OPTS)
    expect(f.kind).toBe('books')
    expect(f.books!.map(b => b.source.id)).toEqual(['TEST', 'TESTC'])
    const test = f.books![0], testc = f.books![1]
    expect(test.source.canon).toBe(false)
    expect(testc.source.canon).toBe(true)
    expect(test.amps.some(a => a.id === 'test.rush')).toBe(true)
    expect(test.amps.every(a => a.source === 'TEST' && typeof a.page === 'number' && a.rating >= 0)).toBe(true)
    expect(testc.amps.some(a => a.id === 'test.rush')).toBe(false)
  })
  test('descriptions only when asked; table rules pass through', () => {
    const on = exportBooks(cat, ['TEST'], [{ name: 'Made-up rule', text: 'Invented.' }], OPTS)
    const off = exportBooks(cat, ['TEST'], [], { ...OPTS, descriptions: false })
    expect(on.tableRules).toEqual([{ name: 'Made-up rule', text: 'Invented.' }])
    expect(JSON.stringify(on.books)).toMatch(/"description"|"text"/)
    expect(JSON.stringify(off.books)).not.toMatch(/"description"|"text"/)
  })
  test('a rules sheet’s entries are the book’s', () => {
    const rules = exportBooks(cat, ['TEST'], [], OPTS).books![0].rules
    expect(rules.length).toBeGreaterThan(0)
    expect(rules.every(r => r.title && r.sheet)).toBe(true)
  })
})

describe('export: the schema', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false })
  const check = ajv.compile(JSON.parse(readFileSync('public/data/schema/export.schema.json', 'utf8')))
  const file = (f: unknown) => JSON.parse(JSON.stringify(f)) // as written to disk (undefined keys gone)
  const runners = () => file(exportRunners(cat, [rush()], OPTS))
  const books = () => file(exportBooks(cat, [...cat.sources.keys()], [{ name: 'X', text: 'Y' }], OPTS))
  test('runners and books files are valid', () => {
    for (const f of [runners(), books()]) expect(check(f), JSON.stringify(check.errors)).toBe(true)
  })
  test('the example in the format document is valid', () => {
    const md = readFileSync('docs/export-format.md', 'utf8')
    const example = JSON.parse(/```json\r?\n([\s\S]*?)\r?\n```/.exec(md)![1])
    expect(check(example), JSON.stringify(check.errors)).toBe(true)
  })
  test('a wrong format, version or kind is not', () => {
    expect(check({ ...runners(), format: 'something-else' })).toBe(false)
    expect(check({ ...runners(), version: 2 })).toBe(false)
    expect(check({ ...runners(), kind: 'characters' })).toBe(false)
  })
  test('kind runners without runners is not', () => {
    const { runners: _r, ...rest } = runners()
    expect(check(rest)).toBe(false)
  })
  test('a bad range value or a mistyped field is not', () => {
    const f = runners(), ranges = { melee: 'none', short: 'ok', medium: 'ok', long: 'disadvantage' }
    f.runners[0].items.push({ uid: 'w', kind: 'weapon', name: 'W', canon: false, price: 0,
      weapon: { dv: '4P', dvText: '4P', ranges, specialist: false, ammo: [] } })
    expect(check(f), JSON.stringify(check.errors)).toBe(true)
    f.runners[0].items.at(-1).weapon.ranges.short = 'far'
    expect(check(f)).toBe(false)
    const g = runners()
    g.runners[0].monitor.light = 'four'
    expect(check(g)).toBe(false)
    const h = books()
    delete h.books[0].amps[0]?.mod
    if (h.books[0].amps[0]) expect(check(h)).toBe(false)
  })
})
