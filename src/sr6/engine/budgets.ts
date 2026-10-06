// Itemized creation budgets (a port of SR6 Forge's budgets.mjs): pure functions over a build, the catalog views
// (Sr6Data), the table's creation rules and the method's provider. Prices come from the catalog through bookValue (a
// <formula>, else the printed string read by rated());
// a value the app can't read counts 0 (priced().ok false, Review warns); an unset creation setting counts 0 (Review
// warns that it isn't set). Never NaN.
import { MAGIC_KIND_LABELS, SR6_ATTRS, type Bonus, type PurchaseKind, type Sr6Attr, type Sr6Build, type Sr6Purchase, type Sr6Quality, type Sr6Skill } from '../model/character'
import type { Sr6Entry } from '../model/types'
import { num, str, type CreationRules } from './creation'
import { MAGIC_KINDS, type Sr6Data, type Sr6QualityView } from './data'
import { gradeFactor, type GradeFactor } from './grades'
import { contactSpend, knowledgeSpend, pool, type Pool, type Provider } from './providers'
import { fieldName } from '../../engine/formula'
import { bookValue, dataFind, ratingRange } from './values'
import { entryLabel } from './categories'

/** One line of a budget: what took (spend) or gave (gain) how much, and the editor tab it's made on. */
export interface BudgetLine { key: string; label: string; amount: number; sign: 'spend' | 'gain'; tab: string }
export interface Budget extends Pool { breakdown?: BudgetLine[] }
export interface Sr6Budgets {
  attributePoints: Budget; adjustmentPoints: Budget; skillPoints: Budget
  karma: Budget; nuyen: Budget
  /** magicLoss: the Magic or Resonance lost, 1 per started point of Essence spent (CRB p. 38) */
  essence: Budget & { magicLoss: number }
  /** cap: the most power points a mystic adept may buy (its priority Magic) */
  powerPoints: Budget & { cap: number }
  /** free spells and rituals (complex forms for a technomancer) */
  spellSlots: Budget
  contactPoints: Budget & { ratingCap: number; karma?: number }
  knowledgePoints: Budget
  /** point buy only */
  characterPoints?: Budget
}

/** The editor tab each purchase kind is bought on. */
export const PURCHASE_TAB: Record<PurchaseKind, string> = {
  weapons: 'gear', armor: 'gear', electronics: 'gear', programs: 'gear', gear: 'gear', augmentations: 'augmentations', vehicles: 'vehicles', ammotypes: 'gear',
}
const round2 = (x: number) => Math.round(x * 100) / 100
const n0 = (cr: CreationRules, key: string) => num(cr, key) ?? 0

/** Natural rating: 1 (lifepath: what it starts at) + points + adjustment + karma; Magic or Resonance (whichever the magic kind uses) starts at the
 *  method's rating instead, the other at 0. */
export function attrRating(b: Sr6Build, k: Sr6Attr, p: Provider): number {
  const a = b.attributes[k], resonance = MAGIC_KINDS[b.magic].resonance
  const base = k === 'mag' ? (resonance ? 0 : p.magicRating(b)) : k === 'res' ? (resonance ? p.magicRating(b) : 0) : 1
  return base + a.points + a.adjust + a.karma + (p.attributeBonus?.(b, k) ?? 0) + (p.startBonus?.(b, k) ?? 0)
}

const bonusOf = (bonuses: Bonus[] | undefined, k: Bonus['target'], rating: number) =>
  (bonuses ?? []).filter(x => x.target === k).reduce((s, x) => s + x.value * (x.perRating ? rating : 1), 0)
/** What the player's entered bonuses add to the runner's `k` (R: the catalog carries no bonus data): picks by level,
 *  purchases by rating times quantity. An accessory's bonuses are its host item's, never the runner's (hostBonus). */
