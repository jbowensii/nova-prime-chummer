// Effects, Anarchy side (src/engine/effects.ts, amps.ts RULE_EFFECTS, derive.ts): the shared state rules, the narrative
// effect kinds, what derive counts and shows, the character file and the export. Made-up data only.
import { describe, expect, test } from 'vitest'
import {
  ampParts, ampRating, applies, bracketed, counts, rrNotes, buildCatalog, characterToXml, derive, effectHow, effectLines, exportRunner, own, poolMarks,
  readEffectState, ruleText, xmlToCharacter,
} from '../../src/engine'
import { blankCharacter } from '../../src/engine/file'
import type { AmpEntry, Character, EffectPick } from '../../src/model/types'
import { cat, catFiles } from '../helpers'

const amp = (uid: string, type: string, effects: EffectPick[]): AmpEntry => ({ uid, type, name: uid, narrative: '', effects })

/** A made-up runner: Perception 3 with a spec, Resolve 3; amps as given. */
function runner(amps: AmpEntry[], items: Character['build']['items'] = [], metatype = 'human'): Character {
  const ch = blankCharacter('runner', metatype)
  ch.build.attributes = { str: 2, agi: 3, wil: 3, log: 2, cha: 2 }
  ch.build.skills = [{ id: 'perception', rating: 3, specs: ['perception.physical'] }, { id: 'influence', rating: 2, specs: [] }]
  ch.build.amps = amps
  ch.build.items = items
  return ch
}

describe('the shared state (both games)', () => {
  test('low confidence is shown, never counted; switchable and conditional ones count in the bracket; a target’s never', () => {
    expect(applies({})).toBe(true)
    expect(applies({ switch: 'activated' })).toBe(true)
    expect(applies({ confidence: 'low' })).toBe(false)
    expect(applies({ when: 'at dusk', switch: 'conditional' })).toBe(true)
    expect([counts({}), counts({}, true)]).toEqual([true, true])
    expect([counts({ switch: 'wireless' }), counts({ switch: 'wireless' }, true)]).toEqual([false, true])
    expect([counts({ when: 'at dusk' }), counts({ when: 'at dusk' }, true)]).toEqual([false, true])
    expect([counts({ confidence: 'low' }, true), counts({ affects: 'target' }, true), counts({ affects: 'caster', switch: 'sustained' }, true)]).toEqual([false, false, true])
    expect(effectHow({ affects: 'caster', switch: 'sustained' })).toBe('sustained, affects the caster')
  })
  test('a line’s own effects override its catalog entry’s', () => {
    expect(own([{ ref: 'a' }], [{ ref: 'b' }])).toEqual([{ ref: 'a' }])
    expect(own([], [{ ref: 'b' }])).toEqual([{ ref: 'b' }])
    expect(own(undefined, undefined)).toEqual([])
  })
  test('read from attributes: an unknown switch is dropped', () => {
    const at: Record<string, string> = { switch: 'teleport', when: 'at dusk', confidence: 'low', from: 'x.y' }
    expect(readEffectState(n => at[n])).toEqual({ when: 'at dusk', confidence: 'low', from: 'x.y' })
  })
  test('how it reads: the switch, the condition once, and not applied for low confidence', () => {
    expect(effectHow({ switch: 'sustained' })).toBe('sustained')
    expect(effectHow({ switch: 'conditional', when: 'while gliding' })).toBe('while gliding')
    expect(effectHow({ when: 'the moon is full' })).toBe('when the moon is full')
    expect(effectHow({ confidence: 'low' })).toBe('not applied')
  })
})

