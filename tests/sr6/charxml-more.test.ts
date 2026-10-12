// The SR6 runner file's reader on sparse and broken files (src/sr6/engine/charxml.ts): defaults, each refusal, the repair
// notes for fixed values, and the optional blocks (printed numbers, rules, migrated ids, NPC stats). Invented data.
import { expect, test } from 'vitest'
import { xmlToSr6 } from '../../src/sr6/engine/charxml'

const NS = 'xmlns:sr6="urn:chummer-sr6:character:1"'
const doc = (root = 'id="r"', body = '<build method="priority" magic="mundane"/>') => `<sr6:character ${NS} formatVersion="1" ${root}>${body}</sr6:character>`
const read = (xml: string, repair?: string[]) => xmlToSr6(xml, repair ? { repair } : {})
const good = (xml: string, repair?: string[]) => {
  const r = read(xml, repair)
  if (!r.ok) throw new Error(r.reason)
  return r.character
}

test('each missing top-level piece is refused saying what', () => {
  expect(read(`<sr6:character ${NS} id="r"><build/></sr6:character>`)).toEqual({ ok: false, reason: 'The <character> element has no formatVersion.' })
  expect(read(`<sr6:character ${NS} formatVersion="9" id="r"><build/></sr6:character>`)).toMatchObject({
    ok: false,
    reason: expect.stringContaining('newer version'),
  })
  expect(read(doc('metatype="x"'))).toEqual({ ok: false, reason: 'The <character> element has no id.' })
  expect(read(doc('id="r"', ''))).toEqual({ ok: false, reason: 'The file has no <build> element.' })
  expect(read('<character/>')).toEqual({ ok: false, reason: 'Not a Shadowrun 6 runner file.' })
})

test('a sparse file reads as a blank priority runner with its defaults', () => {
  const ch = good(doc())
  expect(ch).toMatchObject({
    formatVersion: 1,
    id: 'r',
    ledger: [],
    overrides: [],
    identity: { name: '', streetName: '', background: '', notes: '', metatype: '' },
  })
  expect(ch.build).toMatchObject({ method: 'priority', magic: 'mundane', powerPointsBought: 0, initiation: 0, submersion: 0, karmaToNuyen: 0, metatype: '' })
  expect(ch).not.toHaveProperty('final')
  expect(ch).not.toHaveProperty('printed')
  expect(ch).not.toHaveProperty('rules')
  expect(ch).not.toHaveProperty('migrated')
  expect(ch).not.toHaveProperty('npc')
  expect(ch).not.toHaveProperty('house')
  expect(ch.updatedAt).toMatch(/^\d{4}-/)
})

test('only one of the final numbers is enough; the other is 0', () => {
  expect(good(doc('id="r" finalKarma="4"')).final).toEqual({ karma: 4, nuyen: 0 })
  expect(good(doc('id="r" finalNuyen="900"')).final).toEqual({ karma: 0, nuyen: 900 })
})

test('lines with missing attributes read as empty ones; an older file’s specs attribute splits on semicolons; a SIN and its licences and lifestyles', () => {
  const ch = good(
    doc(
      'id="r"',
      `<build method="priority" magic="mundane">
    <skill/><skill id="crb.gab" specs="Haggling; Bluffing;;"/>
    <knowledge kind="knowledge">Maps</knowledge><quality/><pick kind="spells"/><martialart><technique/></martialart>
    <contact/><sin kind="real"><licence/><lifestyle/></sin><purchase kind="gear"/>
    <lifemodule><choice pick="edg"/><choice index="2" pick="agi"/></lifemodule></build>`,
    ),
  )
  const b = ch.build
  expect(b.skills).toEqual([
    { id: '', points: 0, karma: 0 },
    { id: 'crb.gab', points: 0, karma: 0, specs: ['Haggling', 'Bluffing'] },
  ])
  expect(b.knowledge).toEqual([{ uid: '', name: 'Maps', kind: 'knowledge', points: 0, karma: 0 }])
  expect(b.qualities).toEqual([{ uid: '', id: '', level: 1 }])
  expect(b.picks).toEqual([{ uid: '', kind: 'spells', id: '' }])
  expect(b.martialArts).toEqual([{ uid: '', id: '', techniques: [{ uid: '', id: '' }] }])
  expect(b.contacts).toEqual([{ uid: '', name: '', archetype: '', connection: 0, loyalty: 0 }])
  expect(b.sins).toEqual([{ uid: '', name: '', kind: 'real', licences: [{ name: '', rating: 0 }], lifestyles: [{ uid: '', id: '', months: 0 }] }])
  expect(b.purchases).toEqual([{ uid: '', kind: 'gear', qty: 1, accessories: [] }])
  expect(b.lifepath).toEqual([{ id: '', choices: { 0: 'edg', 2: 'agi' } }])
})

