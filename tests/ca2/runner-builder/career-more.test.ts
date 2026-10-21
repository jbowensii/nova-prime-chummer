// The Anarchy career ledger's older events and its change log's edges (src/ca2/runner-builder/domain/career.ts): runners finalized before
// 0.5.5 replay advances, buys, sales, amps, specializations and knowledge on their baseline; the change log words each kind
// of difference; voids and reopening have rules. Invented runners on the made-up catalog.
import { expect, test } from 'vitest'
import {
  activeEvents,
  appendEvent,
  applyEvent,
  balance,
  changeText,
  currentBuild,
  diffBuild,
  finalize,
  ledgerRunning,
  logChange,
  makeAdvance,
  makeAmpAdd,
  makeAmpModify,
  makeBuy,
  makeEarn,
  makeKnowledge,
  makeNote,
  makeSell,
  makeSpec,
  qualitiesAddedAfter,
  recordedPrices,
  reopen,
  settle,
  sinceFinalize,
  voidedIds,
  voidEvent,
} from '../../../src/ca2/runner-builder/domain/career'
import { blankCharacter } from '../../../src/ca2/formats/domain/file'
import type { AmpEntry, Build, Character } from '../../../src/ca2/formats/domain/types'
import { cat, legacy } from '../../helpers'

const runner = (): Character => {
  const ch = blankCharacter()
  ch.build.attributes = { str: 2, agi: 3, wil: 2, log: 2, cha: 2 }
  ch.build.skills = [{ id: 'stealth', rating: 2, specs: [] }]
  ch.build.items.push({ uid: 'knife', kind: 'weapon', name: 'Made-up knife' })
  return ch
}
const old = () => legacy(finalize(cat, runner()))
const amp = (uid: string, name = 'Rush'): AmpEntry => ({
  uid,
  catalogId: 'test.rush',
  type: 'equipment',
  name,
  narrative: '',
  effects: cat.amps.get('test.rush')!.effects,
  linkedItem: 'i',
})

test('an old advance sets an attribute or a skill (a new skill joins with no specializations); other paths change nothing', () => {
  const b = structuredClone(runner().build)
  applyEvent(b, makeAdvance(cat, runner(), 'attributes.agi', 4))
  applyEvent(b, makeAdvance(cat, runner(), 'skills.stealth', 3))
  applyEvent(b, { id: 'e', at: 'x', type: 'advance', path: 'skills.firearms', from: 0, to: 2, cost: 8 })
  applyEvent(b, { id: 'e', at: 'x', type: 'advance', path: 'edge.x', from: 0, to: 2, cost: 8 })
  expect(b.attributes.agi).toBe(4)
  expect(b.skills).toEqual([
    { id: 'stealth', rating: 3, specs: [] },
    { id: 'firearms', rating: 2, specs: [] },
  ])
})

test('an old advance is priced from the runner’s current build; a path that cannot advance is an error', () => {
  const ch = runner()
  const e = makeAdvance(cat, ch, 'attributes.agi', 4)
  expect(e).toMatchObject({ type: 'advance', path: 'attributes.agi', from: 3, to: 4 })
  expect((e as { cost: number }).cost).toBeGreaterThan(0)
  expect(makeAdvance(cat, ch, 'skills.stealth', 3)).toMatchObject({ from: 2, to: 3 })
  expect(makeAdvance(cat, ch, 'skills.firearms', 1)).toMatchObject({ from: 0, to: 1 })
  expect(() => makeAdvance(cat, ch, 'edge.x', 1)).toThrow('cannot advance "edge.x"')
})

test('old buys, sales, amps and specializations fold into the build; a specialization on a missing skill adds the skill at 0', () => {
  const ch = old()
  const events = [
    makeBuy(cat, { uid: 'gun', kind: 'weapon', name: 'Made-up gun' }),
    makeSell('knife'),
    makeAmpAdd(cat, ch, amp('a1')),
    makeSpec(cat, 'stealth', 'shadowing'),
    makeSpec(cat, 'firearms', 'pistols'),
  ]
  const later = events.reduce(appendEvent, ch)
  const b = currentBuild(later)
  expect(b.items.map(i => i.uid)).toEqual(['start-fake-sin', 'start-commlink', 'gun'])
  expect(b.amps.map(a => a.uid)).toEqual(['a1'])
  expect(b.skills).toEqual([
    { id: 'stealth', rating: 2, specs: ['shadowing'] },
    { id: 'firearms', rating: 0, specs: ['pistols'] },
  ])
  expect(events.map(e => ('cost' in e ? e.cost : null))).toEqual([expect.any(Number), null, expect.any(Number), cat.pricing.spec, cat.pricing.spec])
  // the amp is then changed: the old event swaps the amp with its after
  const after = amp('a1', 'Rush Mk2')
  const mod = makeAmpModify(cat, later, after)
  expect(currentBuild(appendEvent(later, mod)).amps[0].name).toBe('Rush Mk2')
  expect(() => makeAmpModify(cat, later, amp('missing'))).toThrow('no amp missing')
  // a voided event is skipped
  const voided = voidEvent(appendEvent(later, mod), mod.id, 'oops')
  expect(currentBuild(voided).amps[0].name).toBe('Rush')
})

