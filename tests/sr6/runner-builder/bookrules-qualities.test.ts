// The core rulebook's quality rules (CRB Hong Kong): a quality naming its choice is for the attribute or skill its note
// names (pp. 70–77); Exceptional raises that maximum, once per attribute (p. 71); Impaired lowers it a level at a time,
// never below 2 (p. 76); Aptitude raises the selected skill's caps only (p. 70); no ranks in an Incompetent skill, which
// a runner must be able to use, selected once (pp. 76–77); Sensitive System doubles ware Essence and can't be had with
// Magic or Resonance (p. 78). The qualities, skills and numbers here are made up.
import { expect, test } from 'vitest'
import { apply, type Op } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { attrMax, essenceBudget, qualityCost } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { preview } from '../../../src/sr6/runner-builder/domain/career/career'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import type { CreationValue } from '../../../src/sr6/table-setup/domain/creation'
import { blankSr6, type MagicKind, type Sr6Character } from '../../../src/sr6/formats/domain/character'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from '../catalog/fixture'

const MORE = `<quality id="crb.gifted-attribute" source="CRB" page="71" kind="positive" karma="12"><name>Gifted (Attribute)</name><effect target="attr-max:choice" op="add" value="1"/><text/></quality>
  <quality id="crb.hobbled-attribute" source="CRB" page="76" kind="negative" karma="8" perLevel="true" maxLevel="9"><name>Hobbled (Attribute)</name><effect target="attr-max:choice" op="add" value="-R"/><text/></quality>
  <quality id="crb.flair-skill" source="CRB" page="70" kind="positive" karma="12"><name>Flair (Skill)</name><text/></quality>
  <quality id="crb.clumsy-skill" source="CRB" page="76" kind="negative" karma="10"><name>Clumsy (Skill)</name><text/></quality>
  <quality id="crb.fussy-immunity" source="CRB" page="78" kind="negative" karma="8"><name>Fussy Immunity</name><text/></quality>`
function setup(rules: Record<string, CreationValue> = {}) {
  const data = sr6Data(fixtureCatalog((f, x) => (f.endsWith('crb/qualities.xml') ? x.replace('</sr6:data>', `${MORE}\n</sr6:data>`) : x)))
  const cr = fixtureCreation()
  const all: Record<string, CreationValue> = {
    exceptionalQuality: 'crb.gifted-attribute',
    aptitudeQuality: 'crb.flair-skill',
    incompetentQuality: 'crb.clumsy-skill',
    sensitiveSystemQuality: 'crb.fussy-immunity',
    sensitiveSystemEssence: 3,
    attributeMaxFloor: 3,
    ...rules,
  }
  for (const [key, value] of Object.entries(all)) cr.set(key, { key, value, source: 'CRB', page: 99 })
  return { data, cr }
}
function runner(magic: MagicKind = 'mundane'): Sr6Character {
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic }) // Glimmerkin: AGI 1–7, BOD 1–5
  return ch
}
let n = 0
const take = (ch: Sr6Character, id: string, note?: string, level = 1) => {
  const uid = `q${++n}`
  ch.build.qualities.push({ uid, id, level, ...(note ? { note } : {}) })
  return uid
}
const act = (ch: Sr6Character, s: ReturnType<typeof setup>, op: Op) => apply(ch.build, op, s.data, s.cr)
const codes = (ch: Sr6Character, s = setup()) =>
  validateSr6(s.data, s.cr, ch)
    .filter(v => v.severity === 'error')
    .map(v => v.code)

test('a quality naming its choice raises or lowers the maximum of the attribute its note names; lowered, never below the floor', () => {
  const ch = runner(),
    { data, cr } = setup()
  take(ch, 'crb.gifted-attribute', 'Agility')
  expect(attrMax(data, cr, ch.build, 'agi')).toBe(7 + 1)
  expect(attrMax(data, cr, ch.build, 'bod')).toBe(5)
  take(ch, 'crb.hobbled-attribute', 'BOD', 1)
  expect(attrMax(data, cr, ch.build, 'bod')).toBe(5 - 1)
  ch.build.qualities[1].level = 4
  expect(attrMax(data, cr, ch.build, 'bod')).toBe(3) // 5 - 4 = 1, floored at 3
  cr.delete('attributeMaxFloor')
  expect(attrMax(data, cr, ch.build, 'bod')).toBe(1)
})

