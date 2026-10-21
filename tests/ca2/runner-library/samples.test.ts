import { expect, test } from 'vitest'
import { blankCharacter } from '../../../src/ca2/formats/domain/file'
import { characterToXml, xmlToCharacter } from '../../../src/ca2/formats/domain/charxml'
import { chooseExamples, exampleKey, extraCopies, keyOf, sameRunners, type Example, type Sources } from '../../../src/ca2/runner-builder/ui/samples'
import type { Character } from '../../../src/ca2/formats/domain/types'

// Made up: two canon books OLDC (imported 2026-09-01) and NEWC (2026-09-20), a non-canon booklet PREG, and the
// first-release built-in set (canon). "Dusty Hat" is in all four, "Mo Ray" in the set and PREG, "Lone Wolf" only in OLDC.
const SOURCES: Record<string, { canon: boolean; imported?: string }> = {
  oldc: { canon: true, imported: '2026-09-01' },
  newc: { canon: true, imported: '2026-09-20' },
  preg: { canon: false, imported: '2026-09-10' },
}
const sources: Sources = id => SOURCES[id.toLowerCase()]
const book = (source: string, name: string, n = 1): Example => ({
  url: `./custom/imported/${source.toLowerCase()}/samples/${n}.xml`,
  name,
  source,
  canon: !!SOURCES[source.toLowerCase()].canon,
})
const builtin = (name: string): Example => ({ url: `./custom/samples/builtin/${name}.xml`, name, set: 'Built-in samples (first release)', canon: true })
const ROWS = [
  builtin('Dusty Hat'),
  builtin('Mo Ray'),
  book('OLDC', 'Dusty Hat'),
  book('OLDC', 'Lone Wolf'),
  book('NEWC', 'Dusty Hat'),
  book('PREG', 'Dusty Hat'),
  book('PREG', 'Mo Ray'),
]

const runner = (name: string, extra: Partial<Character> = {}): Character => {
  const ch = blankCharacter('runner', 'ork')
  return { ...ch, identity: { ...ch.identity, name, streetName: name }, updatedAt: '2026-09-01T00:00:00Z', ...extra }
}
/** What "Load example characters" adds to `lib` (Library.tsx loadExamples): each chosen version whose key isn't there yet. */
function load(lib: Character[], rows = ROWS) {
  const have = new Set(lib.map(ch => keyOf(ch, sources)))
  const add = chooseExamples(rows, sources)
    .filter(e => !have.has(e.key))
    .map(e => runner(e.name, { origin: e.source, sampleKey: e.key, lastExportedAt: '2026-09-01T00:00:00Z' }))
  return [...lib, ...add]
}
const keys = (lib: Character[]) => lib.map(ch => keyOf(ch, sources)).sort()

