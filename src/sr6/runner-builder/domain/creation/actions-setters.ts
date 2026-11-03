// Build actions, the character-level setters (method, letters, metatype, magic kind, reconcile) and the Infected type.
import { newId } from '../../../../core/shared/types'
import {
  type CpPool,
  type Letter,
  type MagicKind,
  type PriorityColumn,
  type Sr6Build,
  type Sr6Character,
  type Sr6Method,
} from '../../../formats/domain/character'
import { type CreationRules } from '../../../table-setup/domain/creation'
import { MAGIC_KINDS, picksFor, type Sr6Data } from '../../../catalog/domain/data'
import { makeProvider } from './providers'
import { infectedOff } from '../assets/critterware'
import { addGrants } from './surge'
import { isAnimalism } from './animalism'
import { boughtKind, infectedFit, infectedKind, infectedOf, runnerInfected } from './infected'
import { no, OK, type Result } from './actions-helpers'
const LETTER_METHODS = new Set<Sr6Method>(['priority', 'sumtoten'])

/** Switch method. Spends that still mean something stay; point buy's character points, lifepath's modules and the
 *  priority letters go when their method is left; then reconcile. */
export function setMethod(ch: Sr6Character, method: Sr6Method, data: Sr6Data, cr: CreationRules): void {
  const b = ch.build
  if (b.method === 'pointbuy' && method !== 'pointbuy') for (const k of Object.keys(b.cp) as CpPool[]) b.cp[k] = 0
  if (b.method === 'lifepath' && method !== 'lifepath') b.lifepath = []
  if (LETTER_METHODS.has(b.method) && !LETTER_METHODS.has(method)) for (const k of Object.keys(b.priorities) as PriorityColumn[]) b.priorities[k] = null
  b.method = method
  reconcile(ch, data, cr)
}

export function setPriority(ch: Sr6Character, column: PriorityColumn, letter: Letter | null, data: Sr6Data, cr: CreationRules): void {
  ch.build.priorities[column] = letter
  reconcile(ch, data, cr)
}

/** Pick the metatype ('' for none): the old one's free traits go, the new one's resolved traits come as free qualities. */
export function setMetatype(ch: Sr6Character, id: string, data: Sr6Data): void {
  const b = ch.build,
    m = data.metatypes[id]
  b.metatype = id
  ch.identity.metatype = id
  b.qualities = b.qualities.filter(q => !q.free)
  for (const t of m?.traits ?? []) b.qualities.push({ uid: newId(), id: t, level: m?.traitLevels?.[t] ?? 1, free: true, name: data.qualities[t]?.name })
  addGrants(b, data) // (the SURGE collective's free qualities, gone with the old traits)
}

/** Pick the magic kind the method buys: picks it can't have go, as do bought power points (unless it buys them), an
 *  initiation or submersion it can't have, the aspected skill unless it's aspected, and the spends on Magic or Resonance
 *  when the kind has no such attribute (the Attributes tab no longer shows it, so they couldn't be taken back). An
 *  Infected runner becomes the kind its type leaves the bought one (infectedKind: technomancer leaves it without
 *  Resonance, as taking the type would). */
export function setMagic(ch: Sr6Character, kind: MagicKind, data: Sr6Data, _cr: CreationRules, aspectedSkill?: string): void {
  const t = runnerInfected(ch.build, data)?.t
  infectedTo(ch.build, kind, t ? infectedKind(kind, t.awakens) : kind, aspectedSkill, data)
}
/** The runner's kind becomes `next`, the method having bought `bought`: infectedFrom keeps the bought kind while an
 *  Infected type made it another (SWC p. 105), and goes when they agree. Shared with career.ts applyAdvance. */
export function infectedTo(b: Sr6Build, bought: MagicKind, next: MagicKind, aspectedSkill?: string, data?: Sr6Data): void {
  if (next !== bought) b.infectedFrom = bought
  else delete b.infectedFrom
  magicKind(b, next, aspectedSkill, data)
}
/** (`data`: an animalism power stays whatever the kind, mundane too: owner ruling 2026-10-31, as Commlink6 has it) */
function magicKind(b: Sr6Build, kind: MagicKind, aspectedSkill?: string, data?: Sr6Data): void {
  const k = MAGIC_KINDS[kind],
    allowed = picksFor(kind)
  b.magic = kind
  if (kind === 'aspected' && aspectedSkill) b.aspectedSkill = aspectedSkill
  else if (kind !== 'aspected') delete b.aspectedSkill
  b.picks = b.picks.filter(x => allowed[x.kind] || (x.kind === 'metamagics' && !!data && isAnimalism(data.entry('metamagics', x.id))))
  if (!k.paysPowers) b.powerPointsBought = 0
  if (!k.spells && !k.powers) b.initiation = 0
  if (!k.resonance) b.submersion = 0
  if (k.spells || k.powers || k.resonance) b.transhuman = 0 // (Transhumanism is for a mundane)
  if (!k.spells && !k.powers) b.attributes.mag = { points: 0, adjust: 0, karma: 0 }
  if (!k.resonance) b.attributes.res = { points: 0, adjust: 0, karma: 0 }
  if (kind !== 'mystic-adept') delete b.mentorAdvantage
}

/** A metatype or magic kind the method (and letters) no longer allow is cleared ('' / mundane). The kind checked is the
 *  one the method bought (boughtKind); an Infected runner cleared to mundane becomes the kind its type gives a mundane
 *  (setMagic). */
export function reconcile(ch: Sr6Character, data: Sr6Data, cr: CreationRules): void {
  const b = ch.build,
    p = makeProvider(b.method, data, cr)
  if (b.metatype && !p.legalMetatypes(b).some(m => m.id === b.metatype)) setMetatype(ch, '', data)
  if (!p.legalMagic(b).some(m => m.kind === boughtKind(b))) setMagic(ch, 'mundane', data, cr)
}

/** Take the runner's Infected type (the Sixth World Companion pp. 104–106; '' none), replacing the one it has. The type
 *  Awakens a runner who isn't (Mutaqua as an adept, Nosferatu and Wendigo as magicians), makes one Awakened as the other
 *  kind a mystic adept, and takes a technomancer's Resonance (no refund): the kind before is kept in infectedFrom, and
 *  taking the type away gives it back. Its other rules are read from it where they apply (infected.ts). */
export function infect(b: Sr6Build, id: string, data: Sr6Data, cr: CreationRules): Result {
  const cur = runnerInfected(b, data),
    e = id ? data.entry('qualities', id) : undefined,
    t = infectedOf(e)
  if (id) {
    if (!t) return no('unknown-entry')
    if (cur?.line.id === id) return no('already-taken')
    if (infectedOff(e, cr)) return no('rule-off')
    if (!infectedFit(data, b.metatype, t)) return no('not-for-metatype')
  }
  const bought = boughtKind(b)
  if (cur) b.qualities = b.qualities.filter(q => q !== cur.line)
  if (t) b.qualities.push({ uid: newId(), id, level: 1, name: data.qualities[id]?.name ?? t.name })
  infectedTo(b, bought, t ? infectedKind(bought, t.awakens) : bought, undefined, data)
  return OK
}
