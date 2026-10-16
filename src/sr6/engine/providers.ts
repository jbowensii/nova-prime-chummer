// Budget providers, one per creation method (a port of SR6 Forge's providers.mjs): where each method's attribute, skill,
// adjustment and nuyen budgets, legal metatypes and magic kinds come from. Table values come from the catalog
// (Sr6Data: priority rows, life modules), prose numbers from the creation rules (num(cr, …)); an unset setting counts 0
// for its pool (rules.ts warns about it), nothing is guessed here.
import { LETTERS, SR6_ATTRS, type Letter, type MagicKind, type Sr6Attr, type Sr6Build, type Sr6Method } from '../model/character'
import { flag, num, str, type CreationRules } from './creation'
import { MAGIC_KINDS, type Grant, type Sr6Data, type Sr6LifeModuleView, type Sr6MetatypeView } from './data'
import { boughtKind, infectedMagic } from './infected'

export interface Pool {
  max: number
  spent: number
  left: number
}
/** One line of a budget: what took (spend) or gave (gain) how much, and the editor tab it's made on. */
export interface BudgetLine {
  key: string
  label: string
  amount: number
  sign: 'spend' | 'gain'
  tab: string
}
export interface Budget extends Pool {
  breakdown?: BudgetLine[]
}
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
  /** lifepath: what an attribute starts at above 1 (Born This Way: a raised metatype maximum, a mundane's Edge) */
  startBonus?(b: Sr6Build, k: Sr6Attr): number
  /** lifepath: each module's contact points with the contact types they go to (none: any) */
  contactPools?(b: Sr6Build): { types?: string[]; points: number }[]
  /** lifepath's knowledge points (from the modules, not Logic) */
  knowledgePoints?(b: Sr6Build): Pool
  /** lifepath's adult modules, taken ones marked; again: taken once and may be taken a second time; fits: the runner's
   *  magic kind is the one the module requires (one that isn't may still be taken: Review's lifepath.requires) */
  available?(b: Sr6Build): (Sr6LifeModuleView & { taken: boolean; again: boolean; fits: boolean })[]
}

const KINDS = Object.keys(MAGIC_KINDS) as MagicKind[]
const ATTRS = new Set<string>(SR6_ATTRS)
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)
export const pool = (max: number, spent: number): Pool => ({ max, spent, left: max - spent })
export const contactSpend = (b: Sr6Build) => b.contacts.reduce((n, c) => n + c.connection + c.loyalty, 0)
export const knowledgeSpend = (b: Sr6Build) => b.knowledge.filter(k => !k.native).reduce((n, k) => n + k.points, 0)
/** awakened or emerged (any kind but mundane): the method's Magic or Resonance, its price and the mundane's Edge are
 *  for either; Awakened alone (a technomancer is not) is data.ts awakenedKind. Each reads the kind the method bought,
 *  never the one an Infected type gave (infected.ts boughtKind). */
const gifted = (k: MagicKind) => k !== 'mundane'

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
  const p = methodProvider(method, data, cr)
  // the Sixth World Companion's Infected (p. 106): a Strain II or III type's Magic, 1 or 1 less, on top of the method's
  return { ...p, startBonus: (b, k) => (p.startBonus?.(b, k) ?? 0) + (k === 'mag' ? infectedMagic(b, data) : 0) }
}

