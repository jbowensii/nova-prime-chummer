// Owner requests of 2026-10-16 in the SR6 engine, on the made-up fixture: the Awakened override after creation (a free
// ledger spend). Invented numbers.
import { expect, test } from 'vitest'
import { currentBuild, preview, record, validateCareer, voidEntry } from '../../src/sr6/engine/career'
import { blankSr6, type Sr6Character } from '../../src/sr6/model/character'
import { buildOf, GLIM, made } from './fixture'

const NOW = '2026-10-16T10:00:00.000Z'
/** A finalized karma-build Glimmerkin with 100 karma and 5,000¥. */
function runner(): Sr6Character {
  const ch = blankSr6('karma', 'c1', NOW)
  ch.build = buildOf('karma', { metatype: GLIM, magic: 'mundane' })
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

test('after creation the Awakened override is a free ledger spend, warned in career Review, voided or set back to derived', () => {
  const { data, cr } = made(),
    ch = runner()
  expect(preview(ch, { op: 'awakened' }, data, cr)).toEqual({ ok: false, reason: 'already-known' })
  expect(preview(ch, { op: 'awakened', value: true }, data, cr)).toEqual({
    ok: true,
    label: 'Awakened override: Awakened (derived: not Awakened)',
    karma: 0,
    nuyen: 0,
  })
  const on = ok(record(ch, { op: 'awakened', value: true }, data, cr, undefined, NOW))
  expect(currentBuild(on).awakened).toBe(true)
  expect(ch.build.awakened).toBeUndefined() // (the finalized build stays as it was)
  expect(validateCareer(data, cr, on).find(v => v.code === 'awakened.override')).toMatchObject({
    severity: 'warning',
    message: expect.stringMatching(/overridden to Awakened/),
  })
  expect(preview(on, { op: 'awakened', value: true }, data, cr)).toEqual({ ok: false, reason: 'already-known' })
  // (reversible: void it, or record derived again)
  const voided = ok(voidEntry(on, on.ledger.at(-1)!.id, 'Oops', NOW))
  expect(currentBuild(voided).awakened).toBeUndefined()
  const back = ok(record(on, { op: 'awakened' }, data, cr, undefined, NOW))
  expect(back.ledger.at(-1)).toMatchObject({ label: expect.stringMatching(/^Awakened: derived again \(not Awakened/), karma: 0 })
  expect(currentBuild(back).awakened).toBeUndefined()
  expect(validateCareer(data, cr, back).some(v => v.code === 'awakened.override')).toBe(false)
})
