// SR6 export v1 (docs/sr6-export-format.md): runners and NPCs as the SR6 engine sees them, on the made-up fixture.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, test } from 'vitest'
import { balances, currentBuild, deriveSr6, entryValues, exportAttrs, exportSr6Books, exportSr6Compendium, exportSr6Runners, priced } from '../../src/sr6/engine'
import { xmlToSr6 } from '../../src/sr6/engine/charxml'
import { blankSr6Npc } from '../../src/sr6/engine/npc'
import type { Sr6Purchase } from '../../src/sr6/model/character'
import type { Sr6Compendium } from '../../src/sr6/model/types'
import { made, fixtureCatalog } from './fixture'
import { ganger, mara, SAMPLE_OPTS, sampleWorld, streetKit } from './samples'

const OPTS = { descriptions: true, now: '2026-10-04T09:00:00.000Z', appVersion: '0.9.0' }
const schema = new Ajv2020({ strict: false, validateFormats: false }).compile(JSON.parse(readFileSync('public/data/schema/sr6-export.schema.json', 'utf8')))
const career = () => { const r = xmlToSr6(readFileSync('tests/fixtures/sr6/runner-career.xml', 'utf8')); if (!r.ok) throw new Error(r.reason); return r.character }
const grunt = () => { const r = xmlToSr6(readFileSync('tests/fixtures/sr6/npc-grunt.xml', 'utf8')); if (!r.ok) throw new Error(r.reason); return r.character }

