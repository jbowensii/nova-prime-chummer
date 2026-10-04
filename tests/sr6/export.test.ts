// SR6 export v1 (docs/sr6-export-format.md): runners and NPCs as the SR6 engine sees them, on the made-up fixture.
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, test } from 'vitest'
import { balances, currentBuild, deriveSr6, entryValues, exportSr6Runners, priced } from '../../src/sr6/engine'
import { xmlToSr6 } from '../../src/sr6/engine/charxml'
import type { Sr6Purchase } from '../../src/sr6/model/character'
import { made, fixtureCatalog } from './fixture'

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
  })
})
