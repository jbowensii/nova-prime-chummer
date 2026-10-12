// Canon edge cases: non-canon specs, items and snapshots (the made-up catalog's TEST source is not canon).
import { describe, test, expect } from 'vitest'
import { houseSource, nonCanonUses, ruleHelp, specSource } from '../../src/engine/canon'
import { blankCharacter } from '../../src/engine/file'
import type { AmpTemplate, Item } from '../../src/model/types'
import { cat } from '../helpers'

describe('houseSource', () => {
  test('a source the catalog does not have is a house source', () => expect(houseSource(cat, 'GONE')).toBe(true))
  test('no source at all is not', () => expect(houseSource(cat, undefined)).toBe(false))
  test('a book source is not a compendium', () => expect(houseSource(cat, 'CRB')).toBe(false))
})

describe('specSource', () => {
  test('a spec of an unknown skill, or an unknown spec of a known skill, has no source', () => {
    expect(specSource(cat, 'no-such-skill.x')).toBeUndefined()
    expect(specSource(cat, 'close-combat.no-such-spec')).toBeUndefined()
  })
})

describe('nonCanonUses', () => {
  test('a non-canon spec granted by an amp effect is flagged with the spec name', () => {
    const ch = blankCharacter()
    ch.build.amps = [{ uid: 'a', type: 'quality', name: 'Odd Training', narrative: '', effects: [{ ref: 'rr-spec', param: 'close-combat.made-up-style' }] }]
    expect(nonCanonUses(cat, ch.build)).toEqual([{ path: 'build.amps.0', name: 'Odd Training: Made-up style', source: 'TEST' }])
  })
  test('a custom or canon spec on an amp is not', () => {
    const ch = blankCharacter()
    ch.build.amps = [
      {
        uid: 'a',
        type: 'quality',
        name: 'Fine',
        narrative: '',
        effects: [{ ref: 'rr-spec', param: 'custom:Whips' }, { ref: 'rr-spec', param: 'close-combat.blades' }, { ref: 'rr-spec' }],
      },
    ]
    expect(nonCanonUses(cat, ch.build)).toEqual([])
  })
  test('a non-canon catalog item, and one that only survives as a snapshot, are flagged', () => {
    const ch = blankCharacter()
    const snap = { ...cat.items.get('test.nano-tape')!, id: 'gone.thing', source: 'TEST' } as Item
    ch.build.items = [
      { uid: 'i1', catalogId: 'test.nano-tape', kind: 'gear', name: 'Tape' },
      { uid: 'i2', catalogId: 'gone.thing', kind: 'gear', name: 'Thing', snapshot: snap },
      { uid: 'i3', kind: 'gear', name: 'Homemade' },
    ]
    expect(nonCanonUses(cat, ch.build)).toEqual([
      { path: 'build.items.0', name: 'Tape', source: 'TEST' },
      { path: 'build.items.1', name: 'Thing', source: 'TEST' },
    ])
  })
  test('an amp that only survives as a snapshot is judged by the snapshot’s source', () => {
    const ch = blankCharacter()
    const snapshot = { ...cat.amps.get('test.rush')!, id: 'gone.amp' } as AmpTemplate
    ch.build.amps = [{ uid: 'a', catalogId: 'gone.amp', type: 'equipment', name: 'Rush', narrative: '', effects: [], snapshot }]
    expect(nonCanonUses(cat, ch.build)).toEqual([{ path: 'build.amps.0', name: 'Rush', source: 'TEST' }])
  })
  test('a non-canon skill spec is flagged by its name; a custom one is not; an unknown id falls back to the id', () => {
    const ch = blankCharacter()
    ch.build.skills = [{ id: 'close-combat', rating: 2, specs: ['close-combat.made-up-style', 'custom:Whips', 'close-combat.blades'] }]
    expect(nonCanonUses(cat, ch.build)).toEqual([{ path: 'build.skills.0', name: 'Made-up style', source: 'TEST' }])
  })
})

describe('ruleHelp', () => {
  test('is the title and text of the first rule that explains an effect and has text; none otherwise', () => {
    expect(ruleHelp(cat, 'no-such-effect')).toBeUndefined()
    const r = cat.rules.get('test.gadget-basics')!
    expect(r.effects).toContain('rr-spec')
    const withText = new Map(cat.rules)
    withText.set(r.id, { ...r, text: 'Invented help.' })
    expect(ruleHelp({ ...cat, rules: withText }, 'rr-spec')).toBe(`${r.title}: Invented help.`)
    expect(ruleHelp(cat, 'rr-spec')).toBeUndefined()
  })
})
