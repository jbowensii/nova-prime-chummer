// Derived values (dice pools, condition monitors, initiative, Defense Rating, Attack Ratings, Composure, Judge
// Intentions, Memory, lift/carry, drain/fading, essence and its magic loss): formulas in code, every constant they use a
// creation setting (Derived values group). A setting that isn't set leaves its value null and is listed in `unset`;
// nothing is guessed and nothing is NaN. Pages: the core rulebook's (checked against the owner's copy).
import { SR6_ATTRS, type Bonus, type Sr6Attr, type Sr6Character } from '../model/character'
import { allBudgets, attrRating, augmentBonus, magicCap, conditionalBonuses, entryBonuses, entryOf, hostBonus, ratingOf, skillRank, specBonus } from './budgets'
import { flag, num, str, type CreationRules } from './creation'
import { MAGIC_KINDS, normName, type Sr6Data } from './data'
import { linkedEntries } from './effects'
import type { Sr6Entry, Sr6Part } from '../model/types'
import { makeProvider } from './providers'
import { armorSocial, attackRatings, rated } from './values'
import { categoryOf, entryLabel } from './categories'

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
  /** the bonus dice left out: a skill's augmented increase stops at skillAugmentMax (CRB Hong Kong p. 39) */
  capped?: number
  /** the further specializations' pools (Exotic Weapons, CRB Hong Kong p. 95; Expanded Specializations, SWC p. 153) */
  more?: { spec: string; dp: number }[]
}
/** A matrix initiative: base + dice (the dice capped as the physical ones). */
export interface Sr6Init { base: number; dice: number | null }
/** A weapon line's values: its Attack Ratings by range band (a melee weapon's with Strength added, CRB Hong Kong p. 39),
 *  the skill it's used with and its dice pool (the specialization's when the runner has the weapon's), and what high
 *  Strength adds to a melee weapon's Damage Value (the Sixth World Companion's option, p. 150) */
