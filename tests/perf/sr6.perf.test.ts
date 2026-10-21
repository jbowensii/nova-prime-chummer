// Timing checks for the SR6 paths a user waits on (`npm run perf`, not part of `npm test`): building the catalog the app
// loads at start, validating a full runner, and writing + reading a runner file. All on the made-up fixtures.
// BUDGETS (ms): set 2026-10-21 at ~5x the median measured on the dev PC (medians in the comments), as CI machines are
// slower and noisy. Re-measure with `npm run perf` and move a budget only with a reason.
import { test } from 'vitest'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/formats/domain/charxml'
import { validateSr6 } from '../../src/sr6/runner-builder/domain/review/rules'
import { fixtureCatalog } from '../sr6/catalog/fixture'
import { mara, sampleWorld } from '../sr6/runner-builder/samples'
import { within } from './timing'

const BUDGET = {
  catalog: 45, // median 8.6 ms
  validate: 6, // median 1.2 ms
  xml: 10, // median 2.0 ms
}

const w = sampleWorld()
const runner = mara(w)

test('building the SR6 catalog from its files', () => within('sr6 catalog build', BUDGET.catalog, () => fixtureCatalog()))
test('validating a full runner', () => within('sr6 validateSr6', BUDGET.validate, () => validateSr6(w.data, w.cr, runner)))
test('writing and reading a full runner file', () =>
  within('sr6 sr6ToXml + xmlToSr6', BUDGET.xml, () => {
    const back = xmlToSr6(sr6ToXml(runner, 1))
    if (!back.ok) throw new Error(back.reason)
  }))
