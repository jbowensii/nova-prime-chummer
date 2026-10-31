// Starter packs (owner ruling 2026-10-31, option A): buying a pack expands it into its contents as separate, editable lines
// (gear, a SIN with its licences, a lifestyle), charged at the pack's price. The pack's price is the only nuyen it costs:
// every expanded line carries `pack` (the expansion's uid) and is priced 0, so the totals equal the pack's. Undoing the
// pack takes all of them away. The catalog's packs hold their contents as printed text (`<item>`), so each item is read
// (a count, a rating, a SIN, licences, a lifestyle, another pack) and matched to the catalog by name; one the catalog
// doesn't have stays a free line named as printed, never guessed.
import { matchKey, nameRatio, normName } from '../../../catalog/domain/names'
import { newId } from '../../../../core/shared/types'
import type { PurchaseKind, Sr6Build, Sr6PackExpansion, Sr6Purchase, Sr6Sin } from '../../../formats/domain/character'
import { rateLicences } from '../../../formats/domain/character'
import type { Sr6Entry, Sr6Kind } from '../../../formats/domain/types'
import type { Sr6Data } from '../../../catalog/domain/data'
import { fitsOnly, structureOf } from '../../../catalog/domain/structure'
import { ammoRowOf } from './npc'
import { bookValue, dataFind, ratingRange } from '../../../catalog/domain/values'
import { STACKING } from '../../../catalog/domain/categories'

export type { Sr6PackExpansion }

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
const COUNT = `\\d+|${Object.keys(NUMBER_WORDS).join('|')}`
const count = (s: string) => (/^\d+$/.test(s) ? Number(s) : (NUMBER_WORDS[s.toLowerCase()] ?? 1))
// kinds an item is looked up in, in order
const KINDS: PurchaseKind[] = ['gear', 'electronics', 'armor', 'weapons', 'programs', 'augmentations', 'vehicles']
const LICENCE_NAME = 'Fake licence (specify)'

/** Whether an accessory may be fitted to its host: the reason it may not, else undefined (actions.ts accessoryProblem). */
export type FitCheck = (host: Sr6Purchase, acc: Sr6Purchase) => string | undefined
const all = (data: Sr6Data, kind: Sr6Kind) => data.kindEntries?.(kind) ?? []

/** The catalog entry a printed item is, in KINDS: by name, else by loose name (plural, rating), else one at least 0.85 alike;
 *  undefined when none. Ties: the pack's own book. */
function find(data: Sr6Data, printed: string, source: string, strict = false): { kind: PurchaseKind; e: Sr6Entry } | undefined {
  const pick = (es: Sr6Entry[]) => es.find(e => e.source === source) ?? es[0]
  // the name, then without a trailing type word the catalog leaves off (`Hermes Ikon commlink`)
  const names = [printed, printed.replace(/\s+(?:commlink|pack|packet)s?$/i, '')].filter((n, i, l) => l.indexOf(n) === i)
  for (const name of names) {
    const key = matchKey(name),
      norm = normName(name),
      bag = key.split(' ').sort().join(' ')
    if (key.length < 3) continue
    // (a word bag: `area jammer` is the catalog's `Jammer, area`)
    const test = {
      exact: (e: Sr6Entry) => normName(e.name) === norm,
      loose: (e: Sr6Entry) => matchKey(e.name) === key,
      words: (e: Sr6Entry) => matchKey(e.name).split(' ').sort().join(' ') === bag,
      close: (e: Sr6Entry) => nameRatio(matchKey(e.name), key) >= 0.85,
    }
    for (const level of strict ? (['exact', 'loose'] as const) : (['exact', 'loose', 'words', 'close'] as const))
      for (const kind of KINDS) {
        const es = all(data, kind).filter(test[level])
        if (es.length) return { kind, e: pick(es) }
      }
  }
  return undefined
}

/** A weapon mod's printed name less where it sits and what it comes with (`top-mounted laser sight`, `internal smartgun
 *  system with vision magnification`). */
