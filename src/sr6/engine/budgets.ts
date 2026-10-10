// Itemized creation budgets (a port of SR6 Forge's budgets.mjs): pure functions over a build, the catalog views
// (Sr6Data), the table's creation rules and the method's provider. Prices come from the catalog through bookValue (a
// <formula>, else the printed string read by rated());
// a value the app can't read counts 0 (priced().ok false, Review warns); an unset creation setting counts 0 (Review
// warns that it isn't set). Never NaN.
import { MAGIC_KIND_LABELS, SR6_ATTRS, type Bonus, type PurchaseKind, type Sr6Attr, type Sr6Build, type Sr6Purchase, type Sr6Quality, type Sr6Sin, type Sr6Skill, sinName } from '../model/character'
import type { Sr6Entry } from '../model/types'
import { flag, num, str, type CreationRules } from './creation'
import { MAGIC_KINDS, normName, type Sr6Data, type Sr6QualityView } from './data'
import { gradeFactor, type GradeFactor } from './grades'
import { contactSpend, knowledgeSpend, pool, type Pool, type Provider } from './providers'
import { own } from '../../engine/effects'
import { fieldName } from '../../engine/formula'
import { bookValue, dataFind, ratingRange } from './values'
import { capacityUsed, entryLabel } from './categories'
import { martialKarma } from './martial'
import { effectBonuses, maxEffects, sr6Counts as counts } from './effects'

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

// (owner decision 2026-10-10: the total shown first holds the always-on bonuses, `on` (the bracketed total) the switchable
// and conditional ones too; a skill bonus limited to a specialization counts in that specialization's pool (specBonus),
// and in the skill's bracketed total for a specialization the runner hasn't)
const bonusOf = (bonuses: Bonus[] | undefined, k: Bonus['target'], rating: number, skill?: string, on = false, spec?: string) =>
  (bonuses ?? []).filter(x => x.target === k && counts(x, on) && (k !== 'skill' || x.skill === skill) && (!x.spec || (on && !sameSpec(x.spec, spec))))
    .reduce((s, x) => s + x.value * (x.perRating ? rating : 1), 0)
// (`Etiquette or Negotiation`: either)
const sameSpec = (a?: string, b?: string) => !!a && !!b && a.split(/,\s*|\s+(?:or|and)\s+/).some(x => normName(x) === normName(b))
/** Each line's bonuses at its rating and count: picks and qualities by level, purchases by rating times quantity. */
function eachLine(b: Sr6Build, data: Sr6Data, f: (bs: Bonus[], rating: number, times: number, from: string) => void) {
  for (const x of b.picks) f(lineBonuses(data, x.bonuses, data.entry(x.kind, x.id)), x.level ?? 1, 1, data.entry(x.kind, x.id)?.name ?? x.name ?? x.id)
  for (const x of b.purchases) { const e = entryOf(x, data); f(lineBonuses(data, x.bonuses, e), x.rating ?? 1, x.qty, e?.name ?? x.name ?? 'Custom item') }
  for (const q of b.qualities) { const e = data.entry('qualities', q.id); f(entryBonuses(data, e), 1, q.level, e?.name ?? q.name ?? q.id) }
}
/** The bonuses to `target` (for `skill` the one skill's dice pool) that only the bracketed total holds (switchable, some
 *  tests only, or a specialization the runner hasn't), each with its line's name, value at its rating and its note (its
 *  switch, condition or specialization, and `affects the caster`): why the bracket differs (owner decision 2026-10-10:
 *  the hover card, Review and the sheet name it). */
