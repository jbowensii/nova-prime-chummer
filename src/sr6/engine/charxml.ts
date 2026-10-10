// Shadowrun 6 runner <-> XML (docs/sr6-character-format.md, public/data/sr6/schema/character.xsd): the file a runner is
// saved as in /api/sr6/characters and what Export writes. Summary fields sit on the root as Anarchy's
// (src/engine/charxml.ts, whose writing and reading helpers this reuses).
import { attrs, each, el, esc, kid, kids, readDoc, text, type ReadOpts } from '../../engine/charxml'
import { BACKDROPS, type Backdrop } from '../../model/types'
import {
  BONUS_SWITCHES, BONUS_TARGETS, CONTACT_TYPES, CORE_ATTRS, CP_POOLS, MAGIC_KIND_LABELS, PICK_KINDS, PRIORITY_COLUMNS, PURCHASE_KINDS, SR6_ADVANCE_OPS, SR6_ATTRS, SR6_LEDGER_TYPES,
  SR6_METHODS, SR6_NPC_KINDS, SR6_NPC_PARTS, blankBuild,
  type Bonus, type BonusSwitch, type ContactType, type MagicKind, type Sr6Advance, type Sr6Build, type Sr6Character, type Sr6Contact, type Sr6Knowledge, type Sr6LedgerEntry,
  type Sr6MartialArt, type Sr6Npc, type Sr6Pick, type Sr6Printed, type Sr6Purchase, type Sr6Quality, type Sr6Sin,
} from '../model/character'
import { SR6_KINDS, type Sr6Entry, type Sr6Kind } from '../model/types'
import type { Codec } from '../../ui/repo'
import { sr6EntryXml, toEntry } from './load'

export const SR6_CHAR_NS = 'urn:chummer-sr6:character:1'
const FORMAT_VERSION = 1
const MAGIC_KINDS = Object.keys(MAGIC_KIND_LABELS) as MagicKind[]

// ---- writing ----
const bonusXml = (x: Bonus) => el('bonus', { target: x.target, skill: x.skill, value: x.value, perRating: x.perRating, when: x.when, spec: x.spec, switch: x.switch, affects: x.affects })
const bonusesXml = (xs?: Bonus[]) => (xs ?? []).map(bonusXml).join('')
function purchaseXml(p: Sr6Purchase): string {
  return el('purchase', { uid: p.uid, kind: p.kind, id: p.id, name: p.name, cost: p.cost, avail: p.avail, essence: p.essence, rating: p.rating,
    qty: p.qty, grade: p.grade, worn: p.worn, note: p.note },
  bonusesXml(p.bonuses) + p.accessories.map(purchaseXml).join('') + (p.snapshot ? `<snapshot>${sr6EntryXml(p.snapshot)}</snapshot>` : ''))
}

// one writer per line kind: the build's lines and a ledger entry's line are the same element
const knowledgeXml = (k: Sr6Knowledge) => `<knowledge${attrs({ uid: k.uid, kind: k.kind, native: k.native, points: k.points, karma: k.karma })}>${esc(k.name)}</knowledge>`
const qualityXml = (q: Sr6Quality) => el('quality', { uid: q.uid, id: q.id, level: q.level, karma: q.karma, free: q.free, note: q.note, name: q.name })
const pickXml = (p: Sr6Pick) => el('pick', { uid: p.uid, kind: p.kind, id: p.id, level: p.level, name: p.name, note: p.note }, bonusesXml(p.bonuses))
const techniqueXml = (t: Sr6MartialArt['techniques'][number]) => el('technique', { uid: t.uid, id: t.id, name: t.name })
const martialXml = (m: Sr6MartialArt) => el('martialart', { uid: m.uid, id: m.id, name: m.name }, m.techniques.map(techniqueXml).join(''))
const contactXml = (c: Sr6Contact) => el('contact', { uid: c.uid, name: c.name, archetype: c.archetype, connection: c.connection, loyalty: c.loyalty,
  types: c.types?.length ? c.types.join(' ') : undefined })
const sinXml = (s: Sr6Sin) => el('sin', { uid: s.uid, name: s.name, kind: s.kind, rating: s.rating, gender: s.gender, placeholder: s.placeholder },
  s.licences.map(l => el('licence', l)).join('') + (s.lifestyles ?? []).map(l => el('lifestyle', { uid: l.uid, id: l.id, months: l.months })).join(''))

