// Derived values (dice pools, condition monitors, initiative, Defense Rating, Attack Ratings, Composure, Judge
// Intentions, Memory, lift/carry, drain/fading, essence and its magic loss): formulas in code, every constant they use a
// creation setting (Derived values group). A setting that isn't set leaves its value null and is listed in `unset`;
// nothing is guessed and nothing is NaN. Pages: the core rulebook's (checked against the owner's copy).
import { SR6_ATTRS, type Bonus, type Sr6Attr, type Sr6Character } from '../model/character'
import { allBudgets, attrRating, augmentBonus, conditionalBonuses, entryBonuses, entryOf, hostBonus, ratingOf, skillRank, specBonus } from './budgets'
import { num, str, type CreationRules } from './creation'
import { MAGIC_KINDS, type Sr6Data } from './data'
import { makeProvider } from './providers'
import { armorSocial, attackRatings, rated } from './values'
import { entryLabel } from './categories'

export interface Sr6Pool {
  skill: string; label: string; rank: number; attr: string
  /** rank + the augmented attribute + the entered skill bonuses (an untrained skill: the attribute less untrainedPenalty,
   *  plus its bonuses) */
  dp: number
  spec?: string; expertise?: string
  /** why the bracketed pool differs: the dice that hold switched on, on some tests or in a specialization the runner
   *  hasn't (a voice modulator's sound-based Con tests) */
  conditional?: { value: number; when: string; from: string }[]
  /** dp with the specialization / expertise (absent when its setting isn't set), with the bonuses limited to it (owner
   *  decision 2026-10-10) */
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
  /** the boxes the monitors have beyond base + attribute / divisor (Built Tough's Physical boxes) */
  monitorBonus: { physical: number; stun: number }
  defenseRating: number
  /** Charisma + the Social modifiers of the armor worn (Firing Squad p. 50) */
  socialRating: number
  attackRatings: { unarmed: number; weapons: { uid: string; name: string; bands: (number | null)[] }[] }
  composure: number; judgeIntentions: number; memory: number; liftCarry: number
  drain?: number; fading?: number
  pools: Sr6Pool[]
  karmaLeft: number; nuyenLeft: number; edge: number
  /** the Derived values settings a value needed that aren't set */
  unset: string[]
  /** the lines whose accessories change the line itself: a cyberlimb's own Strength and Agility (the runner's natural
   *  rating plus its accessories'), its armor; the runner's attributes are unchanged. text: `STR 5, AGI 4, Armor +2` */
  hosts: { uid: string; name: string; values: { target: string; value: number }[]; text: string }[]
  /** the same values with the switchable and conditional effects on (wireless, activated, sustained, some tests only):
   *  the bracketed total a book's stat block prints, `Con 6 (9)` (owner decision 2026-10-10) */
  on: Omit<Sr6Derived, 'on'>
}
/** `STR 5, Armor +2`: a host's own values as shown on its line, the sheets and Review. */
export const hostText = (values: { target: string; value: number }[]) => values.map(v =>
  v.target === 'defense' ? `Armor ${v.value >= 0 ? '+' : ''}${v.value}` : v.target === 'physical' ? `Physical boxes +${v.value}` : v.target === 'initDice' ? `Initiative dice +${v.value}`
    : v.target === 'stun' ? `Stun boxes +${v.value}` : v.target === 'overflow' ? `Overflow boxes +${v.value}`
    : `${v.target.toUpperCase()} ${v.value}`).join(', ')

export function deriveSr6(data: Sr6Data, cr: CreationRules, ch: Sr6Character): Sr6Derived {
  return { ...derive(data, cr, ch, false), on: derive(data, cr, ch, true) }
}

