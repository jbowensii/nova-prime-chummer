// The SR6 career engine (src/sr6/engine/career.ts): the 16 SR6 Forge advancement tests ported onto the made-up fixture's
// invented prices (karmaAttrPerRank 3, karmaSkillPerRank 3, karmaSpec 7, karmaSpell 7, karmaForm 7, karmaInitiationBase 9,
// karmaInitiationPerGrade 3, advance.expertise 9, advance.qualityFactor 3 (4 where it must differ from buy off),
// advance.buyOffFactor 3, advance.skillMax 11), then replay, balances, void, unset settings, gear, adept powers and Back
// to draft. No book numbers.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { balances, canDraft, currentBuild, earn, ledgerRows, note, preview, record, validateCareer, voidableIds, voidEntry } from '../../src/sr6/engine/career'
import { xmlToSr6 } from '../../src/sr6/engine/charxml'
import { draftAgain, finalizeSr6 } from '../../src/sr6/engine/finalize'
import { allBudgets, attrRating } from '../../src/sr6/engine/budgets'
import { makeProvider } from '../../src/sr6/engine/providers'
import { blankSr6, type MagicKind, type Sr6Advance, type Sr6Attr, type Sr6Character } from '../../src/sr6/model/character'
import { buildOf, GLIM, made } from './fixture'

const NOW = '2026-10-06T10:00:00.000Z'
/** A finalized karma-build Glimmerkin (every core attribute and Edge 1, Magic or Resonance 1) with `karma` and `nuyen`. */
function runner(o: { magic?: MagicKind; karma?: number; nuyen?: number } = {}): Sr6Character {
  const ch = blankSr6('karma', 'c1', NOW)
  ch.build = buildOf('karma', { metatype: GLIM, magic: o.magic ?? 'mundane' })
  ch.identity.metatype = GLIM
  ch.finalizedAt = NOW
  ch.final = { karma: o.karma ?? 100, nuyen: o.nuyen ?? 5000 }
  ch.ledger = [{ id: 'f1', at: NOW, type: 'finalize', karma: o.karma ?? 100, nuyen: o.nuyen ?? 5000 }]
  return ch
}
/** the attribute at `rating` (core and Edge start at 1) */
const at = (ch: Sr6Character, k: Sr6Attr, rating: number) => { ch.build.attributes[k].points = rating - 1 }
const ok = (r: ReturnType<typeof record>) => { if (!r.ok) throw new Error(r.reason); return r.ch }
const raise = (target: Sr6Attr): Sr6Advance => ({ op: 'attribute', target })
const tinker = (ch: Sr6Character, points = 3) => { ch.build.skills.push({ id: 'crb.tinkering', points, karma: 0 }) }

// --- the Forge's 16 advancement tests, invented numbers ---

test('an attribute costs karmaAttrPerRank × the new rating', () => {
  const { data, cr } = made(), ch = runner()
  at(ch, 'bod', 4)
  expect(preview(ch, raise('bod'), data, cr)).toEqual({ ok: true, label: 'BOD 4 → 5', karma: 15, nuyen: 0 })
})

test('two raises 4 → 5 → 6 cost 15 + 18', () => {
  const { data, cr } = made(), ch = runner()
  at(ch, 'agi', 4)
  const one = ok(record(ch, raise('agi'), data, cr, undefined, NOW))
  const two = preview(one, raise('agi'), data, cr)
  expect(two).toMatchObject({ ok: true, label: 'AGI 5 → 6', karma: 18 })
  expect(balances(ok(record(one, raise('agi'), data, cr))).karma).toBe(100 - 33)
})

test('Edge raises like any attribute and is refused at the metatype’s maximum', () => {
  const { data, cr } = made(), ch = runner()
  at(ch, 'edg', 2)
  expect(preview(ch, raise('edg'), data, cr)).toMatchObject({ ok: true, karma: 9 })
  at(ch, 'edg', 5) // Glimmerkin's Edge maximum
  expect(preview(ch, raise('edg'), data, cr)).toEqual({ ok: false, reason: 'at-maximum' })
})

test('a skill costs karmaSkillPerRank × the new rank, refused at advance.skillMax', () => {
  const { data, cr } = made(), ch = runner()
  tinker(ch)
  expect(preview(ch, { op: 'skill', target: 'crb.tinkering' }, data, cr)).toEqual({ ok: true, label: 'Tinkering 3 → 4', karma: 12, nuyen: 0 })
  ch.build.skills[0].points = 11
  expect(preview(ch, { op: 'skill', target: 'crb.tinkering' }, data, cr)).toEqual({ ok: false, reason: 'at-maximum' })
  // a skill the runner doesn't have joins at 1
  const r = ok(record(ch, { op: 'skill', target: 'crb.gab' }, data, cr))
  expect(currentBuild(r).skills.find(s => s.id === 'crb.gab')).toEqual({ id: 'crb.gab', points: 0, karma: 1 })
  expect(balances(r).karma).toBe(97)
})

