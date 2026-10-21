// Levels of play: the core rulebook's street level (the row below) and prime runner (twice the customization Karma),
// CRB Hong Kong p. 63, and the Sixth World Companion's Alternate Power Levels (pp. 14–15): their letters, targets and
// counts replacing the standard ones while on, street-level's no illegal gear but cyberdecks, elite's no Availability
// cap. All off by default. The fixture's catalog and every number here are made up.
import { expect, test } from 'vitest'
import { levelRules, runnerRules, type CreationValue } from '../../../src/sr6/table-setup/domain/creation'
import { makeProvider } from '../../../src/sr6/runner-builder/domain/creation/providers'
import { validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import { blankSr6, type Sr6Purchase } from '../../../src/sr6/formats/domain/character'
import { buildOf, GLIM, made } from '../catalog/fixture'

const rules = (r: Record<string, CreationValue>) => made({ rules: r })

test('street level: each priority gives the values of the row below, E staying E; off, its own row', () => {
  const { data, cr } = rules({ levelStreet: true })
  const b = buildOf('priority', { letters: 'ABCDE', metatype: GLIM })
  const p = makeProvider('priority', data, cr)
  expect([p.attributePoints(b), p.skillPoints(b), p.nuyen(b), p.adjustmentPoints(b)]).toEqual([13, 2, 8200, 11]) // attributes B: C's, skills D: E's, resources E: E's, metatype A: B's (Glimmerkin)
  expect(
    p
      .legalMagic(b)
      .map(m => m.kind)
      .sort(),
  ).toEqual(['adept', 'aspected', 'mundane']) // magic C: row D's
  cr.set('levelStreet', { key: 'levelStreet', value: false })
  expect(makeProvider('priority', data, cr).attributePoints(b)).toBe(17)
})

test('prime runner: twice the starting Karma, for every method that spends it', () => {
  const { data, cr } = rules({ levelPrime: true })
  expect(makeProvider('priority', data, cr).startingKarma()).toBe(40 * 2) // (the fixture's 40)
  expect(makeProvider('pointbuy', data, cr).startingKarma()).toBe(80)
})

test('the priority letters a level sets: the five columns take exactly those; sum to ten only letters among them', () => {
  const { data, cr } = rules({ priorityLetters: 'BCCDE' })
  const p = makeProvider('priority', data, cr),
    letters = (s: string) => buildOf('priority', { letters: s }).priorities
  expect(p.lettersValid(letters('CBCED'))).toBe(true)
  expect(p.lettersValid(letters('ABCDE'))).toBe(false)
  const s = makeProvider('sumtoten', data, cr),
    sum = (l: string) => buildOf('sumtoten', { letters: l }).priorities
  expect(s.lettersValid(sum('BCCDE'))).toBe(true)
  expect(s.lettersValid(sum('ACDEE'))).toBe(false) // no A
})

test('an Alternate Power Level puts its own numbers in place of the standard ones, with its page; off, nothing changes', () => {
  const { cr } = rules({ levelSwcStreet: true, 'swcStreet.sumToTen': 7, 'swcStreet.pointBuy': 70, 'swcStreet.modules': 5, 'swcStreet.letters': 'BCCDE' })
  cr.set('swcStreet.pointBuy', { key: 'swcStreet.pointBuy', value: 70, source: 'SWC', page: 99 })
  const out = levelRules(cr)
  expect([
    out.get('sumToTenTarget')?.value,
    out.get('pointBuy.total')?.value,
    out.get('lifepath.moduleCount')?.value,
    out.get('priorityLetters')?.value,
  ]).toEqual([7, 70, 5, 'BCCDE'])
  expect(out.get('pointBuy.total')).toMatchObject({ source: 'SWC', page: 99 })
  cr.set('levelSwcStreet', { key: 'levelSwcStreet', value: false })
  expect(levelRules(cr).get('pointBuy.total')?.value).toBe(cr.get('pointBuy.total')?.value)
  // (a runner's own choice of the level goes through runnerRules: its numbers follow)
  const own = runnerRules(cr, [{ key: 'levelSwcStreet', value: 'true' }])
  expect(own.get('sumToTenTarget')?.value).toBe(7)
})

test('street-level: an illegal item is an error, a cyberdeck not; elite: no Availability cap; two levels at once a note', () => {
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'ABCDE', metatype: GLIM })
  const buy = (id: string, kind: Sr6Purchase['kind']) => ch.build.purchases.push({ uid: id, kind, id, qty: 1, accessories: [] })
  buy('mus.reflex', 'augmentations')
  buy('crb.pocketdeck', 'electronics')
  const { data, cr } = rules({ levelSwcStreet: true })
  data.entry('augmentations', 'crb.glow-eyes') // (warm the catalog)
  const fake = {
    ...data,
    entry: (k: Parameters<typeof data.entry>[0], id: string) =>
      id === 'mus.reflex'
        ? { id, kind: k, name: 'Made-up Reflex Booster', source: 'CRB', page: 1, attrs: { avail: '4(I)', category: 'Bodyware' }, parts: [], text: '' }
        : data.entry(k, id),
  } as typeof data
  const codes = (r: typeof cr) => validateSr6(fake, r, ch).map(v => `${v.code}|${v.path}`)
  expect(codes(cr).filter(c => c.startsWith('gear.illegal'))).toEqual(['gear.illegal|augmentations.mus.reflex'])
  cr.set('levelSwcStreet', { key: 'levelSwcStreet', value: false })
  expect(codes(cr).filter(c => c.startsWith('gear.illegal'))).toEqual([])
  cr.set('maxAvailability', { key: 'maxAvailability', value: 1 })
  expect(codes(cr).some(c => c.startsWith('gear.availCap'))).toBe(true)
  cr.set('levelSwcElite', { key: 'levelSwcElite', value: true })
  expect(codes(cr).some(c => c.startsWith('gear.availCap'))).toBe(false)
  cr.set('levelPrime', { key: 'levelPrime', value: true })
  expect(codes(cr)).toContain('rules.conflict|method')
})
