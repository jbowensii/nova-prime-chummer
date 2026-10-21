// The core rulebook's checks Commlink6 also makes (CRB Hong Kong): one specialization a skill but Exotic Weapons, which
// needs one and takes no expertise (pp. 65, 95); Astral only for magicians and adepts with Astral Perception (p. 93); one
// Native language, the others to Expert at most (pp. 67, 99); the initiate and submersion grades never above Magic and
// Resonance (pp. 167, 195); foci only for the Awakened, no more than Magic, none of Force above it, their Force together
// at most Magic × 5, bonded for their Karma (p. 154); and the Sixth World Companion's Expanded Specializations and
// Unrestricted Skill Ranks (p. 153). Every entry and number here is made up.
import { expect, test } from 'vitest'
import { allBudgets, skillSpend } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { preview } from '../../../src/sr6/runner-builder/domain/career/career'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { deriveSr6 } from '../../../src/sr6/runner-builder/domain/creation/derive'
import { makeProvider } from '../../../src/sr6/runner-builder/domain/creation/providers'
import { validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import type { CreationValue } from '../../../src/sr6/table-setup/domain/creation'
import { blankSr6, type MagicKind, type Sr6Character } from '../../../src/sr6/formats/domain/character'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from '../catalog/fixture'

const MORE: Record<string, string> = {
  'crb/skills.xml': `<skill id="crb.exotic-weapons" source="CRB" page="95" attr="agi" untrained="false"><name>Exotic Weapons</name><text/></skill>
  <skill id="crb.astral" source="CRB" page="93" attr="int" untrained="false"><name>Astral</name><text/></skill>`,
  'crb/adeptpowers.xml': `<adeptpower id="crb.astral-perception" source="CRB" page="156" cost="0.5"><name>Astral Perception</name><text/></adeptpower>`,
  'crb/gear.xml': `<gear id="crb.glow-focus" source="CRB" page="294" category="Foci" karma="Force x 2" avail="(Force) L" cost="Force x 100" rating="1-6"><name>Glow focus</name><text/></gear>`,
}
function setup(rules: Record<string, CreationValue> = {}) {
  const data = sr6Data(
    fixtureCatalog((f, x) => {
      const k = Object.keys(MORE).find(m => f.endsWith(m))
      return k ? x.replace('</sr6:data>', `${MORE[k]}\n</sr6:data>`) : x
    }),
  )
  const cr = fixtureCreation()
  for (const [key, value] of Object.entries({ languageMax: 2, fociForcePerMagic: 3, fociBondKarma: true, ...rules }))
    cr.set(key, { key, value, source: 'CRB', page: 99 })
  return { data, cr }
}
function runner(magic: MagicKind = 'mundane'): Sr6Character {
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic }) // magic B: adept 5, full 3
  return ch
}
const errs = (ch: Sr6Character, s = setup()) =>
  validateSr6(s.data, s.cr, ch)
    .filter(v => v.severity === 'error')
    .map(v => v.code)

test('one specialization a skill, but Exotic Weapons; the Companion’s Expanded Specializations lifts it; each is priced as the first', () => {
  const ch = runner()
  ch.build.skills.push(
    { id: 'crb.gab', points: 3, karma: 0, spec: 'Haggling', specs: ['Fibbing'] },
    { id: 'crb.exotic-weapons', points: 2, karma: 0, spec: 'Whips', specs: ['Nets'] },
  )
  expect(errs(ch).filter(c => c === 'skill.oneSpec')).toHaveLength(1)
  expect(errs(ch, setup({ expandedSpecializations: true }))).not.toContain('skill.oneSpec')
  const s = setup()
  // (fixture: 3 points a specialization, skills D: 11 points; the two that don't fit are bought with karma)
  expect(skillSpend(ch.build, s.cr, 11)).toEqual({ points: 3 + 2 + 3 + 3, karma: 2, expertise: 0 })
  const pool = deriveSr6(s.data, s.cr, ch).pools.find(p => p.skill === 'crb.exotic-weapons')!
  expect(pool.more?.map(m => m.spec)).toEqual(['Nets'])
})

test('Exotic Weapons with ranks needs a specialization and takes no expertise', () => {
  const ch = runner()
  ch.build.skills.push({ id: 'crb.exotic-weapons', points: 2, karma: 0 })
  expect(errs(ch).filter(c => c === 'skill.exotic')).toHaveLength(1)
  ch.build.skills[0].spec = 'Whips'
  expect(errs(ch)).not.toContain('skill.exotic')
  ch.build.skills[0].expertise = 'Whips'
  expect(errs(ch).filter(c => c === 'skill.exotic')).toHaveLength(1)
})

