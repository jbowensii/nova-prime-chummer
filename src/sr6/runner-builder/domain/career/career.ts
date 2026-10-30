// Career play (S3): a TypeScript port of SR6 Forge's advancement engine (advancement-engine.mjs preview) and its
// append-only ledger (services/ledger.mjs). ch.build stays as finalized; the runner as it stands is that build with every
// live advance since the last Finalize replayed on it, so undo is a void entry that replay skips (only the newest live
// advance may be voided, so no later entry ever sits on something gone). Every price, cap and rate is a creation setting
// (the Karma prices group doubles as the career prices, plus the Advancement group); an unset price refuses its spend
// naming the setting (`unset:<key>`), an unset cap is no cap. No book numbers. A prerequisite the runner lacks never
// refuses a spend (owner, 2026-10-09): it is recorded, and Review's error stands until a GM approves it.
import { newId, type Violation } from '../../../../core/shared/types'
import {
  itemLicence,
  licenceRating,
  rateLicences,
  sinName,
  type PickKind,
  type Sr6Advance,
  type Sr6Build,
  type Sr6Character,
  type Sr6CritterQuality,
  type Sr6LedgerEntry,
  type Sr6Purchase,
  type Sr6Quality,
} from '../../../formats/domain/character'
import {
  aptitudeSkills,
  attrMax,
  manySpecs,
  powerCost,
  attrRating,
  diyAllowed,
  entryOf,
  licenceFee,
  licenceName,
  magicLoss,
  priced,
  qualityCost,
  qualityPrice,
  settingQuality,
  sinCost,
  skillRank,
  toNuyen,
} from '../creation/budgets'
import { cite, flag, num, type CreationRules } from '../../../table-setup/domain/creation'
import { MAGIC_KINDS, pickMaxLevel, type Sr6Data } from '../../../catalog/domain/data'
import { languageKarma } from '../creation/skills'
import { gradeName, gradeProblem } from '../creation/grades'
import { makeProvider, type Provider } from '../creation/providers'
import { CAREER_KEEP, validateSr6 } from '../review/rules'
import { bookValue, dataFind, ratingRange } from '../../../catalog/domain/values'
import { entryLabel } from '../../../catalog/domain/categories'
import { critterOnly, infectedOff, infectedQuality } from '../assets/critterware'
import { critterQualityKarma, isCritterQuality, taughtPrice, TRAINED_LABELS, trainedWhat } from '../assets/critters'
import type { Sr6QualityView } from '../../../catalog/domain/types'
import {
  awakenedFlag,
  boughtKind,
  freeEligible,
  freePick,
  infectedFit,
  infectedKind,
  infectedMagicMax,
  infectedOf,
  optionalPower,
  powerRefusal,
  runnerInfected,
} from '../creation/infected'
import { accessoryProblem, infectedTo, sameChoice, setPart, unfit } from '../creation/actions'
import { limbSnapshot } from '../assets/limbs'
import { mountsOf, partsOf, shiftProblem, type Mount } from '../assets/vehiclemods'
import { isSignature, learned } from '../creation/martial'

export type Preview = { ok: true; label: string; karma: number; nuyen: number } | { ok: false; reason: string }
/** Contact and Other: the amounts and label the player types. */
export interface Typed {
  karma?: number
  nuyen?: number
  label?: string
}
export interface LedgerRow {
  e: Sr6LedgerEntry
  karma: number
  nuyen: number
  voided: boolean
  reason?: string
}

/** The entries after the last Finalize (all of them for a runner finalized before S3). */
export function sinceFinalize(ch: Sr6Character): Sr6LedgerEntry[] {
  const i = ch.ledger.map(e => e.type).lastIndexOf('finalize')
  return ch.ledger.slice(i + 1)
}
export const voidedIds = (ch: Sr6Character) => new Set(ch.ledger.flatMap(e => (e.type === 'void' ? [e.eventId] : [])))
export function liveAdvances(ch: Sr6Character): Extract<Sr6LedgerEntry, { type: 'advance' }>[] {
  const voided = voidedIds(ch)
  return sinceFinalize(ch).filter((e): e is Extract<Sr6LedgerEntry, { type: 'advance' }> => e.type === 'advance' && !voided.has(e.id))
}

/** Whether an add-on changed in place by `upgrade` stays the same add-on: the same kind, and the same stat family (a custom
 *  limb's increase to another rating of the same stat; a catalog add-on the same entry at a rating it comes in, with the
 *  same choice note). `data` absent (replaying a saved step): only what needs no catalog. */
export function addonUpgradeProblem(was: Sr6Purchase, line: Sr6Purchase, data?: Sr6Data): 'not-same-addon' | 'rating-range' | null {
  if (line.kind !== was.kind) return 'not-same-addon'
  const inc = /^(custom\.limb-increase-(?:str|agi|armor)-)\d$/.exec(was.id ?? '')
  if (inc) return line.id?.startsWith(inc[1]) && limbSnapshot(line) ? null : 'not-same-addon'
  if (!was.id || line.id !== was.id || (line.note ?? '') !== (was.note ?? '')) return 'not-same-addon'
  const e = data?.entry(line.kind, line.id)
  const range = ratingRange(e?.attrs.rating)
  return data && line.rating !== undefined && range.length && !range.includes(line.rating) ? 'rating-range' : null
}

