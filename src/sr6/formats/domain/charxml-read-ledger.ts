// Shadowrun 6 runner XML: reading the ledger, house entries, NPC block and design (see charxml.ts).
import { each, kid, kids } from '../../../core/shared/xml'
import {
  SR6_ADVANCE_OPS,
  SHIFT_KINDS,
  SR6_ATTRS,
  SR6_LEDGER_TYPES,
  SR6_NPC_KINDS,
  SR6_NPC_PARTS,
  type Sr6Advance,
  type Sr6Design,
  type Sr6LedgerEntry,
  type Sr6Npc,
} from './character'
import { SR6_KINDS, type Sr6Entry, type Sr6Kind } from './types'
import { toEntry } from './entryxml'
import { MAGIC_KINDS } from './charxml-common'
import {
  def,
  label,
  num,
  oneOf,
  readContact,
  readCritterQuality,
  readKnowledge,
  readMartial,
  readPick,
  readPurchase,
  readQuality,
  readTechnique,
  readTrained,
  str,
  yes,
} from './charxml-read'
import { readLifestyle, readSin } from './charxml-read-build'

/** An attribute that must be there. */
export const req = (e: Element, a: string) => {
  const v = e.getAttribute(a)
  if (v == null) throw new Error(`no ${a}`)
  return v
}
/** The entry's line element, read; `need`: missing throws. */
export function line<T>(e: Element, name: string, read: (x: Element) => T, need: true): T
export function line<T>(e: Element, name: string, read: (x: Element) => T): T | undefined
export function line<T>(e: Element, name: string, read: (x: Element) => T, need?: true) {
  const x = kid(e, name)
  if (!x && need) throw new Error(`no <${name}> inside the entry`)
  return x ? read(x) : undefined
}

export function readAdvance(e: Element, karma: number, fix?: string[]): Sr6Advance {
  const op = oneOf(e.getAttribute('op'), SR6_ADVANCE_OPS, 'advance op')!
  const purchase = (x: Element) => readPurchase(x, fix)
  switch (op) {
    case 'attribute':
      return { op, target: oneOf(e.getAttribute('target'), SR6_ATTRS, 'attribute')! }
    case 'skill':
      return { op, target: req(e, 'target') }
    case 'spec':
    case 'expertise':
      return { op, target: req(e, 'target'), name: req(e, 'name') }
    case 'knowledge':
      return { op, line: line(e, 'knowledge', readKnowledge, true) }
    case 'quality': {
      const m = e.getAttribute('magic')
      return def({
        op,
        line: line(e, 'quality', readQuality, true),
        target: str(e, 'target'),
        single: yes(e, 'single'),
        magic: m == null ? undefined : oneOf(m, MAGIC_KINDS, 'magic kind an Infected type gives', undefined, fix),
      })
    }
    case 'buyoff':
      return def({ op, target: req(e, 'target'), line: line(e, 'quality', readQuality), part: num(e, 'part') })
    case 'pick':
      return def({ op, line: line(e, 'pick', readPick, true), target: str(e, 'target') })
    case 'martialart':
      return { op, line: line(e, 'martialart', x => readMartial(x, fix), true) }
    case 'technique':
      return { op, target: req(e, 'target'), line: line(e, 'technique', readTechnique, true) }
    case 'initiate':
      return def({ op, line: line(e, 'pick', readPick), target: str(e, 'target') })
    case 'purchase':
      return { op, line: line(e, 'purchase', purchase, true) }
    case 'pack':
      return {
        op,
        id: req(e, 'packId'),
        uid: req(e, 'packUid'),
        name: e.getAttribute('packName') ?? '',
        cost: num(e, 'cost', 0),
        lines: kids(e, 'purchase').map(purchase),
        sins: kids(e, 'sin').map(readSin),
        lifestyles: kids(e, 'lifestyle').map(l => ({ sin: req(l, 'sin'), line: readLifestyle(l) })),
      }
    case 'drop':
      return def({ op, target: req(e, 'target'), line: line(e, 'purchase', purchase), refund: num(e, 'refund') })
    case 'quantity':
      return { op, target: req(e, 'target'), qty: num(e, 'qty', 1) }
    case 'upgrade':
    case 'fit':
      return { op, target: req(e, 'target'), line: line(e, 'purchase', purchase, true) }
    case 'unfit':
      return def({ op, target: req(e, 'target'), line: line(e, 'purchase', purchase), refund: num(e, 'refund') })
    case 'shift':
      return {
        op,
        target: req(e, 'target'),
        from: oneOf(e.getAttribute('from'), SHIFT_KINDS, 'mod slot category')!,
        to: oneOf(e.getAttribute('to'), SHIFT_KINDS, 'mod slot category')!,
      }
    case 'move':
      return { op, target: req(e, 'target'), mount: req(e, 'mount') }
    case 'part':
      return def({
        op,
        target: req(e, 'target'),
        part: req(e, 'partId'),
        restore: e.getAttribute('restore') === 'true' ? true : undefined,
        detach: (u => (u.length ? u : undefined))(str(e, 'detach')?.split(/\s+/).filter(Boolean) ?? []),
      })
    case 'teach':
      return { op, target: req(e, 'target'), line: line(e, 'trained', readTrained, true) }
    case 'bond': {
      // (the bought quality, and the negative taken with it)
      const [q, w] = kids(e, 'quality').map(readCritterQuality)
      if (!q) throw new Error('no <quality> inside the entry')
      return def({ op, target: req(e, 'target'), line: q, with: w })
    }
    case 'contact':
      return { op, line: line(e, 'contact', readContact, true) }
    case 'sin':
      return { op, line: line(e, 'sin', readSin, true) }
    case 'lifestyle':
      return def({ op, id: req(e, 'lifestyle'), months: num(e, 'months', 0), sin: str(e, 'sin'), uid: str(e, 'uid') })
    case 'convert':
      return { op, karma }
    case 'awakened': {
      const v = e.getAttribute('awakened') // (xs:boolean; absent: derived again)
      return v == null ? { op } : { op, value: oneOf(v, ['true', 'false', '1', '0'] as const, 'Awakened override')! === 'true' || v === '1' }
    }
    case 'licensed':
      // (an older entry's rating is not read: the licence is rated as its SIN)
      return def({ op, target: req(e, 'target'), sin: req(e, 'sin'), name: str(e, 'name') })
    case 'assign':
      return def({ op, target: req(e, 'target'), sin: str(e, 'sin') })
    case 'powerpoint':
    case 'other':
      return { op }
  }
}

