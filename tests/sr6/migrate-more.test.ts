// Old catalog ids turned into new ones (src/sr6/engine/migrate.ts): every line a runner keeps an id on, and the ledger's
// recorded spends. Aliases are added to the made-up fixture here.
import { expect, test } from 'vitest'
import { migrateSr6Ids } from '../../src/sr6/engine/migrate'
import { blankBuild, type Sr6Advance, type Sr6Character, type Sr6LedgerEntry } from '../../src/sr6/model/character'
import { fixtureCatalog } from './fixture'

const ALIAS: Record<string, [string, string]> = {   // file → [text to follow, alias]
  'qualities.xml': ['<name>Knack</name>', '<alias id="crb.old-knack"/>'],
  'spells.xml': ['<name>Glow Ward</name>', '<alias id="crb.old-ward"/>'],
  'martialarts.xml': ['<name>Glow Fist</name>', '<alias id="crb.old-fist"/>'],
  'martialtechniques.xml': ['<name>Glow Jab</name>', '<alias id="crb.old-jab"/>'],
  'lifestyles.xml': ['<name>Cozy</name>', '<alias id="crb.old-cozy"/>'],
  'metatypes.xml': ['<name>Glimmerkin</name>', '<alias id="crb.old-glim"/>'],
}
const c = fixtureCatalog((file, xml) => {
  const hit = Object.entries(ALIAS).find(([f]) => file.endsWith(`crb/${f}`))
  return hit ? xml.replace(hit[1][0], hit[1][0] + hit[1][1]) : xml
})
const AT = '2026-10-06T01:00:00.000Z'
const runner = (over: Partial<Sr6Character['build']> = {}, ledger: Sr6LedgerEntry[] = []): Sr6Character => ({
  formatVersion: 1, id: 'r1', identity: { name: '', streetName: 'Zip', metatype: 'crb.old-glim', background: '', notes: '' },
  build: { ...blankBuild('priority'), ...over }, ledger, overrides: [], updatedAt: AT })
const adv = (id: string, advance: Sr6Advance): Sr6LedgerEntry => ({ id, at: AT, type: 'advance', advance, label: id, karma: 0, nuyen: 0 })

test('the alias fixture resolves every kind a line can hold', () => {
  expect(['qualities/crb.old-knack', 'spells/crb.old-ward', 'martialarts/crb.old-fist', 'martialtechniques/crb.old-jab', 'lifestyles/crb.old-cozy',
    'metatypes/crb.old-glim'].every(k => c.moved.has(k))).toBe(true)
})

test('a runner’s metatype, qualities, picks, martial arts and SIN lifestyles move to the entries that now hold them', () => {
  const old = runner({
    metatype: 'crb.old-glim',
    qualities: [{ uid: 'q1', id: 'crb.old-knack', level: 1 }, { uid: 'q2', id: 'crb.lucky-streak', level: 2 }, { uid: 'q3', id: 'crb.butterfingers', level: 1 }],
    picks: [{ uid: 'p1', kind: 'spells', id: 'crb.old-ward' }, { uid: 'p2', kind: 'spells', id: 'crb.mend-glow' }],
    martialArts: [{ uid: 'm1', id: 'crb.old-fist', techniques: [{ uid: 't1', id: 'crb.old-jab' }, { uid: 't2', id: 'crb.glow-jab' }] }],
    sins: [{ uid: 's1', name: 'Ann', kind: 'real', licences: [], lifestyles: [{ uid: 'l1', id: 'crb.old-cozy', months: 2 }, { uid: 'l2', id: 'crb.cozy', months: 1 }] },
      { uid: 's2', name: 'Bo', kind: 'real', licences: [] }],
  })
  const ch = migrateSr6Ids(old, c, AT)
  expect(ch.identity.metatype).toBe('crb.glimmerkin')
  expect(ch.build.metatype).toBe('crb.glimmerkin')
  // a leveled quality's parent id becomes the entry for its level, the level on the line then 1
  expect(ch.build.qualities.map(q => [q.id, q.level])).toEqual([['crb.knack', 1], ['crb.lucky-streak.2', 1], ['crb.butterfingers', 1]])
  expect(ch.build.picks.map(p => p.id)).toEqual(['crb.glow-ward', 'crb.mend-glow'])
  expect(ch.build.martialArts[0]).toMatchObject({ id: 'crb.glow-fist', techniques: [{ id: 'crb.glow-jab' }, { id: 'crb.glow-jab' }] })
  expect(ch.build.sins[0].lifestyles!.map(l => l.id)).toEqual(['crb.cozy', 'crb.cozy'])
  expect(ch.build.sins[1]).toBe(old.build.sins[1])
  expect(ch.migrated?.map(m => `${m.from} → ${m.to}`).sort()).toEqual([
    'lifestyles/crb.old-cozy → lifestyles/crb.cozy', 'martialarts/crb.old-fist → martialarts/crb.glow-fist',
    'martialtechniques/crb.old-jab → martialtechniques/crb.glow-jab', 'metatypes/crb.old-glim → metatypes/crb.glimmerkin',
    'qualities/crb.lucky-streak → qualities/crb.lucky-streak.2', 'qualities/crb.old-knack → qualities/crb.knack',
    'spells/crb.old-ward → spells/crb.glow-ward'])
  expect(ch.migrated!.every(m => m.at === AT)).toBe(true)
})

