// Character <-> XML (docs/character-format.md, public/data/schema/character.xsd).
// The file a runner is saved as on the server, and what Export writes.
// Summary fields sit on the root element so a server can list files without parsing them.
import type { AmpEntry, AmpTemplate, CareerEvent, Character, EffectPick, Item, ItemEntry } from '../model/types'
import { ATTRS } from '../model/types'
import { toAmp, toItem } from './parse'
import { FORMAT_VERSION, migrate } from './file'

export const CHAR_NS = 'urn:chummer-anarchy2:character:1'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const attrs = (o: Record<string, unknown>) => Object.entries(o)
  .filter(([, v]) => v !== undefined && v !== null && v !== '')
  .map(([k, v]) => ` ${k}="${esc(String(v))}"`).join('')
const el = (name: string, a: Record<string, unknown>, children = '') => (children ? `<${name}${attrs(a)}>${children}</${name}>` : `<${name}${attrs(a)}/>`)
const text = (name: string, s: string | undefined) => (s ? `<${name}>${esc(s)}</${name}>` : '')

// ---- catalog snapshots, written in the data files' own format ----
const effectXml = (e: EffectPick) => el('effect', { ref: e.ref, param: e.param, value: e.value, note: e.note })
const templateXml = (t: AmpTemplate) => el('amp', { id: t.id, type: t.type, printedRating: t.printedRating, vehicle: t.vehicle, mod: t.mod || undefined, source: t.source, page: t.page },
  text('name', t.name) + (t.item ? el('item', { kind: t.item.kind, specialist: t.item.specialist || undefined, armor: t.item.armor, dv: t.item.dv, ranges: t.item.ranges }) : '')
  + t.effects.map(effectXml).join('') + `<narrative>${esc(t.narrative)}</narrative>`)
const catalogItemXml = (i: Item) => el('item', { id: i.id, kind: i.kind, specialist: i.specialist || undefined, armor: i.armor, dv: i.dv, ranges: i.ranges, category: i.category, source: i.source, page: i.page },
  text('name', i.name) + `<text>${esc(i.text)}</text>`)

const ampXml = (a: AmpEntry) => el('amp', { uid: a.uid, type: a.type, name: a.name, catalogId: a.catalogId, linkedItem: a.linkedItem, vehicle: a.vehicle },
  text('narrative', a.narrative) + a.effects.map(effectXml).join('') + (a.snapshot ? `<snapshot>${templateXml(a.snapshot)}</snapshot>` : ''))
const itemXml = (i: ItemEntry) => el('item', { uid: i.uid, kind: i.kind, name: i.name, catalogId: i.catalogId, specialist: i.specialist || undefined, armor: i.armor, dv: i.dv, ranges: i.ranges, price: i.price },
  i.snapshot ? `<snapshot>${catalogItemXml(i.snapshot)}</snapshot>` : '')

function eventXml(e: CareerEvent): string {
  const base = { id: e.id, at: e.at, type: e.type }
  switch (e.type) {
    case 'earn': return el('event', { ...base, amount: e.amount, run: e.run, date: e.date })
    case 'advance': return el('event', { ...base, path: e.path, from: e.from, to: e.to, cost: e.cost })
    case 'buy': return el('event', { ...base, cost: e.cost }, itemXml(e.item))
    case 'sell': return el('event', { ...base, itemUid: e.itemUid })
    case 'amp-add': return el('event', { ...base, cost: e.cost }, ampXml(e.amp))
    case 'amp-modify': return el('event', { ...base, ampUid: e.ampUid, cost: e.cost }, `<before>${ampXml(e.before)}</before><after>${ampXml(e.after)}</after>`)
    case 'spec-add': return el('event', { ...base, skill: e.skill, spec: e.spec, cost: e.cost })
    case 'knowledge-add': return el('event', { ...base, name: e.name, cost: e.cost })
    case 'note': return el('event', base, `<text>${esc(e.text)}</text>`)
    case 'void': return el('event', { ...base, eventId: e.eventId, reason: e.reason })
  }
}

