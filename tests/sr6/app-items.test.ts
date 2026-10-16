// Owner requests of 2026-10-16 in the SR6 engine, on the made-up fixture: the Awakened override after creation (a free
// ledger spend); No Future's Stolen Gear as its errata has it. Invented numbers.
import { expect, test } from 'vitest'
import { currentBuild, preview, record, stolenLeft, validateCareer, voidEntry } from '../../src/sr6/engine/career'
import { apply } from '../../src/sr6/engine/actions'
import { allBudgets, nuyenPerKarma, toNuyen } from '../../src/sr6/engine/budgets'
import { makeProvider } from '../../src/sr6/engine/providers'
import { validateSr6 } from '../../src/sr6/engine/rules'
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

// No Future's Stolen Gear as its errata has it (NF p. 162): a made-up negative quality stands in for it, invented numbers
const STOLEN = { stolenGearQuality: 'crb.butterfingers', karmaToNuyenRateStolenGear: 9000, karmaToNuyenMaxStolenGear: 4, stolenGearBuyOff: 3 }
const stolenRules = () => made({ rules: STOLEN, unset: ['karmaToNuyenCap', 'karmaToNuyenMax'] })

test('Stolen Gear: its own nuyen per karma and limit at any rate, refused past it; never with In Debt (a Review error)', () => {
  const { data, cr } = stolenRules()
  const b = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  for (let i = 0; i < 5; i++) expect(apply(b, { op: 'karmaToNuyen', delta: 1 }, data, cr)).toEqual({ ok: true }) // (no limit yet)
  expect(apply(b, { op: 'quality', id: 'crb.butterfingers' }, data, cr)).toEqual({ ok: true })
  expect(nuyenPerKarma(b, cr, data)).toBe(9000)
  expect(toNuyen(b, cr, data)).toBe(4) // (5 converted, 4 count: no more at any rate)
  const p = makeProvider(b.method, data, cr)
  expect(allBudgets(b, data, cr, p).nuyen.breakdown?.find(l => l.key === 'fromKarma')?.amount).toBe(36000)
  expect(apply(b, { op: 'karmaToNuyen', delta: -2 }, data, cr)).toEqual({ ok: true })
  expect(apply(b, { op: 'karmaToNuyen', delta: 1 }, data, cr)).toEqual({ ok: true })
  expect(apply(b, { op: 'karmaToNuyen', delta: 1 }, data, cr)).toEqual({ ok: false, reason: 'conversion-cap' })
  const ch = blankSr6('priority', 'r1', NOW)
  ch.build = b
  expect(validateSr6(data, cr, ch).some(v => v.code === 'quality.stolenGearInDebt')).toBe(false)
  expect(apply(b, { op: 'quality', id: 'crb.deep-pockets-debt' }, data, cr)).toEqual({ ok: true }) // (taken anyway)
  expect(validateSr6(data, cr, ch).find(v => v.code === 'quality.stolenGearInDebt')).toMatchObject({
    severity: 'error',
    message: 'Butterfingers and Deep Pockets Debt: a runner can’t have both.',
  })
})

test('Stolen Gear after creation: bought off a part at a time at stolenGearBuyOff a converted karma, the last part removing it', () => {
  const { data, cr } = stolenRules(),
    ch = runner()
  ch.build.karmaToNuyen = 4
  ch.build.qualities = [{ uid: 'sg', id: 'crb.butterfingers', level: 1 }]
  expect(preview(ch, { op: 'buyoff', target: 'sg', part: 5 }, data, cr)).toEqual({ ok: false, reason: 'more-than-left' })
  expect(preview(ch, { op: 'buyoff', target: 'sg', part: 0 }, data, cr)).toEqual({ ok: false, reason: 'below-one' })
  const one = ok(record(ch, { op: 'buyoff', target: 'sg', part: 1 }, data, cr, undefined, NOW))
  expect(one.ledger.at(-1)).toMatchObject({ label: 'Buy off: Butterfingers, 1 of 4 converted karma', karma: 3 })
  expect(currentBuild(one).qualities).toEqual([{ uid: 'sg', id: 'crb.butterfingers', level: 1, boughtOff: 1 }])
  expect(stolenLeft(currentBuild(one), cr, data, currentBuild(one).qualities[0])).toBe(3)
  // (all that is left: the line goes, the spend recorded as a whole buy off)
  const rest = ok(record(one, { op: 'buyoff', target: 'sg', part: 3 }, data, cr, undefined, NOW))
  expect(rest.ledger.at(-1)).toMatchObject({ label: 'Buy off: Butterfingers, 3 of 3 converted karma', karma: 9, advance: { op: 'buyoff', target: 'sg' } })
  const last = rest.ledger.at(-1)!
  expect(last.type === 'advance' && Object.keys(last.advance)).not.toContain('part')
  expect(currentBuild(rest).qualities).toEqual([])
  // (another negative quality has no parts)
  ch.build.qualities.push({ uid: 'dd', id: 'crb.deep-pockets-debt', level: 1 })
  expect(preview(ch, { op: 'buyoff', target: 'dd', part: 1 }, data, cr)).toEqual({ ok: false, reason: 'not-a-part' })
  // (nothing converted: it goes for nothing)
  ch.build.karmaToNuyen = 0
  expect(preview(ch, { op: 'buyoff', target: 'sg' }, data, cr)).toMatchObject({ ok: true, karma: 0 })
})
