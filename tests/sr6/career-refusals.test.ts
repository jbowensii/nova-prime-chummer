// The career engine's refusals and the less-travelled spends (src/sr6/engine/career.ts): every reason a spend is turned
// down, and each advance replayed onto the build. The made-up fixture and invented prices (see career.test.ts).
import { expect, test } from 'vitest'
import {
  applyAdvance,
  balances,
  careerPowerPoints,
  currentBuild,
  ledgerLabel,
  ledgerRows,
  note,
  earn,
  preview,
  record,
  validateCareer,
  voidEntry,
} from '../../src/sr6/engine/career'
import { makeProvider } from '../../src/sr6/engine/providers'
import { blankBuild, blankSr6, type MagicKind, type Sr6Advance, type Sr6Character, type Sr6Purchase } from '../../src/sr6/formats/domain/character'
import { buildOf, GLIM, made } from './catalog/fixture'

const NOW = '2026-10-06T10:00:00.000Z'
function runner(o: { magic?: MagicKind; karma?: number; nuyen?: number } = {}): Sr6Character {
  const ch = blankSr6('karma', 'c1', NOW)
  ch.build = buildOf('karma', { metatype: GLIM, magic: o.magic ?? 'mundane' })
  ch.identity.metatype = GLIM
  ch.finalizedAt = NOW
  ch.final = { karma: o.karma ?? 100, nuyen: o.nuyen ?? 5000 }
  ch.ledger = [{ id: 'f1', at: NOW, type: 'finalize', karma: o.karma ?? 100, nuyen: o.nuyen ?? 5000 }]
  return ch
}
const why = (ch: Sr6Character, a: Sr6Advance, m = made(), typed = {}) => {
  const r = preview(ch, a, m.data, m.cr, typed)
  return r.ok ? `ok:${r.label}` : r.reason
}
const ok = (ch: Sr6Character, a: Sr6Advance, m = made(), typed = {}) => {
  const r = record(ch, a, m.data, m.cr, typed, NOW)
  if (!r.ok) throw new Error(r.reason)
  return r.ch
}
const gear = (id: string, extra: Partial<Sr6Purchase> = {}): Sr6Purchase => ({
  uid: 'g1',
  kind: id === 'crb.zap-gun' ? 'weapons' : 'gear',
  id,
  qty: 1,
  accessories: [],
  ...extra,
})

test('a draft runner has nothing to spend', () => {
  const ch = runner()
  ch.finalizedAt = undefined
  expect(why(ch, { op: 'other' })).toBe('not-finalized')
})

test('attributes: Magic and Resonance only for those who have them, and never past the cap plus the grade', () => {
  expect(why(runner(), { op: 'attribute', target: 'mag' })).toBe('unknown-attribute')
  expect(why(runner({ magic: 'full' }), { op: 'attribute', target: 'res' })).toBe('unknown-attribute')
  const mage = runner({ magic: 'full' })
  mage.build.attributes.mag.points = 6 // rating 7 = magicMax
  expect(why(mage, { op: 'attribute', target: 'mag' })).toBe('at-maximum')
  mage.build.initiation = 1 // one more with a grade of initiation
  expect(why(mage, { op: 'attribute', target: 'mag' })).toMatch(/^ok:MAG 7 → 8/)
  const tm = runner({ magic: 'technomancer' })
  tm.build.attributes.res.points = 6
  expect(why(tm, { op: 'attribute', target: 'res' })).toBe('at-maximum')
  tm.build.submersion = 2
  expect(why(tm, { op: 'attribute', target: 'res' })).toMatch(/^ok:RES 7 → 8/)
})

test('skills: an unknown one is refused; a specialization needs a skill, a name, and no earlier one (unless several are allowed)', () => {
  const ch = runner()
  expect(why(ch, { op: 'skill', target: 'crb.nope' })).toBe('unknown-entry')
  expect(why(ch, { op: 'spec', target: 'crb.nope', name: 'x' })).toBe('unknown-entry')
  expect(why(ch, { op: 'spec', target: 'crb.tinkering', name: '  ' })).toBe('needs-name')
  ch.build.skills.push({ id: 'crb.tinkering', points: 2, karma: 0, spec: 'Gizmos', expertise: 'Gears' })
  expect(why(ch, { op: 'spec', target: 'crb.tinkering', name: 'Locks' })).toBe('already-known')
  expect(why(ch, { op: 'expertise', target: 'crb.tinkering', name: 'Locks' })).toBe('already-known')
})

