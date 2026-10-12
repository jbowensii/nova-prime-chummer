// Improved Ability (CRB Hong Kong p. 157): a power naming its choice is for the skill its note names; it costs the combat
// price for a combat skill (Close Combat, Exotic Weapons, Firearms: p. 95), else the other; its levels add to that
// skill's pool; it needs a rank in the skill, and the boosted skill is at most 1.5 times the rank (rounded up) or the +4
// maximum; it may be bought again for another skill. The power, skills and numbers here are made up.
import { expect, test } from 'vitest'
import { apply } from '../../src/sr6/engine/actions'
import { powerCost } from '../../src/sr6/engine/budgets'
import { careerPowerPoints, preview } from '../../src/sr6/engine/career'
import { makeProvider } from '../../src/sr6/engine/providers'
import { deriveSr6 } from '../../src/sr6/engine/derive'
import { sr6Data } from '../../src/sr6/engine/data'
import { validateSr6 } from '../../src/sr6/engine/rules'
import { blankSr6, type Sr6Character } from '../../src/sr6/model/character'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from './fixture'

function setup() {
  const data = sr6Data(
    fixtureCatalog((f, x) =>
      f.endsWith('crb/adeptpowers.xml')
        ? x.replace(
            '</sr6:data>',
            `<adeptpower id="crb.sharp-knack-skill" source="CRB" page="157" cost="0.25" costCombat="0.75" perLevel="true"><name>Sharp Knack (Skill)</name><effect target="skill:choice" op="add" value="R"/><text/></adeptpower>\n</sr6:data>`,
          )
        : f.endsWith('crb/skills.xml')
          ? x.replace(
              '</sr6:data>',
              `<skill id="crb.firearms" source="CRB" page="95" attr="agi" untrained="true"><name>Firearms</name><text/></skill>\n</sr6:data>`,
            )
          : x,
    ),
  )
  const cr = fixtureCreation()
  cr.set('improvedAbilityPower', { key: 'improvedAbilityPower', value: 'crb.sharp-knack-skill', source: 'CRB', page: 99 })
  cr.set('improvedAbilityFactor', { key: 'improvedAbilityFactor', value: 1.5 })
  cr.set('skillAugmentMax', { key: 'skillAugmentMax', value: 4 })
  return { data, cr }
}
function adept(): Sr6Character {
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'adept' })
  ch.build.skills.push({ id: 'crb.gab', points: 2, karma: 0 }, { id: 'crb.firearms', points: 4, karma: 0 })
  return ch
}

test('the price by the skill the note names: combat or other; the levels add to that skill’s pool', () => {
  const { data, cr } = setup(),
    ch = adept()
  ch.build.picks.push(
    { uid: 'k1', kind: 'adeptpowers', id: 'crb.sharp-knack-skill', level: 2, note: 'Firearms' },
    { uid: 'k2', kind: 'adeptpowers', id: 'crb.sharp-knack-skill', level: 1, note: 'Gab' },
  )
  expect(powerCost(data, ch.build.picks[0])).toBe(0.75 * 2)
  expect(powerCost(data, ch.build.picks[1])).toBe(0.25)
  const pools = deriveSr6(data, cr, ch).pools
  expect(pools.find(p => p.skill === 'crb.firearms')!.dp).toBe(4 + 1 + 2) // (AGI 1)
  expect(pools.find(p => p.skill === 'crb.gab')!.dp).toBe(2 + 1 + 1) // (CHA 1)
  expect(validateSr6(data, cr, ch).filter(v => v.code.startsWith('adept.improvedAbility') || v.code === 'magic.choice')).toEqual([])
})

