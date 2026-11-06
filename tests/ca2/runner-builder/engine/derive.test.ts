import { test, expect } from 'vitest'
import { ammoDVs, derive } from '../../../../src/ca2/runner-builder/domain/derive'
import { blankCharacter } from '../../../../src/ca2/formats/domain/file'
import { price } from '../../../../src/ca2/runner-builder/domain/price'
import type { AmpEntry, Character } from '../../../../src/ca2/formats/domain/types'
import { cat } from '../../../helpers'

const amp = (uid: string, type: string, refs: string[]): AmpEntry => ({ uid, type, name: uid, narrative: '', effects: refs.map(ref => ({ ref })) })

/** A made-up dwarf face: armor 3 main, a closet amp adding 1 to the alternate. */
function face(): Character {
  const ch = blankCharacter('runner', 'dwarf')
  ch.build.attributes = { str: 2, agi: 3, wil: 2, log: 3, cha: 4 }
  ch.build.skills = [
    { id: 'athletics', rating: 3, specs: ['athletics.ranged-defense'] },
    { id: 'influence', rating: 5, specs: ['influence.bluff', 'influence.negotiation'] },
    { id: 'ranged-weapons', rating: 5, specs: ['ranged-weapons.pistols'] },
  ]
  ch.build.items = [
    { uid: 'coat', kind: 'armor', name: 'Lined coat', armor: 3 },
    { uid: 'clothes', kind: 'gear', name: 'Clothes' },
  ]
  ch.build.amps = [{ ...amp('closet', 'equipment', ['armor-plus']), linkedItem: 'clothes' }]
  ch.build.mainArmor = 'coat'
  ch.build.altArmor = 'clothes'
  return ch
}

test('ork STR 4 with armor 2 has physical thresholds 6/9/12 (CRB p.70)', () => {
  const ch = blankCharacter('runner', 'ork')
  ch.build.attributes.str = 4
  ch.build.items = [{ uid: 'v', kind: 'armor', name: 'vest', armor: 2 }]
  ch.build.mainArmor = 'v'
  expect(derive(cat, ch).thresholds.physicalMain).toEqual([6, 9, 12])
})

test('thresholds with no armor, main armor, alternate armor, and mental', () => {
  const t = derive(cat, face()).thresholds
  expect(t.physicalNone).toEqual([2, 5, 8])
  expect(t.physicalMain).toEqual([5, 8, 11])
  expect(t.physicalAlt).toEqual([3, 6, 9])
  expect(t.mental).toEqual([2, 5, 8])
})

test('an armor add-on worn over another armor counts on top of it and pays only its own points', () => {
  const ch = blankCharacter('runner', 'ork')
  ch.build.attributes.str = 4
  ch.build.items = [
    { uid: 'jacket', kind: 'armor', name: 'Made-up jacket', armor: 2 },
    { uid: 'mask', kind: 'armor', name: 'Made-up jacket + mask', armor: 1, over: 'jacket' },
  ]
  ch.build.mainArmor = 'jacket'
  ch.build.altArmor = 'mask'
  const t = derive(cat, ch).thresholds
  expect(t.physicalMain).toEqual([6, 9, 12])
  expect(t.physicalAlt).toEqual([7, 10, 13])
  expect(price(cat, ch).gear).toBe(3 * cat.pricing.armorPoint)
})

test('dice pools: attribute + skill, +2 per specialization, each with its made-up linked attribute', () => {
  const pools = derive(cat, face()).pools
  const dp = (skill: string, attr: string, spec?: string) => pools.find(p => p.skill === skill && p.attr === attr && p.spec === spec)!.dp
  expect(dp('athletics', 'str')).toBe(5) // Athletics' alternative attribute
  expect(dp('athletics', 'wil', 'athletics.ranged-defense')).toBe(7)
  expect(dp('influence', 'log', 'influence.bluff')).toBe(10)
  expect(dp('ranged-weapons', 'log', 'ranged-weapons.pistols')).toBe(10)
})

test('initiative enhancements do not stack: the best source wins', () => {
  const ch = blankCharacter()
  ch.build.amps = [amp('a', 'cyberware', ['init-1']), amp('b', 'bioware', ['init-1', 'init-2', 'init-3'])]
  expect(derive(cat, ch).initiative).toMatchObject({ level: 3, source: 'b' })
})

test('Essence 6 - 2 cyberware - 1 bioware = 3.25 (made-up 1.25 and 0.25), cancelling 1 magic and 1 healing hit', () => {
  const ch = blankCharacter()
  ch.build.amps = [amp('a', 'cyberware', []), amp('b', 'cyberware', []), amp('c', 'bioware', [])]
  const d = derive(cat, ch)
  expect(d.essence).toBe(3.25)
  expect(d.essenceEffects).toMatchObject({ magicHitsCancelled: 1, healingHitsCancelled: 1, socialDisadvantage: false, dead: false })
})

test('wound boxes, RR from amps, and the RR cap of 3', () => {
  const ch = blankCharacter()
  ch.build.skills = [{ id: 'stealth', rating: 2, specs: ['stealth.physical-sneaking'] }]
  ch.build.amps = [
    amp('a', 'bioware', ['wound-light', 'wound-serious']),
    {
      ...amp('b', 'quality', []),
      effects: [
        { ref: 'rr-skill', param: 'stealth' },
        { ref: 'rr-spec', param: 'stealth.physical-sneaking' },
        { ref: 'rr-spec', param: 'stealth.physical-sneaking' },
        { ref: 'rr-spec', param: 'stealth.physical-sneaking' },
      ],
    },
  ]
  const d = derive(cat, ch)
  expect(d.monitor).toEqual({ light: 3, serious: 2, incap: 1 })
  expect(d.pools.find(p => p.spec === 'stealth.physical-sneaking')!.rr).toBe(3)
  expect(d.pools.find(p => p.skill === 'stealth' && !p.spec && p.attr === 'agi')!.rr).toBe(1)
})