test('old knowledge: a free slot named, a slot renamed keeping its native mark, a paid one keyed by its entry', () => {
  const ch = old()
  ch.build.knowledge = [{ name: 'Glimmerish', kind: 'language', from: 'slot:1', native: true }]
  const rename = makeKnowledge(cat, { name: 'Glimmer-ish', kind: 'language', from: 'slot:1' }, false)
  const free = makeKnowledge(cat, { name: 'Maps', kind: 'knowledge', from: 'slot:2' }, false)
  const paid = makeKnowledge(cat, { name: 'Lore', kind: 'knowledge' })
  expect(paid).toMatchObject({ cost: cat.pricing.knowledge })
  expect(rename).toMatchObject({ cost: 0 })
  const b = currentBuild([rename, free, paid].reduce(appendEvent, ch))
  expect(b.knowledge).toEqual([
    { name: 'Glimmer-ish', kind: 'language', from: 'slot:1', native: true },
    { name: 'Maps', kind: 'knowledge', from: 'slot:2' },
    { name: 'Lore', kind: 'knowledge', id: paid.id },
  ])
  // paying for a slot's entry turns it into a paid entry with its own key
  const pay = makeKnowledge(cat, { name: 'Maps', kind: 'knowledge', from: 'slot:2' }, true)
  const b2 = currentBuild(appendEvent(old(), { ...pay, cost: 3 }))
  expect(b2.knowledge).toEqual([{ name: 'Maps', kind: 'knowledge', id: pay.id }])
})

test('an old runner settles into the new ledger once: a Creation finished entry first, its balance carried over', () => {
  const ch = [makeBuy(cat, { uid: 'gun', kind: 'weapon', name: 'Made-up gun' }), makeEarn(100, 'A run', '2026-10-01')].reduce(appendEvent, old())
  const settled = settle(cat, ch)
  expect(settled.career[0]).toMatchObject({ id: 'finalized', type: 'finalize' })
  expect(settled.build.items.map(i => i.uid)).toContain('gun')
  expect(settle(cat, settled)).toBe(settled)
  expect(balance(cat, ch)).toBe(ledgerRunning(settled).at(-1)!.running)
  expect(recordedPrices(settled).size).toBeGreaterThan(0)
  expect(sinceFinalize(settled).map(e => e.type)).toEqual(['buy', 'earn'])
  expect(sinceFinalize(settled, true).map(e => e.type)).toEqual(['finalize', 'buy', 'earn'])
  expect(sinceFinalize(runner())).toHaveLength(0)
})

test('a draft’s balance is what is left to spend', () => {
  expect(balance(cat, runner())).toBeGreaterThan(0)
})

test('voiding: an event that is there, not a void, not twice; voided entries leave the running balance', () => {
  const ch = appendEvent(finalize(cat, runner()), makeEarn(50, 'A run', '2026-10-01'))
  const earn = ch.career.at(-1)!
  expect(() => voidEvent(ch, 'nope', 'x')).toThrow('no such event')
  const v = voidEvent(ch, earn.id, 'wrong run')
  expect(() => voidEvent(v, earn.id, 'again')).toThrow('event already voided')
  expect(() => voidEvent(v, v.career.at(-1)!.id, 'meta')).toThrow('a void cannot be voided')
  expect(voidedIds(v)).toEqual(new Set([earn.id]))
  expect(activeEvents(v).map(e => e.type)).toEqual(['finalize'])
  expect(ledgerRunning(v).map(r => [r.e.type, r.voided])).toEqual([
    ['finalize', false],
    ['earn', true],
  ])
  expect(balance(cat, v)).toBe(balance(cat, finalize(cat, runner())))
})

test('reopening is refused once earnings are recorded, and keeps a note; notes are entries without cost', () => {
  const fin = finalize(cat, runner())
  const earned = appendEvent(fin, makeEarn(10, 'A run', '2026-10-01'))
  expect(() => reopen(cat, earned)).toThrow('the ledger already has earnings')
  const re = reopen(cat, appendEvent(fin, makeNote('A thought')))
  expect(re.finalizedAt).toBeUndefined()
  expect(re.career.at(-1)).toMatchObject({ type: 'note', text: 'Creation reopened' })
  expect(makeNote('x')).toMatchObject({ type: 'note', text: 'x' })
  // an earning voided first no longer blocks it
  const e = earned.career.at(-1)!
  expect(reopen(cat, voidEvent(earned, e.id, 'mistake')).finalizedAt).toBeUndefined()
})

