// An attribute's card, both games (src/sr6/ui/EntryRef.tsx sr6AttrRow, src/ui/AnarchyRef.tsx anarchyAttrRow): its natural
// and augmented ratings, its maximum, what raises it (the lines the effective value adds up) and the rule's source and
// page. Made-up runners on the made-up fixtures.
import { expect, test } from 'vitest'
import { attrRRSources, blankCharacter, derive } from '../../src/engine'
import { anarchyAttrRow } from '../../src/ui/AnarchyRef'
import { augmentBonus, bonusSources } from '../../src/sr6/engine/budgets'
import { deriveSr6 } from '../../src/sr6/engine/derive'
import { makeProvider } from '../../src/sr6/engine/providers'
import { blankSr6, type Sr6Attr } from '../../src/sr6/model/character'
import { advanceTarget, sr6AttrRow } from '../../src/sr6/ui/EntryRef'
import { cat } from '../helpers'
import { buildOf, fixtureCatalog, GLIM, made } from '../sr6/fixture'

function sr6Runner() {
  const ch = blankSr6('priority', 'r1', '2026-10-10T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'adept' })
  for (const [k, v] of Object.entries({ bod: 3, agi: 2, rea: 4, str: 1, wil: 2, log: 3, int: 4, cha: 1, edg: 2 })) ch.build.attributes[k as Sr6Attr].points = v
  ch.build.picks.push({ uid: 'k1', kind: 'adeptpowers', id: 'crb.quick-step', level: 2, bonuses: [{ target: 'agi', value: 1 }] })
  ch.build.purchases.push({
    uid: 'p1',
    kind: 'augmentations',
    id: 'crb.glow-eyes',
    qty: 1,
    accessories: [],
    rating: 2,
    bonuses: [{ target: 'agi', value: 1, perRating: true }],
  })
  const { data, cr } = made({ rules: { monitorBase: 9, monitorDivisor: 3 } })
  const p = makeProvider(ch.build.method, data, cr)
  return { c: fixtureCatalog(), data, cr, ch, p, d: deriveSr6(data, cr, ch) }
}

test('SR6: what raises an attribute, line by line, adds up to the augmented rating', () => {
  const ctx = sr6Runner()
  const from = bonusSources(ctx.ch.build, ctx.data, 'agi')
  expect(from.map(x => x.value)).toEqual([1, 2])
  expect(from.reduce((t, x) => t + x.value, 0)).toBe(augmentBonus(ctx.ch.build, ctx.data, 'agi'))
  expect(ctx.d.attrs.agi.augmented - ctx.d.attrs.agi.natural).toBe(3)
  expect(bonusSources(ctx.ch.build, ctx.data, 'bod')).toEqual([])
})

test('SR6: the card shows natural, augmented, the max (the metatype’s) and each line raising it', () => {
  const ctx = sr6Runner()
  const r = sr6AttrRow(ctx, 'agi')
  expect(r.name).toBe('Agility')
  expect(r.details).toBe(`natural ${ctx.d.attrs.agi.natural} · augmented ${ctx.d.attrs.agi.augmented} · max 7`)
  expect(r.effects?.map(x => x.text)).toEqual([expect.stringMatching(/^\+1 from /), expect.stringMatching(/^\+2 from /)])
  // Body has a catalog entry in the fixture: its source and page
  const bod = sr6AttrRow(ctx, 'bod')
  expect([bod.source, bod.page]).toEqual(['CRB', 38])
  expect(bod.effects).toEqual([])
})

test('SR6: a ledger spend names its attribute or entry', () => {
  const { ch } = sr6Runner()
  expect(advanceTarget(ch, { op: 'attribute', target: 'str' })).toEqual({ attr: 'str' })
  expect(advanceTarget(ch, { op: 'skill', target: 'crb.firearms' })).toEqual({ kind: 'skills', id: 'crb.firearms' })
  expect(advanceTarget(ch, { op: 'drop', target: 'p1' })).toEqual({ kind: 'augmentations', id: 'crb.glow-eyes' })
  expect(advanceTarget(ch, { op: 'lifestyle', id: 'crb.low', months: 1 })).toEqual({ kind: 'lifestyles', id: 'crb.low' })
  expect(advanceTarget(ch, { op: 'other' })).toBeUndefined()
})

test('Anarchy: the amps giving RR on an attribute are what derive counts; the card lists them with the max', () => {
  const ch = blankCharacter()
  ch.build.attributes.agi = 3
  const amp = cat.amps.get('test.hawk-instinct')!
  ch.build.amps.push({ uid: 'a1', catalogId: amp.id, type: amp.type, name: amp.name, narrative: '', effects: [{ ref: 'rr-attr', param: 'agi' }] } as never)
  expect(attrRRSources(ch.build, 'agi')).toEqual(['Hawk Instinct'])
  expect(derive(cat, ch).rrAttr.agi).toBe(1)
  const r = anarchyAttrRow(cat, ch, 'agi')
  expect(r.name).toBe('Finesse')
  expect(r.details).toBe('natural 3 · augmented 3 · max 5 · RR 1')
  expect(r.effects).toEqual([{ text: 'RR +1 on its tests from Hawk Instinct', state: 'applied' }])
  expect([r.source, r.page]).toEqual(['CRB', 7])
  expect(anarchyAttrRow(cat, ch, 'str').effects).toEqual([])
})

test('both games: the card lists what the total counts, then the switchable and conditional ones in brackets with their notes', () => {
  const ch = blankCharacter()
  ch.build.attributes.agi = 3
  const amp = cat.amps.get('test.hawk-instinct')!
  ch.build.amps.push({
    uid: 'a1',
    catalogId: amp.id,
    type: amp.type,
    name: amp.name,
    narrative: '',
    effects: [
      { ref: 'rr-attr', param: 'agi' },
      { ref: 'rr-attr', param: 'agi', when: 'in darkness' },
    ],
  } as never)
  const r = anarchyAttrRow(cat, ch, 'agi')
  expect(r.details).toContain('RR 1 (2)')
  expect(r.effects).toEqual([
    { text: 'RR +1 on its tests from Hawk Instinct', state: 'applied' },
    { text: 'RR +1 on its tests from Hawk Instinct (in darkness)', state: 'conditional' },
  ])
  const ctx = sr6Runner()
  ctx.ch.build.picks[0].bonuses = [
    { target: 'agi', value: 1 },
    { target: 'agi', value: 2, switch: 'wireless' },
  ]
  ctx.d = deriveSr6(ctx.data, ctx.cr, ctx.ch)
  const s = sr6AttrRow(ctx, 'agi')
  expect(s.details).toContain(`augmented ${ctx.d.attrs.agi.augmented} (${ctx.d.attrs.agi.augmented + 2})`)
  expect(s.effects?.filter(x => x.state === 'conditional').map(x => x.text)).toEqual([expect.stringMatching(/^\+2 from .*\(wireless\)$/)])
})
