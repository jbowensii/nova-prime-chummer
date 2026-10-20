// tests/engine/export.test.ts
// Anarchy 2.0 export v1: runners as the engine sees them (made-up books in tests/fixtures/mini).
import { describe, expect, test } from 'vitest'
import { derive } from '../../src/engine/derive'
import { ampParts, exportBooks, exportRunners, parseRanges, sheetDisplayName } from '../../src/engine/export'
import { appendEvent, makeBuy } from '../../src/engine/career'
import { blankCharacter } from '../../src/engine/file'
import { blankNpc, buildCatalog, compendiumXml } from '../../src/engine'
import type { Character, Compendium } from '../../src/model/types'
import { cat, catFiles } from '../helpers'
import Ajv2020 from 'ajv/dist/2020'
import { readFileSync } from 'node:fs'

const OPTS = { descriptions: true, now: '2026-10-02T09:15:00.000Z', appVersion: '0.6.0' }
const rush = (): Character => {
  const ch = blankCharacter()
  ch.identity.streetName = 'Test Runner'
  ch.build.amps = [
    {
      uid: 'a',
      catalogId: 'testc.rush',
      type: 'equipment',
      name: 'Rush',
      narrative: 'Made-up text.',
      effects: cat.amps.get('testc.rush')!.effects,
      linkedItem: 'i',
    },
  ]
  ch.build.items = [{ uid: 'i', kind: 'gear', name: 'Rush' }]
  return ch
}