describe('the narrative effect kinds', () => {
  test('every catalog has them, at rating 0: an amp’s rating is unchanged', () => {
    expect(cat.ampEffects.get('advantage')).toMatchObject({ rating: 0, category: 'narrative', param: 'test' })
    const a = amp('a', 'quality', [{ ref: 'rr-spec', param: 'perception.physical' }])
    const b = { ...a, effects: [...a.effects, { ref: 'advantage', param: 'perception' }, { ref: 'ignore-wounds' }] }
    expect(ampRating(cat, b, { isFirstQuality: false })).toBe(ampRating(cat, a, { isFirstQuality: false }))
  })
  test('a data file’s own Amp effect of that id wins', () => {
    const extra = { file: 'custom/imported/x/ampeffects.xml', overlay: true, xml: `<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="ampeffects" version="1">
      <effect id="advantage" category="made-up" rating="3" types="quality" source="TEST" page="1"><name>Made-up edge</name></effect></ca2:data>` }
    expect(buildCatalog([...catFiles, extra]).ampEffects.get('advantage')?.rating).toBe(3)
  })
  test('their lines name the Test as the sheet does', () => {
    expect(ruleText(cat, { ref: 'advantage', param: 'perception.physical' })).toMatch(/^Advantage on .+ \(.+\) Tests$/)
    expect(ruleText(cat, { ref: 'edge-advantage' })).toBe('Advantage on all Tests for 1 Edge')
    expect(ruleText(cat, { ref: 'disadvantage', param: 'wil' })).toBe(`Disadvantage on ${cat.attributes.get('wil')!.name}-based Tests`)
    expect(ruleText(cat, { ref: 'social-armor', value: 2 })).toBe('Social armor 2')
    expect(ruleText(cat, { ref: 'ignore-wounds', param: 'light' })).toBe('Ignores light wound modifiers')
    expect(ruleText(cat, { ref: 'rr-attr', param: 'wil' })).toBeUndefined()
  })
})

