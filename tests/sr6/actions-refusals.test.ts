// Build actions (src/sr6/engine/actions.ts): each refusal reason, and the editing steps the main actions tests leave
// out (specializations past the first, notes, level changes, mentor spirits, SIN and licence edits, seats…).
import { expect, test } from 'vitest'
import { apply, opposite, setMagic, type Op } from '../../src/sr6/engine/actions'
import { blankSr6, type MagicKind, type Sr6Character, type Sr6Method } from '../../src/sr6/model/character'
import { buildOf, GLIM, made } from './fixture'

type Over = Parameters<typeof made>[0]
function runner(o: { method?: Sr6Method; magic?: MagicKind; over?: Over } = {}) {
  const ch: Sr6Character = blankSr6(o.method ?? 'priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf(o.method ?? 'priority', {
    letters: o.method && o.method !== 'priority' ? undefined : 'CABDA',
    metatype: GLIM,
    magic: o.magic ?? 'mundane',
  })
  ch.identity.metatype = ch.build.metatype
  const { data, cr } = made(o.over)
  const act = (op: Op) => apply(ch.build, op, data, cr)
  return { ch, b: ch.build, data, cr, act }
}
const ok = { ok: true }
const no = (reason: string) => ({ ok: false, reason })

test('an attribute the build does not have is refused', () => {
  expect(runner().act({ op: 'attribute', target: 'zzz' as 'bod', pool: 'points', delta: 1 })).toEqual(no('unknown-attribute'))
})

test('skills: an unknown one is refused; a pure adept takes no Magic skill but Astral; taking one away is always allowed', () => {
  const r = runner({ magic: 'adept' })
  expect(r.act({ op: 'skill', target: 'crb.nope', pool: 'points', delta: 1 })).toEqual(no('unknown-entry'))
  expect(r.act({ op: 'skill', target: 'crb.glowcraft', pool: 'points', delta: 1 })).toEqual(no('not-for-adept'))
  expect(r.act({ op: 'skill', target: 'crb.tinkering', pool: 'points', delta: 1 })).toEqual(ok)
  r.b.skills.push({ id: 'crb.glowcraft', points: 1, karma: 0 })
  expect(r.act({ op: 'skill', target: 'crb.glowcraft', pool: 'points', delta: -1 })).toEqual(ok)
  expect(r.b.skills.map(s => s.id)).toEqual(['crb.tinkering'])
})

test('further specializations: trimmed, deduplicated, capped; none clears them and a skill with nothing left goes', () => {
  const r = runner()
  expect(r.act({ op: 'specs', target: 'crb.nope', specs: ['x'] })).toEqual(no('unknown-entry'))
  expect(r.act({ op: 'specs', target: 'crb.tinkering', specs: ['  ', ''] })).toEqual(ok)
  expect(r.b.skills).toEqual([])
  const many = Array.from({ length: 25 }, (_, i) => `s${i}`)
  expect(r.act({ op: 'specs', target: 'crb.tinkering', specs: [' Locks ', 'Locks', 'x'.repeat(100), ...many] })).toEqual(ok)
  expect(r.b.skills[0].specs).toHaveLength(20)
  expect(r.b.skills[0].specs!.slice(0, 2)).toEqual(['Locks', 'x'.repeat(80)])
  expect(r.act({ op: 'specs', target: 'crb.tinkering', specs: [] })).toEqual(ok)
  expect(r.b.skills).toEqual([]) // no rank, no spec, no expertise: gone
  r.b.skills.push({ id: 'crb.gab', points: 2, karma: 0, specs: ['a'] })
  expect(r.act({ op: 'specs', target: 'crb.gab', specs: [] })).toEqual(ok)
  expect(r.b.skills).toEqual([{ id: 'crb.gab', points: 2, karma: 0 }])
})

test('a specialization or expertise: unknown skills refused, blank on a missing skill adds nothing, clearing the last thing drops the line', () => {
  const r = runner()
  expect(r.act({ op: 'spec', target: 'crb.nope', spec: 'x' })).toEqual(no('unknown-entry'))
  expect(r.act({ op: 'expertise', target: 'crb.gab', expertise: null })).toEqual(ok)
  expect(r.b.skills).toEqual([])
  expect(r.act({ op: 'expertise', target: 'crb.gab', expertise: 'Haggling' })).toEqual(ok)
  expect(r.b.skills).toEqual([{ id: 'crb.gab', points: 0, karma: 0, expertise: 'Haggling' }])
  expect(r.act({ op: 'expertise', target: 'crb.gab', expertise: null })).toEqual(ok)
  expect(r.b.skills).toEqual([])
})