test('one canon and one non-canon version per character: a canon book over the set, the newest canon import', () => {
  const chosen = chooseExamples(ROWS, sources)
  expect(chosen.map(e => `${e.key} ${e.source ?? e.set}`).sort()).toEqual([
    'dusty-hat|canon NEWC',
    'dusty-hat|noncanon PREG',
    'lone-wolf|canon OLDC',
    'mo-ray|canon Built-in samples (first release)',
    'mo-ray|noncanon PREG',
  ])
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
  const first = load([]),
    second = load([])
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

test('tidy-up: copies loaded before 0.4.1 (lastExportedAt = load time): identical ones are duplicates, the oldest stays', () => {
  // what 0.4.0 wrote: updatedAt the book file's date, lastExportedAt the moment it was loaded; no sampleKey
  const loaded = (at: string, extra: Partial<Character> = {}) => runner('Dusty Hat', { origin: 'OLDC', lastExportedAt: at, ...extra })
  const first = loaded('2026-09-02T10:00:00Z', { updatedAt: '2026-09-01T00:00:00Z' })
  const second = loaded('2026-09-03T10:00:00Z', { updatedAt: '2026-09-01T00:00:00Z' })
  // the reviewer's case: the book's face loaded twice by 0.4.0, neither changed -> one goes, the oldest stays
  expect(
    extraCopies(
      [second, first].map(ch => ({ ch })),
      sources,
    ),
  ).toEqual([second])
  // a copy changed and saved (content differs, rev 2) stays, and so does the oldest unchanged one
  const edited = { ...loaded('2026-09-04T10:00:00Z', { updatedAt: '2026-09-05T00:00:00Z' }), level: 'street' }
  expect(extraCopies([{ ch: first }, { ch: second }, { ch: edited, rev: 2 }], sources)).toEqual([second])
  // edited then exported in browser storage (lastExportedAt after updatedAt), different content: never a duplicate
  const exported = { ...loaded('2026-09-06T10:00:00Z', { updatedAt: '2026-09-05T00:00:00Z' }), level: 'street' }
  expect(extraCopies([{ ch: first }, { ch: exported }], sources)).toEqual([])
  // a 0.4.3 copy of the same character next to the old one: the unedited new one goes, the old one stays
  const fresh = runner('Dusty Hat', { origin: 'NEWC', sampleKey: 'dusty-hat|canon', lastExportedAt: '2026-09-01T00:00:00Z' })
  expect(extraCopies([{ ch: first }, { ch: fresh }], sources)).toEqual([fresh])
})

test('two runners of one name in one book are two characters (“-2”, as 0.4.1’s keys); across books they pair', () => {
  const rows = [book('OLDC', 'Mo Ray', 1), book('OLDC', 'Mo Ray', 2), book('NEWC', 'Mo Ray')]
  expect(
    chooseExamples(rows, sources)
      .map(e => `${e.key} ${e.source}`)
      .sort(),
  ).toEqual(['mo-ray-2|canon OLDC', 'mo-ray|canon NEWC'])
  expect(keyOf(runner('Mo Ray', { sampleKey: 'oldc.mo-ray-2' }), sources)).toBe('mo-ray-2|canon')
})

test('tidy-up on the server: two unedited copies (rev 1) of one book’s example from two versions of its file pair, the newest stays', () => {
  // the owner's case: loaded twice the same day, one copy from an older version of the example file (other text and
  // dates), and the book's canon flag differing between the loads (so the keys' canon-ness differs)
  const older = runner('Dusty Hat', {
    origin: 'OLDC',
    sampleKey: 'dusty-hat|noncanon',
    updatedAt: '2026-08-01T00:00:00Z',
    lastExportedAt: '2026-08-01T00:00:00Z',
  })
  older.identity = { ...older.identity, background: 'Older text.' }
  const newer = runner('Dusty Hat', { origin: 'OLDC', sampleKey: 'dusty-hat|canon', updatedAt: '2026-09-01T00:00:00Z', lastExportedAt: '2026-09-02T00:00:00Z' })
  expect(
    extraCopies(
      [
        { ch: older, rev: 1 },
        { ch: newer, rev: 1 },
      ],
      sources,
    ),
  ).toEqual([older])
  expect(
    extraCopies(
      [
        { ch: newer, rev: 1 },
        { ch: older, rev: 1 },
      ],
      sources,
    ),
  ).toEqual([older])
  // an edited copy (rev 2) is never extra: the unedited ones go, however new
  expect(
    extraCopies(
      [
        { ch: older, rev: 2 },
        { ch: newer, rev: 1 },
      ],
      sources,
    ),
  ).toEqual([newer])
  expect(
    extraCopies(
      [
        { ch: older, rev: 2 },
        { ch: newer, rev: 3 },
      ],
      sources,
    ),
  ).toEqual([])
  // another book's non-canon copy is another character: it stays
  const preg = runner('Dusty Hat', { origin: 'PREG', sampleKey: 'dusty-hat|noncanon', lastExportedAt: '2026-09-01T00:00:00Z' })
  expect(
    extraCopies(
      [
        { ch: older, rev: 1 },
        { ch: newer, rev: 1 },
        { ch: preg, rev: 1 },
      ],
      sources,
    ),
  ).toEqual([older])
  // two characters of one name in one book stay two
  const second = runner('Dusty Hat', { origin: 'OLDC', sampleKey: 'dusty-hat-2|canon' })
  expect(
    extraCopies(
      [
        { ch: newer, rev: 1 },
        { ch: second, rev: 1 },
      ],
      sources,
    ),
  ).toEqual([])
})

test('find duplicates (0.8.3): same street name, real name and metatype, whatever else differs; an edited copy, else the newest, kept', () => {
  // the owner's case: one example loaded twice, once from an older version of its file (other background, other dates), both rev 1
  const older = runner('Dusty Hat', { id: 'old', sampleKey: 'dusty-hat|noncanon', updatedAt: '2026-08-01T00:00:00Z', lastExportedAt: '2026-08-01T00:00:00Z' })
  older.identity = { ...older.identity, background: 'Older text.' }
  const newer = runner('Dusty Hat', { id: 'new', sampleKey: 'dusty-hat|canon', updatedAt: '2026-09-01T00:00:00Z', lastExportedAt: '2026-09-02T00:00:00Z' })
  const ids = (g: { ch: Character }[][]) => g.map(x => x.map(r => r.ch.id))
  expect(
    ids(
      sameRunners([
        { ch: older, rev: 1 },
        { ch: newer, rev: 1 },
      ]),
    ),
  ).toEqual([['new', 'old']]) // both unedited: the newest
  expect(
    ids(
      sameRunners([
        { ch: newer, rev: 1 },
        { ch: older, rev: 2 },
      ]),
    ),
  ).toEqual([['old', 'new']]) // the edited one, however old
  // case and spaces don't matter; another metatype, or another real name, is another character
  const shouty = { ...newer, id: 'shout', identity: { ...newer.identity, streetName: '  DUSTY hat ', name: ' dusty HAT' } }
  const troll = { ...newer, id: 'troll', identity: { ...newer.identity, metatype: 'troll' } }
  const other = { ...newer, id: 'other', identity: { ...newer.identity, name: 'Someone Else' } }
  expect(ids(sameRunners([{ ch: older }, { ch: shouty }, { ch: troll }, { ch: other }]))).toEqual([['shout', 'old']])
  // unnamed runners can't be told apart by name: never offered
  const blank = (id: string) => ({ ch: { ...newer, id, identity: { ...newer.identity, streetName: '', name: '' } } })
  expect(sameRunners([blank('a'), blank('b')])).toEqual([])
})