test('a further specialization is kept beside the first once the table allows several', () => {
  const m = made({ rules: { expandedSpecializations: true } })
  const ch = runner()
  ch.build.skills.push({ id: 'crb.tinkering', points: 2, karma: 0, spec: 'Gizmos' })
  const s = ok(ch, { op: 'spec', target: 'crb.tinkering', name: 'Locks' }, m)
  expect(currentBuild(s).skills[0]).toMatchObject({ spec: 'Gizmos', specs: ['Locks'] })
  // naming the first again does not duplicate it
  const b2 = structuredClone(ch.build)
  applyAdvance(b2, { op: 'spec', target: 'crb.tinkering', name: 'Gizmos' })
  expect(b2.skills[0].specs).toBeUndefined()
})

test('a spec or expertise on a skill the runner lacks adds it at rank 0', () => {
  const b = blankBuild('karma')
  applyAdvance(b, { op: 'spec', target: 'crb.gab', name: 'Haggling' })
  applyAdvance(b, { op: 'expertise', target: 'crb.hexing', name: 'Curses' })
  expect(b.skills).toEqual([
    { id: 'crb.gab', points: 0, karma: 0, spec: 'Haggling' },
    { id: 'crb.hexing', points: 0, karma: 0, expertise: 'Curses' },
  ])
})

test('knowledge and languages need a name, cost karmaKnowledge and join at rank 1 karma', () => {
  const ch = runner(),
    m = made()
  const line = (name: string, kind: 'knowledge' | 'language') => ({ uid: '', name, kind, points: 0, karma: 0 })
  expect(why(ch, { op: 'knowledge', line: line(' ', 'knowledge') })).toBe('needs-name')
  expect(preview(ch, { op: 'knowledge', line: line('Old maps', 'knowledge') }, m.data, m.cr)).toEqual({
    ok: true,
    label: 'Knowledge: Old maps',
    karma: 3,
    nuyen: 0,
  })
  const r = ok(ch, { op: 'knowledge', line: line('Glimmerish', 'language') })
  expect(ledgerLabel(r.ledger.at(-1)!)).toBe('Language: Glimmerish')
  expect(currentBuild(r).knowledge).toMatchObject([{ name: 'Glimmerish', kind: 'language', points: 0, karma: 1 }])
  expect(currentBuild(r).knowledge[0].uid).toBeTruthy()
})

test('qualities: positive only, once unless leveled, never past the maximum, and never below one level', () => {
  const ch = runner()
  const q = (id: string, level = 1): Sr6Advance => ({ op: 'quality', line: { uid: '', id, level } })
  expect(why(ch, q('crb.nope'))).toBe('unknown-entry')
  expect(why(ch, q('crb.butterfingers'))).toBe('not-positive')
  expect(why(ch, q('crb.knack', 0))).toBe('below-one')
  expect(why(ch, q('crb.knack', 2))).toBe('at-maximum')
  expect(why(ch, q('crb.knack'))).toBe('ok:Quality: Knack')
  ch.build.qualities.push({ uid: 'q1', id: 'crb.knack', level: 1 })
  expect(why(ch, q('crb.knack'))).toBe('already-known')
  // a free (metatype) trait does not count as taken
  const free = runner()
  free.build.qualities.push({ uid: 'q1', id: 'crb.knack', level: 1, free: true })
  expect(why(free, q('crb.knack'))).toBe('ok:Quality: Knack')
})

test('a quality with no printed Karma is a book value the app will not guess', () => {
  const m = made({
    data: d => {
      d.qualities['crb.knack'] = { ...d.qualities['crb.knack'], karma: null }
    },
  })
  expect(why(runner(), { op: 'quality', line: { uid: '', id: 'crb.knack', level: 1 } }, m)).toBe('book-value')
})

test('leveled qualities: the next level replaces the lower at the difference; past the top is refused', () => {
  const ch = runner(),
    m = made()
  ch.build.qualities.push({ uid: 'q1', id: 'crb.lucky-streak.1', level: 1 })
  expect(why(ch, { op: 'quality', line: { uid: '', id: 'crb.lucky-streak.1', level: 1 } })).toBe('already-known')
  expect(why(ch, { op: 'quality', line: { uid: '', id: 'crb.lucky-streak.3', level: 1 } })).toBe('ok:Quality: Lucky Streak 3')
  const top = runner()
  top.build.qualities.push({ uid: 'q1', id: 'crb.lucky-streak.3', level: 1 })
  expect(why(top, { op: 'quality', line: { uid: '', id: 'crb.lucky-streak', level: 1 } })).toBe('at-maximum')
  const fresh = runner()
  expect(why(fresh, { op: 'quality', line: { uid: '', id: 'crb.lucky-streak.2', level: 1 } })).toBe('ok:Quality: Lucky Streak 2')
  // from nothing to level 2 costs level 2's Karma in full (8) × 3
  expect(preview(fresh, { op: 'quality', line: { uid: '', id: 'crb.lucky-streak.2', level: 1 } }, m.data, m.cr)).toMatchObject({ karma: 24 })
})

