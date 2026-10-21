// Character <-> XML (docs/character-format.md, public/data/schema/character.xsd).
// The file a runner is saved as on the server, and what Export writes.
// Summary fields sit on the root element so a server can list files without parsing them.
import type { AmpEntry, AmpTemplate, CareerEvent, Change, Character, EffectPick, Item, ItemEntry, Npc, VehicleBase } from './types'
import { ATTRS } from './types'
import { effectStateAttrs, readEffectState } from './effects'
import { toAmp, toItem, toVehicle } from './parse'
import { FORMAT_VERSION, knowledgeEntry, migrate, normalizeNpc } from './file'
import type { Codec } from '../../../core/shared/types'
import { BAD_XML_CHAR, attrs, badCharAt, each, el, esc, escAttr, kid, kids, need, readDoc, text, type ReadOpts } from '../../../core/shared/xml'

export const CHAR_NS = 'urn:chummer-anarchy2:character:1'
/** The Shadowrun 6 runner's (src/sr6/formats/domain/charxml.ts SR6_CHAR_NS): refused here, saying where it belongs. */
const SR6_NS = 'urn:chummer-sr6:character:1'

// what XML 1.0 can't hold, the escapers, the writing and reading helpers (shared by both games: src/core/shared/xml.ts)
export { BAD_XML_CHAR, esc, escAttr, attrs, el, text, kids, kid, badCharAt, each, need, readDoc, type ReadOpts }

// ---- catalog snapshots, written in the data files' own format ----
export const effectXml = (e: EffectPick) =>
  el('effect', { ref: e.ref, param: e.param, value: e.value, note: e.note, unpriced: e.unpriced, ...effectStateAttrs(e) })
const templateXml = (t: AmpTemplate) =>
  el(
    'amp',
    {
      id: t.id,
      type: t.type,
      printedRating: t.printedRating,
      vehicle: t.vehicle,
      mod: t.mod || undefined,
      family: t.family,
      level: t.level,
      source: t.source,
      page: t.page,
    },
    text('name', t.name) +
      (t.item ? el('item', { kind: t.item.kind, specialist: t.item.specialist || undefined, armor: t.item.armor, dv: t.item.dv, ranges: t.item.ranges }) : '') +
      t.effects.map(effectXml).join('') +
      `<narrative>${esc(t.narrative)}</narrative>`,
  )
const catalogItemXml = (i: Item) =>
  el(
    'item',
    {
      id: i.id,
      kind: i.kind,
      specialist: i.specialist || undefined,
      armor: i.armor,
      dv: i.dv,
      ranges: i.ranges,
      category: i.category,
      source: i.source,
      page: i.page,
    },
    text('name', i.name) + (i.effects ?? []).map(effectXml).join('') + `<text>${esc(i.text)}</text>`,
  )
const chassisXml = (v: VehicleBase) =>
  el(
    'vehicle',
    {
      id: v.id,
      pilot: v.pilot,
      body: v.body,
      handling: v.handling,
      speed: v.speed,
      flyingSpeed: v.flyingSpeed,
      armor: v.armor,
      mount: v.mount,
      source: v.source,
      page: v.page,
    },
    text('name', v.name),
  )

const ampXml = (a: AmpEntry) =>
  el(
    'amp',
    { uid: a.uid, type: a.type, name: a.name, catalogId: a.catalogId, linkedItem: a.linkedItem, vehicle: a.vehicle, realSin: a.realSin },
    text('narrative', a.narrative) +
      a.effects.map(effectXml).join('') +
      (a.snapshot ? `<snapshot>${templateXml(a.snapshot)}</snapshot>` : '') +
      (a.chassis ? `<chassis>${chassisXml(a.chassis)}</chassis>` : ''),
  )
const itemXml = (i: ItemEntry) =>
  el(
    'item',
    {
      uid: i.uid,
      kind: i.kind,
      name: i.name,
      catalogId: i.catalogId,
      specialist: i.specialist || undefined,
      armor: i.armor,
      dv: i.dv,
      ranges: i.ranges,
      price: i.price,
      starting: i.starting,
      note: i.note,
      over: i.over,
    },
    (i.effects ?? []).map(effectXml).join('') + (i.snapshot ? `<snapshot>${catalogItemXml(i.snapshot)}</snapshot>` : ''),
  )