test('a specialization costs karmaSpec; an expertise costs advance.expertise, recorded without one (an error a GM may approve)', () => {
  const { data, cr } = made(), ch = runner()
  tinker(ch)
  expect(preview(ch, { op: 'spec', target: 'crb.tinkering', name: 'Gizmos' }, data, cr)).toEqual({ ok: true, label: 'Tinkering: Gizmos', karma: 7, nuyen: 0 })
  const bare = ok(record(ch, { op: 'expertise', target: 'crb.tinkering', name: 'Gizmos' }, data, cr))
  const v = validateCareer(data, cr, bare).filter(x => x.code === 'skill.expertiseSpec')
  expect(v.map(x => [x.severity, x.path, x.source, x.page, x.message])).toEqual([['error', 'skills.crb.tinkering', 'CRB', 69,
    'Tinkering has an expertise but no specialization: an expertise needs one first.']])
  expect(validateCareer(data, cr, { ...bare, overrides: [{ code: 'skill.expertiseSpec', path: 'skills.crb.tinkering', note: 'GM ok' }] })
    .find(x => x.code === 'skill.expertiseSpec')?.approved).toBe(true)
  const s = ok(record(ch, { op: 'spec', target: 'crb.tinkering', name: 'Gizmos' }, data, cr))
  expect(preview(s, { op: 'spec', target: 'crb.tinkering', name: 'Widgets' }, data, cr)).toEqual({ ok: false, reason: 'already-known' })
  expect(preview(s, { op: 'expertise', target: 'crb.tinkering', name: 'Gizmos' }, data, cr)).toMatchObject({ ok: true, karma: 9 })
})

test('a specialization on an untrained skill is recorded: an error a GM may approve', () => {
  const { data, cr } = made(), ch = runner()
  expect(preview(ch, { op: 'spec', target: 'crb.nope', name: 'Gizmos' }, data, cr)).toEqual({ ok: false, reason: 'unknown-entry' })
  const r = ok(record(ch, { op: 'spec', target: 'crb.tinkering', name: 'Gizmos' }, data, cr))
  expect(currentBuild(r).skills).toEqual([{ id: 'crb.tinkering', points: 0, karma: 0, spec: 'Gizmos' }])
  const v = validateCareer(data, cr, r).filter(x => x.code === 'skill.specUntrained')
  expect(v.map(x => [x.severity, x.path, x.source, x.page, x.message])).toEqual([['error', 'skills.crb.tinkering', 'CRB', 93, 'Tinkering has a specialization but no rank.']])
  expect(validateCareer(data, cr, { ...r, overrides: [{ code: 'skill.specUntrained', path: 'skills.crb.tinkering', note: 'GM ok' }] })
    .find(x => x.code === 'skill.specUntrained')?.approved).toBe(true)
})

test('an expertise below advance.expertiseRank is recorded: an error a GM may approve; unset, no minimum', () => {
  const { data, cr } = made(), ch = runner()
  tinker(ch)  // rank 3; the fixture's invented minimum is 4
  ch.build.skills[0].spec = 'Gizmos'
  const r = ok(record(ch, { op: 'expertise', target: 'crb.tinkering', name: 'Gizmos' }, data, cr))
  const v = validateCareer(data, cr, r).filter(x => x.code === 'skill.expertiseRank')
  expect(v.map(x => [x.severity, x.path, x.source, x.page, x.message])).toEqual([['error', 'skills.crb.tinkering', 'CRB', 73,
    'Tinkering has an expertise at rank 3: an expertise needs rank 4.']])
  expect(validateCareer(data, cr, { ...r, overrides: [{ code: 'skill.expertiseRank', path: 'skills.crb.tinkering', note: 'GM ok' }] })
    .find(x => x.code === 'skill.expertiseRank')?.approved).toBe(true)
  const at4 = structuredClone(r)
  at4.build.skills[0].points = 4
  expect(validateCareer(data, cr, at4).map(x => x.code)).not.toContain('skill.expertiseRank')
  cr.delete('advance.expertiseRank')
  expect(validateCareer(data, cr, r).map(x => x.code)).not.toContain('skill.expertiseRank')
})