/** One advance onto the build, in place. Structural only (no catalog lookups), so it replays whatever the catalog holds. */
export function applyAdvance(b: Sr6Build, a: Sr6Advance): void {
  switch (a.op) {
    case 'attribute':
      b.attributes[a.target].karma += 1
      return
    case 'skill': {
      const s = b.skills.find(x => x.id === a.target)
      if (s) s.karma += 1
      else b.skills.push({ id: a.target, points: 0, karma: 1 })
      return
    }
    case 'spec':
    case 'expertise': {
      const s = b.skills.find(x => x.id === a.target)
      if (s && a.op === 'spec' && s.spec && s.spec !== a.name) s.specs = [...(s.specs ?? []), a.name]
      else if (s) s[a.op] = a.name
      else b.skills.push({ id: a.target, points: 0, karma: 0, [a.op]: a.name })
      return
    }
    case 'knowledge':
      b.knowledge.push(structuredClone(a.line))
      return
    case 'quality': {
      // (target: the lower level of its family it replaces, levels.ts)
      // (a repeatable one taken for a new choice (another note) is a new line: preview refused the same choice twice)
      const note = (n?: string) => (n ?? '').trim().toLowerCase()
      const had = b.qualities.find(q => (a.target ? q.uid === a.target : q.id === a.line.id && (a.single || note(q.note) === note(a.line.note))) && !q.free)
      if (had && a.target) Object.assign(had, { id: a.line.id, level: a.line.level, ...(a.line.name ? { name: a.line.name } : {}) })
      else if (had) had.level += a.line.level
      else b.qualities.push(structuredClone(a.line))
      // (an Infected type changing the kind, as at creation: actions.ts infect; voiding the advance gives the kind back)
      if (a.magic) infectedTo(b, boughtKind(b), a.magic)
      return
    }
    case 'buyoff': {
      // (a part of Stolen Gear's conversion: the line stays, with what is bought off so far)
      const q = a.part ? b.qualities.find(x => x.uid === a.target) : undefined
      if (q) q.boughtOff = (q.boughtOff ?? 0) + a.part!
      else b.qualities = b.qualities.filter(x => x.uid !== a.target)
      return
    }
    case 'pick': {
      // a leveled power taken again goes up a level (a family of levels: the lower level, target, moves to the new one)
      const had = b.picks.find(x => x.kind === a.line.kind && (a.target ? x.uid === a.target : x.id === a.line.id))
      if (had && a.target) Object.assign(had, { id: a.line.id, ...(a.line.name ? { name: a.line.name } : {}) })
      else if (had?.level !== undefined) had.level += 1
      else if (!had) b.picks.push(structuredClone(a.line))
      return
    }
    case 'martialart':
      b.martialArts.push(structuredClone(a.line))
      return
    case 'technique':
      b.martialArts.find(m => m.uid === a.target)?.techniques.push(structuredClone(a.line))
      return
    case 'powerpoint':
      b.powerPointsBought += 1
      return
    case 'initiate': {
      if (MAGIC_KINDS[b.magic].resonance) b.submersion += 1
      else b.initiation += 1
      // a metamagic taken again goes up a level (a family of levels: the lower level, target, moves to the new one)
      const had = a.line && b.picks.find(x => x.kind === a.line!.kind && (a.target ? x.uid === a.target : x.id === a.line!.id))
      if (had && a.target) Object.assign(had, { id: a.line!.id, ...(a.line!.name ? { name: a.line!.name } : {}) })
      else if (had) had.level = (had.level ?? 1) + 1
      else if (a.line) b.picks.push(structuredClone(a.line))
      return
    }
    case 'purchase':
      b.purchases.push(structuredClone(a.line))
      return
    case 'drop':
      b.purchases = b.purchases.filter(x => x.uid !== a.target)
      return
    case 'upgrade': {
      // (an add-on changed in place, e.g. a cyberlimb's Attribute increase to another rating: it keeps its place and uid)
      const host = b.purchases.find(x => x.accessories.some(y => y.uid === a.target))
      if (host) {
        host.accessories = host.accessories.map(y =>
          y.uid === a.target && !addonUpgradeProblem(y, a.line) ? { ...structuredClone(a.line), uid: a.target } : y,
        )
        return
      }
      const i = b.purchases.findIndex(x => x.uid === a.target)
      if (i >= 0) b.purchases[i] = { ...structuredClone(a.line), uid: a.target, accessories: b.purchases[i].accessories }
      return
    }
    case 'fit':
      b.purchases.find(x => x.uid === a.target)?.accessories.push(structuredClone(a.line))
      return
    case 'unfit': {
      const host = b.purchases.find(x => x.accessories.some(y => y.uid === a.target))
      if (host) unfit(host, a.target)
      return
    }
    case 'shift': {
      const host = b.purchases.find(x => x.uid === a.target)
      if (host) host.slotShifts = [...(host.slotShifts ?? []), { from: a.from, to: a.to }]
      return
    }
    case 'move': {
      const x = b.purchases.flatMap(y => y.accessories).find(y => y.uid === a.target)
      if (x) x.mount = a.mount
      return
    }
    case 'part': {
      // (price() has checked it; a replay only flips the id, so a void undoes it)
      const host = b.purchases.find(x => x.uid === a.target)
      if (!host) return
      const rest = (host.removedParts ?? []).filter(u => u !== a.part)
      host.removedParts = a.restore ? rest : [...rest, a.part]
      if (!host.removedParts.length) delete host.removedParts
      // a weapon in a mount that went with the part is out of it, as creation's setPart leaves it (an older entry: the part's own)
      if (!a.restore) {
        const gone = new Set(a.detach ?? [`part:${a.part}`])
        for (const w of host.accessories) if (w.mount && gone.has(w.mount)) delete w.mount
      }
      return
    }
    case 'bond': {
      // (a line whose uid names one of the critter's qualities upgrades it, its own how kept; one specified with the
      // purchase keeps the level it was bought at for the critter's price, paid in nuyen then: the bond paid the rest)
      const host = b.purchases.find(x => x.uid === a.target)
      if (!host) return
      const qs = (host.critterQualities ??= [])
      for (const q of [a.line, a.with]) {
        if (!q) continue
        const had = qs.find(y => y.uid === q.uid)
        if (had && !had.how) had.bought ??= { id: had.id, level: had.level }
        if (had) Object.assign(had, { id: q.id, level: q.level, ...(q.name ? { name: q.name } : {}) })
        else qs.push(structuredClone(q))
      }
      return
    }
    case 'teach': {
      const host = b.purchases.find(x => x.uid === a.target)
      if (host) host.trained = [...(host.trained ?? []), structuredClone(a.line)]
      return
    }
    case 'contact': {
      const i = b.contacts.findIndex(x => x.uid === a.line.uid)
      if (i >= 0) b.contacts[i] = structuredClone(a.line)
      else b.contacts.push(structuredClone(a.line))
      return
    }
    case 'sin': {
      // a placeholder named (line.uid its uid) keeps its lifestyles
      const i = b.sins.findIndex(x => x.uid === a.line.uid),
        line = structuredClone(a.line),
        had = b.sins[i]?.lifestyles
      if (i >= 0) b.sins[i] = had ? { ...line, lifestyles: had } : line
      else b.sins.push(line)
      return
    }
    case 'lifestyle': {
      // more months of a lifestyle the SIN has add to it, another is added; an entry from before lifestyles belonged to
      // SINs (no sin) is the first SIN's one lifestyle: more months of it, or another replacing it
      const sin = a.sin ? b.sins.find(s => s.uid === a.sin) : b.sins[0]
      if (!sin) return // charxml.ts gives an older runner with a lifestyle a SIN
      const ls = (sin.lifestyles ??= []),
        had = a.sin ? ls.find(l => l.id === a.id) : ls[0]
      if (had?.id === a.id) had.months += a.months
      else if (had) Object.assign(had, { id: a.id, months: a.months })
      else ls.push({ uid: a.uid ?? `${sin.uid}-${a.id}`, id: a.id, months: a.months })
      return
    }
    case 'awakened':
      if (a.value === undefined) delete b.awakened
      else b.awakened = a.value
      return
    case 'licensed': {
      const x = b.purchases.flatMap(y => [y, ...y.accessories]).find(y => y.uid === a.target),
        s = b.sins.find(y => y.uid === a.sin)
      if (x && s && !s.licences.some(l => l.item === x.uid)) s.licences.push(itemLicence(x, s, a.name))
      return
    }
    case 'convert':
    case 'other':
      return
  }
}

/** The runner as it stands: a draft's build, or a clone of the finalized build with the live advances replayed in order. */
export function currentBuild(ch: Sr6Character): Sr6Build {
  if (!ch.finalizedAt) return ch.build
  const b = structuredClone(ch.build)
  for (const e of liveAdvances(ch)) applyAdvance(b, e.advance)
  return b
}

/** Every entry with the karma and nuyen after it: a finalize sets both, an earning adds, an advance takes its amounts off;
 *  voided entries and voids leave them. Without any finalize entry (a runner finalized before S3) they start at `final`. */
export function ledgerRows(ch: Sr6Character): LedgerRow[] {
  const voids = new Map(ch.ledger.flatMap(e => (e.type === 'void' ? [[e.eventId, e.reason] as const] : [])))
  let karma = 0,
    nuyen = 0
  if (!ch.ledger.some(e => e.type === 'finalize')) ({ karma, nuyen } = ch.final ?? { karma: 0, nuyen: 0 })
  return ch.ledger.map(e => {
    const voided = voids.has(e.id)
    if (!voided) {
      if (e.type === 'finalize') {
        karma = e.karma
        nuyen = e.nuyen
      } else if (e.type === 'earn') {
        karma += e.karma
        nuyen += e.nuyen
      } else if (e.type === 'advance') {
        karma -= e.karma
        nuyen -= e.nuyen
      }
    }
    return { e, karma, nuyen, voided, ...(voided ? { reason: voids.get(e.id) } : {}) }
  })
}
/** An entry as the ledger shows it (and the SR6 export writes it). */
export const ledgerLabel = (e: Sr6LedgerEntry) =>
  e.type === 'finalize'
    ? 'Creation finished'
    : e.type === 'earn'
      ? `Earned: ${e.run} (${e.date})`
      : e.type === 'advance'
        ? e.label
        : e.type === 'note'
          ? e.text
          : `Voided: ${e.reason}`
