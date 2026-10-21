import { test, expect } from 'vitest'
import { averageHits, blankNpc, isNpc, npcPoolLabel } from '../../../src/ca2/runner-builder/domain/npc'
import { blankCharacter } from '../../../src/ca2/formats/domain/file'
import { price } from '../../../src/ca2/runner-builder/domain/price'
import { validate } from '../../../src/ca2/runner-builder/domain/validate'
import { cat } from '../../helpers'

const codes = (ch: Parameters<typeof validate>[1]) => validate(cat, ch).map(v => v.code)

// CRB p.81: dice pool band (low, high) -> average hits at RR 0..3
const TABLE: [number, number, number[]][] = [
  [2, 4, [2, 3, 4, 5]],
  [5, 7, [3, 4, 5, 6]],
  [8, 10, [4, 5, 6, 7]],
  [11, 13, [5, 6, 7, 8]],
  [14, 16, [6, 7, 8, 9]],
]
test.each(TABLE.flatMap(([lo, hi, row]) => [lo, hi].flatMap(dp => row.map((want, rr) => [dp, rr, want] as const))))(
  'averageHits(%i, RR %i) = %i',
  (dp, rr, want) => expect(averageHits(dp, rr)).toBe(want),
)
test('averageHits holds across each whole band', () => {
  for (const [lo, hi, row] of TABLE) for (let dp = lo; dp <= hi; dp++) row.forEach((w, rr) => expect(averageHits(dp, rr)).toBe(w))
})

test('npcPoolLabel', () => {
  expect(npcPoolLabel('Ranged Weapons', undefined, 5, 'agi', 3, 1)).toBe('Ranged Weapons 5 (5+A, RR 1)')
  // a specialization's +2 counts in the pool: 4+3 = 7 -> 3, 4+3+2 = 9 -> 4
  expect(npcPoolLabel('Ranged Weapons', undefined, 4, 'agi', 3, 0)).toBe('Ranged Weapons 3 (4+A, RR 0)')
  expect(npcPoolLabel('Ranged Weapons', 'Pistols', 4, 'agi', 3, 0)).toBe('Ranged Weapons (Pistols) 4 (4+A, RR 0)')
  expect(npcPoolLabel('Close Combat', 'Blades', 4, 'str', 4, 0)).toBe('Close Combat (Blades) 4 (4+S, RR 0)')
})

test('blankNpc: npc block, no gear, no metatype for critters and spirits unless given', () => {
  const n = blankNpc('npc', 'regular'),
    c = blankNpc('critter', 'prime'),
    s = blankNpc('spirit', 'regular', 'spirit-x')
  expect(isNpc(n) && isNpc(c)).toBe(true)
  expect(isNpc(blankCharacter())).toBe(false)
  expect(n.npc).toEqual({ kind: 'npc', tier: 'regular' })
  expect(n.identity.metatype).toBe('human')
  expect(c.identity.metatype).toBe('')
  expect(s.identity.metatype).toBe('spirit-x')
  expect([n, c, s].every(x => x.build.items.length === 0)).toBe(true)
})

test('a regular NPC skips budget, caps, basics and narrative but keeps structural checks', () => {
  const ch = blankNpc('npc', 'regular')
  ch.build.skills = [
    { id: 'stealth', rating: 12, specs: [] },
    { id: 'sorcery', rating: 3, specs: [] },
    { id: 'athletics', rating: 0, specs: ['no-such'] },
  ]
  ch.build.attributes = { str: 5, agi: 5, wil: 5, log: 2, cha: 2 }
  ch.build.items = [{ uid: 'x', kind: 'gear', name: 'Ghost', catalogId: 'no-such-thing' }]
  ch.level = 'no-such-level'
  const got = codes(ch)
  for (const bad of ['budget.over', 'skill.cap', 'attr.maxCount', 'rr.cap', 'runner.basics', 'narrative.count']) expect(got).not.toContain(bad)
  expect(got).toContain('skill.requiresAwakened')
  expect(got).toContain('spec.noSkill')
  expect(got).toContain('ref.unknown') // the Ghost item
  expect(price(cat, ch)).toMatchObject({ budget: 0, remaining: 0 })
  // the same build as a runner has the runner errors
  const run = { ...ch, npc: undefined, level: 'runner' }
  expect(codes(run)).toEqual(expect.arrayContaining(['skill.cap', 'attr.maxCount', 'narrative.count', 'runner.basics']))
})

test('a critter with STR 9 and no metatype has no range error and no unknown-metatype warning', () => {
  const ch = blankNpc('critter', 'regular')
  ch.build.attributes.str = 9
  const got = validate(cat, ch)
  expect(got.map(v => v.code)).not.toContain('attr.range')
  expect(got.some(v => v.path === 'identity.metatype')).toBe(false)
  const run = { ...ch, npc: undefined, identity: { ...ch.identity, metatype: 'human' } }
  expect(codes(run)).toContain('attr.range')
})

test('an NPC (not a critter or spirit) with no metatype gets a warning', () => {
  const ch = blankNpc('npc', 'regular', '')
  expect(validate(cat, ch).find(v => v.path === 'identity.metatype')).toMatchObject({ code: 'npc.noMetatype', severity: 'warning' })
  expect(codes(blankNpc('npc', 'regular'))).not.toContain('npc.noMetatype')
})
