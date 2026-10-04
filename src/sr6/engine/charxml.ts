// Shadowrun 6 runner <-> XML (docs/sr6-character-format.md, public/data/sr6/schema/character.xsd): the file a runner is
// saved as in /api/sr6/characters and what Export writes. Summary fields sit on the root as Anarchy's
// (src/engine/charxml.ts, whose writing and reading helpers this reuses).
import { attrs, each, el, esc, kid, kids, readDoc, text, type ReadOpts } from '../../engine/charxml'
import { BACKDROPS, type Backdrop } from '../../model/types'
import {
  BONUS_TARGETS, CP_POOLS, MAGIC_KIND_LABELS, PICK_KINDS, PRIORITY_COLUMNS, PURCHASE_KINDS, SR6_ATTRS, SR6_METHODS, blankBuild,
  type Bonus, type MagicKind, type Sr6Build, type Sr6Character, type Sr6Purchase,
} from '../model/character'
import type { Codec } from '../../ui/repo'
import { sr6EntryXml, toEntry } from './load'

export const SR6_CHAR_NS = 'urn:chummer-sr6:character:1'
const FORMAT_VERSION = 1
const MAGIC_KINDS = Object.keys(MAGIC_KIND_LABELS) as MagicKind[]

// ---- writing ----
const bonusXml = (x: Bonus) => el('bonus', { target: x.target, value: x.value, perRating: x.perRating })
const bonusesXml = (xs?: Bonus[]) => (xs ?? []).map(bonusXml).join('')
function purchaseXml(p: Sr6Purchase): string {
  return el('purchase', { uid: p.uid, kind: p.kind, id: p.id, name: p.name, cost: p.cost, avail: p.avail, essence: p.essence, rating: p.rating,
    qty: p.qty, grade: p.grade, worn: p.worn, note: p.note },
  bonusesXml(p.bonuses) + p.accessories.map(purchaseXml).join('') + (p.snapshot ? `<snapshot>${sr6EntryXml(p.snapshot)}</snapshot>` : ''))
}

function buildXml(b: Sr6Build): string {
  const rows = [
    ...PRIORITY_COLUMNS.map(column => el('priority', { column, letter: b.priorities[column] })),
    ...CP_POOLS.map(pool => el('cp', { pool, points: b.cp[pool] })),
    ...b.lifepath.map(m => el('lifemodule', { id: m.id }, Object.entries(m.choices).map(([index, pick]) => el('choice', { index, pick })).join(''))),
    ...SR6_ATTRS.map(id => el('attribute', { id, ...b.attributes[id] })),
    ...b.skills.map(s => el('skill', { id: s.id, points: s.points, karma: s.karma, spec: s.spec, expertise: s.expertise })),
    ...b.knowledge.map(k => `<knowledge${attrs({ uid: k.uid, kind: k.kind, native: k.native, points: k.points, karma: k.karma })}>${esc(k.name)}</knowledge>`),
    ...b.qualities.map(q => el('quality', { uid: q.uid, id: q.id, level: q.level, free: q.free, note: q.note, name: q.name })),
    ...b.picks.map(p => el('pick', { uid: p.uid, kind: p.kind, id: p.id, level: p.level, name: p.name }, bonusesXml(p.bonuses))),
    ...b.purchases.map(purchaseXml),
    ...b.contacts.map(c => el('contact', { uid: c.uid, name: c.name, archetype: c.archetype, connection: c.connection, loyalty: c.loyalty })),
    ...(b.lifestyle ? [el('lifestyle', { id: b.lifestyle.id, months: b.lifestyle.months })] : []),
    ...b.sins.map(s => el('sin', { uid: s.uid, name: s.name, kind: s.kind, rating: s.rating }, s.licences.map(l => el('licence', l)).join(''))),
  ]
  return el('build', { method: b.method, magic: b.magic, aspectedSkill: b.aspectedSkill, tradition: b.tradition, drainAttr: b.drainAttr,
    powerPointsBought: b.powerPointsBought, initiation: b.initiation, submersion: b.submersion, karmaToNuyen: b.karmaToNuyen },
  `\n    ${rows.join('\n    ')}\n  `)
}