export function balances(ch: Sr6Character): { karma: number; nuyen: number } {
  const last = ledgerRows(ch).at(-1)
  const base = last ? { karma: last.karma, nuyen: last.nuyen } : (ch.final ?? { karma: 0, nuyen: 0 })
  // In Debt: the debt comes off the nuyen total (debtAmount; the per-row "nuyen left" stays the raw running total)
  return { karma: base.karma, nuyen: base.nuyen - debtAmount(ch, base.nuyen) }
}
/** The In Debt debt on a nuyen total: `debtPercent`% of it, rounded (0/unset: none). */
export const debtAmount = (ch: Sr6Character, nuyen: number) => Math.round((nuyen * Math.max(0, Math.min(100, ch.debtPercent ?? 0))) / 100)
/** Set the In Debt debt percentage (0 clears it). */
export const setDebtPercent = (ch: Sr6Character, pct: number): Sr6Character => ({
  ...ch,
  debtPercent: pct > 0 ? Math.min(100, pct) : undefined,
  updatedAt: new Date().toISOString(),
})

/** Stolen Gear's converted karma not yet bought off (No Future errata, NF p. 162): the karma turned into nuyen at
 *  creation (karma.ts toNuyen) less what was bought off since (Sr6Quality.boughtOff). */
export const stolenLeft = (b: Sr6Build, cr: CreationRules, data: Sr6Data, q: Sr6Quality) => Math.max(0, toNuyen(b, cr, data) - (q.boughtOff ?? 0))

/** Adept power points after creation: an adept's are its Magic (a point per point of Magic, CRB p. 156), a mystic
 *  adept's the ones bought (the core rulebook prints no price after creation: advance.powerPoint); less the powers taken. */
export function careerPowerPoints(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): { max: number; spent: number; left: number } {
  const k = MAGIC_KINDS[b.magic]
  // (Magic as Essence leaves it, as at creation: budgets.ts powerPoints)
  // (the Sixth World Companion's Alternate Mystic Adept, p. 148: half a point for each point of Magic raised)
  const alt = k.paysPowers && !!flag(cr, 'alternateMysticAdept')
  const max = !k.powers
    ? 0
    : alt
      ? (b.powerPointsBought + Math.max(0, attrRating(b, 'mag', p) - p.magicRating(b))) / 2
      : k.paysPowers
        ? b.powerPointsBought
        : Math.max(0, attrRating(b, 'mag', p) - magicLoss(b, data, cr))
  const spent = b.picks.filter(x => x.kind === 'adeptpowers').reduce((t, x) => t + powerCost(data, x), 0)
  return { max, spent, left: Math.round((max - spent) * 100) / 100 }
}

const PICK_LABEL: Partial<Record<PickKind, string>> = { spells: 'Spell', rituals: 'Ritual', complexforms: 'Complex form', adeptpowers: 'Adept power' }
const fmt = (x: number) => x.toLocaleString('en-US')
class Refused {
  reason: string
  constructor(reason: string) {
    this.reason = reason
  }
}
const no = (reason: string): never => {
  throw new Refused(reason)
}

/** What a spend would cost (karma, nuyen; negative is gained) and its label, priced on the current build, or why not. */
export function preview(ch: Sr6Character, a: Sr6Advance, data: Sr6Data, cr: CreationRules, typed: Typed = {}): Preview {
  if (!ch.finalizedAt) return { ok: false, reason: 'not-finalized' }
  try {
    const { label, karma = 0, nuyen = 0 } = price(currentBuild(ch), a, data, cr, typed)
    if (!Number.isFinite(karma) || !Number.isFinite(nuyen)) return { ok: false, reason: 'not-a-number' }
    const bal = balances(ch)
    if (karma > 0 && bal.karma - karma < 0) return { ok: false, reason: 'not-enough-karma' }
    if (nuyen > 0 && bal.nuyen - nuyen < 0) return { ok: false, reason: 'not-enough-nuyen' }
    return { ok: true, label, karma, nuyen }
  } catch (e) {
    if (e instanceof Refused) return { ok: false, reason: e.reason }
    throw e
  }
}