test('a quality costs karma × advance.qualityFactor, a buy off karma × advance.buyOffFactor; the wrong way round is refused', () => {
  const { data, cr } = made({ rules: { 'advance.qualityFactor': 4 } }), ch = runner()
  const q = (id: string, level = 1): Sr6Advance => ({ op: 'quality', line: { uid: '', id, level } })
  expect(preview(ch, q('crb.knack'), data, cr)).toEqual({ ok: true, label: 'Quality: Knack', karma: 52, nuyen: 0 })
  expect(preview(ch, q('crb.butterfingers'), data, cr)).toEqual({ ok: false, reason: 'not-positive' })
  ch.build.qualities.push({ uid: 'q1', id: 'crb.butterfingers', level: 1 }, { uid: 'q2', id: 'crb.knack', level: 1 })
  expect(preview(ch, { op: 'buyoff', target: 'q1' }, data, cr)).toEqual({ ok: true, label: 'Buy off: Butterfingers', karma: 24, nuyen: 0 })
  expect(preview(ch, { op: 'buyoff', target: 'q2' }, data, cr)).toEqual({ ok: false, reason: 'not-negative' })
  const off = ok(record(ch, { op: 'buyoff', target: 'q1' }, data, cr))
  expect(currentBuild(off).qualities.map(x => x.uid)).toEqual(['q2'])
  const e = off.ledger.at(-1)!
  expect(e.type === 'advance' && e.advance.op === 'buyoff' && e.advance.line?.id).toBe('crb.butterfingers') // kept for the history
})

test('with the aptitude quality one skill may go past advance.skillMax by what the quality adds at creation', () => {
  const { data, cr } = made(), ch = runner()
  tinker(ch)
  ch.build.skills[0].points = 11
  ch.build.qualities.push({ uid: 'qa', id: 'crb.knack', level: 1 })
  expect(preview(ch, { op: 'skill', target: 'crb.tinkering' }, data, cr)).toMatchObject({ ok: true, label: 'Tinkering 11 → 12' })
  ch.build.skills[0].points = 12
  expect(preview(ch, { op: 'skill', target: 'crb.tinkering' }, data, cr)).toEqual({ ok: false, reason: 'at-maximum' })
})

test('initiation costs base + new grade × per grade; a mundane is refused', () => {
  const { data, cr } = made(), ch = runner({ magic: 'full' })
  expect(preview(ch, { op: 'initiate' }, data, cr)).toEqual({ ok: true, label: 'Initiation grade 1', karma: 12, nuyen: 0 })
  ch.build.initiation = 2
  const mag = attrRating(ch.build, 'mag', makeProvider(ch.build.method, data, cr))
  ch.build.attributes.mag.points += 3 - mag  // grade 3 needs Magic 3
  expect(preview(ch, { op: 'initiate' }, data, cr)).toMatchObject({ ok: true, karma: 18 })
  ch.build.attributes.mag.points -= 1  // the grade never exceeds Magic
  expect(preview(ch, { op: 'initiate' }, data, cr)).toEqual({ ok: false, reason: 'at-maximum' })
  expect(preview(runner(), { op: 'initiate' }, data, cr)).toEqual({ ok: false, reason: 'mundane-cannot-initiate' })
})

test('a technomancer submerges', () => {
  const { data, cr } = made(), ch = runner({ magic: 'technomancer' })
  ch.build.submersion = 1
  ch.build.attributes.res.points += 2 - attrRating(ch.build, 'res', makeProvider(ch.build.method, data, cr))
  const r = ok(record(ch, { op: 'initiate', line: { uid: '', kind: 'echoes', id: 'crb.quiet-loop' } }, data, cr))
  expect(currentBuild(r)).toMatchObject({ submersion: 2, initiation: 0 })
  expect(currentBuild(r).picks.map(x => x.name)).toEqual(['Quiet Loop'])
  expect(preview(ch, { op: 'initiate', line: { uid: '', kind: 'metamagics', id: 'crb.soft-echo' } }, data, cr)).toEqual({ ok: false, reason: 'cannot-learn' })
})

test('spellcasters learn spells (anyone else: recorded, an error a GM may approve); a technomancer learns complex forms', () => {
  const { data, cr } = made()
  const spell: Sr6Advance = { op: 'pick', line: { uid: '', kind: 'spells', id: 'crb.glow-ward' } }
  expect(preview(runner({ magic: 'full' }), spell, data, cr)).toEqual({ ok: true, label: 'Spell: Glow Ward', karma: 7, nuyen: 0 })
  const r = ok(record(runner(), spell, data, cr))
  const v = validateCareer(data, cr, r).filter(x => x.code === 'magic.spellsAllowed')
  expect(v.map(x => [x.severity, x.source, x.page, x.message])).toEqual([['error', 'CRB', 67, 'A mundane can’t have Glow Ward.']])
  expect(validateCareer(data, cr, { ...r, overrides: [{ code: 'magic.spellsAllowed', path: v[0].path, note: 'GM ok' }] })
    .find(x => x.code === 'magic.spellsAllowed')?.approved).toBe(true)
  // an adept power still needs power points (a budget, not a prerequisite)
  expect(preview(runner(), { op: 'pick', line: { uid: '', kind: 'adeptpowers', id: 'crb.quick-step' } }, data, cr)).toEqual({ ok: false, reason: 'no-power-points' })
  expect(preview(runner({ magic: 'technomancer' }), { op: 'pick', line: { uid: '', kind: 'complexforms', id: 'crb.static-veil' } }, data, cr))
    .toMatchObject({ ok: true, karma: 7 })
})