test('a rank in the skill; the boosted skill at most 1.5 times the rank, rounded up; a note naming no skill asks for one', () => {
  const { data, cr } = setup(),
    ch = adept()
  ch.build.picks.push(
    { uid: 'k1', kind: 'adeptpowers', id: 'crb.sharp-knack-skill', level: 2, note: 'Gab' },
    { uid: 'k2', kind: 'adeptpowers', id: 'crb.sharp-knack-skill', level: 1, note: 'Tinkering' },
    { uid: 'k3', kind: 'adeptpowers', id: 'crb.sharp-knack-skill', level: 1 },
  )
  const v = validateSr6(data, cr, ch)
  expect(v.filter(x => x.code === 'adept.improvedAbility').map(x => [x.path, x.message])).toEqual([
    ['magic.k1', 'Sharp Knack (Skill) 2 raises Gab 2 to 4; at most 3.'],
    ['magic.k2', 'Sharp Knack (Skill) for Tinkering: it needs a rank in Tinkering.'],
  ])
  expect(v.filter(x => x.code === 'magic.choice').map(x => x.path)).toEqual(['magic.k3'])
})

test('bought again for another skill: a new line, not a level; its note set on the line', () => {
  const { data, cr } = setup(),
    ch = adept()
  expect(apply(ch.build, { op: 'pick', kind: 'adeptpowers', id: 'crb.sharp-knack-skill' }, data, cr)).toEqual({ ok: true })
  expect(apply(ch.build, { op: 'pick', kind: 'adeptpowers', id: 'crb.sharp-knack-skill' }, data, cr)).toEqual({ ok: true })
  expect(ch.build.picks.map(x => x.level)).toEqual([1, 1])
  expect(apply(ch.build, { op: 'pickNote', uid: ch.build.picks[1].uid, note: ' Gab ' }, data, cr)).toEqual({ ok: true })
  expect(ch.build.picks[1].note).toBe('Gab')
})

test('a career level of Improved Ability is checked at the price for the skill the raised line names', () => {
  const { data, cr } = setup(),
    ch = adept(),
    NOW = '2026-10-06T10:00:00.000Z'
  data.powers['crb.sharp-knack-skill'] = { ...data.powers['crb.sharp-knack-skill'], maxLevel: 9 }
  ch.finalizedAt = NOW
  ch.final = { karma: 0, nuyen: 0 }
  ch.ledger = [{ id: 'f1', at: NOW, type: 'finalize', karma: 0, nuyen: 0 }]
  ch.build.picks.push({ uid: 'k1', kind: 'adeptpowers', id: 'crb.sharp-knack-skill', level: 1, note: 'Firearms' })
  // a Gab line uses all but 0.5 power points: room for an other-skill level (0.25), not a combat one (0.75)
  const left = () => careerPowerPoints(ch.build, data, cr, makeProvider('priority', data, cr)).left
  ch.build.picks.push({ uid: 'k2', kind: 'adeptpowers', id: 'crb.sharp-knack-skill', level: (left() - 0.5) / 0.25, note: 'Gab' })
  expect(left()).toBe(0.5)
  const raise = { op: 'pick' as const, line: { uid: '', kind: 'adeptpowers' as const, id: 'crb.sharp-knack-skill' } }
  expect(preview(ch, raise, data, cr)).toMatchObject({ ok: false, reason: 'no-power-points' }) // Firearms: 0.75
  ch.build.picks[0].note = 'Gab'
  expect(preview(ch, raise, data, cr)).toMatchObject({ ok: true }) // Gab: 0.25
  // a family of levels (Quick Step 1–4, 0.25 a level): the next level for the difference at the line's price
  for (const n of [1, 2]) data.powers[`crb.quick-step.${n}`] = { ...data.powers[`crb.quick-step.${n}`], costCombat: 0.5 * n }
  ch.build.picks.splice(0, 2, { uid: 'q1', kind: 'adeptpowers', id: 'crb.quick-step.1', note: 'Firearms' })
  ch.build.picks.push({ uid: 'k2', kind: 'adeptpowers', id: 'crb.sharp-knack-skill', level: (left() - 0.25) / 0.25, note: 'Gab' })
  const next = { op: 'pick' as const, line: { uid: '', kind: 'adeptpowers' as const, id: 'crb.quick-step' } }
  expect(preview(ch, next, data, cr)).toMatchObject({ ok: false, reason: 'no-power-points' }) // Firearms: 1 − 0.5
  ch.build.picks[0].note = 'Gab'
  expect(preview(ch, next, data, cr)).toMatchObject({ ok: true }) // Gab: 0.5 − 0.25
})
