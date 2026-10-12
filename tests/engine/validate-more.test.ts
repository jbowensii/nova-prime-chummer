// Anarchy rule checks (src/engine/validate.ts) in the corners the table test leaves out: unknown references, effects that
// cannot go together, the Awakened and Emerged prerequisites, a career balance below zero, a formula that cannot be worked
// out, and a table that bans real SINs. Invented runners on the made-up catalog.
import { expect, test } from 'vitest'
import { appendEvent, finalize } from '../../src/engine/career'
import { blankCharacter } from '../../src/engine/file'
import { buildCatalog } from '../../src/engine/load'
import { validate } from '../../src/engine/validate'
import type { AmpEntry, Character } from '../../src/model/types'
import { cat, catFiles } from '../helpers'

const amp = (uid: string, type: string, effects: AmpEntry['effects'], extra: Partial<AmpEntry> = {}): AmpEntry => ({
  uid,
  type,
  name: uid,
  narrative: '',
  effects,
  ...extra,
})
const base = () => {
  const ch = blankCharacter()
  ch.build.attributes = { str: 2, agi: 2, wil: 2, log: 2, cha: 2 }
  return ch
}
const found = (ch: Character, code: string, c = cat) => validate(c, ch).filter(v => v.code === code)

test('an unknown level of play and an unknown metatype are warnings; an NPC needs no level', () => {
  const ch = base()
  ch.level = 'demigod'
  ch.identity.metatype = 'gone'
  expect(found(ch, 'ref.unknown').map(v => [v.severity, v.path, v.message])).toEqual([
    ['warning', 'level', 'Unknown level of play "demigod".'],
    ['warning', 'identity.metatype', 'Unknown metatype "gone".'],
  ])
  const npc = base()
  npc.level = 'demigod'
  npc.npc = { kind: 'npc', tier: 'regular' }
  npc.identity.metatype = 'gone'
  expect(found(npc, 'ref.unknown').map(v => v.path)).toEqual(['identity.metatype'])
  const spirit = base()
  spirit.npc = { kind: 'spirit', tier: 'regular' }
  spirit.identity.metatype = ''
  expect(found(spirit, 'ref.unknown')).toEqual([])
  const noMeta = base()
  noMeta.npc = { kind: 'npc', tier: 'regular' }
  noMeta.identity.metatype = ''
  expect(found(noMeta, 'npc.noMetatype').map(v => v.message)).toEqual(['An NPC (not a critter or spirit) needs a metatype.'])
})

test('a finalized runner whose balance is below zero says so', () => {
  const ch = base()
  const fin = finalize(cat, ch)
  const bought = appendEvent(
    { ...fin, career: fin.career.map(e => (e.type === 'finalize' ? { ...e, remaining: 10 } : e)) },
    { id: 'x', at: 't', type: 'change', changes: [{ key: 'item:x', label: 'Toy', to: '' }], cost: 9000 },
  )
  expect(found(bought, 'budget.over').map(v => [v.severity, v.message, v.page])).toEqual([['error', 'Career balance is -8,990¥.', 83]])
})

test('an unknown skill is a warning and is not checked further; an unknown specialization too; a custom one is the runner’s own', () => {
  const ch = base()
  ch.build.skills = [
    { id: 'basket-weaving', rating: 9, specs: ['x'] },
    { id: 'stealth', rating: 2, specs: ['stealth.nope', 'custom:Sneaking'] },
  ]
  expect(found(ch, 'ref.unknown').map(v => v.message)).toEqual(
    expect.arrayContaining(['Unknown skill "basket-weaving".', 'Unknown specialization "stealth.nope".']),
  )
  expect(found(ch, 'skill.cap')).toEqual([])
  expect(found(ch, 'ref.unknown').some(v => v.message.includes('Sneaking'))).toBe(false)
})

test('an amp of an unknown type, with an unknown effect, a skill or attribute that does not exist: each a warning', () => {
  const ch = base()
  ch.build.amps = [
    amp('a', 'mystery', [{ ref: 'no-such-effect' }]),
    amp('b', 'cyberware', [
      { ref: 'rr-skill', param: 'basket-weaving' },
      { ref: 'rr-attr', param: 'luck' },
    ]),
  ]
  expect(found(ch, 'ref.unknown').map(v => v.message)).toEqual([
    'a: unknown amp type "mystery".',
    'a: unknown effect "no-such-effect".',
    'b: unknown skill "basket-weaving".',
    'b: unknown attribute "luck".',
  ])
})