const bld = (over: Partial<Build> = {}): Build => ({ ...structuredClone(runner().build), ...over })

test('the change log words each difference: attributes, skills, specializations, knowledge, amps and items', () => {
  const a = bld({
    knowledge: [
      { name: 'Maps', kind: 'knowledge', id: 'k1' },
      { name: 'Glimmerish', kind: 'language', id: 'k2', native: true },
      { name: 'Old', kind: 'knowledge', id: 'k4' },
    ],
    amps: [{ ...amp('a1') }, { ...amp('a3', 'Gone') }],
    items: [
      { uid: 'knife', kind: 'weapon', name: 'Knife' },
      { uid: 'i2', kind: 'gear', name: 'Rope' },
      { uid: 'i3', kind: 'gear', name: 'Tape' },
    ],
  })
  const b = bld({
    attributes: { ...a.attributes, agi: 4 },
    skills: [
      { id: 'stealth', rating: 3, specs: ['shadowing', 'custom:Sneaking'] },
      { id: 'firearms', rating: 1, specs: [] },
    ],
    knowledge: [
      { name: 'Maps', kind: 'knowledge', id: 'k1' },
      { name: 'Glimmer', kind: 'language', id: 'k2', native: true },
      { name: 'Elven', kind: 'language', id: 'k3' },
    ],
    amps: [{ ...amp('a1', 'Rush Mk2') }, { ...amp('a2', 'New') }],
    items: [
      { uid: 'knife', kind: 'weapon', name: 'Knife', note: 'sharpened' },
      { uid: 'i2', kind: 'gear', name: 'Cord' },
    ],
  })
  const got = diffBuild(cat, a, b).map(changeText)
  expect(got).toEqual([
    'Finesse: 3 → 4',
    'Stealth: 2 → 3',
    'Added Stealth specialization shadowing',
    'Added Stealth specialization Sneaking',
    'firearms: 0 → 1',
    'Knowledge: Glimmerish (language, native) → Glimmer (language, native)',
    'Removed Old',
    'Added Elven (language)',
    'Rush (now Rush Mk2): rating 6 → rating 6, edited',
    'Removed Gone',
    'Added New (rating 6)',
    'Knife: edited',
    'Renamed: Rope → Cord',
    'Removed Tape',
  ])
  const dropped = diffBuild(cat, b, a).map(changeText)
  expect(dropped).toContain('Removed Stealth specialization shadowing')
})

test('a change line reads added, removed, changed or set', () => {
  expect(changeText({ key: 'k', label: 'Stealth', to: '' })).toBe('Added Stealth')
  expect(changeText({ key: 'k', label: 'Stealth', to: 'rating 3' })).toBe('Added Stealth (rating 3)')
  expect(changeText({ key: 'k', label: 'Stealth', from: '2' })).toBe('Removed Stealth')
  expect(changeText({ key: 'k', label: 'Stealth', from: '2', to: '3' })).toBe('Stealth: 2 → 3')
  expect(changeText({ key: 'k', label: 'Knife', from: '', to: 'edited' })).toBe('Knife: edited')
})

test('a draft runner’s edits are not logged; an edit that changes nothing is not either', () => {
  const draft = runner(),
    edited = structuredClone(draft)
  edited.build.attributes.agi = 4
  expect(logChange(cat, draft, edited)).toBe(edited)
  const fin = finalize(cat, runner())
  expect(logChange(cat, fin, structuredClone(fin))).toEqual(fin)
})

test('qualities added after Finalize: by an old event or by a logged change, unless voided', () => {
  const fin = finalize(cat, runner())
  const quality = { ...amp('q1', 'A quirk'), type: 'quality' }
  const viaEvent = appendEvent(fin, { id: 'e1', at: 'x', type: 'amp-add', amp: quality, cost: 4 })
  const viaChange = appendEvent(viaEvent, {
    id: 'e2',
    at: 'x',
    type: 'change',
    changes: [
      { key: 'amp:q2', label: 'Another', to: '' },
      { key: 'amp:q3', label: 'Edited', from: '', to: 'x' },
      { key: 'skill:x', label: 'S', to: '' },
      { key: 'amp:q4', label: 'Changed', from: 'rating 1', to: 'rating 2' },
    ],
    cost: 0,
  })
  expect(qualitiesAddedAfter(viaChange)).toEqual(new Set(['q1', 'q2', 'q3']))
  expect(qualitiesAddedAfter(voidEvent(viaChange, 'e1', 'no'))).toEqual(new Set(['q2', 'q3']))
  expect(qualitiesAddedAfter(fin)).toEqual(new Set())
  expect(voidedIds(fin).size).toBe(0)
})
