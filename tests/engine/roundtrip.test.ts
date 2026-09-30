// Every state the editor can save must read back: random runners using every feature (drafts at each step of creation,
// finalized runners with a ledger), through characterToXml → xmlToCharacter, must come back equal. Invented values only.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { characterToXml, xmlToCharacter } from '../../src/engine/charxml'
import { blankCharacter } from '../../src/engine/file'
import type { AmpEntry, CareerEvent, Character, ItemEntry } from '../../src/model/types'
import { ATTRS } from '../../src/model/types'
import { cat, MINI } from '../helpers'

const C = String.fromCharCode
/** Text a player might type or paste: quotes, apostrophes, markup, line breaks, tabs, emoji, and what a PDF paste brings
 *  (control characters, U+FFFE/FFFF, half a surrogate pair), which XML can't hold. */
const NASTY = ["Father O'Neil", '"Doc" O’Hara', 'Tom & Jerry', '<b>bold</b> & <i>', 'a > b < c', ']]> end', 'Zoë Ærø', '🐉 dragon',
  'line one\nline two', 'tab\there', 'crlf\r\nline', 'cr only\rhere', '  spaced  ', '&amp; literal', '&#65; ref', "It’s", 'x y',
  `form${C(12)}feed`, `stx${C(2)}pasted`, `nul${C(0)}`, `bell${C(7)}`, `non${C(0xfffe)}char`, `lone${C(0xd800)}half`, `half${C(0xdc00)}low`, '']
const BAD = new RegExp(`[${C(0)}-${C(8)}${C(11)}${C(12)}${C(14)}-${C(31)}${C(0xfffe)}${C(0xffff)}]|[${C(0xd800)}-${C(0xdbff)}](?![${C(0xdc00)}-${C(0xdfff)}])|(?<![${C(0xd800)}-${C(0xdbff)}])[${C(0xdc00)}-${C(0xdfff)}]`, 'g')

function rng(seed: number) {
  let a = seed >>> 0
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1))
  const pick = <T,>(xs: T[]): T => xs[int(0, xs.length - 1)]
  const maybe = <T,>(v: () => T, p = 0.5): T | undefined => (next() < p ? v() : undefined)
  const str = () => pick([...NASTY, 'Plain words', 'x'])
  const word = () => pick([...NASTY.filter(Boolean), 'Plain'])
  return { next, int, pick, maybe, str, word }
}

const amps = [...cat.amps.values()], items = [...cat.items.values()], skills = [...cat.skills.values()]
const effects = [...cat.ampEffects.keys()], types = [...cat.ampTypes.keys()]

