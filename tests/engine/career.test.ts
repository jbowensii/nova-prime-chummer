// 0.5.5 career model: Finalize is a check and a ledger entry; nothing is locked; every build change after it is logged
// with its price (a removal refunds); balance = budget + earnings - build price (+ carry from a pre-0.5.5 ledger).
// Made-up catalog (tests/fixtures/mini) and invented runners only.
import { readFileSync } from 'node:fs'
import { test, expect } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import {
  appendEvent, balance, changeText, currentBuild, finalize, logChange, makeAdvance, makeAmpAdd, makeAmpModify, makeBuy, makeEarn,
  makeSell, reopen, settle, voidEvent,
} from '../../src/engine/career'
import { characterToXml, xmlToCharacter } from '../../src/engine/charxml'
import { blankCharacter, setRealSin } from '../../src/engine/file'
import { price } from '../../src/engine/price'
import { validate } from '../../src/engine/validate'
import type { Character } from '../../src/model/types'
import { cat, legacy } from '../helpers'

const P = cat.pricing
const runner = () => {
  const ch = blankCharacter()
  ch.identity.streetName = 'Test Pilot'
  ch.build.attributes = { str: 2, agi: 3, wil: 2, log: 2, cha: 2 }
  ch.build.skills = [{ id: 'stealth', rating: 2, specs: [] }]
  ch.build.items.push({ uid: 'knife', kind: 'weapon', name: 'Made-up knife' })
  return ch
}
/** an edit the way the editor makes one: a changed copy, then logged */
const edit = (ch: Character, fn: (d: Character) => void) => { const d = structuredClone(ch); fn(d); return logChange(cat, ch, d) }
const changes = (ch: Character) => ch.career.filter(e => e.type === 'change')
const skill = (ch: Character, id: string) => ch.build.skills.find(s => s.id === id)!

test('Finalize: a "Creation finished" entry with what is left; the balance is budget - build price', () => {
  const ch = finalize(cat, runner())
  const left = price(cat, runner()).remaining
  expect(ch.career).toEqual([expect.objectContaining({ type: 'finalize', remaining: left })])
  expect([ch.carry, ch.finalRemaining, balance(cat, ch)]).toEqual([0, left, left])
})

test('after Finalize every change is logged and priced: a raise charges, lowering refunds, stepping merges into one line', () => {
  let ch = finalize(cat, runner())
  const start = balance(cat, ch)
  ch = edit(ch, d => { skill(d, 'stealth').rating = 3 })
  ch = edit(ch, d => { skill(d, 'stealth').rating = 4 })
  expect(changes(ch)).toHaveLength(1)
  expect(changes(ch)[0]).toMatchObject({ cost: 2 * P.skillLow })
  expect(changeText((changes(ch)[0] as { changes: never[] }).changes[0])).toBe(`${cat.skills.get('stealth')!.name}: 2 → 4`)
  expect(balance(cat, ch)).toBe(start - 2 * P.skillLow)
  ch = edit(ch, d => { skill(d, 'stealth').rating = 1 }) // below where it was: the entry now refunds
  expect(changes(ch)[0]).toMatchObject({ cost: -P.skillLow })
  expect(balance(cat, ch)).toBe(start + P.skillLow)
  ch = edit(ch, d => { skill(d, 'stealth').rating = 2 }) // back where it was: nothing left to log
  expect(changes(ch)).toHaveLength(0)
  expect(balance(cat, ch)).toBe(start)
})

test('nothing is locked: removing an item refunds its price and the nuyen can be spent again', () => {
  let ch = appendEvent(finalize(cat, runner()), makeEarn(1000, 'Made-up job', '2086-01-01'))
  const start = balance(cat, ch)
  ch = edit(ch, d => { d.build.items = d.build.items.filter(i => i.uid !== 'knife') })
  expect(balance(cat, ch)).toBe(start + P.weaponStandard)
  ch = edit(ch, d => { d.build.items.push({ uid: 'rope', kind: 'gear', name: 'Made-up rope' }) })
  expect(balance(cat, ch)).toBe(start + P.weaponStandard - P.equipment)
  expect(changes(ch).map(e => (e as { changes: never[] }).changes.map(changeText))).toEqual([['Removed Made-up knife'], ['Added Made-up rope']])
  expect(changes(ch).map(e => (e as { cost: number }).cost)).toEqual([-P.weaponStandard, P.equipment])
})

test('different things in one edit are one entry; layout and identity edits log nothing', () => {
  let ch = finalize(cat, runner())
  ch = edit(ch, d => { d.build.attributes.agi = 4; d.build.skills.push({ id: 'athletics', rating: 1, specs: [] }) })
  expect(changes(ch)).toHaveLength(1)
  ch = edit(ch, d => { d.identity.notes = 'x'; d.build.knowledgeHidden = ['k'] })
  expect(changes(ch)).toHaveLength(1)
})

test('creation caps apply before Finalize only', () => {
  const draft = runner()
  draft.build.skills = [{ id: 'stealth', rating: 6, specs: [] }] // made-up Pro cap: 4
  expect(validate(cat, draft).some(v => v.code === 'skill.cap')).toBe(true)
  const ch = edit(finalize(cat, runner()), d => { skill(d, 'stealth').rating = 6 })
  expect(validate(cat, ch).some(v => v.code === 'skill.cap')).toBe(false)
})

