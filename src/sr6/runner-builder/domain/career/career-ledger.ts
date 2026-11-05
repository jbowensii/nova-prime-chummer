// Career ledger record: recording a spend, earnings and notes, edit, void and delete. Part of career.ts (the barrel).
import { newId } from '../../../../core/shared/types'
import { rateLicences, type PickKind, type Sr6Advance, type Sr6Character, type Sr6LedgerEntry } from '../../../formats/domain/character'
import { licenceName } from '../creation/budgets'
import { type CreationRules } from '../../../table-setup/domain/creation'
import { pickMaxLevel, type Sr6Data } from '../../../catalog/domain/data'
import { boughtKind, infectedKind, infectedOf } from '../creation/infected'
import { deep, setPart } from '../creation/actions'
import { partsOf } from '../assets/vehiclemods'
import { sinceFinalize, voidedIds, currentBuild } from './career-replay'
import { type Typed, stolenLeft, preview } from './career-pricing'

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
  const level = <K extends 'qualities' | PickKind>(kind: K, id: string, asked?: number, target?: string) => {
    const fam = data.family(kind, id)
    if (!fam) return undefined
    const lines: { uid: string; id: string }[] = kind === 'qualities' ? b.qualities.filter(q => !q.free) : b.picks.filter(x => x.kind === kind)
    // (a repeatable quality: the line of the choice raised, none a new choice: as the preview reads it)
    const multi = kind === 'qualities' && !!data.qualities[id]?.multi
    const cur = lines.find(x => (multi ? x.uid === target : data.family(kind, x.id) === fam)),
      curLevel = cur ? (data.levelOf(data.entry(kind, cur.id)) ?? 1) : 0
    const e = data.atLevel(kind, id, data.levelOf(data.entry(kind, id)) ?? curLevel + (asked || 1))
    return e ? { e, target: cur?.uid } : undefined
  }
  switch (adv.op) {
    case 'knowledge':
      adv.line = { ...named(adv.line), points: 0, karma: 1 }
      break
    case 'quality': {
      const lv = level('qualities', adv.line.id, adv.line.level, adv.target)
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
      adv.line = deep(b.purchases).find(x => x.uid === adv.target)
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
export const editLine = (e: Sr6LedgerEntry, p: LedgerEdit): Sr6LedgerEntry => {
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
  const fin = ch.ledger.findLastIndex(e => e.type === 'finalize')
  return { ...ch, ledger: fin >= 0 ? ch.ledger.slice(0, fin + 1) : [], updatedAt: new Date().toISOString() }
}

/** Back to draft is allowed only with no live earning or spend since the last Finalize. */
export function canDraft(ch: Sr6Character): boolean {
  const voided = voidedIds(ch)
  return !sinceFinalize(ch).some(e => (e.type === 'earn' || e.type === 'advance') && !voided.has(e.id))
}
