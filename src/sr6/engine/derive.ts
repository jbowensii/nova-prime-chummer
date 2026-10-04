// Derived values (dice pools, condition monitors, initiative, Defense Rating, Attack Ratings, Composure, Judge
// Intentions, Memory, lift/carry, drain/fading, essence and its magic loss): formulas in code, every constant they use a
// creation setting (Derived values group). A setting that isn't set leaves its value null and is listed in `unset`;
// nothing is guessed and nothing is NaN. Each formula's page is filled in from the owner's book in Task 16.
import { SR6_ATTRS, type Sr6Attr, type Sr6Character } from '../model/character'
import { allBudgets, attrRating, augmentBonus, entryOf, ratingOf, skillRank } from './budgets'
import { num, type CreationRules } from './creation'
import { MAGIC_KINDS, type Sr6Data } from './data'
import { makeProvider } from './providers'
import { attackRatings, rated } from './values'

export interface Sr6Pool {
  skill: string; label: string; rank: number; attr: string
  /** rank + the augmented attribute (an untrained skill: the attribute less untrainedPenalty) */
  dp: number
  spec?: string; expertise?: string
  /** dp with the specialization / expertise (absent when its setting isn't set) */
  specDp?: number; expertiseDp?: number
}
export interface Sr6Derived {
  attrs: Record<Sr6Attr, { natural: number; augmented: number }>
  essence: number
  /** Magic or Resonance lost to Essence spent */
  magicLoss: number
  /** the highest Magic or Resonance, lowered by the loss */
  magicMax: number | null
  initiative: { base: number; dice: number | null }
  /** magicians and mystic adepts */
  astralInit?: { base: number; dice: number | null }
  monitors: { physical: number | null; stun: number | null; overflow: number }
  defenseRating: number
  attackRatings: { unarmed: number; weapons: { uid: string; name: string; bands: (number | null)[] }[] }
  composure: number; judgeIntentions: number; memory: number; liftCarry: number
  drain?: number; fading?: number
  pools: Sr6Pool[]
  karmaLeft: number; nuyenLeft: number; edge: number
  /** the Derived values settings a value needed that aren't set */
  unset: string[]
}

export function deriveSr6(data: Sr6Data, cr: CreationRules, ch: Sr6Character): Sr6Derived {
  const b = ch.build, p = makeProvider(b.method, data, cr), budgets = allBudgets(b, data, cr, p), kind = MAGIC_KINDS[b.magic]
  const unset = new Set<string>()
  const need = (key: string) => { const v = num(cr, key); if (v === undefined) unset.add(key); return v }

  // R (verify, Task 16): Essence spent lowers both the highest Magic (or Resonance) and the rating itself
  const loss = budgets.essence.magicLoss, special: Sr6Attr = kind.resonance ? 'res' : 'mag'
  const capSetting = need('magicMax'), magicMax = capSetting === undefined ? null : Math.max(0, capSetting - loss)
  const attrs = Object.fromEntries(SR6_ATTRS.map(k => {
    let natural = attrRating(b, k, p)
    if (k === special && b.magic !== 'mundane') natural = Math.max(0, natural - loss)
    return [k, { natural, augmented: natural + augmentBonus(b, k) }]
  })) as Sr6Derived['attrs']
  const A = (k: string) => attrs[k as Sr6Attr]?.augmented ?? 0
  const plus = (a: number, key: string) => { const v = need(key); return v === undefined ? null : a + v }

  // CRB p. (verify, Task 16): monitor = base + ceil(attribute / divisor); overflow = BOD
  const base = need('monitorBase'), div = need('monitorDivisor')
  const monitor = (a: number) => (base === undefined || !div ? null : base + Math.ceil(a / div))

  // CRB p.: Defense Rating = BOD + the defense of worn armor
  let defense = A('bod')
  for (const x of b.purchases) if (x.kind === 'armor' && x.worn) { const e = entryOf(x, data); defense += rated(e?.attrs.defense, ratingOf(x, e)).n ?? 0 }

  // CRB p.: a pool is rank + attribute; a specialization or expertise adds its dice; an untrained skill rolls the attribute less the penalty
  const pools: Sr6Pool[] = []
  for (const s of b.skills) {
    const v = data.skills[s.id], rank = skillRank(s), attr = v?.attr ?? '', dp = rank + A(attr)
    const pool: Sr6Pool = { skill: s.id, label: v?.name ?? s.id, rank, attr, dp }
    if (s.spec) { pool.spec = s.spec; const d = plus(dp, 'specDice'); if (d !== null) pool.specDp = d }
    if (s.expertise) { pool.expertise = s.expertise; const d = plus(dp, 'expertiseDice'); if (d !== null) pool.expertiseDp = d }
    pools.push(pool)
  }
  const penalty = need('untrainedPenalty')
  if (penalty !== undefined)
    for (const v of Object.values(data.skills)) if (v.untrained && !b.skills.some(s => s.id === v.id))
      pools.push({ skill: v.id, label: v.name, rank: 0, attr: v.attr, dp: Math.max(0, A(v.attr) - penalty) })
  pools.sort((x, y) => x.label.localeCompare(y.label))

  return {
    attrs, essence: budgets.essence.left, magicLoss: loss, magicMax,
    // CRB p.: initiative = REA + INT, plus dice
    initiative: { base: A('rea') + A('int'), dice: plus(augmentBonus(b, 'initDice'), 'initiativeDice') },
    // CRB p. (verify, Task 16): astral initiative = INT × 2, plus dice
    ...(kind.spells ? { astralInit: { base: A('int') * 2, dice: need('astralInitiativeDice') ?? null } } : {}),
    monitors: { physical: monitor(A('bod')), stun: monitor(A('wil')), overflow: A('bod') },
    defenseRating: defense,
    // CRB p.: unarmed Attack Rating = REA + STR; a weapon's from its catalog line
    attackRatings: { unarmed: A('rea') + A('str'), weapons: b.purchases.filter(x => x.kind === 'weapons').map(x => {
      const e = entryOf(x, data)
      return { uid: x.uid, name: e?.name ?? x.name ?? 'Weapon', bands: attackRatings(e?.attrs.ar).bands }
    }) },
    // CRB p.: Composure WIL + CHA, Judge Intentions WIL + INT, Memory LOG + INT, Lift/Carry BOD + WIL
    composure: A('wil') + A('cha'), judgeIntentions: A('wil') + A('int'), memory: A('log') + A('int'), liftCarry: A('bod') + A('wil'),
    // CRB p.: drain WIL + the tradition's attribute; fading WIL + LOG
    ...(kind.spells && b.drainAttr ? { drain: A('wil') + A(b.drainAttr) } : {}),
    ...(kind.resonance ? { fading: A('wil') + A('log') } : {}),
    pools, karmaLeft: budgets.karma.left, nuyenLeft: budgets.nuyen.left, edge: A('edg'),
    unset: [...unset],
  }
}