test('the real SIN can be ticked after Finalize; it is logged, free', () => {
  let ch = finalize(cat, runner())
  const start = balance(cat, ch)
  ch = edit(ch, d => setRealSin(cat, d.build, true))
  const lines = (changes(ch)[0] as { changes: never[]; cost: number })
  expect(lines.changes.map(changeText)).toEqual(expect.arrayContaining(['Added SINner (rating 0)', 'Added Real SIN']))
  expect([lines.cost, balance(cat, ch)]).toEqual([0, start])
  expect(validate(cat, ch).some(v => v.code === 'amp.qualityAfterCreation')).toBe(false) // house rule: not a Quality buy
})

test('a Quality added after Finalize needs a GM', () => {
  const ch = edit(finalize(cat, runner()), d => { d.build.amps.push({ uid: 'q', type: 'quality', name: 'Made-up luck', narrative: '', effects: [] }) })
  expect(validate(cat, ch).some(v => v.code === 'amp.qualityAfterCreation' && v.path === 'amps.q')).toBe(true)
})

test('reopen: while no earnings are recorded; the log stays, with a note', () => {
  const ch = edit(finalize(cat, runner()), d => { skill(d, 'stealth').rating = 3 })
  const back = reopen(ch)
  expect([back.finalizedAt, back.carry, back.finalRemaining]).toEqual([undefined, undefined, undefined])
  expect(back.career.at(-1)).toMatchObject({ type: 'note', text: 'Creation reopened' })
  expect(() => reopen(appendEvent(ch, makeEarn(500, 'Made-up job', '2086-01-01')))).toThrow(/earnings/)
  // a voided payout doesn't count
  const e = makeEarn(500, 'Made-up job', '2086-01-01')
  expect(() => reopen(voidEvent(appendEvent(ch, e), e.id, 'typo'))).not.toThrow()
})

test('a pre-0.5.5 runner converts: build folded, history and earnings kept, balance unchanged; settling twice is the same', () => {
  let old = legacy(finalize(cat, runner()))
  old = appendEvent(old, makeEarn(40000, 'Made-up run', '2086-02-01'))
  old = appendEvent(old, makeAdvance(cat, old, 'skills.stealth', 3))
  old = appendEvent(old, makeBuy(cat, { uid: 'rope', kind: 'gear', name: 'Made-up rope' }))
  old = appendEvent(old, makeSell('knife')) // the old ledger gave nothing back for it
  const amp = { uid: 'ware', type: 'cyberware', name: 'Made-up ware', narrative: '', effects: [{ ref: 'rr-skill', param: 'stealth' }] }
  const add = makeAmpAdd(cat, old, amp) as { cost: number }
  old = appendEvent(old, add as never)
  old = appendEvent(old, makeAmpModify(cat, old, { ...amp, effects: [] })) // lowered: no refund then
  const oldBalance = 40000 + old.finalRemaining! - P.skillLow - P.equipment - add.cost
  expect(balance(cat, old)).toBe(oldBalance)

  const s = settle(cat, old)
  expect(settle(cat, s)).toBe(s)
  expect(s.build).toEqual(currentBuild(old))
  expect(s.build.items.map(i => i.uid)).not.toContain('knife')
  expect(s.career[0]).toMatchObject({ type: 'finalize', remaining: old.finalRemaining })
  expect(s.career.slice(1)).toEqual(old.career)
  expect(balance(cat, s)).toBe(oldBalance)
  expect(s.carry).not.toBe(0) // the sold knife and the lowered amp weren't refunded then; they stay that way
  // from here on it works like any finalized runner
  const next = edit(s, d => { d.build.items = d.build.items.filter(i => i.uid !== 'rope') })
  expect(balance(cat, next)).toBe(oldBalance + P.equipment)
  // saved and read back
  const back = xmlToCharacter(characterToXml(s))
  expect(back.ok && balance(cat, back.character)).toBe(oldBalance)
})

test('an unchanged pre-0.5.5 runner keeps its balance to the nuyen', () => {
  const old = legacy(finalize(cat, runner()))
  const s = settle(cat, old)
  expect([s.carry, balance(cat, s), balance(cat, old)]).toEqual([0, old.finalRemaining, old.finalRemaining])
  const paid = appendEvent(old, makeEarn(12345, 'Made-up run', '2086-02-01'))
  expect(balance(cat, settle(cat, paid))).toBe(old.finalRemaining! + 12345)
})

test('the new entries and carry survive XML and match the schema', async () => {
  let ch = finalize(cat, runner())
  ch = edit(ch, d => { skill(d, 'stealth').rating = 3; d.build.items.push({ uid: 'rope', kind: 'gear', name: 'Rope & <knots>' }) })
  ch = { ...ch, carry: -2500 }
  const xml = characterToXml(ch)
  const back = xmlToCharacter(xml)
  expect(back.ok && back.character).toEqual(ch)
  const xsd = readFileSync('public/data/schema/character.xsd', 'utf8')
  const v = await validateXML({ xml: { fileName: 'c.xml', contents: xml }, schema: { fileName: 'character.xsd', contents: xsd } })
  expect(v.errors.map(e => e.message)).toEqual([])
})