test('removing a quality: one taken, not a free trait; the mentor spirit goes with its quality, but not while another copy stays', () => {
  const r = runner({ over: { rules: { mentorSpiritQuality: 'crb.knack' } } })
  expect(r.act({ op: 'quality', remove: 'nope' })).toEqual(no('not-taken'))
  r.b.qualities.push({ uid: 'f', id: 'crb.butterfingers', level: 1, free: true })
  expect(r.act({ op: 'quality', remove: 'f' })).toEqual(no('free-trait'))
  expect(r.act({ op: 'mentor', id: 'crb.glow-moth' })).toEqual(ok)
  expect(r.b.qualities.filter(q => q.id === 'crb.knack')).toHaveLength(1)
  expect(r.b.mentorSpirit).toBe('crb.glow-moth')
  r.b.qualities.push({ uid: 'k2', id: 'crb.knack', level: 1 }) // a second copy
  expect(r.act({ op: 'quality', remove: r.b.qualities.find(q => q.id === 'crb.knack')!.uid })).toEqual(ok)
  expect(r.b.mentorSpirit).toBe('crb.glow-moth')
  expect(r.act({ op: 'quality', remove: 'k2' })).toEqual(ok)
  expect(r.b.mentorSpirit).toBeUndefined()
})

test('a leveled quality: a level the family lacks, below one, the same level again; a note and a karma range; a replaced level', () => {
  const m = made({
    data: d => {
      d.qualities['crb.lucky-streak.2'] = { ...d.qualities['crb.lucky-streak.2'], karma: 8, karmaMax: 12 }
    },
  })
  const ch = blankSr6('priority', 'r', 'now')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  const act = (op: Op) => apply(ch.build, op, m.data, m.cr)
  expect(act({ op: 'quality', id: 'crb.lucky-streak', level: 0 })).toEqual(no('below-one'))
  expect(act({ op: 'quality', id: 'crb.lucky-streak', level: 9 })).toEqual(no('max-level'))
  expect(act({ op: 'quality', id: 'crb.lucky-streak.1' })).toEqual(ok)
  expect(ch.build.qualities).toMatchObject([{ id: 'crb.lucky-streak.1', level: 1 }])
  expect(act({ op: 'quality', id: 'crb.lucky-streak.1' })).toEqual(no('already-taken'))
  // a note alone sets, trims and clears it
  expect(act({ op: 'quality', id: 'crb.lucky-streak.1', note: '  Firearms ' })).toEqual(ok)
  expect(ch.build.qualities[0].note).toBe('Firearms')
  expect(act({ op: 'quality', id: 'crb.lucky-streak.1', note: ' ' })).toEqual(ok)
  expect(ch.build.qualities[0].note).toBeUndefined()
  // a karma outside what the level allows
  expect(act({ op: 'quality', id: 'crb.lucky-streak.2', karma: 3 })).toEqual(no('karma-range'))
  expect(act({ op: 'quality', id: 'crb.lucky-streak.2', karma: 20 })).toEqual(no('karma-range'))
  expect(act({ op: 'quality', id: 'crb.lucky-streak.2', karma: 10 })).toEqual(ok)
  expect(ch.build.qualities).toMatchObject([{ id: 'crb.lucky-streak.2', level: 1, karma: 10, name: 'Lucky Streak 2' }])
  // the family with no line yet, taken with a karma
  const fresh = blankSr6('priority', 'r', 'now')
  fresh.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  expect(apply(fresh.build, { op: 'quality', id: 'crb.lucky-streak.2', karma: 9 }, m.data, m.cr)).toEqual(ok)
  expect(fresh.build.qualities).toMatchObject([{ id: 'crb.lucky-streak.2', karma: 9 }])
})

test('a single quality: unknown, a line that is not there, levels it does not have, levels past its top, a karma it does not take', () => {
  const m = made({
    data: d => {
      d.qualities['crb.knack'] = { ...d.qualities['crb.knack'], perLevel: true, maxLevel: 2, karma: 3, karmaMax: 9, karmaSteps: [3, 6, 9] }
    },
  })
  const ch = blankSr6('priority', 'r', 'now')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  const act = (op: Op) => apply(ch.build, op, m.data, m.cr)
  expect(act({ op: 'quality', id: 'crb.nope' })).toEqual(no('unknown-entry'))
  expect(act({ op: 'quality', id: 'crb.knack', uid: 'zz' })).toEqual(no('not-taken'))
  expect(act({ op: 'quality', id: 'crb.knack', level: 0 })).toEqual(no('below-one'))
  expect(act({ op: 'quality', id: 'crb.knack', level: 3 })).toEqual(no('max-level'))
  expect(act({ op: 'quality', id: 'crb.knack', karma: 4 })).toEqual(no('karma-range'))
  expect(act({ op: 'quality', id: 'crb.knack', karma: 6 })).toEqual(ok)
  const uid = ch.build.qualities[0].uid
  // the level and karma of the line taken change in place; a note alone sets it
  expect(act({ op: 'quality', id: 'crb.knack', uid, level: 2, karma: 9 })).toEqual(ok)
  expect(ch.build.qualities[0]).toMatchObject({ level: 2, karma: 9 })
  expect(act({ op: 'quality', id: 'crb.knack', uid, note: ' Hands ' })).toEqual(ok)
  expect(ch.build.qualities[0].note).toBe('Hands')
  expect(act({ op: 'quality', id: 'crb.knack', uid, note: '' })).toEqual(ok)
  expect(ch.build.qualities[0].note).toBeUndefined()
  expect(act({ op: 'quality', id: 'crb.knack' })).toEqual(no('already-taken'))
  const plain = runner()
  expect(plain.act({ op: 'quality', id: 'crb.knack', level: 2 })).toEqual(no('no-levels'))
})