describe('SR6 export: runners', () => {
  test('the envelope, valid against the schema', () => {
    const { data, cr } = made(), f = exportSr6Runners(fixtureCatalog(), data, cr, [career(), grunt()], OPTS)
    expect(f).toMatchObject({ format: 'chummer-sr6-export', version: 1, kind: 'runners', exportedAt: OPTS.now,
      app: { name: 'Chummer Anarchy 2.0', version: '0.9.0' }, descriptions: true })
    expect(schema(f), JSON.stringify(schema.errors)).toBe(true)
  })
  test('numbers are the engine’s own; a finalized runner as it stands', () => {
    const { data, cr } = made(), ch = career(), r = exportSr6Runners(fixtureCatalog(), data, cr, [ch], OPTS).runners![0]
    const d = deriveSr6(data, cr, { ...ch, build: currentBuild(ch) })
    expect(r.attributes).toEqual(d.attrs)
    expect(r.essence).toBe(d.essence)
    expect(r.edge).toBe(d.edge)
    expect(r.karma).toBe(balances(ch).karma)
    expect(r.nuyen).toBe(balances(ch).nuyen)
    expect(r.derived?.monitors).toEqual(d.monitors)
    expect(r.finalized).toBe(true)
    // the advance bought after Finalize is on the runner
    expect(r.purchases.map(x => x.uid)).toEqual(['g1', 'g9'])
  })
  test('a draft: karma and nuyen are what the build budgets leave', () => {
    const { data, cr } = made(), ch = career()
    delete ch.finalizedAt; ch.ledger = []
    const r = exportSr6Runners(fixtureCatalog(), data, cr, [ch], OPTS).runners![0], d = deriveSr6(data, cr, ch)
    expect(r).toMatchObject({ finalized: false, karma: d.karmaLeft, nuyen: d.nuyenLeft })
  })
  test('an NPC carries its block and no derived values', () => {
    const { data, cr } = made(), r = exportSr6Runners(fixtureCatalog(), data, cr, [grunt()], OPTS).runners![0]
    expect(r.npc?.kind).toBe('grunt')
    expect(r.npc).toMatchObject({ rating: 2, group: 'Street Crew', from: { kind: 'npcs', id: 'crb.corner-goon', source: 'CRB', page: 205 } })
    expect(r.npc?.stats.find(s => s.key === 'bod')?.value).toMatch(/^\d+$/)
    expect(r.npc?.pools.find(p => p.name === 'Close Combat')).toMatchObject({ rating: 4, printed: 'Close Combat 4' })
    expect(r.derived).toBeUndefined()
  })
  test('a runner’s things: catalog entries as printed, skills by name, the description', () => {
    const { data, cr } = made(), r = exportSr6Runners(fixtureCatalog(), data, cr, [career()], OPTS).runners![0]
    expect(r.skills.find(s => s.id === 'crb.hexing')).toMatchObject({ name: 'Hexing', rank: 4 })
    const vest = r.purchases[0]
    expect(vest).toMatchObject({ uid: 'g1', id: 'crb.padded-vest', kind: 'armor', name: 'Padded Vest', source: 'CRB', page: 264, canon: true,
      worn: true, qty: 1, bonuses: [], accessories: [], values: { cost: 400, avail: 2, defense: 2, capacity: 6 } })
    expect(vest.attrs.defense).toBe('+2')
    expect(vest.values).not.toHaveProperty('rating')  // an unrated item has no rating
    expect(r.magic).toMatchObject({ kind: 'full', tradition: 'Kitchen hoodoo', drainAttr: 'log', initiation: 0 })
    expect(r.metatype).toEqual({ id: 'crb.glimmerkin', name: expect.any(String) })
    expect(r.lifestyle).toMatchObject({ id: 'crb.cozy', name: 'Cozy', months: 1, cost: 2500 })
    expect(r.contacts[0]).toEqual({ uid: 'c1', name: 'Fixer Fred', archetype: 'Fixer', connection: 3, loyalty: 2 })
    expect(r.knowledge).toContainEqual({ name: 'Sperethiel', kind: 'language', native: true, rank: 0 })
  })
  test('a graded ware: values at one unit, priced with its grade; a perRating bonus × the rating', () => {
    const { data, cr } = made(), ch = career()
    const ware: Sr6Purchase = { uid: 'w1', kind: 'augmentations', id: 'crb.glow-eyes', rating: 3, grade: 'alpha', qty: 1, accessories: [],
      bonuses: [{ target: 'rea', value: 1, perRating: true }, { target: 'initDice', value: 1 }] }
    ch.build.purchases.push(ware)
    const f = exportSr6Runners(fixtureCatalog(), data, cr, [ch], OPTS), x = f.runners![0].purchases.find(p => p.uid === 'w1')!
    const p = priced({ ...ware, qty: 1, accessories: [] }, data, cr)
    expect(x.values).toMatchObject({ rating: 3, essence: p.essence, cost: p.cost, avail: p.avail })
    expect(x.grade).toBe('alpha')
    expect(x.bonuses).toEqual([{ target: 'rea', value: 3 }, { target: 'initDice', value: 1 }])
    expect(schema(f), JSON.stringify(schema.errors)).toBe(true)
  })
  test('a custom line: no catalog entry, not canon, the player’s numbers', () => {
    const { data, cr } = made(), ch = career()
    ch.build.purchases.push({ uid: 'x1', kind: 'gear', name: 'Lucky Coin', cost: 5, qty: 2, accessories: [] })
    const f = exportSr6Runners(fixtureCatalog(), data, cr, [ch], OPTS), x = f.runners![0].purchases.find(p => p.uid === 'x1')!
    expect(x).toMatchObject({ kind: 'gear', name: 'Lucky Coin', canon: false, attrs: {}, parts: [], qty: 2, values: { cost: 5 } })
    expect(x).not.toHaveProperty('id')
    expect(schema(f), JSON.stringify(schema.errors)).toBe(true)
  })
  test('the ledger: live entries with their labels; a voided entry and its void left out', () => {
    const { data, cr } = made(), r = exportSr6Runners(fixtureCatalog(), data, cr, [career()], OPTS).runners![0]
    expect(r.ledger.map(e => e.type)).toEqual(['finalize', 'earn', 'advance', 'advance', 'advance', 'advance', 'note'])
    expect(r.ledger[0]).toEqual({ at: '2026-10-03T12:00:00.000Z', type: 'finalize', summary: 'Creation finished', karma: 31, nuyen: 4350 })
    expect(r.ledger[1].summary).toBe('Earned: Made-up run (2026-10-04)')
    expect(r.ledger.at(-1)).toMatchObject({ summary: 'Owes Fixer Fred a favour', karma: 0, nuyen: 0 })
    expect(r.ledger.some(e => e.summary.includes('Soft Echo'))).toBe(false)
  })
  test('portrait and token: null when none, the data URL when set', () => {
    const { data, cr } = made(), ch = career()
    expect(exportSr6Runners(fixtureCatalog(), data, cr, [ch], OPTS).runners![0]).toMatchObject({ portrait: null, token: null })
    ch.identity.portrait = 'data:image/png;base64,iVBORw0KGgo='
    const f = exportSr6Runners(fixtureCatalog(), data, cr, [ch], OPTS)
    expect(f.runners![0]).toMatchObject({ portrait: ch.identity.portrait, token: null })
    expect(schema(f), JSON.stringify(schema.errors)).toBe(true)
  })
})

