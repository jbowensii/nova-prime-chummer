// A runner's own creation rules over the table's (creation.ts runnerRules) with its campaign's locks, Review's notes on
// them, the export's list, the file; a book sample's printed line corrected by the override file (samplefix.ts); a level
// printed on a quality without levels. Made-up fixture, invented values.
import { expect, test } from 'vitest'
import { runnerRules, type CreationRules } from '../../src/sr6/engine/creation'
import { allBudgets } from '../../src/sr6/engine/budgets'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/engine/charxml'
import { exportRules } from '../../src/sr6/engine/export'
import { makeProvider } from '../../src/sr6/engine/providers'
import { validateSr6 } from '../../src/sr6/engine/rules'
import { withSampleFixes } from '../../src/sr6/engine/samplefix'
import { blankSr6, type Sr6Character } from '../../src/sr6/model/character'
import { buildOf, GLIM, made } from './fixture'

const runner = (): Sr6Character => ({ ...blankSr6('priority', 'r1'), build: buildOf('priority', { letters: 'CABDA', metatype: GLIM }) })

test('the runner’s choices go over the table’s, each saying where it comes from; a lock keeps the table’s', () => {
  const { cr } = made(), base: CreationRules = new Map(cr)
  const own = [{ key: 'startingKarma', value: '90' }, { key: 'maxAvailability', value: '' }, { key: 'qualityMaxCount', value: '9' }, { key: 'no.such.key', value: '1' }]
  const eff = runnerRules(base, own, [{ key: 'qualityMaxCount', by: 'Gil' }], 'campaign')
  expect(eff.get('startingKarma')).toMatchObject({ value: 90, from: 'runner' })
  expect(eff.has('maxAvailability')).toBe(false)  // turned off
  expect(eff.get('qualityMaxCount')).toMatchObject({ value: base.get('qualityMaxCount')!.value, from: 'campaign', lockedBy: 'Gil' })
  expect(eff.get('skillCap')?.from).toBe('campaign')
  expect(eff.has('no.such.key')).toBe(false)
  // none: the table's exactly
  expect([...runnerRules(base).values()].map(s => [s.key, s.value])).toEqual([...base.values()].map(s => [s.key, s.value]))
})

test('the runner’s Karma comes from its own starting Karma; Review notes an assumed rule and a locked choice, never an error', () => {
  const { data, cr } = made(), ch = runner()
  const k = (rules: CreationRules) => allBudgets(ch.build, data, rules, makeProvider('priority', data, rules)).karma.max
  ch.rules = [{ key: 'startingKarma', value: '77', assumed: true, source: 'CRB', page: 64 }]
  expect(k(runnerRules(cr, ch.rules))).toBe(77)
  const notes = validateSr6(data, runnerRules(cr, ch.rules), ch).filter(v => v.code.startsWith('rules.'))
  expect(notes).toEqual([expect.objectContaining({ code: 'rules.assumed', severity: 'warning', source: 'CRB', page: 64 })])
  expect(notes[0].message).toMatch(/77; assumed from the book’s numbers \(the book doesn’t say\)/)
  const locked = runnerRules(cr, ch.rules, [{ key: 'startingKarma', by: 'Gil' }])
  expect(k(locked)).toBe(cr.get('startingKarma')!.value)
  expect(validateSr6(data, locked, ch).find(v => v.code === 'rules.locked')?.message).toMatch(/locked it/)
  // a setting the runner turned off is no unset table setting
  ch.rules = [{ key: 'maxAvailability', value: '' }]
  expect(validateSr6(data, runnerRules(cr, ch.rules), ch).map(v => v.code)).not.toContain('setting.unset')
})