const pricesXml = (p?: Record<string, number>) =>
  Object.entries(p ?? {})
    .map(([key, value]) => el('price', { key, value }))
    .join('')
const readPrices = (e: Element) =>
  kids(e, 'price').length ? Object.fromEntries(kids(e, 'price').map(p => [p.getAttribute('key') ?? '', Number(p.getAttribute('value') ?? 0)])) : undefined

function eventXml(e: CareerEvent): string {
  const base = { id: e.id, at: e.at, type: e.type }
  switch (e.type) {
    case 'earn':
      return el('event', { ...base, amount: e.amount, run: e.run, date: e.date })
    case 'finalize':
      return el('event', { ...base, remaining: e.remaining }, pricesXml(e.prices))
    case 'change':
      return el(
        'event',
        { ...base, cost: e.cost },
        e.changes.map(x => el('change', { key: x.key, label: x.label, from: x.from, to: x.to })).join('') + pricesXml(e.prices),
      )
    case 'advance':
      return el('event', { ...base, path: e.path, from: e.from, to: e.to, cost: e.cost })
    case 'buy':
      return el('event', { ...base, cost: e.cost }, itemXml(e.item))
    case 'sell':
      return el('event', { ...base, itemUid: e.itemUid })
    case 'amp-add':
      return el('event', { ...base, cost: e.cost }, ampXml(e.amp))
    case 'amp-modify':
      return el('event', { ...base, ampUid: e.ampUid, cost: e.cost }, `<before>${ampXml(e.before)}</before><after>${ampXml(e.after)}</after>`)
    case 'spec-add':
      return el('event', { ...base, skill: e.skill, spec: e.spec, cost: e.cost })
    case 'knowledge-add':
      return el('event', { ...base, name: e.name, kind: e.kind, slot: e.from, cost: e.cost })
    case 'note':
      return el('event', base, `<text>${esc(e.text)}</text>`)
    case 'void':
      return el('event', { ...base, eventId: e.eventId, reason: e.reason })
  }
}