function buildXml(b: Sr6Build): string {
  const rows = [
    ...PRIORITY_COLUMNS.map(column => el('priority', { column, letter: b.priorities[column] })),
    ...CP_POOLS.map(pool => el('cp', { pool, points: b.cp[pool] })),
    ...b.lifepath.map(m => el('lifemodule', { id: m.id }, Object.entries(m.choices).map(([index, pick]) => el('choice', { index, pick })).join(''))),
    ...SR6_ATTRS.map(id => el('attribute', { id, ...b.attributes[id] })),
    ...b.skills.map(s => el('skill', { id: s.id, points: s.points, karma: s.karma, spec: s.spec, expertise: s.expertise, specs: s.specs?.length ? s.specs.join('; ') : undefined })),
    ...b.knowledge.map(knowledgeXml), ...b.qualities.map(qualityXml), ...b.picks.map(pickXml), ...b.martialArts.map(martialXml), ...b.purchases.map(purchaseXml),
    ...b.contacts.map(contactXml),
    ...b.sins.map(sinXml),
  ]
  return el('build', { method: b.method, magic: b.magic, aspectedSkill: b.aspectedSkill, tradition: b.tradition, drainAttr: b.drainAttr,
    powerPointsBought: b.powerPointsBought, initiation: b.initiation, submersion: b.submersion, karmaToNuyen: b.karmaToNuyen,
    bestAttr: b.bestAttr, bestExtra: b.bestExtra },
  `\n    ${rows.join('\n    ')}\n  `)
}

/** An advance's attributes and its one line (convert's karma is the entry's). */
function advanceXml(a: Sr6Advance): [Record<string, unknown>, string] {
  switch (a.op) {
    case 'attribute': case 'skill': return [{ target: a.target }, '']
    case 'spec': case 'expertise': return [{ target: a.target, name: a.name }, '']
    case 'knowledge': return [{}, knowledgeXml(a.line)]
    case 'quality': return [{}, qualityXml(a.line)]
    case 'buyoff': return [{ target: a.target }, a.line ? qualityXml(a.line) : '']
    case 'pick': return [{}, pickXml(a.line)]
    case 'martialart': return [{}, martialXml(a.line)]
    case 'technique': return [{ target: a.target }, techniqueXml(a.line)]
    case 'initiate': return [{}, a.line ? pickXml(a.line) : '']
    case 'purchase': return [{}, purchaseXml(a.line)]
    case 'drop': return [{ target: a.target }, a.line ? purchaseXml(a.line) : '']
    case 'contact': return [{}, contactXml(a.line)]
    case 'sin': return [{}, sinXml(a.line)]
    case 'lifestyle': return [{ lifestyle: a.id, months: a.months, sin: a.sin, uid: a.uid }, '']
    case 'powerpoint': case 'convert': case 'other': return [{}, '']
  }
}
function entryXml(e: Sr6LedgerEntry): string {
  const head = { id: e.id, at: e.at, type: e.type }
  switch (e.type) {
    case 'finalize': return el('entry', { ...head, karma: e.karma, nuyen: e.nuyen })
    case 'earn': return el('entry', { ...head, karma: e.karma, nuyen: e.nuyen, date: e.date }, esc(e.run))
    case 'note': return el('entry', head, esc(e.text))
    case 'void': return el('entry', { ...head, event: e.eventId }, esc(e.reason))
    case 'advance': {
      const [a, line] = advanceXml(e.advance)
      return el('entry', { ...head, karma: e.karma, nuyen: e.nuyen, op: e.advance.op, ...a, label: e.label }, line)
    }
  }
}
const ledgerXml = (l: Sr6LedgerEntry[]) => (l.length ? `<ledger>\n    ${l.map(entryXml).join('\n    ')}\n  </ledger>` : '')
// the compendium entries the runner uses, with their text (src/sr6/engine/house.ts)
const houseXml = (h?: Sr6Entry[]) => (h?.length ? `<house>${h.map(e => sr6EntryXml(e, true)).join('')}</house>` : '')

function npcXml(n?: Sr6Npc): string {
  if (!n) return ''
  const f = n.from
  return el('npc', { kind: n.kind, rating: n.rating, group: n.group, fromKind: f?.kind, fromId: f?.id, fromName: f?.name, fromSource: f?.source, fromPage: f?.page },
    Object.entries(n.stats).map(([key, value]) => el('stat', { key, value })).join('') + n.lines.map(l => `<line${attrs({ part: l.part })}>${esc(l.text)}</line>`).join(''))
}