test('buying off: only a negative quality the runner took, not a free one, with a printed Karma', () => {
  const ch = runner()
  ch.build.qualities.push(
    { uid: 'n1', id: 'crb.butterfingers', level: 1 },
    { uid: 'n2', id: 'crb.butterfingers', level: 1, free: true },
    { uid: 'p1', id: 'crb.knack', level: 1 },
    { uid: 'x1', id: 'crb.gone', level: 1 },
  )
  expect(why(ch, { op: 'buyoff', target: 'zz' })).toBe('not-taken')
  expect(why(ch, { op: 'buyoff', target: 'n2' })).toBe('free-trait')
  expect(why(ch, { op: 'buyoff', target: 'x1' })).toBe('unknown-entry')
  expect(why(ch, { op: 'buyoff', target: 'p1' })).toBe('not-negative')
  expect(why(ch, { op: 'buyoff', target: 'n1' })).toBe('ok:Buy off: Butterfingers')
  const m = made({
    data: d => {
      d.qualities['crb.butterfingers'] = { ...d.qualities['crb.butterfingers'], karma: null }
    },
  })
  expect(why(ch, { op: 'buyoff', target: 'n1' }, m)).toBe('book-value')
  // the line stays in the ledger for the history, and the quality leaves the build
  const r = ok(ch, { op: 'buyoff', target: 'n1' })
  expect(r.ledger.at(-1)).toMatchObject({ type: 'advance', advance: { op: 'buyoff', line: { id: 'crb.butterfingers' } } })
  expect(currentBuild(r).qualities.map(q => q.uid)).toEqual(['n2', 'p1', 'x1'])
})

test('spells and forms: only the kinds that can be learned, once each, from the catalog', () => {
  const ch = runner({ magic: 'full' })
  const pick = (kind: 'spells' | 'complexforms' | 'metamagics' | 'adeptpowers', id: string): Sr6Advance => ({ op: 'pick', line: { uid: '', kind, id } })
  expect(why(ch, pick('metamagics', 'crb.soft-echo'))).toBe('cannot-learn')
  expect(why(ch, pick('spells', 'crb.nope'))).toBe('unknown-entry')
  expect(why(ch, pick('spells', 'crb.glow-ward'))).toBe('ok:Spell: Glow Ward')
  expect(why(ch, pick('complexforms', 'crb.static-veil'))).toBe('ok:Complex form: Static Veil')
  ch.build.picks.push({ uid: 's1', kind: 'spells', id: 'crb.glow-ward' })
  expect(why(ch, pick('spells', 'crb.glow-ward'))).toBe('already-known')
})

test('adept powers: power points, a maximum level, a printed cost; a leveled one taken again goes up a level', () => {
  const m = made()
  const adept = runner({ magic: 'adept' })
  adept.build.attributes.mag.points = 2 // Magic 3: 3 power points
  const pick = (id = 'crb.quick-step'): Sr6Advance => ({ op: 'pick', line: { uid: '', kind: 'adeptpowers', id } })
  expect(why(adept, pick('crb.nope'), m)).toBe('unknown-entry')
  expect(why(adept, pick('crb.quick-step.1'), m)).toMatch(/^ok:Adept power: Quick Step/)
  const k = makeProvider('karma', m.data, m.cr)
  expect(careerPowerPoints(adept.build, m.data, m.cr, k)).toMatchObject({ max: 3, spent: 0, left: 3 })
  const poor = runner({ magic: 'adept' })
  poor.build.picks.push({ uid: 'p1', kind: 'adeptpowers', id: 'crb.quick-step.4' })
  expect(why(poor, pick('crb.quick-step.1'), m)).toBe('already-known')
  const lowest = made({
    data: d => {
      d.powers['crb.quick-step.2'] = { ...d.powers['crb.quick-step.2'], cost: 5 }
    },
  })
  expect(why(runner({ magic: 'adept' }), pick('crb.quick-step.2'), lowest)).toBe('no-power-points') // Magic 1: one point
  const nocost = made({
    data: d => {
      d.powers['crb.quick-step.2'] = { ...d.powers['crb.quick-step.2'], cost: null }
    },
  })
  expect(why(adept, pick('crb.quick-step.2'), nocost)).toBe('book-value')
})