test('Aptitude and Incompetent are exact opposites: neither goes on the skill the other names', () => {
  const r = runner({ over: { rules: { incompetentQuality: 'crb.butterfingers' } } })
  expect(r.act({ op: 'quality', id: 'crb.knack' })).toEqual(ok)
  expect(r.act({ op: 'quality', id: 'crb.knack', note: 'Tinkering' })).toEqual(ok)
  expect(opposite(r.b, r.data, r.cr, 'crb.butterfingers', 'Tinkering')).toBe(true)
  expect(opposite(r.b, r.data, r.cr, 'crb.butterfingers', 'Gab')).toBe(false)
  expect(opposite(r.b, r.data, r.cr, 'crb.butterfingers', '')).toBe(false)
  expect(opposite(r.b, r.data, r.cr, 'crb.stoneskin', 'Tinkering')).toBe(false)
  expect(r.act({ op: 'quality', id: 'crb.butterfingers', note: 'Tinkering' })).toEqual(no('aptitude-incompetent'))
  expect(r.act({ op: 'quality', id: 'crb.butterfingers', note: 'Gab' })).toEqual(ok)
})

test('picks: unknown entries, notes and levels on a pick that is not there, a spell twice, a leveled power through its levels', () => {
  const r = runner({ magic: 'full' })
  expect(r.act({ op: 'pick', kind: 'spells', id: 'crb.nope' })).toEqual(no('unknown-entry'))
  expect(r.act({ op: 'pick', remove: 'nope' })).toEqual(no('not-taken'))
  expect(r.act({ op: 'pickNote', uid: 'nope', note: 'x' })).toEqual(no('not-taken'))
  expect(r.act({ op: 'powerLevel', uid: 'nope', level: 1 })).toEqual(no('not-taken'))
  expect(r.act({ op: 'pick', kind: 'spells', id: 'crb.glow-ward' })).toEqual(ok)
  expect(r.act({ op: 'pick', kind: 'spells', id: 'crb.glow-ward' })).toEqual(no('duplicate'))
  const uid = r.b.picks[0].uid
  expect(r.act({ op: 'pickNote', uid, note: ' Firearms ' })).toEqual(ok)
  expect(r.b.picks[0].note).toBe('Firearms')
  expect(r.act({ op: 'pickNote', uid, note: '' })).toEqual(ok)
  expect(r.b.picks[0].note).toBeUndefined()
  expect(r.act({ op: 'powerLevel', uid, level: 2 })).toEqual(no('no-levels'))
  expect(r.act({ op: 'pick', remove: uid })).toEqual(ok)
})

test('a family of power levels: taken again it goes up; a lower or equal level is a duplicate; the top is the end; powerLevel moves between', () => {
  const r = runner({ magic: 'adept' })
  expect(r.act({ op: 'pick', kind: 'adeptpowers', id: 'crb.quick-step.2' })).toEqual(ok)
  expect(r.b.picks).toMatchObject([{ id: 'crb.quick-step.2', name: 'Quick Step 2' }])
  expect(r.act({ op: 'pick', kind: 'adeptpowers', id: 'crb.quick-step.1' })).toEqual(no('duplicate'))
  expect(r.act({ op: 'pick', kind: 'adeptpowers', id: 'crb.quick-step' })).toEqual(ok) // the parent: the next level
  expect(r.b.picks).toMatchObject([{ id: 'crb.quick-step.3' }])
  expect(r.act({ op: 'pick', kind: 'adeptpowers', id: 'crb.quick-step.4' })).toEqual(ok)
  expect(r.act({ op: 'pick', kind: 'adeptpowers', id: 'crb.quick-step' })).toEqual(no('max-level'))
  const uid = r.b.picks[0].uid
  expect(r.act({ op: 'powerLevel', uid, level: 0 })).toEqual(no('below-one'))
  expect(r.act({ op: 'powerLevel', uid, level: 5 })).toEqual(no('max-level'))
  expect(r.act({ op: 'powerLevel', uid, level: 1 })).toEqual(ok)
  expect(r.b.picks[0]).toMatchObject({ id: 'crb.quick-step.1', name: 'Quick Step 1' })
  expect(r.b.picks[0].level).toBeUndefined()
  // a fresh family pick with no level named starts at its lowest
  const f = runner({ magic: 'adept' })
  expect(f.act({ op: 'pick', kind: 'adeptpowers', id: 'crb.quick-step' })).toEqual(ok)
  expect(f.b.picks[0].id).toBe('crb.quick-step.1')
})