/** A runner as the editor could have saved it after `step` of 0 (just created) … 7 (finalized with a ledger). */
function runner(seed: number, step: number): Character {
  const r = rng(seed)
  const ch = blankCharacter(r.pick([...cat.levels.keys(), '']), r.pick([...cat.metatypes.keys(), '']))
  ch.id = `id-${seed}`
  if (step >= 1) { // concept, some of it left empty
    ch.identity = { ...ch.identity, streetName: r.str(), name: r.str(), background: r.str(), notes: r.str(),
      portrait: r.maybe(() => 'data:image/jpeg;base64,/9j/4AAQ'), lifestyle: r.maybe(() => r.pick([...cat.lifestyles.keys()])) }
    ch.narrative = { keywords: [r.str(), r.str(), '', r.str(), ''], dispositions: [r.str(), '', '', r.str()], cues: [r.str(), r.str(), '', ''] }
    ch.package = r.pick([...cat.packages.keys(), 'free'])
    ch.allowNonCanon = r.maybe(() => false as const)
    ch.origin = r.maybe(() => 'CRB')
    ch.sampleKey = r.maybe(() => `${r.word()}|canon`)
    ch.campaign = r.maybe(() => 'c-123')
    ch.lastExportedAt = r.maybe(() => '2026-09-01T00:00:00.000Z')
  }
  if (step >= 2) for (const a of ATTRS) ch.build.attributes[a] = r.int(0, 8) // attributes
  if (step >= 3) { // skills, specializations (catalog and custom), knowledge
    ch.build.skills = skills.filter(() => r.next() < 0.4).map(s => ({ id: s.id, rating: r.int(0, 8),
      specs: [...s.specs.filter(() => r.next() < 0.3).map(x => x.id), ...(r.next() < 0.3 ? [`custom:${r.word()}`] : [])] }))
    ch.build.knowledge = Array.from({ length: r.int(0, 4) }, () => ({ name: r.str(), kind: r.pick(['knowledge', 'language'] as const),
      ...(r.next() < 0.4 ? { from: r.pick([`skill:${r.pick(skills).id}`, `keyword:${r.word()}`]) } : {}) }))
  }
  const amp = (i: number): AmpEntry => {
    const t = r.maybe(() => r.pick(amps))
    const a: AmpEntry = { uid: `amp-${seed}-${i}`, type: t?.type ?? r.pick([...types, '']), name: r.str(), narrative: r.str(),
      effects: Array.from({ length: r.int(0, 4) }, () => ({ ref: r.pick([...effects, '']),
        ...(r.next() < 0.4 ? { param: r.word() } : {}), ...(r.next() < 0.3 ? { value: r.int(-3, 5) } : {}), ...(r.next() < 0.3 ? { note: r.word() } : {}) })) }
    if (t) { a.catalogId = t.id; if (r.next() < 0.5) a.snapshot = t }
    if (r.next() < 0.2) a.linkedItem = `it-${seed}-0`
    if (r.next() < 0.2) a.vehicle = r.pick([...cat.vehicles.keys()])
    return a
  }
  const item = (i: number): ItemEntry => {
    const t = r.maybe(() => r.pick(items))
    const it: ItemEntry = { uid: `it-${seed}-${i}`, kind: t?.kind ?? r.pick(['gear', 'weapon', 'armor', 'spell', 'complex-form'] as const), name: r.str() }
    if (t) { it.catalogId = t.id; if (r.next() < 0.5) it.snapshot = t }
    if (r.next() < 0.3) it.specialist = true
    if (r.next() < 0.3) it.armor = r.int(0, 6)
    if (r.next() < 0.3) it.dv = r.pick(['STR+2', '5', r.word()])
    if (r.next() < 0.3) it.ranges = r.pick(['OK/-/-/-', r.word()])
    if (r.next() < 0.3) it.price = r.int(0, 50000)
    return it
  }
  if (step >= 4) ch.build.amps = Array.from({ length: r.int(0, 5) }, (_, i) => amp(i)) // amps, half-built ones too
  if (step >= 5) { // gear, spells, armor worn
    ch.build.items = Array.from({ length: r.int(0, 5) }, (_, i) => item(i))
    ch.build.mainArmor = r.maybe(() => ch.build.items[0]?.uid ?? 'gone')
    ch.build.altArmor = r.maybe(() => 'it-missing')
    ch.overrides = r.next() < 0.5 ? [{ code: 'attr.maxCount', path: 'attributes', note: r.str() }] : []
  }
  if (step >= 6) { ch.finalizedAt = '2026-09-02T00:00:00.000Z'; ch.finalRemaining = r.int(-5000, 90000) }
  if (step >= 7) { // the ledger: every event type
    const e = (x: Record<string, unknown>, i: number) => ({ id: `ev-${seed}-${i}`, at: '2026-09-03T00:00:00.000Z', ...x }) as CareerEvent
    const b4 = amp(90), after = { ...amp(91), uid: b4.uid }
    ch.career = [
      e({ type: 'earn', amount: r.int(0, 90000), run: r.str(), date: r.pick(['2086-03-01', '']) }, 0),
      e({ type: 'advance', path: `skills.${r.pick(skills).id}`, from: 2, to: 3, cost: 3000 }, 1),
      e({ type: 'buy', item: item(9), cost: 2000 }, 2), e({ type: 'sell', itemUid: `it-${seed}-9` }, 3),
      e({ type: 'amp-add', amp: amp(92), cost: 6000 }, 4), e({ type: 'amp-modify', ampUid: b4.uid, before: b4, after, cost: 1000 }, 5),
      e({ type: 'spec-add', skill: r.pick(skills).id, spec: `custom:${r.word()}`, cost: 3500 }, 6),
      e({ type: 'knowledge-add', name: r.word(), kind: 'language', cost: 2000 }, 7),
      e({ type: 'knowledge-add', name: r.word(), kind: 'knowledge', from: `skill:${r.pick(skills).id}`, cost: 0 }, 8),
      e({ type: 'note', text: r.str() }, 9), e({ type: 'void', eventId: `ev-${seed}-3`, reason: r.str() }, 10),
    ]
  }
  return ch
}

/** What a lossless round trip gives back: the same runner, minus the characters XML can't hold (and a snapshot's
 *  `edited` flag: it describes the catalog, not the runner). */
const clean = <T,>(x: T): T => JSON.parse(JSON.stringify(x, (k, v) => k === 'edited' ? undefined : typeof v === 'string' ? v.replace(BAD, '') : v))