test('a specialization with two printed attributes gets a pool for each', () => {
  const skills = new Map(cat.skills)
  const stealth = skills.get('stealth')!
  skills.set('stealth', { ...stealth, specs: stealth.specs.map(s => (s.id === 'stealth.lockpicking' ? { ...s, alt: 'log' as const } : s)) })
  const c = face()
  c.build.skills = [{ id: 'stealth', rating: 2, specs: ['stealth.lockpicking'] }]
  const rows = derive({ ...cat, skills }, c).pools.filter(p => p.spec === 'stealth.lockpicking')
  expect(rows.map(p => [p.attr, p.dp])).toEqual([
    ['agi', 4 + c.build.attributes.agi],
    ['log', 4 + c.build.attributes.log],
  ])
})

test('alternative DVs by ammunition are read from a weapon’s text; page references and plain DVs are not', () => {
  expect(ammoDVs('Fires DV 5 (gel) / 6 (explosive) rounds.')).toEqual(['5 (gel)', '6 (explosive)'])
  expect(ammoDVs('dv: 4 (stick-n-shock), or 6 (APDS)')).toEqual(['4 (stick-n-shock)', '6 (APDS)'])
  expect(ammoDVs('DV 7 (p.12)')).toEqual([])
  expect(ammoDVs('DV 7. A heavy pistol.')).toEqual([])
  expect(ammoDVs()).toEqual([])
})

test('a weapon lists its ammunition DVs', () => {
  const ch = blankCharacter('runner', 'human')
  ch.build.items.push({ uid: 'w1', kind: 'weapon', name: 'Invented pistol', dv: '4', ranges: 'OK/OK/–/–', note: 'DV 4 (regular) / 6 (explosive)' })
  expect(derive(cat, ch).weapons.find(w => w.uid === 'w1')?.ammo).toEqual(['4 (regular)', '6 (explosive)'])
})

test('a DNI and a deck: Cracking (cybercombat) gets an Advantage in hot-sim only (CRB p.212); cold-sim gets none', () => {
  // the made-up catalog's Cracking with the book's cybercombat specialization
  const sk = cat.skills.get('cracking')!
  const c = {
    ...cat,
    skills: new Map(cat.skills).set('cracking', { ...sk, specs: [...sk.specs, { id: 'cracking.cybercombat', name: 'Cybercombat', attr: sk.attr }] }),
  }
  const ch = face()
  ch.build.skills.push({ id: 'cracking', rating: 2, specs: ['cracking.cybercombat'] })
  ch.build.amps.push(amp('deck', 'cyberdeck', []), amp('jack', 'cyberware', ['vr-cold']))
  expect(
    derive(c, ch)
      .pools.filter(p => p.skill === 'cracking')
      .flatMap(p => p.notes ?? []),
  ).toEqual([])
  ch.build.amps[2].effects.push({ ref: 'vr-hot' })
  const spec = derive(c, ch).pools.find(p => p.spec === 'cracking.cybercombat')!
  expect(spec.notes).toEqual([expect.objectContaining({ ref: 'advantage', from: 'Hot-sim VR (CRB p.212)', how: 'in hot-sim VR' })])
})

test('an astral form’s unarmed damage is its Charisma (CRB p.173)', () => {
  const ch = face()
  expect(derive(cat, ch).weapons.map(w => w.uid)).not.toContain('unarmed-astral')
  ch.build.amps.push(amp('aw', 'awakened', ['awk-astral-projection']))
  expect(derive(cat, ch).weapons.find(w => w.uid === 'unarmed-astral')).toMatchObject({ dv: '4' }) // CHA 4
})

test('optional rule (CRB p.68): vehicle-style thresholds for characters, from the table or the runner’s own switch', () => {
  const ch = face() // STR 2, main armor 3
  const id = 'optional-vehicle-damage-for-all'
  expect(derive(cat, ch).thresholds.physicalMain).toEqual([5, 8, 11])
  expect(derive(cat, ch, { optional: [id] }).thresholds.physicalMain).toEqual([5, 7, 9]) // 2+3, 4+3, 6+3
  expect(derive(cat, ch, { optional: [id] }).thresholds.mental).toEqual([2, 5, 8]) // Willpower isn't the book's Body
  expect(derive(cat, { ...ch, optionalRules: { [id]: false } }, { optional: [id] }).thresholds.physicalMain).toEqual([5, 8, 11])
  expect(derive(cat, { ...ch, optionalRules: { [id]: true } }).thresholds.physicalMain).toEqual([5, 7, 9])
  // an imported book's rule carries the id scoped by its source; the engine's key matches it
  expect(derive(cat, ch, { optional: [`crb.${id}`] }).thresholds.physicalMain).toEqual([5, 7, 9])
  expect(derive(cat, { ...ch, optionalRules: { [`crb.${id}`]: true } }).thresholds.physicalMain).toEqual([5, 7, 9])
  // the GM locked the rule: the table's switch binds, the runner's own is ignored either way
  expect(derive(cat, { ...ch, optionalRules: { [id]: false } }, { optional: [id], locked: [id] }).thresholds.physicalMain).toEqual([5, 7, 9])
  expect(derive(cat, { ...ch, optionalRules: { [id]: true } }, { optional: [], locked: [id] }).thresholds.physicalMain).toEqual([5, 8, 11])
})
