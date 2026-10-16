// A catalog entry's effects (the <effect> and <link> parts importer/sr6/effects.py reads from the book's text and tables;
// docs/sr6-data-format.md "Effects") as the engine uses them: the bonuses it applies, the test types it shows on every
// pool they cover, and the entries an entry grants or works as (owner decisions 2026-10-10).
import { BONUS_SWITCHES, SR6_ATTRS, type Bonus, type Sr6Attr } from '../model/character'
import type { Sr6Entry, Sr6Kind, Sr6Part } from '../model/types'
import type { Sr6Data } from './types'
import { normName } from './names'
import { counts, type EffectState } from '../../shared/effects'

/** Whether a bonus counts in SR6's totals (owner decisions 2026-10-10): the total shown first holds the always-on ones
 *  (the shared rule, src/shared/effects.ts counts); the bracketed total (`on`) adds the switchable ones and, in SR6, the
 *  ones holding on some tests only (`when`: `Con 6 (9)`, replacing "shown beside, not added"). Never a low-confidence
 *  one, nor a spell's effect on its target (it counts on the character it is cast on). */
export const sr6Counts = (e: EffectState, on = false) => counts(e, on)

/** The book's lists of which skills a test type covers (a vocabulary, as importer/sr6/effects.py TEST_TYPES): Social
 *  tests influence or con someone (CRB p. 97), Matrix tests are Matrix actions (CRB p. 179), magical tests the magic
 *  skills, combat tests an attack with a weapon skill. physical and mental: the skills linked to those attributes;
 *  `attr-<abbr>`: the skills linked to that attribute. */
export const TEST_TYPES: Record<string, string[]> = {
  social: ['con', 'influence'],
  matrix: ['cracking', 'electronics'],
  magic: ['astral', 'conjuring', 'enchanting', 'sorcery'],
  resonance: ['tasking'],
  combat: ['close combat', 'exotic weapons', 'firearms'],
  vehicle: ['piloting'],
}
const LINKED: Record<string, Sr6Attr[]> = { physical: ['bod', 'agi', 'rea', 'str'], mental: ['wil', 'log', 'int', 'cha'] }

/** The skill ids a test type covers (`social`, `attr-cha`, `physical`); [] for one no skill rolls (resistance tests). */
export function testSkills(data: Sr6Data, type: string): string[] {
  const skills = Object.values(data.skills)
  const attrs = type.startsWith('attr-') ? [type.slice(5)] : LINKED[type]
  if (attrs) return skills.filter(s => attrs.includes(s.attr)).map(s => s.id)
  const names = TEST_TYPES[type] ?? []
  return skills.filter(s => names.includes(normName(s.name))).map(s => s.id)
}

/** A printed effect value as a bonus's: a number; so much per rating or level (`R`, `-R`, `R*2`, `2*R`); so much per
 *  level after the first (`R-1`, `R*2-2`: minus); or the book's own value per rating (`R[1,1,2,2]`: byRating; owner
 *  decisions 2026-10-11). undefined: a formula over attributes (`edg/2`), a percent or a band list (`0,1,1,0,0`), shown only. */
export function effectValue(v: string | undefined): { value: number; perRating?: true; minus?: number; byRating?: number[] } | undefined {
  const s = (v ?? '').replace(/\s+/g, '')
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return { value: Number(s) }
  const list = /^R\[((?:-?\d+(?:\.\d+)?)(?:,-?\d+(?:\.\d+)?)*)\]$/.exec(s)
  if (list) {
    const by = list[1].split(',').map(Number)
    return { value: by[0], byRating: by }
  }
  const m = /^(-?)R(?:\*(-?\d+(?:\.\d+)?))?(?:-(\d+(?:\.\d+)?))?$/.exec(s) ?? /^(-?)(?:(\d+(?:\.\d+)?)\*)R(?:-(\d+(?:\.\d+)?))?$/.exec(s)
  return m ? { value: (m[1] ? -1 : 1) * Number(m[2] ?? 1), perRating: true, ...(m[3] ? { minus: Number(m[3]) } : {}) } : undefined
}