describe('entryValues', () => {
  const e = (attrs: Record<string, string>, kind = 'weapons') => ({ id: 'x.y', kind, name: 'Made-Up', source: 'X', page: 1, attrs, parts: [], text: '' }) as never
  test('reads printed values at a rating', () => {
    expect(entryValues(e({ category: 'Zappers', dv: '3S(e)', ar: '9/7/—/—/—', modes: 'SA/BF', ammo: '12(c)', cost: 'Rating × 100', rating: '2-6', avail: '3(L)' })))
      .toEqual({ rating: 2, cost: 200, avail: 3, legality: 'L', dv: 3, stun: true, ar: [9, 7, null, null, null], modes: ['SA', 'BF'], ammo: 12 })
    expect(entryValues(e({ cost: 'Rating × 100', rating: '2-6' }), 4)).toEqual({ rating: 4, cost: 400 })
  })
  test('a value it can’t read is absent, never NaN', () => {
    const v = entryValues(e({ category: 'Zappers', cost: 'ask your fixer', dv: '—' }))
    expect(v).not.toHaveProperty('cost'); expect(v).not.toHaveProperty('dv')
    expect(JSON.stringify(v)).not.toMatch(/NaN|null/)
  })
  test('vehicle pairs', () => {
    expect(entryValues(e({ category: 'Made-up bikes', handling: '4/3', topSpeed: '120', seats: '1' }, 'vehicles')).vehicle)
      .toEqual({ handling: [4, 3], topSpeed: 120, seats: 1 })
    expect(entryValues(e({ accel: '10', armor: '2' }, 'vehicles')).vehicle).toEqual({ accel: [10, 10], armor: 2 })
  })
  test('per kind: a spell’s drain, an adept power’s cost, a form’s fade, a quality’s karma', () => {
    expect(entryValues(e({ dv: '3', damage: 'P' }, 'spells'))).toEqual({ drain: 3 })
    expect(entryValues(e({ cost: '0.25' }, 'adeptpowers'))).toEqual({ powerCost: 0.25 })
    expect(entryValues(e({ fade: '3' }, 'complexforms'))).toEqual({ fade: 3 })
    expect(entryValues(e({ karma: '4', kind: 'positive' }, 'qualities'))).toEqual({ karma: 4 })
    expect(entryValues(e({ threshold: 'Force' }, 'rituals'))).toEqual({})
    expect(entryValues(e({ capacity: '[2]', cost: '100' }, 'gear'))).toEqual({ capacity: 2, cost: 100 })
  })
})