function price(b: Sr6Build, a: Sr6Advance, data: Sr6Data, cr: CreationRules, typed: Typed): { label: string; karma?: number; nuyen?: number } {
  const p = makeProvider(b.method, data, cr),
    k = MAGIC_KINDS[b.magic]
  const need = (key: string) => num(cr, key) ?? no(`unset:${key}`)
  const skillName = (id: string) => data.skills[id]?.name ?? id
  const lineLabel = (x: Sr6Purchase) => (e => (e ? entryLabel(e) : (x.name ?? 'Custom item')))(x.id ? data.entry(x.kind, x.id) : undefined)
  switch (a.op) {
    case 'attribute': {
      const t = a.target
      if ((t === 'mag' && !k.spells && !k.powers) || (t === 'res' && !k.resonance)) no('unknown-attribute')
      const cur = attrRating(b, t, p)
      // CRB pp. 167, 195: Magic or Resonance tops out at magicMax plus the initiation (submersion) grade
      const cap =
        t === 'mag'
          ? (infectedMagicMax(b, data, cr) ?? need('magicMax') + b.initiation)
          : t === 'res'
            ? need('magicMax') + b.submersion
            : attrMax(data, cr, b, t)
      if (cap !== undefined && cur >= cap) no('at-maximum')
      return { label: `${t.toUpperCase()} ${cur} → ${cur + 1}`, karma: (cur + 1) * need('karmaAttrPerRank') }
    }
    case 'skill': {
      const s = b.skills.find(x => x.id === a.target)
      if (!s && !data.skills[a.target]) no('unknown-entry')
      // (the Sixth World Companion's Unrestricted Skill Ranks, p. 153: no cap after creation)
      const cur = s ? skillRank(s) : 0,
        cap = flag(cr, 'unrestrictedSkillRanks') ? undefined : num(cr, 'advance.skillMax')
      // CRB Hong Kong p. 70: the aptitude quality lets the selected skill go as far above the cap as it does at creation
      // (10 instead of 9); one whose note names no skill, any one skill
      const up = (num(cr, 'skillCapAptitude') ?? 0) - (num(cr, 'skillCap') ?? 0),
        named = aptitudeSkills(data, cr, b)
      const aptitude = !!named && up > 0 && (named.length ? named.includes(a.target) : !b.skills.some(x => x.id !== a.target && skillRank(x) > cap!))
      if (cap !== undefined && cur >= cap + (aptitude ? up : 0)) no('at-maximum')
      return { label: `${skillName(a.target)} ${cur} → ${cur + 1}`, karma: (cur + 1) * need('karmaSkillPerRank') }
    }
    case 'spec':
    case 'expertise': {
      // on a skill without a rank, an expertise without a specialization or below advance.expertiseRank: recorded (Review's
      // skill.specUntrained, skill.expertiseSpec, skill.expertiseRank)
      const s = b.skills.find(x => x.id === a.target)
      if (!s && !data.skills[a.target]) no('unknown-entry')
      // (a further specialization: Exotic Weapons', CRB Hong Kong p. 95, or any with Expanded Specializations, SWC p. 153)
      if (s?.[a.op] && !(a.op === 'spec' && manySpecs(data, cr, a.target))) no('already-known')
      if (!a.name.trim()) no('needs-name')
      return a.op === 'spec'
        ? { label: `${skillName(a.target)}: ${a.name}`, karma: need('karmaSpec') }
        : { label: `${skillName(a.target)} expertise: ${a.name}`, karma: need('advance.expertise') }
    }
    case 'knowledge':
      if (!a.line.name.trim()) no('needs-name')
      return {
        label: `${a.line.kind === 'language' ? 'Language' : 'Knowledge'}: ${a.line.name}`,
        karma: a.line.kind === 'language' ? languageKarma(b, data, need('karmaKnowledge')) : need('karmaKnowledge'),
      }
    case 'quality': {
      // an Infected quality or optional power only while the table allows Infected characters, at its own Karma: Infected
      // qualities "do not have their cost doubled when purchased during gameplay" (SWC p. 106; the optional powers, bought
      // after creation, at the table's price too)
      const e0 = data.entry('qualities', a.line.id)
      if (infectedOff(e0, cr)) no('optional-rule-off')
      // (an optional power only from the runner's Infected type's list: infected.ts powerRefusal)
      const why = optionalPower(e0) ? powerRefusal(b, data, cr, a.line.id, false) : undefined
      if (why) no(why)
      const t0 = infectedOf(e0)
      if (t0 && !infectedFit(data, b.metatype, t0)) no('not-for-metatype')
      if (t0 && runnerInfected(b, data)) no('already-infected')
      const factor = () => (infectedQuality(e0) ? 1 : need('advance.qualityFactor'))
      // a family of levels (levels.ts): the level named (or the lower one the runner has plus the levels asked), replacing
      // the lower level, at the difference in Karma
      const fam = data.family('qualities', a.line.id)
      if (fam) {
        const multi = !!data.qualities[a.line.id]?.multi
        if (multi && !a.target && sameChoice(b, data, a.line.id, a.line.note)) no('already-known')
        const cur = multi ? b.qualities.find(q => q.uid === a.target && !q.free) : b.qualities.find(q => !q.free && data.family('qualities', q.id) === fam)
        const curLevel = cur ? (data.levelOf(data.entry('qualities', cur.id)) ?? 1) : 0
        const e = data.atLevel('qualities', a.line.id, data.levelOf(data.entry('qualities', a.line.id)) ?? curLevel + (a.line.level || 1)) ?? no('at-maximum')
        const v = data.qualities[e.id],
          was = cur && data.qualities[cur.id]
        if (!v.positive) no('not-positive')
        if (v.karma === null || (was && was.karma === null)) no('book-value')
        if (cur && (data.levelOf(e) ?? 1) <= curLevel) no('already-known')
        const karma = qualityCost({ ...a.line, level: 1 }, v) - (cur && was ? qualityCost(cur, was) : 0)
        return { label: `Quality: ${v.name}`, karma: karma * factor() }
      }
      const v = data.qualities[a.line.id] ?? no('unknown-entry')
      if (v.karma === null) no('book-value')
      const had = b.qualities.find(
        q => q.id === a.line.id && !q.free && (!v.multi || (q.note ?? '').trim().toLowerCase() === (a.line.note ?? '').trim().toLowerCase()),
      )
      if (had && !v.perLevel) no('already-known')
      if (!(a.line.level >= 1)) no('below-one')
      if ((had?.level ?? 0) + a.line.level > (v.perLevel ? (v.maxLevel ?? Infinity) : 1)) no('at-maximum')
      const label = `Quality: ${v.name}${v.perLevel ? ` ${(had?.level ?? 0) + a.line.level}` : ''}`
      // a negative quality (GM-assigned) gives its Karma back, undoubled by the advance factor
      if (!v.positive) return { label, karma: -qualityCost(a.line, v) }
      // (its Awakened price, <karmaif>; the Infected free pick, p. 105, when the runner has not used it: one level free)
      const free = !freePick(b, data) && freeEligible(b, data, a.line.id) ? qualityCost({ ...a.line, level: 1 }, v) : 0
      return { label, karma: (qualityPrice(b, data, a.line, v) - free) * factor() }
    }
    case 'buyoff': {
      const q = b.qualities.find(x => x.uid === a.target) ?? no('not-taken')
      if (q.free) no('free-trait')
      const v = data.qualities[q.id] ?? no('unknown-entry')
      if (v.positive) no('not-negative')
      // No Future's errata (NF p. 162): Stolen Gear is bought off by the converted karma left, stolenGearBuyOff a karma,
      // all or a part at a time
      if (settingQuality(b, cr, 'stolenGearQuality', data) === q) {
        const left = stolenLeft(b, cr, data, q),
          part = a.part ?? left
        if (!left && a.part === undefined) return { label: `Buy off: ${v.name}, nothing converted`, karma: 0 }
        if (!Number.isInteger(part) || part < 1) no('below-one')
        if (part > left) no('more-than-left')
        return { label: `Buy off: ${v.name}, ${part} of ${left} converted karma`, karma: part * need('stolenGearBuyOff') }
      }
      if (a.part !== undefined) no('not-a-part')
      if (v.karma === null) no('book-value')
      return { label: `Buy off: ${v.name}`, karma: qualityCost(q, v) * need('advance.buyOffFactor') }
    }
    case 'pick': {
      const { kind, id } = a.line
      // (one the runner's magic kind can't learn is recorded: Review's magic.spellsAllowed; an adept power needs power points)
      if (!PICK_LABEL[kind]) no('cannot-learn')
      const e = data.entry(kind, id) ?? no('unknown-entry')
      const had = b.picks.find(x => x.kind === kind && x.id === id)
      if (kind !== 'adeptpowers') {
        if (had) no('already-known')
        return { label: `${PICK_LABEL[kind]}: ${e.name}`, karma: need(kind === 'complexforms' ? 'karmaForm' : 'karmaSpell') }
      }
      // a family of levels (levels.ts): the next level (or the one named) replaces the lower one, for the difference
      const fam = data.family(kind, id)
      if (fam) {
        const cur = b.picks.find(x => x.kind === kind && data.family(kind, x.id) === fam)
        const curLevel = cur ? (data.levelOf(data.entry(kind, cur.id)) ?? 1) : 0
        const lv = data.atLevel(kind, id, data.levelOf(e) ?? curLevel + 1) ?? no('at-maximum')
        const v = data.powers[lv.id],
          was = cur && data.powers[cur.id]
        if (cur && (data.levelOf(lv) ?? 1) <= curLevel) no('already-known')
        if (v?.cost == null || (was && was.cost == null)) no('book-value')
        // (at its price for the skill its note names: Improved Ability for a combat skill costs more; a raised line keeps its note)
        const note = cur?.note ?? a.line.note
        if (careerPowerPoints(b, data, cr, p).left < powerCost(data, { id: lv.id, note }) - (cur ? powerCost(data, { id: cur.id, note }) : 0))
          no('no-power-points')
        return { label: `Adept power: ${lv.name}`, karma: 0 }
      }
      const v = data.powers[id]
      if (had && !v?.perLevel) no('already-known')
      if (had && (had.level ?? 1) >= (v?.maxLevel ?? Infinity)) no('at-maximum')
      if (v?.cost == null) no('book-value')
      if (careerPowerPoints(b, data, cr, p).left < powerCost(data, { id, note: had?.note ?? a.line.note })) no('no-power-points') // (one level)
      return { label: `Adept power: ${e.name}${v!.perLevel ? ` ${had ? (had.level ?? 1) + 1 : 1}` : ''}`, karma: 0 }
    }
    case 'martialart': {
      // FS p. 97: a style comes with its signature technique, free; its other techniques are bought one by one
      const e = data.entry('martialarts', a.line.id) ?? no('unknown-entry')
      if (b.martialArts.some(m => m.id === e.id)) no('already-known')
      for (const t of a.line.techniques) {
        const te = data.entry('martialtechniques', t.id) ?? no('unknown-entry')
        if (!isSignature(e, te.name)) no('not-signature')
        if (learned(b).some(x => x.id === te.id)) no('already-known')
      }
      const sig = a.line.techniques.length ? ` with ${data.entry('martialtechniques', a.line.techniques[0].id)!.name}` : ''
      return { label: `Martial art: ${e.name}${sig}`, karma: need('karmaMartialArt') }
    }
    case 'technique': {
      const m = b.martialArts.find(x => x.uid === a.target) ?? no('not-taken'),
        style = data.entry('martialarts', m.id)
      const e = data.entry('martialtechniques', a.line.id) ?? no('unknown-entry')
      if (learned(b).some(x => x.id === e.id)) no('already-known')
      // (one the style doesn't teach is recorded: Review's martial.category)
      const karma = isSignature(style, e.name) ? 0 : need('karmaTechnique')
      return { label: `Technique: ${e.name} (${style?.name ?? m.name ?? m.id})`, karma }
    }
    case 'powerpoint':
      if (!k.paysPowers) no('cannot-learn')
      if (b.powerPointsBought >= attrRating(b, 'mag', p)) no('at-maximum')
      return { label: 'Power point', karma: need('advance.powerPoint') }
    case 'initiate': {
      const field = k.resonance ? 'submersion' : k.spells || k.powers ? 'initiation' : no('mundane-cannot-initiate')
      let what = ''
      if (a.line) {
        if (a.line.kind !== (k.resonance ? 'echoes' : 'metamagics')) no('cannot-learn')
        const e = data.entry(a.line.kind, a.line.id) ?? no('unknown-entry')
        // (an adept's metamagic on a magician, or a magician's on an adept, is recorded: Review's magic.metamagicUser)
        // one taken again (its text says it can be) is one more level, each with its own initiation (a family of
        // levels, levels.ts: the next level's entry)
        const fam = data.family(a.line.kind, a.line.id)
        if (fam) {
          const cur = b.picks.find(x => x.kind === a.line!.kind && data.family(a.line!.kind, x.id) === fam)
          const curLevel = cur ? (data.levelOf(data.entry(a.line.kind, cur.id)) ?? 1) : 0
          const lv = data.atLevel(a.line.kind, a.line.id, data.levelOf(e) ?? curLevel + 1) ?? no('at-maximum')
          if (cur && (data.levelOf(lv) ?? 1) <= curLevel) no('already-known')
          what = ` (${lv.name})`
        } else {
          const had = b.picks.find(x => x.kind === a.line!.kind && x.id === a.line!.id),
            max = pickMaxLevel(data, a.line.kind, a.line.id)
          if (had && max === null) no('already-known')
          if (had && (had.level ?? 1) >= max!) no('at-maximum')
          what = ` (${e.name}${had ? ` ${(had.level ?? 1) + 1}` : ''})`
        }
      }
      const next = b[field] + 1
      // CRB pp. 167, 195: the grade never exceeds Magic (Resonance)
      if (next > attrRating(b, field === 'submersion' ? 'res' : 'mag', p)) no('at-maximum')
      return {
        label: `${field === 'submersion' ? 'Submersion' : 'Initiation'} grade ${next}${what}`,
        karma: need('karmaInitiationBase') + next * need('karmaInitiationPerGrade'),
      }
    }
    case 'purchase': {
      const x = a.line
      if (!(x.qty >= 1)) no('below-one')
      // (a design's line: its snapshot, the vehicle the design worked out to; a builders' custom limb: its own)
      const e = x.id
        ? (data.entry(x.kind, x.id) ?? limbSnapshot(x) ?? (x.design || x.id.startsWith('custom.') ? x.snapshot : undefined) ?? no('unknown-entry'))
        : undefined
      const range = ratingRange(e?.attrs.rating)
      if (x.rating !== undefined && range.length && !range.includes(x.rating)) no('rating-range')
      // (a grade the augmentation's type doesn't take is recorded: Review's gear.grade)
      const gp = x.grade ? gradeProblem(cr, data, x.grade, e) : null
      if (gp) no(gp)
      // R: a cost the app can't read isn't guessed; the GM can buy it as a custom line
      const pr = priced(x, data, cr)
      if (!pr.ok) no('book-value')
      return {
        label: `${e ? entryLabel(e) : (x.name ?? 'Custom item')}${x.rating ? ` (rating ${x.rating})` : ''}${x.qty > 1 ? ` × ${x.qty}` : ''}`,
        nuyen: x.gmPrice !== undefined && x.kind === 'vehicles' && Number.isFinite(x.gmPrice) && x.gmPrice >= 0 ? x.gmPrice : pr.cost,
      }
    }
    case 'drop': {
      // selling credits an adjustable nuyen sellback (SR Missions: 30% of value by default, the owner sets it); a plain
      // drop with no refund credits nothing. A negative nuyen cost is a credit (ledgerRows/balances add it back).
      const x = b.purchases.find(y => y.uid === a.target) ?? no('unknown-line')
      const name = (x.id && (e => e && entryLabel(e))(data.entry(x.kind, x.id))) || x.name || 'Custom item'
      return a.refund ? { label: `Sold: ${name} for ${a.refund.toLocaleString('en-US')}¥`, nuyen: -a.refund } : { label: `Dropped: ${name}` }
    }
    case 'upgrade': {
      // an add-on changed in place (a cyberlimb's Attribute increase to another rating, owner ruling 2026-10-30): one step,
      // the difference between the new and old price (a lower rating is a credit of the difference)
      const accHost = b.purchases.find(y => y.accessories.some(z => z.uid === a.target))
      if (accHost) {
        const was = accHost.accessories.find(z => z.uid === a.target)!
        const problem = addonUpgradeProblem(was, a.line, data)
        if (problem) no(problem)
        const hostPr = priced({ ...accHost, accessories: [] }, data, cr)
        const now = priced(a.line, data, cr, hostPr),
          before = priced(was, data, cr, hostPr)
        if (!now.ok || !before.ok) no('book-value')
        return { label: `Changed: ${lineLabel(was)} → ${lineLabel(a.line)} on ${lineLabel(accHost)}`, nuyen: now.cost - before.cost }
      }
      // upgrade a line in place to a higher level in its family (levels.ts) and/or a different grade, paying the DIFFERENCE
      // in cost (SR Missions FAQ v2.4 p.21: same-type upgrade credits the old piece at full value). The line keeps its
      // accessories (applyAdvance), which is why cyberware/bioware is upgraded here rather than sold and re-bought.
      const old = b.purchases.find(y => y.uid === a.target) ?? no('unknown-line')
      const oldE = old.id ? (data.entry(old.kind, old.id) ?? no('unknown-entry')) : no('unknown-entry')
      const x = a.line,
        e = x.id ? (data.entry(x.kind, x.id) ?? no('unknown-entry')) : no('unknown-entry')
      const sameItem = x.kind === old.kind && x.id === old.id
      const fam = old.id && data.family(old.kind, old.id)
      const higherLevel = !!fam && data.family(x.kind, x.id) === fam && (data.levelOf(e) ?? 0) > (data.levelOf(oldE) ?? 0)
      const gradeChange = sameItem && (x.grade ?? '') !== (old.grade ?? '')
      // same family but not a higher level (and no grade change) reads as already-known; an unrelated target is not-a-level
      if (!higherLevel && !gradeChange) no(!!fam && data.family(x.kind, x.id) === fam ? 'already-known' : 'not-a-level')
      const gp = x.grade ? gradeProblem(cr, data, x.grade, e) : null
      if (gp) no(gp)
      // price the whole implant WITH its accessories on both sides: the add-ons take the implant's grade (CRB p. 282,
      // budgets.ts fitted), so upgrading the grade bumps their cost too and the difference must include it
      const pr = priced({ ...x, accessories: old.accessories }, data, cr),
        oldPr = priced(old, data, cr)
      if (!pr.ok || !oldPr.ok) no('book-value')
      const label =
        gradeChange && !higherLevel
          ? `Upgrade: ${entryLabel(e)} to ${gradeName(data, x.grade!)}`
          : `Upgrade: ${entryLabel(oldE)} → ${entryLabel(e)}${x.grade && x.grade !== old.grade ? `, ${gradeName(data, x.grade)}` : ''}`
      return { label, nuyen: pr.cost - oldPr.cost }
    }
    case 'fit': {
      // an accessory (a vehicle mod, a weapon in one of its mounts, an autosoft) on an owned line, at its price (do it
      // yourself: half, a mod only, Double Clutch p. 120); what goes past the vehicle's limits is recorded (Review warns)
      const host = b.purchases.find(y => y.uid === a.target) ?? no('unknown-host')
      const x = a.line,
        e = x.id ? (data.entry(x.kind, x.id) ?? limbSnapshot(x) ?? x.snapshot ?? no('unknown-entry')) : undefined
      const range = ratingRange(e?.attrs.rating)
      if (x.rating !== undefined && range.length && !range.includes(x.rating)) no('rating-range')
      if (x.mount !== undefined) {
        if (x.kind !== 'weapons') no('not-a-weapon')
        if (!mountsOf(host, data).some(m => m.uid === x.mount)) no('not-a-mount')
      }
      if (x.diy && !diyAllowed(e)) no('no-diy')
      if (x.derived) {
        // (a GM-derived mod: the same room test as at creation, on the freed hook)
        const why = accessoryProblem(host, x, data)
        if (why) no(why)
      }
      // (critter equipment on an owned critter only; on a critter what is printed in its Body reads at it: priced)
      if (critterOnly(e) && host.kind !== 'critters') no('critters-only')
      const pr = priced(x, data, cr, priced({ ...host, accessories: [] }, data, cr))
      if (!pr.ok) no('book-value')
      return { label: `Fit: ${lineLabel(x)}${x.rating ? ` (rating ${x.rating})` : ''}${x.diy ? ', do it yourself' : ''} on ${lineLabel(host)}`, nuyen: pr.cost }
    }
    case 'unfit': {
      // take an accessory off; selling it back credits an adjustable nuyen sellback (SR Missions: 30% of value by
      // default, the owner sets it), else it is just removed with no refund
      const host = b.purchases.find(y => y.accessories.some(z => z.uid === a.target)) ?? no('not-fitted')
      const acc = host.accessories.find(z => z.uid === a.target)!
      return a.refund
        ? { label: `Sold: ${lineLabel(acc)} off ${lineLabel(host)} for ${a.refund.toLocaleString('en-US')}¥`, nuyen: -a.refund }
        : { label: `Removed: ${lineLabel(acc)} from ${lineLabel(host)}` }
    }
    case 'shift': {
      // free: the book prints no cost (Double Clutch p. 120); a void shifts the slots back
      const host = b.purchases.find(y => y.uid === a.target) ?? no('unknown-host')
      const why = shiftProblem(host, a.from, a.to, data)
      if (why) no(why)
      return { label: `Shift mod slots: 2 ${a.from} → 1 ${a.to} on ${lineLabel(host)}` }
    }
    case 'part': {
      // a factory part off or back (decomposition plan D1/D4): free, no refund; checked on a copy, as creation's op does
      const host = b.purchases.find(y => y.uid === a.target && (y.kind === 'vehicles' || y.kind === 'weapons')) ?? no('unknown-host')
      const r = setPart(structuredClone(host), a.part, !!a.restore, data)
      if (!r.ok) no(r.reason)
      const p = partsOf(host, data).find(y => y.id === a.part)
      return { label: `${a.restore ? 'Restored' : 'Removed'} factory part: ${p?.name ?? a.part} ${a.restore ? 'on' : 'from'} ${lineLabel(host)}` }
    }
    case 'move': {
      // no new charge; the weapon's size is checked only by Review's warning (vehiclemods.ts); a void puts it back
      const host = b.purchases.find(y => y.accessories.some(z => z.uid === a.target)) ?? no('not-fitted')
      const mounts = mountsOf(host, data),
        w = host.accessories.find(z => z.uid === a.target)!,
        to = mounts.find(z => z.uid === a.mount),
        from = mounts.find(z => z.uid === w.mount)
      if (w.kind !== 'weapons') no('not-a-weapon')
      if (!to) no('not-a-mount')
      if (to!.uid === w.mount) no('same-mount')
      const said = (m: Mount) => `${m.name}${m.builtin ? ' (built in)' : ''}`
      return { label: `Moved: ${lineLabel(w)} from ${from ? said(from) : 'no mount'} to ${said(to!)} on ${lineLabel(host)}` }
    }
    case 'bond': {
      // the Critter Bond path's Permanent Improvement (SWC p. 139: a new or upgraded quality at 2 × its Karma, the
      // career quality factor), with a negative taken alongside whose bonus comes off first (Wild Life p. 184); the
      // runner's Critter Bond itself is Review's warning (critter.rules), not a refusal
      const host = b.purchases.find(y => y.uid === a.target && y.kind === 'critters') ?? no('unknown-host')
      const qs = host.critterQualities ?? []
      const view = (q: Sr6CritterQuality) => {
        const e = data.entry('qualities', q.id) ?? no('unknown-entry')
        if (!isCritterQuality(e)) no('not-a-critter-quality')
        return data.qualities[q.id] ?? no('unknown-entry')
      }
      const v = view(a.line)
      if (!v.positive) no('not-positive')
      if (!(a.line.level >= 1)) no('below-one')
      const had = qs.find(q => q.uid === a.line.uid),
        was = had && data.qualities[had.id]
      if (!had && qs.some(q => q.id === a.line.id)) no('already-taken')
      const up = critterQualityKarma(v, a.line) - (had && was ? critterQualityKarma(was, had) : 0)
      if (up <= 0) no('already-known')
      let bonus = 0
      if (a.with) {
        const n = view(a.with)
        if (n.positive) no('not-negative')
        if (qs.some(q => q.id === a.with!.id)) no('already-taken')
        bonus = critterQualityKarma(n, a.with)
      }
      const nm = (q: Sr6CritterQuality, w: Sr6QualityView) => `${w.name}${w.perLevel ? ` ${q.level}` : ''}`
      return {
        label: `Critter bond: ${nm(a.line, v)}${a.with ? ` with ${nm(a.with, data.qualities[a.with.id])}` : ''} on ${lineLabel(host)}`,
        karma: Math.max(0, up - bonus) * need('advance.qualityFactor'),
      }
    }
    case 'teach': {
      // a command or special training taught to a critter the runner owns, at the OPTIONS row's price (Wild Life p.
      // 180: +500¥, +750¥; owner 2026-10-16), no Availability; past its limit is Review's warning, not a refusal
      const host = b.purchases.find(y => y.uid === a.target && y.kind === 'critters') ?? no('unknown-host')
      const e = data.entry('actions', a.line.id ?? '') ?? no('unknown-entry')
      if (trainedWhat(e) !== a.line.what) no('not-critter-training')
      const nuyen = taughtPrice(data, a.line.what) ?? no('book-value')
      return { label: `Taught: ${e.name} (${TRAINED_LABELS[a.line.what]}) to ${lineLabel(host)}`, nuyen }
    }
    case 'contact':
      if (!(a.line.connection >= 1 && a.line.loyalty >= 1)) no('below-one')
      return { label: typed.label?.trim() || `Contact: ${a.line.name || 'unnamed'}`, karma: typed.karma, nuyen: typed.nuyen }
    case 'sin': {
      // priced as creation prices it (budgets.ts sinCost), with the settings it needs set; its licences rated as it
      const x = rateLicences(structuredClone(a.line))
      if (x.uid && !b.sins.find(s => s.uid === x.uid)?.placeholder) no('unknown-line')
      if (!x.name.trim()) no('needs-name')
      if (x.kind === 'fake' && !((x.rating ?? 1) >= 1)) no('below-one')
      if (x.licences.some(l => !l.name.trim())) no('needs-name')
      const what = [x.kind === 'real' ? 'real' : `fake, rating ${x.rating ?? 1}`, ...x.licences.map(l => `${l.name} ${l.rating}`)].join(', ')
      return { label: `SIN: ${x.name.trim()} (${what})${x.uid ? ', was the unnamed SIN' : ''}`, nuyen: sinCost(x, need) }
    }
    case 'lifestyle': {
      const sin = a.sin ? (b.sins.find(s => s.uid === a.sin) ?? no('unknown-line')) : undefined
      const e = data.entry('lifestyles', a.id) ?? no('unknown-entry')
      if (!(a.months >= 1)) no('below-one')
      const v = bookValue(e, 'cost', undefined, dataFind(data))
      if (!v.ok || v.n === null) no('book-value')
      return { label: `Lifestyle: ${e.name} × ${a.months} month${a.months === 1 ? '' : 's'}${sin ? ` (${sinName(sin)})` : ''}`, nuyen: v.n! * a.months }
    }
    case 'convert': {
      if (!Number.isInteger(a.karma) || a.karma === 0) no('below-one')
      // the Sixth World Companion's Working for the Man and for the People (p. 153): optional, each its own switch
      if (a.karma > 0) {
        if (!flag(cr, 'workingForTheMan')) no('optional-rule-off')
        const n = a.karma * need('advance.karmaToNuyenRate')
        return { label: `${a.karma} karma to ${fmt(n)}¥`, karma: a.karma, nuyen: -n }
      }
      if (!flag(cr, 'workingForThePeople')) no('optional-rule-off')
      const rate = num(cr, 'advance.nuyenToKarmaRate') ?? no('optional-rule-off'),
        n = -a.karma * rate
      return { label: `${fmt(n)}¥ to ${-a.karma} karma`, karma: a.karma, nuyen: n }
    }
    case 'awakened': {
      // (owner 2026-10-16: overridable after creation too, free; Review warns while it differs: awakened.override)
      if (a.value === b.awakened) no('already-known')
      const f = awakenedFlag({ ...b, awakened: a.value }, data),
        yes = (v: boolean) => (v ? 'Awakened' : 'not Awakened')
      return {
        label:
          a.value === undefined ? `Awakened: derived again (${yes(f.derived)}, ${f.why})` : `Awakened override: ${yes(a.value)} (derived: ${yes(f.derived)})`,
      }
    }
    case 'licensed': {
      // a licence on one more of the runner's SINs for a line it owns (owner 2026-10-16): on a real SIN at the fee its
      // Availability prints, on a fake one a fake licence rated as the SIN, priced as creation prices it (budgets.ts sinCost)
      const x = b.purchases.flatMap(y => [y, ...y.accessories]).find(y => y.uid === a.target) ?? no('unknown-line')
      const sin = b.sins.find(s => s.uid === a.sin) ?? no('unknown-line')
      const fee = licenceFee(x, data) ?? no('no-licence')
      if (sin.licences.some(l => l.item === x.uid)) no('already-known')
      const e = entryOf(x, data),
        what = `Licence: ${e ? entryLabel(e) : (x.name ?? 'Custom item')} on ${sinName(sin)}`
      if (sin.kind === 'real') return { label: what, nuyen: fee }
      const r = licenceRating(sin)
      return { label: `${what} (fake licence, rating ${r})`, nuyen: r * need('licencePerRating') }
    }
    case 'other':
      return { label: typed.label?.trim() || 'Other', karma: typed.karma, nuyen: typed.nuyen }
  }
}