describe('derive', () => {
  test('Advantages and Disadvantages mark the pools they name, never the dice', () => {
    const d = derive(cat, runner([amp('eyes', 'cyberware', [{ ref: 'advantage', param: 'perception.physical' }, { ref: 'disadvantage', param: 'wil' }])]))
    const spec = d.pools.find(p => p.spec === 'perception.physical' && p.attr === 'wil')!
    const plain = derive(cat, runner([])).pools.find(p => p.spec === 'perception.physical' && p.attr === 'wil')!
    expect(spec.dp).toBe(plain.dp)
    expect(poolMarks(spec).map(m => m.mark)).toEqual(['Adv', 'Dis'])
    expect(d.pools.find(p => p.skill === 'influence' && p.attr === 'log')?.notes).toBeUndefined()
  })
  test('an Advantage on every Test that holds only sometimes is listed, not put on every pool', () => {
    const d = derive(cat, runner([amp('q', 'quality', [{ ref: 'advantage', when: 'while humming', switch: 'conditional' }])]))
    expect(d.pools.some(p => p.notes)).toBe(false)
    expect(d.effects.map(e => e.text)).toEqual(['Advantage on all Tests'])
  })
  test('a low-confidence effect is shown, not counted; a `when` one counts in the bracket, with its note', () => {
    const base = derive(cat, runner([]))
    const d = derive(cat, runner([amp('m', 'adept', [{ ref: 'armor-plus', confidence: 'low' }, { ref: 'dv-plus', when: 'at dusk' }, { ref: 'wound-light', confidence: 'low' }])]))
    expect(d.armor.none).toBe(base.armor.none)
    expect(d.weapons[0].dv).toBe(base.weapons[0].dv)
    expect(d.switched?.weapons[0].dv).not.toBe(base.weapons[0].dv)
    expect(d.monitor).toEqual(base.monitor)
    expect(d.effects.filter(e => !e.applied).map(e => e.ref)).toEqual(['armor-plus', 'wound-light'])
    expect(d.effects.find(e => e.ref === 'dv-plus')?.how).toBe('at dusk')
  })
  test('a switchable effect counts in the bracketed total only: `0 (1)`', () => {
    const d = derive(cat, runner([amp('dose', 'equipment', [{ ref: 'rr-attr', param: 'wil', switch: 'activated' }, { ref: 'ignore-wounds', switch: 'activated' }])]))
    expect(d.rrAttr.wil).toBe(0)
    expect(d.switched?.rrAttr.wil).toBe(1)
    const i = d.pools.findIndex(p => p.attr === 'wil' && !p.spec)
    expect(bracketed(d.pools[i].rr, d.switched?.pools[i].rr)).toBe('0 (1)')
    expect(d.effects.map(e => [e.ref, e.how])).toEqual([['rr-attr', 'activated'], ['ignore-wounds', 'activated']])
    expect(effectLines(d)).toContain('Ignores wound modifiers (switched on)')
    expect(rrNotes(d, d.pools[i])).toEqual([expect.stringMatching(/\(activated\)$/)])  // (the RR bracket named on hover)
    expect(derive(cat, runner([amp('q', 'quality', [{ ref: 'rr-attr', param: 'wil' }])])).switched).toBeUndefined()
  })
  test('a bonus limited to a specialization: in its pool when the runner has it, else in the skill’s bracket', () => {
    const d = derive(cat, runner([amp('eye', 'cyberware', [{ ref: 'rr-spec', param: 'perception.physical' }, { ref: 'rr-spec', param: 'perception.social' },
      { ref: 'advantage', param: 'perception.social' }])]))
    expect(d.pools.find(p => p.spec === 'perception.physical' && p.attr === 'wil')?.rr).toBe(1)
    const skill = d.pools.find(p => p.skill === 'perception' && !p.spec && p.attr === 'wil')!
    expect(skill.rr).toBe(0)
    expect(skill.notes?.map(n => [n.ref, n.how])).toEqual([['advantage', 'without the specialization'], ['rr-spec', 'without the specialization: in brackets']])
    // (the specialization's RR in the skill's bracket, named on hover)
    expect(d.switched?.pools[d.pools.indexOf(skill)].rr).toBe(skill.rr + 1)
    expect(rrNotes(d, skill)).toEqual([expect.stringMatching(/^RR 1 on .*in brackets\)$/)])
    expect(poolMarks(skill).map(m => m.mark)).toEqual(['Adv', 'RR (spec.)'])
  })
  test('an effect unpriced by the rating applies at rating 0', () => {
    const a = amp('drug', 'equipment', [{ ref: 'rr-attr', param: 'wil' }])
    const b = { ...a, effects: [...a.effects, { ref: 'rr-spec', param: 'perception.physical', unpriced: true as const }] }
    expect(ampRating(cat, b, { isFirstQuality: false })).toBe(ampRating(cat, a, { isFirstQuality: false }))
    expect(derive(cat, runner([b])).pools.find(p => p.spec === 'perception.physical' && p.attr === 'wil')?.rr).toBe(2)
  })
  test('social and Matrix armor, wound modifiers, forced Risk, sustained spells, spirits, VR and rigging', () => {
    const d = derive(cat, runner([amp('jet', 'quality', [{ ref: 'social-armor', value: 2 }, { ref: 'ignore-wounds', param: 'light' }, { ref: 'forced-risk' },
      { ref: 'sustain-spell' }, { ref: 'summon-spirit' }, { ref: 'vr-cold' }, { ref: 'vr-hot' }, { ref: 'rcc', value: 2 }, { ref: 'vcr' }]),
    amp('deck', 'cyberdeck', [{ ref: 'matrix-armor', value: 1 }])]))
    expect(d.thresholds.social).toEqual([5, 8, 11]) // Resolve 3 + 2
    expect(d.thresholds.matrix).toEqual([2, 5, 8]) // Firewall 1 + Matrix armor 1
    expect([d.socialArmor, d.matrixArmor, d.ignoreWounds, d.forcedRisk, d.extraSpirits, d.vr, d.rcc, d.vcr]).toEqual([2, 1, 'light', true, 1, 'hot', 2, true])
    expect(d.sustain).toMatchObject({ free: 2, max: 4 })
    expect(effectLines(d)).toEqual(expect.arrayContaining(['Sustains 2 spells without a Disadvantage, 4 at most', 'Ignores light wound modifiers',
      'Must take a High or Extreme Risk', 'Hot-sim VR', 'Rigger command console: 2 drones', 'Vehicle control rig']))
    expect(derive(cat, runner([])).thresholds.social).toBeUndefined()
  })
  test('Essence: one more implant before death; magic spared the first point lost', () => {
    // the made-up core's cyberware costs 1.25 Essence: five leave -0.25, one leaves 4.75
    const ware = (n: number) => Array.from({ length: n }, (_, i) => amp(`w${i}`, 'cyberware', []))
    const tough = (n: number) => derive(cat, runner([...ware(n), amp('t', 'quality', [{ ref: 'essence-implant' }, { ref: 'essence-magic' }])])).essenceEffects
    expect(derive(cat, runner(ware(5))).essenceEffects.dead).toBe(true)
    expect(tough(5).dead).toBe(false)
    expect(derive(cat, runner(ware(1))).essenceEffects.magicHitsCancelled).toBe(1)
    expect(tough(1).magicHitsCancelled).toBe(0)
  })
  test('items: gear’s effects count; a spell’s on its caster while sustained, on its target(s) never; the player’s own replace the catalog’s', () => {
    const c = buildCatalog([...catFiles, { file: 'custom/imported/x/gear.xml', overlay: true, xml: `<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="gear" version="1">
      <item id="x.goggles" kind="gear" source="TEST" page="1"><name>Made-up goggles</name><effect ref="no-disadvantage" param="Dusk sight"/><text></text></item>
      <item id="x.glow" kind="spell" source="TEST" page="1"><name>Made-up glow</name><effect ref="advantage" param="influence" switch="sustained" affects="target"/>
        <effect ref="rr-attr" param="wil" switch="sustained" affects="caster"/><text></text></item></ca2:data>` }])
    const gear = { uid: 'g', kind: 'gear' as const, name: 'Made-up goggles', catalogId: 'x.goggles' }
    const spell = { uid: 's', kind: 'spell' as const, name: 'Made-up glow', catalogId: 'x.glow' }
    const d = derive(c, runner([], [gear, spell]))
    expect(d.effects.map(e => [e.text, e.type])).toEqual([['No Disadvantage: Dusk sight', 'item'], ['Luck with one Attribute: wil', 'item']])
    expect(d.pools.some(p => p.notes)).toBe(false) // the target's Advantage stays on the spell
    expect([d.rrAttr.wil, d.switched?.rrAttr.wil]).toEqual([0, 1]) // the caster's, while sustained: in brackets
    const mine = derive(c, runner([], [{ ...gear, effects: [{ ref: 'no-disadvantage', param: 'Dusk sight', confidence: 'low' }] },
      { ...spell, effects: [{ ref: 'advantage', param: 'influence', switch: 'sustained', affects: 'caster' }] }]))
    expect(mine.effects.map(e => [e.text, e.applied])).toEqual([['No Disadvantage: Dusk sight', false], ['Advantage on Influence Tests', true]])
    expect(mine.pools.find(p => p.skill === 'influence')?.notes?.[0]).toMatchObject({ ref: 'advantage', how: 'sustained, affects the caster' })
  })
  test('the racial quality’s effects are the runner’s', () => {
    const d = derive(cat, runner([], [], 'elf'))
    expect(d.effects).toEqual([expect.objectContaining({ ref: 'no-disadvantage', type: 'metatype', text: 'No Disadvantage: Low-light vision' })])
    expect(effectLines(d)).toContain('No Disadvantage: Low-light vision (Sylph (Low-light vision))')
  })
})

