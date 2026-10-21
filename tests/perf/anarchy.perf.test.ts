// Timing checks for the Anarchy paths a user waits on (`npm run perf`, not part of `npm test`): building the catalog from
// the made-up files, validating a runner, and writing + reading a runner file.
// BUDGETS (ms): set 2026-10-21 at ~5x the median measured on the dev PC (medians in the comments), as CI machines are
// slower and noisy. Re-measure with `npm run perf` and move a budget only with a reason.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { buildCatalog } from '../../src/ca2/catalog/domain/load'
import { characterToXml, xmlToCharacter } from '../../src/ca2/formats/domain/charxml'
import { validate } from '../../src/ca2/runner-builder/domain/validate'
import { cat, catFiles } from '../helpers'
import { within } from './timing'

const BUDGET = {
  catalog: 33, // median 6.6 ms
  validate: 5, // median 0.12 ms; floored at 5 ms, a sub-millisecond budget is just noise
  xml: 5, // median 0.8 ms; floored at 5 ms
}

const parsed = xmlToCharacter(readFileSync('tests/fixtures/mini/custom/imported/pregens/samples/pregens.test-face.xml', 'utf8'))
if (!parsed.ok) throw new Error('fixture runner does not read')
const runner = parsed.character

test('building the Anarchy catalog from its files', () => within('anarchy catalog build', BUDGET.catalog, () => buildCatalog(catFiles)))
test('validating a runner', () => within('anarchy validate', BUDGET.validate, () => validate(cat, runner)))
test('writing and reading a runner file', () =>
  within('anarchy characterToXml + xmlToCharacter', BUDGET.xml, () => {
    expect(xmlToCharacter(characterToXml(runner, 1)).ok).toBe(true)
  }))
