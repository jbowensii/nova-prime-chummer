// Build actions, vehicle, drone and critter part/slot/mount ops (split from actions.ts; apply() in actions.ts dispatches here).
import { newId } from '../../../../core/shared/types'
import { type Sr6Build } from '../../../formats/domain/character'
import { type CreationRules } from '../../../table-setup/domain/creation'
import { type Sr6Data } from '../../../catalog/domain/data'
import { entryOf, seatsOf } from './budgets'
import { deriveMod } from '../assets/derive'
import { modsOf, mountsOf, shiftProblem } from '../assets/vehiclemods'
import { critterQualityNamed, isCritterQuality, trainedWhat } from '../assets/critters'
import { no, OK, allLines, accessoryProblem, setPart, type OpOf, type Result } from './actions-helpers'
export function applyVehicles(
  b: Sr6Build,
  op: OpOf<'vehicledp' | 'mount' | 'shift' | 'slot' | 'builtin' | 'derive' | 'part' | 'critter' | 'critterTrained' | 'critterQuality' | 'seats'>,
  data: Sr6Data,
  _cr: CreationRules,
): Result {
  switch (op.op) {
    case 'vehicledp': {
      const x = b.purchases.find(p => p.uid === op.uid && p.kind === 'vehicles')
      if (!x) return no('unknown-line')
      if (op.value === undefined) delete x.dp
      else if (Number.isFinite(op.value) && op.value >= 0) x.dp = op.value
      else return no('bad-dp')
      return OK
    }
    case 'mount': {
      const host = b.purchases.find(p => p.accessories.some(a => a.uid === op.uid)),
        x = host?.accessories.find(a => a.uid === op.uid)
      if (!host || !x) return no('unknown-line')
      if (x.kind !== 'weapons') return no('not-a-weapon')
      if (op.mount === null) {
        delete x.mount
        return OK
      }
      // (a fitted mount or a built-in one, vehiclemods.ts mountsOf)
      if (!mountsOf(host, data).some(m => m.uid === op.mount)) return no('not-a-mount')
      if (host.accessories.some(a => a.uid !== x.uid && a.mount === op.mount)) return no('This weapon mount is full.')
      x.mount = op.mount
      return OK
    }
    case 'shift': {
      const x = b.purchases.find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      if ('remove' in op) {
        if (!x.slotShifts?.[op.remove]) return no('not-shifted')
        x.slotShifts.splice(op.remove, 1)
        if (!x.slotShifts.length) delete x.slotShifts
        return OK
      }
      const why = shiftProblem(x, op.from, op.to, data)
      if (why) return no(why)
      x.slotShifts = [...(x.slotShifts ?? []), { from: op.from, to: op.to }]
      return OK
    }
    case 'slot': {
      const x = allLines(b).find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      if ('remove' in op) {
        if (!x.addedSlots?.[op.remove]) return no('no-slot')
        x.addedSlots.splice(op.remove, 1)
        if (!x.addedSlots.length) delete x.addedSlots
        return OK
      }
      if (!op.id.trim()) return no('no-slot-id')
      x.addedSlots = [...(x.addedSlots ?? []), op.value ? { id: op.id, value: op.value } : { id: op.id }]
      return OK
    }
    case 'builtin': {
      const x = b.purchases.find(p => p.uid === op.uid && p.kind === 'vehicles')
      if (!x) return no('unknown-line')
      if ('restore' in op) {
        if (!x.removedBuiltins?.includes(op.restore)) return no('not-removed')
        x.removedBuiltins = x.removedBuiltins.filter(u => u !== op.restore)
        if (!x.removedBuiltins.length) delete x.removedBuiltins
        return OK
      }
      // (the uid names one of the entry's built-ins; a weapon sitting in a removed built-in mount falls out of it)
      if (!modsOf(x, data).builtin.some(bi => bi.uid === op.remove)) return no('not-a-builtin')
      x.removedBuiltins = [...(x.removedBuiltins ?? []), op.remove]
      for (const a of x.accessories) if (a.mount === op.remove) delete a.mount
      return OK
    }
    case 'derive': {
      const host = b.purchases.find(p => p.uid === op.host && p.kind === 'vehicles')
      if (!host) return no('unknown-line')
      const from = data.entry(op.kind, op.id)
      if (!from) return no('unknown-entry')
      if (!(op.size > 0) || !op.hook.startsWith('vehicle-')) return no('bad-derivation')
      const line = deriveMod(from, op)
      const problem = accessoryProblem(host, line, data)
      if (problem) return no(problem)
      host.accessories.push(line)
      return OK
    }
    case 'part': {
      // (a vehicle's factory parts, or a weapon's standard upgrades)
      const x = allLines(b).find(p => p.uid === op.uid && (p.kind === 'vehicles' || p.kind === 'weapons'))
      if (!x) return no('unknown-line')
      return setPart(x, 'restore' in op ? op.restore : op.remove, 'restore' in op, data)
    }
    case 'critter': {
      const x = b.purchases.find(p => p.uid === op.uid && p.kind === 'critters')
      if (!x) return no('unknown-line')
      if (op.pet) x.pet = op.pet
      if (op.tamed === false) {
        delete x.tamed
        x.critterQualities = x.critterQualities?.filter(q => q.how !== 'tamed')
      } else if (op.tamed && !x.tamed) {
        // Wild Life p. 184: Wild Soul, balanced by a negative quality, High Maintenance 1 by default (changed by taking it
        // off and adding another negative as tamed); one it already has isn't added again, so untaming keeps it. (Its
        // trained ones aren't marked taught: critters.ts isTaught reads every one of a tamed critter so, and untaming
        // restores the price.)
        x.tamed = true
        x.critterQualities ??= []
        for (const name of ['Wild Soul', 'High Maintenance']) {
          const e = critterQualityNamed(data, name)
          if (e && !x.critterQualities.some(q => q.id === e.id)) x.critterQualities.push({ uid: newId(), id: e.id, level: 1, name: e.name, how: 'tamed' })
        }
      }
      if (!x.critterQualities?.length) delete x.critterQualities
      return OK
    }
    case 'critterTrained': {
      // (past the critter's limit: Review warns, never refused)
      const x = b.purchases.find(p => p.uid === op.host && p.kind === 'critters')
      if (!x) return no('unknown-host')
      if ('remove' in op) {
        if (!x.trained?.some(t => t.uid === op.remove)) return no('not-taken')
        x.trained = x.trained.filter(t => t.uid !== op.remove)
        if (!x.trained.length) delete x.trained
        return OK
      }
      if ('uid' in op) {
        const t = x.trained?.find(y => y.uid === op.uid)
        if (!t) return no('not-taken')
        if (op.taught || x.tamed) t.taught = true
        else delete t.taught
        return OK
      }
      const e = data.entry('actions', op.id)
      if (!e) return no('unknown-entry')
      const what = trainedWhat(e)
      if (!what) return no('not-critter-training')
      // (one taken again is another: Teamwork for another skill, Use Critter Power for another power, WL pp. 182-183)
      x.trained = [...(x.trained ?? []), { uid: newId(), what, id: e.id, name: e.name, ...(op.taught || x.tamed ? { taught: true as const } : {}) }]
      return OK
    }
    case 'critterQuality': {
      const x = b.purchases.find(p => p.uid === op.host && p.kind === 'critters')
      if (!x) return no('unknown-host')
      if ('remove' in op) {
        if (!x.critterQualities?.some(q => q.uid === op.remove)) return no('not-taken')
        x.critterQualities = x.critterQualities.filter(q => q.uid !== op.remove)
        if (!x.critterQualities.length) delete x.critterQualities
        return OK
      }
      if ('uid' in op) {
        const q = x.critterQualities?.find(y => y.uid === op.uid)
        if (!q) return no('not-taken')
        if (!(op.level >= 1)) return no('below-one')
        q.level = op.level
        return OK
      }
      const e = data.entry('qualities', op.id)
      if (!e) return no('unknown-entry')
      if (!isCritterQuality(e)) return no('not-a-critter-quality')
      if (op.how === 'tamed' && !x.tamed) return no('not-tamed')
      if (x.critterQualities?.some(q => q.id === op.id)) return no('already-taken')
      x.critterQualities = [...(x.critterQualities ?? []), { uid: newId(), id: e.id, level: op.level ?? 1, name: e.name, ...(op.how ? { how: op.how } : {}) }]
      return OK
    }
    case 'seats': {
      const x = b.purchases.find(p => p.uid === op.uid && p.kind === 'vehicles')
      if (!x) return no('unknown-line')
      if (op.removed < 0) return no('below-zero')
      if (op.removed > seatsOf(entryOf(x, data))) return no('at-maximum')
      if (op.removed) x.seatsRemoved = op.removed
      else delete x.seatsRemoved
      return OK
    }
  }
}
