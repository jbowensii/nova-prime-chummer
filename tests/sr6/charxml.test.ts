// The SR6 runner file (src/sr6/engine/charxml.ts, public/data/sr6/schema/character.xsd): a made-up runner round-trips
// and validates; bad files are refused or repaired; each game refuses the other's runner.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { xmlToCharacter } from '../../src/engine/charxml'
import { currentBuild } from '../../src/sr6/engine/career'
import { SR6_CHAR_NS, sr6ToXml, xmlToSr6 } from '../../src/sr6/engine/charxml'
import { sr6Codec } from '../../src/sr6/ui/repo'
import { blankSr6, SR6_ADVANCE_OPS, type Sr6Advance, type Sr6Character, type Sr6LedgerEntry } from '../../src/sr6/model/character'

const XSD = readFileSync('public/data/sr6/schema/character.xsd', 'utf8')
const CA2 =
  '<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="a" metatype="elf" level="runner" updatedAt="x"><build><attributes str="1" agi="1" wil="1" log="1" cha="1"/></build></ca2:character>'
const valid = async (xml: string) =>
  (await validateXML({ xml: { fileName: 'r.xml', contents: xml }, schema: { fileName: 'character.xsd', contents: XSD } })).errors.map(e => e.message)

/** Every collection filled, with invented numbers. */
function full(): Sr6Character {
  const ch = blankSr6('priority', 'r-1', '2026-10-03T10:00:00.000Z')
  const b = ch.build
  ch.identity = {
    name: 'Pat Doe',
    streetName: 'Sparky',
    gender: 'Made-up gender',
    metatype: 'crb.glimmerkin',
    portrait: 'data:image/png;base64,iVBORw0KGgo=',
    token: 'data:image/png;base64,AAAA',
    backdrop: 'neon',
    background: 'Grew up\nin a vending machine.',
    notes: 'Owes Gil & co.',
  }
  Object.assign(ch, {
    finalizedAt: '2026-10-03T11:00:00.000Z',
    final: { karma: 3, nuyen: 1250 },
    campaign: '0123456789ab',
    lastExportedAt: '2026-10-03T12:00:00.000Z',
    overrides: [{ code: 'skill.cap', path: 'skills.crb.gab', note: 'GM ok' }],
    printed: { source: 'CRB', page: 81, values: { rea: '4(6)', init: '9(11) + 3D6', cm: '10/10' } },
  })
  Object.assign(b, {
    metatype: 'crb.glimmerkin',
    magic: 'aspected',
    awakened: false, // (the player's override of the Awakened flag)
    infectedFrom: 'technomancer', // (the kind before an Infected type changed it)
    aspectedSkill: 'crb.hexing',
    tradition: 'Street hoodoo',
    drainAttr: 'cha',
    powerPointsBought: 1,
    initiation: 1,
    submersion: 0,
    transhuman: 2, // (the codec only: the rules refuse it on an awakened runner)
    karmaToNuyen: 3,
    bestAttr: 'str',
    bestExtra: 'agi',
  })
  b.priorities = { metatype: 'D', attributes: 'A', magic: 'B', skills: 'C', resources: null }
  b.cp.attribute = 5
  b.cp.spells = 1
  b.lifepath = [
    { id: 'crb.glow-apprentice', choices: { 0: 'skill:crb.hexing' } },
    { id: 'crb.wage-drone', choices: {} },
    { id: 'crb.glow-apprentice', choices: { 0: 'edg' } },
  ]
  b.attributes.agi = { points: 3, adjust: 1, karma: 0 }
  b.attributes.edg = { points: 0, adjust: 2, karma: 1 }
  b.skills = [
    { id: 'crb.gab', points: 5, karma: 1, spec: 'Haggling', expertise: 'Fibbing' },
    { id: 'crb.hexing', points: 2, karma: 0 },
  ]
  b.knowledge = [
    { uid: 'k1', name: 'Sperethiel', kind: 'language', native: true, points: 0, karma: 0 },
    { uid: 'k2', name: 'Soy <brands>', kind: 'knowledge', points: 3, karma: 1 },
  ]
  b.qualities = [
    { uid: 'q1', id: 'crb.moonsight', level: 1, free: true, name: 'Moonsight' },
    { uid: 'q2', id: 'crb.lucky-streak', level: 2, note: 'twice' },
    { uid: 'q3', id: 'crb.butterfingers', level: 1, karma: 11 },
  ]
  b.picks = [
    { uid: 'p1', kind: 'spells', id: 'crb.glow-ward' },
    {
      uid: 'p2',
      kind: 'adeptpowers',
      id: 'crb.quick-step',
      level: 2,
      name: 'Quick Step',
      bonuses: [
        { target: 'rea', value: 1, perRating: true },
        { target: 'initDice', value: 1 },
      ],
    },
  ]
  b.martialArts = [
    { uid: 'm1', id: 'crb.glow-fist', name: 'Glow Fist', techniques: [{ uid: 'm1t', id: 'crb.glow-jab', name: 'Glow Jab' }] },
    { uid: 'm2', id: 'crb.made-up-gone', techniques: [] },
  ]
  b.purchases = [
    {
      uid: 'g1',
      kind: 'weapons',
      id: 'crb.zap-gun',
      qty: 1,
      licence: 'bought', // (its licence's fee on its cost)
      accessories: [{ uid: 'g2', kind: 'gear', id: 'crb.zap-scope', qty: 1, licence: 'unlicensed', accessories: [] }],
      snapshot: {
        id: 'crb.zap-gun',
        kind: 'weapons',
        name: 'Zap Gun',
        source: 'CRB',
        page: 251,
        attrs: { cost: '350', ar: '9/7/—/—/—' },
        parts: [{ tag: 'mode', attrs: { v: 'SS' }, text: '' }],
        text: '',
      },
    },
    {
      uid: 'g3',
      kind: 'augmentations',
      id: 'crb.glow-eyes',
      rating: 2,
      grade: 'alpha',
      qty: 1,
      bonuses: [
        { target: 'int', value: 1 },
        { target: 'skill', skill: 'crb.gab', value: 2, perRating: true },
      ],
      accessories: [],
    },
    { uid: 'g4', kind: 'armor', id: 'crb.padded-vest', qty: 1, worn: true, accessories: [], bonuses: [{ target: 'defense', value: 1 }] },
    { uid: 'g5', kind: 'gear', name: 'Lucky coin', cost: 7.5, avail: 1, essence: 0.1, qty: 3, note: 'custom', accessories: [] },
  ]
  b.contacts = [
    { uid: 'c1', name: 'Gil', archetype: 'Fixer', connection: 3, loyalty: 2, types: ['street', 'criminal'] },
    { uid: 'c2', name: 'Moe', archetype: 'Fence', connection: 1, loyalty: 1 },
  ]
  b.sins = [
    {
      uid: 's1',
      name: 'Pat Roe',
      kind: 'fake',
      rating: 3,
      gender: 'Other',
      licences: [{ name: 'Zap Gun', rating: 2 }],
      lifestyles: [
        { uid: 'l1', id: 'crb.cozy', months: 2 },
        { uid: 'l2', id: 'crb.squat', months: 1 },
      ],
    },
    { uid: 's2', name: 'Pat Doe', kind: 'real', licences: [] },
  ]
  return ch
}