test('the unaffordable is refused', () => {
  const { data, cr } = made(), ch = runner({ karma: 3 })
  at(ch, 'bod', 4)
  expect(preview(ch, raise('bod'), data, cr)).toEqual({ ok: false, reason: 'not-enough-karma' })
})

test('record then void: the attribute and the karma come back; the entry and its void both stay', () => {
  const { data, cr } = made(), ch = runner({ karma: 50 })
  at(ch, 'agi', 3)
  const r = ok(record(ch, raise('agi'), data, cr))
  expect(currentBuild(r).attributes.agi.karma).toBe(1)
  expect(balances(r).karma).toBe(38)
  const id = r.ledger.at(-1)!.id
  const v = voidEntry(r, id, 'Misclick')
  if (!v.ok) throw new Error(v.reason)
  expect(currentBuild(v.ch).attributes.agi.karma).toBe(0)
  expect(balances(v.ch).karma).toBe(50)
  expect(v.ch.ledger.map(e => e.type)).toEqual(['finalize', 'advance', 'void'])
  expect(ledgerRows(v.ch)[1]).toMatchObject({ voided: true, reason: 'Misclick' })
})

test('nuyen to karma is off while advance.nuyenToKarmaRate is unset', () => {
  const { data, cr } = made()
  expect(preview(runner(), { op: 'convert', karma: -1 }, data, cr)).toEqual({ ok: false, reason: 'optional-rule-off' })
})

test('nuyen to karma once the rate is set: 1 karma costs that much nuyen', () => {
  const { data, cr } = made({ rules: { 'advance.nuyenToKarmaRate': 1300 } }), ch = runner({ karma: 10 })
  expect(preview(ch, { op: 'convert', karma: -1 }, data, cr)).toEqual({ ok: true, label: '1,300¥ to 1 karma', karma: -1, nuyen: 1300 })
  expect(balances(ok(record(ch, { op: 'convert', karma: -1 }, data, cr)))).toEqual({ karma: 11, nuyen: 3700 })
})

test('nuyen to karma without the nuyen is refused', () => {
  const { data, cr } = made({ rules: { 'advance.nuyenToKarmaRate': 1300 } })
  expect(preview(runner({ nuyen: 1000 }), { op: 'convert', karma: -1 }, data, cr)).toEqual({ ok: false, reason: 'not-enough-nuyen' })
})

test('voiding a conversion puts both balances back', () => {
  const { data, cr } = made({ rules: { 'advance.nuyenToKarmaRate': 1300 } }), ch = runner({ karma: 10 })
  const r = ok(record(ch, { op: 'convert', karma: -2 }, data, cr))
  expect(balances(r)).toEqual({ karma: 12, nuyen: 2400 })
  const v = voidEntry(r, r.ledger.at(-1)!.id, 'GM said no')
  expect(v.ok && balances(v.ch)).toEqual({ karma: 10, nuyen: 5000 })
  // and karma to nuyen at advance.karmaToNuyenRate
  expect(preview(ch, { op: 'convert', karma: 2 }, data, cr)).toEqual({ ok: true, label: '2 karma to 2,200¥', karma: 2, nuyen: -2200 })
})

// --- replay, balances, void ---

test('currentBuild replays the live advances in order; a voided one is skipped; a draft is its build', () => {
  const { data, cr } = made(), ch = runner({ magic: 'full' })
  tinker(ch)
  const before = JSON.stringify(ch.build)
  let r = ok(record(ch, { op: 'skill', target: 'crb.tinkering' }, data, cr))
  r = ok(record(r, { op: 'spec', target: 'crb.tinkering', name: 'Gizmos' }, data, cr))
  r = ok(record(r, { op: 'pick', line: { uid: '', kind: 'spells', id: 'crb.glow-ward' } }, data, cr))
  expect(currentBuild(r).skills[0]).toEqual({ id: 'crb.tinkering', points: 3, karma: 1, spec: 'Gizmos' })
  expect(currentBuild(r).picks.map(x => x.id)).toEqual(['crb.glow-ward'])
  const v = voidEntry(r, r.ledger.at(-1)!.id, 'Changed my mind')
  if (!v.ok) throw new Error(v.reason)
  expect(currentBuild(v.ch).picks).toEqual([])
  expect(JSON.stringify(v.ch.build)).toBe(before) // record and void never touch ch.build
  const draft = blankSr6()
  expect(currentBuild(draft)).toBe(draft.build)
  expect(preview(draft, raise('bod'), data, cr)).toEqual({ ok: false, reason: 'not-finalized' })
})