const rulesXml = (rs?: Sr6Character['rules']) => (rs?.length ? el('rules', {}, rs.map(r => el('setting', { key: r.key, value: r.value,
  assumed: r.assumed, source: r.source, page: r.page })).join('')) : '')
const printedXml = (p?: Sr6Printed) => (p ? el('printed', { source: p.source, page: p.page },
  Object.entries(p.values).map(([key, value]) => el('value', { key, value })).join('')) : '')

/** Serialize a runner. `rev` is the server's revision counter (omitted for exports). */
export function sr6ToXml(ch: Sr6Character, rev?: number): string {
  const id = ch.identity
  const body = [npcXml(ch.npc), text('portrait', id.portrait) + text('token', id.token), text('background', id.background), text('notes', id.notes),
    printedXml(ch.printed), rulesXml(ch.rules), buildXml(ch.build), ledgerXml(ch.ledger), houseXml(ch.house), ...ch.overrides.map(o => el('override', { code: o.code, path: o.path }, esc(o.note))),
    ...(ch.migrated ?? []).map(m => el('migrated', m))].filter(Boolean).join('\n  ')
  const root = attrs({ formatVersion: FORMAT_VERSION, id: ch.id, rev, streetName: id.streetName, name: id.name, gender: id.gender, metatype: ch.build.metatype,
    method: ch.build.method, backdrop: id.backdrop, finalizedAt: ch.finalizedAt, campaign: ch.campaign, updatedAt: ch.updatedAt,
    lastExportedAt: ch.lastExportedAt, finalKarma: ch.final?.karma, finalNuyen: ch.final?.nuyen, sampleKey: ch.sampleKey })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sr6:character xmlns:sr6="${SR6_CHAR_NS}"${root}>\n  ${body}\n</sr6:character>\n`
}

// ---- reading ----
/** Leave out what isn't set, so a runner reads back exactly as written. */
const def = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
const str = (e: Element, a: string) => e.getAttribute(a) ?? undefined
const yes = (e: Element, a: string) => (e.getAttribute(a) === 'true' ? (true as const) : undefined)
/** A number attribute: absent → `absent`; not a number → throws naming it. */
function num(e: Element, a: string): number | undefined
function num(e: Element, a: string, absent: number): number
function num(e: Element, a: string, absent?: number) {
  const v = e.getAttribute(a)
  if (v == null) return absent
  const x = Number(v)
  if (v.trim() === '' || !Number.isFinite(x)) throw new Error(`${a}="${v}" isn’t a number`)
  return x
}
/** A value from a fixed list: anything else throws, or in repair becomes `fallback` (undefined: left out) with a note. */
function oneOf<T extends string>(v: string | null, allowed: readonly T[], what: string, fallback?: T, fix?: string[]): T | undefined {
  if ((allowed as readonly string[]).includes(v ?? '')) return v as T
  if (!fix) throw new Error(`${what} “${v ?? ''}” (not one of ${allowed.join(', ')})`)
  fix.push(`The ${what} “${v ?? ''}” isn’t known: ${fallback ? `set to ${fallback}` : 'left out'}.`)
  return fallback
}
const label = (e: Element, i: number) => `${e.localName} ${i + 1}`

function readBonus(e: Element): Bonus {
  const target = oneOf(e.getAttribute('target'), BONUS_TARGETS, 'bonus target')!, skill = str(e, 'skill')
  if (target === 'skill' && !skill) throw new Error('a skill bonus names no skill')
  return def({ target, skill: target === 'skill' ? skill : undefined, value: num(e, 'value', 0), perRating: yes(e, 'perRating'), when: str(e, 'when'),
    spec: str(e, 'spec'), switch: (BONUS_SWITCHES as string[]).includes(str(e, 'switch') ?? '') ? str(e, 'switch') as BonusSwitch : undefined,
    affects: str(e, 'affects') === 'caster' || str(e, 'affects') === 'target' ? str(e, 'affects') as Bonus['affects'] : undefined })
}
const readBonuses = (e: Element) => { const xs = kids(e, 'bonus').map(readBonus); return xs.length ? xs : undefined }

function readPurchase(e: Element, fix?: string[]): Sr6Purchase {
  const kind = oneOf(e.getAttribute('kind'), PURCHASE_KINDS, 'purchase kind')!
  const snap = kid(e, 'snapshot')?.firstElementChild
  return def({ uid: e.getAttribute('uid') ?? '', kind, id: str(e, 'id'), name: str(e, 'name'), cost: num(e, 'cost'), avail: num(e, 'avail'),
    essence: num(e, 'essence'), rating: num(e, 'rating'), qty: num(e, 'qty', 1), grade: str(e, 'grade'), worn: yes(e, 'worn'),
    bonuses: readBonuses(e), note: str(e, 'note'), accessories: each(kids(e, 'purchase'), x => readPurchase(x, fix), label, fix),
    snapshot: snap ? toEntry(snap, kind) : undefined })
}

const readKnowledge = (e: Element): Sr6Knowledge => def({ uid: e.getAttribute('uid') ?? '', name: e.textContent ?? '',
  kind: oneOf(e.getAttribute('kind'), ['knowledge', 'language'] as const, 'knowledge kind')!, native: yes(e, 'native'),
  points: num(e, 'points', 0), karma: num(e, 'karma', 0) })
const readQuality = (e: Element): Sr6Quality => def({ uid: e.getAttribute('uid') ?? '', id: e.getAttribute('id') ?? '', level: num(e, 'level', 1),
  karma: num(e, 'karma'), free: yes(e, 'free'), note: str(e, 'note'), name: str(e, 'name') })
const readPick = (e: Element): Sr6Pick => def({ uid: e.getAttribute('uid') ?? '', kind: oneOf(e.getAttribute('kind'), PICK_KINDS, 'pick kind')!,
  id: e.getAttribute('id') ?? '', level: num(e, 'level'), bonuses: readBonuses(e), name: str(e, 'name'), note: str(e, 'note') })
const readTechnique = (e: Element) => def({ uid: e.getAttribute('uid') ?? '', id: e.getAttribute('id') ?? '', name: str(e, 'name') })
const readMartial = (e: Element, fix?: string[]): Sr6MartialArt => def({ uid: e.getAttribute('uid') ?? '', id: e.getAttribute('id') ?? '',
  name: str(e, 'name'), techniques: each(kids(e, 'technique'), readTechnique, label, fix) })
const readContact = (e: Element): Sr6Contact => {
  const types = (e.getAttribute('types') ?? '').split(/\s+/).filter(t => (CONTACT_TYPES as string[]).includes(t)) as ContactType[]
  return def({ uid: e.getAttribute('uid') ?? '', name: e.getAttribute('name') ?? '', archetype: e.getAttribute('archetype') ?? '',
    connection: num(e, 'connection', 0), loyalty: num(e, 'loyalty', 0), types: types.length ? types : undefined })
}

function readBuild(b: Element, fix?: string[]): Sr6Build {
  const out = blankBuild(oneOf(b.getAttribute('method'), SR6_METHODS, 'method', 'priority', fix))
  out.magic = oneOf(b.getAttribute('magic'), MAGIC_KINDS, 'magic kind', 'mundane', fix)!
  const drain = b.getAttribute('drainAttr')
  Object.assign(out, def({ aspectedSkill: str(b, 'aspectedSkill'), tradition: str(b, 'tradition'),
    drainAttr: drain == null ? undefined : oneOf(drain, ['log', 'int', 'cha'] as const, 'drain attribute', undefined, fix),
    ...Object.fromEntries((['bestAttr', 'bestExtra'] as const).map(k => [k, b.getAttribute(k) == null ? undefined
      : oneOf(b.getAttribute(k), CORE_ATTRS, 'best attribute', undefined, fix)])) }))
  for (const k of ['powerPointsBought', 'initiation', 'submersion', 'karmaToNuyen'] as const) out[k] = num(b, k, 0)
  each(kids(b, 'priority'), e => {
    const l = e.getAttribute('letter')
    out.priorities[oneOf(e.getAttribute('column'), PRIORITY_COLUMNS, 'priority column')!] = l == null ? null : oneOf(l, ['A', 'B', 'C', 'D', 'E'] as const, 'priority letter')!
  }, label, fix)
  each(kids(b, 'cp'), e => { out.cp[oneOf(e.getAttribute('pool'), CP_POOLS, 'character point pool')!] = num(e, 'points', 0) }, label, fix)
  out.lifepath = each(kids(b, 'lifemodule'), e => ({ id: e.getAttribute('id') ?? '',
    choices: Object.fromEntries(kids(e, 'choice').map(c => [num(c, 'index', 0), c.getAttribute('pick') ?? ''])) }), label, fix)
  each(kids(b, 'attribute'), e => {
    out.attributes[oneOf(e.getAttribute('id'), SR6_ATTRS, 'attribute')!] = { points: num(e, 'points', 0), adjust: num(e, 'adjust', 0), karma: num(e, 'karma', 0) }
  }, label, fix)
  out.skills = each(kids(b, 'skill'), e => def({ id: e.getAttribute('id') ?? '', points: num(e, 'points', 0), karma: num(e, 'karma', 0),
    spec: str(e, 'spec'), expertise: str(e, 'expertise'),
    specs: str(e, 'specs')?.split(/;\s*/).map(x => x.trim()).filter(Boolean) }), label, fix)
  out.knowledge = each(kids(b, 'knowledge'), readKnowledge, label, fix)
  out.qualities = each(kids(b, 'quality'), readQuality, label, fix)
  out.picks = each(kids(b, 'pick'), readPick, label, fix)
  out.martialArts = each(kids(b, 'martialart'), e => readMartial(e, fix), label, fix)
  out.purchases = each(kids(b, 'purchase'), e => readPurchase(e, fix), label, fix)
  out.contacts = each(kids(b, 'contact'), readContact, label, fix)
  out.sins = each(kids(b, 'sin'), readSin, label, fix)
  return out
}
function readSin(e: Element): Sr6Sin {
  const lifestyles = kids(e, 'lifestyle').map(readLifestyle)
  return def({ uid: e.getAttribute('uid') ?? '', name: e.getAttribute('name') ?? '',
    kind: oneOf(e.getAttribute('kind'), ['real', 'fake'] as const, 'SIN kind')!, rating: num(e, 'rating'), gender: str(e, 'gender'),
    licences: kids(e, 'licence').map(l => ({ name: l.getAttribute('name') ?? '', rating: num(l, 'rating', 0) })),
    lifestyles: lifestyles.length ? lifestyles : undefined, placeholder: yes(e, 'placeholder') })
}
const readLifestyle = (e: Element) => ({ uid: e.getAttribute('uid') ?? '', id: e.getAttribute('id') ?? '', months: num(e, 'months', 0) })

/** An older file's one lifestyle (<build><lifestyle>) goes on the first SIN, and its ledger's lifestyle spends naming no
 *  SIN replay there (career.ts); a runner with either and no SIN gets an unnamed placeholder SIN (free; Review asks the
 *  player to name it or move the lifestyle: rules.ts sin.placeholder). */
function migrateLifestyle(ch: Sr6Character, old: Element | undefined) {
  const b = ch.build
  if (!old && !ch.ledger.some(e => e.type === 'advance' && e.advance.op === 'lifestyle' && !e.advance.sin)) return
  if (!b.sins.length) b.sins.push({ uid: `${ch.id}-sin`, name: '', kind: 'real', licences: [], placeholder: true })
  const sin = b.sins[0], id = old?.getAttribute('id') ?? ''
  if (old) sin.lifestyles = [{ uid: `${sin.uid}-${id}`, id, months: num(old, 'months', 0) }, ...sin.lifestyles ?? []]
}

// ---- the ledger and the NPC block ----
/** An attribute that must be there. */
const req = (e: Element, a: string) => { const v = e.getAttribute(a); if (v == null) throw new Error(`no ${a}`); return v }
/** The entry's line element, read; `need`: missing throws. */
function line<T>(e: Element, name: string, read: (x: Element) => T, need: true): T
function line<T>(e: Element, name: string, read: (x: Element) => T): T | undefined
function line<T>(e: Element, name: string, read: (x: Element) => T, need?: true) {
  const x = kid(e, name)
  if (!x && need) throw new Error(`no <${name}> inside the entry`)
  return x ? read(x) : undefined
}

function readAdvance(e: Element, karma: number, fix?: string[]): Sr6Advance {
  const op = oneOf(e.getAttribute('op'), SR6_ADVANCE_OPS, 'advance op')!
  const purchase = (x: Element) => readPurchase(x, fix)
  switch (op) {
    case 'attribute': return { op, target: oneOf(e.getAttribute('target'), SR6_ATTRS, 'attribute')! }
    case 'skill': return { op, target: req(e, 'target') }
    case 'spec': case 'expertise': return { op, target: req(e, 'target'), name: req(e, 'name') }
    case 'knowledge': return { op, line: line(e, 'knowledge', readKnowledge, true) }
    case 'quality': return { op, line: line(e, 'quality', readQuality, true) }
    case 'buyoff': return def({ op, target: req(e, 'target'), line: line(e, 'quality', readQuality) })
    case 'pick': return { op, line: line(e, 'pick', readPick, true) }
    case 'martialart': return { op, line: line(e, 'martialart', x => readMartial(x, fix), true) }
    case 'technique': return { op, target: req(e, 'target'), line: line(e, 'technique', readTechnique, true) }
    case 'initiate': return def({ op, line: line(e, 'pick', readPick) })
    case 'purchase': return { op, line: line(e, 'purchase', purchase, true) }
    case 'drop': return def({ op, target: req(e, 'target'), line: line(e, 'purchase', purchase) })
    case 'contact': return { op, line: line(e, 'contact', readContact, true) }
    case 'sin': return { op, line: line(e, 'sin', readSin, true) }
    case 'lifestyle': return def({ op, id: req(e, 'lifestyle'), months: num(e, 'months', 0), sin: str(e, 'sin'), uid: str(e, 'uid') })
    case 'convert': return { op, karma }
    case 'powerpoint': case 'other': return { op }
  }
}

function readEntry(e: Element, fix?: string[]): Sr6LedgerEntry {
  const head = { id: req(e, 'id'), at: e.getAttribute('at') ?? '' }
  const type = oneOf(e.getAttribute('type'), SR6_LEDGER_TYPES, 'entry type')!
  const karma = num(e, 'karma', 0), nuyen = num(e, 'nuyen', 0), body = e.textContent ?? ''
  switch (type) {
    case 'finalize': return { ...head, type, karma, nuyen }
    case 'earn': return { ...head, type, karma, nuyen, run: body, date: e.getAttribute('date') ?? '' }
    case 'note': return { ...head, type, text: body }
    case 'void': return { ...head, type, eventId: req(e, 'event'), reason: body }
    case 'advance': return { ...head, type, advance: readAdvance(e, karma, fix), label: e.getAttribute('label') ?? '', karma, nuyen }
  }
}

const CATALOG_KINDS = Object.keys(SR6_KINDS) as Sr6Kind[]
const KIND_OF_TAG = new Map(CATALOG_KINDS.map(k => [SR6_KINDS[k].tag, k]))
/** <house>'s entries; one of an unknown kind throws (repair drops it). */
const readHouse = (h: Element, fix?: string[]): Sr6Entry[] => each([...h.children], e => {
  const kind = KIND_OF_TAG.get(e.localName)
  if (!kind) throw new Error(`a <${e.localName}> isn’t a catalog entry`)
  return toEntry(e, kind)
}, label, fix)
function readNpc(n: Element, fix?: string[]): Sr6Npc {
  const fk = n.getAttribute('fromKind')
  const stats = each(kids(n, 'stat'), e => {
    const key = e.getAttribute('key') ?? '', value = e.getAttribute('value') ?? ''
    if (!/^[a-z]{1,20}$/.test(key)) throw new Error(`the key “${key.slice(0, 40)}” isn’t 1 to 20 letters a to z`)
    if (value.length > 80) throw new Error(`the ${key} value is longer than 80 characters`)
    return [key, value] as const
  }, label, fix)
  return def({
    kind: oneOf(n.getAttribute('kind'), SR6_NPC_KINDS, 'NPC kind', 'grunt', fix)!, rating: num(n, 'rating'), group: str(n, 'group'),
    from: fk == null ? undefined : { kind: oneOf(fk, CATALOG_KINDS, 'NPC catalog kind')!, id: n.getAttribute('fromId') ?? '',
      name: n.getAttribute('fromName') ?? '', source: n.getAttribute('fromSource') ?? '', page: num(n, 'fromPage', 0) },
    stats: Object.fromEntries(stats),
    lines: each(kids(n, 'line'), e => ({ part: oneOf(e.getAttribute('part'), SR6_NPC_PARTS, 'line part')!, text: e.textContent ?? '' }), label, fix),
  })
}

export type Sr6Parsed = { ok: true; character: Sr6Character; rev?: number } | { ok: false; reason: string }

/** Never throws; a bad file comes back with a reason saying what and where. With `opts.repair`, what can be read is
 *  kept and each thing dropped or fixed is noted there. */
export function xmlToSr6(xml: string, opts: ReadOpts = {}): Sr6Parsed {
  const fix = opts.repair
  const parsed = readDoc(xml, fix)
  if (!parsed.ok) return parsed
  const r = parsed.root
  if (r.localName === 'character' && r.namespaceURI === 'urn:chummer-anarchy2:character:1')
    return { ok: false, reason: 'This is a Shadowrun Anarchy runner. Import it on the Anarchy side.' }
  if (r.localName !== 'character' || r.namespaceURI !== SR6_CHAR_NS) return { ok: false, reason: 'Not a Shadowrun 6 runner file.' }
  const v = Number(r.getAttribute('formatVersion'))
  if (!v) return { ok: false, reason: 'The <character> element has no formatVersion.' }
  if (v > FORMAT_VERSION) return { ok: false, reason: `This file is from a newer version of the app (format ${v}).` }
  if (!r.getAttribute('id')) return { ok: false, reason: 'The <character> element has no id.' }
  const b = kid(r, 'build')
  if (!b) return { ok: false, reason: 'The file has no <build> element.' }
  try {
    const build = readBuild(b, fix)
    build.metatype = str(r, 'metatype') ?? ''
    const t = (name: string) => kid(r, name)?.textContent ?? undefined
    const backdrop = str(r, 'backdrop') as Backdrop | undefined
    const fk = num(r, 'finalKarma'), fn = num(r, 'finalNuyen'), npc = kid(r, 'npc'), ledger = kid(r, 'ledger'), house = kid(r, 'house')
    const printed = kid(r, 'printed'), rules = kid(r, 'rules')
    const ch: Sr6Character = def({
      formatVersion: 1 as const, id: r.getAttribute('id')!,
      identity: def({ name: str(r, 'name') ?? '', streetName: str(r, 'streetName') ?? '', gender: str(r, 'gender'), metatype: build.metatype,
        portrait: t('portrait'), token: t('token'), backdrop: backdrop && BACKDROPS.includes(backdrop) ? backdrop : undefined,
        background: t('background') ?? '', notes: t('notes') ?? '' }),
      build, finalizedAt: str(r, 'finalizedAt'), campaign: str(r, 'campaign'),
      final: fk === undefined && fn === undefined ? undefined : { karma: fk ?? 0, nuyen: fn ?? 0 },
      ledger: ledger ? each(kids(ledger, 'entry'), e => readEntry(e, fix), (_, i) => `ledger entry ${i + 1}`, fix) : [],
      npc: npc ? readNpc(npc, fix) : undefined, sampleKey: str(r, 'sampleKey'), house: house?.children.length ? readHouse(house, fix) : undefined,
      printed: printed ? { source: str(printed, 'source') ?? '', page: num(printed, 'page', 0),
        values: Object.fromEntries(kids(printed, 'value').map(v => [v.getAttribute('key') ?? '', v.getAttribute('value') ?? ''])) } : undefined,
      rules: rules && kids(rules, 'setting').length ? kids(rules, 'setting').map(x => def({ key: x.getAttribute('key') ?? '', value: x.getAttribute('value') ?? '',
        assumed: x.getAttribute('assumed') === 'true' ? true as const : undefined, source: str(x, 'source'), page: num(x, 'page') })) : undefined,
      overrides: kids(r, 'override').map(o => ({ code: o.getAttribute('code') ?? '', path: o.getAttribute('path') ?? '', note: o.textContent ?? '' })),
      migrated: kids(r, 'migrated').length ? kids(r, 'migrated').map(m => ({ from: m.getAttribute('from') ?? '', to: m.getAttribute('to') ?? '', at: m.getAttribute('at') ?? '' })) : undefined,
      updatedAt: str(r, 'updatedAt') ?? new Date().toISOString(), lastExportedAt: str(r, 'lastExportedAt'),
    })
    migrateLifestyle(ch, kid(b, 'lifestyle'))
    return def({ ok: true as const, character: ch, rev: num(r, 'rev') })
  } catch (e) {
    return { ok: false, reason: `Couldn’t read ${(e as Error).message}.` }
  }
}

/** The repo codec (src/ui/repo.ts serverRepo). */
export const sr6Codec: Codec<Sr6Character> = { tag: 'sr6:character', toXml: sr6ToXml, fromXml: xmlToSr6 }