test('a full made-up runner round-trips equal and validates; the codec is the same functions', async () => {
  const ch = full()
  const xml = sr6ToXml(ch, 4)
  expect(xml).toContain(`<sr6:character xmlns:sr6="${SR6_CHAR_NS}" formatVersion="1" id="r-1" rev="4" streetName="Sparky"`)
  expect(xml).toContain(' metatype="crb.glimmerkin" method="priority"')
  expect(await valid(xml)).toEqual([])
  const r = xmlToSr6(xml)
  if (!r.ok) throw new Error(r.reason)
  expect(r.character).toEqual(ch)
  expect(await valid(sr6ToXml(r.character))).toEqual([])
  expect(sr6Codec).toEqual({ tag: 'sr6:character', toXml: sr6ToXml, fromXml: xmlToSr6 })
})

test('a blank runner validates and reads back blank', async () => {
  const ch = blankSr6('lifepath', 'b-1', '2026-10-03T10:00:00.000Z')
  const xml = sr6ToXml(ch)
  expect(await valid(xml)).toEqual([])
  expect(xmlToSr6(xml)).toEqual({ ok: true, character: ch })
})

test('control characters are dropped on write; a file with one is refused with line and column, and repair removes it', async () => {
  const ch = blankSr6('priority', 'c-1', 'x')
  ch.identity.notes = 'beep\u0007boop'
  const xml = sr6ToXml(ch)
  expect(xml).not.toContain('\u0007')
  expect(await valid(xml)).toEqual([])
  const bad = xml.replace('beepboop', 'beep\u0007boop')
  expect(xmlToSr6(bad)).toEqual({ ok: false, reason: expect.stringMatching(/^Not valid XML\. Line \d+, column \d+, in <notes>: character U\+0007/) })
  const fix: string[] = []
  const r = xmlToSr6(bad, { repair: fix })
  expect(r.ok && r.character.identity.notes).toBe('beepboop')
  expect(fix).toEqual([expect.stringContaining('U+0007')])
})