test('a power that is not leveled: taken once; one with levels goes up to its maximum', () => {
  const m = made({
    data: d => {
      d.powers['crb.solo'] = { ...d.powers['crb.quick-step'], perLevel: false, maxLevel: 1, cost: 0.5 }
      d.powers['crb.stack'] = { ...d.powers['crb.quick-step'], perLevel: true, maxLevel: 2, cost: 0.25 }
      const old = d.entry
      d.entry = (k, id) =>
        k === 'adeptpowers' && (id === 'crb.solo' || id === 'crb.stack')
          ? { ...old('adeptpowers', 'crb.quick-step')!, id, name: id === 'crb.solo' ? 'Solo' : 'Stack' }
          : old(k, id)
    },
  })
  const adept = runner({ magic: 'adept' })
  adept.build.attributes.mag.points = 4
  const pick = (id: string): Sr6Advance => ({ op: 'pick', line: { uid: '', kind: 'adeptpowers', id } })
  expect(why(adept, pick('crb.solo'), m)).toBe('ok:Adept power: Solo')
  expect(why(adept, pick('crb.stack'), m)).toBe('ok:Adept power: Stack 1')
  adept.build.picks.push({ uid: 'a', kind: 'adeptpowers', id: 'crb.solo' }, { uid: 'b', kind: 'adeptpowers', id: 'crb.stack', level: 1 })
  expect(why(adept, pick('crb.solo'), m)).toBe('already-known')
  expect(why(adept, pick('crb.stack'), m)).toBe('ok:Adept power: Stack 2')
  adept.build.picks[1].level = 2
  expect(why(adept, pick('crb.stack'), m)).toBe('at-maximum')
  // recorded: a first take lands at level 1; replayed, a second goes up a level
  const r = ok(runner({ magic: 'adept' }), pick('crb.stack'), m)
  expect(currentBuild(r).picks).toMatchObject([{ id: 'crb.stack', level: 1, name: 'Stack' }])
  const b = structuredClone(currentBuild(r))
  applyAdvance(b, { op: 'pick', line: { uid: 'z', kind: 'adeptpowers', id: 'crb.stack' } })
  expect(b.picks[0].level).toBe(2)
  applyAdvance(b, { op: 'pick', line: { uid: 'z', kind: 'adeptpowers', id: 'crb.solo' } })
  applyAdvance(b, { op: 'pick', line: { uid: 'z2', kind: 'adeptpowers', id: 'crb.solo' } }) // not leveled: no change
  expect(b.picks.map(p => p.id)).toEqual(['crb.stack', 'crb.solo'])
})

test('martial arts: a style with its signature technique free; other techniques one by one', () => {
  const ch = runner()
  const art = (techniques: { uid: string; id: string }[], id = 'crb.glow-fist'): Sr6Advance => ({ op: 'martialart', line: { uid: '', id, techniques } })
  expect(why(ch, art([], 'crb.nope'))).toBe('unknown-entry')
  expect(why(ch, art([{ uid: '', id: 'crb.nope' }]))).toBe('unknown-entry')
  expect(why(ch, art([]))).toBe('ok:Martial art: Glow Fist')
  expect(why(ch, art([{ uid: '', id: 'crb.glow-jab' }]))).toBe('ok:Martial art: Glow Fist with Glow Jab')
  const r = ok(ch, art([{ uid: '', id: 'crb.glow-jab' }]))
  expect(currentBuild(r).martialArts[0]).toMatchObject({ id: 'crb.glow-fist', name: 'Glow Fist', techniques: [{ id: 'crb.glow-jab', name: 'Glow Jab' }] })
  expect(why(r, art([]))).toBe('already-known')
  expect(why(r, { op: 'technique', target: currentBuild(r).martialArts[0].uid, line: { uid: '', id: 'crb.glow-jab' } })).toBe('already-known')
  const m = made({
    data: d => {
      const old = d.entry
      d.entry = (k, id) =>
        k === 'martialarts' && id === 'crb.glow-fist' ? { ...old(k, id)!, attrs: { ...old(k, id)!.attrs, signature: 'Other' } } : old(k, id)
    },
  })
  expect(why(ch, art([{ uid: '', id: 'crb.glow-jab' }]), m)).toBe('not-signature')
})