test('effects that exclude each other cannot be taken together', () => {
  const xml =
    `<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="ampeffects" version="1">` +
    `<effect id="odd-a" category="body" rating="1" types="cyberware" excludes="odd-b" source="CRB" page="9"><name>Odd A</name></effect>` +
    `<effect id="odd-b" category="body" rating="1" types="cyberware" source="CRB" page="9"><name>Odd B</name></effect></ca2:data>`
  const c = buildCatalog([...catFiles, { file: 'custom/odd.xml', xml, overlay: true }])
  const ch = base()
  ch.build.amps = [amp('a', 'cyberware', [{ ref: 'odd-a' }, { ref: 'odd-b' }])]
  expect(found(ch, 'amp.requires', c).map(v => v.message)).toEqual(['a: "Odd A" can\'t be combined with "Odd B".'])
  ch.build.amps = [amp('a', 'cyberware', [{ ref: 'odd-a' }])]
  expect(found(ch, 'amp.requires', c)).toEqual([])
})

test('Sorcery, Conjuring, Cracking and Tasking each need what the book says; being both Awakened and Emerged is refused', () => {
  const ch = base()
  ch.build.skills = ['sorcery', 'conjuring', 'cracking', 'tasking'].map(id => ({ id, rating: 1, specs: [] }))
  const codes = (c: Character) =>
    validate(cat, c)
      .filter(v => v.severity === 'error')
      .map(v => `${v.code}:${v.path}`)
  expect(codes(ch)).toEqual(
    expect.arrayContaining([
      'skill.requiresAwakened:skills.sorcery',
      'skill.requiresAwakened:skills.conjuring',
      'skill.requiresDeck:skills.cracking',
      'skill.requiresDni:skills.cracking',
      'skill.requiresEmerged:skills.tasking',
    ]),
  )
  const awake = base()
  awake.build.skills = [{ id: 'conjuring', rating: 1, specs: [] }]
  awake.build.amps = [amp('w', 'awakened', [{ ref: 'awk-conjuring' }])]
  expect(found(awake, 'skill.requiresAwakened')).toEqual([])
  const both = base()
  both.build.amps = [amp('w', 'awakened', []), amp('e', 'emerged', [])]
  expect(found(both, 'amp.emergedAwakened').map(v => [v.source, v.page])).toEqual([['CG', 8]])
  const rig = base()
  rig.build.amps = [amp('r', 'cyberware', [{ ref: 'rcc' }]), amp('v', 'cyberware', [{ ref: 'vcr' }])]
  expect(found(rig, 'rig.requiresVr').map(v => v.message)).toEqual([
    'A rigger command console needs VR access from cyberware (cold- or hot-sim VR).',
    'A vehicle control rig needs VR access from cyberware (cold- or hot-sim VR).',
  ])
  const vr = base()
  vr.build.amps = [amp('r', 'cyberware', [{ ref: 'rcc' }, { ref: 'vr-cold' }])]
  expect(found(vr, 'rig.requiresVr')).toEqual([])
})

test('a custom item whose cost formula cannot be worked out is noted, and its standard price counts', () => {
  const xml = `<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="gear" version="1"><item id="odd.thing" kind="gear" source="CRB" page="9" cost="x"><name>Odd Thing</name><formula field="cost">ref(items:odd.missing, cost)</formula><text/></item></ca2:data>`
  const c = buildCatalog([...catFiles, { file: 'custom/odd.xml', xml, overlay: true }])
  const ch = base()
  ch.build.items = [{ uid: 'i', catalogId: 'odd.thing', kind: 'gear', name: 'Odd Thing' }]
  const v = validate(c, ch).filter(x => x.code === 'catalog.formula')
  expect(v.map(x => [x.severity, x.path])).toEqual([['warning', 'items.i']])
  expect(v[0].message).toMatch(/^Odd Thing: its cost formula can’t be worked out \(.+\); the standard price counts\.$/)
})

test('a table that bans real SINs flags a runner who has one; the starting real SIN item counts too', () => {
  const ch = base()
  ch.build.items.push({ uid: 'rs', kind: 'gear', name: 'Real SIN', starting: 'real-sin' })
  expect(
    validate(cat, ch, { nonCanon: true, realSin: false })
      .filter(v => v.code === 'table.realSin')
      .map(v => v.message),
  ).toEqual(['This runner has a real SIN; your GM doesn’t allow real SINs at this table.'])
  expect(validate(cat, ch, { nonCanon: true, realSin: true }).filter(v => v.code === 'table.realSin')).toEqual([])
  expect(validate(cat, base(), { nonCanon: true, realSin: false }).filter(v => v.code === 'table.realSin')).toEqual([])
})