test('a broken purchase is refused naming it; repair drops it and says so', () => {
  const ch = full()
  const xml = sr6ToXml(ch).replace(
    '<purchase uid="g4" kind="armor" id="crb.padded-vest" qty="1"',
    '<purchase uid="g4" kind="armor" id="crb.padded-vest" qty="x"',
  )
  expect(xml).toContain('qty="x"')
  expect(xmlToSr6(xml)).toEqual({ ok: false, reason: expect.stringContaining('purchase 3') })
  expect(xmlToSr6(xml)).toEqual({ ok: false, reason: expect.stringContaining('qty') })
  const fix: string[] = []
  const r = xmlToSr6(xml, { repair: fix })
  if (!r.ok) throw new Error(r.reason)
  expect(r.character.build.purchases.map(p => p.uid)).toEqual(['g1', 'g3', 'g5'])
  expect(fix).toEqual([expect.stringMatching(/^Dropped purchase 3: /)])
})

test('missing numbers read as 0; an unknown method or magic is refused, or repaired to priority / mundane with a note', () => {
  const root = (build: string) =>
    `<sr6:character xmlns:sr6="${SR6_CHAR_NS}" formatVersion="1" id="m" updatedAt="x"><build ${build}><attribute id="bod"/></build></sr6:character>`
  const r = xmlToSr6(root('method="karma" magic="adept"'))
  if (!r.ok) throw new Error(r.reason)
  expect(r.character.build).toMatchObject({ method: 'karma', magic: 'adept', powerPointsBought: 0, karmaToNuyen: 0 })
  expect(r.character.build.attributes.bod).toEqual({ points: 0, adjust: 0, karma: 0 })
  expect(r.character.build.priorities.magic).toBeNull()
  expect(xmlToSr6(root('method="freeform" magic="adept"'))).toEqual({ ok: false, reason: expect.stringContaining('“freeform”') })
  expect(xmlToSr6(root('method="karma" magic="dragon"'))).toEqual({ ok: false, reason: expect.stringContaining('“dragon”') })
  const fix: string[] = []
  const f = xmlToSr6(root('method="freeform" magic="dragon"'), { repair: fix })
  expect(f.ok && f.character.build).toMatchObject({ method: 'priority', magic: 'mundane' })
  expect(fix).toEqual([expect.stringContaining('“freeform”'), expect.stringContaining('“dragon”')])
})

test('the best attribute is a core one: Edge, Magic or Resonance is refused, or repaired away with a note', async () => {
  const root = (build: string) =>
    `<sr6:character xmlns:sr6="${SR6_CHAR_NS}" formatVersion="1" id="m" updatedAt="x"><build method="lifepath" magic="mundane" ${build}/></sr6:character>`
  expect(xmlToSr6(root('bestAttr="mag"'))).toEqual({ ok: false, reason: expect.stringContaining('“mag”') })
  const fix: string[] = []
  const f = xmlToSr6(root('bestAttr="str" bestExtra="edg"'), { repair: fix })
  expect(f.ok && [f.character.build.bestAttr, f.character.build.bestExtra]).toEqual(['str', undefined])
  expect(fix).toEqual([expect.stringContaining('“edg”')])
  const blank = sr6ToXml(blankSr6('lifepath', 'b-1', '2026-10-03T10:00:00.000Z'))
  expect(await valid(blank.replace('<build ', '<build bestAttr="str" '))).toEqual([])
  expect(await valid(blank.replace('<build ', '<build bestAttr="res" '))).not.toEqual([])
})

