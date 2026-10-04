// Budget providers, one per creation method (a port of SR6 Forge's providers.mjs): where each method's attribute, skill,
// adjustment and nuyen budgets, legal metatypes and magic kinds come from. Table values come from the catalog
// (Sr6Data: priority rows, life modules), prose numbers from the creation rules (num(cr, …)); an unset setting counts 0
// for its pool (rules.ts warns about it), nothing is guessed here.
import { SR6_ATTRS, type MagicKind, type Sr6Attr, type Sr6Build, type Sr6Method } from '../model/character'
import { num, type CreationRules } from './creation'
import { MAGIC_KINDS, type Grant, type Sr6Data, type Sr6LifeModuleView, type Sr6MetatypeView } from './data'

export interface Pool { max: number; spent: number; left: number }
export interface Provider {
  id: Sr6Method
  lettersValid(p: Sr6Build['priorities']): boolean
  attributePoints(b: Sr6Build): number
  skillPoints(b: Sr6Build): number
  adjustmentPoints(b: Sr6Build): number
  nuyen(b: Sr6Build): number
  /** the karma the runner starts with (startingKarma, or the karma build's own pool) */
  startingKarma(): number
  legalMetatypes(b: Sr6Build): { id: string; name: string; adjustmentPoints: number }[]
  /** cp: point buy's price of the kind in character points */
  legalMagic(b: Sr6Build): { kind: MagicKind; rating: number; cp?: number }[]
  /** the rating the method gives the runner's magic kind (the priority table's, before any spends); 0 for mundane */
  magicRating(b: Sr6Build): number
  /** karma the metatype costs (point buy, karma build) */
  metatypeKarma?(b: Sr6Build): number
  /** karma the magic kind costs (karma build) */
  magicKarma?(b: Sr6Build): number
  /** point buy's character points */
  characterPoints?(b: Sr6Build): Pool
  /** lifepath's contact points (from the modules, not Charisma, each module's for its contact types); karma: what the
   *  contact ratings the points don't cover cost (spent then counts only the covered ones) */
  contactPoints?(b: Sr6Build): Pool & { ratingCap: number; karma?: number }
  /** lifepath: what the method adds to an attribute's natural rating (the best attribute and its overflow) */
  attributeBonus?(b: Sr6Build, k: Sr6Attr): number
  /** lifepath's knowledge points (from the modules, not Logic) */
  knowledgePoints?(b: Sr6Build): Pool
  /** lifepath's adult modules this runner may take, taken ones marked; again: taken once and may be taken a second time */
  available?(b: Sr6Build): (Sr6LifeModuleView & { taken: boolean; again: boolean })[]
}

const KINDS = Object.keys(MAGIC_KINDS) as MagicKind[]
const ATTRS = new Set<string>(SR6_ATTRS)
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)
export const pool = (max: number, spent: number): Pool => ({ max, spent, left: max - spent })
export const contactSpend = (b: Sr6Build) => b.contacts.reduce((n, c) => n + c.connection + c.loyalty, 0)
export const knowledgeSpend = (b: Sr6Build) => b.knowledge.filter(k => !k.native).reduce((n, k) => n + k.points, 0)
const awakened = (k: MagicKind) => k !== 'mundane'

/** The contact points no pool can cover: contacts take from the pools of a type they have (a pool with no types: any),
 *  so the most the pools cover is a max flow; by Hall's condition its shortfall is the largest, over every set U of the
 *  contacts' types, of what the contacts typed within U need minus what the pools touching U (or any type) hold.
 *  ponytail: 2^(types on contacts) sets, at most 1024 with the ten types. */
export function uncovered(pools: { types?: string[]; points: number }[], contacts: { types: string[]; need: number }[]): number {
  const all = [...new Set(contacts.flatMap(c => c.types))]
  let short = 0
  for (let mask = 0; mask < 1 << all.length; mask++) {
    const u = new Set(all.filter((_, i) => mask & (1 << i)))
    const need = contacts.filter(c => c.types.every(t => u.has(t))).reduce((s, c) => s + c.need, 0)
    const have = pools.filter(p => !p.types?.length || p.types.some(t => u.has(t))).reduce((s, p) => s + p.points, 0)
    short = Math.max(short, need - have)
  }
  return short
}