test('a number that is not a number is refused naming it', () => {
  expect(read(doc('id="r"', '<build method="priority" magic="mundane"><skill id="s" points="many"/></build>'))).toEqual({
    ok: false,
    reason: 'Couldn’t read skill 1: points="many" isn’t a number.',
  })
  expect(read(doc('id="r"', '<build method="priority" magic="mundane"><skill id="s" points=" "/></build>'))).toMatchObject({ ok: false })
  expect(read(doc('id="r"', '<build method="priority" magic="mundane"><skill id="s" points="Infinity"/></build>'))).toMatchObject({ ok: false })
})

test('a value outside its list is refused with the list; in repair it is set to a fallback or left out, with a note', () => {
  expect(read(doc('id="r"', '<build method="telepathy"/>'))).toMatchObject({ ok: false, reason: expect.stringContaining('method “telepathy” (not one of') })
  expect(read(doc('id="r"', '<build method="priority" magic="mundane"><knowledge kind="rumor">x</knowledge></build>'))).toMatchObject({
    ok: false,
    reason: expect.stringContaining('knowledge kind “rumor”'),
  })
  const fix: string[] = []
  const ch = good(doc('id="r"', '<build method="telepathy" magic="chaos" mentorAdvantage="both" drainAttr="str" bestAttr="mag" bestExtra="zzz"/>'), fix)
  expect(ch.build).toMatchObject({ method: 'priority', magic: 'mundane' })
  expect(ch.build.mentorAdvantage).toBeUndefined()
  expect(ch.build.drainAttr).toBeUndefined()
  expect(ch.build.bestAttr).toBeUndefined()
  expect(fix).toEqual([
    'The method “telepathy” isn’t known: set to priority.',
    'The magic kind “chaos” isn’t known: set to mundane.',
    'The mentor advantage “both” isn’t known: left out.',
    'The drain attribute “str” isn’t known: left out.',
    'The best attribute “mag” isn’t known: left out.',
    'The best attribute “zzz” isn’t known: left out.',
  ])
  expect(good(doc('id="r"', '<build method="priority" magic="mundane" mentorAdvantage="adept" drainAttr="log"/>')).build).toMatchObject({
    mentorAdvantage: 'adept',
    drainAttr: 'log',
  })
})

test('bonuses: a skill bonus must name its skill; an unknown switch or whose is dropped', () => {
  expect(
    read(doc('id="r"', '<build method="priority" magic="mundane"><purchase kind="gear"><bonus target="skill" value="1"/></purchase></build>')),
  ).toMatchObject({ ok: false, reason: expect.stringContaining('a skill bonus names no skill') })
  const ch = good(
    doc(
      'id="r"',
      '<build method="priority" magic="mundane"><purchase kind="gear"><bonus target="skill" skill="crb.gab" value="2" perRating="true" when="always" spec="x" switch="activated" affects="caster"/>' +
        '<bonus target="bod" value="1" switch="bogus" affects="everyone" skill="ignored"/></purchase></build>',
    ),
  )
  expect(ch.build.purchases[0].bonuses).toEqual([
    { target: 'skill', skill: 'crb.gab', value: 2, perRating: true, when: 'always', spec: 'x', switch: 'activated', affects: 'caster' },
    { target: 'bod', value: 1 },
  ])
})

test('ledger entries: the id is required, the amounts default to 0, each type reads its own body', () => {
  expect(read(doc('id="r"', '<build method="priority" magic="mundane"/><ledger><entry type="note"/></ledger>'))).toEqual({
    ok: false,
    reason: 'Couldn’t read ledger entry 1: no id.',
  })
  const ch = good(
    doc(
      'id="r"',
      `<build method="priority" magic="mundane"/><ledger>
    <entry id="a" type="finalize"/><entry id="b" type="earn">A run</entry><entry id="c" type="note">Hi</entry>
    <entry id="d" type="void" event="a">Oops</entry><entry id="e" type="advance" op="other"/></ledger>`,
    ),
  )
  expect(ch.ledger).toEqual([
    { id: 'a', at: '', type: 'finalize', karma: 0, nuyen: 0 },
    { id: 'b', at: '', type: 'earn', karma: 0, nuyen: 0, run: 'A run', date: '' },
    { id: 'c', at: '', type: 'note', text: 'Hi' },
    { id: 'd', at: '', type: 'void', eventId: 'a', reason: 'Oops' },
    { id: 'e', at: '', type: 'advance', advance: { op: 'other' }, label: '', karma: 0, nuyen: 0 },
  ])
  expect(read(doc('id="r"', '<build method="priority" magic="mundane"/><ledger><entry id="d" type="void"/></ledger>'))).toMatchObject({
    ok: false,
    reason: expect.stringContaining('no event'),
  })
})