export function augmentBonus(b: Sr6Build, k: Bonus['target']): number {
  let total = b.picks.reduce((s, x) => s + bonusOf(x.bonuses, k, x.level ?? 1), 0)
  for (const x of b.purchases) total += bonusOf(x.bonuses, k, x.rating ?? 1) * x.qty
  return total
}
/** What a line's accessories add to the line itself (a cyberlimb's Strength, its armor), each by its own rating:
 *  target -> total, only the targets they touch. */
export function hostBonus(x: Sr6Purchase): Partial<Record<Bonus['target'], number>> {
  const out: Partial<Record<Bonus['target'], number>> = {}
  for (const a of x.accessories) for (const t of new Set((a.bonuses ?? []).map(y => y.target))) out[t] = (out[t] ?? 0) + bonusOf(a.bonuses, t, a.rating ?? 1)
  return out
}
export const augmentedRating = (b: Sr6Build, k: Sr6Attr, p: Provider) => attrRating(b, k, p) + augmentBonus(b, k)
export const skillRank = (s: Pick<Sr6Skill, 'points' | 'karma'>) => s.points + s.karma

/** The catalog entry a purchase is priced from: the live one, else the snapshot it was exported with. */
export const entryOf = (x: Sr6Purchase, data: Sr6Data): Sr6Entry | undefined => (x.id ? data.entry(x.kind, x.id) ?? x.snapshot : undefined)
/** The rating a purchase is priced at: its own, else the lowest its entry comes in, else 1. */
export const ratingOf = (x: Sr6Purchase, e?: Sr6Entry) => x.rating ?? ratingRange(e?.attrs.rating)[0] ?? 1

/** A purchase line's cost (× qty, accessories added), Availability (its own; accessories are checked one by one) and
 *  Essence (× qty, accessories added), at its rating, quantity and grade: an entry's <formula> when it has one
 *  (bookValue), else the printed value. A custom item (no id) uses the player's numbers. A value the app can't read or
 *  work out counts 0 and makes ok false (unpriced: the cost is the one); notes: what a formula had to assume. */
export function priced(x: Sr6Purchase, data: Sr6Data, cr: CreationRules): { cost: number; avail: number; essence: number; ok: boolean; unpriced: boolean; notes: string[] } {
  let cost: number, avail: number, essence: number, ok = true, unpriced = false
  const notes: string[] = [], perLine = new Set<string>()
  if (!x.id) { cost = x.cost ?? 0; avail = x.avail ?? 0; essence = x.essence ?? 0 }
  else {
    // ratingOf's rating, but none for an unrated item (a formula then notes it; a printed value reads at 1 as before)
    const e = entryOf(x, data), r = x.rating ?? ratingRange(e?.attrs.rating)[0], find = dataFind(data)
    const read = (attr: string) => {
      const v = bookValue(e, attr, r, find, { Q: x.qty })
      if (!v.ok) { ok = false; if (attr === 'cost') unpriced = true }
      if (v.perLine) perLine.add(attr)
      notes.push(...v.notes.map(n => `${fieldName(attr)}: ${n}`))
      return v.n ?? 0
    }
    cost = read('cost'); avail = read('avail'); essence = read('essence')
  }
  if (x.grade) {
    const g = (k: GradeFactor) => gradeFactor(cr, data, x.grade!, k)
    cost *= g('cost') ?? 1; essence *= g('essence') ?? 1; avail += g('avail') ?? 0
  }
  // a formula with Q in it already works out the whole line
  if (!perLine.has('cost')) cost *= x.qty
  if (!perLine.has('essence')) essence *= x.qty
  for (const a of x.accessories) {
    const pa = priced(a, data, cr)
    cost += pa.cost; essence += pa.essence; ok &&= pa.ok
  }
  return { cost, avail, essence: round2(essence), ok, unpriced, notes }
}

/** One quality's karma before positiveQualityFactor: |karma| × level, or, for one priced in a range, the karma it was
 *  taken for (kept within the range; the lowest when it isn't set). */
export function qualityCost(q: Sr6Quality, v: Sr6QualityView): number {
  const lo = Math.abs(v.karma ?? 0), each = v.karmaMax != null && q.karma != null ? Math.min(Math.abs(v.karmaMax), Math.max(lo, q.karma)) : lo
  return each * (v.perLevel ? q.level : 1)
}

