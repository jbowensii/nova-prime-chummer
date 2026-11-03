// SR6 creation rules: typed readers of a rule set, and the levels of play (LEVELS, SETS, levelRules) (see creation.ts).
import { type RunnerRule } from '../../formats/domain/character'
import { type CreationRules } from './creation-types'

export const num = (cr: CreationRules, key: string) => {
  const v = cr.get(key)?.value
  return typeof v === 'number' ? v : undefined
}
/** num, an unset setting counting 0. */
export const n0 = (cr: CreationRules, key: string) => num(cr, key) ?? 0
export const flag = (cr: CreationRules, key: string) => {
  const v = cr.get(key)?.value
  return typeof v === 'boolean' ? v : undefined
}
export const str = (cr: CreationRules, key: string) => {
  const v = cr.get(key)?.value
  return typeof v === 'string' ? v : undefined
}

/** The levels of play that replace other settings' values while on (the Sixth World Companion's Alternate Power Levels,
 *  pp. 14–15): the level's key, then [the setting it replaces, the level's own setting holding the value]. */
export const LEVELS: [string, [string, string][]][] = [
  [
    'levelSwcStreet',
    [
      ['sumToTenTarget', 'swcStreet.sumToTen'],
      ['pointBuy.total', 'swcStreet.pointBuy'],
      ['lifepath.moduleCount', 'swcStreet.modules'],
      ['priorityLetters', 'swcStreet.letters'],
      ['karmaBuild.start', 'swcStreet.karmaBuild'],
    ],
  ],
  [
    'levelSwcElite',
    [
      ['sumToTenTarget', 'swcElite.sumToTen'],
      ['pointBuy.total', 'swcElite.pointBuy'],
      ['lifepath.moduleCount', 'swcElite.modules'],
      ['priorityLetters', 'swcElite.letters'],
      ['karmaBuild.start', 'swcElite.karmaBuild'],
    ],
  ],
  // L2 (owner, 2026-10-11): the GM's own carry-over limits in place of the book's
  [
    'ownCarryOver',
    [
      ['maxKarmaLeft', 'carryOver.karma'],
      ['maxNuyenLeft', 'carryOver.nuyen'],
    ],
  ],
]
/** The three power levels the Method tab offers, as the Sixth World Companion's levels of play (pp. 14–15): Standard is
 *  neither the Street nor the Elite level on; each of the other two is its own level on (the two can't both be on: a
 *  RULE_DEPS conflict). */
export type PowerLevel = 'standard' | 'street' | 'elite'
/** The level-of-play toggle each non-standard power level maps to. */
export const POWER_LEVEL_KEYS: Record<Exclude<PowerLevel, 'standard'>, string> = { street: 'levelSwcStreet', elite: 'levelSwcElite' }
/** The power level these rules are at: Elite or Street when its level is on, else Standard. */
export const powerLevelOf = (cr: CreationRules): PowerLevel => (flag(cr, 'levelSwcElite') ? 'elite' : flag(cr, 'levelSwcStreet') ? 'street' : 'standard')
/** The runner-rule overrides that pin a runner to `level`: both level toggles set (one on, both others off) so they
 *  override whatever the table has; assumed, so Review notes them. Removing them lets the runner track the table again. */
export const powerLevelRules = (level: PowerLevel): RunnerRule[] =>
  (Object.entries(POWER_LEVEL_KEYS) as [Exclude<PowerLevel, 'standard'>, string][]).map(([l, key]) => ({
    key,
    value: String(l === level),
    assumed: true as const,
  }))

/** House rules whose number is the rule itself: while the toggle is on, the setting takes that number (owner's decisions
 *  21 and 17, 2026-10-11: no book prints them). [toggle, setting, value] */
export const SETS: [string, string, number][] = [
  ['eliteSumToThirteen', 'sumToTenTarget', 13],
  ['availabilitySeven', 'maxAvailability', 7],
]
/** The rules with a level of play that is on put in place: its own values (with its source and page) instead of the
 *  settings they replace (a value the level leaves unset keeps the setting's). Two levels on: the later one's. Then a
 *  house rule of SETS that is on sets its number. */
export function levelRules(cr: CreationRules): CreationRules {
  const on = LEVELS.filter(([k]) => flag(cr, k)),
    sets = SETS.filter(([k]) => flag(cr, k))
  if (!on.length && !sets.length) return cr
  const out: CreationRules = new Map(cr)
  for (const [, pairs] of on)
    for (const [key, from] of pairs) {
      const v = cr.get(from)
      if (v) out.set(key, { ...v, key })
    }
  for (const [k, key, value] of sets) out.set(key, { ...cr.get(k)!, key, value })
  return out
}