test('each game refuses the other’s runner, saying where it belongs', () => {
  expect(xmlToSr6(CA2)).toEqual({ ok: false, reason: 'This is a Shadowrun Anarchy runner. Import it on the Anarchy side.' })
  expect(xmlToCharacter(sr6ToXml(full()))).toEqual({ ok: false, reason: 'This is a Shadowrun 6 runner. Import it on the Shadowrun 6 side.' })
  expect(xmlToSr6('<x')).toEqual({ ok: false, reason: expect.stringMatching(/^Not valid XML/) })
  expect(xmlToSr6('<foo/>')).toEqual({ ok: false, reason: 'Not a Shadowrun 6 runner file.' })
  expect(xmlToSr6(sr6ToXml(full()).replace('formatVersion="1"', 'formatVersion="9"'))).toEqual({ ok: false, reason: expect.stringContaining('newer version') })
})

// ---- S3: the career ledger and the NPC block (golden files written by sr6ToXml, all made up) ----
const CAREER = readFileSync('tests/fixtures/sr6/runner-career.xml', 'utf8')
const GRUNT = readFileSync('tests/fixtures/sr6/npc-grunt.xml', 'utf8')
const read = (xml: string) => {
  const r = xmlToSr6(xml)
  if (!r.ok) throw new Error(r.reason)
  return r.character
}

test('the career runner and the NPC golden files round-trip equal, validate, and are what sr6ToXml writes', async () => {
  for (const xml of [CAREER, GRUNT]) {
    expect(await valid(xml)).toEqual([])
    const ch = read(xml)
    expect(sr6ToXml(ch)).toBe(xml.replace(/\r\n/g, '\n'))
    expect(read(sr6ToXml(ch))).toEqual(ch)
  }
  const career = read(CAREER)
  expect(career.ledger.map(e => e.type)).toEqual(['finalize', 'earn', 'advance', 'advance', 'advance', 'advance', 'advance', 'void', 'note'])
  const gun = career.ledger.find(e => e.type === 'advance' && e.advance.op === 'purchase')
  expect(gun?.type === 'advance' && gun.advance.op === 'purchase' && gun.advance.line.snapshot?.name).toBe('Zap Gun')
  expect(career.npc).toBeUndefined()
  const goon = read(GRUNT)
  expect(goon.npc).toMatchObject({ kind: 'grunt', rating: 2, group: 'Street Crew', from: { kind: 'npcs', id: 'crb.corner-goon', source: 'CRB', page: 205 } })
  expect(goon.sampleKey).toBe('CRB|crb.corner-goon')
  expect(goon.ledger).toEqual([])
  expect(GRUNT).toMatch(/<sr6:character [^>]*>\s*<npc /) // first child: the server's NPC check
})

// an older file: one <lifestyle> in <build>, before lifestyles belonged to SINs
const SIN_LINE = '<sin uid="s1" name="Wren Doe" kind="real" gender="Made-up"><lifestyle uid="ls1" id="crb.cozy" months="1"/></sin>'
const OLD = CAREER.replace(SIN_LINE, '<lifestyle id="crb.cozy" months="1"/>')

test('an older file’s one lifestyle loads onto an unnamed placeholder SIN when it has none; the flag round-trips', async () => {
  expect(OLD).not.toBe(CAREER)
  expect(await valid(OLD)).toEqual([]) // the schema still takes the older shape
  const ch = read(OLD)
  expect(ch.build.sins).toEqual([
    {
      uid: 'career-wisp-1-sin',
      name: '',
      kind: 'real',
      licences: [],
      placeholder: true,
      lifestyles: [{ uid: 'career-wisp-1-sin-crb.cozy', id: 'crb.cozy', months: 1 }],
    },
  ])
  expect('lifestyle' in ch.build).toBe(false)
  const xml = sr6ToXml(ch)
  expect(xml).not.toMatch(/<build[^>]*>[\s\S]*\n {4}<lifestyle /)
  expect(xml).toContain('<sin uid="career-wisp-1-sin" name="" kind="real" placeholder="true">')
  expect(await valid(xml)).toEqual([])
  expect(read(xml)).toEqual(ch)
})