/** What a bonus gives at a rating or level (the one place it is counted: budgets, the export): its value times the
 *  rating when per rating, less its `minus` (`R-1`: nothing at rating 1), or its table's value for that rating
 *  (`byRating`: the last one beyond the table). */
export function bonusValue(b: Pick<Bonus, 'value' | 'perRating' | 'minus' | 'byRating'>, rating: number): number {
  if (b.byRating?.length) return b.byRating[Math.min(Math.max(1, Math.round(rating)), b.byRating.length) - 1]
  if (!b.perRating) return b.value
  return b.minus ? Math.max(0, rating * b.value - b.minus) : rating * b.value // (`R*2-2`: twice the rating, less 2: none at rating 1)
}

const DERIVED_BONUS: Record<string, Bonus['target']> = {
  'derived:defense': 'defense',
  'derived:initiative-dice': 'initDice',
  'derived:physical-monitor': 'physical',
  'derived:stun-monitor': 'stun',
  'derived:overflow': 'overflow',
  'derived:unarmed-ar': 'unarmedAR',
  'derived:unarmed-dv': 'unarmedDV',
  'derived:movement': 'movement',
  'derived:matrix-initiative-dice': 'matrixInitDice',
}

/** The entries an entry grants or works as (its <link> parts): by id, else by the printed name in the kind it names
 *  (or any kind). */
export function linkedEntries(data: Sr6Data, e: Sr6Entry | undefined): { part: Sr6Part; entry: Sr6Entry }[] {
  const out: { part: Sr6Part; entry: Sr6Entry }[] = []
  for (const p of e?.parts ?? []) {
    if (p.tag !== 'link') continue
    const kind = p.attrs.kind as Sr6Kind | undefined,
      ref = p.attrs.ref,
      level = Number(p.attrs.level)
    let found = (ref && kind ? data.entry(kind, ref) : undefined) ?? data.named?.(p.attrs.name ?? '', kind)
    // (`1 free level of Rapid Healing`, `Mystic Armor 2`: that level of the family, levels.ts)
    if (found && level >= 1) found = data.atLevel?.(found.kind, found.id, level) ?? found
    if (found && found !== e) out.push({ part: p, entry: found })
  }
  return out
}

/** An entry's effects as bonuses: an `add` effect on an attribute, a derived value the engine counts (Defense Rating,
 *  initiative dice, condition monitor boxes), a skill's pool, or a test type's skills' pools; with the effects of the
 *  entries it grants or works as. Each keeps how it is turned on, its condition, its specialization and whom it affects:
 *  the always-on ones count in the total shown first, the switchable and conditional ones in the bracketed total (owner
 *  decision 2026-10-10). A low-confidence one is shown, never applied (owner decision D3). */
export function effectBonuses(data: Sr6Data, e: Sr6Entry | undefined, depth = 0, choice: { skill?: string; attr?: Sr6Attr } = {}): Bonus[] {
  const out: Bonus[] = []
  const skillId = (name: string) => Object.values(data.skills).find(v => normName(v.name) === name.replace(/-/g, ' '))?.id
  // (a power's or quality's chosen skill or attribute, its note's: `skill:choice` on Improved Ability's skill; never an
  // `attr:choice` read beside an `attr-max:choice`, the maximum's)
  const maxed = (e?.parts ?? []).some(x => x.tag === 'effect' && x.attrs.target === 'attr-max:choice')
  for (const x of e?.parts ?? []) {
    const a = x.attrs,
      t =
        a.target === 'skill:choice' && choice.skill
          ? `skill:${choice.skill}`
          : a.target === 'attr:choice' && choice.attr && !maxed
            ? `attr:${choice.attr}`
            : (a.target ?? ''),
      v = effectValue(a.value)
    if (x.tag !== 'effect' || a.op !== 'add' || a.confidence === 'low' || !v || a.affects === 'others') continue // (others': never the runner's, owner decision 16)
    const sw = (BONUS_SWITCHES as string[]).includes(a.switch ?? '') ? (a.switch as Bonus['switch']) : undefined
    const state = {
      ...(v.perRating ? { perRating: true as const } : {}),
      ...(v.minus ? { minus: v.minus } : {}),
      ...(v.byRating ? { byRating: v.byRating } : {}),
      ...(a.when ? { when: a.when } : {}),
      ...(sw ? { switch: sw } : {}),
      ...(a.affects === 'caster' || a.affects === 'target' ? { affects: a.affects as Bonus['affects'] } : {}),
    }
    if (t.startsWith('attr:') && (SR6_ATTRS as string[]).includes(t.slice(5))) out.push({ target: t.slice(5) as Sr6Attr, value: v.value, ...state })
    else if (DERIVED_BONUS[t] && !(e?.kind === 'armor' && t === 'derived:defense'))
      // (armor: its defense field, derive.ts)
      out.push({ target: DERIVED_BONUS[t], value: v.value, ...state })
    else if (t.startsWith('skill:')) {
      const sk = choice.skill && t === `skill:${choice.skill}` ? choice.skill : skillId(t.slice(6))
      if (sk) out.push({ target: 'skill', skill: sk, value: v.value, ...state, ...(a.spec ? { spec: a.spec } : {}) })
    } else if (t.startsWith('test:')) for (const sk of testSkills(data, t.slice(5))) out.push({ target: 'skill', skill: sk, value: v.value, ...state })
  }
  // (a grant that holds only sometimes, `while in animal form`: its effects too)
  if (depth < 2)
    for (const l of linkedEntries(data, e))
      out.push(...effectBonuses(data, l.entry, depth + 1).map(b => (l.part.attrs.when ? { ...b, when: l.part.attrs.when } : b)))
  return out
}

