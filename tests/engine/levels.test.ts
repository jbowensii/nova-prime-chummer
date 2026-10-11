// Levels (owner, 2026-10-11): an entry the book prints with several levels is one catalog entry per level. Made-up
// data only: TEST2's "Glide Step" 1-3 and its cyberdeck add-on "Overclock" +1/+2 (tests/fixtures/mini/custom).
import { describe, expect, test } from 'vitest'
import { ampCtx, ampFromTemplate, ampRating } from '../../src/engine/amps'
import { characterToXml, xmlToCharacter } from '../../src/engine/charxml'
import { entryXml } from '../../src/engine/compendium'
import { exportBooks } from '../../src/engine/export'
import { blankCharacter } from '../../src/engine/file'
import { familyName, levelFor, levelLabel, levelsOf } from '../../src/engine/levels'
import { rescope } from '../../src/engine/rescope'
import { validate } from '../../src/engine/validate'
import type { AmpEntry, Character } from '../../src/model/types'
import { cat } from '../helpers'

const OPTS = { now: '2026-10-11T00:00:00.000Z', appVersion: 'test', descriptions: false }
const level = (n: number) => cat.amps.get(`test2.glide-step-level-${n}`)!
const withAmp = (amp: AmpEntry): Character => { const ch = blankCharacter(); ch.build.amps = [amp]; return ch }

describe('levels', () => {
  test('each level is its own entry, read with its family and level, lowest first', () => {
    expect(levelsOf(cat, 'test2.glide-step').map(t => [t.id, t.name, t.level])).toEqual([
      ['test2.glide-step-level-1', 'Glide Step 1', 1], ['test2.glide-step-level-2', 'Glide Step 2', 2], ['test2.glide-step-level-3', 'Glide Step 3', 3]])
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
    expect(levelLabel(cat, cat.amps.get('test2.mod-overclock-level-1')!)).toBe('Level +1 (+1–+2)')
    expect(levelLabel(cat, cat.amps.get('test.keen-eye')!)).toBeUndefined()
  })

  test('an old runner with the family id gets the level its effects rate as, else the lowest; career events too', () => {
    const old = (effects: AmpEntry['effects'], catalogId = 'test2.glide-step'): AmpEntry =>
      ({ uid: 'a1', catalogId, type: 'adept', name: 'Glide Step', narrative: '', effects })
    expect(levelFor(cat, old([]))?.id).toBe('test2.glide-step-level-1')
    expect(levelFor(cat, old([{ ref: 'narrative', param: 'farther' }]))?.id).toBe('test2.glide-step-level-2')
    expect(levelFor(cat, old([{ ref: 'rr-attr', param: 'agi' }]))?.id).toBe('test2.glide-step-level-1') // no level rates so
    const ch = withAmp(old([{ ref: 'narrative' }, { ref: 'narrative' }]))
    ch.career = [{ id: 'e1', at: '2026-10-01T00:00:00Z', type: 'amp-add', amp: old([]), cost: 5000 }]
    const r = rescope(cat, ch)
    expect(r.build.amps[0].catalogId).toBe('test2.glide-step-level-3')
    expect(r.build.amps[0].name).toBe('Glide Step') // the player's name stays
    expect((r.career[0] as { amp: AmpEntry }).amp.catalogId).toBe('test2.glide-step-level-1')
    // saved before ids were scoped: its snapshot's book scopes it
    const unscoped = { ...old([], 'glide-step'), snapshot: { ...level(1), id: 'glide-step', family: undefined, level: undefined } }
    expect(rescope(cat, withAmp(unscoped)).build.amps[0].catalogId).toBe('test2.glide-step-level-1')
    // a runner already on a level is left as it is
    const now = withAmp({ ...old([]), catalogId: 'test2.glide-step-level-2' })
    expect(rescope(cat, now)).toBe(now)
    // and the mapped runner has no unknown reference
    expect(validate(cat, r).filter(v => v.code === 'ref.unknown')).toEqual([])
  })

  test('an add-on applied before it was split (noted by its name without a level) is still the book’s', () => {
    const amp = (note: string): AmpEntry => ({ uid: 'c1', type: 'cyberware', name: 'Jack', narrative: '', effects: [{ ref: 'vr-cold' }, { ref: 'attack-plus', note }] })
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

  test('export: family and level on each, the lowest level carries the family id as an alias (Foundry updates the old entry)', () => {
    const amps = exportBooks(cat, ['TEST2'], [], OPTS).books![0].amps
    const pick = (id: string) => amps.find(a => a.id === id)!
    expect(pick('test2.glide-step-level-1')).toMatchObject({ family: 'test2.glide-step', level: 1, aliases: [{ id: 'test2.glide-step' }], rating: level(1).printedRating })
    expect(pick('test2.glide-step-level-3')).toMatchObject({ family: 'test2.glide-step', level: 3, rating: level(3).printedRating })
    expect(pick('test2.glide-step-level-3').aliases).toBeUndefined()
    expect(pick('test2.mod-overclock-level-2')).toMatchObject({ mod: true, level: 2, rating: 4 })
    expect(pick('test2.keen-eye').family).toBeUndefined()
  })
})
