// Buying N of one stacking item is ONE line with a count: at creation (purchase qty) and on the career Ledger (purchase qty,
// then the quantity op raises or lowers it, paying or crediting the difference). Weapons and the like stay one line each.
import { expect, test } from 'vitest'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { balances, currentBuild, preview, record } from '../../../src/sr6/runner-builder/domain/career/career'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { blankSr6, type Sr6Advance } from '../../../src/sr6/formats/domain/character'
import { buildOf, GLIM, made } from '../catalog/fixture'

const NOW = '2026-10-06T10:00:00.000Z'
const buy = (qty: number, kind: 'gear' | 'weapons' = 'gear', id = 'crb.zap-scope'): Sr6Advance => ({
  op: 'purchase',
  line: { uid: '', kind, id, qty, accessories: [] },
})
function runner() {
  const ch = blankSr6('karma', 'c1', NOW)
  ch.build = buildOf('karma', { metatype: GLIM })
  ch.identity.metatype = GLIM
  ch.finalizedAt = NOW
  ch.final = { karma: 100, nuyen: 5000 }
  ch.ledger = [{ id: 'f1', at: NOW, type: 'finalize', karma: 100, nuyen: 5000 }]
  return ch
}
const ok = (r: ReturnType<typeof record>) => {
  if (!r.ok) throw new Error(r.reason)
  return r.ch
}

test('creation: one purchase of 40 is one line with a count', () => {
  const { data, cr } = made()
  const b = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  expect(apply(b, { op: 'purchase', kind: 'gear', id: 'crb.zap-scope', qty: 40 }, data, cr)).toEqual({ ok: true })
  expect(b.purchases.map(x => x.qty)).toEqual([40])
  expect(apply(b, { op: 'quantity', uid: b.purchases[0].uid, qty: 12 }, data, cr)).toEqual({ ok: true })
  expect(b.purchases[0].qty).toBe(12)
})

test('career: a count is priced unit x qty; the quantity op pays or credits the difference', () => {
  const { data, cr } = made()
  let ch = runner()
  const one = preview(ch, buy(1), data, cr)
  if (!one.ok || !one.nuyen) throw new Error('fixture item needs a price')
  expect(preview(ch, buy(5), data, cr)).toMatchObject({ ok: true, nuyen: one.nuyen * 5 })
  ch = ok(record(ch, buy(5), data, cr))
  const line = currentBuild(ch).purchases[0]
  expect(currentBuild(ch).purchases).toHaveLength(1)
  expect(balances(ch).nuyen).toBe(5000 - one.nuyen * 5)
  ch = ok(record(ch, { op: 'quantity', target: line.uid, qty: 8 }, data, cr))
  expect(currentBuild(ch).purchases[0].qty).toBe(8)
  expect(balances(ch).nuyen).toBe(5000 - one.nuyen * 8)
  ch = ok(record(ch, { op: 'quantity', target: line.uid, qty: 2 }, data, cr))
  expect(balances(ch).nuyen).toBe(5000 - one.nuyen * 2)
  expect(preview(ch, { op: 'quantity', target: line.uid, qty: 2 }, data, cr)).toEqual({ ok: false, reason: 'unchanged' })
  expect(preview(ch, { op: 'quantity', target: line.uid, qty: 0 }, data, cr)).toEqual({ ok: false, reason: 'below-one' })
  // survives export and import
  const back = xmlToSr6(sr6ToXml(ch))
  if (!back.ok) throw new Error(back.reason)
  expect(currentBuild(back.character).purchases[0].qty).toBe(2)
})

test('career: a weapon is its own line, so a count on it is refused', () => {
  const { data, cr } = made()
  expect(preview(runner(), buy(2, 'weapons', 'crb.zap-gun'), data, cr)).toEqual({ ok: false, reason: 'own-line' })
})