/** Serialize a character. `rev` is the server's revision counter (omitted for exports). */
export function characterToXml(ch: Character, rev?: number): string {
  const b = ch.build
  const body = [
    ...(ch.npc ? [el('npc', { kind: ch.npc.kind, tier: ch.npc.tier, fightingSpirit: ch.npc.fightingSpirit })] : []),
    text('portrait', ch.identity.portrait) + text('token', ch.identity.token),
    text('background', ch.identity.background),
    text('notes', ch.identity.notes),
    ...ch.narrative.keywords.map(k => `<keyword>${esc(k)}</keyword>`),
    ...ch.narrative.dispositions.map(k => `<disposition>${esc(k)}</disposition>`),
    ...ch.narrative.cues.map(k => `<cue>${esc(k)}</cue>`),
    el(
      'build',
      { mainArmor: b.mainArmor, altArmor: b.altArmor },
      el('attributes', Object.fromEntries(ATTRS.map(a => [a, b.attributes[a]]))) +
        b.skills.map(s => el('skill', { id: s.id, rating: s.rating }, s.specs.map(x => `<spec>${esc(x)}</spec>`).join(''))).join('') +
        b.knowledge.map(k => el('knowledge', { id: k.id, kind: k.kind, from: k.from, native: k.native }, esc(k.name))).join('') +
        b.amps.map(ampXml).join('') +
        b.items.map(itemXml).join('') +
        (b.knowledgeOrder ?? []).map(key => el('knowledgeOrder', { key })).join('') +
        (b.knowledgeHidden ?? []).map(key => el('knowledgeHidden', { key })).join(''),
    ),
    ch.career.length ? `<career>${ch.career.map(eventXml).join('')}</career>` : '',
    ...ch.overrides.map(o => el('override', { code: o.code, path: o.path }, esc(o.note))),
    ...Object.entries(ch.optionalRules ?? {}).map(([id, on]) => el('optionalRule', { id, on: String(on) })),
  ].join('\n  ')
  const root = attrs({
    formatVersion: FORMAT_VERSION,
    id: ch.id,
    rev,
    streetName: ch.identity.streetName,
    name: ch.identity.name,
    gender: ch.identity.gender,
    metatype: ch.identity.metatype,
    level: ch.level,
    package: ch.package,
    lifestyle: ch.identity.lifestyle,
    backdrop: ch.identity.backdrop,
    finalizedAt: ch.finalizedAt,
    finalRemaining: ch.finalRemaining,
    carry: ch.carry,
    allowNonCanon: ch.allowNonCanon === false ? 'false' : undefined,
    origin: ch.origin,
    sampleKey: ch.sampleKey,
    campaign: ch.campaign,
    updatedAt: ch.updatedAt,
    lastExportedAt: ch.lastExportedAt,
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ca2:character xmlns:ca2="${CHAR_NS}"${root}>\n  ${body}\n</ca2:character>\n`
}

// ---- reading ----
const s = (e: Element, n: string) => e.getAttribute(n) ?? undefined
const n = (e: Element, n: string) => {
  const v = e.getAttribute(n)
  return v == null ? undefined : Number(v)
}
const t = (e: Element | undefined) => e?.textContent ?? ''

function readEffect(e: Element): EffectPick {
  const out: EffectPick = { ref: e.getAttribute('ref')! }
  if (s(e, 'param') !== undefined) out.param = s(e, 'param')
  if (n(e, 'value') !== undefined) out.value = n(e, 'value')
  if (s(e, 'note') !== undefined) out.note = s(e, 'note')
  if (e.getAttribute('unpriced') === 'true') out.unpriced = true
  return { ...out, ...readEffectState(k => e.getAttribute(k)) }
}
function readAmp(e: Element): AmpEntry {
  const a: AmpEntry = {
    uid: e.getAttribute('uid')!,
    type: e.getAttribute('type')!,
    name: e.getAttribute('name') ?? '',
    narrative: t(kid(e, 'narrative')),
    effects: kids(e, 'effect').map(readEffect),
  }
  for (const k of ['catalogId', 'linkedItem', 'vehicle'] as const) if (s(e, k) !== undefined) a[k] = s(e, k)
  if (e.getAttribute('realSin') === 'true') a.realSin = true
  const snap = kid(e, 'snapshot')
  if (snap?.firstElementChild) a.snapshot = toAmp(snap.firstElementChild)
  const chassis = kid(e, 'chassis')?.firstElementChild
  if (chassis) a.chassis = toVehicle(chassis)
  return a
}
function readItem(e: Element): ItemEntry {
  const i: ItemEntry = { uid: e.getAttribute('uid')!, kind: e.getAttribute('kind') as ItemEntry['kind'], name: e.getAttribute('name') ?? '' }
  if (s(e, 'catalogId') !== undefined) i.catalogId = s(e, 'catalogId')
  if (e.getAttribute('specialist') === 'true') i.specialist = true
  for (const k of ['armor', 'price'] as const) if (n(e, k) !== undefined) i[k] = n(e, k)
  for (const k of ['dv', 'ranges', 'note', 'over'] as const) if (s(e, k) !== undefined) i[k] = s(e, k)
  if (s(e, 'starting') !== undefined) i.starting = s(e, 'starting') as ItemEntry['starting']
  if (kids(e, 'effect').length) i.effects = kids(e, 'effect').map(readEffect)
  const snap = kid(e, 'snapshot')
  if (snap?.firstElementChild) i.snapshot = toItem(snap.firstElementChild)
  return i
}
function readEvent(e: Element): CareerEvent {
  const base = { id: e.getAttribute('id')!, at: e.getAttribute('at')! }
  const type = e.getAttribute('type')
  switch (type) {
    case 'earn':
      return { ...base, type, amount: n(e, 'amount')!, run: s(e, 'run') ?? '', date: s(e, 'date') ?? '' }
    case 'finalize':
      return { ...base, type, remaining: n(e, 'remaining') ?? 0, ...(readPrices(e) && { prices: readPrices(e) }) }
    case 'change':
      return {
        ...base,
        type,
        cost: n(e, 'cost') ?? 0,
        ...(readPrices(e) && { prices: readPrices(e) }),
        changes: kids(e, 'change').map(x => {
          const out: Change = { key: s(x, 'key') ?? '', label: s(x, 'label') ?? '' }
          if (s(x, 'from') !== undefined) out.from = s(x, 'from')
          if (s(x, 'to') !== undefined) out.to = s(x, 'to')
          return out
        }),
      }
    case 'advance':
      return { ...base, type, path: s(e, 'path')!, from: n(e, 'from')!, to: n(e, 'to')!, cost: n(e, 'cost')! }
    case 'buy':
      return { ...base, type, cost: n(e, 'cost')!, item: readItem(need(kid(e, 'item'), 'item', 'event')) }
    case 'sell':
      return { ...base, type, itemUid: s(e, 'itemUid')! }
    case 'amp-add':
      return { ...base, type, cost: n(e, 'cost')!, amp: readAmp(need(kid(e, 'amp'), 'amp', 'event')) }
    case 'amp-modify':
      return {
        ...base,
        type,
        ampUid: s(e, 'ampUid')!,
        cost: n(e, 'cost')!,
        before: readAmp(need(kid(need(kid(e, 'before'), 'before', 'event'), 'amp'), 'amp', 'before')),
        after: readAmp(need(kid(need(kid(e, 'after'), 'after', 'event'), 'amp'), 'amp', 'after')),
      }
    case 'spec-add':
      return { ...base, type, skill: s(e, 'skill')!, spec: s(e, 'spec')!, cost: n(e, 'cost')! }
    case 'knowledge-add':
      return { ...base, type, name: s(e, 'name')!, kind: s(e, 'kind') as 'knowledge' | 'language' | undefined, from: s(e, 'slot'), cost: n(e, 'cost')! }
    case 'note':
      return { ...base, type, text: t(kid(e, 'text')) }
    case 'void':
      return { ...base, type, eventId: s(e, 'eventId')!, reason: s(e, 'reason') ?? '' }
    default:
      throw new Error(`unknown type "${type}"`)
  }
}

type Parsed = { ok: true; character: Character; rev?: number } | { ok: false; reason: string }
/** Never throws; a bad file comes back with a reason saying what and where. */
export function xmlToCharacter(xml: string, opts: ReadOpts = {}): Parsed {
  const fix = opts.repair
  const parsed = readDoc(xml, fix)
  if (!parsed.ok) return parsed
  const r = parsed.root
  if (r.localName === 'character' && r.namespaceURI === SR6_NS) return { ok: false, reason: 'This is a Shadowrun 6 runner. Import it on the Shadowrun 6 side.' }
  if (r.localName !== 'character' || r.namespaceURI !== CHAR_NS) return { ok: false, reason: 'Not a Nova Prime Chummer Anarchy 2.0 character file.' }
  const v = n(r, 'formatVersion')
  if (!v) return { ok: false, reason: 'The <character> element has no formatVersion.' }
  if (v > FORMAT_VERSION) return { ok: false, reason: `This file is from a newer version of the app (format ${v}).` }
  try {
    const b = kid(r, 'build')
    if (!r.getAttribute('id')) return { ok: false, reason: 'The <character> element has no id.' }
    if (!b) return { ok: false, reason: 'The file has no <build> element.' }
    const at = kid(b, 'attributes')
    const named = (e: Element, i: number) => `<${e.localName}> ${e.getAttribute('name') || e.getAttribute('id') || e.getAttribute('uid') || i + 1}`
    const ch: Character = {
      formatVersion: 1,
      id: r.getAttribute('id')!,
      // a draft may have no metatype yet (Review notes it)
      identity: {
        name: s(r, 'name') ?? '',
        streetName: s(r, 'streetName') ?? '',
        metatype: s(r, 'metatype') ?? '',
        background: t(kid(r, 'background')),
        notes: t(kid(r, 'notes')),
      },
      narrative: { keywords: kids(r, 'keyword').map(t), dispositions: kids(r, 'disposition').map(t), cues: kids(r, 'cue').map(t) },
      level: s(r, 'level') ?? 'runner',
      package: s(r, 'package') ?? 'free',
      build: {
        attributes: Object.fromEntries(ATTRS.map(a => [a, Number(at?.getAttribute(a) ?? 1)])) as Character['build']['attributes'],
        skills: each(
          kids(b, 'skill'),
          k => ({ id: k.getAttribute('id') ?? '', rating: Number(k.getAttribute('rating') ?? 0), specs: kids(k, 'spec').map(t) }),
          named,
          fix,
        ),
        knowledge: kids(b, 'knowledge').map(k =>
          knowledgeEntry({
            name: t(k),
            kind: s(k, 'kind') as 'knowledge' | 'language' | undefined,
            from: s(k, 'from'),
            native: k.getAttribute('native') === 'true' || undefined,
            id: s(k, 'id'),
          }),
        ),
        amps: each(kids(b, 'amp'), readAmp, named, fix),
        items: each(kids(b, 'item'), readItem, named, fix),
      },
      career: kid(r, 'career')
        ? each(kids(kid(r, 'career'), 'event'), readEvent, (e, i) => `career event ${i + 1} (${e.getAttribute('type') ?? 'no type'})`, fix)
        : [],
      overrides: kids(r, 'override').map(o => ({ code: o.getAttribute('code') ?? '', path: o.getAttribute('path') ?? '', note: t(o) })),
      ...(kids(r, 'optionalRule').length
        ? { optionalRules: Object.fromEntries(kids(r, 'optionalRule').map(o => [o.getAttribute('id') ?? '', o.getAttribute('on') === 'true'])) }
        : {}),
      updatedAt: s(r, 'updatedAt') ?? new Date().toISOString(),
    }
    if (s(b, 'mainArmor') !== undefined) ch.build.mainArmor = s(b, 'mainArmor')
    if (s(b, 'altArmor') !== undefined) ch.build.altArmor = s(b, 'altArmor')
    for (const k of ['knowledgeOrder', 'knowledgeHidden'] as const) if (kids(b, k).length) ch.build[k] = kids(b, k).map(e => e.getAttribute('key') ?? '')
    if (kid(r, 'portrait')) ch.identity.portrait = t(kid(r, 'portrait'))
    if (kid(r, 'token')) ch.identity.token = t(kid(r, 'token'))
    if (s(r, 'lifestyle') !== undefined) ch.identity.lifestyle = s(r, 'lifestyle')
    if (s(r, 'gender') !== undefined) ch.identity.gender = s(r, 'gender')
    if (s(r, 'backdrop') !== undefined) ch.identity.backdrop = s(r, 'backdrop') as Character['identity']['backdrop'] // checked by migrate()
    if (s(r, 'finalizedAt') !== undefined) ch.finalizedAt = s(r, 'finalizedAt')
    if (n(r, 'finalRemaining') !== undefined) ch.finalRemaining = n(r, 'finalRemaining')
    if (n(r, 'carry') !== undefined) ch.carry = n(r, 'carry')
    if (s(r, 'lastExportedAt') !== undefined) ch.lastExportedAt = s(r, 'lastExportedAt')
    if (s(r, 'allowNonCanon') === 'false') ch.allowNonCanon = false
    if (s(r, 'origin') !== undefined) ch.origin = s(r, 'origin')
    if (s(r, 'sampleKey') !== undefined) ch.sampleKey = s(r, 'sampleKey')
    if (s(r, 'campaign') !== undefined) ch.campaign = s(r, 'campaign')
    const npc = kid(r, 'npc')
    if (npc) {
      ch.npc = { kind: s(npc, 'kind') as Npc['kind'], tier: s(npc, 'tier') as Npc['tier'] }
      if (s(npc, 'fightingSpirit') !== undefined) ch.npc.fightingSpirit = s(npc, 'fightingSpirit') as Npc['fightingSpirit']
      const fixed = normalizeNpc(ch.npc) // migrate does it too; here repair mode says what it fixed
      if (fix) fix.push(...fixed)
    }
    return { ok: true, character: migrate(ch as unknown as Record<string, unknown>), rev: n(r, 'rev') }
  } catch (e) {
    return { ok: false, reason: `Couldn’t read ${(e as Error).message}.` }
  }
}

/** Anarchy's file format for the runner repo (src/features/runner-store/repo.ts serverRepo takes a game's codec). */
export const ca2Codec: Codec<Character> = { tag: 'ca2:character', toXml: ch => characterToXml(ch), fromXml: xml => xmlToCharacter(xml) }