/** The derived values: the always-on effects' (on false) or with the switchable and conditional ones too (on). */
function derive(data: Sr6Data, cr: CreationRules, ch: Sr6Character, on: boolean): Omit<Sr6Derived, 'on'> {
  const b = ch.build, p = makeProvider(b.method, data, cr), budgets = allBudgets(b, data, cr, p), kind = MAGIC_KINDS[b.magic]
  const unset = new Set<string>()
  const need = (key: string) => { const v = num(cr, key); if (v === undefined) unset.add(key); return v }

  // CRB p. 38: each whole point of Essence spent costs a point of Magic (or Resonance); R: the highest Magic too
  const loss = budgets.essence.magicLoss, special: Sr6Attr = kind.resonance ? 'res' : 'mag'
  const capSetting = need('magicMax'), magicMax = capSetting === undefined ? null : Math.max(0, capSetting - loss)
  const attrs = Object.fromEntries(SR6_ATTRS.map(k => {
    let natural = attrRating(b, k, p)
    if (k === special && b.magic !== 'mundane') natural = Math.max(0, natural - loss)
    return [k, { natural, augmented: natural + augmentBonus(b, data, k, undefined, on) }]
  })) as Sr6Derived['attrs']
  const A = (k: string) => attrs[k as Sr6Attr]?.augmented ?? 0
  const plus = (a: number, key: string) => { const v = need(key); return v === undefined ? null : a + v }
  // the initiative dice cap (GM-entered; unset: no cap)
  const capDice = (d: number | null) => { const most = num(cr, 'initiativeDiceMax'); return d === null || most === undefined ? d : Math.min(d, most) }

  // CRB p. 38: monitor = base + ceil(attribute / divisor); overflow = BOD; Built Tough adds a Physical box per level (CRB p. 70)
  const base = need('monitorBase'), div = need('monitorDivisor')
  const monitor = (a: number) => (base === undefined || !div ? null : base + Math.ceil(a / div))
  // (and a full cyberlimb's box, CRB p. 288, as the line's bonus carries it)
  // (the quality the settings name counts here unless its own effects add the box: never twice)
  const own = (id: string | undefined, t: Bonus['target']) => !!id && entryBonuses(data, data.entry('qualities', id)).some(x => x.target === t)
  const toughId = str(cr, 'builtToughQuality'), depositsId = str(cr, 'dermalDepositsQuality')
  const tough = (own(toughId, 'physical') ? 0 : b.qualities.filter(q => data.sameFamily('qualities', q.id, toughId))
    .reduce((t, q) => t + (data.levelOf(data.entry('qualities', q.id)) ?? q.level), 0)) + augmentBonus(b, data, 'physical', undefined, on)
  const physical = monitor(A('bod'))
  const stunBase = monitor(A('wil')), stunPlus = augmentBonus(b, data, 'stun', undefined, on)

  // CRB p. 67: Defense Rating = BOD + the defense of worn armor, and what a ware adds (dermal plating, CRB p. 286);
  // Dermal Deposits' level of natural armor (CRB p. 71)
  const deposits = !own(depositsId, 'defense') && b.qualities.some(q => data.sameFamily('qualities', q.id, depositsId)) ? 1 : 0
  // Power Plays p. 85: Charismatic Defense bases it on Charisma instead of Body
  const dr = b.qualities.some(q => data.sameFamily('qualities', q.id, str(cr, 'charismaticDefenseQuality'))) ? 'cha' : 'bod'
  let defense = A(dr) + augmentBonus(b, data, 'defense', undefined, on) + deposits
  for (const x of b.purchases) if (x.kind === 'armor' && x.worn) { const e = entryOf(x, data); defense += rated(e?.attrs.defense, ratingOf(x, e)).n ?? 0 }

  // CRB pp. 92–93: a pool is rank + attribute; a specialization or expertise adds its dice; an untrained skill rolls the attribute less the penalty
  const pools: Sr6Pool[] = []
  for (const s of b.skills) {
    const v = data.skills[s.id], rank = skillRank(s), attr = v?.attr ?? '', dp = rank + A(attr) + augmentBonus(b, data, 'skill', s.id, on, s.spec)
    const pool: Sr6Pool = { skill: s.id, label: v?.name ?? s.id, rank, attr, dp }
    const cond = on ? [] : conditionalBonuses(b, data, s.id, s.spec)
    if (cond.length) pool.conditional = cond
    // (a specialization of the expertise's own name is the one turned into it, CRB p. 92: rolled as the expertise; a
    // bonus limited to the specialization counts in its pool)
    if (s.spec && s.spec !== s.expertise) { pool.spec = s.spec; const d = plus(dp, 'specDice'); if (d !== null) pool.specDp = d + specBonus(b, data, s.id, s.spec, on) }
    if (s.expertise) { pool.expertise = s.expertise; const d = plus(dp, 'expertiseDice'); if (d !== null) pool.expertiseDp = d + specBonus(b, data, s.id, s.expertise, on) }
    pools.push(pool)
  }
  const penalty = need('untrainedPenalty')
  if (penalty !== undefined)
    for (const v of Object.values(data.skills)) if (v.untrained && !b.skills.some(s => s.id === v.id))
      pools.push({ skill: v.id, label: v.name, rank: 0, attr: v.attr, dp: Math.max(0, A(v.attr) - penalty + augmentBonus(b, data, 'skill', v.id, on)) })
  pools.sort((x, y) => x.label.localeCompare(y.label))

  return {
    attrs, essence: budgets.essence.left, magicLoss: loss, magicMax,
    // CRB pp. 39, 67: initiative = REA + INT, plus dice
    initiative: { base: A('rea') + A('int'), dice: capDice(plus(augmentBonus(b, data, 'initDice', undefined, on), 'initiativeDice')) },
    // CRB p. 161 (astral combat): astral initiative = LOG + INT, plus dice
    ...(kind.spells ? { astralInit: { base: A('log') + A('int'), dice: capDice(need('astralInitiativeDice') ?? null) } } : {}),
    monitors: { physical: physical === null ? null : physical + tough, stun: stunBase === null ? null : stunBase + stunPlus,
      overflow: A('bod') + augmentBonus(b, data, 'overflow', undefined, on) },
    monitorBonus: { physical: tough, stun: stunPlus },
    defenseRating: defense,
    // Firing Squad p. 50, Smooth Operations p. 127: Social Rating = CHA + the Social modifiers of the armor worn
    socialRating: A('cha') + b.purchases.filter(x => x.kind === 'armor' && x.worn)
      .reduce((t, x) => t + [x, ...x.accessories].reduce((u, y) => u + (armorSocial(entryOf(y, data)?.attrs.social, ratingOf(y, entryOf(y, data))) ?? 0), 0), 0),
    // CRB p. 67: unarmed Attack Rating = REA + STR; a weapon's from its catalog line
    attackRatings: { unarmed: A('rea') + A('str'), weapons: b.purchases.filter(x => x.kind === 'weapons').map(x => {
      const e = entryOf(x, data)
      return { uid: x.uid, name: e ? entryLabel(e) : x.name ?? 'Weapon', bands: attackRatings(e?.attrs.ar).bands }
    }) },
    // CRB pp. 67–68: Composure WIL + CHA, Judge Intentions WIL + INT, Memory LOG + INT, Lift/Carry BOD + WIL
    composure: A('wil') + A('cha'), judgeIntentions: A('wil') + A('int'), memory: A('log') + A('int'), liftCarry: A('bod') + A('wil'),
    // CRB pp. 127, 189: drain WIL + the tradition's attribute; fading (complex forms) WIL + LOG
    ...(kind.spells && b.drainAttr ? { drain: A('wil') + A(b.drainAttr) } : {}),
    ...(kind.resonance ? { fading: A('wil') + A('log') } : {}),
    pools, karmaLeft: budgets.karma.left, nuyenLeft: budgets.nuyen.left, edge: A('edg'),
    unset: [...unset],
    hosts: b.purchases.flatMap(x => {
      const add = hostBonus(x, data, on), targets = Object.keys(add) as (keyof typeof add)[]
      if (!targets.length) return []
      const values = targets.map(t => ({ target: t, value: (t in attrs ? attrs[t as Sr6Attr].natural : 0) + add[t]! }))
      const e = entryOf(x, data)
      return [{ uid: x.uid, name: e ? entryLabel(e) : x.name ?? 'Custom item', values, text: hostText(values) }]
    }),
  }
}