/** The attribute maxima an entry's effects set or raise (an infected type's table, `maximum Body and Strength by one
 *  point`): attribute -> { set?, add }; `choice`: a chosen attribute's (`attr-max:choice`: Exceptional, Impaired), which
 *  the attribute the quality's note names takes (budgets.ts attrMax). One with a `when` holds only when it names the
 *  runner's metatype or its parent (`metatype`: the names, an Infected type's table row, `when="Human"`); any other `when` never. */
export function maxEffects(
  e: Sr6Entry | undefined,
  ...metatype: string[]
): Partial<Record<Sr6Attr | 'choice', { set?: number; add: number; perRating?: true }>> {
  const out: Partial<Record<Sr6Attr | 'choice', { set?: number; add: number; perRating?: true }>> = {}
  for (const x of e?.parts ?? []) {
    const t = x.attrs.target ?? '',
      v = effectValue(x.attrs.value)
    if (x.tag !== 'effect' || !t.startsWith('attr-max:') || x.attrs.confidence === 'low' || !v) continue
    if (x.attrs.when && !metatype.some(m => m && normName(x.attrs.when) === normName(m))) continue
    const k = t.slice(9) as Sr6Attr | 'choice'
    if (!(SR6_ATTRS as string[]).includes(k) && k !== 'choice') continue
    const cur = out[k] ?? { add: 0 }
    if (x.attrs.op === 'set') cur.set = v.value
    else if (x.attrs.op === 'add') {
      cur.add += v.value
      if (v.perRating) cur.perRating = true
    }
    out[k] = cur
  }
  return out
}

const ATTR_WORDS: Record<string, string> = {
  bod: 'Body',
  agi: 'Agility',
  rea: 'Reaction',
  str: 'Strength',
  wil: 'Willpower',
  log: 'Logic',
  int: 'Intuition',
  cha: 'Charisma',
  edg: 'Edge',
  mag: 'Magic',
  res: 'Resonance',
  ess: 'Essence',
  choice: 'a chosen attribute',
}
const DERIVED_WORDS: Record<string, string> = {
  defense: 'Defense Rating',
  'defense-astral': 'astral Defense Rating',
  social: 'Social Rating',
  initiative: 'Initiative',
  'initiative-dice': 'Initiative Dice',
  'matrix-initiative': 'Matrix Initiative',
  'matrix-initiative-dice': 'Matrix Initiative Dice',
  'physical-monitor': 'Physical boxes',
  'stun-monitor': 'Stun boxes',
  'matrix-monitor': 'Matrix boxes',
  overflow: 'Damage Overflow boxes',
  composure: 'Composure',
  'judge-intentions': 'Judge Intentions',
  memory: 'Memory',
  lift: 'Lift/Carry',
  movement: 'movement',
  'minor-actions': 'Minor Actions',
  'major-actions': 'Major Actions',
  'hardened-armor': 'Hardened Armor',
  'damage-reduction': 'damage reduction',
  'monthly-cost': 'monthly cost (¥)',
  'power-points': 'Power Points',
  'unarmed-ar': 'unarmed Attack Rating',
  'unarmed-dv': 'unarmed Damage Value',
  'unarmed-damage': 'unarmed damage',
}
const ITEM_WORDS: Record<string, string> = {
  ar: 'Attack Rating',
  dv: 'Damage Value',
  'speed-interval': 'Speed Interval',
  'top-speed': 'Top Speed',
  ammo: 'ammunition',
}
const PRICE_WORDS: Record<string, string> = { armor: 'armor and clothing prices', lifestyle: 'lifestyle costs', gear: 'gear prices', everything: 'all prices' }
const words = (s: string) => s.replace(/-/g, ' ')
const title = (s: string) => words(s).replace(/(^| )\w/g, m => m.toUpperCase())