test('an older file’s lifestyle goes on its first SIN; one with an older ledger lifestyle spend and no SIN gets a placeholder', () => {
  const two = OLD.replace(
    '<lifestyle id="crb.cozy" months="1"/>',
    '<lifestyle id="crb.cozy" months="1"/>\n    <sin uid="f1" name="Jo Fake" kind="fake" rating="2"/>\n    <sin uid="r1" name="Jo Real" kind="real"/>',
  )
  expect(read(two).build.sins.map(x => [x.uid, x.lifestyles])).toEqual([
    ['f1', [{ uid: 'f1-crb.cozy', id: 'crb.cozy', months: 1 }]],
    ['r1', undefined],
  ])
  const spend =
    '<entry id="l-x" at="2026-10-06T00:00:00.000Z" type="advance" karma="0" nuyen="100" op="lifestyle" lifestyle="crb.cozy" months="2" label="Lifestyle"/>'
  const noLife = CAREER.replace(SIN_LINE + '\n', '').replace('  </ledger>', `  ${spend}\n  </ledger>`)
  const ch = read(noLife)
  expect(ch.build.sins).toEqual([{ uid: 'career-wisp-1-sin', name: '', kind: 'real', licences: [], placeholder: true }])
  expect(currentBuild(ch).sins[0].lifestyles).toEqual([{ uid: 'career-wisp-1-sin-crb.cozy', id: 'crb.cozy', months: 2 }])
  // a file in the new shape is left as it is
  expect(read(CAREER).build.sins).toEqual([
    { uid: 's1', name: 'Wren Doe', kind: 'real', gender: 'Made-up', licences: [], lifestyles: [{ uid: 'ls1', id: 'crb.cozy', months: 1 }] },
  ])
})

test('every advance op and entry type round-trips and validates', async () => {
  const ch = full(),
    at = '2026-10-04T00:00:00.000Z'
  const q = { uid: 'lq', id: 'crb.lucky-streak', level: 1, name: 'Lucky Streak' }
  const gear = { uid: 'lg', kind: 'gear' as const, id: 'crb.zap-pellets', qty: 2, accessories: [] }
  const ops: Sr6Advance[] = [
    { op: 'attribute', target: 'agi' },
    { op: 'skill', target: 'crb.tinkering' },
    { op: 'spec', target: 'crb.gab', name: 'Fast talk' },
    { op: 'expertise', target: 'crb.gab', name: 'Fibs & <lies>' },
    { op: 'knowledge', line: { uid: 'lk', name: 'Arcade lore', kind: 'knowledge', points: 0, karma: 1 } },
    { op: 'quality', line: q },
    { op: 'buyoff', target: 'q9' },
    { op: 'buyoff', target: 'q8', line: { uid: 'q8', id: 'crb.butterfingers', level: 1 } },
    { op: 'pick', line: { uid: 'lp', kind: 'spells', id: 'crb.glow-ward', name: 'Glow Ward' } },
    { op: 'powerpoint' },
    { op: 'initiate' },
    { op: 'initiate', line: { uid: 'lm', kind: 'metamagics', id: 'crb.soft-echo' } },
    { op: 'purchase', line: gear },
    { op: 'drop', target: 'g4' },
    { op: 'drop', target: 'lg', line: gear },
    { op: 'upgrade', target: 'g4', line: { ...gear, uid: 'lu', id: 'crb.tangle-rope.3' } },
    { op: 'quality', line: { ...q, uid: 'lq2', id: 'crb.lucky-streak.2' }, target: 'q7' },
    { op: 'pick', line: { uid: 'lp2', kind: 'adeptpowers', id: 'crb.quick-step.2' }, target: 'p7' },
    { op: 'initiate', line: { uid: 'lm2', kind: 'metamagics', id: 'crb.glow-point.2' }, target: 'm7' },
    { op: 'contact', line: { uid: 'lc', name: 'Mo', archetype: 'Fence', connection: 2, loyalty: 1 } },
    { op: 'lifestyle', id: 'crb.cozy', months: 3 },
    { op: 'lifestyle', id: 'crb.squat', months: 1, sin: 's2', uid: 'll' },
    { op: 'convert', karma: 2 },
    { op: 'convert', karma: -1 },
    { op: 'other' },
    { op: 'martialart', line: { uid: 'lma', id: 'crb.glow-fist', name: 'Glow Fist', techniques: [{ uid: 'lmt', id: 'crb.glow-jab' }] } },
    { op: 'technique', target: 'lma', line: { uid: 'lmt2', id: 'crb.glow-jab', name: 'Glow Jab' } },
    { op: 'sin', line: { uid: 'ls', name: 'Pat <Fake>', kind: 'fake', rating: 2, gender: 'Other', licences: [{ name: 'Zap Gun', rating: 2 }] } },
  ]
  expect(new Set(ops.map(a => a.op))).toEqual(new Set(SR6_ADVANCE_OPS))
  ch.ledger = [
    { id: 'f', at, type: 'finalize', karma: 3, nuyen: 1250 },
    { id: 'e', at, type: 'earn', karma: 9, nuyen: 3100, run: 'Made-up & run', date: '2026-10-04' },
    ...ops.map((advance, i): Sr6LedgerEntry => ({
      id: `a${i}`,
      at,
      type: 'advance',
      advance,
      label: `Spend ${i}`,
      karma: advance.op === 'convert' ? advance.karma : i,
      nuyen: advance.op === 'convert' ? -advance.karma * 1100 : 0,
    })),
    { id: 'n', at, type: 'note', text: 'A <note>' },
    { id: 'v', at, type: 'void', eventId: 'a20', reason: 'Oops' },
  ]
  const xml = sr6ToXml(ch)
  expect(await valid(xml)).toEqual([])
  expect(read(xml)).toEqual(ch)
})