test('a leveled pick outside a family: taken again it goes up to its maximum; powerLevel sets it within 1 and the maximum', () => {
  const m = made({
    data: d => {
      d.powers['crb.stack'] = { ...d.powers['crb.quick-step'], perLevel: true, maxLevel: 2 }
      const old = d.entry
      d.entry = (k, id) => (id === 'crb.stack' && k === 'adeptpowers' ? { ...old('adeptpowers', 'crb.quick-step')!, id, name: 'Stack' } : old(k, id))
      const fam = d.family
      d.family = (k, id) => (id === 'crb.stack' ? undefined : fam(k, id))
    },
  })
  const ch = blankSr6('priority', 'r', 'now')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'adept' })
  const act = (op: Op) => apply(ch.build, op, m.data, m.cr)
  expect(act({ op: 'pick', kind: 'adeptpowers', id: 'crb.stack' })).toEqual(ok)
  expect(ch.build.picks[0]).toMatchObject({ id: 'crb.stack', level: 1 })
  expect(act({ op: 'pick', kind: 'adeptpowers', id: 'crb.stack' })).toEqual(ok)
  expect(ch.build.picks[0].level).toBe(2)
  expect(act({ op: 'pick', kind: 'adeptpowers', id: 'crb.stack' })).toEqual(no('max-level'))
  const uid = ch.build.picks[0].uid
  expect(act({ op: 'powerLevel', uid, level: 0 })).toEqual(no('below-one'))
  expect(act({ op: 'powerLevel', uid, level: 3 })).toEqual(no('max-level'))
  expect(act({ op: 'powerLevel', uid, level: 1 })).toEqual(ok)
  expect(ch.build.picks[0].level).toBe(1)
})

test('martial arts and techniques: unknown entries, a style or technique twice, and the lines they hang from', () => {
  const r = runner()
  expect(r.act({ op: 'martialart', remove: 'nope' })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'martialart', id: 'crb.nope' })).toEqual(no('unknown-entry'))
  expect(r.act({ op: 'martialart', id: 'crb.glow-fist', signature: 'crb.nope' })).toEqual(no('unknown-entry'))
  expect(r.act({ op: 'martialart', id: 'crb.glow-fist', signature: 'crb.glow-jab' })).toEqual(ok)
  expect(r.act({ op: 'martialart', id: 'crb.glow-fist' })).toEqual(no('already-taken'))
  const uid = r.b.martialArts[0].uid
  expect(r.act({ op: 'technique', style: 'nope', id: 'crb.glow-jab' })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'technique', style: uid, id: 'crb.nope' })).toEqual(no('unknown-entry'))
  expect(r.act({ op: 'technique', style: uid, id: 'crb.glow-jab' })).toEqual(no('already-taken'))
  expect(r.act({ op: 'technique', style: uid, remove: 'nope' })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'technique', style: uid, remove: r.b.martialArts[0].techniques[0].uid })).toEqual(ok)
  expect(r.act({ op: 'technique', style: uid, id: 'crb.glow-jab' })).toEqual(ok)
  expect(r.act({ op: 'martialart', remove: uid })).toEqual(ok)
  // a signature technique learned already under another style cannot start a style
  const other = runner()
  other.b.martialArts.push({ uid: 'm', id: 'crb.other-style', techniques: [{ uid: 't', id: 'crb.glow-jab' }] })
  expect(other.act({ op: 'martialart', id: 'crb.glow-fist', signature: 'crb.glow-jab' })).toEqual(no('already-taken'))
  expect(runner().act({ op: 'powerPoints', delta: -1 })).toEqual(no('below-zero'))
})

test('gear lines: removing, quantity, accessories, wearing and the numbers of a custom line', () => {
  const r = runner()
  expect(r.act({ op: 'purchase', remove: 'nope' })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'purchase', kind: 'gear', id: 'crb.tangle-rope', qty: 0 })).toEqual(no('below-one'))
  expect(r.act({ op: 'purchase', kind: 'gear', id: 'crb.tangle-rope', grade: 'nope' })).toEqual(no('unknown-grade'))
  expect(r.act({ op: 'purchase', kind: 'gear', id: 'crb.nope' })).toEqual(no('unknown-entry'))
  expect(r.act({ op: 'purchase', kind: 'gear', id: 'crb.tangle-rope', rating: 9 })).toEqual(no('rating-range'))
  expect(r.act({ op: 'purchase', kind: 'gear', id: 'crb.tangle-rope', rating: 0.5 })).toEqual(no('rating-range'))
  expect(r.act({ op: 'purchase', kind: 'gear', id: 'crb.zap-scope', grade: 'alpha' })).toEqual(no('no-grade'))
  expect(r.act({ op: 'purchase', kind: 'gear' })).toEqual(ok) // no catalog id: a blank custom line
  expect(r.b.purchases[0]).toMatchObject({ name: '', cost: 0, avail: 0, essence: 0, qty: 1 })
  for (const bad of [{ cost: -500 }, { avail: -1 }, { essence: -0.5 }])
    expect(r.act({ op: 'purchase', kind: 'gear', custom: { name: 'Made-up', cost: 0, avail: 0, essence: 0, ...bad } })).toEqual(no('below-zero'))
  expect(r.b.purchases).toHaveLength(1) // none of them was kept
  expect(r.act({ op: 'purchase', kind: 'weapons', id: 'crb.zap-gun' })).toEqual(ok)
  const gun = r.b.purchases[1].uid
  expect(r.act({ op: 'quantity', uid: 'nope', qty: 2 })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'quantity', uid: gun, qty: 2 })).toEqual(no('own-line'))
  const blank = r.b.purchases[0].uid
  expect(r.act({ op: 'quantity', uid: blank, qty: 0 })).toEqual(no('below-one'))
  expect(r.act({ op: 'quantity', uid: blank, qty: 4 })).toEqual(ok)
  expect(r.b.purchases[0].qty).toBe(4)
  expect(r.act({ op: 'accessory', host: 'nope', kind: 'gear', id: 'crb.zap-scope' })).toEqual(no('unknown-host'))
  expect(r.act({ op: 'accessory', host: gun, remove: 'nope' })).toEqual(no('not-fitted'))
  expect(r.act({ op: 'accessory', host: gun, kind: 'gear', id: 'crb.nope' })).toEqual(no('unknown-entry'))
  expect(r.act({ op: 'accessory', host: gun, kind: 'gear', id: 'crb.zap-scope' })).toEqual(ok)
  expect(r.act({ op: 'accessory', host: gun, remove: r.b.purchases[1].accessories[0].uid })).toEqual(ok)
  expect(r.b.purchases[1].accessories).toEqual([])
  expect(r.act({ op: 'wear', uid: 'nope', worn: true })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'wear', uid: gun, worn: true })).toEqual(ok)
  expect(r.b.purchases[1].worn).toBe(true)
  expect(r.act({ op: 'wear', uid: gun, worn: false })).toEqual(ok)
  expect(r.b.purchases[1].worn).toBeUndefined()
  expect(r.act({ op: 'purchase', remove: gun })).toEqual(ok)
})