export interface Sr6WeaponValues { uid: string; name: string; bands: (number | null)[]; skill?: string; pool?: number; dvBonus?: number }
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
  attackRatings: { unarmed: number; weapons: Sr6WeaponValues[] }
  /** unarmed damage (CRB Hong Kong p. 94: 2S; Physical with Dermal Deposits, p. 71, or bone lacing or density, pp. 286,
   *  291, whose table may set the value): null when unarmedDV isn't set */
  unarmedDamage: { dv: number; physical: boolean } | null
  /** a spellcaster's Attack Rating: Magic + the tradition's attribute (CRB Hong Kong p. 132) */
  spellAttackRating?: number
  /** Matrix initiative (CRB Hong Kong p. 179): AR the physical one; cold and hot sim Intuition + the persona's Data
   *  Processing (a technomancer's Logic, p. 189; else the best commlink's) with their extra dice; absent with neither */
  matrixInit?: { ar: Sr6Init; cold: Sr6Init; hot: Sr6Init; dataProcessing: number }
  /** metres for a Move (CRB Hong Kong p. 42) and a Sprint, plus per hit (p. 44): null when the settings aren't set */
  movement: { walk: number; sprint: number; perHit: number } | null
  /** the bonus left out of each attribute's augmented value: it stops at attributeAugmentMax over natural (CRB Hong
   *  Kong p. 37) */
  capped: Partial<Record<Sr6Attr, number>>
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
  // (with the option magicAboveSixByGrade, plus the grade: budgets.ts magicCap)
  const capSetting = need('magicMax') === undefined ? undefined : magicCap(b, cr, special), magicMax = capSetting === undefined ? null : Math.max(0, capSetting - loss)
  // CRB Hong Kong p. 37: an adjusted attribute is never above its rank + 4; p. 39: a skill's augmented increase is never
  // above +4 (attributeAugmentMax, skillAugmentMax; unset: no cap). Only an increase is capped.
  const capA = num(cr, 'attributeAugmentMax'), capS = num(cr, 'skillAugmentMax'), capped: Sr6Derived['capped'] = {}
  const upTo = (bonus: number, most: number | undefined) => (most === undefined || bonus <= most ? bonus : most)
  const attrs = Object.fromEntries(SR6_ATTRS.map(k => {
    let natural = attrRating(b, k, p)
    if (k === special && b.magic !== 'mundane') natural = Math.max(0, natural - loss)
    const bonus = augmentBonus(b, data, k, undefined, on), counted = upTo(bonus, capA)
    if (counted < bonus) capped[k] = bonus - counted
    return [k, { natural, augmented: natural + counted }]
  })) as Sr6Derived['attrs']
  const A = (k: string) => attrs[k as Sr6Attr]?.augmented ?? 0
  const plus = (a: number, key: string) => { const v = need(key); return v === undefined ? null : a + v }
  // the initiative dice cap (CRB Hong Kong p. 39: never more than 5D6; unset: no cap)
  const capDice = (d: number | null) => { const most = num(cr, 'initiativeDiceMax'); return d === null || most === undefined ? d : Math.min(d, most) }

  // CRB p. 38: monitor = base + ceil(attribute / divisor); Built Tough adds a Physical box per level (CRB p. 70); a
  // quality lowering one (Glass Jaw) leaves at least monitorMinimum boxes (CRB Hong Kong p. 76)
  const base = need('monitorBase'), div = need('monitorDivisor'), least = num(cr, 'monitorMinimum')
  const monitor = (a: number) => (base === undefined || !div ? null : base + Math.ceil(a / div))
  const floor = (v: number | null) => (v === null || least === undefined ? v : Math.max(least, v))
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
  // the Sixth World Companion's option (p. 150, strengthInCloseCombat): Close Combat rolls Strength, and Agility goes
  // into the melee Attack Ratings in its place
  const strongArm = !!flag(cr, 'strengthInCloseCombat')
  const linked = (skill: string, attr: string) => (strongArm && attr === 'agi' && normName(data.skills[skill]?.name ?? '') === 'close combat' ? 'str' : attr)
  const pools: Sr6Pool[] = []
  for (const s of b.skills) {
    const v = data.skills[s.id], rank = skillRank(s), attr = linked(s.id, v?.attr ?? '')
    const bonus = augmentBonus(b, data, 'skill', s.id, on, s.spec), dp = rank + A(attr) + upTo(bonus, capS)
    const pool: Sr6Pool = { skill: s.id, label: v?.name ?? s.id, rank, attr, dp }
    if (upTo(bonus, capS) < bonus) pool.capped = bonus - capS!
    const cond = on ? [] : conditionalBonuses(b, data, s.id, s.spec)
    if (cond.length) pool.conditional = cond
    // (a specialization of the expertise's own name is the one turned into it, CRB p. 92: rolled as the expertise; a
    // bonus limited to the specialization counts in its pool, within the +4)
    const withSpec = (dice: string, name: string) => {
      const d = need(dice)
      return d === undefined ? undefined : rank + A(attr) + d + upTo(bonus + specBonus(b, data, s.id, name, on), capS)
    }
    if (s.spec && s.spec !== s.expertise) { pool.spec = s.spec; const d = withSpec('specDice', s.spec); if (d !== undefined) pool.specDp = d }
    const more = (s.specs ?? []).flatMap(x => { const d = withSpec('specDice', x); return d === undefined ? [] : [{ spec: x, dp: d }] })
    if (more.length) pool.more = more
    if (s.expertise) { pool.expertise = s.expertise; const d = withSpec('expertiseDice', s.expertise); if (d !== undefined) pool.expertiseDp = d }
    pools.push(pool)
  }
  const penalty = need('untrainedPenalty')
  if (penalty !== undefined)
    for (const v of Object.values(data.skills)) if (v.untrained && !b.skills.some(s => s.id === v.id))
      pools.push({ skill: v.id, label: v.name, rank: 0, attr: linked(v.id, v.attr), dp: Math.max(0, A(linked(v.id, v.attr)) - penalty + upTo(augmentBonus(b, data, 'skill', v.id, on), capS)) })
  pools.sort((x, y) => x.label.localeCompare(y.label))

  // CRB Hong Kong p. 39: Strength goes into a melee weapon's Attack Rating (meleeArStrength), Reaction for a whip (p. 250's
  // note), and the unarmed one is Reaction + Strength; the Sixth World Companion's option puts Agility there instead
  const meleeAttr: Sr6Attr = strongArm ? 'agi' : 'str'
  const highStrength = flag(cr, 'highStrengthDamage') ? strengthDamage(A('str'), cr) : 0
  const weapons: Sr6WeaponValues[] = b.purchases.filter(x => x.kind === 'weapons').map(x => {
    const e = entryOf(x, data), ar = attackRatings(e?.attrs.ar).bands, melee = isMelee(e)
    const add = melee && flag(cr, 'meleeArStrength') ? A(/reaction instead of strength/i.test(noteOf(e, 'ar')) ? 'rea' : meleeAttr) : 0
    const out: Sr6WeaponValues = { uid: x.uid, name: e ? entryLabel(e) : x.name ?? 'Weapon', bands: add ? ar.map(v => (v === null ? null : v + add)) : ar }
    const skill = weaponSkill(data, e)
    if (skill) {
      out.skill = skill
      const pl = pools.find(q => q.skill === skill), cat = e?.attrs.category ?? ''
      if (pl) out.pool = pl.expertise && specFits(pl.expertise, cat) && pl.expertiseDp !== undefined ? pl.expertiseDp
        : pl.spec && specFits(pl.spec, cat) && pl.specDp !== undefined ? pl.specDp : pl.more?.find(m => specFits(m.spec, cat))?.dp ?? pl.dp
    }
    if (melee && highStrength) out.dvBonus = highStrength
    return out
  })

  // CRB Hong Kong p. 94: base unarmed damage 2S (unarmedDV); Physical with Dermal Deposits (p. 71) or an effect that says
  // so (bone lacing, bone density, pp. 286, 291), whose table may set the value; plus what adds to it
  const dvBase = num(cr, 'unarmedDV'), sets = partsOf(b, data, 'derived:unarmed-dv', on).filter(x => x.attrs.op === 'set')
  const unarmedDamage = dvBase === undefined ? null : {
    dv: Math.max(dvBase, ...sets.map(x => Number(x.attrs.value) || 0)) + augmentBonus(b, data, 'unarmedDV', undefined, on) + highStrength,
    physical: b.qualities.some(q => q.id === depositsId) || sets.length > 0 || partsOf(b, data, 'derived:unarmed-damage', on).some(x => /^p/i.test(x.attrs.value ?? '')),
  }

  // CRB Hong Kong p. 179: Matrix AR initiative is the physical one; VR is Intuition + Data Processing with 1 (cold sim)
  // or 2 (hot sim) dice on top of the usual ones, within the 5D6. A technomancer's Data Processing is their Logic
  // (p. 189); a decker's the best commlink's (its D/F array, p. 174: the device's attributes are the persona's)
  const initDice = plus(augmentBonus(b, data, 'initDice', undefined, on), 'initiativeDice'), usual = need('initiativeDice')
  const dp = kind.resonance ? A('log') : Math.max(-1, ...b.purchases.filter(x => x.kind === 'electronics' && /commlink/i.test(entryOf(x, data)?.attrs.category ?? ''))
    .map(x => Number((entryOf(x, data)?.attrs.array ?? '').split('/')[0]) || 0))
  const vr = (key: string): Sr6Init => {
    const extra = need(key)
    return { base: A('int') + dp, dice: usual === undefined || extra === undefined ? null : capDice(usual + extra + augmentBonus(b, data, 'matrixInitDice', undefined, on)) }
  }
  const matrixInit = dp >= 0 ? { ar: { base: A('rea') + A('int'), dice: capDice(initDice) }, cold: vr('matrixColdDice'), hot: vr('matrixHotDice'), dataProcessing: dp } : undefined

  // CRB Hong Kong p. 42: a Move is 10 m; p. 44: a Sprint 15 m, +1 m a hit; what adds to movement adds to both
  const walk = num(cr, 'moveWalk'), sprint = num(cr, 'moveSprint'), perHit = num(cr, 'moveSprintPerHit'), moves = augmentBonus(b, data, 'movement', undefined, on)
  const movement = walk === undefined || sprint === undefined || perHit === undefined ? null : { walk: walk + moves, sprint: sprint + moves, perHit }

  return {
    attrs, essence: budgets.essence.left, magicLoss: loss, magicMax,
    // CRB pp. 39, 67: initiative = REA + INT, plus dice
    initiative: { base: A('rea') + A('int'), dice: capDice(initDice) },
    // CRB p. 161 (astral combat): astral initiative = LOG + INT, plus dice
    ...(kind.spells ? { astralInit: { base: A('log') + A('int'), dice: capDice(need('astralInitiativeDice') ?? null) } } : {}),
    // CRB Hong Kong p. 121: dead at (Body × 2) boxes of Overflow (overflowPerBody), plus what adds to it (Will to Live)
    monitors: { physical: physical === null ? null : floor(physical + tough), stun: stunBase === null ? null : floor(stunBase + stunPlus),
      overflow: A('bod') * (need('overflowPerBody') ?? 0) + augmentBonus(b, data, 'overflow', undefined, on) },
    monitorBonus: { physical: tough, stun: stunPlus },
    defenseRating: defense,
    // Firing Squad p. 50, Smooth Operations p. 127: Social Rating = CHA + the Social modifiers of the armor worn
    socialRating: A('cha') + b.purchases.filter(x => x.kind === 'armor' && x.worn)
      .reduce((t, x) => t + [x, ...x.accessories].reduce((u, y) => u + (armorSocial(entryOf(y, data)?.attrs.social, ratingOf(y, entryOf(y, data))) ?? 0), 0), 0),
    // CRB p. 67: unarmed Attack Rating = REA + STR (and what adds to it: bone lacing); a weapon's from its catalog line
    attackRatings: { unarmed: A('rea') + A(meleeAttr) + augmentBonus(b, data, 'unarmedAR', undefined, on), weapons },
    unarmedDamage, movement, capped,
    ...(matrixInit ? { matrixInit } : {}),
    ...(kind.spells && b.drainAttr ? { spellAttackRating: A('mag') + A(b.drainAttr) } : {}),
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

/** The effect parts on `target` of the runner's qualities, picks and purchases (and the entries they grant or work as):
 *  the always-on ones (on: the switchable and conditional ones too); never a low-confidence one. */
function partsOf(b: Sr6Character['build'], data: Sr6Data, target: string, on: boolean): Sr6Part[] {
  const entries = [...b.qualities.map(q => data.entry('qualities', q.id)), ...b.picks.map(x => data.entry(x.kind, x.id)), ...b.purchases.map(x => entryOf(x, data))]
    .filter((e): e is Sr6Entry => !!e)
  return entries.flatMap(e => [e, ...linkedEntries(data, e).map(l => l.entry)]).flatMap(e => e.parts)
    .filter(x => x.tag === 'effect' && x.attrs.target === target && x.attrs.confidence !== 'low' && (on || (!x.attrs.switch && !x.attrs.when)))
}

/** What the Sixth World Companion's High Strength Adds to Damage (p. 150) adds to a melee Damage Value: +1 from Strength
 *  strengthDamageStep1, +2 from strengthDamageStep2 (unset: none). */
export function strengthDamage(str: number, cr: CreationRules): number {
  const one = num(cr, 'strengthDamageStep1'), two = num(cr, 'strengthDamageStep2')
  return two !== undefined && str >= two ? 2 : one !== undefined && str >= one ? 1 : 0
}

/** A melee weapon (CRB Hong Kong pp. 248–250's tables): an Attack Rating at Close only, no firing modes and no ammo. */
export function isMelee(e: Sr6Entry | undefined): boolean {
  const ar = attackRatings(e?.attrs.ar).bands
  return !!e && ar[0] !== null && ar.slice(1).every(v => v === null) && !e.attrs.modes && !e.attrs.ammo
}

/** The note a catalog entry's field carries (its footnote, `Whips add the attacker's Reaction instead of Strength`). */
const noteOf = (e: Sr6Entry | undefined, field: string) => (e?.notes ?? []).filter(x => x.field === field).map(x => x.text).join(' ')

/** Words, each singular, without punctuation: `Submachine Guns` -> submachine gun. */
const words = (s: string) => normName(s).split(/[^a-z0-9]+/).filter(Boolean).map(w => w.replace(/(?<=[a-z]{3})s$/, ''))
/** A specialization covers a weapon category when all its words are the category's (`Pistols` covers `Heavy pistol`,
 *  `Throwing` covers `Throwing weapon/projectile`) or the other way round. */
export function specFits(spec: string, category: string): boolean {
  const s = words(spec), c = words(category)
  return s.length > 0 && c.length > 0 && (s.every(w => c.includes(w)) || c.every(w => s.includes(w)))
}

/** The skill a weapon is used with (CRB Hong Kong p. 109: "what skill is used with this weapon"): the catalog's own skill
 *  when it prints one; Exotic Weapons for an exotic one (its table says so); the skill whose specializations name its
 *  category (p. 93: Archery and Throwing are Athletics', p. 94 Blades, Clubs and Unarmed Close Combat's, p. 95 the guns
 *  Firearms'); else a gun (a firing mode or ammo) Firearms ("Do you want to shoot things?", p. 95) and a melee weapon
 *  Close Combat (p. 94). undefined when none fits. */
export function weaponSkill(data: Sr6Data, e: Sr6Entry | undefined): string | undefined {
  if (!e) return undefined
  const skills = Object.values(data.skills), named = (n: string) => skills.find(s => normName(s.name) === n)?.id
  if (e.attrs.skill) return skills.find(s => normName(s.name) === normName(e.attrs.skill))?.id
  const cat = e.attrs.category ?? '', table = categoryOf(data.categories, e)?.attrs.table ?? ''
  if (/\bexotic\b/i.test(`${cat} ${table}`)) return named('exotic weapons')
  const bySpec = skills.find(s => s.specs.some(sp => specFits(sp, cat)))
  if (bySpec) return bySpec.id
  if (e.attrs.modes || e.attrs.ammo) return named('firearms')
  return isMelee(e) ? named('close combat') : undefined
}

/** The Edge comparing an Attack Rating with a Defense Rating gives (CRB Hong Kong p. 45: the side whose rating is
 *  arDrEdgeGap or more greater gains 1; the Sixth World Companion's Stacking Advantage, p. 144, 2 for a lead of twice
 *  that): positive the attacker's, negative the defender's, 0 neither; null when either rating or the gap isn't known. */
export function ratingEdge(ar: number | null, dr: number | null, cr: CreationRules): number | null {
  const gap = num(cr, 'arDrEdgeGap')
  if (ar === null || dr === null || gap === undefined || gap <= 0) return null
  const lead = Math.abs(ar - dr), edge = lead >= 2 * gap && flag(cr, 'stackingAdvantage') ? 2 : lead >= gap ? 1 : 0
  return ar >= dr ? edge : -edge
}