/** Karma from qualities: positive ones cost qualityCost (× positiveQualityFactor), negative ones give it; free traits and
 *  qualities gone from the catalog count nothing. */
export function qualityKarma(b: Sr6Build, data: Sr6Data, cr: CreationRules): { pos: number; neg: number } {
  let pos = 0, neg = 0
  for (const q of b.qualities) {
    const v = data.qualities[q.id]
    if (q.free || !v) continue
    const total = qualityCost(q, v)
    if (v.positive) pos += total * (num(cr, 'positiveQualityFactor') ?? 1); else neg += total
  }
  return { pos, neg }
}

/** Free spells and rituals (complex forms for a technomancer): the method's Magic or Resonance rating (not as adjusted)
 *  times the setting; a mystic adept first takes off the power points it bought (CRB pp. 65–66). Point buy buys them with
 *  character points instead (R: the Sixth World Companion's method). */
export function freeSpellSlots(b: Sr6Build, cr: CreationRules, p: Provider): number {
  const k = MAGIC_KINDS[b.magic]
  if (b.method === 'pointbuy') return k.resonance ? b.cp.complexForms : k.spells ? b.cp.spells : 0
  if (k.resonance) return p.magicRating(b) * n0(cr, 'freeFormsPerResonance')
  if (!k.spells) return 0
  return Math.max(0, p.magicRating(b) - (k.paysPowers ? b.powerPointsBought : 0)) * n0(cr, 'freeSpellsPerMagic')
}

/** Karma turned into nuyen, up to karmaToNuyenMax when it's set. */
const toNuyen = (b: Sr6Build, cr: CreationRules) => Math.max(0, Math.min(b.karmaToNuyen, num(cr, 'karmaToNuyenMax') ?? Infinity))
const count = (b: Sr6Build, ...kinds: Sr6Build['picks'][number]['kind'][]) => b.picks.filter(x => kinds.includes(x.kind)).length
const s = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function karmaBudget(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): Budget {
  const breakdown: BudgetLine[] = []
  const add = (key: string, label: string, amount: number, tab: string, sign: BudgetLine['sign'] = 'spend') => {
    if (amount) breakdown.push({ key, label, amount, sign, tab })
  }
  const q = qualityKarma(b, data, cr)
  add('qualityNeg', 'Negative qualities', q.neg, 'qualities', 'gain')
  // a karma rank costs the per-rank price times the rating it reaches, step by step from the top
  const perRank = n0(cr, 'karmaAttrPerRank')
  for (const k of SR6_ATTRS) {
    const ranks = b.attributes[k].karma, to = attrRating(b, k, p)
    let cost = 0
    for (let i = 0; i < ranks; i++) cost += (to - i) * perRank
    add(`attr:${k}`, `${k.toUpperCase()} ${to - ranks} → ${to} (${s(ranks, 'rank')} by karma)`, cost, 'attributes')
  }
  let skills = skillSpend(b, cr, p.skillPoints(b)).karma * n0(cr, 'karmaSpec')
  for (const sk of b.skills) {
    const top = skillRank(sk)
    for (let i = 0; i < sk.karma; i++) skills += (top - i) * n0(cr, 'karmaSkillPerRank')
  }
  add('skills', 'Skill ranks bought with karma', skills, 'skills')
  add('knowledge', 'Knowledge and language ranks bought with karma', b.knowledge.reduce((t, k) => t + k.karma, 0) * n0(cr, 'karmaKnowledge'), 'skills')
  add('qualityPos', 'Positive qualities', q.pos, 'qualities')
  const free = freeSpellSlots(b, cr, p), res = MAGIC_KINDS[b.magic].resonance
  add('spells', 'Spells and rituals past the free ones', Math.max(0, count(b, 'spells', 'rituals') - (res ? 0 : free)) * n0(cr, 'karmaSpell'), 'magic')
  add('complexForms', 'Complex forms past the free ones', Math.max(0, count(b, 'complexforms') - (res ? free : 0)) * n0(cr, 'karmaForm'), 'magic')
  // R: initiation and submersion can be bought at creation, base + grade × per-grade for each grade
  const grades = (g: number) => { let t = 0; for (let i = 1; i <= g; i++) t += n0(cr, 'karmaInitiationBase') + i * n0(cr, 'karmaInitiationPerGrade'); return t }
  add('initiation', `Initiation grade ${b.initiation}`, grades(b.initiation), 'magic')
  add('submersion', `Submersion grade ${b.submersion}`, grades(b.submersion), 'magic')
  add('metatype', data.metatypes[b.metatype]?.name ?? b.metatype, p.metatypeKarma?.(b) ?? 0, 'method')
  add('magic', MAGIC_KIND_LABELS[b.magic], p.magicKarma?.(b) ?? 0, 'method')
  add('toNuyen', 'Turned into nuyen', toNuyen(b, cr), 'contacts')
  add('contacts', 'Contact ratings past the contact points', p.contactPoints?.(b).karma ?? 0, 'contacts')
  const spent = breakdown.filter(l => l.sign === 'spend').reduce((t, l) => t + l.amount, 0)
  return { ...pool(p.startingKarma() + q.neg, spent), breakdown }
}

