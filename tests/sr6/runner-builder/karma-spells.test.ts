// Spells past the free ones, bought with Karma under the optional rule (karmaSpellsAtCreation, CRB-HK p. 68): the
// free-spell pool is not "overspent", Karma pays for them, and only Karma can run out.
import { expect, test } from 'vitest'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'
import { validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import { allBudgets } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { makeProvider } from '../../../src/sr6/runner-builder/domain/creation/providers'
import { buildOf, GLIM, made } from '../catalog/fixture'

test('extra spells with the karma-spells rule on: slots not overspent, karma pays, no overspent error', () => {
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CBADA', metatype: GLIM, magic: 'full' }) // 12 free spells
  for (let i = 0; i < 14; i++) ch.build.picks.push({ uid: `s${i}`, kind: 'spells', id: 'crb.glow-ward' })
  const { data, cr } = made({ rules: { karmaSpellsAtCreation: true } })
  const B = allBudgets(ch.build, data, cr, makeProvider(ch.build.method, data, cr))
  expect(B.karma.breakdown?.find(l => l.key === 'spells')?.amount).toBeGreaterThan(0)
  expect(validateSr6(data, cr, ch).filter(v => /overspent|karmaAtCreation/.test(v.code) && v.code !== 'nuyen.overspent')).toEqual([])
})