/** `attr:agi` -> Agility, `skill:close-combat` -> Close Combat, `test:social` -> Social tests, `derived:defense` -> Defense
 *  Rating, `item:ar` -> Attack Rating, `matrix:overwatch` -> Overwatch Score, `action:wrest` -> the Wrest Edge action. */
export function targetText(t: string): string {
  const i = t.indexOf(':'),
    k = t.slice(0, i),
    v = t.slice(i + 1)
  if (k === 'attr') return ATTR_WORDS[v] ?? v
  if (k === 'attr-max') return `maximum ${ATTR_WORDS[v] ?? v}`
  if (k === 'skill') return v === 'choice' ? 'a chosen skill' : title(v)
  if (k === 'skill-max') return v === 'choice' ? 'a chosen skill’s maximum' : `maximum ${title(v)}`
  if (k === 'action-max') return `the ${title(v)} action’s maximum bonus`
  if (k === 'sense') return title(v)
  if (k === 'pool') return v === 'chase' ? 'the chase pool’s Edge' : `the ${title(v)} pool`
  if (k === 'pricemod') return PRICE_WORDS[v] ?? `${title(v)} prices`
  if (k === 'complex-form') return `the ${title(v)} complex form`
  if (k === 'test') {
    if (v.startsWith('attr-')) return `tests using ${ATTR_WORDS[v.slice(5)] ?? v.slice(5)}`
    if (v.startsWith('spell-')) return `${title(v.slice(6))} spells`
    return v === 'all' ? 'all tests' : v === 'other' ? 'those tests' : `${title(v)} tests`
  }
  if (k === 'derived') return DERIVED_WORDS[v] ?? title(v)
  if (k === 'matrix') return v === 'overwatch' ? 'Overwatch Score' : v === 'choice' ? 'a chosen Matrix attribute' : title(v)
  if (k === 'item') return ITEM_WORDS[v] ?? title(v)
  if (k === 'action') return `the ${title(v)} Edge action`
  if (k === 'lifestyle') return `${title(v)} (lifestyle points)`
  if (k === 'resource') return title(v)
  return t
}

const valueText = (v: string) => {
  if (/^-?R$/.test(v)) return v.startsWith('-') ? '−rating' : 'rating'
  const after = /^R(?:\*(\d+))?-(\d+)$/.exec(v)
  if (after) return `${after[1] ? `${after[1]} × ` : ''}(rating − ${after[2]})`
  const by = /^R\[(.*)\]$/.exec(v)
  if (by) return `${by[1].split(',').join('/')} by rating`
  const formula = /^(-?)([a-z][a-z-]*)\/(\d+)(?: (RD|RU))?$/.exec(v) // (`edg/2 RD`: half Edge, rounded down; owner decision 2026-10-11)
  if (formula)
    return `${formula[1]}${ATTR_WORDS[formula[2]] ?? words(formula[2])} ÷ ${formula[3]}${formula[4] ? ` (round ${formula[4] === 'RD' ? 'down' : 'up'})` : ''}`
  if (/^-?[a-z]{3}$/.test(v) && ATTR_WORDS[v.replace('-', '')]) return `${v.startsWith('-') ? '−' : ''}${ATTR_WORDS[v.replace('-', '')]}`
  if (v.includes(','))
    return v
      .split(',')
      .map(x => (x === 'x' ? '— (removed)' : Number(x) > 0 ? `+${x}` : x === '0' ? '–' : x))
      .join('/')
  if (v === 'N') return 'native'
  if (v === 'R/-R') return '+rating on-road, −rating off-road'
  if (/^0\.\d+$/.test(v)) return `${Math.round(Number(v) * 100)}%`
  const r = /^R\*(-?[\d.]+)$/.exec(v) ?? /^(-?[\d.]+)\*R$/.exec(v)
  if (r) return `${r[1]} × rating`
  return v
}
const signed = (v: string) => (/^[-–−]/.test(v) || /^R\*-/.test(v) || v.includes(',') ? valueText(v) : `+${valueText(v)}`)

