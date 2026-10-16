// The karma budget: qualities, karma ranks, magic, contacts and the karma turned into nuyen.
import { MAGIC_KIND_LABELS, SR6_ATTRS, type Sr6Build, type Sr6Quality } from '../model/character'
import { flag, n0, num, str, type CreationRules } from './creation'
import type { Sr6Data, Sr6QualityView } from './data'
import { pool, type Budget, type BudgetLine, type Provider } from './providers'
import { rated } from './values'
import { martialKarma } from './martial'
import { entryOf, isFocus, ratingOf } from './purchases'
import { attrRating } from './attributes'
import { skillRank, skillSpend } from './skills'
import { dataStructureLevels, extraMagic } from './magic'
import { contactPoints } from './contacts'
import { boughtKind, freePick, infectedFit, infectedOf, priceAwakened } from './infected'

/** One quality's karma before positiveQualityFactor: |karma| × level, or, for one priced in a range, the karma it was
 *  taken for (kept within the range; the lowest when it isn't set). */
export function qualityCost(q: Sr6Quality, v: Sr6QualityView): number {
  // (a price line listing its prices, `7 or 12 Karma`: one of them, the highest at or below the karma it was taken for)
  const steps = v.karmaSteps?.map(Math.abs).sort((a, b) => a - b)
  const lo = Math.abs(v.karma ?? 0),
    each = steps?.length
      ? q.karma == null
        ? steps[0]
        : ([...steps].reverse().find(k => k <= q.karma!) ?? steps[0])
      : v.karmaMax != null && q.karma != null
        ? Math.min(Math.abs(v.karmaMax), Math.max(lo, q.karma))
        : lo
  return each * (v.perLevel ? q.level : 1)
}

/** One quality line's karma on this runner: qualityCost, or its Awakened price (<karmaif>: infected.ts priceAwakened),
 *  or the non-human vampire's (<infectedalt> karma, p. 109) a level; less one level for the Infected free pick (p. 105). */
export function qualityPrice(b: Sr6Build, data: Sr6Data, q: Sr6Quality, v: Sr6QualityView): number {
  const t = infectedOf(data.entry('qualities', q.id)),
    per = v.perLevel ? q.level : 1
  const unit =
    t?.alt && infectedFit(data, b.metatype, t) === 'alt' ? t.alt.karma : v.karmaIf && priceAwakened(b, data, q.id) ? Math.abs(v.karmaIf.value) : undefined
  const total = unit === undefined ? qualityCost(q, v) : unit * per
  return freePick(b, data) === q ? total - (unit ?? qualityCost({ ...q, level: 1 }, v)) : total
}

/** Karma from qualities: positive ones cost qualityPrice (× positiveQualityFactor), negative ones give it; free traits and
 *  qualities gone from the catalog count nothing. */
export function qualityKarma(b: Sr6Build, data: Sr6Data, cr: CreationRules): { pos: number; neg: number } {
  let pos = 0,
    neg = 0
  for (const q of b.qualities) {
    const v = data.qualities[q.id]
    if (q.free || !v) continue
    const total = qualityPrice(b, data, q, v)
    if (v.positive) pos += total * (num(cr, 'positiveQualityFactor') ?? 1)
    else neg += total
  }
  return { pos, neg }
}

/** Nuyen a karma turns into at creation (CRB Hong Kong p. 66: In Debt's own rate with that quality), both ways: turning
 *  nuyen back into karma only undoes a conversion, at the same rate. Unset: undefined. */
