// Budget providers, one per creation method (a port of SR6 Forge's providers.mjs): where each method's attribute, skill,
// adjustment and nuyen budgets, legal metatypes and magic kinds come from. Table values come from the catalog
// (Sr6Data: priority rows, life modules), prose numbers from the creation rules (num(cr, …)); an unset setting counts 0
// for its pool (rules.ts warns about it), nothing is guessed here.
import { SR6_ATTRS, type MagicKind, type Sr6Build, type Sr6Method } from '../model/character'
import { num, type CreationRules } from './creation'
import { MAGIC_KINDS, type Grant, type Sr6Data, type Sr6LifeModuleView } from './data'

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
  /** lifepath's contact points (from the modules, not Charisma) */
  contactPoints?(b: Sr6Build): Pool & { ratingCap: number }
  /** lifepath's knowledge points (from the modules, not Logic) */
  knowledgePoints?(b: Sr6Build): Pool
  /** lifepath's adult modules this runner may take, taken ones marked */
  available?(b: Sr6Build): (Sr6LifeModuleView & { taken: boolean })[]
}

const KINDS = Object.keys(MAGIC_KINDS) as MagicKind[]
const ATTRS = new Set<string>(SR6_ATTRS)
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)
export const pool = (max: number, spent: number): Pool => ({ max, spent, left: max - spent })
export const contactSpend = (b: Sr6Build) => b.contacts.reduce((n, c) => n + c.connection + c.loyalty, 0)
export const knowledgeSpend = (b: Sr6Build) => b.knowledge.filter(k => !k.native).reduce((n, k) => n + k.points, 0)
const awakened = (k: MagicKind) => k !== 'mundane'

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

  // lifepath: the opening modules are fixed (R: the catalog's stage="opening" ones), the adult ones are picked
  const opening = Object.values(data.lifemodules).filter(m => m.stage === 'opening')
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
  return {
    ...base,
    lettersValid: () => true,
    attributePoints: b => sum(b, 'attributePoints'),
    skillPoints: b => sum(b, 'skillPoints'),
    adjustmentPoints: b => sum(b, 'adjustmentPoints'),
    nuyen: b => sum(b, 'nuyen'),
    legalMetatypes: () => everyMetatype(0),
    legalMagic: () => everyKind(start),
    magicRating: b => start(b.magic),
    contactPoints: b => ({ ...pool(sum(b, 'contactPoints'), contactSpend(b)), ratingCap: n('lifepath.contactRatingCap') }),
    knowledgePoints: b => pool(sum(b, 'knowledgeSkills'), knowledgeSpend(b)),
    available: b => {
      const taken = new Set(b.lifepath.map(m => m.id))
      return Object.values(data.lifemodules).filter(m => m.stage === 'adult' && allows(b.magic, m.requires))
        .map(m => ({ ...m, taken: taken.has(m.id) })).sort(byName)
    },
  }
}
