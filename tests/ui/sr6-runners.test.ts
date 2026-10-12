// The SR6 runners page's pure helpers (src/sr6/ui/repo.ts): import refuses an Anarchy runner with where it belongs and
// gives a taken id a new one; repair lists its changes; export snapshots every catalog line. All names made up.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { sr6ToXml } from '../../src/sr6/engine/charxml'
import { blankSr6, type Sr6Character } from '../../src/sr6/model/character'
import { readSr6Import, readSr6NpcImport, repairSr6, snapshotSr6 } from '../../src/sr6/ui/repo'
import { samplesToLoad } from '../../src/sr6/ui/Runners'
import { fixtureCatalog } from '../sr6/fixture'

const CA2 =
  '<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="a" metatype="elf" level="runner" updatedAt="x"><build><attributes str="1" agi="1" wil="1" log="1" cha="1"/></build></ca2:character>'

const runner = () => {
  const ch = blankSr6('priority', 'zip-1', '2026-10-03T00:00:00.000Z')
  ch.identity.streetName = 'Zip'
  return ch
}

test('an Anarchy runner file is refused, saying where it belongs', () => {
  const r = readSr6Import(CA2, new Set())
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.reason).toBe('This is a Shadowrun Anarchy runner. Import it on the Anarchy side.')
})

test('an SR6 file imports; a taken id gets a new one', () => {
  const xml = sr6ToXml(runner())
  const free = readSr6Import(xml, new Set())
  expect(free.ok && free.ch.id).toBe('zip-1')
  const taken = readSr6Import(xml, new Set(['zip-1']))
  expect(taken.ok && taken.ch.id).not.toBe('zip-1')
  expect(taken.ok && taken.ch.identity.streetName).toBe('Zip')
  expect(taken.ok && taken.ch.lastExportedAt).toBeTruthy()
})

test('repair lists what it changed; a file it can’t read says why', () => {
  const ch = runner()
  ch.build.purchases.push({ uid: 'p1', kind: 'gear', id: 'crb.zap-pellets', qty: 2, accessories: [] })
  const broken = sr6ToXml(ch).replace('qty="2"', 'qty="x"')
  const r = repairSr6(broken)
  expect(r.ok).toBe(true)
  if (r.ok) {
    expect(r.ch.build.purchases).toHaveLength(0)
    expect(r.changes).toHaveLength(1)
    expect(r.changes[0]).toMatch(/^Dropped purchase 1: /)
  }
  const no = repairSr6(CA2)
  expect(no.ok).toBe(false)
  if (!no.ok) expect(no.reason).toMatch(/Anarchy side/)
})

test('export snapshots each catalog line and its accessories; a custom item has none', () => {
  const c = fixtureCatalog(),
    ch = runner()
  const gun = [...c.entries.weapons.values()][0],
    scope = [...c.entries.gear.values()].find(e => e.name === 'Zap Scope')!
  ch.build.purchases.push(
    { uid: 'w', kind: 'weapons', id: gun.id, qty: 1, accessories: [{ uid: 'a', kind: 'gear', id: scope.id, qty: 1, accessories: [] }] },
    { uid: 'c', kind: 'gear', name: 'Lucky Coin', cost: 5, qty: 1, accessories: [] },
  )
  const out = snapshotSr6(c, ch)
  expect(out.build.purchases[0].snapshot?.name).toBe(gun.name)
  expect(out.build.purchases[0].accessories[0].snapshot?.name).toBe('Zap Scope')
  expect(out.build.purchases[1].snapshot).toBeUndefined()
  expect(ch.build.purchases[0].snapshot).toBeUndefined() // the runner itself is left alone
})

// ---- S3: NPC files and the career ledger ----
const CAREER = readFileSync('tests/fixtures/sr6/runner-career.xml', 'utf8')
const GRUNT = readFileSync('tests/fixtures/sr6/npc-grunt.xml', 'utf8')

test('each import page refuses the other’s file, saying where it belongs', () => {
  expect(readSr6Import(GRUNT, new Set())).toEqual({ ok: false, reason: 'This is an NPC. Import it on NPCs & Critters.' })
  expect(readSr6NpcImport(CAREER, new Set())).toEqual({ ok: false, reason: 'This is a runner, not an NPC. Import it on Your runners.' })
  expect(readSr6NpcImport(CA2, new Set())).toEqual({ ok: false, reason: 'This is a Shadowrun Anarchy runner. Import it on the Anarchy side.' })
  expect(readSr6Import(CAREER, new Set()).ok).toBe(true)
})

