// Levels (owner, 2026-10-11): an entry the book prints with several levels is one catalog entry per level. Made-up
// data only: TEST2's "Glide Step" 1-3 and its cyberdeck add-on "Overclock" +1/+2 (tests/fixtures/mini/custom).
import { describe, expect, test } from 'vitest'
import { ampCtx, ampFromTemplate, ampRating, applyMod, effectBlocked, overCap } from '../../src/engine/amps'
import { characterToXml, xmlToCharacter } from '../../src/engine/charxml'
import { entryXml } from '../../src/engine/compendium'
import { exportBooks } from '../../src/engine/export'
import { blankCharacter } from '../../src/engine/file'
import { familyName, levelLabel, levelsOf } from '../../src/engine/levels'
import { price } from '../../src/engine/price'
import { rescope } from '../../src/engine/rescope'
import { validate } from '../../src/engine/validate'
import type { AmpEntry, Character } from '../../src/model/types'
import { cat } from '../helpers'

const OPTS = { now: '2026-10-11T00:00:00.000Z', appVersion: 'test', descriptions: false }
// the lowest level keeps the id the entry had (owner, 2026-10-11), the others are new
const level = (n: number) => cat.amps.get(n === 1 ? 'test2.glide-step' : `test2.glide-step-level-${n}`)!
const withAmp = (amp: AmpEntry): Character => {
  const ch = blankCharacter()
  ch.build.amps = [amp]
  return ch
}