test('a technique: under a style the runner has, not twice; the signature is free, any other costs karmaTechnique', () => {
  const learned = ok(runner(), { op: 'martialart', line: { uid: '', id: 'crb.glow-fist', techniques: [] } })
  const uid = currentBuild(learned).martialArts[0].uid
  const tech = (id: string, target = uid): Sr6Advance => ({ op: 'technique', target, line: { uid: '', id } })
  expect(why(learned, tech('crb.glow-jab', 'zz'))).toBe('not-taken')
  expect(why(learned, tech('crb.nope'))).toBe('unknown-entry')
  const m0 = made()
  expect(preview(learned, tech('crb.glow-jab'), m0.data, m0.cr)).toEqual({ ok: true, label: 'Technique: Glow Jab (Glow Fist)', karma: 0, nuyen: 0 })
  const m = made({
    data: d => {
      const old = d.entry
      d.entry = (k, id) => (k === 'martialarts' ? undefined : old(k, id))
    },
  })
  const fallback = preview(learned, tech('crb.glow-jab'), m.data, m.cr)
  expect(fallback).toMatchObject({ ok: true, karma: 4 })
  const r = ok(learned, tech('crb.glow-jab'))
  expect(currentBuild(r).martialArts[0].techniques).toMatchObject([{ id: 'crb.glow-jab', name: 'Glow Jab' }])
})

test('power points: bought only by those who pay for powers (a mystic adept), up to Magic', () => {
  expect(why(runner({ magic: 'full' }), { op: 'powerpoint' })).toBe('cannot-learn')
  const ma = runner({ magic: 'mystic-adept' })
  expect(why(ma, { op: 'powerpoint' })).toBe('ok:Power point')
  ma.build.powerPointsBought = 1 // Magic 1
  expect(why(ma, { op: 'powerpoint' })).toBe('at-maximum')
  const r = ok(runner({ magic: 'mystic-adept' }), { op: 'powerpoint' })
  expect(currentBuild(r).powerPointsBought).toBe(1)
  expect(balances(r).karma).toBe(93)
})

test('initiation: a mundane cannot; a metamagic must be the kind the path takes, from the catalog, and not taken twice', () => {
  expect(why(runner(), { op: 'initiate' })).toBe('mundane-cannot-initiate')
  const mage = runner({ magic: 'full' })
  mage.build.attributes.mag.points = 3
  const meta = (id: string, kind: 'metamagics' | 'echoes' = 'metamagics'): Sr6Advance => ({ op: 'initiate', line: { uid: '', kind, id } })
  expect(why(mage, meta('crb.quiet-loop', 'echoes'))).toBe('cannot-learn')
  expect(why(mage, meta('crb.nope'))).toBe('unknown-entry')
  expect(why(mage, meta('crb.soft-echo'))).toBe('ok:Initiation grade 1 (Soft Echo)')
  mage.build.picks.push({ uid: 'm1', kind: 'metamagics', id: 'crb.soft-echo' })
  expect(why(mage, meta('crb.soft-echo'))).toBe('already-known')
  // a leveled metamagic goes up to its maximum, naming the level
  const lv = runner({ magic: 'full' })
  lv.build.attributes.mag.points = 4
  expect(why(lv, meta('crb.glow-point'))).toBe('ok:Initiation grade 1 (Glow Point 1)')
  lv.build.picks.push({ uid: 'm2', kind: 'metamagics', id: 'crb.glow-point.3' })
  expect(why(lv, meta('crb.glow-point'))).toBe('at-maximum')
  lv.build.picks[0].id = 'crb.glow-point.1'
  expect(why(lv, meta('crb.glow-point'))).toBe('ok:Initiation grade 1 (Glow Point 2)')
  expect(why(lv, meta('crb.glow-point.1'))).toBe('already-known')
  // the grade never goes past Magic
  const capped = runner({ magic: 'full' })
  capped.build.initiation = 1
  expect(why(capped, { op: 'initiate' })).toBe('at-maximum')
})

test('submersion takes echoes only, and a repeated metamagic is levelled on replay', () => {
  const tm = runner({ magic: 'technomancer' })
  tm.build.attributes.res.points = 2
  expect(why(tm, { op: 'initiate', line: { uid: '', kind: 'metamagics', id: 'crb.soft-echo' } })).toBe('cannot-learn')
  const r = ok(tm, { op: 'initiate', line: { uid: '', kind: 'echoes', id: 'crb.quiet-loop' } })
  expect(currentBuild(r)).toMatchObject({ submersion: 1, picks: [{ kind: 'echoes', id: 'crb.quiet-loop', name: 'Quiet Loop' }] })
  const b = blankBuild('karma')
  b.magic = 'full'
  applyAdvance(b, { op: 'initiate', line: { uid: 'u1', kind: 'metamagics', id: 'crb.glow-point', level: 1 } })
  applyAdvance(b, { op: 'initiate', line: { uid: 'u2', kind: 'metamagics', id: 'crb.glow-point' } })
  applyAdvance(b, { op: 'initiate' })
  expect(b).toMatchObject({ initiation: 3, picks: [{ id: 'crb.glow-point', level: 2 }] })
})