test('balances run from the finalize entry; voiding an earning can take karma below 0, a warning on Review', () => {
  const { data, cr } = made(), ch = runner({ karma: 5, nuyen: 2000 })
  at(ch, 'agi', 3)
  let r = earn(ch, 9, 3100, 'Made-up run', '2026-10-06', NOW)
  r = ok(record(r, raise('agi'), data, cr))
  expect(balances(r)).toEqual({ karma: 2, nuyen: 5100 })
  expect(ledgerRows(r).map(x => x.karma)).toEqual([5, 14, 2])
  const v = voidEntry(r, r.ledger[1].id, 'Run fell through')
  if (!v.ok) throw new Error(v.reason)
  expect(balances(v.ch)).toEqual({ karma: -7, nuyen: 2000 })
  expect(validateCareer(data, cr, v.ch).filter(x => x.code.startsWith('career.'))).toMatchObject([{ code: 'career.karma', severity: 'warning', path: 'ledger' }])
  expect(validateCareer(data, cr, r).some(x => x.code.startsWith('career.'))).toBe(false)
})

test('an S2 runner finalized without a finalize entry starts from its final numbers', () => {
  const ch = runner()
  ch.ledger = []
  ch.final = { karma: 4, nuyen: 900 }
  expect(balances(ch)).toEqual({ karma: 4, nuyen: 900 })
})

test('only the newest live advance can be voided; earnings and notes any time; never a finalize or a void', () => {
  const { data, cr } = made(), ch = runner()
  let r = ok(record(ch, raise('agi'), data, cr))
  r = note(r, 'Owes a favour', NOW)
  r = ok(record(r, raise('bod'), data, cr))
  const [fin, a1, n1, a2] = r.ledger
  expect(voidEntry(r, a1.id, 'x')).toEqual({ ok: false, reason: 'not-latest' })
  expect(voidEntry(r, fin.id, 'x')).toEqual({ ok: false, reason: 'not-voidable' })
  const v1 = voidEntry(r, a2.id, 'x')
  if (!v1.ok) throw new Error(v1.reason)
  expect(voidEntry(v1.ch, a2.id, 'x')).toEqual({ ok: false, reason: 'already-voided' })
  expect(voidEntry(v1.ch, v1.ch.ledger.at(-1)!.id, 'x')).toEqual({ ok: false, reason: 'not-voidable' })
  const v2 = voidEntry(v1.ch, a1.id, 'x')
  expect(v2.ok).toBe(true)
  expect(voidEntry(r, n1.id, 'x').ok).toBe(true)
})

test('an unset price refuses its spend naming the setting; an unset cap is no cap', () => {
  const { data, cr } = made({ unset: ['karmaSpec', 'advance.skillMax'] }), ch = runner()
  tinker(ch, 11)
  expect(preview(ch, { op: 'spec', target: 'crb.tinkering', name: 'Gizmos' }, data, cr)).toEqual({ ok: false, reason: 'unset:karmaSpec' })
  expect(preview(ch, { op: 'skill', target: 'crb.tinkering' }, data, cr)).toMatchObject({ ok: true, karma: 36 })
  const m = made({ unset: ['advance.karmaToNuyenRate'] })
  expect(preview(ch, { op: 'convert', karma: 1 }, m.data, m.cr)).toEqual({ ok: false, reason: 'unset:advance.karmaToNuyenRate' })
})

// --- gear, adept powers, contacts, lifestyle ---

test('gear: bought at its catalog cost and rating; an unreadable cost refused; dropped for nothing; gone from the catalog it still replays', () => {
  const { data, cr } = made(), ch = runner()
  const buy = (id: string, kind: 'weapons' | 'electronics', rating?: number): Sr6Advance =>
    ({ op: 'purchase', line: { uid: '', kind, id, qty: 1, accessories: [], ...(rating ? { rating } : {}) } })
  expect(preview(ch, buy('crb.zap-gun', 'weapons'), data, cr)).toEqual({ ok: true, label: 'Zap Gun', karma: 0, nuyen: 290 }) // the edits layer's price
  expect(preview(ch, buy('crb.buzz-box', 'electronics', 3), data, cr)).toEqual({ ok: true, label: 'Buzz Box (rating 3)', karma: 0, nuyen: 450 })
  const odd = made({ data: d => { const e = d.entry; d.entry = (k, id) => { const x = e(k, id); return id === 'crb.zap-gun' && x ? { ...x, attrs: { ...x.attrs, cost: '12x' } } : x } } })
  expect(preview(ch, buy('crb.zap-gun', 'weapons'), odd.data, odd.cr)).toEqual({ ok: false, reason: 'book-value' })
  const r = ok(record(ch, buy('crb.zap-gun', 'weapons'), data, cr))
  expect(balances(r).nuyen).toBe(4710)
  const uid = currentBuild(r).purchases[0].uid
  expect(preview(r, { op: 'drop', target: uid }, data, cr)).toEqual({ ok: true, label: 'Dropped: Zap Gun', karma: 0, nuyen: 0 })
  // the entry goes from the catalog: the runner still replays, and Review names it from its stored name
  const gone = made({ data: d => { const e = d.entry; d.entry = (k, id) => (id === 'crb.zap-gun' ? undefined : e(k, id)) } })
  expect(currentBuild(r).purchases.map(x => x.name)).toEqual(['Zap Gun'])
  expect(validateCareer(gone.data, gone.cr, r).find(x => x.code === 'catalog.missing')?.message).toBe('Zap Gun is no longer in the catalog.')
})

