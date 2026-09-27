import { readFileSync, readdirSync } from 'node:fs'
import { test, expect } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { characterToXml, xmlToCharacter } from '../../src/engine/charxml'
import { appendEvent, finalize, makeAdvance, makeAmpAdd, makeAmpModify, makeBuy, makeEarn, makeNote, voidEvent } from '../../src/engine/career'
import { snapshotEntries } from '../../src/engine/file'
import { cat, sample } from '../helpers'

const xsd = readFileSync('public/data/schema/character.xsd', 'utf8')
const samples = readdirSync('public/samples').filter(f => f.endsWith('.ca2.json')).map(f => f.replace('.ca2.json', ''))

test.each(samples)('%s: XML round trip is lossless and schema-valid', async id => {
  const ch = snapshotEntries(cat, sample(id))
  const xml = characterToXml(ch, 3)
  const back = xmlToCharacter(xml)
  expect(back.ok).toBe(true)
  if (!back.ok) return
  expect(back.rev).toBe(3)
  expect(back.character).toEqual(ch)
  const v = await validateXML({ xml: { fileName: `${id}.xml`, contents: xml }, schema: { fileName: 'character.xsd', contents: xsd } })
  expect(v.errors.map(e => e.message)).toEqual([])
})

test('career events of every kind survive the round trip', async () => {
  let ch = finalize(cat, sample('lightning'))
  ch = appendEvent(ch, makeEarn(80000, 'Run <with> "quotes" & ampersands', '2086-03-01'))
  const adv = makeAdvance(cat, ch, 'skills.stealth', 6)
  ch = appendEvent(ch, adv)
  ch = appendEvent(ch, makeBuy(cat, { uid: 'sg', kind: 'weapon', name: 'Sniper rifle', specialist: true }))
  const amp = { uid: 'smart', type: 'cyberware', name: 'Smartlink', narrative: 'eye', effects: [{ ref: 'rr-spec', param: 'ranged-weapons.pistols' }] }
  ch = appendEvent(ch, makeAmpAdd(cat, ch, amp))
  ch = appendEvent(ch, makeAmpModify(cat, ch, { ...amp, effects: [{ ref: 'rr-skill', param: 'ranged-weapons' }] }))
  ch = appendEvent(ch, makeNote('Met a dragon.'))
  ch = voidEvent(ch, adv.id, 'misclick')
  ch.overrides = [{ code: 'attr.maxCount', path: 'attributes', note: 'GM said yes' }]
  const xml = characterToXml(ch)
  const back = xmlToCharacter(xml)
  expect(back.ok && back.character).toEqual(ch)
  const v = await validateXML({ xml: { fileName: 'career.xml', contents: xml }, schema: { fileName: 'character.xsd', contents: xsd } })
  expect(v.errors.map(e => e.message)).toEqual([])
})

test('bad files are refused with a reason', () => {
  expect(xmlToCharacter('<x')).toMatchObject({ ok: false, reason: 'Not valid XML.' })
  expect(xmlToCharacter('<?xml version="1.0"?><foo/>')).toMatchObject({ ok: false })
  expect(xmlToCharacter('<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="9" id="a" metatype="elf" level="runner" updatedAt="x"><build><attributes str="1" agi="1" wil="1" log="1" cha="1"/></build></ca2:character>'))
    .toMatchObject({ ok: false, reason: expect.stringContaining('newer version') })
})
