// What both games' effects carry beyond their own target (SR6's Bonus, Anarchy's EffectPick): how an effect is turned
// on, the tests it holds on, how sure the importer is of it, the entry it was given by and who it affects. One rule for
// both games: an effect counts unless it is low confidence or holds only `when`; a switchable one (wireless, activated,
// sustained) counts only with it switched on, so a total is shown as the books print it, without them and in brackets
// with them: `1 (2)` (owner, 2026-10-10). A line's own entered effects override its catalog entry's.

/** How an effect is turned on (absent: always on): a wireless bonus, ware or a power activated, a sustained spell or
 *  power, or one holding on some tests only. */
export type EffectSwitch = 'wireless' | 'activated' | 'sustained' | 'conditional'
export const EFFECT_SWITCHES: EffectSwitch[] = ['wireless', 'activated', 'sustained', 'conditional']

export interface EffectState {
  switch?: EffectSwitch
  /** only on some tests or in some situations (`at night`, `while in VR`): shown, never added */
  when?: string
  /** low: read from a sentence the importer isn't sure of (a value that depends on hits, a condition): shown, never added */
  confidence?: 'low'
  /** the catalog id of the entry this effect is given by ("identical to the Initiative Enhancement Amps", "like an elf") */
  from?: string
  /** a spell's or complex form's: on the one who casts or threads it, or on its target(s) (absent: the character's own) */
  affects?: 'caster' | 'target'
}

/** Whether an effect can count at all (owner rule: low-confidence and `when` effects are shown, not applied). */
export const applies = (e: EffectState) => e.confidence !== 'low' && !e.when

/** Whether it is turned on and off (wireless, activated, sustained): counted in the bracketed total only. */
export const isSwitchable = (e: EffectState) => !!e.switch && e.switch !== 'conditional'

/** Whether it counts in a total: the plain one (`on` false: always-on effects) or the bracketed one (`on`: switched on). */
export const counts = (e: EffectState, on: boolean) => applies(e) && (on || !isSwitchable(e))

/** A total as the books print a switchable bonus: `1`, or `1 (2)` when switching its effects on changes it. */
export const bracketed = (off: number | string, on?: number | string) => (on === undefined || String(on) === String(off) ? `${off}` : `${off} (${on})`)

/** A line's effects: the player's or GM's own entered ones when it has any (they override), else its catalog entry's. */
export const own = <T>(entered: T[] | undefined, catalog: T[] | undefined): T[] => (entered?.length ? entered : catalog ?? [])

/** An effect's state read from an element's attributes; unknown switch or affects values are dropped. */
export function readEffectState(get: (name: string) => string | null | undefined): EffectState {
  const sw = get('switch'), when = get('when'), from = get('from'), affects = get('affects')
  return {
    ...(EFFECT_SWITCHES as string[]).includes(sw ?? '') ? { switch: sw as EffectSwitch } : {},
    ...when ? { when } : {}, ...get('confidence') === 'low' ? { confidence: 'low' as const } : {}, ...from ? { from } : {},
    ...affects === 'caster' || affects === 'target' ? { affects } : {},
  }
}

/** The state as XML attributes (undefined ones left out by the writer). */
export const effectStateAttrs = (e: EffectState) => ({ switch: e.switch, when: e.when, confidence: e.confidence, from: e.from, affects: e.affects })

/** How it is turned on and whether it counts, for a line of text: `sustained`, `at night`, `affects target(s)`, `not
 *  applied` (low confidence; a `when` already says it holds only then). */
export function effectHow(e: EffectState): string {
  const when = e.when && (/^(?:when|whenever|while|if|unless|as long as|during|at|in|once|against|on)\b/i.test(e.when) ? e.when : `when ${e.when}`)
  return [e.switch && e.switch !== 'conditional' ? e.switch : '', when ?? '', e.affects === 'target' ? 'affects target(s)' : '',
    e.confidence === 'low' ? 'not applied' : ''].filter(Boolean).join(', ')
}