describe('export: runners', () => {
  test('the envelope', () => {
    const f = exportRunners(cat, [rush()], OPTS)
    expect(f).toMatchObject({
      format: 'chummer-anarchy2-export',
      version: 1,
      kind: 'runners',
      exportedAt: OPTS.now,
      app: { name: 'Nova Prime Chummer', version: '0.6.0' },
      descriptions: true,
    })
    expect(f.runners).toHaveLength(1)
    expect(f.books).toBeUndefined()
  })
  test('numbers are the engine’s own', () => {
    const ch = rush(),
      d = derive(cat, ch),
      r = exportRunners(cat, [ch], OPTS).runners![0]
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
      { uid: 'v', kind: 'armor', name: 'Made-up vest', armor: 2 },
    )
    const its = exportRunners(cat, [ch], OPTS).runners![0].items
    const w = its.find(i => i.uid === 'w')!.weapon!,
      v = its.find(i => i.uid === 'v')!.armor!
    expect(w).toMatchObject({ dvText: '4P', specialist: true, ranges: { melee: 'ok', short: 'ok', medium: 'disadvantage', long: 'none' } })
    expect(w.dv).toBe(derive(cat, ch).weapons.find(x => x.uid === 'w')!.dv)
    expect(v.value).toBe(2)
  })
  test('item descriptions only when asked', () => {
    const ch = rush()
    ch.build.items.push({
      uid: 'n',
      kind: 'gear',
      name: 'Made-up kit',
      snapshot: { id: 'x.kit', source: 'TESTC', page: 1, name: 'Made-up kit', kind: 'gear', text: 'Kit text.' } as never,
    })
    const get = (descriptions: boolean) => exportRunners(cat, [ch], { ...OPTS, descriptions }).runners![0].items.find(i => i.uid === 'n')!
    expect(get(true).description).toBe('Kit text.')
    expect(get(false).description).toBeUndefined()
  })
  test('an item carries its catalog category, as book items do; the token goes out beside the portrait', () => {
    const ch = rush()
    ch.identity.portrait = 'data:image/jpeg;base64,/9j/P'
    ch.build.items.push({
      uid: 's',
      kind: 'spell',
      name: 'Made-up bolt',
      snapshot: { id: 'x.bolt', source: 'TESTC', page: 1, name: 'Made-up bolt', kind: 'spell', category: 'combat' } as never,
    })
    const r = exportRunners(cat, [ch], OPTS).runners![0]
    expect(r.items.find(i => i.uid === 's')!.category).toBe('combat')
    expect('category' in r.items.find(i => i.uid === 'i')!).toBe(false)
    expect([r.portrait, r.token]).toEqual(['data:image/jpeg;base64,/9j/P', null])
    ch.identity.token = 'data:image/png;base64,iVBO'
    expect(exportRunners(cat, [ch], OPTS).runners![0].token).toBe('data:image/png;base64,iVBO')
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
    const test = f.books![0],
      testc = f.books![1]
    expect(test.source.canon).toBe(false)
    expect(testc.source.canon).toBe(true)
    expect(test.amps.some(a => a.id === 'test.rush')).toBe(true)
    expect(test.amps.every(a => a.source === 'TEST' && typeof a.page === 'number')).toBe(true)
    expect(testc.amps.some(a => a.id === 'test.rush')).toBe(false)
  })
  test('an add-on rates as its effects, below 0 too: no type base, no clamp', () => {
    const mod =
      '<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="amps" version="1"><amp id="test.no-wheel" type="vehicle" ' +
      'printedRating="-1" mod="true" source="TEST" page="9"><name>No wheel</name><effect ref="negative" value="1"/><narrative></narrative></amp></ca2:data>'
    const c = buildCatalog([...catFiles, { file: 'custom/imported/test/mods.xml', xml: mod, overlay: true }])
    const amps = exportBooks(c, ['TEST'], [], OPTS).books![0].amps
    expect(amps.find(a => a.id === 'test.no-wheel')?.rating).toBe(-1) // a vehicle's base 1 isn't the add-on's
    expect(amps.find(a => a.id === 'test.static-shroud')?.rating).toBe(-1)
  })
  test('reference: the kinds with no Foundry document, by book, with their printed stats', () => {
    const all = Object.fromEntries([...cat.sources.keys()].map(id => [id, exportBooks(cat, [id], [], OPTS).books![0].reference ?? []]))
    const refs = Object.values(all).flat()
    expect(refs.length).toBeGreaterThan(0)
    for (const r of refs) expect(Object.keys(r).sort()).toEqual(expect.arrayContaining(['id', 'kind', 'name', 'page', 'source', 'stats']))
    for (const [id, list] of Object.entries(all)) expect(list.every(r => r.source === id)).toBe(true)
    const lvl = [...cat.levels.values()][0]
    if (lvl) expect(all[lvl.source].find(r => r.kind === 'levels' && r.id === lvl.id)?.stats).toMatchObject({ nuyen: lvl.nuyen, skillCap: lvl.skillCap })
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

describe('export: sections, metatypes, skills', () => {
  const rule = (id: string, sheet: string, section: string) => ({ id, source: 'TEST', page: 1, sheet, section, title: id, effects: [], text: '' })
  const meta = {
    id: 'test.imp',
    source: 'TEST',
    page: 7,
    name: 'Made-up kin',
    edge: 3,
    racialQuality: 'Invented sense',
    ranges: { str: [1, 4], agi: [1, 5], wil: [1, 5], log: [1, 5], cha: [2, 6] },
  }
  const withExtras = {
    ...cat,
    metatypes: new Map(cat.metatypes).set(meta.id, meta as never),
    rules: new Map(cat.rules)
      .set('t.a', rule('t.a', 'base', ''))
      .set('t.b', rule('t.b', 'technomancers', '  '))
      .set('t.c', rule('t.c', 'x-files', ''))
      .set('t.d', rule('t.d', 'optional', 'Kept name')),
  } as typeof cat
  test('sheet display names', () => {
    expect(['base', 'technomancers', 'optional', 'vehicles', 'street-gear'].map(sheetDisplayName)).toEqual([
      'Basics',
      'Technomancers',
      'Optional rules',
      'Vehicles & Drones',
      'Street Gear',
    ])
  })
  test('an empty section becomes the sheet name; sheetName on every rule', () => {
    const rules = exportBooks(withExtras, ['TEST'], [], OPTS).books![0].rules,
      by = (id: string) => rules.find(r => r.id === id)!
    expect(by('t.a')).toMatchObject({ section: 'Basics', sheetName: 'Basics' })
    expect(by('t.b')).toMatchObject({ section: 'Technomancers', sheetName: 'Technomancers' })
    expect(by('t.c')).toMatchObject({ section: 'X Files', sheetName: 'X Files' })
    expect(by('t.d')).toMatchObject({ section: 'Kept name', sheetName: 'Optional rules' })
    expect(rules.every(r => r.section && r.sheetName)).toBe(true)
  })
  test('a book’s metatypes', () => {
    const b = exportBooks(withExtras, ['TEST', 'TESTC'], [], OPTS).books!
    expect(b[0].metatypes).toEqual([
      { id: 'test.imp', source: 'TEST', page: 7, canon: false, name: 'Made-up kin', edge: 3, ranges: meta.ranges, racialQuality: 'Invented sense' },
    ])
    expect(b[1].metatypes).toEqual([])
  })
  test('every skill of the book, with all its specs', () => {
    const f = exportBooks(cat, [...cat.sources.keys()], [], OPTS)
    for (const b of f.books!) {
      const mine = [...cat.skills.values()].filter(k => k.source === b.source.id)
      expect(b.skills.map(k => k.id)).toEqual(mine.map(k => k.id))
      mine.forEach((k, i) => expect(b.skills[i].specs.map(p => p.id)).toEqual(k.specs.filter(p => !p.source || p.source === b.source.id).map(p => p.id)))
    }
  })
  test('a book’s sample characters go out as runners, under that book only', () => {
    const ch = rush(),
      f = exportBooks(cat, ['TEST', 'TESTC'], [], OPTS, { TESTC: [ch] })
    const [test, testc] = f.books!
    expect(test.characters).toBeUndefined()
    expect(testc.characters).toEqual(exportRunners(cat, [ch], OPTS).runners)
    expect(testc.characters![0].streetName).toBe('Test Runner')
    expect(exportBooks(cat, ['TEST'], [], OPTS).books![0].characters).toBeUndefined()
  })
  test('an NPC carries its npc block, a runner none; a critter without a metatype is named for its kind', () => {
    const npc: Character = { ...rush(), npc: { kind: 'critter', tier: 'regular', fightingSpirit: 'low' } }
    npc.identity = { ...npc.identity, metatype: '' }
    const [r, n] = exportRunners(cat, [rush(), npc], OPTS).runners!
    expect('npc' in r).toBe(false)
    expect(n.npc).toEqual({ kind: 'critter', tier: 'regular', fightingSpirit: 'low' })
    expect(n.metatype).toMatchObject({ id: '', name: 'Critter' })
  })
  test('a book’s NPCs go out as runners with their npc block, under that book only', () => {
    const npc: Character = { ...rush(), npc: { kind: 'npc', tier: 'prime' } }
    const [test, testc] = exportBooks(cat, ['TEST', 'TESTC'], [], OPTS, {}, { TESTC: [npc] }).books!
    expect(test.npcs).toBeUndefined()
    expect(testc.npcs).toEqual(exportRunners(cat, [npc], OPTS).runners)
    expect(testc.npcs![0].npc).toEqual({ kind: 'npc', tier: 'prime' })
  })
})

// a made-up compendium, loaded as a GM's overlay
const ref = { source: 'ALLEY', page: 1 }
const alleyNpc = (() => {
  const ch = blankNpc('critter', 'regular')
  ch.identity.name = 'Alley Rat'
  return ch
})()
const alley: Compendium = {
  id: '00000000beef',
  name: 'Alley Finds',
  source: 'ALLEY',
  sharing: 'private',
  updatedAt: '2026-10-02T00:00:00.000Z',
  amps: [{ id: 'alley.grip', type: 'quality', name: 'Grip', effects: [{ ref: 'init-1' }], narrative: 'Our own grip text.', ...ref }],
  items: [{ id: 'alley.brick', kind: 'weapon', name: 'Brick', dv: 'STR+1', ranges: 'OK/OK/-/-', text: 'Our own brick text.', ...ref }],
  vehicles: [{ id: 'alley.cart', name: 'Cart', pilot: 1, body: 3, handling: 2, speed: 1, armor: 0, mount: 'none', ...ref }],
  npcs: [alleyNpc],
}
const withAlley = buildCatalog([
  ...catFiles,
  { file: `compendiums/gm1/${alley.id}.xml`, xml: compendiumXml(alley), overlay: true, publisher: 'Game Master', owner: 'gm1' },
])

describe('export: a compendium', () => {
  test('exports as one book marked compendium, non-canon, with its own text and its NPCs', () => {
    const [b] = exportBooks(withAlley, ['ALLEY'], [], OPTS, {}, { ALLEY: alley.npcs }).books!
    expect(b.source).toEqual({ id: 'ALLEY', name: 'Alley Finds', publisher: 'Game Master', canon: false, compendium: true })
    expect(b.amps).toEqual([expect.objectContaining({ id: 'alley.grip', canon: false, description: 'Our own grip text.' })])
    expect(b.items).toEqual([expect.objectContaining({ id: 'alley.brick', kind: 'weapon', canon: false, dv: 'STR+1', description: 'Our own brick text.' })])
    expect(b.vehicles).toEqual([expect.objectContaining({ id: 'alley.cart', body: 3 })])
    expect(b.npcs!.map(n => [n.realName, n.npc])).toEqual([['Alley Rat', { kind: 'critter', tier: 'regular' }]])
  })
  test('a book export has no compendium field, the same with a compendium loaded or not', () => {
    const books = [...cat.sources.keys()]
    const plain = JSON.stringify(exportBooks(cat, books, [], OPTS))
    expect(plain).not.toContain('"compendium"')
    expect(JSON.stringify(exportBooks(withAlley, books, [], OPTS))).toBe(plain)
  })
})

describe('export: bonuses and vehicles', () => {
  const amp = (uid: string, refs: string[], type = 'quality') => ({ uid, type, name: 'Amp ' + uid, effects: refs.map(ref => ({ ref })) })
  test('capped bonuses are counted once, so the amps add up to the sheet', () => {
    const ch = rush()
    ch.build.amps = [
      amp('a', ['wound-light', 'init-1']),
      amp('b', ['wound-light', 'wound-serious', 'init-2']),
      amp('c', ['wound-serious', 'init-2']),
      amp('d', ['wound-light', 'init-3'], 'cyberdeck'),
    ] as never
    const r = exportRunners(cat, [ch], OPTS).runners![0],
      d = derive(cat, ch)
    const sum = (k: 'light' | 'serious') => r.amps.reduce((s, a) => s + a.bonuses[k], 0)
    expect(r.amps.map(a => a.bonuses.light)).toEqual([1, 0, 0, 0])
    expect(r.amps.map(a => a.bonuses.serious)).toEqual([0, 1, 0, 0])
    expect(sum('light')).toBe(d.monitor.light - 2)
    expect(sum('serious')).toBe(d.monitor.serious - 1)
    // initiative: derive takes the highest level, the first amp on a tie; the deck's 3 is the best here
    expect(d.initiative).toMatchObject({ level: 3, source: 'Amp d' })
    expect(r.amps.map(a => a.bonuses.initiative)).toEqual([0, 0, 0, 3])
    ch.build.amps.pop()
    expect(exportRunners(cat, [ch], OPTS).runners![0].amps.map(a => a.bonuses.initiative)).toEqual([0, 2, 0])
  })
  test('a vehicle amp: its uid, the chassis id, the drone count', () => {
    const ch = rush()
    ch.build.amps = [
      { uid: 'v1', type: 'vehicle', name: 'My kite', vehicle: 'medium-drone', effects: [{ ref: 'extra-drone' }, { ref: 'extra-drone' }] },
    ] as never
    const r = exportRunners(cat, [ch], OPTS).runners![0]
    expect(r.vehicles).toHaveLength(1)
    expect(r.vehicles[0]).toMatchObject({ uid: 'v1', chassisId: 'medium-drone', count: 3, chassis: 'Kite' })
    expect(r.vehicles[0].uid).toBe(r.amps[0].uid)
    expect(r.amps[0].vehicle).toBe('medium-drone')
  })
  test('ledger lines name the thing; a spec Risk Reduction line names its skill', () => {
    let ch: Character = { ...rush(), finalizedAt: OPTS.now }
    ch = appendEvent(ch, makeBuy(cat, { uid: 'bought', kind: 'gear', name: 'Made-up rope' }))
    const led = exportRunners(cat, [ch], OPTS).runners![0].ledger
    expect(led.find(l => l.type === 'buy')!.summary).toBe('Bought Made-up rope')
    const sk = [...cat.skills.values()].find(s => s.specs.length)!
    const rr = ampParts(cat, 'quality', [{ ref: 'rr-spec', param: sk.specs[0].id }]).rr
    expect(rr[0]).toMatchObject({ on: 'spec', skill: sk.id })
    expect(ampParts(cat, 'quality', [{ ref: 'rr-spec', param: 'custom:x' }], [{ id: 'mine', rating: 1, specs: ['custom:x'] }] as never).rr[0].skill).toBe(
      'mine',
    )
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
    const ch = rush()
    ch.identity.gender = 'Made-up gender'
    const g = file(exportRunners(cat, [ch], OPTS))
    expect(g.runners[0].gender).toBe('Made-up gender')
    expect(runners().runners[0]).not.toHaveProperty('gender')
    expect(check(g), JSON.stringify(check.errors)).toBe(true)
    const comp = file(exportBooks(withAlley, ['ALLEY'], [], OPTS, {}, { ALLEY: alley.npcs }))
    expect(check(comp), JSON.stringify(check.errors)).toBe(true)
  })
  test('the example in the format document is valid', () => {
    const md = readFileSync('docs/export-format.md', 'utf8')
    const example = JSON.parse(/```json\r?\n([\s\S]*?)\r?\n```/.exec(md)![1])
    expect(check(example), JSON.stringify(check.errors)).toBe(true)
  })
  test('new optional fields are accepted, and absent ones too', () => {
    const f = books(),
      b = f.books[0]
    expect(check(f), JSON.stringify(check.errors)).toBe(true)
    for (const r of b.rules) delete r.sheetName
    delete b.metatypes
    expect(check(f), JSON.stringify(check.errors)).toBe(true)
    b.metatypes = [{ id: 'm', source: 'TEST', page: 1, canon: false, name: 'M', edge: 2, ranges: { str: [1, 5] }, racialQuality: '' }]
    expect(check(f), JSON.stringify(check.errors)).toBe(true)
    b.metatypes[0].edge = 'two'
    expect(check(f)).toBe(false)
    b.metatypes[0].edge = 2
    b.characters = [runners().runners[0]]
    expect(check(f), JSON.stringify(check.errors)).toBe(true)
    b.characters[0].streetName = 5
    expect(check(f)).toBe(false)
    b.characters[0].streetName = 'S'
    b.npcs = [{ ...runners().runners[0], npc: { kind: 'spirit', tier: 'regular', fightingSpirit: 'extreme' } }]
    expect(check(f), JSON.stringify(check.errors)).toBe(true)
    delete b.npcs[0].npc.fightingSpirit
    expect(check(f), JSON.stringify(check.errors)).toBe(true)
    b.npcs[0].npc.kind = 'dragon'
    expect(check(f)).toBe(false)
    b.npcs[0].npc.kind = 'spirit'
    b.source.compendium = true
    expect(check(f), JSON.stringify(check.errors)).toBe(true)
    b.npcs[0].token = 'data:image/png;base64,iVBO'
    b.npcs[0].items = [{ uid: 'i', kind: 'spell', name: 'S', canon: false, price: 0, category: 'combat' }]
    expect(check(f), JSON.stringify(check.errors)).toBe(true)
    delete b.npcs[0].token
    expect(check(f), JSON.stringify(check.errors)).toBe(true)
    b.npcs[0].token = 5
    expect(check(f)).toBe(false)
    b.npcs[0].token = null
    b.source.compendium = 'yes'
    expect(check(f)).toBe(false)
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
    const f = runners(),
      ranges = { melee: 'none', short: 'ok', medium: 'ok', long: 'disadvantage' }
    f.runners[0].items.push({
      uid: 'w',
      kind: 'weapon',
      name: 'W',
      canon: false,
      price: 0,
      weapon: { dv: '4P', dvText: '4P', ranges, specialist: false, ammo: [] },
    })
    expect(check(f), JSON.stringify(check.errors)).toBe(true)
    f.runners[0].items.at(-1).weapon.ranges.short = 'far'
    expect(check(f)).toBe(false)
    const g = runners()
    g.runners[0].monitor.light = 'four'
    expect(check(g)).toBe(false)
    const h = books(),
      amp = h.books.find((b: { amps: unknown[] }) => b.amps.length)!.amps[0]
    expect(check(h), JSON.stringify(check.errors)).toBe(true)
    amp.printedRating = 'two'
    expect(check(h)).toBe(false)
    amp.printedRating = 2
    delete amp.mod
    expect(check(h)).toBe(false)
  })
})

// The amps' Armor +1 are capped once (CRB p.61's maximum bonus), the same way for the sheet and the export: each amp
// gets its share, a worn Equipment amp's only on the main armor, and the shares add up to derive's armor.
test('export: each amp’s armor share adds up to the sheet’s capped armor', () => {
  const ch = blankCharacter(),
    a = (uid: string, type: string, n: number, linkedItem?: string) => ({
      uid,
      type,
      name: uid,
      effects: Array.from({ length: n }, () => ({ ref: 'armor-plus' })),
      ...(linkedItem ? { linkedItem } : {}),
    })
  ch.build.items = [
    { uid: 'coat', kind: 'armor', name: 'Made-up coat', armor: 2 },
    { uid: 'vest', kind: 'armor', name: 'Made-up vest', armor: 1 },
  ]
  ch.build.mainArmor = 'coat'
  ch.build.amps = [a('skin', 'quality', 1), a('weave', 'equipment', 1, 'vest'), a('plates', 'cyberware', 2), a('lining', 'equipment', 1, 'coat')]
  const d = derive(cat, ch),
    r = exportRunners(cat, [ch], OPTS).runners![0]
  const shares = r.amps.map(x => x.bonuses.armor)
  expect(shares).toEqual([1, 0, 1, 0]) // made-up max 2: the always-on quality, then one of the plates; the vest isn't worn
  expect(2 + shares.reduce((t, n) => t + n, 0)).toBe(d.armor.main)
})