test('Astral: an adept needs Astral Perception; a magician doesn’t', () => {
  const ad = runner('adept')
  ad.build.skills.push({ id: 'crb.astral', points: 1, karma: 0 })
  expect(errs(ad)).toContain('skill.astral')
  ad.build.picks.push({ uid: 'k1', kind: 'adeptpowers', id: 'crb.astral-perception' })
  expect(errs(ad)).not.toContain('skill.astral')
  const mage = runner('full')
  mage.build.skills.push({ id: 'crb.astral', points: 1, karma: 0 })
  expect(errs(mage)).not.toContain('skill.astral')
})

test('languages: one Native, the others up to languageMax', () => {
  const ch = runner()
  ch.build.knowledge.push(
    { uid: 'l1', name: 'Glowspeak', kind: 'language', native: true, points: 0, karma: 0 },
    { uid: 'l2', name: 'Zappish', kind: 'language', points: 2, karma: 1 },
    { uid: 'l3', name: 'Trivia', kind: 'knowledge', points: 4, karma: 0 },
  )
  const s = setup()
  expect(
    validateSr6(s.data, s.cr, ch)
      .filter(v => v.code === 'knowledge.languages')
      .map(v => v.path),
  ).toEqual(['skills.l2'])
  ch.build.knowledge[1].native = true
  expect(
    validateSr6(s.data, s.cr, ch)
      .filter(v => v.code === 'knowledge.languages')
      .map(v => v.message),
  ).toEqual(['2 native languages: only one.'])
})

test('the initiate grade never above Magic', () => {
  const ch = runner('full') // Magic 3
  ch.build.initiation = 3
  expect(errs(ch)).not.toContain('magic.gradeCap')
  ch.build.initiation = 4
  expect(errs(ch)).toContain('magic.gradeCap')
})

test('foci: only the Awakened; no more than Magic, none above it, their Force together at most Magic × the setting; bonded for their Karma', () => {
  const mundane = runner()
  mundane.build.purchases.push({ uid: 'f1', kind: 'gear', id: 'crb.glow-focus', rating: 1, qty: 1, accessories: [] })
  expect(errs(mundane)).toContain('magic.foci')
  const mage = runner('full') // Magic 3: at most 3 foci, Force 3 each, 9 together
  mage.build.purchases.push(
    { uid: 'f1', kind: 'gear', id: 'crb.glow-focus', rating: 3, qty: 1, accessories: [] },
    { uid: 'f2', kind: 'gear', id: 'crb.glow-focus', rating: 3, qty: 1, accessories: [] },
  )
  expect(errs(mage)).not.toContain('magic.foci')
  const s = setup()
  const karma = allBudgets(mage.build, s.data, s.cr, makeProvider('priority', s.data, s.cr)).karma.breakdown!.find(l => l.key === 'foci')
  expect(karma?.amount).toBe(3 * 2 + 3 * 2)
  mage.build.purchases.push({ uid: 'f3', kind: 'gear', id: 'crb.glow-focus', rating: 4, qty: 1, accessories: [] })
  const v = validateSr6(s.data, s.cr, mage)
    .filter(x => x.code === 'magic.foci')
    .map(x => x.message)
  expect(v).toEqual(['Glow focus: Force 4 is above Magic 3.', "The foci's Force adds up to 10: at most Magic × 3, 9."])
  s.cr.set('fociBondKarma', { key: 'fociBondKarma', value: false })
  expect(allBudgets(mage.build, s.data, s.cr, makeProvider('priority', s.data, s.cr)).karma.breakdown!.some(l => l.key === 'foci')).toBe(false)
})

test('career: a second Exotic Weapons specialization; the Companion’s Unrestricted Skill Ranks lifts the cap', () => {
  const ch = runner()
  ch.build.skills.push({ id: 'crb.exotic-weapons', points: 2, karma: 0, spec: 'Whips' }, { id: 'crb.gab', points: 3, karma: 0, spec: 'Haggling' })
  ch.finalizedAt = '2026-10-03T00:00:00Z'
  ch.final = { karma: 200, nuyen: 0 }
  ch.ledger = [{ id: 'f1', at: '2026-10-03T00:00:00Z', type: 'finalize', karma: 200, nuyen: 0 }]
  const s = setup({ 'advance.skillMax': 3 })
  expect(preview(ch, { op: 'spec', target: 'crb.exotic-weapons', name: 'Nets' }, s.data, s.cr).ok).toBe(true)
  expect(preview(ch, { op: 'spec', target: 'crb.gab', name: 'Fibbing' }, s.data, s.cr)).toEqual({ ok: false, reason: 'already-known' })
  expect(preview(ch, { op: 'skill', target: 'crb.gab' }, s.data, s.cr)).toEqual({ ok: false, reason: 'at-maximum' })
  expect(preview(ch, { op: 'skill', target: 'crb.gab' }, s.data, setup({ 'advance.skillMax': 3, unrestrictedSkillRanks: true }).cr).ok).toBe(true)
})