test('gear: a count of at least one, a catalog line, a rating it comes in, a grade that exists and applies', () => {
  const ch = runner()
  const buy = (line: Sr6Purchase): Sr6Advance => ({ op: 'purchase', line })
  expect(why(ch, buy(gear('crb.zap-gun', { qty: 0 })))).toBe('below-one')
  expect(why(ch, buy(gear('crb.nope')))).toBe('unknown-entry')
  expect(why(ch, buy(gear('crb.tangle-rope', { rating: 9 })))).toBe('rating-range')
  expect(why(ch, buy({ uid: 'c', kind: 'gear', name: 'Mystery', cost: 40, qty: 2, accessories: [] }))).toBe('ok:Mystery × 2')
  expect(why(ch, buy(gear('crb.zap-gun', { grade: 'nope' })))).toBe('unknown-grade')
  expect(why(ch, buy(gear('crb.zap-gun', { grade: 'alpha' })))).toBe('no-grade')
  expect(why(ch, buy({ uid: 'c', kind: 'gear', qty: 1, accessories: [] }))).toBe('ok:Custom item')
  expect(why(ch, buy(gear('crb.tangle-rope', { rating: 2 })))).toMatch(/\(rating 2\)$/)
})

test('dropping gear: only a line the runner has; a custom line is named as such', () => {
  const ch = runner()
  ch.build.purchases.push(
    gear('crb.zap-gun'),
    { uid: 'c1', kind: 'gear', qty: 1, accessories: [] },
    { uid: 'c2', kind: 'gear', name: 'Mine', qty: 1, accessories: [] },
  )
  expect(why(ch, { op: 'drop', target: 'zz' })).toBe('unknown-line')
  expect(why(ch, { op: 'drop', target: 'g1' })).toBe('ok:Dropped: Zap Gun')
  expect(why(ch, { op: 'drop', target: 'c1' })).toBe('ok:Dropped: Custom item')
  expect(why(ch, { op: 'drop', target: 'c2' })).toBe('ok:Dropped: Mine')
  const r = ok(ch, { op: 'drop', target: 'g1' })
  expect(currentBuild(r).purchases.map(x => x.uid)).toEqual(['c1', 'c2'])
  expect(r.ledger.at(-1)).toMatchObject({ advance: { line: { id: 'crb.zap-gun' } } })
})

test('upgrading gear: a line the runner has, to a higher level of the same family', () => {
  const ch = runner()
  ch.build.purchases.push(gear('crb.tangle-rope.2'), gear('crb.zap-gun', { uid: 'g2' }))
  const up = (target: string, id: string, extra: Partial<Sr6Purchase> = {}): Sr6Advance => ({ op: 'upgrade', target, line: gear(id, { uid: '', ...extra }) })
  expect(why(ch, up('zz', 'crb.tangle-rope.3'))).toBe('unknown-line')
  expect(why(ch, up('g1', 'crb.nope'))).toBe('unknown-entry')
  expect(why(ch, up('g2', 'crb.zap-gun'))).toBe('not-a-level')
  expect(why(ch, up('g1', 'crb.tangle-rope.2'))).toBe('already-known')
  expect(why(ch, up('g1', 'crb.tangle-rope.3', { grade: 'nope' }))).toBe('unknown-grade')
  expect(why(ch, up('g1', 'crb.tangle-rope.3'))).toBe('ok:Upgrade: Tangle Rope 2 → Tangle Rope 3')
  const r = ok(ch, up('g1', 'crb.tangle-rope.3'))
  expect(currentBuild(r).purchases[0]).toMatchObject({ uid: 'g1', id: 'crb.tangle-rope.3', name: 'Tangle Rope 3' })
  // an upgrade whose target is gone replays as nothing
  const b = structuredClone(currentBuild(ch))
  applyAdvance(b, { op: 'upgrade', target: 'zz', line: gear('crb.tangle-rope.3') })
  expect(b.purchases.map(x => x.id)).toEqual(['crb.tangle-rope.2', 'crb.zap-gun'])
})

test('a contact needs connection and loyalty of at least one; a typed label, else a name; the contact replaces itself by uid', () => {
  const ch = runner()
  const c = (connection: number, loyalty: number, name = 'Mo'): Sr6Advance => ({
    op: 'contact',
    line: { uid: 'k1', name, archetype: 'fixer', connection, loyalty },
  })
  expect(why(ch, c(0, 1))).toBe('below-one')
  expect(why(ch, c(1, 0))).toBe('below-one')
  expect(why(ch, c(1, 1))).toBe('ok:Contact: Mo')
  expect(why(ch, c(1, 1, ''))).toBe('ok:Contact: unnamed')
  expect(why(ch, c(1, 1), made(), { label: ' Met at the dock ' })).toBe('ok:Met at the dock')
  expect(why(ch, c(1, 1), made(), { karma: Number.NaN })).toBe('not-a-number')
  expect(why(ch, c(1, 1), made(), { karma: 500 })).toBe('not-enough-karma')
  expect(why(ch, c(1, 1), made(), { nuyen: 50000 })).toBe('not-enough-nuyen')
  const one = ok(ch, c(1, 1)),
    two = ok(one, c(3, 4))
  expect(currentBuild(two).contacts).toMatchObject([{ uid: 'k1', connection: 3, loyalty: 4 }])
})

