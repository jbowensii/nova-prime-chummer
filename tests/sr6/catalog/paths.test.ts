// The graph quality paths (importer/sr6/library/<book>/paths.json, published as custom/sr6/paths/<book>.json) through
// getQualityPaths, and a runner's pathProgress through the character file (invented progress, real path ids).
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { getQualityPaths } from '../../../src/sr6/catalog/domain/load'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { blankSr6, type PathProgress } from '../../../src/sr6/formats/domain/character'

const STEPS: Record<string, number> = { companion: 22, dealers_of_death: 5, deus_ex_arcana: 6, firing_squad: 12, hack_slash: 4, shadow_cast: 25 }
// what the server serves at /custom/sr6/paths/: the importer's library copies
const get = async (path: string) => {
  const m = /^custom\/sr6\/paths\/(\w+)\.json$/.exec(path)
  return m ? readFileSync(`importer/sr6/library/${m[1]}/paths.json`, 'utf8') : null
}

test('each path book loads with its step count and its bookKey', async () => {
  for (const [book, n] of Object.entries(STEPS)) {
    const paths = await getQualityPaths(book, get)
    expect(
      paths.reduce((s, p) => s + p.steps.length, 0),
      book,
    ).toBe(n)
    expect(paths.every(p => p.bookKey === book)).toBe(true)
  }
  expect(await getQualityPaths('crb', get)).toEqual([])
})

test('a deus_ex_arcana loop and a firing_squad choice come through', async () => {
  const dea = (await getQualityPaths('deus_ex_arcana', get)).find(p => p.id === 'path_of_mentor_spirit')!
  expect(dea.steps.find(s => s.id === 'first_interaction')!.nextSteps).toEqual(['accept', 'reject'])
  const fs = await getQualityPaths('firing_squad', get)
  const ch = fs.flatMap(p => p.steps.flatMap(s => s.modifications)).find(m => m.op === 'choice')
  expect(ch && ch.op === 'choice' && ch.options.length).toBeGreaterThanOrEqual(2)
})

test('pathProgress round-trips (a loop keeps its repeated step) and validates; an old file reads as []', async () => {
  const ch = blankSr6('priority', 'r-1', '2026-10-03T10:00:00.000Z')
  const p: PathProgress = {
    pathId: 'path_of_mentor_spirit',
    currentStepId: 'first_interaction',
    visitedStepIds: ['first_interaction', 'reject', 'first_interaction'],
    choicesByStepId: { reject: { optionRef: 'a' }, first_interaction: { optionRef: 'b', subOptionRef: 'c' } },
  }
  ch.pathProgress = [p]
  const xml = sr6ToXml(ch)
  const XSD = readFileSync('public/data/sr6/schema/character.xsd', 'utf8')
  expect((await validateXML({ xml: { fileName: 'r.xml', contents: xml }, schema: { fileName: 'character.xsd', contents: XSD } })).errors).toEqual([])
  const back = xmlToSr6(xml)
  expect(back.ok && back.character.pathProgress).toEqual([p])
  const old = xmlToSr6(sr6ToXml(blankSr6('priority', 'r-2')))
  expect(old.ok && old.character.pathProgress).toEqual([])
  expect(sr6ToXml(blankSr6('priority', 'r-2'))).not.toContain('pathProgress')
})
