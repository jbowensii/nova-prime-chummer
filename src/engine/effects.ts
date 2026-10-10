// What both games' effects carry beyond their own target (SR6's Bonus, Anarchy's EffectPick): how an effect is turned
// on, the tests it holds on, how sure the importer is of it, and the entry it was given by. One rule for both games: an
// effect counts in the totals unless it is low confidence or holds only `when`; a line's own entered effects override
// its catalog entry's.

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
}

/** Whether an effect counts in the totals (owner rule: low-confidence and `when` effects are shown, not applied). */
export const applies = (e: EffectState) => e.confidence !== 'low' && !e.when

/** A line's effects: the player's or GM's own entered ones when it has any (they override), else its catalog entry's. */
export const own = <T>(entered: T[] | undefined, catalog: T[] | undefined): T[] => (entered?.length ? entered : catalog ?? [])

/** An effect's state read from an element's attributes; unknown switch values are dropped. */
export function readEffectState(get: (name: string) => string | null | undefined): EffectState {
  const sw = get('switch'), when = get('when'), from = get('from')
  return {
    ...(EFFECT_SWITCHES as string[]).includes(sw ?? '') ? { switch: sw as EffectSwitch } : {},
    ...when ? { when } : {}, ...get('confidence') === 'low' ? { confidence: 'low' as const } : {}, ...from ? { from } : {},
  }
}

/** The state as XML attributes (undefined ones left out by the writer). */
export const effectStateAttrs = (e: EffectState) => ({ switch: e.switch, when: e.when, confidence: e.confidence, from: e.from })

/** How it is turned on and whether it counts, for a line of text: `sustained`, `at night`, `not applied` (low confidence;
 *  a `when` already says it holds only then). */
export function effectHow(e: EffectState): string {
  const when = e.when && (/^(?:when|whenever|while|if|unless|as long as|during|at|in|once|against|on)\b/i.test(e.when) ? e.when : `when ${e.when}`)
  return [e.switch && e.switch !== 'conditional' ? e.switch : '', when ?? '',
    e.confidence === 'low' ? 'not applied' : ''].filter(Boolean).join(', ')
}