const purchaseName = (x: Sr6Purchase, data: Sr6Data) => { const e = entryOf(x, data); return e ? entryLabel(e) : x.name ?? x.id ?? 'Custom item' }

export function nuyenBudget(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): Budget {
  const breakdown: BudgetLine[] = []
  const add = (key: string, label: string, amount: number, tab: string) => { if (amount) breakdown.push({ key, label, amount: Math.round(amount), sign: 'spend', tab }) }
  for (const x of b.purchases)
    add(`purchase:${x.uid}`, `${purchaseName(x, data)}${x.rating ? ` (rating ${x.rating})` : ''}${x.qty > 1 ? ` × ${x.qty}` : ''}`,
      priced(x, data, cr).cost, PURCHASE_TAB[x.kind])
  if (b.lifestyle) {
    const e = data.entry('lifestyles', b.lifestyle.id), m = b.lifestyle.months
    add('lifestyle', `${e?.name ?? b.lifestyle.id} lifestyle × ${s(m, 'month')}`, (bookValue(e, 'cost', undefined, dataFind(data)).n ?? 0) * m, 'contacts')
  }
  for (const sin of b.sins) {
    // a real SIN comes with its quality; its licences are still bought
    const licences = sin.licences.reduce((t, l) => t + l.rating, 0) * n0(cr, 'licencePerRating')
    const own = sin.kind === 'real' ? 0 : (sin.rating ?? 1) * n0(cr, 'fakeSinPerRating')
    const what = sin.kind === 'real' ? 'real SIN' : `fake SIN, rating ${sin.rating ?? 1}`
    add(`sin:${sin.uid}`, `${sin.name || 'SIN'} (${what})${sin.licences.length ? ` · ${s(sin.licences.length, 'licence')}` : ''}`, own + licences, 'contacts')
  }
  const debt = str(cr, 'inDebtQuality'), inDebt = !!debt && b.qualities.some(q => q.id === debt)
  const karma = toNuyen(b, cr), converted = karma * n0(cr, inDebt ? 'karmaToNuyenRateInDebt' : 'karmaToNuyenRate')
  if (converted) breakdown.push({ key: 'fromKarma', label: `${karma} karma turned into nuyen`, amount: converted, sign: 'gain', tab: 'contacts' })
  const spent = breakdown.filter(l => l.sign === 'spend').reduce((t, l) => t + l.amount, 0)
  return { ...pool(p.nuyen(b) + converted, spent), breakdown }
}

export function essenceBudget(b: Sr6Build, data: Sr6Data, cr: CreationRules): Sr6Budgets['essence'] {
  const spent = round2(b.purchases.reduce((t, x) => t + priced(x, data, cr).essence, 0))
  return { ...pool(n0(cr, 'essence'), spent), left: round2(n0(cr, 'essence') - spent), magicLoss: Math.ceil(spent - 1e-9) }
}

