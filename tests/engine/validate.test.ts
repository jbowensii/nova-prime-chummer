import { test, expect } from 'vitest'
import { blankCharacter } from '../../src/engine/file'
import { canFinalize, validate } from '../../src/engine/validate'
import { finalize, makeAmpAdd } from '../../src/engine/career'
import type { AmpEntry, Character } from '../../src/model/types'
import { cat } from '../helpers'

const amp = (uid: string, type: string, effects: AmpEntry['effects'], extra: Partial<AmpEntry> = {}): AmpEntry =>
  ({ uid, type, name: uid, narrative: '', effects, ...extra })
const codes = (ch: Character) => validate(cat, ch).map(v => v.code)
const count = (ch: Character, code: string) => codes(ch).filter(c => c === code).length
const base = () => {
  const ch = blankCharacter()
  ch.build.attributes = { str: 2, agi: 2, wil: 2, log: 2, cha: 2 }
  return ch
}

test.each<[string, (ch: Character) => void]>([
  ['budget.over', ch => { ch.build.attributes = { str: 4, agi: 4, wil: 4, log: 4, cha: 4 }; ch.build.skills = ['athletics', 'stealth', 'perception', 'influence', 'network', 'survival', 'piloting', 'electronics', 'engineering', 'close-combat', 'ranged-weapons'].map(id => ({ id, rating: 5, specs: [] })); ch.level = 'ganger' }],
  ['attr.range', ch => { ch.build.attributes.str = 6 }], // made-up human max 5
  ['attr.maxCount', ch => { ch.build.attributes.str = 5; ch.build.attributes.agi = 5; ch.build.attributes.wil = 5 }], // made-up runner: 2 at max
  ['skill.cap', ch => { ch.build.skills = [{ id: 'stealth', rating: 6, specs: [] }] }],
  ['spec.noSkill', ch => { ch.build.skills = [{ id: 'stealth', rating: 0, specs: ['stealth.palming'] }] }],
  ['rr.cap', ch => { ch.build.skills = [{ id: 'stealth', rating: 2, specs: [] }]; ch.build.amps = ['q', 'c', 'b'].map(u => amp(u, u === 'q' ? 'quality' : u === 'c' ? 'cyberware' : 'bioware', [{ ref: 'rr-skill', param: 'stealth' }])) }], // made-up runner: RR 2 on a Skill
  ['amp.effectMax', ch => { ch.build.amps = [amp('c', 'cyberware', [{ ref: 'armor-plus' }, { ref: 'armor-plus' }, { ref: 'armor-plus' }])] }],
  ['amp.requires', ch => { ch.build.amps = [amp('c', 'cyberware', [{ ref: 'init-2' }])] }],
  ['amp.typeIllegal', ch => { ch.build.amps = [amp('c', 'contact', [{ ref: 'vcr' }])] }],
  ['amp.negative', ch => { ch.build.amps = [amp('c', 'cyberware', [{ ref: 'negative', value: 2 }])] }],
  ['amp.param', ch => { ch.build.amps = [amp('c', 'contact', [{ ref: 'rr-spec' }])] }],
  ['amp.noItem', ch => { ch.build.amps = [amp('e', 'equipment', [{ ref: 'dv-plus' }])] }],
  ['adept.requiresAwakened', ch => { ch.build.amps = [amp('p', 'adept', [])] }],
  ['skill.requiresAwakened', ch => { ch.build.skills = [{ id: 'sorcery', rating: 1, specs: [] }] }],
  ['skill.requiresDeck', ch => { ch.build.skills = [{ id: 'cracking', rating: 1, specs: [] }] }],
  ['essence.dead', ch => { ch.build.amps = [1, 2, 3, 4, 5, 6].map(i => amp(`c${i}`, 'cyberware', [])) }],
  ['vehicle.armor', ch => { ch.build.amps = [amp('v', 'vehicle', [{ ref: 'vehicle-armor' }, { ref: 'vehicle-armor' }, { ref: 'vehicle-armor' }], { vehicle: 'small-drone' })] }], // made-up body 2
  ['ref.unknown', ch => { ch.build.items = [{ uid: 'x', catalogId: 'no-such-thing', kind: 'gear', name: 'Ghost' }] }],
  ['custom.content', ch => { ch.build.items = [{ uid: 'x', kind: 'gear', name: 'Ferrari', price: 50000 }] }],
])('%s', (code, mutate) => {
  const ch = base()
  expect(count(ch, code)).toBe(0)
  mutate(ch)
  expect(count(ch, code)).toBeGreaterThanOrEqual(1)
})

test('narrative.count and runner.basics are warnings on a blank character', () => {
  const v = validate(cat, base())
  expect(v.find(x => x.code === 'narrative.count')!.severity).toBe('warning')
  expect(v.filter(x => x.code === 'runner.basics')).toHaveLength(5)
})

test('amp.qualityAfterCreation: adding a Quality in career needs a GM', () => {
  let ch = finalize(cat, blankCharacter())
  ch = { ...ch, career: [...ch.career, makeAmpAdd(cat, ch, amp('q2', 'quality', [{ ref: 'narrative', param: 'lucky' }]))] }
  expect(codes(ch)).toContain('amp.qualityAfterCreation')
})

test('catalog-sanctioned negative effects need no approval', () => {
  const ch = base()
  const rush = cat.amps.get('test.rush')!
  ch.build.items = [{ uid: 'i', kind: 'gear', name: 'Rush' }]
  ch.build.amps = [amp('d', 'equipment', rush.effects, { catalogId: 'test.rush', linkedItem: 'i' })]
  expect(codes(ch)).not.toContain('amp.negative')
})

test('a GM override approves the violation and unblocks Finalize', () => {
  const ch = base()
  ch.build.attributes.str = 5
  ch.build.attributes.agi = 5
  ch.build.attributes.wil = 5
  expect(canFinalize(validate(cat, ch))).toBe(false)
  ch.overrides = [{ code: 'attr.maxCount', path: 'attributes', note: 'GM: street legend campaign' }]
  const v = validate(cat, ch)
  expect(v.find(x => x.code === 'attr.maxCount')!.approved).toBe(true)
  expect(canFinalize(v)).toBe(true)
})

test('effects a catalog amp carries are sanctioned even when the effect table forbids them (book drug pattern)', () => {
  const ch = base()
  const rush = cat.amps.get('test.rush')!
  ch.build.items = [{ uid: 'i', kind: 'gear', name: 'Rush' }]
  ch.build.amps = [amp('d', 'equipment', rush.effects, { catalogId: 'test.rush', linkedItem: 'i' })]
  expect(codes(ch)).not.toContain('amp.typeIllegal')
  ch.build.amps[0].catalogId = undefined // the same effects on a home-made amp are not
  expect(codes(ch)).toContain('amp.typeIllegal')
})
