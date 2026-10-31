// The Your Runners list badges errors as the editor counts them: a finalized runner by its career checks, so a creation-only
// error (here nuyen overspent at creation) is no phantom badge on a runner that opens clean.
import { expect, test } from 'vitest'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'
import { currentBuild, validateCareer } from '../../../src/sr6/runner-builder/domain/career/career'
import { validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import { errorCount } from '../../../src/sr6/runner-library/ui/Runners'
import { buildOf, fixtureCatalog, GLIM, made } from '../catalog/fixture'

const errors = (v: { severity: string; approved?: unknown }[]) => v.filter(x => x.severity === 'error' && !x.approved).length

test('a finalized runner past a creation cap: the list counts what the editor shows (none)', () => {
  const { data, cr } = made(),
    ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'mundane' })
  ch.build.purchases = [{ uid: 'g1', kind: 'gear', name: 'Gold bar', cost: 9_000_000, qty: 1, accessories: [] }]
  const c = fixtureCatalog()
  expect(errorCount(data, cr, c, ch)).toBeGreaterThan(0) // a draft: nuyen overspent
  Object.assign(ch, { finalizedAt: '2026-10-16T00:00:00Z', final: { karma: 0, nuyen: 0 } })
  ch.ledger = [{ id: 'f1', at: '2026-10-16T00:00:00Z', type: 'finalize', karma: 0, nuyen: 0 }]
  expect(errors(validateSr6(data, cr, { ...ch, build: currentBuild(ch) }))).toBeGreaterThan(0) // creation checks would flag it
  expect(errorCount(data, cr, c, ch)).toBe(errors(validateCareer(data, cr, ch)))
  expect(errorCount(data, cr, c, ch)).toBe(0)
})
