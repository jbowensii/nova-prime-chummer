import { test, expect } from 'vitest'
import { characterToXml, xmlToCharacter } from '../../src/engine/charxml'

test('bad files are refused with a reason', () => {
  expect(xmlToCharacter('<x')).toMatchObject({ ok: false, reason: 'Not valid XML.' })
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