test('an advance needs what it names: a target, a name, a line; a lifestyle spend needs its lifestyle', () => {
  const adv = (inner: string) => read(doc('id="r"', `<build method="priority" magic="mundane"/><ledger><entry id="a" type="advance" ${inner}</entry></ledger>`))
  expect(adv('op="skill">')).toMatchObject({ ok: false, reason: expect.stringContaining('no target') })
  expect(adv('op="spec" target="s">')).toMatchObject({ ok: false, reason: expect.stringContaining('no name') })
  expect(adv('op="knowledge">')).toMatchObject({ ok: false, reason: expect.stringContaining('no <knowledge> inside the entry') })
  expect(adv('op="lifestyle" months="2">')).toMatchObject({ ok: false, reason: expect.stringContaining('no lifestyle') })
  const ok = good(
    doc(
      'id="r"',
      '<build method="priority" magic="mundane"/><ledger><entry id="a" type="advance" op="lifestyle" lifestyle="crb.cozy" months="2" sin="s1" uid="u1"/></ledger>',
    ),
  )
  expect(ok.ledger[0]).toMatchObject({ advance: { op: 'lifestyle', id: 'crb.cozy', months: 2, sin: 's1', uid: 'u1' } })
  const conv = good(
    doc('id="r"', '<build method="priority" magic="mundane"/><ledger><entry id="a" type="advance" op="convert" karma="-3" nuyen="3000"/></ledger>'),
  )
  expect(conv.ledger[0]).toMatchObject({ advance: { op: 'convert', karma: -3 }, karma: -3, nuyen: 3000 })
})

test('printed numbers, runner rules and migrated ids are read with their defaults', () => {
  const ch = good(
    doc(
      'id="r"',
      `<build method="priority" magic="mundane"/><printed><value key="rea" value="4(6)"/><value/></printed>
    <rules><setting key="a" value="1" assumed="true" source="CRB" page="9"/><setting/></rules>
    <migrated from="gear/x" to="gear/y" at="t"/><migrated/>`,
    ),
  )
  expect(ch.printed).toEqual({ source: '', page: 0, values: { rea: '4(6)', '': '' } })
  expect(ch.rules).toEqual([
    { key: 'a', value: '1', assumed: true, source: 'CRB', page: 9 },
    { key: '', value: '' },
  ])
  expect(ch.migrated).toEqual([
    { from: 'gear/x', to: 'gear/y', at: 't' },
    { from: '', to: '', at: '' },
  ])
})

test('an NPC block: a kind, stats with valid keys and short values, lines of a known part, and where it came from', () => {
  const fix: string[] = []
  const npc = (inner: string, attrs = 'kind="grunt"') => doc('id="r"', `<npc ${attrs}>${inner}</npc><build method="priority" magic="mundane"/>`)
  const ch = good(
    npc(
      '<stat key="bod" value="4"/><line part="skills">Firearms 5</line>',
      'kind="spirit" rating="3" group="g" fromKind="critters" fromId="crb.fuzzbeast" fromName="Fuzzbeast" fromSource="CRB" fromPage="221"',
    ),
  )
  expect(ch.npc).toEqual({
    kind: 'spirit',
    rating: 3,
    group: 'g',
    from: { kind: 'critters', id: 'crb.fuzzbeast', name: 'Fuzzbeast', source: 'CRB', page: 221 },
    stats: { bod: '4' },
    lines: [{ part: 'skills', text: 'Firearms 5' }],
  })
  expect(good(npc('', 'kind="grunt" fromKind="critters"')).npc!.from).toEqual({ kind: 'critters', id: '', name: '', source: '', page: 0 })
  expect(read(npc('<stat key="Bad Key" value="1"/>'))).toMatchObject({ ok: false, reason: expect.stringContaining('isn’t 1 to 20 letters a to z') })
  expect(read(npc(`<stat key="bod" value="${'x'.repeat(81)}"/>`))).toMatchObject({ ok: false, reason: expect.stringContaining('longer than 80') })
  expect(read(npc('', 'kind="grunt" fromKind="nope"'))).toMatchObject({ ok: false, reason: expect.stringContaining('NPC catalog kind') })
  expect(read(npc('<line part="nope">x</line>'))).toMatchObject({ ok: false, reason: expect.stringContaining('line part') })
  const fixed = good(npc('<stat key="Bad" value="1"/><stat key="ok" value="2"/><line part="nope">x</line>', 'kind="robot"'), fix)
  expect(fixed.npc).toMatchObject({ kind: 'grunt', stats: { ok: '2' }, lines: [] })
  expect(fix).toEqual([
    'Dropped stat 1: the key “Bad” isn’t 1 to 20 letters a to z.',
    'The NPC kind “robot” isn’t known: set to grunt.',
    'Dropped line 1: line part “nope” (not one of skills, powers, optionalPowers, weaknesses, attacks, augmentations, gear, weapons).',
  ])
})

test('house entries of a kind the catalog lacks are refused, or dropped in repair', () => {
  const body = '<build method="priority" magic="mundane"/><house><gear id="crb.g" source="CRB" page="1"><name>G</name></gear><mystery/></house>'
  expect(read(doc('id="r"', body))).toMatchObject({ ok: false, reason: expect.stringContaining('a <mystery> isn’t a catalog entry') })
  const fix: string[] = []
  const ch = good(doc('id="r"', body), fix)
  expect(ch.house?.map(e => e.id)).toEqual(['crb.g'])
  expect(fix).toHaveLength(1)
})
