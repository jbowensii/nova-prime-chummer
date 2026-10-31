// Which SIN an owned item is registered to is free and editable any time: after finalizing it is a ledger entry that
// costs nothing, voidable, replayed by currentBuild and kept through the character file.
import { expect, test } from 'vitest'
import { balances, currentBuild, preview, record, voidEntry } from '../../../src/sr6/runner-builder/domain/career/career'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'
import { buildOf, GLIM, made } from '../catalog/fixture'

test('after finalizing, registering an item to a SIN (or none) is a free ledger entry that replays, voids and round-trips', () => {
  const { data, cr } = made(),
    ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'mundane' })
  ch.build.sins = [{ uid: 's1', name: 'Pat Roe', kind: 'fake', rating: 3, licences: [] }]
  ch.build.purchases = [{ uid: 'g1', kind: 'gear', id: 'crb.tangle-rope.1', name: 'Tangle Rope', qty: 1, accessories: [] }]
  Object.assign(ch, { finalizedAt: '2026-10-16T00:00:00Z', final: { karma: 4, nuyen: 1000 } })
  ch.ledger = [{ id: 'f1', at: '2026-10-16T00:00:00Z', type: 'finalize', karma: 4, nuyen: 1000 }]
  expect(preview(ch, { op: 'assign', target: 'g1', sin: 's1' }, data, cr)).toMatchObject({ ok: true, karma: 0, nuyen: 0 })
  expect(preview(ch, { op: 'assign', target: 'g1', sin: 'gone' }, data, cr)).toEqual({ ok: false, reason: 'unknown-line' })
  expect(preview(ch, { op: 'assign', target: 'g1' }, data, cr)).toEqual({ ok: false, reason: 'unchanged' })
  const r = record(ch, { op: 'assign', target: 'g1', sin: 's1' }, data, cr)
  if (!r.ok) throw new Error(r.reason)
  expect(currentBuild(r.ch).purchases[0].sin).toBe('s1')
  expect(balances(r.ch)).toMatchObject({ karma: 4, nuyen: 1000 }) // free
  const back = xmlToSr6(sr6ToXml(r.ch))
  if (!back.ok) throw new Error(back.reason)
  expect(back.character.ledger.at(-1)).toMatchObject({ advance: { op: 'assign', target: 'g1', sin: 's1' } })
  const u = record(r.ch, { op: 'assign', target: 'g1' }, data, cr)
  if (!u.ok) throw new Error(u.reason)
  expect(currentBuild(u.ch).purchases[0].sin).toBeUndefined()
  const v = voidEntry(u.ch, u.ch.ledger.at(-1)!.id, 'Oops')
  expect(v.ok && currentBuild(v.ch).purchases[0].sin).toBe('s1')
})