export function bracketNotes(b: Sr6Build, data: Sr6Data, target: Bonus['target'], skill?: string, spec?: string): { value: number; when: string; from: string }[] {
  const out: { value: number; when: string; from: string }[] = []
  eachLine(b, data, (bs, rating, times, from) => {
    for (const x of bs) if (x.target === target && (target !== 'skill' || x.skill === skill) && counts(x, true) && !sameSpec(x.spec, spec) && (!counts(x) || !!x.spec))
      out.push({ value: x.value * (x.perRating ? rating : 1) * times, from,
        when: [x.spec, x.when, x.switch !== 'conditional' && x.switch, x.affects === 'caster' && 'affects the caster'].filter(Boolean).join(', ') })
  })
  return out
}
/** bracketNotes of a skill's pool. */
export const conditionalBonuses = (b: Sr6Build, data: Sr6Data, skill: string, spec?: string) => bracketNotes(b, data, 'skill', skill, spec)
/** The notes as one line each (a hover card's title): `+2 Muscle toner (wireless)`. */
export const notesText = (xs: { value: number; when: string; from: string }[]) =>
  xs.map(x => `${x.value >= 0 ? '+' : ''}${x.value} ${x.from}${x.when ? ` (${x.when})` : ''}`).join('\n')
/** What the bonuses limited to specialization `spec` add to skill `skill`'s pool for it (on: the switchable ones too). */
export function specBonus(b: Sr6Build, data: Sr6Data, skill: string, spec: string, on = false): number {
  let total = 0
  eachLine(b, data, (bs, rating, times) => {
    for (const x of bs) if (x.target === 'skill' && x.skill === skill && sameSpec(x.spec, spec) && counts({ ...x, spec: undefined } as Bonus, on))
      total += x.value * (x.perRating ? rating : 1) * times
  })
  return total
}
/** A catalog entry's effects as bonuses (effects.ts effectBonuses: what importer/sr6/effects.py reads from the book's
 *  text and tables, with the entries it grants or works as). A low-confidence one is shown, never applied (owner decision
 *  D3). */
export const entryBonuses = (data: Sr6Data, e?: Sr6Entry): Bonus[] => effectBonuses(data, e)
/** The bonuses a line gives (the one place creation, Review, the sheets and the export read them): the player's or GM's
 *  own entered ones when it has any (they override, owner decision D3), else its catalog entry's effects. */
export const lineBonuses = (data: Sr6Data, entered: Bonus[] | undefined, e?: Sr6Entry): Bonus[] =>
  own(entered, entryBonuses(data, e))
/** What the runner's picks, purchases and qualities add to its `k`, for `skill` the one skill's dice pool (`skill`: its
 *  id) (lineBonuses): picks and qualities by level, purchases by rating times quantity. on: the bracketed total's (the
 *  switchable and conditional bonuses too; spec: the specialization the runner has, whose bonuses specBonus counts). An
 *  accessory's bonuses are its host item's, never the runner's (hostBonus). */
export function augmentBonus(b: Sr6Build, data: Sr6Data, k: Bonus['target'], skill?: string, on = false, spec?: string): number {
  let total = 0
  eachLine(b, data, (bs, rating, times) => { total += bonusOf(bs, k, rating, skill, on, spec) * times })
  return total
}
/** What a line's accessories add to the line itself (a cyberlimb's Strength, its armor), each by its own rating:
 *  target -> total, only the targets they touch (not a skill's pool: a runner's, never an item's). */
export function hostBonus(x: Sr6Purchase, data: Sr6Data, on = false): Partial<Record<Exclude<Bonus['target'], 'skill'>, number>> {
  const out: Partial<Record<Exclude<Bonus['target'], 'skill'>, number>> = {}
  for (const a of x.accessories) {
    const bs = lineBonuses(data, a.bonuses, entryOf(a, data))
    for (const t of new Set(bs.map(y => y.target))) if (t !== 'skill') out[t] = (out[t] ?? 0) + bonusOf(bs, t, a.rating ?? 1, undefined, on)
  }
  return out
}
/** A runner's attribute as its picks raise it (natural + augmentBonus): what Charisma's contact points and Logic's
 *  knowledge skills are counted from. */
export const augmentedRating = (b: Sr6Build, data: Sr6Data, k: Sr6Attr, p: Provider) => attrRating(b, k, p) + augmentBonus(b, data, k)
const ATTR_WORDS: Record<string, Sr6Attr> = { body: 'bod', agility: 'agi', reaction: 'rea', strength: 'str', willpower: 'wil',
  logic: 'log', intuition: 'int', charisma: 'cha', edge: 'edg' }