test('the export lists the rules that aren’t the server’s; the file keeps the runner’s own', () => {
  const { cr } = made(), ch = runner()
  ch.rules = [{ key: 'startingKarma', value: '100', assumed: true, source: 'CRB', page: 64 }, { key: 'maxAvailability', value: '' }]
  expect(exportRules(runnerRules(cr, ch.rules), ch)).toEqual([{ key: 'startingKarma', value: '100', from: 'runner', assumed: true },
    { key: 'maxAvailability', value: '', from: 'runner' }])
  expect(exportRules(runnerRules(cr), runner())).toEqual([])
  const back = xmlToSr6(sr6ToXml(ch))
  expect(back.ok && back.character.rules).toEqual(ch.rules)
  const plain = xmlToSr6(sr6ToXml(runner()))
  expect(plain.ok && plain.character.rules).toBeUndefined()  // an old runner: none, the table's as before
})

test('an override corrects a book sample’s printed line while it still prints the value; Review notes it', () => {
  const { data, cr } = made(), ch = runner()
  ch.sampleKey = 'NB|nb.tester'
  ch.build.purchases.push({ uid: 'g1', kind: 'augmentations', id: 'crb.glow-eyes', rating: 4, qty: 1, accessories: [] })
  const fixes = { sampleFixes: new Map([['nb.tester', { id: 'nb.tester', source: 'NB', page: 9, name: 'Tester', text: '',
    corrects: [{ item: 'crb.glow-eyes', field: 'rating' as const, from: '4', to: '3', note: 'owner’s correction' }] }]]) }
  const fixed = withSampleFixes(fixes, ch)
  expect(fixed.ch.build.purchases[0].rating).toBe(3)
  expect(ch.build.purchases[0].rating).toBe(4)  // the file keeps the book's
  const v = validateSr6(data, cr, fixed.ch)
  expect(v.map(x => x.code)).not.toContain('gear.ratingRange')
  expect(v.find(x => x.code === 'sample.corrected')).toMatchObject({ severity: 'warning', path: 'augmentations.g1', source: 'NB', page: 9 })
  // changed since: no longer the printed value, left alone
  ch.build.purchases[0].rating = 2
  expect(withSampleFixes(fixes, ch).corrections).toEqual([])
  expect(withSampleFixes(fixes, { ...ch, sampleKey: 'NB|nb.other' }).corrections).toEqual([])
})

test('a level printed on a quality without levels is a note, not the level error', () => {
  const { data, cr } = made(), ch = runner()
  ch.build.qualities.push({ uid: 'q1', id: 'crb.knack', level: 1 })
  ch.printed = { source: 'NB', page: 9, values: { 'level:crb.knack': 'Knack 2' } }
  const v = validateSr6(data, cr, ch)
  expect(v.map(x => x.code)).not.toContain('quality.level')
  expect(v.find(x => x.message.includes('Knack 2'))).toMatchObject({ code: 'sample.printed', severity: 'warning', path: 'qualities.q1' })
})

test('a bonus that holds on some tests only is shown with its pool, never added; a printed rank read with it is noted', async () => {
  const { data, cr } = made(), ch = runner()
  const { deriveSr6 } = await import('../../src/sr6/engine/derive')
  ch.build.skills.push({ id: 'crb.gab', points: 4, karma: 0 })
  const plain = deriveSr6(data, cr, ch).pools.find(p => p.skill === 'crb.gab')!.dp
  ch.build.purchases.push({ uid: 'v1', kind: 'gear', name: 'Made-up voice box', rating: 3, qty: 1, accessories: [],
    bonuses: [{ target: 'skill', skill: 'crb.gab', value: 1, perRating: true, when: 'sound-based tests' }] })
  const pool = deriveSr6(data, cr, ch).pools.find(p => p.skill === 'crb.gab')!
  expect(pool.dp).toBe(plain)
  expect(pool.conditional).toEqual([{ value: 3, when: 'sound-based tests', from: 'Made-up voice box' }])
  ch.printed = { source: 'NB', page: 9, values: { 'rank:crb.gab': '7|made-up voice box 3' } }
  expect(validateSr6(data, cr, ch).find(v => v.message.startsWith('The book prints'))?.message).toMatch(/prints .* 7; read as .* 4 \+ made-up voice box 3\./)
  const back = xmlToSr6(sr6ToXml(ch))
  expect(back.ok && back.character.build.purchases[0].bonuses?.[0].when).toBe('sound-based tests')
})