test('a SIN: needs a name, a rating of at least one, licences with names, each rated as the SIN whatever it was given', () => {
  const ch = runner()
  ch.build.sins.push({ uid: 'ph', name: '', kind: 'real', licences: [], placeholder: true }, { uid: 'named', name: 'Old', kind: 'real', licences: [] })
  const sin = (over: Record<string, unknown>): Sr6Advance => ({ op: 'sin', line: { uid: '', name: 'Ann', kind: 'fake', rating: 2, licences: [], ...over } })
  expect(why(ch, sin({ uid: 'zz' }))).toBe('unknown-line')
  expect(why(ch, sin({ uid: 'named' }))).toBe('unknown-line')
  expect(why(ch, sin({ name: ' ' }))).toBe('needs-name')
  expect(why(ch, sin({ rating: 0 }))).toBe('below-one')
  expect(why(ch, sin({ licences: [{ name: ' ', rating: 1 }] }))).toBe('needs-name')
  expect(why(ch, sin({ licences: [{ name: 'Gun', rating: 0 }] }))).toBe('ok:SIN: Ann (fake, rating 2, Gun 2)')
  expect(why(ch, sin({ licences: [{ name: 'Gun', rating: 3 }] }))).toBe('ok:SIN: Ann (fake, rating 2, Gun 2)')
  expect(why(ch, sin({ kind: 'real', rating: undefined, licences: [{ name: 'Gun', rating: 5 }] }))).toBe('ok:SIN: Ann (real, Gun 1)')
  expect(why(ch, sin({ uid: 'ph', rating: undefined, kind: 'real' }))).toBe('ok:SIN: Ann (real), was the unnamed SIN')
  // recorded without lifestyles; a fake SIN's rating is set
  const r = ok(ch, sin({ rating: undefined, gender: ' ', lifestyles: [{ uid: 'l', id: 'crb.cozy', months: 1 }] }))
  const line = (r.ledger.at(-1) as { advance: { line: object } }).advance.line
  expect(line).toMatchObject({ name: 'Ann', kind: 'fake', rating: 1, licences: [] })
  expect(line).not.toHaveProperty('gender')
  expect(line).not.toHaveProperty('lifestyles')
})

test('a placeholder SIN that is named keeps its lifestyles when replayed; a new SIN is added', () => {
  const b = blankBuild('karma')
  b.sins.push({ uid: 'ph', name: '', kind: 'real', licences: [], placeholder: true, lifestyles: [{ uid: 'l', id: 'crb.cozy', months: 2 }] })
  applyAdvance(b, { op: 'sin', line: { uid: 'ph', name: 'Ann', kind: 'real', licences: [] } })
  applyAdvance(b, { op: 'sin', line: { uid: 'n', name: 'Bo', kind: 'real', licences: [] } })
  expect(b.sins).toMatchObject([
    { uid: 'ph', name: 'Ann', lifestyles: [{ id: 'crb.cozy', months: 2 }] },
    { uid: 'n', name: 'Bo' },
  ])
  expect(b.sins[0]).not.toHaveProperty('placeholder')
  // a placeholder with no lifestyles is replaced outright
  const c = blankBuild('karma')
  c.sins.push({ uid: 'ph', name: '', kind: 'real', licences: [] })
  applyAdvance(c, { op: 'sin', line: { uid: 'ph', name: 'Ann', kind: 'real', licences: [] } })
  expect(c.sins).toEqual([{ uid: 'ph', name: 'Ann', kind: 'real', licences: [] }])
})