/** An attribute's creation and career maximum: the metatype's (or the one a quality's effects set), plus what a
 *  quality's effects add, plus 1 for each Exceptional (Attribute) quality whose note names it (CRB p. 71: `That attribute's maximum (but not current) rank increases by 1`; exceptionalQuality). The one
 *  figure Review's caps, the editor's steppers and the Ledger read. undefined: no metatype (or Magic, Resonance). */
export function attrMax(data: Sr6Data, cr: CreationRules, b: Sr6Build, k: Sr6Attr): number | undefined {
  const m = data.metatypes[b.metatype]
  if (!m || !(k in m.ranges)) return undefined
  const id = str(cr, 'exceptionalQuality')
  const named = (note?: string) => (note ?? '').toLowerCase().split(/[^a-z]+/).some(w => ATTR_WORDS[w] === k || w === k)
  // a quality's own maxima (an infected type's table, Shiva Arms' `maximum Body and Strength by one point`, effects.ts)
  let max = m.ranges[k as keyof typeof m.ranges][1]
  for (const q of b.qualities) {
    const x = maxEffects(data.entry('qualities', q.id))[k]
    if (x?.set !== undefined) max = x.set
    if (x?.add) max += x.add * (x.perRating ? q.level : 1)
  }
  return max + (id ? b.qualities.filter(q => q.id === id && named(q.note)).length : 0)
}
export const skillRank = (s: Pick<Sr6Skill, 'points' | 'karma'>) => s.points + s.karma

/** The catalog entry a purchase is priced from: the live one, else the snapshot it was exported with. */
export const entryOf = (x: Sr6Purchase, data: Sr6Data): Sr6Entry | undefined => (x.id ? data.entry(x.kind, x.id) ?? x.snapshot : undefined)
/** The rating a purchase is priced at: its own, else the lowest its entry comes in, else 1. */
export const ratingOf = (x: Sr6Purchase, e?: Sr6Entry) => x.rating ?? ratingRange(e?.attrs.rating)[0] ?? 1

/** An accessory as its host carries it: on an augmentation it has the host's grade, whatever the file says ("All
 *  accessories and add-ons must be of the same grade as the implant to which they are added", CRB p. 282). */
export function fitted(host: Sr6Purchase, a: Sr6Purchase): Sr6Purchase {
  if (host.kind !== 'augmentations' || a.grade === host.grade) return a
  const { grade: _, ...rest } = a
  return host.grade ? { ...rest, grade: host.grade } : rest
}

/** A purchase line's cost (× qty, accessories added), Availability (its own; accessories are checked one by one) and
 *  Essence (× qty, accessories added but those taking the host's Capacity), at its rating, quantity and grade: an entry's <formula> when it has one
 *  (bookValue), else the printed value. A custom item (no id) uses the player's numbers. A value the app can't read or
 *  work out counts 0 and makes ok false (unpriced: the cost is the one); notes: what a formula had to assume. */