/** The runner with the spend appended (new lines get their uid and catalog name here; a buy off or drop keeps the line it
 *  removes, for the history), or why not. */
export function record(
  ch: Sr6Character,
  a: Sr6Advance,
  data: Sr6Data,
  cr: CreationRules,
  typed?: Typed,
  now = new Date().toISOString(),
): { ok: true; ch: Sr6Character } | { ok: false; reason: string } {
  const pv = preview(ch, a, data, cr, typed)
  if (!pv.ok) return pv
  const b = currentBuild(ch),
    adv = structuredClone(a)
  const named = <T extends { uid: string; name?: string }>(line: T, name?: string): T => ({
    ...line,
    uid: line.uid || newId(),
    ...(name && !line.name ? { name } : {}),
  })
  /** a family of levels (levels.ts): the level the spend lands on, and the runner's lower level it replaces */
  const level = <K extends 'qualities' | PickKind>(kind: K, id: string, asked?: number) => {
    const fam = data.family(kind, id)
    if (!fam) return undefined
    const lines: { uid: string; id: string }[] = kind === 'qualities' ? b.qualities.filter(q => !q.free) : b.picks.filter(x => x.kind === kind)
    const cur = lines.find(x => data.family(kind, x.id) === fam),
      curLevel = cur ? (data.levelOf(data.entry(kind, cur.id)) ?? 1) : 0
    const e = data.atLevel(kind, id, data.levelOf(data.entry(kind, id)) ?? curLevel + (asked || 1))
    return e ? { e, target: cur?.uid } : undefined
  }
  switch (adv.op) {
    case 'knowledge':
      adv.line = { ...named(adv.line), points: 0, karma: 1 }
      break
    case 'quality': {
      const lv = level('qualities', adv.line.id, adv.line.level)
      if (lv) {
        adv.line = { ...adv.line, id: lv.e.id, level: 1 }
        if (lv.target) adv.target = lv.target
      }
      adv.line = named(adv.line, data.qualities[adv.line.id]?.name)
      if (data.qualities[adv.line.id] && !data.qualities[adv.line.id].multi) adv.single = true
      // (stored on the advance, so replay needs no catalog: applyAdvance)
      const t = infectedOf(data.entry('qualities', adv.line.id)),
        next = t && infectedKind(boughtKind(b), t.awakens)
      if (next && next !== b.magic) adv.magic = next
      break
    }
    case 'pick': {
      const lv = level(adv.line.kind, adv.line.id)
      if (lv) {
        const { level: _, ...rest } = adv.line
        adv.line = { ...rest, id: lv.e.id }
        if (lv.target) adv.target = lv.target
      }
      adv.line = named(
        { ...adv.line, ...(!lv && data.powers[adv.line.id]?.perLevel && adv.line.kind === 'adeptpowers' ? { level: 1 } : {}) },
        data.entry(adv.line.kind, adv.line.id)?.name,
      )
      break
    }
    case 'martialart':
      adv.line = {
        ...named(adv.line, data.entry('martialarts', adv.line.id)?.name),
        techniques: adv.line.techniques.map(t => named(t, data.entry('martialtechniques', t.id)?.name)),
      }
      break
    case 'technique':
      adv.line = named(adv.line, data.entry('martialtechniques', adv.line.id)?.name)
      break
    case 'initiate': {
      const lv = adv.line && level(adv.line.kind, adv.line.id)
      if (adv.line && lv) {
        adv.line = { ...adv.line, id: lv.e.id }
        delete adv.line.level
        if (lv.target) adv.target = lv.target
      }
      if (adv.line)
        adv.line = named(
          { ...adv.line, ...(!lv && pickMaxLevel(data, adv.line.kind, adv.line.id) !== null ? { level: 1 } : {}) },
          data.entry(adv.line.kind, adv.line.id)?.name,
        )
      break
    }
    case 'purchase':
      adv.line = named(adv.line, adv.line.id ? data.entry(adv.line.kind, adv.line.id)?.name : undefined)
      // (a critter's commands and special training bought with it, named as the catalog has them)
      if (adv.line.trained) adv.line.trained = adv.line.trained.map(t => named(t, t.id ? data.entry('actions', t.id)?.name : undefined))
      break
    case 'teach':
      adv.line = { ...named(adv.line, adv.line.id ? data.entry('actions', adv.line.id)?.name : undefined), taught: true }
      break
    case 'upgrade':
    case 'fit':
      adv.line = named(adv.line, adv.line.id ? data.entry(adv.line.kind, adv.line.id)?.name : undefined)
      break
    case 'unfit':
      adv.line = b.purchases.flatMap(x => x.accessories).find(x => x.uid === adv.target)
      break
    case 'part': {
      // (a part coming off takes its mounts, and its children's, with it: note which weapons' mounts, for a replay)
      const host = b.purchases.find(x => x.uid === adv.target)
      if (host && !adv.restore) {
        const x = structuredClone(host)
        setPart(x, adv.part, false, data)
        const mounts = new Set(
          partsOf(x, data)
            .filter(p => p.removed)
            .map(p => p.uid),
        )
        const hit = [...new Set(host.accessories.flatMap(w => (w.mount && mounts.has(w.mount) ? [w.mount] : [])))]
        if (hit.length) adv.detach = hit
      }
      break
    }
    case 'bond':
      // (bonded qualities; the upgraded one keeps how it came, applyAdvance)
      adv.line = { ...named(adv.line, data.qualities[adv.line.id]?.name), how: 'bonded' }
      if (adv.with) adv.with = { ...named(adv.with, data.qualities[adv.with.id]?.name), how: 'bonded' }
      break
    case 'contact':
      adv.line = named(adv.line)
      break
    case 'buyoff': {
      const q = b.qualities.find(x => x.uid === adv.target)
      // (Stolen Gear's last part bought off is all of it: the line goes)
      if (adv.part !== undefined && q && adv.part >= stolenLeft(b, cr, data, q)) delete adv.part
      adv.line = q
      break
    }
    case 'drop':
      adv.line = b.purchases.find(x => x.uid === adv.target)
      break
    case 'sin': {
      // stored as it'll stand: no lifestyles (a placeholder's stay on it) nor placeholder flag; a fake SIN's rating set
      const { uid, name, kind, rating, gender, licences } = adv.line
      adv.line = {
        uid: uid || newId(),
        name: name.trim(),
        kind,
        ...(kind === 'fake' ? { rating: rating ?? 1 } : {}),
        ...(gender?.trim() ? { gender } : {}),
        licences,
      }
      rateLicences(adv.line)
      break
    }
    case 'lifestyle':
      if (adv.sin && !adv.uid) adv.uid = newId()
      break
    case 'licensed': {
      // (the licence named after the licence type covering the item, as the catalog has it: replay needs no catalog)
      const x = b.purchases.flatMap(y => [y, ...y.accessories]).find(y => y.uid === adv.target)
      if (x) adv.name = licenceName(x, data)
      break
    }
  }
  const entry: Sr6LedgerEntry = { id: newId(), at: now, type: 'advance', advance: adv, label: pv.label, karma: pv.karma, nuyen: pv.nuyen }
  return { ok: true, ch: { ...ch, ledger: [...ch.ledger, entry] } }
}