const xsd = readFileSync('public/data/schema/character.xsd', 'utf8')

test.each(Array.from({ length: 8 }, (_, step) => step))('every runner saved at step %i reads back equal (200 seeds)', step => {
  for (let seed = 1; seed <= 200; seed++) {
    const ch = runner(seed * 31 + step, step)
    const back = xmlToCharacter(characterToXml(ch, 7))
    if (!back.ok) throw new Error(`seed ${seed}: ${back.reason}`)
    expect(back.rev).toBe(7)
    expect(back.character, `seed ${seed}`).toEqual(clean(ch))
  }
})

test('a sample of them is schema-valid, drafts included', async () => {
  for (const step of [0, 1, 3, 5, 7]) for (const seed of [1, 2, 3]) {
    const v = await validateXML({ xml: { fileName: 'r.xml', contents: characterToXml(runner(seed, step)) }, schema: { fileName: 'character.xsd', contents: xsd } })
    expect(v.errors.map(e => e.message), `step ${step} seed ${seed}`).toEqual([])
  }
})

test('the example characters in the fixtures round trip', () => {
  const root = join(MINI, 'samples')
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(f => f.endsWith('.xml') && !f.endsWith('set.xml'))
  expect(files.length).toBeGreaterThan(0)
  for (const f of files) {
    const first = xmlToCharacter(readFileSync(join(root, f), 'utf8'))
    if (!first.ok) throw new Error(`${f}: ${first.reason}`)
    const again = xmlToCharacter(characterToXml(first.character))
    expect(again.ok && again.character, f).toEqual(first.character)
  }
})

// files written before 0.5.2 that couldn't be read back, and what the reader says and repairs
const oldFile = (patch: (xml: string) => string) => patch(characterToXml({ ...blankCharacter(), id: 'old', identity: { ...blankCharacter().identity, streetName: "Father O'Neil", background: 'Bio', notes: 'Notes' } }))

test('a pasted control character: refused with where it is; repair drops it and says so', () => {
  const xml = oldFile(x => x.replace('<background>', `<background>From the PDF${C(12)} page two${C(2)}`))
  const strict = xmlToCharacter(xml)
  expect(strict.ok).toBe(false)
  expect(!strict.ok && strict.reason).toMatch(/^Not valid XML\. Line \d+, column \d+, in <background>: character U\+000C isn’t allowed in XML\.$/)
  const changes: string[] = []
  const fixed = xmlToCharacter(xml, { repair: changes })
  expect(fixed.ok && fixed.character.identity.background).toBe('From the PDF page twoBio')
  expect(changes).toEqual(['Removed 2 characters XML can’t hold (U+000C, U+0002).'])
})

test('a draft saved with no metatype (0.5.1 dropped the empty attribute) reads', () => {
  const xml = oldFile(x => x.replace(/ metatype="[^"]*"/, ''))
  const r = xmlToCharacter(xml)
  expect(r.ok && r.character.identity).toMatchObject({ streetName: "Father O'Neil", metatype: '' })
})

test('what the reader can’t read is named; repair drops only that part', () => {
  const xml = oldFile(x => x.replace('</build>', '</build><career><event id="e1" at="t" type="note"><text>ok</text></event>'
    + '<event id="e2" at="t" type="bogus"/><event id="e3" at="t" type="buy" cost="5"/></career>'))
  const strict = xmlToCharacter(xml)
  expect(!strict.ok && strict.reason).toBe('Couldn’t read career event 2 (bogus): unknown type "bogus".')
  const changes: string[] = []
  const fixed = xmlToCharacter(xml, { repair: changes })
  expect(fixed.ok && fixed.character.career.map(e => e.id)).toEqual(['e1'])
  expect(changes).toEqual(['Dropped career event 2 (bogus): unknown type "bogus".', 'Dropped career event 3 (buy): no <item> inside <event>.'])
  const amp = xmlToCharacter(oldFile(x => x.replace('<notes>', '<notes>Tom & Jerry')))
  expect(!amp.ok && amp.reason).toMatch(/^Not valid XML/)
  const fixes: string[] = []
  expect(xmlToCharacter(oldFile(x => x.replace('<notes>', '<notes>Tom & Jerry')), { repair: fixes }).ok).toBe(true)
  expect(fixes).toEqual(['Escaped 1 stray “&”.'])
  expect(xmlToCharacter(oldFile(x => x.replace(/ formatVersion="1"/, '')))).toEqual({ ok: false, reason: 'The <character> element has no formatVersion.' })
})