test('an unknown entry type or op is refused naming it; repair drops it; no <ledger> reads as an empty ledger', async () => {
  const xml = CAREER.replace('type="note"', 'type="x"')
  expect(xmlToSr6(xml)).toEqual({ ok: false, reason: expect.stringContaining('ledger entry 9') })
  expect(xmlToSr6(xml)).toEqual({ ok: false, reason: expect.stringContaining('“x”') })
  const fix: string[] = []
  const r = xmlToSr6(xml, { repair: fix })
  expect(r.ok && r.character.ledger).toHaveLength(8)
  expect(fix).toEqual([expect.stringMatching(/^Dropped ledger entry 9: /)])
  expect(xmlToSr6(CAREER.replace('op="attribute"', 'op="teleport"'))).toEqual({ ok: false, reason: expect.stringContaining('“teleport”') })
  const bare = CAREER.replace(/\n {2}<ledger>[\s\S]*<\/ledger>/, '')
  expect(bare).not.toContain('<ledger')
  expect(await valid(bare)).toEqual([])
  expect(read(bare).ledger).toEqual([])
})

test('the XSD wants <npc> first: an NPC block anywhere else fails', async () => {
  expect(await valid(GRUNT.replace('<npc ', '<notes>Moved</notes>\n  <npc '))).not.toEqual([])
  expect(await valid(GRUNT.replace('kind="grunt"', 'kind="dragon"'))).not.toEqual([])
  expect(await valid(GRUNT.replace(/<stat key="bod"/, '<stat key="BOD"'))).not.toEqual([])
})

test('a bonus’s minus and per-rating table round-trip, and a specialization may hold a semicolon; an older file’s specs still read', async () => {
  const ch = blankSr6('priority', 'r-2', '2026-10-03T10:00:00.000Z')
  ch.build.skills = [{ id: 'crb.gab', points: 2, karma: 0, spec: 'Fast talk', specs: ['Puns; mostly', 'Rhymes'] }]
  ch.build.purchases = [
    {
      uid: 'x',
      kind: 'gear',
      name: 'c',
      qty: 1,
      accessories: [],
      bonuses: [
        { target: 'bod', value: 1, perRating: true, minus: 1 },
        { target: 'agi', value: 1, byRating: [1, 2, 5] },
      ],
    },
  ]
  const xml = sr6ToXml(ch),
    back = xmlToSr6(xml)
  expect(back.ok && back.character.build).toEqual(ch.build)
  expect(await valid(xml)).toEqual([])
  const old = xmlToSr6(xml.replace(/<skill ([^>]*)><spec>Puns; mostly<\/spec><spec>Rhymes<\/spec><\/skill>/, '<skill $1 specs="Puns; Rhymes"/>'))
  expect(old.ok && old.character.build.skills[0].specs).toEqual(['Puns', 'Rhymes'])
})