export const earn = (ch: Sr6Character, karma: number, nuyen: number, run: string, date: string, now = new Date().toISOString()): Sr6Character => ({
  ...ch,
  ledger: [...ch.ledger, { id: newId(), at: now, type: 'earn', karma, nuyen, run, date }],
})
export const note = (ch: Sr6Character, text: string, now = new Date().toISOString()): Sr6Character => ({
  ...ch,
  ledger: [...ch.ledger, { id: newId(), at: now, type: 'note', text }],
})

/** What an editEntry call may change on a ledger line (by its kind); leaving one out keeps the line's value. */
export type LedgerEdit = { karma?: number; nuyen?: number; label?: string; run?: string; date?: string; text?: string; reason?: string }
const editLine = (e: Sr6LedgerEntry, p: LedgerEdit): Sr6LedgerEntry => {
  switch (e.type) {
    case 'finalize':
      return { ...e, karma: p.karma ?? e.karma, nuyen: p.nuyen ?? e.nuyen }
    case 'earn':
      return { ...e, karma: p.karma ?? e.karma, nuyen: p.nuyen ?? e.nuyen, run: p.run ?? e.run, date: p.date ?? e.date }
    case 'advance':
      return { ...e, karma: p.karma ?? e.karma, nuyen: p.nuyen ?? e.nuyen, label: p.label ?? e.label }
    case 'note':
      return { ...e, text: p.text ?? e.text }
    case 'void':
      return { ...e, reason: p.reason ?? e.reason }
  }
}
/** Edit a single ledger line by hand (its amounts and its text/label). The running balances follow from the amounts, so a
 *  correction here re-totals the history. Deliberately breaks append-only: the GM owns the ledger. */