describe('SR6 export: books', () => {
  test('ticked books, every kind, valid; descriptions follow the toggle', () => {
    const c = fixtureCatalog(), { data } = made(), id = [...c.sources.keys()][0]
    const on = exportSr6Books(c, data, [id, 'NOPE'], OPTS), off = exportSr6Books(c, data, [id], { ...OPTS, descriptions: false })
    expect(schema(on), JSON.stringify(schema.errors)).toBe(true)
    expect(on).toMatchObject({ kind: 'books', descriptions: true })
    expect(on.books!.map(b => b.source)).toEqual([{ id, name: c.sources.get(id)!.name, publisher: c.sources.get(id)!.publisher, canon: true }])
    expect(on.books![0].entries.every(e => e.source === id)).toBe(true)
    expect(new Set(on.books![0].entries.map(e => e.kind)).size).toBeGreaterThan(20)
    expect(on.books![0].entries.find(e => e.id === 'crb.zap-gun')).toMatchObject({ kind: 'weapons', canon: true, values: { cost: 290, dv: 3, stun: false } })  // the edits layer's price
    expect(on.books![0].entries.some(e => 'description' in e)).toBe(true)
    expect(off.books![0].entries.some(e => 'description' in e)).toBe(false)
    expect(off.descriptions).toBe(false)
  })
  test('a being entry carries its npc block', () => {
    const c = fixtureCatalog(), { data } = made(), b = exportSr6Books(c, data, [...c.sources.keys()], OPTS).books!
    const spirit = b.flatMap(x => x.entries).find(e => e.kind === 'spirits')!
    expect(spirit.npc).toMatchObject({ kind: 'spirit', rating: 1 })
    const goon = b.flatMap(x => x.entries).find(e => e.id === 'crb.corner-goon')!
    expect(goon.npc).toMatchObject({ kind: 'grunt', rating: 2, group: 'Street Crew', from: { id: 'crb.corner-goon', source: 'CRB' } })
    expect(b.flatMap(x => x.entries).find(e => e.kind === 'weapons')).not.toHaveProperty('npc')
  })
  test('a contact NPC goes out as a grunt of group Contact (v1’s kinds), and the file validates', () => {
    const { data, cr } = made(), ch = blankSr6Npc('contact')
    ch.identity.streetName = 'Made-up Fence'
    const f = exportSr6Runners(fixtureCatalog(), data, cr, [ch], OPTS)
    expect(f.runners![0].npc).toMatchObject({ kind: 'grunt', group: 'Contact' })
    expect(f.runners![0].npc).not.toHaveProperty('rating')
    expect(schema(f), JSON.stringify(schema.errors)).toBe(true)
  })
})
describe('SR6 export: compendium', () => {
  test('one book marked compendium, own text, its NPCs', () => {
    // a made-up compendium: source STREET, one weapon with text, one embedded grunt (S4 Task 2's shape)
    const { data, cr } = made(), c = fixtureCatalog()
    const comp = { id: 'a1b2c3d4e5f6', name: 'Street Kit', source: 'STREET', sharing: 'private', updatedAt: OPTS.now, ownerName: 'Gil Made-up',
      entries: [{ id: 'street.zapper', kind: 'weapons', name: 'Zapper', source: 'STREET', page: 1, attrs: { category: 'Zappers', dv: '2S' }, parts: [], text: 'Made-up.' }],
      npcs: [grunt()] } as Sr6Compendium
    const f = exportSr6Compendium(c, data, cr, comp, { ...OPTS, descriptions: false })
    expect(schema(f), JSON.stringify(schema.errors)).toBe(true)
    expect(f).toMatchObject({ kind: 'books', descriptions: true })
    expect(f.books![0].source).toEqual({ id: 'STREET', name: 'Street Kit', publisher: 'Gil Made-up', canon: false, compendium: true })
    expect(f.books![0].entries[0]).toMatchObject({ canon: false, description: 'Made-up.', values: { dv: 2, stun: true } })
    expect(f.books![0].npcs![0].npc?.kind).toBe('grunt')
  })
  test('a compendium whose source id is now a book’s never goes out as that book', () => {
    const { data, cr } = made(), c = fixtureCatalog()
    const comp = { id: 'a1b2c3d4e5f6', name: 'Street Kit', source: 'CRB', sharing: 'private', updatedAt: OPTS.now, ownerName: 'Gil Made-up',
      entries: [], npcs: [] } as unknown as Sr6Compendium
    expect(c.sources.get('CRB')?.canon).toBe(true)
    expect(exportSr6Compendium(c, data, cr, comp, OPTS).books![0].source)
      .toEqual({ id: 'CRB', name: 'Street Kit', publisher: 'Gil Made-up', canon: false, compendium: true })
  })
})

describe('the Foundry module’s samples (tests/sr6/samples.ts)', () => {
  const w = sampleWorld()
  const files = () => ({
    'test-runners.json': exportSr6Runners(w.c, w.data, w.cr, [mara(w), ganger()], SAMPLE_OPTS),
    'test-books.json': exportSr6Books(w.c, w.data, ['MUS', 'MUX'], SAMPLE_OPTS),
    'test-compendium.json': exportSr6Compendium(w.c, w.data, w.cr, streetKit(), SAMPLE_OPTS),
  })
  test('each is valid, with no NaN or null where a number belongs', () => {
    for (const [name, f] of Object.entries(files())) {
      expect(schema(f), `${name}: ${JSON.stringify(schema.errors)}`).toBe(true)
      expect(JSON.stringify(f)).not.toMatch(/NaN/)
    }
  })
  test('Mara as the engine sees her', () => {
    const r = files()['test-runners.json'].runners![0]
    expect(r.attributes.rea).toEqual({ natural: 4, augmented: 5 })
    expect(r.attributes.mag.natural).toBe(5)
    expect(r).toMatchObject({ edge: 3, karma: 7, nuyen: 1234, metatype: { id: 'mus.elf', name: 'Elf' } })
    expect(r.derived).toMatchObject({ initiative: { base: 9, dice: 3 }, monitors: { physical: 11, stun: 10, overflow: 3 }, defenseRating: 7 })  // Made-up Tough, the booster's +1
    const booster = r.purchases.find(x => x.uid === 'c1')!
    expect(booster.values).toMatchObject({ rating: 1, cost: 1200, essence: 0.12, avail: 4, legality: 'I' })
    expect(booster.accessories[0].values).toMatchObject({ capacity: 1, cost: 100 })
    expect(r.lifestyle).toEqual({ id: 'mus.made-up-squat', name: 'Made-up Hideout', months: 2, cost: 450 })
  })
  test('MUS has every kind; MUX only priorities and metatypes; the compendium’s grunt has its token', () => {
    const [m, x] = files()['test-books.json'].books!
    expect(new Set(m.entries.map(e => e.kind)).size).toBe(29)  // every exported kind but attributes
    expect(x.entries.map(e => e.kind)).toEqual(['priorities', 'metatypes'])
    const comp = files()['test-compendium.json'].books![0]
    expect(comp.source).toEqual({ id: 'STREET', name: 'Street Kit', publisher: 'Gil Made-up', canon: false, compendium: true })
    expect(comp.npcs![0]).toMatchObject({ id: 'street-npc-1', streetName: 'Street Tough', portrait: null, token: expect.stringMatching(/^data:image\/jpeg;base64,/) })
  })
  test.runIf(process.env.WRITE_SR6_SAMPLES)('writes the module samples', () => {
    for (const [name, f] of Object.entries(files())) writeFileSync(join(process.env.WRITE_SR6_SAMPLES!, name), JSON.stringify(f, null, 1) + '\n')
  })
})