export function readEntry(e: Element, fix?: string[]): Sr6LedgerEntry {
  const head = { id: req(e, 'id'), at: e.getAttribute('at') ?? '' }
  const type = oneOf(e.getAttribute('type'), SR6_LEDGER_TYPES, 'entry type')!
  const karma = num(e, 'karma', 0),
    nuyen = num(e, 'nuyen', 0),
    body = e.textContent ?? ''
  switch (type) {
    case 'finalize':
      return { ...head, type, karma, nuyen }
    case 'earn':
      return { ...head, type, karma, nuyen, run: body, date: e.getAttribute('date') ?? '' }
    case 'note':
      return { ...head, type, text: body }
    case 'void':
      return { ...head, type, eventId: req(e, 'event'), reason: body }
    case 'advance':
      return { ...head, type, advance: readAdvance(e, karma, fix), label: e.getAttribute('label') ?? '', karma, nuyen }
  }
}

export const CATALOG_KINDS = Object.keys(SR6_KINDS) as Sr6Kind[]
export const KIND_OF_TAG = new Map(CATALOG_KINDS.map(k => [SR6_KINDS[k].tag, k]))
/** <house>'s entries; one of an unknown kind throws (repair drops it). */
export const readHouse = (h: Element, fix?: string[]): Sr6Entry[] =>
  each(
    [...h.children],
    e => {
      const kind = KIND_OF_TAG.get(e.localName)
      if (!kind) throw new Error(`a <${e.localName}> isn’t a catalog entry`)
      return toEntry(e, kind)
    },
    label,
    fix,
  )