test('an adept power costs no karma while power points are left; a mystic adept buys power points', () => {
  const { data, cr } = made(), adept = runner({ magic: 'adept' })
  const power: Sr6Advance = { op: 'pick', line: { uid: '', kind: 'adeptpowers', id: 'crb.quick-step' } }
  expect(preview(adept, power, data, cr)).toEqual({ ok: true, label: 'Adept power: Quick Step 1', karma: 0, nuyen: 0 })
  const twice = ok(record(ok(record(adept, power, data, cr)), power, data, cr))
  expect(currentBuild(twice).picks).toMatchObject([{ id: 'crb.quick-step', level: 2 }])
  const dear = made({ data: d => { d.powers['crb.quick-step'].cost = 2 } })
  expect(preview(adept, power, dear.data, dear.cr)).toEqual({ ok: false, reason: 'no-power-points' })
  const mystic = runner({ magic: 'mystic-adept' })
  expect(preview(mystic, power, data, cr)).toEqual({ ok: false, reason: 'no-power-points' })
  expect(preview(mystic, { op: 'powerpoint' }, data, cr)).toEqual({ ok: true, label: 'Power point', karma: 7, nuyen: 0 })
  expect(preview(adept, { op: 'powerpoint' }, data, cr)).toEqual({ ok: false, reason: 'cannot-learn' })
  const bought = ok(record(mystic, { op: 'powerpoint' }, data, cr))
  expect(preview(bought, power, data, cr)).toMatchObject({ ok: true, karma: 0 })
})

test('a contact and Other take the typed amounts; a lifestyle is its cost × months', () => {
  const { data, cr } = made(), ch = runner()
  const c = ok(record(ch, { op: 'contact', line: { uid: '', name: 'Bea Broker', archetype: 'Fence', connection: 2, loyalty: 1 } }, data, cr, { karma: 4 }))
  expect(c.ledger.at(-1)).toMatchObject({ label: 'Contact: Bea Broker', karma: 4, nuyen: 0 })
  expect(currentBuild(c).contacts.map(x => x.name)).toEqual(['Bea Broker'])
  expect(preview(ch, { op: 'other' }, data, cr, { karma: 2, nuyen: 50, label: 'Bribed a doorman' })).toEqual({ ok: true, label: 'Bribed a doorman', karma: 2, nuyen: 50 })
  expect(preview(ch, { op: 'lifestyle', id: 'crb.cozy', months: 2 }, data, cr)).toEqual({ ok: true, label: 'Lifestyle: Cozy × 2 months', karma: 0, nuyen: 5000 })
})

test('a lifestyle spend names its SIN: more months of one it has add to it, another is added beside it', () => {
  const squat = { id: 'crb.squat', kind: 'lifestyles' as const, name: 'Squat', source: 'CRB', page: 1, attrs: { cost: '100' }, parts: [], text: '' }
  const { data, cr } = made({ data: d => { const old = d.entry; d.entry = (k, id) => (id === squat.id ? squat : old(k, id)) } })
  const ch = runner({ nuyen: 20000 })
  ch.build.sins = [{ uid: 's1', name: 'Jo', kind: 'fake', rating: 1, licences: [], lifestyles: [{ uid: 'l1', id: 'crb.cozy', months: 3 }] },
    { uid: 's2', name: 'Me', kind: 'real', licences: [] }]
  expect(preview(ch, { op: 'lifestyle', id: 'crb.cozy', months: 1, sin: 'nope' }, data, cr)).toEqual({ ok: false, reason: 'unknown-line' })
  const more = ok(record(ch, { op: 'lifestyle', id: 'crb.cozy', months: 2, sin: 's1' }, data, cr))
  expect(more.ledger.at(-1)).toMatchObject({ label: 'Lifestyle: Cozy × 2 months (Jo)' })
  expect(currentBuild(more).sins[0].lifestyles).toEqual([{ uid: 'l1', id: 'crb.cozy', months: 5 }])
  expect(ch.build.sins[0].lifestyles).toEqual([{ uid: 'l1', id: 'crb.cozy', months: 3 }])  // the finalized build is untouched
  const other = ok(record(more, { op: 'lifestyle', id: squat.id, months: 1, sin: 's2' }, data, cr))
  const uid = (other.ledger.at(-1) as { advance: { uid?: string } }).advance.uid
  expect(uid).toBeTruthy()
  expect(currentBuild(other).sins[1].lifestyles).toEqual([{ uid, id: 'crb.squat', months: 1 }])
  expect(currentBuild(other).sins[0].lifestyles).toHaveLength(1)
})

