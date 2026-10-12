import { readFileSync } from 'node:fs'
import { test, expect } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import Ajv2020 from 'ajv/dist/2020'
import { characterToXml, xmlToCharacter } from '../../src/engine/charxml'
import { exportRunners } from '../../src/engine/export'
import { cat } from '../helpers'

test('bad files are refused with a reason', () => {
  expect(xmlToCharacter('<x')).toMatchObject({ ok: false, reason: expect.stringMatching(/^Not valid XML/) })
  expect(xmlToCharacter('<?xml version="1.0"?><foo/>')).toMatchObject({ ok: false })
  expect(
    xmlToCharacter(
      '<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="9" id="a" metatype="elf" level="runner" updatedAt="x"><build><attributes str="1" agi="1" wil="1" log="1" cha="1"/></build></ca2:character>',
    ),
  ).toMatchObject({ ok: false, reason: expect.stringContaining('newer version') })
})

test('a runner’s campaign survives the round trip', () => {
  const xml =
    '<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="a" metatype="elf" level="runner" campaign="0123456789ab" updatedAt="x"><build><attributes str="1" agi="1" wil="1" log="1" cha="1"/></build></ca2:character>'
  const r = xmlToCharacter(xml)
  expect(r.ok && r.character.campaign).toBe('0123456789ab')
  expect(r.ok && characterToXml(r.character)).toContain(' campaign="0123456789ab"')
})

test('a runner’s portrait backdrop survives the round trip; none or unknown is no backdrop', () => {
  const xml = (a: string) =>
    `<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="a" metatype="elf" level="runner"${a} updatedAt="x"><portrait>data:image/png;base64,iVBORw0KGgo=</portrait><build><attributes str="1" agi="1" wil="1" log="1" cha="1"/></build></ca2:character>`
  const r = xmlToCharacter(xml(' backdrop="neon"'))
  expect(r.ok && r.character.identity.backdrop).toBe('neon')
  const back = r.ok ? characterToXml(r.character) : ''
  expect(back).toContain(' backdrop="neon"')
  expect(xmlToCharacter(back)).toMatchObject({ ok: true, character: { identity: { backdrop: 'neon', portrait: 'data:image/png;base64,iVBORw0KGgo=' } } })
  for (const old of ['', ' backdrop="plaid"']) {
    const o = xmlToCharacter(xml(old))
    expect(o.ok && 'backdrop' in o.character.identity).toBe(false)
    expect(o.ok && characterToXml(o.character)).not.toContain('backdrop=')
  }
})

test('a runner’s optional gender survives the round trip; none writes none', () => {
  const xml = (a: string) =>
    `<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="a" metatype="elf" level="runner"${a} updatedAt="x"><build><attributes str="1" agi="1" wil="1" log="1" cha="1"/></build></ca2:character>`
  const r = xmlToCharacter(xml(' gender="Made-up &amp; more"'))
  expect(r.ok && r.character.identity.gender).toBe('Made-up & more')
  const back = r.ok ? characterToXml(r.character) : ''
  expect(back).toContain(' gender="Made-up &amp; more"')
  expect(xmlToCharacter(back)).toEqual(r)
  const none = xmlToCharacter(xml(''))
  expect(none.ok && 'gender' in none.character.identity).toBe(false)
  expect(none.ok && characterToXml(none.character)).not.toContain('gender=')
})

const NPC_XML = (npc: string, meta = 'elf') =>
  `<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="a" metatype="${meta}" level="runner" updatedAt="x">${npc}<build><attributes str="9" agi="1" wil="1" log="1" cha="1"/></build></ca2:character>`