function methodProvider(method: Sr6Method, data: Sr6Data, cr: CreationRules): Provider {
  const n = (key: string) => num(cr, key) ?? 0
  const everyMetatype = (adjustmentPoints: number) =>
    Object.values(data.metatypes)
      .map(m => ({ id: m.id, name: m.name, adjustmentPoints }))
      .sort(byName)
  /** every kind legal, at the rating `rating` gives it */
  const everyKind = (rating: (k: MagicKind) => number) => KINDS.map(kind => ({ kind, rating: rating(kind) }))
  // CRB Hong Kong p. 63: a prime runner has twice the customization Karma (levelPrime)
  // (the Sixth World Companion's Twenty Questions, p. 25: a karma bonus at character generation)
  const base = {
    id: method,
    startingKarma: () => n('startingKarma') * (flag(cr, 'levelPrime') ? 2 : 1) + (flag(cr, 'twentyQuestions') ? n('twentyQuestionsKarma') : 0),
  }

  if (method === 'priority' || method === 'sumtoten') {
    // CRB Hong Kong p. 63: a street-level runner gets the values of the row below the one chosen, E staying E (levelStreet)
    const at = (l: Letter) => (flag(cr, 'levelStreet') ? LETTERS[Math.min(LETTERS.indexOf(l) + 1, LETTERS.length - 1)] : l)
    const row = (b: Sr6Build, col: keyof Sr6Build['priorities']) => {
      const l = b.priorities[col]
      return l ? data.priorities[at(l)] : undefined
    }
    const letterPoints = (b: Sr6Build, m?: Sr6MetatypeView) => {
      const l = b.priorities.metatype
      return l && m?.priority ? m.priority[at(l)] : undefined
    }
    // the letters the runner takes (priorityLetters, a level of play's: the Sixth World Companion's street-level B C C D E)
    const want = (str(cr, 'priorityLetters') ?? LETTERS.join('')).split('').sort().join('')
    const magicRow = (b: Sr6Build) => row(b, 'magic')?.magic ?? {}
    return {
      ...base,
      lettersValid:
        method === 'priority'
          ? p => {
              const ls = Object.values(p).filter(Boolean)
              return ls.length === 5 && ls.sort().join('') === want
            }
          : p => {
              // (sum to ten takes any letters the level allows: street-level's no A)
              const target = num(cr, 'sumToTenTarget')
              const vals = Object.values(p).map(l => (l && want.includes(l) ? num(cr, `letterValue:${l}`) : undefined))
              return target !== undefined && !vals.includes(undefined) && vals.reduce<number>((s, v) => s + v!, 0) <= target
            },
      attributePoints: b => row(b, 'attributes')?.attributes ?? 0,
      skillPoints: b => row(b, 'skills')?.skills ?? 0,
      nuyen: b => row(b, 'resources')?.nuyen ?? 0,
      // a metatype the table's row lists, else a metavariant at its own points for that letter (SWC's development table)
      adjustmentPoints: b => (b.metatype && (row(b, 'metatype')?.metatypes[b.metatype] ?? letterPoints(b, data.metatypes[b.metatype]))) || 0,
      legalMetatypes: b => {
        const r = row(b, 'metatype')
        return r
          ? Object.values(data.metatypes)
              .filter(m => m.id in r.metatypes || letterPoints(b, m) !== undefined)
              .map(m => ({ id: m.id, name: m.name, adjustmentPoints: r.metatypes[m.id] ?? letterPoints(b, m)! }))
              .sort(byName)
          : []
      },
      // a metavariant (one the table's row doesn't list) costs its karma out of the starting karma (SWC p. 91)
      metatypeKarma: b => (b.metatype && row(b, 'metatype')?.metatypes[b.metatype] === undefined ? n(`metatypeKarma:${b.metatype}`) : 0),
      legalMagic: b => {
        const by = magicRow(b)
        return KINDS.filter(k => k in by || k === 'mundane').map(kind => ({ kind, rating: by[kind] ?? 0 }))
      },
      magicRating: b => magicRow(b)[boughtKind(b)] ?? 0,
    }
  }

  if (method === 'pointbuy') {
    const start = (k: MagicKind) => (gifted(k) ? n(`pointBuy.startRating:${k}`) : 0)
    return {
      ...base,
      lettersValid: () => true,
      attributePoints: b => n('pointBuy.free.attribute') + b.cp.attribute,
      skillPoints: b => n('pointBuy.free.skill') + b.cp.skill,
      adjustmentPoints: b => n('pointBuy.free.adjustment') + b.cp.adjustment,
      nuyen: b => n('pointBuy.free.nuyen') + b.cp.resources * n('pointBuy.nuyenPerCp'),
      // the metatype costs no character points; its karma comes out of the starting karma
      legalMetatypes: () => everyMetatype(n('pointBuy.free.adjustment')),
      legalMagic: () => KINDS.map(kind => ({ kind, rating: start(kind), cp: gifted(kind) ? n('pointBuy.awakened') : 0 })),
      magicRating: b => start(boughtKind(b)),
      metatypeKarma: b => (b.metatype ? n(`metatypeKarma:${b.metatype}`) : 0),
      characterPoints: b => {
        const c = b.cp,
          cost = (k: string) => n(`pointBuy.cost.${k}`)
        const pp = cost(MAGIC_KINDS[b.magic].paysPowers ? 'mysticPowerPoint' : 'powerPoint')
        return pool(
          n('pointBuy.total'),
          (gifted(boughtKind(b)) ? n('pointBuy.awakened') : 0) +
            c.attribute * cost('attribute') +
            c.skill * cost('skill') +
            c.adjustment * cost('adjustment') +
            c.resources +
            c.powerPoints * pp +
            c.spells * cost('spell') +
            c.complexForms * cost('complexForm'),
        )
      },
    }
  }

  if (method === 'karma') {
    const start = (k: MagicKind) => (gifted(k) ? n('karmaBuild.startRating') : 0)
    return {
      ...base,
      lettersValid: () => true,
      // everything is bought with karma: no point pools, nuyen only from karma
      attributePoints: () => 0,
      skillPoints: () => 0,
      adjustmentPoints: () => 0,
      nuyen: () => 0,
      startingKarma: () => n('karmaBuild.start'),
      legalMetatypes: () => everyMetatype(0),
      legalMagic: () => everyKind(start),
      magicRating: b => start(boughtKind(b)),
      metatypeKarma: b => (b.metatype ? n(`metatypeKarma:${b.metatype}`) : 0),
      magicKarma: b => (gifted(boughtKind(b)) ? n(`magicKarma:${boughtKind(b)}`) : 0),
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
        if (o.startsWith('nuyen:')) {
          if (field === 'nuyen') v += Number(o.slice(6)) || 0
        } else if (ATTRS.has(o)) {
          if (field === 'attributePoints') v += c.points
        } else if (o.startsWith('skill:') && field === 'skillPoints') v += c.points
      })
    }
    return v
  }
  const start = (k: MagicKind) => (gifted(k) ? n(`lifepath.startRating:${k}`) : 0)
  const contactPools = (b: Sr6Build) =>
    modules(b)
      .filter(m => m.grants.contactPoints)
      .map(m => ({ types: m.contactTypes, points: m.grants.contactPoints! }))
  const allows = (k: MagicKind, req?: string) => {
    const f = MAGIC_KINDS[k]
    return (
      !req || (req === 'awakened' ? f.spells || f.powers : req === 'emerged' ? f.resonance : req === 'adept' ? f.powers : req === 'magician' ? f.spells : true)
    )
  }
  /** SWC p. 32 (Born This Way): an attribute whose metatype maximum is above attributeBaseMax starts at
   *  lifepath.raisedAttributeStart, the others at 1; a runner neither awakened nor emerged gains lifepath.mundaneEdge */
  const startBonus = (b: Sr6Build, k: Sr6Attr) => {
    const m = data.metatypes[b.metatype],
      cap = num(cr, 'attributeBaseMax'),
      raised = num(cr, 'lifepath.raisedAttributeStart')
    const max = m && k in m.ranges ? m.ranges[k as keyof Sr6MetatypeView['ranges']][1] : 0
    return (raised !== undefined && cap !== undefined && max > cap ? raised - 1 : 0) + (k === 'edg' && !gifted(boughtKind(b)) ? n('lifepath.mundaneEdge') : 0)
  }
  /** the best attribute rises by lifepath.bestAttributeBonus up to its metatype maximum; what that leaves over goes on
   *  bestExtra */
  const best = (b: Sr6Build) => {
    const bonus = n('lifepath.bestAttributeBonus'),
      m = data.metatypes[b.metatype]
    const max = b.bestAttr && m && b.bestAttr in m.ranges ? m.ranges[b.bestAttr as keyof Sr6MetatypeView['ranges']][1] : Infinity
    const up = b.bestAttr ? Math.max(0, Math.min(bonus, max - 1 - startBonus(b, b.bestAttr))) : 0
    return { up, over: b.bestAttr ? bonus - up : 0 }
  }
  return {
    ...base,
    lettersValid: () => true,
    attributeBonus: (b, k) => (k === b.bestAttr ? best(b).up : 0) + (k === b.bestExtra && b.bestExtra !== b.bestAttr ? best(b).over : 0),
    startBonus,
    metatypeKarma: b => (b.metatype ? n(`metatypeKarma:${b.metatype}`) : 0),
    attributePoints: b => sum(b, 'attributePoints'),
    skillPoints: b => sum(b, 'skillPoints'),
    adjustmentPoints: b => sum(b, 'adjustmentPoints'),
    nuyen: b => sum(b, 'nuyen'),
    legalMetatypes: () => everyMetatype(0),
    legalMagic: () => everyKind(start),
    magicRating: b => start(boughtKind(b)),
    contactPools,
    contactPoints: b => {
      const pools = contactPools(b)
      const max = pools.reduce((s, x) => s + x.points, 0),
        need = contactSpend(b)
      const short = uncovered(
        pools,
        b.contacts.map(c => ({ types: c.types ?? [], need: c.connection + c.loyalty })),
      )
      const price = num(cr, 'lifepath.contactKarma'),
        ratingCap = n('lifepath.contactRatingCap')
      // unset price: the ratings the points don't cover aren't bought, they overspend the points
      return price === undefined ? { ...pool(max, need), ratingCap } : { ...pool(max, need - short), ratingCap, karma: short * price }
    },
    knowledgePoints: b => pool(sum(b, 'knowledgeSkills'), knowledgeSpend(b)),
    available: b => {
      const times = (id: string) => b.lifepath.filter(m => m.id === id).length
      const twice = new Set(b.lifepath.map(m => m.id).filter(id => times(id) > 1)).size
      return Object.values(data.lifemodules)
        .filter(m => m.stage === 'adult')
        .map(m => ({ ...m, taken: times(m.id) > 0, again: times(m.id) === 1 && twice < n('lifepath.repeatModules'), fits: allows(b.magic, m.requires) }))
        .sort(byName)
    },
  }
}