/** One <effect> or <link> part as words (the hover card, Game data, the sheets): `+2 Defense Rating`, `+1 Edge on Social
 *  tests (climbing)`, `wireless: +1 Attack Rating`, `grants Built Tough`. */
export function effectText(p: Sr6Part): string {
  const a = p.attrs
  if (p.tag === 'link') return `${a.rel === 'as' ? 'works as' : 'grants'} ${a.name}${a.level ? ` ${a.level}` : ''}${a.when ? ` (${a.when})` : ''}`
  const skill = (a.target ?? '').startsWith('skill:') && a.target !== 'skill:choice'
  const t =
    a.target === 'test:other' && a.when
      ? `tests for ${a.when}`
      : `${targetText(a.target ?? '')}${a.spec ? ` (${a.spec})` : ''}${skill ? (a.op === 'add' || a.op === 'set' ? ' dice' : ' tests') : ''}`
  const v = a.value ?? ''
  const when = [
    a.when && a.target !== 'test:other' ? a.when : '',
    a.affects === 'caster' ? 'affects the caster' : a.affects === 'others' ? 'affects others' : '',
  ]
    .filter(Boolean)
    .join(', ')
  const how = `${a.affects === 'target' ? 'on the target: ' : a.affects === 'others' ? 'others get: ' : ''}${a.switch && a.switch !== 'conditional' ? `${a.switch}: ` : ''}`
  const text =
    a.op === 'set'
      ? `${t} ${valueText(v)}`
      : a.target?.startsWith('pricemod:')
        ? `${t} ${signed(v)}`
        : a.target?.startsWith('sense:')
          ? t
          : a.op === 'edge'
            ? `${signed(v)} Edge on ${t}`
            : a.op === 'edge-cost'
              ? `Edge boosts and actions cost ${valueText(v.replace(/^[-–−]/, ''))} ${/^[-–−]/.test(v) ? 'less' : 'more'} on ${t}`
              : a.op === 'edge-cost-set'
                ? `${t} costs ${v} Edge`
                : a.op === 'no-edge'
                  ? `no Edge spent on ${t}`
                  : a.op === 'no-edge-gain'
                    ? `no Edge gained on ${t}`
                    : a.op === 'wild-die'
                      ? `a wild die on ${t}`
                      : a.op === 'hits'
                        ? `${signed(v)} hits on ${t}`
                        : a.op === 'threshold'
                          ? `threshold ${signed(v)} on ${t}`
                          : `${signed(v)} ${t}`
  return `${how}${text}${when ? ` (${when})` : ''}`
}

/** How an effect is used: applied (always on, read with confidence: in the total shown first), conditional (switched
 *  on, or some tests or a specialization only: in the bracketed total), target (a spell's on its target: never on the
 *  caster), or low (shown, never applied). */
export function effectState(p: Sr6Part): 'applied' | 'conditional' | 'target' | 'low' {
  if (p.tag === 'link') return p.attrs.when ? 'conditional' : 'applied'
  if (p.attrs.confidence === 'low') return 'low'
  if (p.attrs.affects === 'target' || p.attrs.affects === 'others') return 'target' // (never counted on the runner)
  return p.attrs.switch || p.attrs.when || p.attrs.spec ? 'conditional' : 'applied'
}