test('an NPC imports; a taken id gets a new one; a ledger, finalize stamp and campaign are left behind', () => {
  const free = readSr6NpcImport(GRUNT, new Set())
  if (!free.ok) throw new Error(free.reason)
  expect(free.ch.npc?.kind).toBe('grunt')
  const id = free.ch.id
  const odd = GRUNT.replace(
    /(<sr6:character [^>]*)>/,
    '$1 finalizedAt="2026-10-03T00:00:00.000Z" finalKarma="3" finalNuyen="7" campaign="0123456789ab">',
  ).replace('</build>', '</build>\n  <ledger>\n    <entry id="x" at="y" type="note">Odd</entry>\n  </ledger>')
  const taken = readSr6NpcImport(odd, new Set([id]))
  if (!taken.ok) throw new Error(taken.reason)
  expect(taken.ch.id).not.toBe(id)
  expect(taken.ch).toMatchObject({ ledger: [], npc: free.ch.npc })
  for (const k of ['finalizedAt', 'final', 'campaign'] as const) expect(taken.ch[k], k).toBeUndefined()
})

test('export snapshots the purchase lines in the ledger too', () => {
  const r = readSr6Import(CAREER.replace(/<snapshot>[\s\S]*?<\/snapshot>/g, ''), new Set())
  if (!r.ok) throw new Error(r.reason)
  const lines = (ch: Sr6Character) => ch.ledger.flatMap(e => (e.type === 'advance' && e.advance.op === 'purchase' ? [e.advance.line] : []))
  expect(lines(r.ch)[0].snapshot).toBeUndefined()
  expect(lines(snapshotSr6(fixtureCatalog(), r.ch))[0].snapshot?.name).toBe('Zap Gun')
})

test('a book sample runner (the importer’s, tests/fixtures/sr6/sample-glow-runner.xml) reads as a runner', () => {
  const r = readSr6Import(readFileSync('tests/fixtures/sr6/sample-glow-runner.xml', 'utf8'), new Set())
  expect(r.ok).toBe(true)
  if (!r.ok) return
  const b = r.ch.build
  // none of B–D prints attribute points, so no priority assignment fits: Sum-to-Ten's repeated A does, with the prime
  // runner's doubled Karma assumed (the book doesn't say)
  expect([r.ch.identity.streetName, b.metatype, b.magic, b.method]).toEqual(['Glow Runner', 'crb.glimmerkin', 'adept', 'sumtoten'])
  expect(b.attributes.agi).toEqual({ points: 4, adjust: 0, karma: 0 })
  expect(b.skills).toEqual([{ id: 'crb.tinkering', points: 0, karma: 3, spec: 'Gizmos' }])
  expect(b.priorities).toEqual({ metatype: 'E', attributes: 'A', magic: 'A', skills: 'D', resources: 'D' })
  expect(r.ch.rules).toEqual([
    { key: 'levelPrime', value: 'true', assumed: true, source: 'CRB-HK', page: 63 },
    { key: 'expandedContacts', value: 'true', assumed: true, source: 'SWC', page: 161 },
  ])
  expect(b.purchases.map(x => x.id)).toEqual(['crb.padded-vest', 'crb.gizmo-kit', 'crb.glow-gland', 'crb.tail-obvious', 'crb.zoom-bike', 'crb.zap-gun'])
  expect(r.ch.printed).toMatchObject({ source: 'CRB', page: 81, values: { agi: '5(6)', init: '8 + 2D6', dr: '5' } })
  expect(b.sins).toHaveLength(2)
  expect(r.ch.identity.notes).toContain('Skills not in the catalog: Basket Weaving 2.')
})

test('Load example characters adds each sample once, by its key, even renamed', () => {
  const rows = [{ key: 'CRB|crb.glow-runner' }, { key: 'CRB|crb.bit-whisperer' }]
  const copy = { ...runner(), sampleKey: 'CRB|crb.glow-runner' }
  copy.identity = { ...copy.identity, streetName: 'Renamed' }
  expect(samplesToLoad(rows, [copy, runner()]).map(r => r.key)).toEqual(['CRB|crb.bit-whisperer'])
  expect(samplesToLoad(rows, [])).toHaveLength(2)
})