test('an NPC’s npc block survives the round trip as the root’s first child; none is a runner', async () => {
  const xsd = readFileSync('public/data/schema/character.xsd', 'utf8')
  const valid = async (xml: string) =>
    (await validateXML({ xml: { fileName: 'n.xml', contents: xml }, schema: { fileName: 'character.xsd', contents: xsd } })).errors.map(e => e.message)
  const cases = [
    ['<npc kind="npc" tier="prime" fightingSpirit="high"/>', 'human', { kind: 'npc', tier: 'prime', fightingSpirit: 'high' }],
    ['<npc kind="critter" tier="regular"/>', '', { kind: 'critter', tier: 'regular' }],
    ['', 'elf', undefined],
  ] as const
  for (const [npc, meta, want] of cases) {
    const r = xmlToCharacter(NPC_XML(npc, meta))
    if (!r.ok) throw new Error(r.reason)
    expect(r.character.npc).toEqual(want)
    if (!want) expect('npc' in r.character).toBe(false)
    expect(r.character.identity.metatype).toBe(meta)
    const back = characterToXml(r.character)
    if (npc)
      expect(back.split('\n')[2]).toBe(`  ${npc}`) // the root's first child
    else expect(back).not.toContain('<npc')
    expect(xmlToCharacter(back)).toMatchObject({ ok: true, character: { identity: { metatype: meta } } })
    expect(await valid(back)).toEqual([])
  }
  expect(await valid(NPC_XML('<npc kind="dragon" tier="prime"/>'))).not.toEqual([])
})

test('an unknown npc block reads as a regular NPC; repair says what it fixed; the result validates', async () => {
  const xml = NPC_XML('<npc kind="dragon" tier="x" fightingSpirit="wild"/>')
  const plain = xmlToCharacter(xml)
  expect(plain.ok && plain.character.npc).toEqual({ kind: 'npc', tier: 'regular' })
  const fix: string[] = []
  const r = xmlToCharacter(xml, { repair: fix })
  if (!r.ok) throw new Error(r.reason)
  expect(r.character.npc).toEqual({ kind: 'npc', tier: 'regular' })
  expect(fix).toEqual([expect.stringContaining('"dragon"'), expect.stringContaining('"x"'), expect.stringContaining('"wild"')])
  const back = characterToXml(r.character)
  const xsd = readFileSync('public/data/schema/character.xsd', 'utf8')
  expect((await validateXML({ xml: { fileName: 'n.xml', contents: back }, schema: { fileName: 'character.xsd', contents: xsd } })).errors).toEqual([])
  const check = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(
    JSON.parse(readFileSync('public/data/schema/export.schema.json', 'utf8')),
  )
  const f = JSON.parse(JSON.stringify(exportRunners(cat, [r.character], { descriptions: true, now: 'x', appVersion: '0' })))
  expect(check(f), JSON.stringify(check.errors)).toBe(true)
  expect(f.runners[0].npc).toEqual({ kind: 'npc', tier: 'regular' })
  const missing = xmlToCharacter(NPC_XML('<npc/>'))
  expect(missing.ok && missing.character.npc).toEqual({ kind: 'npc', tier: 'regular' })
})

test('NPCs get no free starting gear; runners do', () => {
  const npc = xmlToCharacter(NPC_XML('<npc kind="critter" tier="regular"/>', ''))
  expect(npc.ok && npc.character.build.items).toEqual([])
  const runner = xmlToCharacter(NPC_XML(''))
  expect(runner.ok && runner.character.build.items.map(i => i.starting)).toEqual(expect.arrayContaining(['commlink', 'fake-sin']))
})

test('a runner’s own switches for the optional rules survive the round trip and validate', async () => {
  const xml =
    '<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="a" metatype="elf" level="runner" updatedAt="x"><build><attributes str="1" agi="1" wil="1" log="1" cha="1"/></build><optionalRule id="optional-a" on="true"/><optionalRule id="optional-b" on="false"/></ca2:character>'
  const r = xmlToCharacter(xml)
  expect(r.ok && r.character.optionalRules).toEqual({ 'optional-a': true, 'optional-b': false })
  const back = r.ok ? characterToXml(r.character) : ''
  expect(xmlToCharacter(back)).toMatchObject({ ok: true, character: { optionalRules: { 'optional-a': true, 'optional-b': false } } })
  const xsd = readFileSync('public/data/schema/character.xsd', 'utf8')
  expect((await validateXML({ xml: { fileName: 'o.xml', contents: back }, schema: { fileName: 'character.xsd', contents: xsd } })).errors).toEqual([])
  const none = xmlToCharacter(xml.replace(/<optionalRule[^>]*\/>/g, ''))
  expect(none.ok && 'optionalRules' in none.character).toBe(false)
})