test('an older lifestyle spend (no SIN) replays on the first SIN: more months of its lifestyle, or another replacing it', () => {
  const squat = { id: 'crb.squat', kind: 'lifestyles' as const, name: 'Squat', source: 'CRB', page: 1, attrs: { cost: '100' }, parts: [], text: '' }
  const { data, cr } = made({ data: d => { const old = d.entry; d.entry = (k, id) => (id === squat.id ? squat : old(k, id)) } })
  const ch = runner({ nuyen: 20000 })
  ch.build.sins = [{ uid: 's1', name: 'Jo', kind: 'real', licences: [], lifestyles: [{ uid: 'l1', id: 'crb.cozy', months: 3 }] }]
  const more = ok(record(ch, { op: 'lifestyle', id: 'crb.cozy', months: 2 }, data, cr))
  expect(currentBuild(more).sins[0].lifestyles).toEqual([{ uid: 'l1', id: 'crb.cozy', months: 5 }])
  const moved = ok(record(more, { op: 'lifestyle', id: squat.id, months: 1 }, data, cr))
  expect(currentBuild(moved).sins[0].lifestyles).toEqual([{ uid: 'l1', id: 'crb.squat', months: 1 }])
})

test('a lifestyle spend is its monthly cost × months off the nuyen; short of nuyen it’s refused', () => {
  const { data, cr } = made(), ch = runner({ nuyen: 6000 })
  ch.build.sins = [{ uid: 's1', name: 'Jo', kind: 'real', licences: [] }]
  const r = ok(record(ch, { op: 'lifestyle', id: 'crb.cozy', months: 2, sin: 's1' }, data, cr))
  expect(r.ledger.at(-1)).toMatchObject({ label: 'Lifestyle: Cozy × 2 months (Jo)', nuyen: 5000 })
  expect(balances(r).nuyen).toBe(1000)
  expect(preview(r, { op: 'lifestyle', id: 'crb.cozy', months: 1, sin: 's1' }, data, cr)).toEqual({ ok: false, reason: 'not-enough-nuyen' })
})

test('a SIN bought in career costs what creation charges: a fake one rating × its price plus its licences, a real one free', () => {
  const { data, cr } = made(), ch = runner({ nuyen: 5000 })   // invented prices: 1,500¥ per fake SIN rating, 300¥ per licence rating
  const sin = (o: Partial<Extract<Sr6Advance, { op: 'sin' }>['line']> = {}): Sr6Advance =>
    ({ op: 'sin', line: { uid: '', name: 'Jo Fake', kind: 'fake', rating: 2, licences: [{ name: 'Zapper', rating: 1 }], ...o } })
  expect(preview(ch, sin(), data, cr)).toEqual({ ok: true, label: 'SIN: Jo Fake (fake, rating 2, Zapper 1)', karma: 0, nuyen: 3300 })
  expect(preview(ch, sin({ kind: 'real', rating: undefined, licences: [] }), data, cr)).toEqual({ ok: true, label: 'SIN: Jo Fake (real)', karma: 0, nuyen: 0 })
  expect(preview(ch, sin({ kind: 'real', rating: undefined }), data, cr)).toMatchObject({ ok: true, nuyen: 300 })
  // refusals: no name, a rating below one, a licence above the SIN, short of nuyen, an unset price, a uid that isn't a placeholder
  expect(preview(ch, sin({ name: ' ' }), data, cr)).toEqual({ ok: false, reason: 'needs-name' })
  expect(preview(ch, sin({ rating: 0 }), data, cr)).toEqual({ ok: false, reason: 'below-one' })
  expect(preview(ch, sin({ licences: [{ name: 'Zapper', rating: 3 }] }), data, cr)).toEqual({ ok: false, reason: 'licence-above-sin' })
  expect(preview(ch, sin({ rating: 4 }), data, cr)).toEqual({ ok: false, reason: 'not-enough-nuyen' })
  const unset = made({ unset: ['fakeSinPerRating'] })
  expect(preview(ch, sin(), unset.data, unset.cr)).toEqual({ ok: false, reason: 'unset:fakeSinPerRating' })
  expect(preview(ch, sin({ kind: 'real', rating: undefined, licences: [] }), unset.data, unset.cr)).toMatchObject({ ok: true, nuyen: 0 })
  expect(preview(ch, sin({ uid: 'nope' }), data, cr)).toEqual({ ok: false, reason: 'unknown-line' })
  // recorded: a new uid, then a lifestyle bought under it
  const r = ok(record(ch, sin(), data, cr))
  expect(balances(r).nuyen).toBe(1700)
  const s = currentBuild(r).sins[0]
  expect(s).toEqual({ uid: expect.any(String), name: 'Jo Fake', kind: 'fake', rating: 2, licences: [{ name: 'Zapper', rating: 1 }] })
  expect(s.uid).not.toBe('')
  expect(ch.build.sins).toEqual([])  // the finalized build is untouched
  expect(preview(r, { op: 'lifestyle', id: 'crb.cozy', months: 1, sin: s.uid }, data, cr)).toEqual({ ok: false, reason: 'not-enough-nuyen' })
})