test('a leveled implant: a level asked for that the family lacks is refused; the line then carries no rating', () => {
  const r = runner()
  expect(r.act({ op: 'purchase', kind: 'augmentations', id: 'crb.glow-eyes', rating: 9 })).toEqual(no('rating-range'))
  expect(r.act({ op: 'purchase', kind: 'augmentations', id: 'crb.glow-eyes', rating: 2 })).toEqual(ok)
  expect(r.b.purchases[0]).toMatchObject({ id: 'crb.glow-eyes.2', name: 'Glow Eyes 2' })
  expect(r.b.purchases[0].rating).toBeUndefined()
  // a second Glow Eyes of any level: one a runner
  expect(r.act({ op: 'purchase', kind: 'augmentations', id: 'crb.glow-eyes', rating: 1 })).toEqual(no('once-per-runner'))
})

test('changing a line’s rating or grade: level lines move to the level, add-ons take their host’s grade, a grade can be cleared', () => {
  const r = runner()
  expect(r.act({ op: 'rate', uid: 'nope', rating: 1 })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'purchase', kind: 'augmentations', id: 'crb.glow-eyes', rating: 1 })).toEqual(ok)
  const eyes = r.b.purchases[0].uid
  expect(r.act({ op: 'rate', uid: eyes, rating: 3 })).toEqual(ok)
  expect(r.b.purchases[0]).toMatchObject({ id: 'crb.glow-eyes.3', name: 'Glow Eyes 3' })
  expect(r.act({ op: 'rate', uid: eyes, rating: 9 })).toEqual(no('rating-range'))
  expect(r.act({ op: 'rate', uid: eyes, grade: 'nope' })).toEqual(no('unknown-grade'))
  expect(r.act({ op: 'rate', uid: eyes, grade: 'alpha' })).toEqual(ok)
  expect(r.b.purchases[0].grade).toBe('alpha')
  expect(r.act({ op: 'accessory', host: eyes, kind: 'augmentations', id: 'crb.glare-filter' })).toEqual(ok)
  r.b.purchases[0].accessories[0].grade = 'standard'
  const acc = r.b.purchases[0].accessories[0].uid
  expect(r.act({ op: 'rate', uid: acc, grade: 'alpha' })).toEqual(no('grade-follows-host'))
  // setting the host's grade drops a grade a file gave an add-on
  expect(r.act({ op: 'rate', uid: eyes, grade: 'standard' })).toEqual(ok)
  expect(r.b.purchases[0].accessories[0].grade).toBeUndefined()
  expect(r.act({ op: 'rate', uid: eyes, grade: null })).toEqual(ok)
  expect(r.b.purchases[0].grade).toBeUndefined()
  // a rated gear line (a family of levels) moves to the level asked for
  expect(r.act({ op: 'purchase', kind: 'gear', id: 'crb.tangle-rope', rating: 2 })).toEqual(ok)
  const rope = r.b.purchases.find(p => p.kind === 'gear')!.uid
  expect(r.act({ op: 'rate', uid: rope, rating: 4 })).toEqual(ok)
  expect(r.b.purchases.find(p => p.uid === rope)).toMatchObject({ id: 'crb.tangle-rope.4' })
  // a custom line has no entry: no rating can be set
  expect(r.act({ op: 'purchase', kind: 'gear' })).toEqual(ok)
  expect(r.act({ op: 'rate', uid: r.b.purchases.at(-1)!.uid, rating: 2 })).toEqual(no('rating-range'))
})