const modName = (n: string) =>
  n
    .replace(/^w\/\s*|^specialized\s+/i, '')
    .replace(/\s+(?:with|w\/)\s.*$/i, '')
    .replace(/\b(?:top|under|side|barrel)[- ]?mounted\s+|\bunderbarrel\s+/gi, '')
    .trim()
const STAT =
  /^(?:[+-]\s*\d|(?:body|agility|reaction|strength|willpower|logic|intuition|charisma|edge|magic|resonance|defense rating|unarmed ar|initiative)\b[^a-z]*[+-]?\d|(?:\d+\s+)?(?:extra boxes|six extra boxes))/i
const isMod = (e: Sr6Entry) => fitsOnly(structureOf(e)) || /^ACCESSORY\//.test(e.attrs.class ?? '')
/** The owner's "standard item" rule for what a pack prints loosely: ammunition, grenades and spare clips become the catalog's
 *  regular lines. A printed part (`5 spare clips`, `100 gel rounds`, `laser sight`) for `host` (the weapon it comes with):
 *  [] fitted to it as an accessory; extra top-level lines (ammunition for it, grenades); undefined: not such a part. */
function attach(data: Sr6Data, w: string, host: Sr6Purchase | undefined, source: string, check: FitCheck): Sr6Purchase[] | undefined {
  const lead = new RegExp(`^(${COUNT})\\s+`, 'i').exec(w),
    n = lead ? count(lead[1]) : 1,
    rest = (lead ? w.slice(lead[0].length) : w).replace(/\s*\([^()]*\)/g, '').trim(),
    line = (kind: PurchaseKind, e: Sr6Entry, extra: Partial<Sr6Purchase> = {}): Sr6Purchase => ({
      uid: newId(),
      kind,
      id: e.id,
      name: e.name,
      qty: 1,
      accessories: [],
      ...extra,
    })
  // grenades: the standard grenade of the type (`2 stun grenades`), one line each
  const gren = /^(.*?)\s*grenades?$/i.exec(rest)
  if (gren && lead) {
    const words = normName(gren[1]).split(' ').filter(Boolean)
    const e = words.length
      ? all(data, 'weapons').find(
          g =>
            g.attrs.class === 'AMMUNITION/GRENADES' &&
            words.every(x =>
              normName(g.name)
                .split(/ /)
                .some(y => y.startsWith(x.slice(0, 4))),
            ),
        )
      : undefined
    if (e) return Array.from({ length: n }, () => line('weapons', e))
  }
  // spare clips (`5 spare variable ammunition clips`, `4 spare drums`): the weapon's spare clip, one each
  if (host && lead && /^spare\b.*\b(?:clips?|drums?|magazines?)$/i.test(rest)) {
    const e = all(data, 'weapons').find(g => /^spare clip$/i.test(g.name))
    if (e) {
      const accs = Array.from({ length: n }, () => line('weapons', e)).filter(a => !check(host, a))
      host.accessories.push(...accs)
      return accs.length ? [] : undefined
    }
  }
  // ammunition (`100 gel rounds`): the ammunition of the weapon's class in units of its pack size, with the named ammo type
  const am = /^(.*?)\s*(?:rounds|ammo|ammunition|shells|darts|bolts|arrows)$/i.exec(rest)
  const row = host && am && lead ? ammoRowOf(all(data, 'weapons').find(e => e.id === host.id) ?? ({ attrs: {}, name: host.name ?? '' } as Sr6Entry)) : undefined
  if (am && row) {
    const e = all(data, 'gear').find(g => g.attrs.class === row[0] && row[1].test(g.name))
    if (e) {
      const size = Number(/(\d+)/.exec(e.attrs.per ?? '')?.[1]) || 10,
        type = normName(am[1].replace(/\bregular\b/i, '')),
        t = type
          ? all(data, 'ammotypes').find(a => [a.name, ...(a.aliases ?? [])].some(x => normName(x) === type || normName(x) === `${type} ammo`))
          : undefined,
        l = line('gear', e, { qty: Math.max(1, Math.ceil(n / size)) })
      if (t) l.accessories.push(line('ammotypes', t))
      return [l]
    }
  }
  // a weapon mod (`laser sight`, `silencer`): fitted to the weapon whenever it takes it
  if (host) {
    const f = find(data, modName(rest), source)
    if (f && isMod(f.e)) {
      const ar = Number(/\s(\d+)$/.exec(rest)?.[1]) || undefined,
        a = line(f.kind, f.e, { qty: STACKING.has(f.kind) ? n : 1, ...(ar !== undefined && ratingRange(f.e.attrs.rating).includes(ar) ? { rating: ar } : {}) })
      if (!check(host, a)) {
        host.accessories.push(a)
        return []
      }
    }
  }
  return undefined
}