test('the ledger’s recorded spends move too: gear, drops, picks, initiations, styles, techniques, qualities and buy offs', () => {
  const old = runner({}, [
    { id: 'f', at: AT, type: 'finalize', karma: 10, nuyen: 10 },
    adv('a1', { op: 'purchase', line: { uid: 'g1', kind: 'gear', id: 'crb.fizz-rounds', qty: 1, accessories: [] } }),
    adv('a2', { op: 'drop', target: 'g1', line: { uid: 'g1', kind: 'gear', id: 'crb.fizz-rounds', qty: 1, accessories: [] } }),
    adv('a3', { op: 'drop', target: 'g9' }),
    adv('a4', { op: 'pick', line: { uid: 'p1', kind: 'spells', id: 'crb.old-ward' } }),
    adv('a5', { op: 'initiate', line: { uid: 'p2', kind: 'spells', id: 'crb.old-ward' } }),
    adv('a6', { op: 'initiate' }),
    adv('a7', { op: 'martialart', line: { uid: 'm1', id: 'crb.old-fist', techniques: [] } }),
    adv('a8', { op: 'technique', target: 'm1', line: { uid: 't1', id: 'crb.old-jab' } }),
    adv('a9', { op: 'quality', line: { uid: 'q1', id: 'crb.old-knack', level: 1 } }),
    adv('a10', { op: 'buyoff', target: 'q9', line: { uid: 'q9', id: 'crb.old-knack', level: 1 } }),
    adv('a11', { op: 'buyoff', target: 'q9' }),
    adv('a12', { op: 'attribute', target: 'bod' }),
    { id: 'n', at: AT, type: 'note', text: 'hello' },
  ])
  const ch = migrateSr6Ids(old, c, AT)
  const lines = ch.ledger.map(e => e.type === 'advance' ? ('line' in e.advance && e.advance.line ? (e.advance.line as { id: string }).id : e.advance.op) : e.type)
  expect(lines).toEqual(['finalize', 'crb.fizz-rounds', 'crb.fizz-rounds', 'drop', 'crb.glow-ward', 'crb.glow-ward', 'initiate', 'crb.glow-fist', 'crb.glow-jab',
    'crb.knack', 'crb.knack', 'buyoff', 'attribute', 'note'])
  // the ammunition line moved kinds, not ids
  const a1 = ch.ledger[1] as Extract<Sr6LedgerEntry, { type: 'advance' }>
  expect((a1.advance as Extract<Sr6Advance, { op: 'purchase' }>).line.kind).toBe('ammotypes')
  expect(ch.ledger[3]).toEqual(old.ledger[3])   // nothing to move: kept as it is
  expect(ch.ledger[13]).toBe(old.ledger[13])
})

test('a runner with nothing to move is returned as it is', () => {
  const same = runner({ metatype: 'crb.glimmerkin', qualities: [{ uid: 'q1', id: 'crb.knack', level: 1 }] })
  same.identity.metatype = 'crb.glimmerkin'
  expect(migrateSr6Ids(same, c)).toBe(same)
})