export const editEntry = (ch: Sr6Character, id: string, patch: LedgerEdit): Sr6Character => ({
  ...ch,
  ledger: ch.ledger.map(e => (e.id === id ? editLine(e, patch) : e)),
  updatedAt: new Date().toISOString(),
})

/** Void any live entry since the last Finalize: an earning, note or advance (owner 2026-10-26 — fixing a mistake must not
 *  mean undoing everything after it). A later entry that leaned on a voided one simply doesn't apply on replay
 *  (applyAdvance is guarded against a missing target), so voiding out of order can't corrupt the build. */
export function voidEntry(
  ch: Sr6Character,
  id: string,
  reason: string,
  now = new Date().toISOString(),
): { ok: true; ch: Sr6Character } | { ok: false; reason: string } {
  const e = sinceFinalize(ch).find(x => x.id === id)
  if (!e || e.type === 'void' || e.type === 'finalize') return { ok: false, reason: 'not-voidable' }
  if (voidedIds(ch).has(id)) return { ok: false, reason: 'already-voided' }
  return { ok: true, ch: { ...ch, ledger: [...ch.ledger, { id: newId(), at: now, type: 'void', eventId: id, reason }] } }
}

/** The ids voidEntry would allow (the Ledger tab's Void buttons): every live earning, note or advance since Finalize. */
export function voidableIds(ch: Sr6Character): Set<string> {
  const voided = voidedIds(ch)
  return new Set(
    sinceFinalize(ch)
      .filter(e => !voided.has(e.id) && (e.type === 'earn' || e.type === 'note' || e.type === 'advance'))
      .map(e => e.id),
  )
}