/** One printed item's lines. ponytail: reads the common phrasings of the packs (a leading count, `(rating N)`, a trailing
 *  note), not free prose; an item it can't match is a free custom line named as printed. */
function itemLines(data: Sr6Data, printed: string, source: string, check: FitCheck): Sr6Purchase[] {
  const text = printed.trim()
  const lead = new RegExp(`^(${COUNT})\\s+(?:x\\s*)?`, 'i').exec(text),
    qty = lead ? count(lead[1]) : 1
  let rest = lead ? text.slice(lead[0].length) : text
  const tail = /\s*\(?\bx\s*(\d+)\)?\s*$/i.exec(rest)
  rest = tail ? rest.slice(0, tail.index) : rest
  const n = tail ? Number(tail[1]) : qty
  const paren = [...rest.matchAll(/\(([^()]*)\)/g)].map(m => m[1])
  const rating = Number(/rating\s+(\d+)/i.exec(paren.join(' '))?.[1]) || undefined
  const name = rest.replace(/\s*\([^()]*\)/g, '').trim()
  // `(w/ a, b, 5 c)`: what it comes with; each the catalog has and the host takes is fitted, the rest stay in the note
  const withs = paren
    .filter(p => /^w\//i.test(p.trim()))
    .flatMap(p =>
      p
        .trim()
        .replace(/^w\/\s*/i, '')
        .split(/,\s*|\s+and\s+/),
    )
    .map(w => w.trim())
    .filter(Boolean)
  const note = paren
    .map(p => p.replace(/rating\s+\d+,?\s*/i, '').trim())
    .filter(Boolean)
    .join('; ')
  const hit = find(data, name, source) ?? find(data, name.replace(/\s+(?:pack|packet)s?$/i, ''), source)
  const mk = (kind: PurchaseKind, extra: Partial<Sr6Purchase>): Sr6Purchase => ({
    uid: newId(),
    kind,
    qty: 1,
    accessories: [],
    ...(note ? { note: note.slice(0, 200) } : {}),
    ...extra,
  })
  const make = (q: number): Sr6Purchase[] => {
    if (!hit) return [mk('gear', { name: text.slice(0, 120), cost: 0, avail: 0, essence: 0, qty: q })]
    const range = ratingRange(hit.e.attrs.rating)
    const r = rating !== undefined && (!range.length || range.includes(rating)) ? rating : undefined
    const stack = STACKING.has(hit.kind)
    const extra: Sr6Purchase[] = []
    const made = Array.from({ length: stack ? 1 : q }, () => {
      const host = mk(hit.kind, { id: hit.e.id, name: hit.e.name, qty: stack ? q : 1, ...(r !== undefined ? { rating: r } : {}) })
      for (const w of withs) extra.push(...(attach(data, w, host, source, check) ?? []))
      return host
    })
    return [...made, ...extra]
  }
  return make(n)
}

/** A pack's contents, as lines, SINs and lifestyles (not yet in any build). */
function contents(
  data: Sr6Data,
  pack: Sr6Entry,
  depth: number,
  check: FitCheck,
): Pick<Sr6PackExpansion, 'lines' | 'sins'> & { months: { id: string; months: number }[]; licences: string[] } {
  const out = { lines: [] as Sr6Purchase[], sins: [] as Sr6Sin[], months: [] as { id: string; months: number }[], licences: [] as string[] }
  const lifestyles = all(data, 'lifestyles')
  // a weapon's pack (`Ares Light Fire 75`) comes with the weapon itself: the host of the mods, ammunition and clips it lists
  // (its name less a variant it is sold with: `Colt Manhunter Concealable Holster`, `FN HAR Throwback`, `Short-barrel Defiance T-250 External Smartgun System`)
  const gunName = [
    pack.name,
    pack.name.replace(/^short-barrel\s+/i, ''),
    pack.name.replace(/\s+(?:throwback|concealable holster|(?:external|internal)? ?smartgun system)$/i, ''),
  ]
    .flatMap(n => [n, n.replace(/^short-barrel\s+/i, '')])
    .find(n => depth === 2 && find(data, n, pack.source, true)?.kind === 'weapons')
  if (gunName) out.lines.push(...itemLines(data, gunName, pack.source, check))
  for (const raw of items(pack)) {
    const t = raw.trim()
    // a fake SIN (`Fake SIN (rating 4)`)
    const sin = /\bSIN\b/.test(t) && !/licen[cs]e/i.test(t) ? t : undefined
    if (sin) {
      out.sins.push({ uid: newId(), name: 'Pack SIN', kind: 'fake', rating: Number(/rating\s+(\d+)/i.exec(sin)?.[1]) || 1, licences: [] })
      continue
    }
    // licences (`two fake licenses (rating 4, specify license)`): on the pack's SIN, to be named by the player
    const lic = new RegExp(`^(${COUNT})\\s+(?:fake\\s+)?licen[cs]es?\\b`, 'i').exec(t) ?? (/^(?:a\s+)?(?:fake\s+)?licen[cs]e\b/i.test(t) ? ['', '1'] : null)
    if (lic) {
      // (the names the pack prints in its bracket, else one to specify)
      const named = [...t.matchAll(/\(([^()]*)\)/g)].flatMap(m => m[1].split(/,\s*/)).filter(w => w && !/^(?:rating\b|specify)/i.test(w))
      out.licences.push(...(named.length ? named : Array.from({ length: count(lic[1]) }, () => LICENCE_NAME)))
      continue
    }
    // a lifestyle (`2 months low lifestyle`, `One month Low lifestyle`)
    const life = new RegExp(`^(${COUNT})\\s+months?\\s+([a-z -]+?)\\s+lifestyle\\b`, 'i').exec(t)
    const style = life && lifestyles.find(e => normName(e.name) === normName(life[2]))
    if (life && style) {
      out.months.push({ id: style.id, months: count(life[1]) })
      continue
    }
    // another pack (`Shadowrunner Starter PACK`): its contents too, its price not
    const inner =
      depth > 0 && /\bpack\b/i.test(t) ? all(data, 'packs').find(p => normName(p.name) === normName(t.replace(/\s+(?:pack|packet)s?$/i, ''))) : undefined
    if (inner && inner.id !== pack.id) {
      const c = contents(data, inner, depth - 1, check)
      out.lines.push(...c.lines)
      out.sins.push(...c.sins)
      out.months.push(...c.months)
      out.licences.push(...c.licences)
      continue
    }
    // a part listed on its own after a weapon (a mod, ammunition, clips) or grenades: attached as above
    const host = out.lines.findLast(l => l.kind === 'weapons' || l.kind === 'armor')
    const extra = attach(data, t, host, pack.source, check)
    if (extra) {
      out.lines.push(...extra)
      continue
    }
    // a stat line (`Agility +2`, `+2d6 Initiative dice`, `Defense Rating +15`): a note on the item it modifies
    if (STAT.test(t) && out.lines.length) {
      const last = out.lines.findLast(l => l.kind === 'augmentations') ?? out.lines.at(-1)!
      last.note = `${last.note ? `${last.note}; ` : ''}${t}`.slice(0, 200)
      continue
    }
    out.lines.push(...itemLines(data, t, pack.source, check))
  }
  return out
}
const items = (pack: Sr6Entry) => pack.parts.filter(p => p.tag === 'item').map(p => p.text)

/** The pack's printed price (undefined: the catalog prints none we can read). */
export const packCost = (data: Sr6Data, pack: Sr6Entry) => bookValue(pack, 'cost', undefined, dataFind(data)).n ?? undefined

/** What buying pack `id` puts on the build `b` (b is read, never changed), or undefined for an unknown pack or one with no
 *  readable price. */
export function expandPack(data: Sr6Data, id: string, b: Pick<Sr6Build, 'sins'>, check: FitCheck = () => undefined): Sr6PackExpansion | undefined {
  const pack = data.entry('packs', id),
    cost = pack && packCost(data, pack)
  if (!pack || cost === undefined) return undefined
  const uid = newId(),
    c = contents(data, pack, 2, check),
    sins: Sr6Sin[] = c.sins.map(s => ({ ...s, pack: uid }))
  // the licences go on the pack's first SIN, each rated as it
  if (sins[0]) {
    for (const name of c.licences) sins[0].licences.push({ name, rating: 1 })
    rateLicences(sins[0])
  }
  // a lifestyle is always one SIN's: the pack's, else the runner's first, else a placeholder the pack brings
  let host = sins[0]?.uid ?? b.sins[0]?.uid
  if (!host && c.months.length) {
    const p: Sr6Sin = { uid: newId(), name: '', kind: 'real', licences: [], placeholder: true, pack: uid }
    sins.push(p)
    host = p.uid
  }
  return {
    uid,
    id,
    name: pack.name,
    cost,
    lines: c.lines.map(l => ({ ...l, pack: uid })),
    sins,
    lifestyles: c.months.map(m => ({ sin: host!, line: { uid: newId(), id: m.id, months: m.months, pack: uid } })),
  }
}

/** The expansion put on the build (in place); structuredClone so a stored expansion replays the same each time. */
export function applyPack(b: Sr6Build, x: Sr6PackExpansion): void {
  const e = structuredClone(x)
  b.purchases.push(...e.lines)
  b.sins.push(...e.sins)
  for (const { sin, line } of e.lifestyles) {
    const s = b.sins.find(y => y.uid === sin)
    if (s) s.lifestyles = [...(s.lifestyles ?? []), line]
  }
}

/** Every line of pack `uid` taken off the build (in place): its gear, SINs and lifestyles. */
export function removePack(b: Sr6Build, uid: string): void {
  b.purchases = b.purchases.filter(x => x.pack !== uid)
  b.sins = b.sins.filter(s => s.pack !== uid)
  for (const s of b.sins) {
    if (!s.lifestyles?.some(l => l.pack === uid)) continue
    s.lifestyles = s.lifestyles.filter(l => l.pack !== uid)
    if (!s.lifestyles.length) delete s.lifestyles
  }
}

/** The line that charges a pack's price in creation (the expansion's own lines are free); a pack's header has `pack` = its own uid. */
export const packHeader = (x: Sr6PackExpansion): Sr6Purchase => ({
  uid: x.uid,
  kind: 'gear',
  name: `${x.name} (pack price)`,
  cost: x.cost,
  avail: 0,
  essence: 0,
  qty: 1,
  accessories: [],
  pack: x.uid,
})
/** Whether a line is a pack's header (it, not its contents, carries the price). */
export const isPackHeader = (x: Pick<Sr6Purchase, 'uid' | 'pack'>) => x.pack !== undefined && x.pack === x.uid