describe('the character file and the export', () => {
  const ch = runner([amp('q', 'quality', [{ ref: 'advantage', param: 'perception', switch: 'conditional', when: 'at dusk', from: 'x.other' },
    { ref: 'rr-attr', param: 'wil', confidence: 'low' }, { ref: 'sustain-spell', switch: 'activated' }])],
  [{ uid: 'g', kind: 'gear', name: 'Made-up goggles', effects: [{ ref: 'social-armor', value: 1 }] }])
  test('an effect’s state and an item’s own effects read back', () => {
    const r = xmlToCharacter(characterToXml(ch))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.character.build.amps[0].effects).toEqual(ch.build.amps[0].effects)
    expect(r.character.build.items.find(i => i.uid === 'g')?.effects).toEqual([{ ref: 'social-armor', value: 1 }])
  })
  test('an amp’s parts count only the effects that apply; each effect says how', () => {
    const p = ampParts(cat, 'quality', ch.build.amps[0].effects)
    expect(p.rr).toEqual([])
    expect(p.bonuses.sustainedSpells).toBe(1)
    expect(p.effects.map(e => [e.id, e.applied, e.switch ?? '', e.from ?? ''])).toEqual([
      ['advantage', true, 'conditional', 'x.other'], ['rr-attr', false, '', ''], ['sustain-spell', true, 'activated', '']])
    expect(p.effects[0].line).toMatch(/^Advantage on /)
    expect(ampParts(cat, 'equipment', [{ ref: 'rr-attr', param: 'agi', switch: 'activated' }]).switch).toBe('activated')
  })
  test('the runner carries its pools’ notes, its effects block and its items’ effects', () => {
    const r = exportRunner(cat, ch, { descriptions: false, now: '2026-10-10T00:00:00.000Z', appVersion: 'test' })
    expect(r.effects).toMatchObject({ socialArmor: 1 })
    expect(r.thresholds.social).toEqual([4, 7, 10])
    expect(r.items.find(i => i.uid === 'g')?.effects?.[0]).toMatchObject({ id: 'social-armor', value: 1, applied: true })
    expect(r.effects.sustain).toMatchObject({ free: 1 })
    expect(r.switched?.effects.sustain).toMatchObject({ free: 2 }) // the activated sustain-spell, switched on
  })
})