test('bonuses on a line or pick: a line that is there, a skill bonus naming its skill, an empty list clears them', () => {
  const r = runner({ magic: 'full' })
  expect(r.act({ op: 'bonus', uid: 'nope', bonuses: [] })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'purchase', kind: 'gear', id: 'crb.zap-scope' })).toEqual(ok)
  const uid = r.b.purchases[0].uid
  expect(r.act({ op: 'bonus', uid, bonuses: [{ target: 'skill', value: 1 } as never] })).toEqual(no('no-skill'))
  expect(r.act({ op: 'bonus', uid, bonuses: [{ target: 'skill', skill: 'crb.gab', value: 1 } as never] })).toEqual(ok)
  expect(r.b.purchases[0].bonuses).toHaveLength(1)
  expect(r.act({ op: 'bonus', uid, bonuses: [] })).toEqual(ok)
  expect(r.b.purchases[0].bonuses).toBeUndefined()
  expect(r.act({ op: 'pick', kind: 'spells', id: 'crb.glow-ward' })).toEqual(ok)
  expect(r.act({ op: 'bonus', uid: r.b.picks[0].uid, bonuses: [{ target: 'skill', skill: 'crb.gab', value: 1 } as never] })).toEqual(ok)
  expect(r.b.picks[0].bonuses).toHaveLength(1)
})

test('contacts: removing, a rating of at least one, known types only (two at most), editing one that is there', () => {
  const r = runner()
  expect(r.act({ op: 'contact', remove: 'nope' })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'contact', connection: 0 })).toEqual(no('below-one'))
  expect(r.act({ op: 'contact', loyalty: 0 })).toEqual(no('below-one'))
  expect(r.act({ op: 'contact', types: ['street', 'media', 'magic'] })).toEqual(no('bad-types'))
  expect(r.act({ op: 'contact', types: ['nope' as never] })).toEqual(no('bad-types'))
  expect(r.act({ op: 'contact', uid: 'nope', name: 'x' })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'contact', name: 'Mo', types: ['street', 'street'] })).toEqual(ok)
  expect(r.b.contacts[0]).toMatchObject({ name: 'Mo', types: ['street'], connection: 1, loyalty: 1 })
  expect(r.act({ op: 'contact', uid: r.b.contacts[0].uid, types: [] })).toEqual(ok)
  expect(r.b.contacts[0].types).toBeUndefined()
  expect(r.act({ op: 'contact', remove: r.b.contacts[0].uid })).toEqual(ok)
})

test('knowledge: one native language a runner (new or changed), edits to one that is there, ranks of a language capped', () => {
  const r = runner({ over: { rules: { languageMax: 3 } } })
  expect(r.act({ op: 'knowledge', remove: 'nope' })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'knowledge', name: 'Glimmerish', kind: 'language', native: true })).toEqual(ok)
  expect(r.b.knowledge[0]).toMatchObject({ native: true, points: 0, kind: 'language' })
  expect(r.act({ op: 'knowledge', name: 'Other', kind: 'language', native: true })).toEqual(no('one-native'))
  expect(r.act({ op: 'knowledge', name: 'Lore' })).toEqual(ok)
  const lore = r.b.knowledge[1].uid,
    native = r.b.knowledge[0].uid
  expect(r.b.knowledge[1]).toMatchObject({ kind: 'knowledge', points: 1, karma: 0 })
  expect(r.act({ op: 'knowledge', uid: 'nope', name: 'x' })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'knowledge', uid: lore, native: true })).toEqual(no('one-native'))
  expect(r.act({ op: 'knowledge', uid: lore, name: 'Old lore', kind: 'language' })).toEqual(ok)
  expect(r.b.knowledge[1]).toMatchObject({ name: 'Old lore', kind: 'language' })
  expect(r.act({ op: 'knowledgeRank', uid: 'nope', pool: 'points', delta: 1 })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'knowledgeRank', uid: native, pool: 'points', delta: 1 })).toEqual(no('native'))
  expect(r.act({ op: 'knowledgeRank', uid: lore, pool: 'points', delta: 2 })).toEqual(ok) // 3 of 3
  expect(r.act({ op: 'knowledgeRank', uid: lore, pool: 'karma', delta: 1 })).toEqual(no('language-max'))
  expect(r.act({ op: 'knowledgeRank', uid: lore, pool: 'points', delta: -9 })).toEqual(no('below-zero'))
  // the native language gives way: another can become the native one
  expect(r.act({ op: 'knowledge', uid: native, native: false })).toEqual(ok)
  expect(r.b.knowledge[0].native).toBeUndefined()
  expect(r.act({ op: 'knowledge', uid: lore, native: true })).toEqual(ok)
  expect(r.b.knowledge[1]).toMatchObject({ native: true, points: 0 })
  expect(r.act({ op: 'knowledge', remove: lore })).toEqual(ok)
})

