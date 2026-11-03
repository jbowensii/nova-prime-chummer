// Career replay: applying advances to a build, the live advances since Finalize, and the runner as it stands. Part of career.ts (the barrel).
import { stampOrder } from '../creation/cyberadept'
import { itemLicence, type Sr6Advance, type Sr6Build, type Sr6Character, type Sr6LedgerEntry, type Sr6Purchase } from '../../../formats/domain/character'
import { MAGIC_KINDS, type Sr6Data } from '../../../catalog/domain/data'
import { ratingRange } from '../../../catalog/domain/values'
import { boughtKind } from '../creation/infected'
import { deep, infectedTo, unfit } from '../creation/actions'
import { applyPack } from '../creation/packs'
import { limbSnapshot } from '../assets/limbs'

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
  advance(b, a)
  stampOrder(b) // (ledger order is the order lines are taken in: creation/cyberadept.ts)
}

export function advance(b: Sr6Build, a: Sr6Advance): void {
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
    case 'pack':
      applyPack(b, a)
      return
    case 'drop':
      b.purchases = b.purchases.filter(x => x.uid !== a.target)
      return
    case 'quantity': {
      const x = b.purchases.find(y => y.uid === a.target)
      if (x) x.qty = a.qty
      return
    }
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
      deep(b.purchases)
        .find(x => x.uid === a.target)
        ?.accessories.push(structuredClone(a.line)) // (a nested host too: a weapon in a vehicle's mount)
      return
    case 'unfit': {
      const host = deep(b.purchases).find(x => x.accessories.some(y => y.uid === a.target))
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
    case 'assign': {
      const x = b.purchases.flatMap(y => [y, ...y.accessories]).find(y => y.uid === a.target)
      if (x && a.sin) x.sin = a.sin
      else if (x) delete x.sin
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