describe('levels', () => {
  test('each level is its own entry, read with its family and level, lowest first', () => {
    expect(levelsOf(cat, 'test2.glide-step').map(t => [t.id, t.name, t.level])).toEqual([
      ['test2.glide-step', 'Glide Step 1', 1],
      ['test2.glide-step-level-2', 'Glide Step 2', 2],
      ['test2.glide-step-level-3', 'Glide Step 3', 3],
    ])
    expect(levelsOf(cat, 'test.keen-eye')).toEqual([])
    expect(levelsOf(cat, undefined)).toEqual([])
  })

  test('a level rates as its book prints it', () => {
    for (const n of [1, 2, 3]) {
      const { amp } = ampFromTemplate(level(n), () => 'a')
      expect(ampRating(cat, amp, ampCtx(withAmp(amp).build, amp, cat))).toBe(level(n).printedRating)
    }
  })

  test('names and labels: the family name, where a level sits (an add-on signed)', () => {
    expect(familyName(level(2))).toBe('Glide Step')
    expect(familyName(cat.amps.get('test2.mod-overclock-level-2')!)).toBe('Overclock')
    expect(familyName(cat.amps.get('test.keen-eye')!)).toBe('Keen Eye') // not a level: its own name, digits and all
    expect(levelLabel(cat, level(2))).toBe('Level 2 (1–3)')
    expect(levelLabel(cat, cat.amps.get('test2.mod-overclock')!)).toBe('Level +1 (+1–+2)')
    expect(levelLabel(cat, cat.amps.get('test.keen-eye')!)).toBeUndefined()
  })

  test('a runner holding the old id holds the lowest level: nothing to map, its effects its own', () => {
    const ch = withAmp({ uid: 'a1', catalogId: 'test2.glide-step', type: 'adept', name: 'Glide Step', narrative: '', effects: [{ ref: 'narrative' }] })
    expect(rescope(cat, ch)).toBe(ch)
    expect(validate(cat, ch).filter(v => v.code === 'ref.unknown')).toEqual([])
  })

  test('an add-on applied before it was split (noted by its name without a level) is still the book’s', () => {
    const amp = (note: string): AmpEntry => ({
      uid: 'c1',
      type: 'cyberware',
      name: 'Jack',
      narrative: '',
      effects: [{ ref: 'vr-cold' }, { ref: 'attack-plus', note }],
    })
    const illegal = (note: string) => validate(cat, withAmp(amp(note))).filter(v => v.code === 'amp.typeIllegal')
    expect(illegal('Overclock')).toEqual([])
    expect(illegal('Overclock +2')).toEqual([])
    expect(illegal('Something else')).toHaveLength(1)
  })

  test('a runner’s snapshot and a compendium or edit entry keep family and level', () => {
    const { amp } = ampFromTemplate(level(2), () => 'a')
    const back = xmlToCharacter(characterToXml(withAmp(amp)))
    expect(back.ok && back.character.build.amps[0].snapshot).toMatchObject({ family: 'test2.glide-step', level: 2 })
    expect(entryXml('amps', level(2))).toContain('family="test2.glide-step" level="2"')
  })

  test('export: family and level on each, the lowest level under the old id (Foundry updates the old entry)', () => {
    const amps = exportBooks(cat, ['TEST2'], [], OPTS).books![0].amps
    const pick = (id: string) => amps.find(a => a.id === id)!
    expect(pick('test2.glide-step')).toMatchObject({ family: 'test2.glide-step', level: 1, rating: level(1).printedRating })
    expect(pick('test2.glide-step-level-3')).toMatchObject({ family: 'test2.glide-step', level: 3, rating: level(3).printedRating })
    expect(pick('test2.mod-overclock-level-2')).toMatchObject({ mod: true, level: 2, rating: 4 })
    expect(pick('test2.keen-eye').family).toBeUndefined()
  })

  test('an entry printed "Rating 3+" stays one: each extra rating is one more chosen narrative effect, priced by rating', () => {
    // made-up "Keen Eye" quality as such an entry: the player adds an Additional narrative effect per extra rating
    const { amp } = ampFromTemplate(cat.amps.get('test.keen-eye')!, () => 'k')
    const at = (a: AmpEntry) => {
      const ch = withAmp(a)
      return [ampRating(cat, a, ampCtx(ch.build, a, cat)), price(cat, ch).total] as const
    }
    const [r0, p0] = at(amp)
    const more = { ...amp, effects: [...amp.effects, { ref: 'narrative', param: 'Low-light vision' }] }
    const step = cat.ampEffects.get('narrative')!.rating
    expect(at(more)).toEqual([r0 + step, p0 + step * cat.pricing.ampPoint])
    expect(effectBlocked(cat, more, cat.ampEffects.get('narrative')!)).toBeUndefined() // no top
  })

  test('caps: an add-on that would pass an effect’s max, Firewall 5 or a vehicle’s Body is not offered', () => {
    const deck: AmpEntry = {
      uid: 'd',
      type: 'cyberdeck',
      name: 'Deck',
      narrative: '',
      effects: [{ ref: 'attack-plus' }, { ref: 'attack-plus' }, { ref: 'attack-plus' }],
    }
    expect(overCap(cat, deck)).toBeUndefined()
    expect(overCap(cat, applyMod(deck, cat.amps.get('test2.mod-overclock')!))).toBeUndefined() // made-up Attack max 4
    expect(overCap(cat, applyMod(deck, cat.amps.get('test2.mod-overclock-level-2')!))).toMatch(/max 4/)
    // made-up small drone: Body 2; an armor add-on applied by the player up to it
    const drone: AmpEntry = { uid: 'v', type: 'vehicle', name: 'Drone', narrative: '', vehicle: 'small-drone', effects: [{ ref: 'vehicle-armor' }] }
    const plate = cat.ampEffects.get('vehicle-armor')!
    expect(effectBlocked(cat, drone, plate)).toBeUndefined()
    const two = { ...drone, effects: [...drone.effects, { ref: 'vehicle-armor' }] }
    expect(overCap(cat, two)).toBeUndefined()
    expect(effectBlocked(cat, two, plate)).toMatch(/Body \(2\)/)
    expect(overCap(cat, { ...two, effects: [...two.effects, { ref: 'vehicle-armor' }] })).toMatch(/Body \(2\)/)
  })
})