test('lifepath: the best attribute and extra, taking a module out, the module count; point buy is the only home of character points', () => {
  const r = runner({ method: 'lifepath', magic: 'full' })
  expect(r.act({ op: 'lifemodule', remove: 'crb.wage-drone' })).toEqual(no('not-taken'))
  expect(r.act({ op: 'lifemodule', id: 'crb.glow-apprentice', choice: 0, pick: 'edg' })).toEqual(no('not-taken'))
  expect(r.act({ op: 'bestAttr', attr: 'edg' })).toEqual(no('not-core'))
  expect(r.act({ op: 'bestAttr', attr: 'bod', extra: 'mag' })).toEqual(no('not-core'))
  expect(r.act({ op: 'bestAttr', attr: 'bod', extra: 'agi' })).toEqual(ok)
  expect(r.b).toMatchObject({ bestAttr: 'bod', bestExtra: 'agi' })
  expect(r.act({ op: 'bestAttr', attr: 'bod', extra: null })).toEqual(ok)
  expect(r.b.bestExtra).toBeUndefined()
  expect(r.act({ op: 'bestAttr', attr: 'bod', extra: 'agi' })).toEqual(ok)
  expect(r.act({ op: 'bestAttr', attr: null })).toEqual(ok)
  expect(r.b.bestAttr).toBeUndefined()
  expect(r.b.bestExtra).toBeUndefined()
  expect(r.act({ op: 'bestAttr', attr: 'bod' })).toEqual(ok)
  expect(r.act({ op: 'bestAttr', attr: 'bod', extra: undefined })).toEqual(ok)
  expect(runner().act({ op: 'bestAttr', attr: 'bod' })).toEqual(no('not-lifepath'))
  expect(runner().act({ op: 'cp', pool: 'attribute' as never, delta: 1 })).toEqual(no('not-point-buy'))
  const pb = runner({ method: 'pointbuy' })
  expect(pb.act({ op: 'cp', pool: 'attribute' as never, delta: -1 })).toEqual(no('below-zero'))
})

test('lifestyles on a SIN: the SIN, the lifestyle and the months are checked; changes and removal go by uid', () => {
  const r = runner()
  expect(r.act({ op: 'sin', name: 'Ann', kind: 'real' })).toEqual(ok)
  const sin = r.b.sins[0].uid
  expect(r.act({ op: 'lifestyle', sin: 'nope', id: 'crb.cozy' })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'lifestyle', sin: 'nope', remove: 'x' })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'lifestyle', sin })).toEqual(no('unknown-entry'))
  expect(r.act({ op: 'lifestyle', sin, id: 'crb.nope' })).toEqual(no('unknown-entry'))
  expect(r.act({ op: 'lifestyle', sin, id: 'crb.cozy', months: 0 })).toEqual(no('below-one'))
  expect(r.act({ op: 'lifestyle', sin, id: 'crb.cozy' })).toEqual(ok)
  expect(r.b.sins[0].lifestyles).toMatchObject([{ id: 'crb.cozy', months: 1 }])
  const uid = r.b.sins[0].lifestyles![0].uid
  expect(r.act({ op: 'lifestyle', sin, uid: 'nope', months: 2 })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'lifestyle', sin, uid, months: 3 })).toEqual(ok)
  expect(r.act({ op: 'lifestyle', sin, uid, id: 'crb.cozy' })).toEqual(ok)
  expect(r.b.sins[0].lifestyles![0].months).toBe(3)
  expect(r.act({ op: 'lifestyle', sin, remove: uid })).toEqual(ok)
  expect(r.b.sins[0].lifestyles).toBeUndefined()
})

test('SINs and licences: ratings of at least one, a licence never above its fake SIN, a kind change keeps or drops the rating', () => {
  const r = runner()
  expect(r.act({ op: 'sin', remove: 'nope' })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'sin', rating: 0 })).toEqual(no('below-one'))
  expect(r.act({ op: 'sin', uid: 'nope', name: 'x' })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'sin', name: 'Real', kind: 'real', gender: '  ' })).toEqual(ok)
  expect(r.b.sins[0]).not.toHaveProperty('rating')
  expect(r.b.sins[0]).not.toHaveProperty('gender')
  expect(r.act({ op: 'sin' })).toEqual(ok) // the default: a fake SIN, rating 1
  expect(r.b.sins[1]).toMatchObject({ kind: 'fake', rating: 1, name: '' })
  expect(r.act({ op: 'sin', name: 'Gendered', rating: 3, gender: 'f' })).toEqual(ok)
  const [real, , fake] = r.b.sins.map(s => s.uid)
  expect(r.b.sins[2]).toMatchObject({ rating: 3, gender: 'f' })
  expect(r.act({ op: 'licence', sin: 'nope', name: 'Gun', rating: 1 })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'licence', sin: 'nope', remove: 0 })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'licence', sin: fake, name: 'Gun', rating: 0 })).toEqual(no('below-one'))
  expect(r.act({ op: 'licence', sin: fake, name: 'Gun', rating: 4 })).toEqual(no('licence-above-sin'))
  expect(r.act({ op: 'licence', sin: real, name: 'Gun', rating: 6 })).toEqual(ok)
  expect(r.act({ op: 'licence', sin: fake, name: 'Gun', rating: 3 })).toEqual(ok)
  expect(r.act({ op: 'licence', sin: fake, remove: 5 })).toEqual(no('unknown-line'))
  // lowering the rating under a licence, or turning the SIN fake with a licence above rating 1, is refused
  expect(r.act({ op: 'sin', uid: fake, rating: 2 })).toEqual(no('licence-above-sin'))
  expect(r.act({ op: 'sin', uid: real, kind: 'fake' })).toEqual(no('licence-above-sin'))
  expect(r.act({ op: 'licence', sin: real, remove: 0 })).toEqual(ok)
  expect(r.act({ op: 'sin', uid: real, kind: 'fake', gender: 'm' })).toEqual(ok)
  expect(r.b.sins[0]).toMatchObject({ kind: 'fake', rating: 1, gender: 'm' })
  expect(r.act({ op: 'sin', uid: real, kind: 'real', gender: '' })).toEqual(ok)
  expect(r.b.sins[0]).not.toHaveProperty('rating')
  expect(r.b.sins[0]).not.toHaveProperty('gender')
  expect(r.act({ op: 'sin', remove: real })).toEqual(ok)
})

