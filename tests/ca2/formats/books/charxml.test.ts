import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { characterToXml, xmlToCharacter } from '../../../../src/ca2/formats/domain/charxml'
import {
  appendEvent,
  finalize,
  makeAdvance,
  makeAmpAdd,
  makeAmpModify,
  makeBuy,
  makeEarn,
  makeNote,
  voidEvent,
} from '../../../../src/ca2/runner-builder/domain/career'
import { snapshotEntries } from '../../../../src/ca2/formats/domain/file'
import { books, BOOKS_DIR, legacy, sample } from '../../../helpers'
import { describeBooks } from '../../catalog/_gate'

const xsd = readFileSync('public/data/schema/character.xsd', 'utf8')
const samples = books
  ? readdirSync(join(BOOKS_DIR, 'samples'))
      .filter(f => f.endsWith('.ca2.json'))
      .map(f => f.replace('.ca2.json', ''))
  : []

describeBooks('character XML (book samples)', () => {
  test.each(samples)('%s: XML round trip is lossless and schema-valid', async id => {
    const ch = snapshotEntries(books!, sample(id))
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
    let ch = legacy(finalize(books!, sample('lightning')))
    ch = appendEvent(ch, makeEarn(80000, 'Run <with> "quotes" & ampersands', '2086-03-01'))
    const adv = makeAdvance(books!, ch, 'skills.stealth', 6)
    ch = appendEvent(ch, adv)
    ch = appendEvent(ch, makeBuy(books!, { uid: 'sg', kind: 'weapon', name: 'Sniper rifle', specialist: true }))
    const amp = { uid: 'smart', type: 'cyberware', name: 'Smartlink', narrative: 'eye', effects: [{ ref: 'rr-spec', param: 'ranged-weapons.pistols' }] }
    ch = appendEvent(ch, makeAmpAdd(books!, ch, amp))
    ch = appendEvent(ch, makeAmpModify(books!, ch, { ...amp, effects: [{ ref: 'rr-skill', param: 'ranged-weapons' }] }))
    ch = appendEvent(ch, makeNote('Met a dragon.'))
    ch = voidEvent(ch, adv.id, 'misclick')
    ch.overrides = [{ code: 'attr.maxCount', path: 'attributes', note: 'GM said yes' }]
    const xml = characterToXml(ch)
    const back = xmlToCharacter(xml)
    expect(back.ok && back.character).toEqual(ch)
    const v = await validateXML({ xml: { fileName: 'career.xml', contents: xml }, schema: { fileName: 'character.xsd', contents: xsd } })
    expect(v.errors.map(e => e.message)).toEqual([])
  })
})