test('a choice quality may be taken again for another choice; twice for one attribute is an error; one naming nothing asks for it', () => {
  const ch = runner(),
    s = setup()
  expect(act(ch, s, { op: 'quality', id: 'crb.gifted-attribute' })).toEqual({ ok: true })
  expect(act(ch, s, { op: 'quality', id: 'crb.gifted-attribute' })).toEqual({ ok: true })
  expect(ch.build.qualities.filter(q => q.id === 'crb.gifted-attribute')).toHaveLength(2)
  expect(codes(ch, s).filter(c => c === 'quality.choice')).toHaveLength(2)
  const [a, b] = ch.build.qualities
  expect(act(ch, s, { op: 'quality', id: a.id, uid: a.uid, note: 'Agility' })).toEqual({ ok: true })
  act(ch, s, { op: 'quality', id: b.id, uid: b.uid, note: 'agility' })
  expect(codes(ch, s)).toContain('quality.choiceTwice')
  act(ch, s, { op: 'quality', id: b.id, uid: b.uid, note: 'Logic' })
  expect(codes(ch, s).filter(c => c.startsWith('quality.choice'))).toEqual([])
  expect(act(ch, s, { op: 'quality', id: 'crb.knack' })).toEqual({ ok: true })
  expect(act(ch, s, { op: 'quality', id: 'crb.knack' })).toEqual({ ok: false, reason: 'already-taken' }) // (no choice in its name)
})

test('Aptitude raises the cap of the skill its note names only, at creation and in career', () => {
  const ch = runner(),
    s = setup()
  take(ch, 'crb.flair-skill', 'Gab')
  ch.build.skills.push({ id: 'crb.gab', points: 6, karma: 0 }, { id: 'crb.tinkering', points: 6, karma: 0 })
  const caps = () =>
    validateSr6(s.data, s.cr, ch)
      .filter(v => v.code === 'skill.cap')
      .map(v => v.path)
  expect(caps()).toEqual(['skills.crb.tinkering']) // (the fixture's caps: 5, 6 with the aptitude quality)
  s.cr.set('advance.skillMax', { key: 'advance.skillMax', value: 6 })
  ch.build.skills[0].points = 6
  ch.build.skills[1].points = 5
  ch.finalizedAt = '2026-10-03T00:00:00Z'
  ch.final = { karma: 100, nuyen: 0 }
  ch.ledger = [{ id: 'f1', at: '2026-10-03T00:00:00Z', type: 'finalize', karma: 100, nuyen: 0 }]
  const cost = (target: string) => {
    const r = preview(ch, { op: 'skill', target }, s.data, s.cr)
    return r.ok ? 'ok' : r.reason
  }
  expect(cost('crb.gab')).toBe('ok') // up to 7
  ch.build.skills[1].points = 6
  expect(cost('crb.tinkering')).toBe('at-maximum')
})

test('Incompetent: no ranks in its skill; not for a Magic or Resonance skill the runner can’t use', () => {
  const ch = runner()
  take(ch, 'crb.clumsy-skill', 'Gab')
  expect(codes(ch)).not.toContain('skill.incompetent')
  ch.build.skills.push({ id: 'crb.gab', points: 1, karma: 0 })
  expect(codes(ch)).toContain('skill.incompetent')
  const mundane = runner()
  take(mundane, 'crb.clumsy-skill', 'Hexing')
  expect(codes(mundane)).toContain('skill.incompetent')
  const caster = runner('full')
  take(caster, 'crb.clumsy-skill', 'Hexing')
  expect(codes(caster)).not.toContain('skill.incompetent')
})

test('a quality priced in listed steps (`7 or 12 Karma`) costs one of them, never one between', () => {
  const s = setup(),
    ch = runner()
  s.data.qualities['crb.knack'] = { ...s.data.qualities['crb.knack'], karma: 7, karmaMax: 12, karmaSteps: [7, 12] }
  ch.build.qualities.push({ uid: 'q1', id: 'crb.knack', level: 1 })
  expect(qualityCost(ch.build.qualities[0], s.data.qualities['crb.knack'])).toBe(7)
  expect(act(ch, s, { op: 'quality', id: 'crb.knack', uid: 'q1', karma: 9 })).toEqual({ ok: false, reason: 'karma-range' })
  expect(act(ch, s, { op: 'quality', id: 'crb.knack', uid: 'q1', karma: 12 })).toEqual({ ok: true })
  expect(qualityCost(ch.build.qualities[0], s.data.qualities['crb.knack'])).toBe(12)
  ch.build.qualities[0].karma = 10 // (an older file's in-between value: the step below)
  expect(qualityCost(ch.build.qualities[0], s.data.qualities['crb.knack'])).toBe(7)
})

test('Sensitive System: ware Essence times the factor (cyberware and bioware, not other kinds); an error with Magic', () => {
  const ch = runner(),
    s = setup()
  ch.build.purchases.push({ uid: 'w1', kind: 'augmentations', id: 'crb.glow-eyes', rating: 2, qty: 1, accessories: [] })
  const plain = essenceBudget(ch.build, s.data, s.cr).spent
  take(ch, 'crb.fussy-immunity')
  expect(essenceBudget(ch.build, s.data, s.cr).spent).toBeCloseTo(plain * 3)
  expect(codes(ch, s)).not.toContain('quality.sensitiveSystem')
  ch.build.magic = 'full'
  expect(codes(ch, s)).toContain('quality.sensitiveSystem')
})