test('a lifestyle: a SIN the runner has, a catalog lifestyle, at least a month, a readable price; no SIN at all replays as nothing', () => {
  const ch = runner()
  ch.build.sins.push({ uid: 's1', name: 'Ann', kind: 'real', licences: [] })
  const ls = (over: Record<string, unknown> = {}): Sr6Advance => ({ op: 'lifestyle', id: 'crb.cozy', months: 1, sin: 's1', ...over })
  expect(why(ch, ls({ sin: 'zz' }))).toBe('unknown-line')
  expect(why(ch, ls({ id: 'crb.nope' }))).toBe('unknown-entry')
  expect(why(ch, ls({ months: 0 }))).toBe('below-one')
  expect(why(ch, ls())).toBe('ok:Lifestyle: Cozy × 1 month (Ann)')
  expect(why(ch, ls({ months: 2, sin: undefined }))).toBe('ok:Lifestyle: Cozy × 2 months')
  const m = made({
    data: d => {
      const old = d.entry
      d.entry = (k, id) => (k === 'lifestyles' && id === 'crb.cozy' ? { ...old(k, id)!, attrs: { ...old(k, id)!.attrs, cost: 'varies' } } : old(k, id))
    },
  })
  expect(why(ch, ls(), m)).toBe('book-value')
  const none = blankBuild('karma')
  applyAdvance(none, { op: 'lifestyle', id: 'crb.cozy', months: 1 })
  expect(none.sins).toEqual([])
  const r = ok(ch, ls())
  expect(currentBuild(r).sins[0].lifestyles).toMatchObject([{ id: 'crb.cozy', months: 1 }])
})

test('converting: whole non-zero karma, each direction behind its own optional rule and rate', () => {
  const ch = runner()
  expect(why(ch, { op: 'convert', karma: 0 })).toBe('below-one')
  expect(why(ch, { op: 'convert', karma: 1.5 })).toBe('below-one')
  expect(why(ch, { op: 'convert', karma: 2 })).toBe('ok:2 karma to 2,200¥')
  expect(why(ch, { op: 'convert', karma: 2 }, made({ unset: ['workingForTheMan'] }))).toBe('optional-rule-off')
  expect(why(ch, { op: 'convert', karma: -2 })).toBe('optional-rule-off')
  expect(why(ch, { op: 'convert', karma: -2 }, made({ rules: { workingForThePeople: true } }))).toBe('optional-rule-off')
  expect(why(ch, { op: 'convert', karma: -2 }, made({ rules: { workingForThePeople: true, 'advance.nuyenToKarmaRate': 1000 } }))).toBe('ok:2,000¥ to 2 karma')
})

test('the ledger reads as a history: labels, balances, voids, earnings and notes', () => {
  let ch = runner()
  ch = earn(ch, 5, 800, 'The Dock Job', '2026-10-07', NOW)
  ch = note(ch, 'Met a fixer', NOW)
  ch = ok(ch, { op: 'other' }, made(), { label: ' Odd job ', karma: 2, nuyen: -300 })
  const rows = ledgerRows(ch)
  expect(rows.map(r => ledgerLabel(r.e))).toEqual(['Creation finished', 'Earned: The Dock Job (2026-10-07)', 'Met a fixer', 'Odd job'])
  expect(rows.map(r => [r.karma, r.nuyen])).toEqual([
    [100, 5000],
    [105, 5800],
    [105, 5800],
    [103, 6100],
  ])
  const v = voidEntry(ch, ch.ledger[1].id, 'wrong run', NOW)
  if (!v.ok) throw new Error(v.reason)
  expect(ledgerLabel(v.ch.ledger.at(-1)!)).toBe('Voided: wrong run')
  expect(ledgerRows(v.ch).find(r => r.e.id === ch.ledger[1].id)).toMatchObject({ voided: true, reason: 'wrong run' })
  expect(balances(v.ch)).toEqual({ karma: 98, nuyen: 5300 })
  expect(voidEntry(v.ch, ch.ledger[1].id, 'again').ok).toBe(false)
  expect(voidEntry(ch, 'nope', 'x')).toEqual({ ok: false, reason: 'not-voidable' })
  expect(voidEntry(ch, 'f1', 'x')).toEqual({ ok: false, reason: 'not-voidable' })
  expect(balances(blankSr6('karma', 'z', NOW))).toEqual({ karma: 0, nuyen: 0 })
})

test('Review in career: a negative balance is a warning on each of karma and nuyen', () => {
  const m = made()
  const earned = earn(runner({ karma: 0, nuyen: 0 }), 4, 9, 'A run', '2026-10-07', NOW)
  const spent = ok(earned, { op: 'other' }, m, { karma: 4, nuyen: 9 })
  const voided = voidEntry(spent, earned.ledger[1].id, 'mistake', NOW)
  if (!voided.ok) throw new Error(voided.reason)
  const ch = voided.ch
  expect(
    validateCareer(m.data, m.cr, ch)
      .filter(v => v.code.startsWith('career.'))
      .map(v => [v.code, v.severity, v.message]),
  ).toEqual([
    ['career.karma', 'warning', 'The karma balance is below zero (-4).'],
    ['career.nuyen', 'warning', 'The nuyen balance is below zero (-9¥).'],
  ])
})
