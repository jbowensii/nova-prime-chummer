import { expect, test } from 'vitest'
import { blankCharacter } from '../../src/engine/file'
import { characterToXml, xmlToCharacter } from '../../src/engine'
import { chooseExamples, exampleKey, extraCopies, keyOf, type Example, type Sources } from '../../src/ui/samples'
import type { Character } from '../../src/model/types'

// Made up: two canon books OLDC (imported 2026-09-01) and NEWC (2026-09-20), a non-canon booklet PREG, and the
// first-release built-in set (canon). "Dusty Hat" is in all four, "Mo Ray" in the set and PREG, "Lone Wolf" only in OLDC.
const SOURCES: Record<string, { canon: boolean; imported?: string }> = {
  oldc: { canon: true, imported: '2026-09-01' }, newc: { canon: true, imported: '2026-09-20' }, preg: { canon: false, imported: '2026-09-10' },
}
const sources: Sources = id => SOURCES[id.toLowerCase()]
const book = (source: string, name: string, n = 1): Example => ({ url: `./custom/imported/${source.toLowerCase()}/samples/${n}.xml`, name, source, canon: !!SOURCES[source.toLowerCase()].canon })
const builtin = (name: string): Example => ({ url: `./custom/samples/builtin/${name}.xml`, name, set: 'Built-in samples (first release)', canon: true })
const ROWS = [builtin('Dusty Hat'), builtin('Mo Ray'), book('OLDC', 'Dusty Hat'), book('OLDC', 'Lone Wolf'), book('NEWC', 'Dusty Hat'),
  book('PREG', 'Dusty Hat'), book('PREG', 'Mo Ray')]

const runner = (name: string, extra: Partial<Character> = {}): Character => {
  const ch = blankCharacter('runner', 'ork')
  return { ...ch, identity: { ...ch.identity, name, streetName: name }, updatedAt: '2026-09-01T00:00:00Z', ...extra }
}
/** What "Load example characters" adds to `lib` (Library.tsx loadExamples): each chosen version whose key isn't there yet. */
function load(lib: Character[], rows = ROWS) {
  const have = new Set(lib.map(ch => keyOf(ch, sources)))
  const add = chooseExamples(rows, sources).filter(e => !have.has(e.key))
    .map(e => runner(e.name, { origin: e.source, sampleKey: e.key, lastExportedAt: '2026-09-01T00:00:00Z' }))
  return [...lib, ...add]
}
const keys = (lib: Character[]) => lib.map(ch => keyOf(ch, sources)).sort()

test('one canon and one non-canon version per character: a canon book over the set, the newest canon import', () => {
  const chosen = chooseExamples(ROWS, sources)
  expect(chosen.map(e => `${e.key} ${e.source ?? e.set}`).sort()).toEqual([
    'dusty-hat|canon NEWC', 'dusty-hat|noncanon PREG', 'lone-wolf|canon OLDC', 'mo-ray|canon Built-in samples (first release)', 'mo-ray|noncanon PREG'])
})

test('loading twice adds nothing; a re-import with new ids and files adds nothing', () => {
  const once = load([])
  expect(keys(once)).toEqual(['dusty-hat|canon', 'dusty-hat|noncanon', 'lone-wolf|canon', 'mo-ray|canon', 'mo-ray|noncanon'])
  expect(load(once)).toHaveLength(5)
  const reimported = ROWS.map((r, i) => ({ ...r, url: `${r.url}?new-${i}` }))
  expect(load(once, reimported)).toHaveLength(5)
})

test('an old copy counts: a first-release built-in (sample-…), a 0.4.1 sampleKey, an origin-only copy', () => {
  const legacy = runner('Dusty Hat', { id: 'sample-dusty-hat' }) // no origin, rev 1: the built-in set, canon
  const v041 = runner('Mo Ray', { sampleKey: 'preg.mo-ray', origin: 'PREG' })
  const v040 = runner('Lone Wolf', { origin: 'OLDC' })
  expect([keyOf(legacy, sources), keyOf(v041, sources), keyOf(v040, sources)]).toEqual(['dusty-hat|canon', 'mo-ray|noncanon', 'lone-wolf|canon'])
  const lib = load([legacy, v041, v040])
  expect(lib).toHaveLength(5)
  expect(keys(lib)).toEqual(['dusty-hat|canon', 'dusty-hat|noncanon', 'lone-wolf|canon', 'mo-ray|canon', 'mo-ray|noncanon'])
  expect(keyOf(runner('Mine'), sources)).toBeNull() // a runner of your own
})

test('a second account gets the full set of its own', () => {
  const first = load([]), second = load([])
  expect(second).toHaveLength(5)
  expect(new Set(second.map(ch => ch.id)).isDisjointFrom(new Set(first.map(ch => ch.id)))).toBe(true)
})

test('the key is saved in the character file', () => {
  const ch = runner('Dusty Hat', { sampleKey: exampleKey('Dusty Hat', false) })
  const back = xmlToCharacter(characterToXml(ch))
  expect(back.ok && back.character.sampleKey).toBe('dusty-hat|noncanon')
})

test('tidy-up: one copy per key; edited copies stay; else the preferred version stays', () => {
  const at = (ch: Character) => ({ ch })
  const legacy = runner('Dusty Hat', { id: 'sample-dusty-hat' })
  const oldc = runner('Dusty Hat', { origin: 'OLDC', sampleKey: 'dusty-hat|canon', lastExportedAt: '2026-09-01T00:00:00Z' })
  const newc = runner('Dusty Hat', { origin: 'NEWC', sampleKey: 'dusty-hat|canon', lastExportedAt: '2026-09-01T00:00:00Z' })
  const again = runner('Dusty Hat', { origin: 'NEWC', sampleKey: 'dusty-hat|canon', lastExportedAt: '2026-09-01T00:00:00Z' })
  const preg = runner('Dusty Hat', { origin: 'PREG', sampleKey: 'dusty-hat|noncanon' })
  const mine = runner('Dusty Hat')
  // none edited: the newest canon book's copy stays (the first of two equal copies), the built-in and older book's go
  expect(extraCopies([legacy, oldc, newc, again, preg, mine].map(at), sources).map(ch => ch.id)).toEqual([legacy.id, oldc.id, again.id])
  // an edited copy (saved again, or changed since it was loaded) stays, and every unedited copy of that key goes
  expect(extraCopies([at(newc), { ch: legacy, rev: 2 }], sources)).toEqual([newc])
  const changed = { ...oldc, updatedAt: '2026-09-15T00:00:00Z' }
  expect(extraCopies([at(newc), at(changed), at(again)], sources)).toEqual([newc, again])
  expect(extraCopies([at(newc), at(preg)], sources)).toEqual([]) // canon and non-canon: both stay
})

test('tidy-up: a copy from before loads recorded their date is edited when it is newer than the other copies from its source', () => {
  const a = runner('Mo Ray', { origin: 'PREG' }), b = runner('Mo Ray', { origin: 'PREG' })
  const changed = runner('Mo Ray', { origin: 'PREG', updatedAt: '2026-09-12T00:00:00Z' })
  expect(extraCopies([a, changed, b].map(ch => ({ ch })), sources)).toEqual([a, b])
})