export function readNpc(n: Element, fix?: string[]): Sr6Npc {
  const fk = n.getAttribute('fromKind')
  const stats = each(
    kids(n, 'stat'),
    e => {
      const key = e.getAttribute('key') ?? '',
        value = e.getAttribute('value') ?? ''
      if (!/^[a-z]{1,20}$/.test(key)) throw new Error(`the key “${key.slice(0, 40)}” isn’t 1 to 20 letters a to z`)
      if (value.length > 80) throw new Error(`the ${key} value is longer than 80 characters`)
      return [key, value] as const
    },
    label,
    fix,
  )
  return def({
    kind: oneOf(n.getAttribute('kind'), SR6_NPC_KINDS, 'NPC kind', 'grunt', fix)!,
    rating: num(n, 'rating'),
    group: str(n, 'group'),
    from:
      fk == null
        ? undefined
        : {
            kind: oneOf(fk, CATALOG_KINDS, 'NPC catalog kind')!,
            id: n.getAttribute('fromId') ?? '',
            name: n.getAttribute('fromName') ?? '',
            source: n.getAttribute('fromSource') ?? '',
            page: num(n, 'fromPage', 0),
          },
    stats: Object.fromEntries(stats),
    lines: each(kids(n, 'line'), e => ({ part: oneOf(e.getAttribute('part'), SR6_NPC_PARTS, 'line part')!, text: e.textContent ?? '' }), label, fix),
    design: yes(n, 'designed') && {
      powers: each(kids(n, 'power'), readCritterPower, label, fix),
      weaknesses: each(kids(n, 'weakness'), readCritterPower, label, fix),
      skills: each(
        kids(n, 'skill'),
        e => def({ id: str(e, 'id'), name: e.getAttribute('name') ?? '', rank: num(e, 'rank', 0), spec: str(e, 'spec') }),
        label,
        fix,
      ),
      dice: num(n, 'dice', 1),
    },
  })
}
export const readCritterPower = (e: Element) => def({ id: str(e, 'id'), name: e.getAttribute('name') ?? '', level: num(e, 'level'), note: str(e, 'note') })

export function readDesign(d: Element, fix?: string[]): Sr6Design {
  return def({
    kind: oneOf(d.getAttribute('kind'), ['vehicle', 'drone'] as const, 'design kind', 'vehicle', fix)!,
    base: str(d, 'base'),
    removedParts: (u => (u.length ? u : undefined))(str(d, 'removedParts')?.split(/\s+/).filter(Boolean) ?? []),
    chassis: str(d, 'chassis'),
    customChassis: ((k: Element | null) =>
      k
        ? {
            name: k.getAttribute('name') ?? '',
            dp: num(k, 'dp', 0),
            body: num(k, 'body', 0),
            armor: num(k, 'armor', 0),
            handling: num(k, 'handling', 0),
            seats: num(k, 'seats', 0),
            sizeClass: num(k, 'sizeClass', 0),
            cargoFrom: k.getAttribute('cargoFrom') === 'size' ? ('size' as const) : undefined,
            cargo: num(k, 'cargo'),
          }
        : undefined)(kid(d, 'customChassis')),
    powertrain: str(d, 'powertrain'),
    customPowertrain: ((k: Element | null) =>
      k
        ? {
            name: k.getAttribute('name') ?? '',
            dp: num(k, 'dp', 0),
            accel: num(k, 'accel', 0),
            interval: num(k, 'interval', 0),
            topSpeed: num(k, 'topSpeed', 0),
          }
        : undefined)(kid(d, 'customPowertrain')),
    console: str(d, 'console'),
    options: each(
      kids(d, 'option'),
      o => {
        const level = num(o, 'level', 1)
        if (!Number.isInteger(level)) throw new Error(`level="${level}" isn’t a whole number`)
        const road = str(o, 'road') === undefined ? undefined : oneOf(o.getAttribute('road'), ['on', 'off'] as const, 'Improved Handling road', undefined, fix)
        return def({ id: o.getAttribute('id') ?? '', level, road })
      },
      label,
      fix,
    ),
    mods: each(kids(d, 'purchase'), x => readPurchase(x, fix), label, fix),
    hardpoints: (h => (h.length ? h : undefined))(
      kids(d, 'hardpoint').map(h =>
        def({
          grade: num(h, 'grade', 0),
          weapon: str(h, 'weapon'),
          size: num(h, 'size'),
          mount: h.hasAttribute('mount') ? oneOf(h.getAttribute('mount'), ['inline', 'open'] as const, 'weapon mount', undefined, fix) : undefined,
          popOut: yes(h, 'popOut'),
          link: h.hasAttribute('link') ? oneOf(h.getAttribute('link'), ['twin', 'quad'] as const, 'linked weapons', undefined, fix) : undefined,
          dedicated: yes(h, 'dedicated'),
        }),
      ),
    ),
    diy: yes(d, 'diy'),
    approved: yes(d, 'approved'),
  })
}