export function makeProvider(method: Sr6Method, data: Sr6Data, cr: CreationRules): Provider {
  const n = (key: string) => num(cr, key) ?? 0
  const everyMetatype = (adjustmentPoints: number) =>
    Object.values(data.metatypes).map(m => ({ id: m.id, name: m.name, adjustmentPoints })).sort(byName)
  /** every kind legal, at the rating `rating` gives it */
  const everyKind = (rating: (k: MagicKind) => number) => KINDS.map(kind => ({ kind, rating: rating(kind) }))
  const base = { id: method, startingKarma: () => n('startingKarma') }

  if (method === 'priority' || method === 'sumtoten') {
    const row = (b: Sr6Build, col: keyof Sr6Build['priorities']) => { const l = b.priorities[col]; return l ? data.priorities[l] : undefined }
    const magicRow = (b: Sr6Build) => row(b, 'magic')?.magic ?? {}
    return {
      ...base,
      lettersValid: method === 'priority'
        ? p => { const ls = Object.values(p).filter(Boolean); return ls.length === 5 && new Set(ls).size === 5 }
        : p => {
          const target = num(cr, 'sumToTenTarget')
          const vals = Object.values(p).map(l => (l ? num(cr, `letterValue:${l}`) : undefined))
          return target !== undefined && !vals.includes(undefined) && vals.reduce<number>((s, v) => s + v!, 0) <= target
        },
      attributePoints: b => row(b, 'attributes')?.attributes ?? 0,
      skillPoints: b => row(b, 'skills')?.skills ?? 0,
      nuyen: b => row(b, 'resources')?.nuyen ?? 0,
      // no metavariants (R: the S1 metatype format has none)
      adjustmentPoints: b => (b.metatype && row(b, 'metatype')?.metatypes[b.metatype]) || 0,
      legalMetatypes: b => {
        const r = row(b, 'metatype')
        return r ? Object.values(data.metatypes).filter(m => m.id in r.metatypes)
          .map(m => ({ id: m.id, name: m.name, adjustmentPoints: r.metatypes[m.id] })).sort(byName) : []
      },
      legalMagic: b => { const by = magicRow(b); return KINDS.filter(k => k in by || k === 'mundane').map(kind => ({ kind, rating: by[kind] ?? 0 })) },
      magicRating: b => magicRow(b)[b.magic] ?? 0,
    }
  }

  if (method === 'pointbuy') {
    const start = (k: MagicKind) => (awakened(k) ? n(`pointBuy.startRating:${k}`) : 0)
    return {
      ...base,
      lettersValid: () => true,
      attributePoints: b => n('pointBuy.free.attribute') + b.cp.attribute,
      skillPoints: b => n('pointBuy.free.skill') + b.cp.skill,
      adjustmentPoints: b => n('pointBuy.free.adjustment') + b.cp.adjustment,
      nuyen: b => n('pointBuy.free.nuyen') + b.cp.resources * n('pointBuy.nuyenPerCp'),
      // the metatype costs no character points; its karma comes out of the starting karma
      legalMetatypes: () => everyMetatype(n('pointBuy.free.adjustment')),
      legalMagic: () => KINDS.map(kind => ({ kind, rating: start(kind), cp: awakened(kind) ? n('pointBuy.awakened') : 0 })),
      magicRating: b => start(b.magic),
      metatypeKarma: b => (b.metatype ? n(`metatypeKarma:${b.metatype}`) : 0),
      characterPoints: b => {
        const c = b.cp, cost = (k: string) => n(`pointBuy.cost.${k}`)
        const pp = cost(MAGIC_KINDS[b.magic].paysPowers ? 'mysticPowerPoint' : 'powerPoint')
        return pool(n('pointBuy.total'), (awakened(b.magic) ? n('pointBuy.awakened') : 0) + c.attribute * cost('attribute')
          + c.skill * cost('skill') + c.adjustment * cost('adjustment') + c.resources + c.powerPoints * pp
          + c.spells * cost('spell') + c.complexForms * cost('complexForm'))
      },
    }
  }

  if (method === 'karma') {
    const start = (k: MagicKind) => (awakened(k) ? n('karmaBuild.startRating') : 0)
    return {
      ...base,
      lettersValid: () => true,
      // everything is bought with karma: no point pools, nuyen only from karma
      attributePoints: () => 0, skillPoints: () => 0, adjustmentPoints: () => 0, nuyen: () => 0,
      startingKarma: () => n('karmaBuild.start'),
      legalMetatypes: () => everyMetatype(0),
      legalMagic: () => everyKind(start),
      magicRating: b => start(b.magic),
      metatypeKarma: b => (b.metatype ? n(`metatypeKarma:${b.metatype}`) : 0),
      magicKarma: b => (awakened(b.magic) ? n(`magicKarma:${b.magic}`) : 0),
    }
  }

  // lifepath: the opening modules are fixed (R: the catalog's stage="opening" ones), the adult ones are picked (as many
  // of them twice as lifepath.repeatModules allows)
  const opening = Object.values(data.lifemodules).filter(m => m.stage === 'opening')
  const modules = (b: Sr6Build) => [...opening, ...b.lifepath.map(pk => data.lifemodules[pk.id]).filter(Boolean)]
  const sum = (b: Sr6Build, field: Grant | 'knowledgeSkills') => {
    let v = opening.reduce((s, m) => s + (m.grants[field] ?? 0), 0)
    for (const pick of b.lifepath) {
      const m = data.lifemodules[pick.id]
      if (!m) continue
      v += m.grants[field] ?? 0
      // a mixed choice is worth its points only once the player has said which pool it lands in
      m.choices.forEach((c, i) => {
        const o = pick.choices[i]
        if (!o) return
        if (o.startsWith('nuyen:')) { if (field === 'nuyen') v += Number(o.slice(6)) || 0 }
        else if (ATTRS.has(o)) { if (field === 'attributePoints') v += c.points }
        else if (o.startsWith('skill:') && field === 'skillPoints') v += c.points
      })
    }
    return v
  }
  const start = (k: MagicKind) => (awakened(k) ? n(`lifepath.startRating:${k}`) : 0)
  const allows = (k: MagicKind, req?: string) => {
    const f = MAGIC_KINDS[k]
    return !req || (req === 'awakened' ? f.spells || f.powers : req === 'emerged' ? f.resonance
      : req === 'adept' ? f.powers : req === 'magician' ? f.spells : true)
  }
  /** the best attribute rises by lifepath.bestAttributeBonus up to its metatype maximum; what that leaves over goes on
   *  bestExtra */
  const best = (b: Sr6Build) => {
    const bonus = n('lifepath.bestAttributeBonus'), m = data.metatypes[b.metatype]
    const max = b.bestAttr && m && b.bestAttr in m.ranges ? m.ranges[b.bestAttr as keyof Sr6MetatypeView['ranges']][1] : Infinity
    const up = b.bestAttr ? Math.max(0, Math.min(bonus, max - 1)) : 0
    return { up, over: b.bestAttr ? bonus - up : 0 }
  }
  return {
    ...base,
    lettersValid: () => true,
    attributeBonus: (b, k) => (k === b.bestAttr ? best(b).up : 0) + (k === b.bestExtra && b.bestExtra !== b.bestAttr ? best(b).over : 0),
    metatypeKarma: b => (b.metatype ? n(`metatypeKarma:${b.metatype}`) : 0),
    attributePoints: b => sum(b, 'attributePoints'),
    skillPoints: b => sum(b, 'skillPoints'),
    adjustmentPoints: b => sum(b, 'adjustmentPoints'),
    nuyen: b => sum(b, 'nuyen'),
    legalMetatypes: () => everyMetatype(0),
    legalMagic: () => everyKind(start),
    magicRating: b => start(b.magic),
    contactPoints: b => {
      const pools = modules(b).filter(m => m.grants.contactPoints).map(m => ({ types: m.contactTypes, points: m.grants.contactPoints! }))
      const max = pools.reduce((s, x) => s + x.points, 0), need = contactSpend(b)
      const short = uncovered(pools, b.contacts.map(c => ({ types: c.types ?? [], need: c.connection + c.loyalty })))
      const price = num(cr, 'lifepath.contactKarma'), ratingCap = n('lifepath.contactRatingCap')
      // unset price: the ratings the points don't cover aren't bought, they overspend the points
      return price === undefined ? { ...pool(max, need), ratingCap } : { ...pool(max, need - short), ratingCap, karma: short * price }
    },
    knowledgePoints: b => pool(sum(b, 'knowledgeSkills'), knowledgeSpend(b)),
    available: b => {
      const times = (id: string) => b.lifepath.filter(m => m.id === id).length
      const twice = new Set(b.lifepath.map(m => m.id).filter(id => times(id) > 1)).size
      return Object.values(data.lifemodules).filter(m => m.stage === 'adult' && allows(b.magic, m.requires))
        .map(m => ({ ...m, taken: times(m.id) > 0, again: times(m.id) === 1 && twice < n('lifepath.repeatModules') })).sort(byName)
    },
  }
}
