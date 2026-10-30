// GM price-adjust at creation: priced() honors gmPrice for a vehicle/drone line, the gmprice op sets/clears it, and Review warns.
import { expect, test } from 'vitest'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { estimatedDp, priced } from '../../../src/sr6/runner-builder/domain/creation/purchases'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { boughtDesign } from '../../../src/sr6/runner-builder/domain/assets/design'
import { validateSr6, PRICE_APPROVAL } from '../../../src/sr6/runner-builder/domain/review/rules'
import { blankBuild, blankSr6 } from '../../../src/sr6/formats/domain/character'
import { designWorld } from './design-fixture'

const NOW = '2026-10-27T10:00:00.000Z'

test.each([
  ['vehicle', { kind: 'vehicle', chassis: 'zz.zip-frame', powertrain: 'zz.roller', console: 'zz.brainbox', options: [], mods: [] }],
  ['drone', { kind: 'drone', chassis: 'zz.gnat', options: [], mods: [] }],
] as const)('creation: a %s honors gmPrice, the op sets and clears it, Review warns', (_n, design) => {
  const { data, cr } = designWorld()
  const d = blankSr6('priority', 'des-1', NOW)
  d.design = design as never
  const b = blankBuild('priority')
  expect(apply(b, { op: 'design', line: boughtDesign(d, data, cr, 'v1') }, data, cr)).toEqual({ ok: true })
  const uid = b.purchases[0].uid
  const base = priced(b.purchases[0], data, cr).cost
  expect(base).toBeGreaterThan(0)
  expect(apply(b, { op: 'gmprice', uid, value: 123 }, data, cr)).toEqual({ ok: true })
  expect(priced(b.purchases[0], data, cr).cost).toBe(123)
  const ch = { ...blankSr6('priority', 'c1', NOW), build: b }
  expect(validateSr6(data, cr, ch).filter(x => x.code === PRICE_APPROVAL)).toHaveLength(1)
  expect(apply(b, { op: 'gmprice', uid, value: -1 }, data, cr).ok).toBe(false)
  expect(apply(b, { op: 'gmprice', uid }, data, cr)).toEqual({ ok: true })
  expect(b.purchases[0].gmPrice).toBeUndefined()
  expect(priced(b.purchases[0], data, cr).cost).toBe(base)
})

test('a ready-made vehicle’s Design Points: price ÷ 1,000 rounded; a GM override wins, clears and round-trips through charxml', () => {
  const { data, cr } = designWorld()
  const d = blankSr6('priority', 'des-1', NOW)
  d.design = { kind: 'vehicle', chassis: 'zz.zip-frame', powertrain: 'zz.roller', console: 'zz.brainbox', options: [], mods: [] }
  const b = blankBuild('priority')
  apply(b, { op: 'design', line: boughtDesign(d, data, cr, 'v1') }, data, cr)
  const x = b.purchases[0]
  expect(estimatedDp(x, data, cr)).toBe(Math.round(priced({ ...x, accessories: [] }, data, cr).cost / 1000))
  expect(apply(b, { op: 'vehicledp', uid: x.uid, value: 42 }, data, cr)).toEqual({ ok: true })
  expect(estimatedDp(x, data, cr)).toBe(42)
  expect(apply(b, { op: 'vehicledp', uid: x.uid, value: -1 }, data, cr).ok).toBe(false)
  const back = xmlToSr6(sr6ToXml({ ...blankSr6('priority', 'c1', NOW), build: b }))
  expect(back.ok && back.character.build.purchases[0].dp).toBe(42)
  expect(apply(b, { op: 'vehicledp', uid: x.uid }, data, cr)).toEqual({ ok: true })
  expect(x.dp).toBeUndefined()
})