/** Serialize a runner. `rev` is the server's revision counter (omitted for exports). */
export function sr6ToXml(ch: Sr6Character, rev?: number): string {
  const id = ch.identity
  const body = [text('portrait', id.portrait) + text('token', id.token), text('background', id.background), text('notes', id.notes),
    buildXml(ch.build), ...ch.overrides.map(o => el('override', { code: o.code, path: o.path }, esc(o.note)))].filter(Boolean).join('\n  ')
  const root = attrs({ formatVersion: FORMAT_VERSION, id: ch.id, rev, streetName: id.streetName, name: id.name, metatype: ch.build.metatype,
    method: ch.build.method, backdrop: id.backdrop, finalizedAt: ch.finalizedAt, campaign: ch.campaign, updatedAt: ch.updatedAt,
    lastExportedAt: ch.lastExportedAt, finalKarma: ch.final?.karma, finalNuyen: ch.final?.nuyen })
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

const readBonus = (e: Element): Bonus =>
  def({ target: oneOf(e.getAttribute('target'), BONUS_TARGETS, 'bonus target')!, value: num(e, 'value', 0), perRating: yes(e, 'perRating') })
const readBonuses = (e: Element) => { const xs = kids(e, 'bonus').map(readBonus); return xs.length ? xs : undefined }

function readPurchase(e: Element, fix?: string[]): Sr6Purchase {
  const kind = oneOf(e.getAttribute('kind'), PURCHASE_KINDS, 'purchase kind')!
  const snap = kid(e, 'snapshot')?.firstElementChild
  return def({ uid: e.getAttribute('uid') ?? '', kind, id: str(e, 'id'), name: str(e, 'name'), cost: num(e, 'cost'), avail: num(e, 'avail'),
    essence: num(e, 'essence'), rating: num(e, 'rating'), qty: num(e, 'qty', 1), grade: str(e, 'grade'), worn: yes(e, 'worn'),
    bonuses: readBonuses(e), note: str(e, 'note'), accessories: each(kids(e, 'purchase'), x => readPurchase(x, fix), label, fix),
    snapshot: snap ? toEntry(snap, kind) : undefined })
}

function readBuild(b: Element, fix?: string[]): Sr6Build {
  const out = blankBuild(oneOf(b.getAttribute('method'), SR6_METHODS, 'method', 'priority', fix))
  out.magic = oneOf(b.getAttribute('magic'), MAGIC_KINDS, 'magic kind', 'mundane', fix)!
  const drain = b.getAttribute('drainAttr')
  Object.assign(out, def({ aspectedSkill: str(b, 'aspectedSkill'), tradition: str(b, 'tradition'),
    drainAttr: drain == null ? undefined : oneOf(drain, ['log', 'int', 'cha'] as const, 'drain attribute', undefined, fix) }))
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
    spec: str(e, 'spec'), expertise: str(e, 'expertise') }), label, fix)
  out.knowledge = each(kids(b, 'knowledge'), e => def({ uid: e.getAttribute('uid') ?? '', name: e.textContent ?? '',
    kind: oneOf(e.getAttribute('kind'), ['knowledge', 'language'] as const, 'knowledge kind')!, native: yes(e, 'native'),
    points: num(e, 'points', 0), karma: num(e, 'karma', 0) }), label, fix)
  out.qualities = each(kids(b, 'quality'), e => def({ uid: e.getAttribute('uid') ?? '', id: e.getAttribute('id') ?? '', level: num(e, 'level', 1),
    free: yes(e, 'free'), note: str(e, 'note'), name: str(e, 'name') }), label, fix)
  out.picks = each(kids(b, 'pick'), e => def({ uid: e.getAttribute('uid') ?? '', kind: oneOf(e.getAttribute('kind'), PICK_KINDS, 'pick kind')!,
    id: e.getAttribute('id') ?? '', level: num(e, 'level'), bonuses: readBonuses(e), name: str(e, 'name') }), label, fix)
  out.purchases = each(kids(b, 'purchase'), e => readPurchase(e, fix), label, fix)
  out.contacts = each(kids(b, 'contact'), e => ({ uid: e.getAttribute('uid') ?? '', name: e.getAttribute('name') ?? '',
    archetype: e.getAttribute('archetype') ?? '', connection: num(e, 'connection', 0), loyalty: num(e, 'loyalty', 0) }), label, fix)
  const ls = kid(b, 'lifestyle')
  if (ls) out.lifestyle = { id: ls.getAttribute('id') ?? '', months: num(ls, 'months', 0) }
  out.sins = each(kids(b, 'sin'), e => def({ uid: e.getAttribute('uid') ?? '', name: e.getAttribute('name') ?? '',
    kind: oneOf(e.getAttribute('kind'), ['real', 'fake'] as const, 'SIN kind')!, rating: num(e, 'rating'),
    licences: kids(e, 'licence').map(l => ({ name: l.getAttribute('name') ?? '', rating: num(l, 'rating', 0) })) }), label, fix)
  return out
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
    const fk = num(r, 'finalKarma'), fn = num(r, 'finalNuyen')
    const ch: Sr6Character = def({
      formatVersion: 1 as const, id: r.getAttribute('id')!,
      identity: def({ name: str(r, 'name') ?? '', streetName: str(r, 'streetName') ?? '', metatype: build.metatype,
        portrait: t('portrait'), token: t('token'), backdrop: backdrop && BACKDROPS.includes(backdrop) ? backdrop : undefined,
        background: t('background') ?? '', notes: t('notes') ?? '' }),
      build, finalizedAt: str(r, 'finalizedAt'), campaign: str(r, 'campaign'),
      final: fk === undefined && fn === undefined ? undefined : { karma: fk ?? 0, nuyen: fn ?? 0 },
      overrides: kids(r, 'override').map(o => ({ code: o.getAttribute('code') ?? '', path: o.getAttribute('path') ?? '', note: o.textContent ?? '' })),
      updatedAt: str(r, 'updatedAt') ?? new Date().toISOString(), lastExportedAt: str(r, 'lastExportedAt'),
    })
    return def({ ok: true as const, character: ch, rev: num(r, 'rev') })
  } catch (e) {
    return { ok: false, reason: `Couldn’t read ${(e as Error).message}.` }
  }
}

/** The repo codec (src/ui/repo.ts serverRepo). */
export const sr6Codec: Codec<Sr6Character> = { tag: 'sr6:character', toXml: sr6ToXml, fromXml: xmlToSr6 }
