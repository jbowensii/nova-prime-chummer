// The SR6 runners page's pure helpers (src/sr6/ui/repo.ts): import refuses an Anarchy runner with where it belongs and
// gives a taken id a new one; repair lists its changes; export snapshots every catalog line. All names made up.
import { expect, test } from 'vitest'
import { sr6ToXml } from '../../src/sr6/engine/charxml'
import { blankSr6 } from '../../src/sr6/model/character'
import { readSr6Import, repairSr6, snapshotSr6 } from '../../src/sr6/ui/repo'
import { fixtureCatalog } from '../sr6/fixture'

const CA2 = '<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="a" metatype="elf" level="runner" updatedAt="x"><build><attributes str="1" agi="1" wil="1" log="1" cha="1"/></build></ca2:character>'

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
  const c = fixtureCatalog(), ch = runner()
  const gun = [...c.entries.weapons.values()][0], scope = [...c.entries.gear.values()].find(e => e.name === 'Zap Scope')!
  ch.build.purchases.push({ uid: 'w', kind: 'weapons', id: gun.id, qty: 1, accessories: [{ uid: 'a', kind: 'gear', id: scope.id, qty: 1, accessories: [] }] },
    { uid: 'c', kind: 'gear', name: 'Lucky Coin', cost: 5, qty: 1, accessories: [] })
  const out = snapshotSr6(c, ch)
  expect(out.build.purchases[0].snapshot?.name).toBe(gun.name)
  expect(out.build.purchases[0].accessories[0].snapshot?.name).toBe('Zap Scope')
  expect(out.build.purchases[1].snapshot).toBeUndefined()
  expect(ch.build.purchases[0].snapshot).toBeUndefined() // the runner itself is left alone
})
