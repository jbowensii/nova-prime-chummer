// Old catalog ids (owner decision D2): an entry's <alias id kind> in the made-up fixture resolves its old id, and a saved
// runner's old ids are turned into the new ones once, each recorded.
import { expect, test } from 'vitest'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/formats/domain/charxml'
import { sr6Data } from '../../src/sr6/catalog/domain/data'
import { resolveEntry } from '../../src/sr6/catalog/domain/load'
import { migrateSr6Ids } from '../../src/sr6/engine/migrate'
import { blankBuild, type Sr6Character } from '../../src/sr6/formats/domain/character'
import { fixtureCatalog } from './catalog/fixture'

const c = fixtureCatalog()
const runner = (over: Partial<Sr6Character['build']> = {}): Sr6Character => ({
  formatVersion: 1,
  id: 'r1',
  identity: { name: '', streetName: 'Zip', metatype: '', background: '', notes: '' },
  build: { ...blankBuild('priority'), ...over },
  ledger: [],
  overrides: [],
  updatedAt: '2026-10-06T00:00:00.000Z',
})

test('an old id resolves to the entry that holds it as an alias, across kinds; a current id is never shadowed', () => {
  expect(c.moved.get('gear/crb.fizz-rounds')).toEqual({ kind: 'ammotypes', id: 'crb.fizz-rounds' })
  expect(resolveEntry(c, 'gear', 'crb.fizz-rounds')?.name).toBe('Fizz Rounds')
  expect(resolveEntry(c, 'augmentations', 'crb.spring-tendons-1-4')?.id).toBe('crb.spring-tendons')
  expect(sr6Data(c).entry('gear', 'crb.fizz-rounds')?.kind).toBe('ammotypes')
  expect(resolveEntry(c, 'gear', 'crb.no-such-thing')).toBeUndefined()
  expect(resolveEntry(c, 'augmentations', 'crb.spring-tendons')!.parts.map(p => p.tag)).not.toContain('alias')
  expect(c.entries.augmentations.get('crb.spring-tendons.2')!.parts.map(p => p.tag)).not.toContain('alias')
})

test('a runner’s old ids become the new ones, accessories and ledger lines too, recorded once', () => {
  const old = runner({
    purchases: [
      { uid: 'g1', kind: 'gear', id: 'crb.fizz-rounds', qty: 2, accessories: [] },
      { uid: 'g2', kind: 'weapons', id: 'crb.zap-gun', qty: 1, accessories: [{ uid: 'g3', kind: 'gear', id: 'crb.fizz-rounds', qty: 1, accessories: [] }] },
      { uid: 'g4', kind: 'augmentations', id: 'crb.spring-tendons-1-4', rating: 2, qty: 1, accessories: [] },
      { uid: 'g5', kind: 'gear', id: 'crb.gone-for-good', qty: 1, accessories: [] },
    ],
  })
  const ch = migrateSr6Ids(old, c, '2026-10-06T01:00:00.000Z')
  expect(ch.build.purchases.map(p => `${p.kind}/${p.id}`)).toEqual([
    'ammotypes/crb.fizz-rounds',
    'weapons/crb.zap-gun',
    'augmentations/crb.spring-tendons.2',
    'gear/crb.gone-for-good',
  ])
  expect(ch.build.purchases[2].rating).toBeUndefined() // (the level's entry carries it: levels.ts)
  expect(ch.build.purchases[1].accessories[0]).toMatchObject({ kind: 'ammotypes', id: 'crb.fizz-rounds' })
  expect(ch.build.purchases[0].qty).toBe(2)
  expect(ch.migrated?.map(m => `${m.from} → ${m.to}`)).toEqual([
    'gear/crb.fizz-rounds → ammotypes/crb.fizz-rounds',
    'gear/crb.fizz-rounds → ammotypes/crb.fizz-rounds',
    'augmentations/crb.spring-tendons-1-4 → augmentations/crb.spring-tendons.2',
  ])
  expect(migrateSr6Ids(ch, c)).toBe(ch) // once: nothing left to turn
  const back = xmlToSr6(sr6ToXml(ch))
  expect(back.ok && back.character.migrated).toEqual(ch.migrated)
})

test('an alias to a kind the line can’t hold leaves the line as it is', () => {
  const k = fixtureCatalog()
  k.moved.set('gear/crb.old-rule', { kind: 'rules', id: [...k.entries.rules.keys()][0] })
  const old = runner({ purchases: [{ uid: 'g1', kind: 'gear', id: 'crb.old-rule', qty: 1, accessories: [] }] })
  expect(migrateSr6Ids(old, k)).toBe(old)
})