export function nuyenPerKarma(b: Sr6Build, cr: CreationRules, data?: Sr6Data): number | undefined {
  const debt = str(cr, 'inDebtQuality'),
    inDebt = !!debt && b.qualities.some(q => (data ? data.sameFamily('qualities', q.id, debt) : q.id === debt))
  return num(cr, inDebt ? 'karmaToNuyenRateInDebt' : 'karmaToNuyenRate')
}
/** Karma turned into nuyen, up to karmaToNuyenMax when it's set. */
export const toNuyen = (b: Sr6Build, cr: CreationRules) => Math.max(0, Math.min(b.karmaToNuyen, num(cr, 'karmaToNuyenMax') ?? Infinity))
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
    const ranks = b.attributes[k].karma,
      to = attrRating(b, k, p)
    let cost = 0
    for (let i = 0; i < ranks; i++) cost += (to - i) * perRank
    add(`attr:${k}`, `${k.toUpperCase()} ${to - ranks} → ${to} (${s(ranks, 'rank')} by karma)`, cost, 'attributes')
  }
  const spend = skillSpend(b, cr, p.skillPoints(b), data)
  let skills = spend.karma * n0(cr, 'karmaSpec')
  for (const sk of b.skills) {
    const top = skillRank(sk)
    for (let i = 0; i < sk.karma; i++) skills += (top - i) * n0(cr, 'karmaSkillPerRank')
  }
  add('skills', 'Skill ranks bought with karma', skills, 'skills')
  // (owner, 2026-10-09) CRB p. 66, step four: the customization karma buys advancement at p. 68's prices, an expertise too
  add('expertise', `${s(spend.expertise, 'expertise')} bought with karma`, spend.expertise * n0(cr, 'advance.expertise'), 'skills')
  // CRB Hong Kong p. 154: a focus is used only once bonded, for the Karma the Magical Goods table gives (p. 168; its
  // catalog `karma`, by Force: the line's rating), when fociBondKarma is on
  if (flag(cr, 'fociBondKarma'))
    add(
      'foci',
      'Foci bonded',
      b.purchases
        .filter(x => isFocus(entryOf(x, data)))
        .reduce((t, x) => t + (rated(entryOf(x, data)?.attrs.karma, ratingOf(x, entryOf(x, data))).n ?? 0) * x.qty, 0),
      'gear',
    )
  add('knowledge', 'Knowledge and language ranks bought with karma', b.knowledge.reduce((t, k) => t + k.karma, 0) * n0(cr, 'karmaKnowledge'), 'skills')
  add('qualityPos', 'Positive qualities', q.pos, 'qualities')
  add('martialArts', 'Martial arts styles and techniques', martialKarma(b, data, cr), 'martial')
  const extra = extraMagic(b, data, cr, p)
  add('spells', 'Spells and rituals past the free ones', extra.spells * n0(cr, 'karmaSpell'), 'magic')
  add('complexForms', 'Complex forms past the free ones', extra.forms * n0(cr, 'karmaForm'), 'magic')
  // R: initiation and submersion can be bought at creation, base + grade × per-grade for each grade
  const grades = (g: number) => {
    let t = 0
    for (let i = 1; i <= g; i++) t += n0(cr, 'karmaInitiationBase') + i * n0(cr, 'karmaInitiationPerGrade')
    return t
  }
  add('initiation', `Initiation grade ${b.initiation}`, grades(b.initiation), 'magic')
  add('submersion', `Submersion grade ${b.submersion}`, grades(b.submersion), 'magic')
  // the Sixth World Companion's Transhumanism (p. 146): 10 + the next grade, the initiation price, for a mundane's transhumanist grades
  if (flag(cr, 'transhumanism') && b.transhuman > 0) add('transhuman', `Transhumanist grade ${b.transhuman}`, grades(b.transhuman), 'gear')
  // Hack & Slash p. 71: a data structure is integrated for Karma equal to its level
  add('dataStructures', 'Data structures integrated', dataStructureLevels(b), 'magic')
  add('metatype', data.metatypes[b.metatype]?.name ?? b.metatype, p.metatypeKarma?.(b) ?? 0, 'method')
  add('magic', MAGIC_KIND_LABELS[boughtKind(b)], p.magicKarma?.(b) ?? 0, 'method')
  add('toNuyen', 'Turned into nuyen', toNuyen(b, cr), 'contacts')
  add('contacts', 'Contact ratings past the contact points', contactPoints(b, data, cr, p).karma ?? 0, 'contacts')
  const spent = breakdown.filter(l => l.sign === 'spend').reduce((t, l) => t + l.amount, 0)
  return { ...pool(p.startingKarma() + q.neg, spent), breakdown }
}
