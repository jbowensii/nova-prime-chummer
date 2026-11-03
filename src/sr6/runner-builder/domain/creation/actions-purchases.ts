// Build actions, purchase, gear-line, accessory, rating and flag ops (split from actions.ts; apply() in actions.ts dispatches here).
import { capacityRemaining, isAmmoGear, isAmmoType, stacks } from '../../../catalog/domain/categories'
import { subChoices } from '../../../catalog/domain/structure'
import { ratingOf } from './purchases'
import { newId } from '../../../../core/shared/types'
import { itemLicence, type Bonus, type Sr6Build, type Sr6Purchase } from '../../../formats/domain/character'
import { type CreationRules } from '../../../table-setup/domain/creation'
import { type Sr6Data } from '../../../catalog/domain/data'
import { gradeProblem } from './grades'
import { chosenRating, ratingRange } from '../../../catalog/domain/values'
import { augmentationRoom, diyAllowed, entryOf, licenceFee, licenceName, materialOf, takesMaterial } from './budgets'
import { applyPack, expandPack, isPackHeader, packHeader, removePack } from './packs'
import { mountsOf } from '../assets/vehiclemods'
import { critterOnly } from '../assets/critterware'
import { no, OK, deep, allLines, unfit, unlicense, OWN_LINE, newLine, accessoryProblem, type OpOf, type Result } from './actions-helpers'
export function applyPurchases(
  b: Sr6Build,
  op: OpOf<
    | 'purchase'
    | 'pack'
    | 'design'
    | 'custom'
    | 'quantity'
    | 'lineOptions'
    | 'purchaseNote'
    | 'accessory'
    | 'ammoType'
    | 'gmprice'
    | 'diy'
    | 'material'
    | 'wear'
    | 'itemFlag'
    | 'rate'
    | 'bonus'
    | 'situational'
    | 'licensed'
  >,
  data: Sr6Data,
  cr: CreationRules,
): Result {
  switch (op.op) {
    case 'purchase': {
      if ('remove' in op) {
        const x = b.purchases.find(x => x.uid === op.remove)
        if (!x) return no('unknown-line')
        // a pack's header takes all its contents with it (packs.ts)
        if (isPackHeader(x)) {
          unlicense(b, deep(b.purchases.filter(y => y.pack === x.uid)))
          removePack(b, x.uid)
          return OK
        }
        b.purchases = b.purchases.filter(y => y !== x)
        unlicense(b, deep([x]))
        return OK
      }
      const line = newLine(op, data, cr)
      if ('reason' in line) return line
      if (critterOnly(entryOf(line, data))) return no('critters-only') // (Body Shop's critter chapter: not for a player's character)
      // owner's decision 9: each augmentation once a runner, a paired body part once a side
      if (op.kind === 'augmentations' && augmentationRoom(b, data, entryOf(line, data)) < 1) return no('once-per-runner')
      const same =
        (!OWN_LINE.has(op.kind) || stacks(op.kind, entryOf(line, data))) &&
        !isAmmoGear(entryOf(line, data)) && // each ammo line carries its own fitted ammo type, so adding again makes a new line
        !line.grade &&
        b.purchases.find(
          x =>
            !x.pack &&
            x.id &&
            x.id === line.id &&
            x.kind === line.kind &&
            x.rating === line.rating &&
            (x.note ?? '') === (line.note ?? '') &&
            !x.grade &&
            !x.accessories.length,
        )
      if (same) same.qty += line.qty
      else b.purchases.push(line)
      return OK
    }
    case 'pack': {
      const x = expandPack(data, op.id, b, (h, a) => accessoryProblem(h, a, data))
      if (!x) return no('unknown-entry')
      applyPack(b, x)
      b.purchases.push(packHeader(x))
      return OK
    }
    case 'design': {
      const x = op.line
      if (!x.design || (x.kind === 'vehicles' ? !x.snapshot : x.kind !== 'weapons' && x.kind !== 'augmentations')) return no('not-a-design')
      // (an item design's line: fresh uids for it and its add-ons, so two bought copies never share one)
      const fresh = (y: Sr6Purchase): Sr6Purchase => ({ ...y, uid: newId(), accessories: y.accessories.map(fresh) })
      const line = { ...fresh(structuredClone(x)), qty: 1 }
      if (x.kind === 'augmentations' && augmentationRoom(b, data, entryOf(line, data)) < 1) return no('once-per-runner')
      b.purchases.push(line)
      return OK
    }
    case 'custom': {
      const x = op.line,
        e = x.snapshot
      if (!x.id?.startsWith('custom.') || !e || e.id !== x.id || e.kind !== x.kind) return no('not-custom')
      if (['cost', 'avail', 'essence'].some(k => Number(e.attrs[k] ?? 0) < 0)) return no('below-zero')
      const line = { ...structuredClone(x), uid: newId(), qty: Math.max(1, x.qty || 1) }
      if (op.host === undefined) {
        if (x.kind === 'augmentations' && augmentationRoom(b, data, e) < 1) return no('once-per-runner')
        b.purchases.push(line)
        return OK
      }
      const host = allLines(b).find(y => y.uid === op.host)
      if (!host) return no('unknown-host')
      const problem = accessoryProblem(host, line, data)
      if (problem) return no(problem)
      host.accessories.push(line)
      return OK
    }
    case 'quantity': {
      const x = b.purchases.find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      if (OWN_LINE.has(x.kind) && !stacks(x.kind, entryOf(x, data))) return no('own-line') // (an expendable weapon -- grenade, explosive, rocket -- counts like gear)
      if (op.qty < 1) return no('below-one')
      x.qty = op.qty
      return OK
    }
    case 'lineOptions': {
      // (a quality's or a purchase's sub-option or variant pick: structure.ts subChoices; '' clears it)
      const q = b.qualities.find(x => x.uid === op.uid)
      const x = q ?? allLines(b).find(y => y.uid === op.uid)
      if (!x) return no('unknown-line')
      const e = q ? data.entry('qualities', q.id) : x.id ? data.entry((x as Sr6Purchase).kind, x.id) : undefined
      const c = subChoices(e).find(y => y.ref === op.ref)
      if (!c) return no('unknown-choice')
      const ids = op.value
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
      if (ids.length > c.count || ids.some(id => !c.options.some(o => o.id === id))) return no('unknown-option')
      const next = { ...(x.options ?? {}) }
      if (ids.length) next[op.ref] = ids.join(',')
      else delete next[op.ref]
      if (Object.keys(next).length) x.options = next
      else delete x.options
      return OK
    }
    case 'purchaseNote': {
      const x = b.purchases.find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      const t = op.note.trim().slice(0, 200)
      if (t) x.note = t
      else delete x.note
      return OK
    }
    case 'accessory': {
      // (a nested line hosts too: a weapon built into a cyberarm takes its own accessories, owner ruling 5)
      const host = allLines(b).find(x => x.uid === op.host)
      if (!host) return no('unknown-host')
      if ('remove' in op) {
        if (!host.accessories.some(a => a.uid === op.remove)) return no('not-fitted')
        unlicense(b, deep(host.accessories.filter(a => a.uid === op.remove)))
        unfit(host, op.remove)
        return OK
      }
      // an accessory whose category names other hosts goes on anyway (Review's catalog.accessoryHost)
      const line = newLine({ kind: op.kind, id: op.id, rating: op.rating }, data, cr)
      if ('reason' in line) return line
      // critter equipment goes on an owned critter only (Body Shop's critterware, Wild Life's critter gear)
      if (critterOnly(entryOf(line, data)) && host.kind !== 'critters') return no('critters-only')
      if (op.mount !== undefined) {
        if (!mountsOf(host, data).some(m => m.uid === op.mount)) return no('not-a-mount')
        line.mount = op.mount
      }
      if (op.diy) {
        if (!diyAllowed(entryOf(line, data))) return no('no-diy')
        line.diy = true
      }
      if (host.kind === 'vehicles' && line.kind === 'weapons' && !line.mount)
        line.mount = mountsOf(host, data).find(m => !m.taken && !host.accessories.some(a => a.mount === m.uid))?.uid
      const problem = accessoryProblem(host, line, data)
      if (problem) return no(problem)
      host.accessories.push(line) // (no grade of its own: on an implant it has the implant's, budgets.ts fitted)
      return OK
    }
    case 'ammoType': {
      const host = b.purchases.find(x => x.uid === op.host)
      if (!host) return no('unknown-host')
      // one type at a time: drop whatever type is on the line before fitting the new one (atomic, so no stacked multipliers)
      host.accessories = host.accessories.filter(a => !isAmmoType(entryOf(a, data)))
      if (op.id) {
        const line = newLine({ kind: 'ammotypes', id: op.id }, data, cr)
        if ('reason' in line) return line
        host.accessories.push(line)
      }
      return OK
    }
    case 'gmprice': {
      const x = b.purchases.find(p => p.uid === op.uid && p.kind === 'vehicles')
      if (!x) return no('unknown-line')
      if (op.value === undefined) delete x.gmPrice
      else if (Number.isFinite(op.value) && op.value >= 0) x.gmPrice = op.value
      else return no('bad-price')
      return OK
    }
    case 'diy': {
      const x = b.purchases.flatMap(p => p.accessories).find(a => a.uid === op.uid)
      if (!x) return no('unknown-line')
      if (op.diy && !diyAllowed(entryOf(x, data))) return no('no-diy')
      if (op.diy) x.diy = true
      else delete x.diy
      return OK
    }
    case 'material': {
      const x = allLines(b).find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      if (op.material === null) delete x.material
      else if (!takesMaterial(x, data) || !materialOf(data, op.material)) return no('no-material')
      else x.material = op.material
      return OK
    }
    case 'wear': {
      const x = b.purchases.find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      if (op.worn) x.worn = true
      else delete x.worn
      return OK
    }
    case 'itemFlag': {
      const x = b.purchases.find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      if (x.kind !== 'armor') return no('armor-only')
      const f = new Set(x.flags)
      if (op.on) f.add(op.flag)
      else f.delete(op.flag)
      if (f.size) x.flags = [...f]
      else delete x.flags
      return OK
    }
    case 'rate': {
      const x = allLines(b).find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      const level = op.rating !== undefined && x.id && data.family(x.kind, x.id) ? data.atLevel(x.kind, x.id, op.rating) : undefined
      if (op.rating !== undefined && !level) {
        const e = x.id ? data.entry(x.kind, x.id) : undefined
        if (!e || !(chosenRating(e) ? Number.isInteger(op.rating) && op.rating >= 1 : ratingRange(e.attrs.rating).includes(op.rating)))
          return no('rating-range')
      }
      const gp = op.grade ? gradeProblem(cr, data, op.grade, x.id ? data.entry(x.kind, x.id) : undefined) : null
      if (gp) return no(gp)
      // an implant's add-on has its grade (CRB p. 282): never one of its own
      const host = allLines(b).find(h => h.kind === 'augmentations' && h.accessories.includes(x))
      if (host && op.grade !== undefined) return no('grade-follows-host')
      const prev = { id: x.id, name: x.name, rating: x.rating }
      const owner0 = allLines(b).find(h => h.accessories.includes(x)),
        he0 = owner0 && entryOf(owner0, data)
      const before = owner0
        ? capacityRemaining(
            he0,
            owner0.accessories.map(a => ({ ...a, entry: entryOf(a, data), rating: ratingOf(a, entryOf(a, data)) })),
            ratingOf(owner0, he0),
          )
        : null
      // (a level of a family: the level's own entry takes the line, which then needs no rating of its own)
      if (level) {
        x.id = level.id
        x.name = level.name
        delete x.rating
      } else if (op.rating !== undefined) x.rating = op.rating
      // a fitted accessory's new rating may not overfill its host (the add path's guard, accessoryProblem)
      const owner = allLines(b).find(h => h.accessories.includes(x))
      if (owner && op.rating !== undefined) {
        const he = entryOf(owner, data),
          left = (as: Sr6Purchase[]) =>
            capacityRemaining(
              he,
              as.map(a => ({ ...a, entry: entryOf(a, data), rating: ratingOf(a, entryOf(a, data)) })),
              ratingOf(owner, he),
            )
        const after = left(owner.accessories)
        if (after !== null && after < 0 && !(before !== null && before < 0)) {
          Object.assign(x, prev)
          if (prev.rating === undefined) delete x.rating
          return no('Not enough remaining capacity.')
        }
      }
      if (op.grade) x.grade = op.grade
      else if (op.grade === null) delete x.grade
      // its add-ons follow it (a grade a file gave one is dropped: they have the implant's)
      if (op.grade !== undefined && x.kind === 'augmentations') for (const a of x.accessories) delete a.grade
      return OK
    }
    case 'bonus': {
      const x: { bonuses?: Bonus[] } | undefined = allLines(b).find(p => p.uid === op.uid) ?? b.picks.find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      if (op.bonuses.some(y => y.target === 'skill' && !y.skill)) return no('no-skill') // (a skill bonus names its skill)
      if (op.bonuses.length) x.bonuses = op.bonuses
      else delete x.bonuses
      delete (x as { sit?: unknown }).sit // (the switches belonged to the old list)
      return OK
    }
    case 'situational': {
      const x: { sit?: Record<string, number> } | undefined =
        allLines(b).find(p => p.uid === op.uid) ?? b.picks.find(p => p.uid === op.uid) ?? b.qualities.find(q => q.uid === op.uid)
      if (!x) return no('unknown-line')
      const n = Math.min(99, Math.max(0, Math.trunc(op.times) || 0))
      const sit: Record<string, number> = { ...x.sit, [op.key]: n }
      if (!n) delete sit[op.key]
      if (Object.keys(sit).length) x.sit = sit
      else delete x.sit
      return OK
    }
    case 'licensed': {
      // an item's licence is one of its SIN's licences (owner 2026-10-16), named after the licence type covering it and
      // rated as the SIN: on a fake SIN a fake licence, on a real SIN at its printed fee (budgets.ts sinCost). Never enforced
      const x = allLines(b).find(p => p.uid === op.uid),
        s = b.sins.find(s => s.uid === op.sin)
      if (!x || !s) return no('unknown-line')
      if (!op.on) {
        s.licences = s.licences.filter(l => l.item !== x.uid)
        return OK
      }
      if (licenceFee(x, data) === undefined) return no('no-licence')
      if (s.licences.some(l => l.item === x.uid)) return OK
      s.licences.push(itemLicence(x, s, licenceName(x, data)))
      return OK
    }
  }
}