/** Serialize a character. `rev` is the server's revision counter (omitted for exports). */
export function characterToXml(ch: Character, rev?: number): string {
  const b = ch.build
  const body = [
    text('portrait', ch.identity.portrait), text('background', ch.identity.background), text('notes', ch.identity.notes),
    ...ch.narrative.keywords.map(k => `<keyword>${esc(k)}</keyword>`),
    ...ch.narrative.dispositions.map(k => `<disposition>${esc(k)}</disposition>`),
    ...ch.narrative.cues.map(k => `<cue>${esc(k)}</cue>`),
    el('build', { mainArmor: b.mainArmor, altArmor: b.altArmor },
      el('attributes', Object.fromEntries(ATTRS.map(a => [a, b.attributes[a]])))
      + b.skills.map(s => el('skill', { id: s.id, rating: s.rating }, s.specs.map(x => `<spec>${esc(x)}</spec>`).join(''))).join('')
      + b.knowledge.map(k => `<knowledge>${esc(k)}</knowledge>`).join('')
      + b.amps.map(ampXml).join('') + b.items.map(itemXml).join('')),
    ch.career.length ? `<career>${ch.career.map(eventXml).join('')}</career>` : '',
    ...ch.overrides.map(o => el('override', { code: o.code, path: o.path }, esc(o.note))),
  ].join('\n  ')
  const root = attrs({ formatVersion: FORMAT_VERSION, id: ch.id, rev, streetName: ch.identity.streetName, name: ch.identity.name,
    metatype: ch.identity.metatype, level: ch.level, package: ch.package, lifestyle: ch.identity.lifestyle,
    finalizedAt: ch.finalizedAt, finalRemaining: ch.finalRemaining, updatedAt: ch.updatedAt, lastExportedAt: ch.lastExportedAt })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ca2:character xmlns:ca2="${CHAR_NS}"${root}>\n  ${body}\n</ca2:character>\n`
}

// ---- reading ----
const kids = (e: Element, name: string) => [...e.children].filter(c => c.localName === name)
const kid = (e: Element, name: string) => kids(e, name)[0]
const s = (e: Element, n: string) => e.getAttribute(n) ?? undefined
const n = (e: Element, n: string) => { const v = e.getAttribute(n); return v == null ? undefined : Number(v) }
const t = (e: Element | undefined) => e?.textContent ?? ''

function readEffect(e: Element): EffectPick {
  const out: EffectPick = { ref: e.getAttribute('ref')! }
  if (s(e, 'param') !== undefined) out.param = s(e, 'param')
  if (n(e, 'value') !== undefined) out.value = n(e, 'value')
  if (s(e, 'note') !== undefined) out.note = s(e, 'note')
  return out
}
function readAmp(e: Element): AmpEntry {
  const a: AmpEntry = { uid: e.getAttribute('uid')!, type: e.getAttribute('type')!, name: e.getAttribute('name') ?? '',
    narrative: t(kid(e, 'narrative')), effects: kids(e, 'effect').map(readEffect) }
  for (const k of ['catalogId', 'linkedItem', 'vehicle'] as const) if (s(e, k) !== undefined) a[k] = s(e, k)
  const snap = kid(e, 'snapshot')
  if (snap?.firstElementChild) a.snapshot = toAmp(snap.firstElementChild)
  return a
}
function readItem(e: Element): ItemEntry {
  const i: ItemEntry = { uid: e.getAttribute('uid')!, kind: e.getAttribute('kind') as ItemEntry['kind'], name: e.getAttribute('name') ?? '' }
  if (s(e, 'catalogId') !== undefined) i.catalogId = s(e, 'catalogId')
  if (e.getAttribute('specialist') === 'true') i.specialist = true
  for (const k of ['armor', 'price'] as const) if (n(e, k) !== undefined) i[k] = n(e, k)
  for (const k of ['dv', 'ranges'] as const) if (s(e, k) !== undefined) i[k] = s(e, k)
  const snap = kid(e, 'snapshot')
  if (snap?.firstElementChild) i.snapshot = toItem(snap.firstElementChild)
  return i
}
function readEvent(e: Element): CareerEvent {
  const base = { id: e.getAttribute('id')!, at: e.getAttribute('at')! }
  const type = e.getAttribute('type')
  switch (type) {
    case 'earn': return { ...base, type, amount: n(e, 'amount')!, run: s(e, 'run') ?? '', date: s(e, 'date') ?? '' }
    case 'advance': return { ...base, type, path: s(e, 'path')!, from: n(e, 'from')!, to: n(e, 'to')!, cost: n(e, 'cost')! }
    case 'buy': return { ...base, type, cost: n(e, 'cost')!, item: readItem(kid(e, 'item')) }
    case 'sell': return { ...base, type, itemUid: s(e, 'itemUid')! }
    case 'amp-add': return { ...base, type, cost: n(e, 'cost')!, amp: readAmp(kid(e, 'amp')) }
    case 'amp-modify': return { ...base, type, ampUid: s(e, 'ampUid')!, cost: n(e, 'cost')!,
      before: readAmp(kid(kid(e, 'before'), 'amp')), after: readAmp(kid(kid(e, 'after'), 'amp')) }
    case 'spec-add': return { ...base, type, skill: s(e, 'skill')!, spec: s(e, 'spec')!, cost: n(e, 'cost')! }
    case 'knowledge-add': return { ...base, type, name: s(e, 'name')!, cost: n(e, 'cost')! }
    case 'note': return { ...base, type, text: t(kid(e, 'text')) }
    case 'void': return { ...base, type, eventId: s(e, 'eventId')!, reason: s(e, 'reason') ?? '' }
    default: throw new Error(`unknown career event "${type}"`)
  }
}

type Parsed = { ok: true; character: Character; rev?: number } | { ok: false; reason: string }

/** Never throws; a bad file comes back with a reason. */
export function xmlToCharacter(xml: string): Parsed {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.getElementsByTagName('parsererror')[0]) return { ok: false, reason: 'Not valid XML.' }
  const r = doc.documentElement
  if (r.localName !== 'character' || r.namespaceURI !== CHAR_NS) return { ok: false, reason: 'Not a Chummer Anarchy 2.0 character file.' }
  const v = n(r, 'formatVersion')
  if (!v) return { ok: false, reason: 'Missing formatVersion.' }
  if (v > FORMAT_VERSION) return { ok: false, reason: `This file is from a newer version of the app (format ${v}).` }
  try {
    const b = kid(r, 'build')
    if (!b || !r.getAttribute('id') || !r.getAttribute('metatype')) return { ok: false, reason: 'Missing id, metatype or build.' }
    const at = kid(b, 'attributes')
    const ch: Character = {
      formatVersion: 1, id: r.getAttribute('id')!,
      identity: { name: s(r, 'name') ?? '', streetName: s(r, 'streetName') ?? '', metatype: r.getAttribute('metatype')!,
        background: t(kid(r, 'background')), notes: t(kid(r, 'notes')) },
      narrative: { keywords: kids(r, 'keyword').map(t), dispositions: kids(r, 'disposition').map(t), cues: kids(r, 'cue').map(t) },
      level: s(r, 'level') ?? 'runner', package: s(r, 'package') ?? 'free',
      build: {
        attributes: Object.fromEntries(ATTRS.map(a => [a, Number(at?.getAttribute(a) ?? 1)])) as Character['build']['attributes'],
        skills: kids(b, 'skill').map(k => ({ id: k.getAttribute('id')!, rating: Number(k.getAttribute('rating')), specs: kids(k, 'spec').map(t) })),
        knowledge: kids(b, 'knowledge').map(t),
        amps: kids(b, 'amp').map(readAmp), items: kids(b, 'item').map(readItem),
      },
      career: kid(r, 'career') ? kids(kid(r, 'career'), 'event').map(readEvent) : [],
      overrides: kids(r, 'override').map(o => ({ code: o.getAttribute('code')!, path: o.getAttribute('path')!, note: t(o) })),
      updatedAt: s(r, 'updatedAt') ?? new Date().toISOString(),
    }
    if (s(b, 'mainArmor')) ch.build.mainArmor = s(b, 'mainArmor')
    if (s(b, 'altArmor')) ch.build.altArmor = s(b, 'altArmor')
    if (kid(r, 'portrait')) ch.identity.portrait = t(kid(r, 'portrait'))
    if (s(r, 'lifestyle')) ch.identity.lifestyle = s(r, 'lifestyle')
    if (s(r, 'finalizedAt')) ch.finalizedAt = s(r, 'finalizedAt')
    if (n(r, 'finalRemaining') !== undefined) ch.finalRemaining = n(r, 'finalRemaining')
    if (s(r, 'lastExportedAt')) ch.lastExportedAt = s(r, 'lastExportedAt')
    return { ok: true, character: migrate(ch as unknown as Record<string, unknown>), rev: n(r, 'rev') }
  } catch (e) {
    return { ok: false, reason: `Damaged file: ${(e as Error).message}` }
  }
}
