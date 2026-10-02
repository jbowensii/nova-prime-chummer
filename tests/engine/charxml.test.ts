import { readFileSync } from 'node:fs'
import { test, expect } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { characterToXml, xmlToCharacter } from '../../src/engine/charxml'

test('bad files are refused with a reason', () => {
  expect(xmlToCharacter('<x')).toMatchObject({ ok: false, reason: expect.stringMatching(/^Not valid XML/) })
  expect(xmlToCharacter('<?xml version="1.0"?><foo/>')).toMatchObject({ ok: false })
  expect(xmlToCharacter('<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="9" id="a" metatype="elf" level="runner" updatedAt="x"><build><attributes str="1" agi="1" wil="1" log="1" cha="1"/></build></ca2:character>'))
    .toMatchObject({ ok: false, reason: expect.stringContaining('newer version') })
})

test('a runner’s campaign survives the round trip', () => {
  const xml = '<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="a" metatype="elf" level="runner" campaign="0123456789ab" updatedAt="x"><build><attributes str="1" agi="1" wil="1" log="1" cha="1"/></build></ca2:character>'
  const r = xmlToCharacter(xml)
  expect(r.ok && r.character.campaign).toBe('0123456789ab')
  expect(r.ok && characterToXml(r.character)).toContain(' campaign="0123456789ab"')
})

test('a runner’s portrait backdrop survives the round trip; none or unknown is no backdrop', () => {
  const xml = (a: string) => `<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="a" metatype="elf" level="runner"${a} updatedAt="x"><portrait>data:image/png;base64,iVBORw0KGgo=</portrait><build><attributes str="1" agi="1" wil="1" log="1" cha="1"/></build></ca2:character>`
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

const NPC_XML = (npc: string, meta = 'elf') => `<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="a" metatype="${meta}" level="runner" updatedAt="x">${npc}<build><attributes str="9" agi="1" wil="1" log="1" cha="1"/></build></ca2:character>`

test('an NPC’s npc block survives the round trip as the root’s first child; none is a runner', async () => {
  const xsd = readFileSync('public/data/schema/character.xsd', 'utf8')
  const valid = async (xml: string) => (await validateXML({ xml: { fileName: 'n.xml', contents: xml }, schema: { fileName: 'character.xsd', contents: xsd } })).errors.map(e => e.message)
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
    if (npc) expect(back.split('\n')[2]).toBe(`  ${npc}`) // the root's first child
    else expect(back).not.toContain('<npc')
    expect(xmlToCharacter(back)).toMatchObject({ ok: true, character: { identity: { metatype: meta } } })
    expect(await valid(back)).toEqual([])
  }
  expect(await valid(NPC_XML('<npc kind="dragon" tier="prime"/>'))).not.toEqual([])
})