/** An adept's power points are its Magic: one per point, the priority's and any raised with adjustment points or karma
 *  (CRB p.157); a mystic adept's are the ones it bought (capped by that Magic); in point buy they're bought with
 *  character points. A leveled power costs per level. */
export function powerPoints(b: Sr6Build, data: Sr6Data, p: Provider): Sr6Budgets['powerPoints'] {
  const k = MAGIC_KINDS[b.magic], rating = attrRating(b, 'mag', p)
  const max = !k.powers ? 0 : b.method === 'pointbuy' ? b.cp.powerPoints : k.paysPowers ? b.powerPointsBought : rating
  const spent = round2(b.picks.filter(x => x.kind === 'adeptpowers').reduce((t, x) => {
    const v = data.powers[x.id]
    return t + (v?.cost ?? 0) * (v?.perLevel ? x.level ?? 1 : 1)
  }, 0))
  return { max, spent, left: round2(max - spent), cap: rating }
}

export function contactPoints(b: Sr6Build, cr: CreationRules, p: Provider): Sr6Budgets['contactPoints'] {
  if (p.contactPoints) return p.contactPoints(b)
  const cha = attrRating(b, 'cha', p)
  return { ...pool(cha * n0(cr, 'contactPointsPerCha'), contactSpend(b)), ratingCap: cha }
}

export function knowledgePoints(b: Sr6Build, cr: CreationRules, p: Provider): Budget {
  return p.knowledgePoints?.(b) ?? pool(attrRating(b, 'log', p) * n0(cr, 'knowledgePerLog'), knowledgeSpend(b))
}

/** Skill points spent, and how many specializations and expertises karma buys: the ranks take their points; a
 *  specialization (or an expertise, at its own price) on a skill with skill points takes the points still left, and one
 *  they don't cover is bought with karma (CRB p.66: a specialization costs a skill rank; p.69: or 5 karma), as is one on
 *  a skill with only karma ranks. An unset price counts 0 (an expertise then is Review's skill.expertise error). */
export function skillSpend(b: Sr6Build, cr: CreationRules, pool: number): { points: number; karma: number } {
  let points = b.skills.reduce((t, sk) => t + sk.points, 0), karma = 0
  const take = (on: boolean, cost: number) => {
    if (on && (cost === 0 || points + cost <= pool)) points += cost
    else karma++
  }
  for (const sk of b.skills) {
    if (sk.spec) take(sk.points > 0, n0(cr, 'skillPointsSpec'))
    if (sk.expertise) take(sk.points > 0, n0(cr, 'skillPointsExpertise'))
  }
  return { points, karma }
}

/** Every budget, as the editor's budget panel shows them. */
export function allBudgets(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): Sr6Budgets {
  const spend = (pool_: 'points' | 'adjust') => SR6_ATTRS.reduce((t, k) => t + b.attributes[k][pool_], 0)
  const k = MAGIC_KINDS[b.magic], slots = freeSpellSlots(b, cr, p)
  const cp = p.characterPoints?.(b)
  return {
    attributePoints: pool(p.attributePoints(b), spend('points')),
    adjustmentPoints: pool(p.adjustmentPoints(b), spend('adjust')),
    skillPoints: pool(p.skillPoints(b), skillSpend(b, cr, p.skillPoints(b)).points),
    karma: karmaBudget(b, data, cr, p),
    nuyen: nuyenBudget(b, data, cr, p),
    essence: essenceBudget(b, data, cr),
    powerPoints: powerPoints(b, data, p),
    spellSlots: pool(slots, k.resonance ? count(b, 'complexforms') : count(b, 'spells', 'rituals')),
    contactPoints: contactPoints(b, cr, p),
    knowledgePoints: knowledgePoints(b, cr, p),
    ...(cp ? { characterPoints: cp } : {}),
  }
}