/** Delete a ledger line outright (not void): it leaves no record, and any void that pointed at it goes with it. The
 *  Finalize baseline can't be deleted. Unlike Void (which keeps an audit trail for play), this is for clearing out
 *  mistakes while building. Replay stays safe: a later entry leaning on a deleted one just doesn't apply (applyAdvance
 *  is guarded). */
export function deleteEntry(ch: Sr6Character, id: string): { ok: true; ch: Sr6Character } | { ok: false; reason: string } {
  const e = ch.ledger.find(x => x.id === id)
  if (!e || e.type === 'finalize') return { ok: false, reason: 'not-deletable' }
  return {
    ok: true,
    ch: { ...ch, ledger: ch.ledger.filter(x => x.id !== id && !(x.type === 'void' && x.eventId === id)), updatedAt: new Date().toISOString() },
  }
}

/** Every ledger line that may be deleted: all of them bar the Finalize baseline. */
export const deletableIds = (ch: Sr6Character): Set<string> => new Set(ch.ledger.filter(e => e.type !== 'finalize').map(e => e.id))

/** Clear the whole career history, keeping only the Finalize baseline (start the career over). */
export const clearHistory = (ch: Sr6Character): Sr6Character => {
  const fin = ch.ledger.findIndex(e => e.type === 'finalize')
  return { ...ch, ledger: fin >= 0 ? ch.ledger.slice(0, fin + 1) : [], updatedAt: new Date().toISOString() }
}

/** Back to draft is allowed only with no live earning or spend since the last Finalize. */
export function canDraft(ch: Sr6Character): boolean {
  const voided = voidedIds(ch)
  return !sinceFinalize(ch).some(e => (e.type === 'earn' || e.type === 'advance') && !voided.has(e.id))
}

/** Review in career: a balance below 0 (after a void), and S2's catalog, Essence and prerequisite checks on the current
 *  build (what a spend may record though the runner lacks it). */
export function validateCareer(data: Sr6Data, cr: CreationRules, ch: Sr6Character): Violation[] {
  const bal = balances(ch),
    out: Violation[] = []
  if (bal.karma < 0) out.push({ code: 'career.karma', severity: 'warning', path: 'ledger', message: `The karma balance is below zero (${fmt(bal.karma)}).` })
  if (bal.nuyen < 0) out.push({ code: 'career.nuyen', severity: 'warning', path: 'ledger', message: `The nuyen balance is below zero (${fmt(bal.nuyen)}¥).` })
  // Stolen Gear's limit after creation (No Future errata, NF p. 162): the karma turned into nuyen at creation and since,
  // past karmaToNuyenMaxStolenGear, is a warning, never refused (owner 2026-10-16; creation still refuses it)
  const b = currentBuild(ch),
    sg = settingQuality(b, cr, 'stolenGearQuality', data),
    cap = num(cr, 'karmaToNuyenMaxStolenGear')
  if (sg && cap !== undefined) {
    const total = toNuyen(ch.build, cr, data) + liveAdvances(ch).reduce((t, e) => t + (e.advance.op === 'convert' ? Math.max(0, e.advance.karma) : 0), 0)
    if (total > cap)
      out.push({
        code: 'quality.stolenGearCap',
        severity: 'warning',
        path: `qualities.${sg.uid}`,
        message: `${data.qualities[sg.id]?.name ?? sg.name ?? sg.id}: ${total} karma turned into nuyen, more than the ${cap} it allows; not enforced, settle it with your GM.`,
        ...cite(cr, 'stolenGearQuality'),
      })
  }
  return [...out, ...validateSr6(data, cr, { ...ch, build: b }).filter(v => CAREER_KEEP.has(v.code))]
}