export function priced(x: Sr6Purchase, data: Sr6Data, cr: CreationRules, host?: { cost: number; avail: number; essence: number }): { cost: number; avail: number; essence: number; ok: boolean; unpriced: boolean; notes: string[] } {
  let cost: number, avail: number, essence: number, ok = true, unpriced = false
  const notes: string[] = [], perLine = new Set<string>()
  if (!x.id) { cost = x.cost ?? 0; avail = x.avail ?? 0; essence = x.essence ?? 0 }
  else {
    // ratingOf's rating, but none for an unrated item (a formula then notes it; a printed value reads at 1 as before)
    const e = entryOf(x, data), r = x.rating ?? ratingRange(e?.attrs.rating)[0], find = dataFind(data)
    const read = (attr: string) => {
      // (H: the item an add-on is fitted to, its line's own value: a material's `x5` of the ammunition it goes on)
      const v = bookValue(e, attr, r, find, { Q: x.qty, H: host?.[attr as 'cost' | 'avail' | 'essence'] })
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
  const own = { cost, avail, essence }
  for (const a of x.accessories.map(a => fitted(x, a))) {
    const pa = priced(a, data, cr, own), ae = entryOf(a, data)
    // one fitted into the host's Capacity (`[2]`) costs no Essence of its own unless capacityAccessoryEssence (the
    // owner hasn't ruled: CRB pp. 285–286's tables print both; the book's samples print the host's alone, Smooth
    // Operations p. 99's cybereyes 3 with five enhancements: Essence 4.54)
    const ess = capacityUsed(ae, ratingOf(a, ae)) > 0 && !flag(cr, 'capacityAccessoryEssence') ? 0 : pa.essence
    cost += pa.cost; essence += ess; ok &&= pa.ok
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

/** The Magic or Resonance the runner's Essence spending takes off (1 per started point, CRB p. 38): the one figure the
 *  attributes, power points and free spells all lose (essenceBudget's magicLoss). */
export const magicLoss = (b: Sr6Build, data: Sr6Data, cr: CreationRules) => essenceBudget(b, data, cr).magicLoss

/** The spells and rituals, and the complex forms, past the free ones (freeSpellSlots): bought with Karma. */
export function extraMagic(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): { spells: number; forms: number } {
  const free = freeSpellSlots(b, data, cr, p), res = MAGIC_KINDS[b.magic].resonance
  return { spells: Math.max(0, count(b, 'spells', 'rituals') - (res ? 0 : free)), forms: Math.max(0, count(b, 'complexforms') - (res ? free : 0)) }
}

/** Free spells and rituals (complex forms for a technomancer): the method's Magic or Resonance rating (not as adjusted,
 *  but less what Essence took: CRB Hong Kong p. 66) times the setting; a mystic adept first takes off the power points it
 *  bought (CRB pp. 65–66). Point buy buys them with character points instead (R: the Sixth World Companion's method). */
export function freeSpellSlots(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): number {
  const k = MAGIC_KINDS[b.magic]
  if (b.method === 'pointbuy') return k.resonance ? b.cp.complexForms : k.spells ? b.cp.spells : 0
  const rating = Math.max(0, p.magicRating(b) - magicLoss(b, data, cr))
  if (k.resonance) return rating * n0(cr, 'freeFormsPerResonance')
  if (!k.spells) return 0
  return Math.max(0, rating - (k.paysPowers ? b.powerPointsBought : 0)) * n0(cr, 'freeSpellsPerMagic')
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
  const spend = skillSpend(b, cr, p.skillPoints(b))
  let skills = spend.karma * n0(cr, 'karmaSpec')
  for (const sk of b.skills) {
    const top = skillRank(sk)
    for (let i = 0; i < sk.karma; i++) skills += (top - i) * n0(cr, 'karmaSkillPerRank')
  }
  add('skills', 'Skill ranks bought with karma', skills, 'skills')
  // (owner, 2026-10-09) CRB p. 66, step four: the customization karma buys advancement at p. 68's prices, an expertise too
  add('expertise', `${s(spend.expertise, 'expertise')} bought with karma`, spend.expertise * n0(cr, 'advance.expertise'), 'skills')
  add('knowledge', 'Knowledge and language ranks bought with karma', b.knowledge.reduce((t, k) => t + k.karma, 0) * n0(cr, 'karmaKnowledge'), 'skills')
  add('qualityPos', 'Positive qualities', q.pos, 'qualities')
  add('martialArts', 'Martial arts styles and techniques', martialKarma(b, data, cr), 'martial')
  const extra = extraMagic(b, data, cr, p)
  add('spells', 'Spells and rituals past the free ones', extra.spells * n0(cr, 'karmaSpell'), 'magic')
  add('complexForms', 'Complex forms past the free ones', extra.forms * n0(cr, 'karmaForm'), 'magic')
  // R: initiation and submersion can be bought at creation, base + grade × per-grade for each grade
  const grades = (g: number) => { let t = 0; for (let i = 1; i <= g; i++) t += n0(cr, 'karmaInitiationBase') + i * n0(cr, 'karmaInitiationPerGrade'); return t }
  add('initiation', `Initiation grade ${b.initiation}`, grades(b.initiation), 'magic')
  add('submersion', `Submersion grade ${b.submersion}`, grades(b.submersion), 'magic')
  add('metatype', data.metatypes[b.metatype]?.name ?? b.metatype, p.metatypeKarma?.(b) ?? 0, 'method')
  add('magic', MAGIC_KIND_LABELS[b.magic], p.magicKarma?.(b) ?? 0, 'method')
  add('toNuyen', 'Turned into nuyen', toNuyen(b, cr), 'contacts')
  add('contacts', 'Contact ratings past the contact points', contactPoints(b, data, cr, p).karma ?? 0, 'contacts')
  const spent = breakdown.filter(l => l.sign === 'spend').reduce((t, l) => t + l.amount, 0)
  return { ...pool(p.startingKarma() + q.neg, spent), breakdown }
}

/** A SIN's nuyen, at creation and in career alike: a fake one's rating × fakeSinPerRating (a real one comes with its
 *  quality, and a placeholder is real, so free) plus its licences' ratings × licencePerRating. `price` reads a setting. */
export function sinCost(sin: Sr6Sin, price: (key: string) => number): number {
  const own = sin.kind === 'real' ? 0 : (sin.rating ?? 1) * price('fakeSinPerRating')
  return own + (sin.licences.length ? sin.licences.reduce((t, l) => t + l.rating, 0) * price('licencePerRating') : 0)
}

const purchaseName = (x: Sr6Purchase, data: Sr6Data) => { const e = entryOf(x, data); return e ? entryLabel(e) : x.name ?? x.id ?? 'Custom item' }

export function nuyenBudget(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): Budget {
  const breakdown: BudgetLine[] = []
  const add = (key: string, label: string, amount: number, tab: string) => { if (amount) breakdown.push({ key, label, amount: Math.round(amount), sign: 'spend', tab }) }
  for (const x of b.purchases)
    add(`purchase:${x.uid}`, `${purchaseName(x, data)}${x.rating ? ` (rating ${x.rating})` : ''}${x.qty > 1 ? ` × ${x.qty}` : ''}`,
      priced(x, data, cr).cost, PURCHASE_TAB[x.kind])
  for (const sin of b.sins) for (const l of sin.lifestyles ?? []) {
    const e = data.entry('lifestyles', l.id)
    add(`lifestyle:${l.uid}`, `${e?.name ?? l.id} lifestyle × ${s(l.months, 'month')} (${sinName(sin)})`,
      (bookValue(e, 'cost', undefined, dataFind(data)).n ?? 0) * l.months, 'contacts')
  }
  for (const sin of b.sins) {
    const what = sin.placeholder ? 'placeholder' : sin.kind === 'real' ? 'real SIN' : `fake SIN, rating ${sin.rating ?? 1}`
    add(`sin:${sin.uid}`, `${sinName(sin)} (${what})${sin.licences.length ? ` · ${s(sin.licences.length, 'licence')}` : ''}`, sinCost(sin, k => n0(cr, k)), 'contacts')
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
export function powerPoints(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): Sr6Budgets['powerPoints'] {
  // (Magic as Essence leaves it: a point of Magic lost is a power point lost, CRB pp. 38, 156)
  const k = MAGIC_KINDS[b.magic], rating = Math.max(0, attrRating(b, 'mag', p) - magicLoss(b, data, cr))
  const max = !k.powers ? 0 : b.method === 'pointbuy' ? b.cp.powerPoints : k.paysPowers ? b.powerPointsBought : rating
  const spent = round2(b.picks.filter(x => x.kind === 'adeptpowers').reduce((t, x) => {
    const v = data.powers[x.id]
    return t + (v?.cost ?? 0) * (v?.perLevel ? x.level ?? 1 : 1)
  }, 0))
  return { max, spent, left: round2(max - spent), cap: rating }
}

/** Charisma × contactPointsPerCha points for connection and loyalty, each up to Charisma (CRB p. 67). With contactKarma
 *  set, the Sixth World Companion's expanded rules (SWC p. 162): karma buys points past the pool, and a contact's
 *  connection + loyalty past contactPairPerCha × Charisma, one karma a point each; no rating above contactRatingMax. */
export function contactPoints(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): Sr6Budgets['contactPoints'] {
  if (p.contactPoints) return p.contactPoints(b)
  const cha = augmentedRating(b, data, 'cha', p), max = cha * n0(cr, 'contactPointsPerCha'), spend = contactSpend(b), price = num(cr, 'contactKarma')
  if (price === undefined) return { ...pool(max, spend), ratingCap: cha }
  const pair = num(cr, 'contactPairPerCha'), soft = pair === undefined ? Infinity : cha * pair, past = Math.max(0, spend - max)
  const pairs = b.contacts.reduce((t, c) => t + Math.max(0, c.connection + c.loyalty - soft), 0)
  return { ...pool(max, spend - past), ratingCap: num(cr, 'contactRatingMax') ?? cha, karma: (past + pairs) * price }
}

export function knowledgePoints(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): Budget {
  return p.knowledgePoints?.(b) ?? pool(augmentedRating(b, data, 'log', p) * n0(cr, 'knowledgePerLog'), knowledgeSpend(b))
}

/** Skill points spent, and how many specializations (karma) and expertises (expertise) karma buys: the ranks take their
 *  points; a specialization on a skill with skill points takes the points still left, and one they don't cover is bought
 *  with karma (CRB p.66: a specialization costs a skill rank; p.68: or 5 karma), as is one on a skill with only karma
 *  ranks. An expertise is bought with the customization karma at its advancement price (owner, 2026-10-09: CRB p. 65's
 *  "you cannot acquire an expertise" is the priority skill points'; step four, p. 66, buys advancement at p. 68's
 *  prices), unless the table gives it skill points (skillPointsExpertise), which it then takes as a specialization does. */
export function skillSpend(b: Sr6Build, cr: CreationRules, pool: number): { points: number; karma: number; expertise: number } {
  let points = b.skills.reduce((t, sk) => t + sk.points, 0), karma = 0, expertise = 0
  const take = (on: boolean, cost: number) => {
    if (on && (cost === 0 || points + cost <= pool)) { points += cost; return true }
    return false
  }
  const expPoints = num(cr, 'skillPointsExpertise')
  for (const sk of b.skills) {
    if (sk.spec && !take(sk.points > 0, n0(cr, 'skillPointsSpec'))) karma++
    if (sk.expertise && (expPoints === undefined || !take(sk.points > 0, expPoints))) expertise++
  }
  return { points, karma, expertise }
}

/** Every budget, as the editor's budget panel shows them. */
export function allBudgets(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): Sr6Budgets {
  const spend = (pool_: 'points' | 'adjust') => SR6_ATTRS.reduce((t, k) => t + b.attributes[k][pool_], 0)
  const k = MAGIC_KINDS[b.magic], slots = freeSpellSlots(b, data, cr, p)
  const cp = p.characterPoints?.(b)
  return {
    attributePoints: pool(p.attributePoints(b), spend('points')),
    adjustmentPoints: pool(p.adjustmentPoints(b), spend('adjust')),
    skillPoints: pool(p.skillPoints(b), skillSpend(b, cr, p.skillPoints(b)).points),
    karma: karmaBudget(b, data, cr, p),
    nuyen: nuyenBudget(b, data, cr, p),
    essence: essenceBudget(b, data, cr),
    powerPoints: powerPoints(b, data, cr, p),
    spellSlots: pool(slots, k.resonance ? count(b, 'complexforms') : count(b, 'spells', 'rituals')),
    contactPoints: contactPoints(b, data, cr, p),
    knowledgePoints: knowledgePoints(b, data, cr, p),
    ...(cp ? { characterPoints: cp } : {}),
  }
}