test('naming the placeholder SIN in career makes it a normal SIN with its lifestyles; Review’s note goes', () => {
  const { data, cr } = made(), ch = runner()
  ch.build.sins = [{ uid: 'ph', name: '', kind: 'real', licences: [], placeholder: true, lifestyles: [{ uid: 'l1', id: 'crb.cozy', months: 1 }] }]
  expect(validateCareer(data, cr, ch).map(v => v.code)).toContain('sin.placeholder')
  const named: Sr6Advance = { op: 'sin', line: { uid: 'ph', name: 'Jo Named', kind: 'fake', rating: 1, licences: [] } }
  expect(preview(ch, named, data, cr)).toEqual({ ok: true, label: 'SIN: Jo Named (fake, rating 1), was the unnamed SIN', karma: 0, nuyen: 1500 })
  const r = ok(record(ch, named, data, cr))
  expect(currentBuild(r).sins).toEqual([{ uid: 'ph', name: 'Jo Named', kind: 'fake', rating: 1, licences: [], lifestyles: [{ uid: 'l1', id: 'crb.cozy', months: 1 }] }])
  expect(validateCareer(data, cr, r).map(v => v.code)).not.toContain('sin.placeholder')
  // only a placeholder is named this way
  expect(preview(r, { ...named, line: { ...named.line, name: 'Again' } }, data, cr)).toEqual({ ok: false, reason: 'unknown-line' })
})

// --- finalize and Back to draft ---

test('finalize adds a finalize entry; Back to draft only with nothing live to undo; finalize again starts the balances anew', () => {
  const { data, cr } = made()
  const ch = blankSr6('karma', 'c2', NOW)
  ch.build = buildOf('karma', { metatype: GLIM })
  const p = makeProvider('karma', data, cr), b = allBudgets(ch.build, data, cr, p)
  const f = finalizeSr6(ch, b, [], NOW)!
  expect(f.ledger).toMatchObject([{ type: 'finalize', karma: b.karma.left, nuyen: b.nuyen.left, at: NOW }])
  const e = earn(f, 3, 0, 'Made-up gig', '2026-10-06', NOW)
  expect(canDraft(e)).toBe(false)
  expect(draftAgain(e)).toBeNull()
  const v = voidEntry(e, e.ledger[1].id, 'Never happened')
  if (!v.ok) throw new Error(v.reason)
  const d = draftAgain(v.ch)!
  expect(d.finalizedAt).toBeUndefined()
  expect(d.final).toBeUndefined()
  expect(d.ledger.at(-1)).toMatchObject({ type: 'note', text: 'Back to draft' })
  const again = finalizeSr6(d, { ...b, karma: { ...b.karma, left: 6 }, nuyen: { ...b.nuyen, left: 70 } }, [], NOW)!
  expect(again.ledger.filter(x => x.type === 'finalize')).toHaveLength(2)
  expect(balances(again)).toEqual({ karma: 6, nuyen: 70 })
})

test('the career fixture replays: AGI 4, the spec, the Zap Gun and the spell; the voided initiation isn’t there', () => {
  const r = xmlToSr6(readFileSync('tests/fixtures/sr6/runner-career.xml', 'utf8'))
  if (!r.ok) throw new Error(r.reason)
  const b = currentBuild(r.character)
  expect(b.attributes.agi.karma).toBe(1)
  expect(b.skills.find(s => s.id === 'crb.tinkering')?.spec).toBe('Gizmos')
  expect(b.purchases.map(x => x.name)).toEqual([undefined, 'Zap Gun'])
  expect(b.picks.map(x => x.name)).toEqual(['Glow Ward'])
  expect(b.initiation).toBe(0)
  expect(balances(r.character)).toEqual({ karma: 14, nuyen: 7160 })
  expect(canDraft(r.character)).toBe(false)
  // the Ledger tab's Void buttons (worked out once) are exactly what voidEntry allows
  const ch = r.character, allowed = ch.ledger.filter(e => voidEntry(ch, e.id, '').ok).map(e => e.id)
  expect([...voidableIds(ch)]).toEqual(allowed)
  expect(allowed.length).toBeGreaterThan(1)
})