test('karma to nuyen is capped by the setting and never below zero', () => {
  const r = runner()
  expect(r.act({ op: 'karmaToNuyen', delta: -1 })).toEqual(no('below-zero'))
  expect(r.act({ op: 'karmaToNuyen', delta: 8 })).toEqual(no('conversion-cap'))
  expect(r.act({ op: 'karmaToNuyen', delta: 7 })).toEqual(ok)
  const free = runner({ over: { unset: ['karmaToNuyenMax'] } })
  expect(free.act({ op: 'karmaToNuyen', delta: 40 })).toEqual(ok)
})

test('mentor spirits: unknown ones refused, the quality comes and goes, an advantage only for a mystic adept', () => {
  const r = runner({ magic: 'mystic-adept', over: { rules: { mentorSpiritQuality: 'crb.knack' } } })
  expect(r.act({ op: 'mentor', id: 'crb.nope' })).toEqual(no('unknown-entry'))
  expect(r.act({ op: 'mentor', id: 'crb.glow-moth', advantage: 'magician' })).toEqual(ok)
  expect(r.b).toMatchObject({ mentorSpirit: 'crb.glow-moth', mentorAdvantage: 'magician' })
  expect(r.b.qualities.map(q => q.id)).toEqual(['crb.knack'])
  expect(r.act({ op: 'mentor', id: 'crb.glow-moth' })).toEqual(ok) // again: no second quality
  expect(r.b.qualities).toHaveLength(1)
  expect(r.act({ op: 'mentor', advantage: null })).toEqual(ok)
  expect(r.b.mentorAdvantage).toBeUndefined()
  expect(r.act({ op: 'mentor', id: null })).toEqual(ok)
  expect(r.b.mentorSpirit).toBeUndefined()
  expect(r.b.qualities).toEqual([])
  const plain = runner({ magic: 'full', over: { rules: { mentorSpiritQuality: 'crb.knack' } } })
  expect(plain.act({ op: 'mentor', advantage: 'adept' })).toEqual(no('not-mystic-adept'))
  // with no mentor quality set, a mentor is followed without one
  const none = runner({ over: { unset: ['mentorSpiritQuality'] } })
  expect(none.act({ op: 'mentor', id: 'crb.glow-moth' })).toEqual(ok)
  expect(none.b.qualities).toEqual([])
})

test('seats taken out of a vehicle: a vehicle line, never below zero or past what it seats', () => {
  const r = runner()
  expect(r.act({ op: 'seats', uid: 'nope', removed: 1 })).toEqual(no('unknown-line'))
  expect(r.act({ op: 'purchase', kind: 'vehicles', id: 'crb.putt-putt' })).toEqual(ok)
  const uid = r.b.purchases[0].uid
  expect(r.act({ op: 'seats', uid, removed: -1 })).toEqual(no('below-zero'))
  expect(r.act({ op: 'seats', uid, removed: 2 })).toEqual(no('at-maximum'))
  expect(r.act({ op: 'seats', uid, removed: 1 })).toEqual(ok)
  expect(r.b.purchases[0].seatsRemoved).toBe(1)
  expect(r.act({ op: 'seats', uid, removed: 0 })).toEqual(ok)
  expect(r.b.purchases[0].seatsRemoved).toBeUndefined()
})

test('initiation and submersion never go below zero, and only for those who can', () => {
  const mage = runner({ magic: 'full' })
  expect(mage.act({ op: 'initiation', delta: -1 })).toEqual(no('below-zero'))
  expect(mage.act({ op: 'initiation', delta: 1 })).toEqual(ok)
  expect(mage.act({ op: 'submersion', delta: 1 })).toEqual(no('not-emerged'))
  expect(runner().act({ op: 'initiation', delta: 1 })).toEqual(no('not-awakened'))
  const tm = runner({ magic: 'technomancer' })
  expect(tm.act({ op: 'submersion', delta: 1 })).toEqual(ok)
})

test('choosing a magic kind keeps the aspected skill only for aspected, and drops a mentor advantage when not a mystic adept', () => {
  const r = runner({ magic: 'mystic-adept' })
  r.b.mentorAdvantage = 'adept'
  setMagic(r.ch, 'aspected', r.data, r.cr, 'crb.glowcraft')
  expect(r.b).toMatchObject({ magic: 'aspected', aspectedSkill: 'crb.glowcraft' })
  expect(r.b.mentorAdvantage).toBeUndefined()
  setMagic(r.ch, 'aspected', r.data, r.cr) // no new skill named: the old one stays
  expect(r.b.aspectedSkill).toBe('crb.glowcraft')
  setMagic(r.ch, 'full', r.data, r.cr)
  expect(r.b.aspectedSkill).toBeUndefined()
})
