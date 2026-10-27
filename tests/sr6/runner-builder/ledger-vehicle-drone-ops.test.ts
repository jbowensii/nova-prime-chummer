import { expect, test } from 'vitest'
import { buyKinds, OPS } from '../../../src/sr6/runner-builder/ui/tabs/Ledger'

test('Buy gear no longer lumps vehicles (and drones); they have their own ops', () => {
  const gear = buyKinds('purchase')
  expect(gear).not.toContain('vehicles')
  expect(gear).toContain('weapons')
  expect(buyKinds('vehicle')).toEqual(['vehicles'])
  expect(buyKinds('drone')).toEqual(['vehicles'])
  const keys = OPS.map(o => o[0])
  expect(keys).toContain('vehicle')
  expect(keys).toContain('drone')
})

// GM-adjusted price: recorded at the adjusted nuyen; Review warns until a GM approves it (same override as a design's approval)
import { balances, currentBuild, record } from '../../../src/sr6/runner-builder/domain/career/career'
import { boughtDesign } from '../../../src/sr6/runner-builder/domain/assets/design'
import { validateSr6, PRICE_APPROVAL } from '../../../src/sr6/runner-builder/domain/review/rules'
import { blankBuild, blankSr6 } from '../../../src/sr6/formats/domain/character'
import { designWorld } from './design-fixture'
import { GLIM } from '../catalog/fixture'

test('a vehicle bought at a GM-adjusted price records that nuyen and warns until approved; the plain price warns of nothing', () => {
  const { data, cr } = designWorld()
  const NOW = '2026-10-27T10:00:00.000Z'
  const d = blankSr6('priority', 'des-1', NOW)
  d.design = { kind: 'vehicle', chassis: 'zz.zip-frame', powertrain: 'zz.roller', console: 'zz.brainbox', options: [], mods: [] }
  const line = boughtDesign(d, data, cr, 'v1')
  const ch = blankSr6('karma', 'r1', NOW)
  ch.build = { ...blankBuild('karma'), metatype: GLIM }
  ch.finalizedAt = NOW
  ch.final = { karma: 0, nuyen: 100000 }
  ch.ledger = [{ id: 'f1', at: NOW, type: 'finalize', karma: 0, nuyen: 100000 }]
  const buy = (l: typeof line) => {
    const r = record(ch, { op: 'purchase', line: l }, data, cr, {}, NOW)
    if (!r.ok) throw new Error(r.reason)
    return r.ch
  }
  const plain = buy(line)
  expect(balances(plain).nuyen).toBe(100000 - 22000)
  const cheap = buy({ ...line, gmPrice: 15000 })
  expect(balances(cheap).nuyen).toBe(85000)
  const warn = (c: typeof cheap) => validateSr6(data, cr, { ...c, build: currentBuild(c) }).filter(x => x.code === PRICE_APPROVAL)
  expect(warn(plain)).toEqual([])
  const w = warn(cheap)
  expect(w.map(x => [x.severity, x.approved])).toEqual([['warning', undefined]])
  const approved = warn({ ...cheap, overrides: [{ code: PRICE_APPROVAL, path: w[0].path, note: 'used' }] })
  expect(approved[0].approved).toBe(true)
})