describe('SR6 export: what Eden takes besides the numbers', () => {
  const w = sampleWorld(), r = () => exportSr6Runners(w.c, w.data, w.cr, [mara(w)], SAMPLE_OPTS).runners![0]
  test('a quality’s printed effects and tests; a conditional one marked low', () => {
    const q = r().qualities.find(x => x.id === 'mus.lucky-break')!
    expect(q.effects).toEqual([{ target: 'attr:agi', op: 'add', value: '1' }, { target: 'skill:firearms', op: 'add', value: '2', low: true },
      { target: 'derived:defense', op: 'add', value: '1' }])
    expect(q.tests).toEqual([{ skill: 'skill:perception', attr: 'attr:int', threshold: 3 }])
    expect(r().qualities.find(x => x.id === 'mur.night-eyes')).not.toHaveProperty('effects')
  })
  test('an accessory’s effect on its host, under the host', () => {
    const sight = r().purchases.find(x => x.uid === 'w1')!.accessories[0]
    expect(sight).toMatchObject({ id: 'mus.made-up-sight', attrs: { accessoryOf: 'mus.pocket-zapper' },
      effects: [{ target: 'item:ar', op: 'add', value: '0,1,1,0,0' }] })
  })
  test('a Defense Rating bonus goes out with the others', () => {
    expect(r().purchases.find(x => x.uid === 'c1')!.bonuses).toContainEqual({ target: 'defense', value: 1 })
  })
  test('the monitor bonus (Built Tough’s boxes) and a contact’s types', () => {
    const x = r()
    expect(x.derived?.monitorBonus).toEqual({ physical: 1, stun: 0 })
    expect(x.derived?.monitors.physical).toBe(11)
    expect(x.contacts[0].types).toEqual(['street'])
  })
  test('an entry’s earlier ids (aliases), the kind only when it was another', () => {
    const x = r()
    expect(x.purchases.find(p => p.uid === 'g2')!.aliases).toEqual([{ id: 'mus.glitter-line' }])
    expect(x.purchases.find(p => p.uid === 'w1')!.accessories[0].aliases).toEqual([{ id: 'mus.old-sight', kind: 'weapons' }])
    expect(x.purchases.find(p => p.uid === 'w1')).not.toHaveProperty('aliases')
  })
  test('a book entry carries its effects too, and the file validates', () => {
    const f = exportSr6Books(w.c, w.data, ['MUS'], SAMPLE_OPTS)
    expect(f.books![0].entries.find(e => e.id === 'mus.made-up-sight')!.effects).toEqual([{ target: 'item:ar', op: 'add', value: '0,1,1,0,0' }])
    expect(schema(f), JSON.stringify(schema.errors)).toBe(true)
  })
})

describe('SR6 export: augmentation types', () => {
  const ware = (type: string) => ({ id: 'mus.x', kind: 'augmentations' as const, name: 'Made-up Ware', source: 'MUS', page: 1,
    attrs: { type, category: 'made-up' }, parts: [], text: '' })
  test('geneware, symbionts and transgenics go as bioware, nanoware as cyberware, the printed type kept in ware', () => {
    expect(['geneware', 'symbionts', 'transgenics', 'nanoware', 'bioware', 'cyberware'].map(t => exportAttrs(ware(t))))
      .toEqual([{ type: 'bioware', ware: 'geneware', category: 'made-up' }, { type: 'bioware', ware: 'symbionts', category: 'made-up' },
        { type: 'bioware', ware: 'transgenics', category: 'made-up' }, { type: 'cyberware', ware: 'nanoware', category: 'made-up' },
        { type: 'bioware', category: 'made-up' }, { type: 'cyberware', category: 'made-up' }])
  })
})
