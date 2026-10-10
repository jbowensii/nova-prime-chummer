// A GM's SR6 compendium: one SR6 data-format file, <sr6:data kind="compendium">, holding entries of the compendium kinds
// (COMP_KINDS, under their SR6 tags, common.xsd's types) that all cite the compendium's own source, plus NPCs as embedded
// <sr6:character> (docs/sr6-data-format.md "Compendiums", public/data/sr6/schema/compendium.xsd). Never the other game's:
// an Anarchy compendium or runner is refused. The server stores it at /api/sr6/compendiums (server/compendiums.mjs).
import { SOURCE_ID } from '../../engine/compendium'
import type { Sr6Catalog, Sr6Compendium, Sr6Entry, Sr6Kind, Sr6Source } from '../model/types'
import { AUG_TYPES, SR6_KINDS } from '../model/types'
import { sr6ToXml, xmlToSr6 } from './charxml'
import { SR6_NS, sr6EntryXml, toEntry } from './load'

const BEING = ['category', 'rating', 'group', 'bod', 'agi', 'rea', 'str', 'wil', 'log', 'int', 'cha', 'ess', 'mag', 'res', 'edg', 'dr', 'init',
  'actions', 'cm', 'move']
const BEING_LINES = ['skills', 'powers', 'optionalPowers', 'weaknesses', 'attacks', 'augmentations', 'gear', 'weapons']
const ITEM = ['avail', 'cost']
/** The kinds a compendium holds: every SR6 kind but those that carry creation structure or rule numbers (priorities,
 *  metatypes, attributes, skills, implant grades, life modules, rules). fields: the kind's attribute names, lines: its string children
 *  (critters, spirits, NPCs and sprites), both as common.xsd declares them (tests/sr6/compendium.test.ts checks). */
export const COMP_KINDS: Partial<Record<Sr6Kind, { fields: string[]; lines?: string[] }>> = {
  qualities: { fields: ['kind', 'karma', 'karmaMax', 'karmaSteps', 'perLevel', 'maxLevel', 'category', 'granted', 'uncounted', 'group'] },
  weapons: { fields: ['category', 'rating', 'dv', 'modes', 'ar', 'ammo', 'type', 'mount', 'blast', ...ITEM, 'skill', 'spec'] },
  armor: { fields: ['category', 'rating', 'defense', 'social', 'capacity', ...ITEM] },
  augmentations: { fields: ['type', 'category', 'rating', 'essence', 'capacity', ...ITEM] },
  electronics: { fields: ['category', 'rating', 'array', 'programs', 'capacity', ...ITEM] },
  programs: { fields: ['type', 'rating', ...ITEM] },
  gear: { fields: ['category', 'rating', 'capacity', 'karma', ...ITEM, 'per', 'slots', 'energy'] },
  vehicles: { fields: ['category', 'handling', 'accel', 'interval', 'topSpeed', 'body', 'armor', 'pilot', 'sensor', 'seats', ...ITEM] },
  spells: { fields: ['category', 'tags', 'range', 'type', 'duration', 'dv', 'damage', 'opposed', 'essence'] },
  rituals: { fields: ['keywords', 'threshold'] },
  adeptpowers: { fields: ['cost', 'costCombat', 'perLevel', 'maxLevel', 'activation'] },
  complexforms: { fields: ['duration', 'fade'] },
  metamagics: { fields: ['user', 'perLevel', 'maxLevel'] },
  echoes: { fields: [] },
  martialarts: { fields: ['categories', 'signature'] },
  martialtechniques: { fields: ['category'] },
  traditions: { fields: [] },
  critterpowers: { fields: ['type', 'action', 'range', 'duration', 'weakness'] },
  critters: { fields: BEING, lines: BEING_LINES },
  spirits: { fields: BEING, lines: BEING_LINES },
  npcs: { fields: BEING, lines: BEING_LINES },
  sprites: { fields: ['attack', 'sleaze', 'data', 'firewall', 'init', 'res'], lines: ['skills', 'powers'] },
  lifestyles: { fields: ['cost'] },
  contacts: { fields: ['connection', 'loyalty', 'archetype'] },
}
/** What common.xsd asks of an attribute beyond being text: set (required), one of fixed choices, a whole number. */
export interface FieldRule { required?: true; choices?: string[]; whole?: 'any' | 'positive' | 'nonNegative' }
const REQ: FieldRule = { required: true }
const LEVELS: Record<string, FieldRule> = { perLevel: { choices: ['true'] }, maxLevel: { whole: 'positive' } }
const RATED: Record<string, FieldRule> = { rating: { whole: 'nonNegative' } }
/** Per kind, the attributes with a rule (tests/sr6/compendium.test.ts keeps it equal to common.xsd). */
const RULES: Partial<Record<Sr6Kind, Record<string, FieldRule>>> = {
  qualities: { kind: { required: true, choices: ['positive', 'negative'] }, karma: { whole: 'any' }, karmaMax: { whole: 'any' }, ...LEVELS, granted: { choices: ['true'] }, uncounted: { choices: ['true'] } },
  weapons: { category: REQ }, armor: { category: REQ }, electronics: { category: REQ }, programs: { type: REQ }, gear: { category: REQ }, vehicles: { category: REQ },
  augmentations: { type: { required: true, choices: [...AUG_TYPES] }, category: REQ },
  spells: { category: { required: true, choices: ['combat', 'detection', 'health', 'illusion', 'manipulation'] }, opposed: { choices: ['true'] }, essence: { choices: ['true'] } },
  metamagics: { user: { choices: ['adept', 'magician'] }, ...LEVELS },
  adeptpowers: LEVELS, critterpowers: { weakness: { choices: ['true'] } },
  critters: RATED, spirits: RATED, npcs: RATED,
}
export const fieldRule = (kind: Sr6Kind, field: string): FieldRule => RULES[kind]?.[field] ?? {}
const WHOLE = { any: [/^-?\d+$/, 'a whole number'], positive: [/^[1-9]\d*$/, 'a whole number, 1 or more'], nonNegative: [/^\d+$/, 'a whole number, 0 or more'] } as const

/** Why an entry wouldn't validate against common.xsd ('' when it would): no name, a required value unset, a value that
 *  isn't one of its choices or a whole number. The compendium's entry form saves only an entry with none. */
export function entryProblem(e: Sr6Entry): string {
  if (!e.name.trim()) return 'Enter a name.'
  for (const f of COMP_KINDS[e.kind]?.fields ?? []) {
    const v = (e.attrs[f] ?? '').trim(), r = fieldRule(e.kind, f)
    if (!v) { if (r.required) return `Fill in ${f}.`; continue }
    if (r.choices && !r.choices.includes(v)) return `${f} is one of: ${r.choices.join(', ')}.`
    if (r.whole && !WHOLE[r.whole][0].test(v)) return `${f} is ${WHOLE[r.whole][1]}.`
  }
  return ''
}

const KIND_OF_TAG = new Map(Object.keys(COMP_KINDS).map(k => [SR6_KINDS[k as Sr6Kind].tag, k as Sr6Kind]))
const ID = /^[0-9a-f]{12}$/
const SHARING = ['private', 'campaign', 'table'] as const
const ANARCHY_DATA = 'urn:chummer-anarchy2:data:1'

// eslint-disable-next-line no-control-regex
const esc = (s: string) => s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const attrs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => ` ${k}="${esc(String(v))}"`).join('')

/** The compendium file. Unset (empty) attributes and line parts are left out; owner/ownerName aren't written (the owner is
 *  the folder it's stored in). */
export function sr6CompendiumXml(comp: Sr6Compendium): string {
  const root = attrs({ kind: 'compendium', version: 1, id: comp.id, name: comp.name, source: comp.source, sharing: comp.sharing,
    campaign: comp.sharing === 'campaign' ? comp.campaign : undefined, rev: comp.rev, updatedAt: comp.updatedAt })
  const body = [
    ...comp.entries.map(e => sr6EntryXml({ ...e, attrs: Object.fromEntries(Object.entries(e.attrs).filter(([, v]) => v !== '')),
      parts: e.parts.filter(p => p.text || Object.keys(p.attrs).length) }, true)),
    ...comp.npcs.map(ch => sr6ToXml(ch).replace(/^<\?xml[^>]*\?>\s*/, '').trimEnd())]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sr6:data xmlns:sr6="${SR6_NS}"${root}>\n${body.map(b => `  ${b}\n`).join('')}</sr6:data>\n`
}

/** The catalog source a compendium's entries cite: a house source (non-canon, origin user) of its owner. */
export const sr6CompendiumSource = (comp: Pick<Sr6Compendium, 'id' | 'source' | 'name' | 'owner' | 'ownerName' | 'sharing' | 'campaign'>): Sr6Source =>
  ({ id: comp.source, name: comp.name, publisher: comp.ownerName ?? comp.owner ?? '', canon: false, origin: 'user',
    compendium: { id: comp.id, owner: comp.owner ?? '', ...comp.sharing === 'campaign' && comp.campaign ? { campaign: comp.campaign } : {} } })

/** Never throws: a bad file comes back with what's wrong. */
export function readSr6Compendium(xml: string): { ok: true; compendium: Sr6Compendium } | { ok: false; error: string } {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.getElementsByTagName('parsererror')[0]) return { ok: false, error: 'Not valid XML.' }
  const r = doc.documentElement
  if (r.localName === 'data' && r.namespaceURI === ANARCHY_DATA)
    return { ok: false, error: 'This is a Shadowrun Anarchy compendium. Open it on the Anarchy side.' }
  if (r.localName !== 'data' || r.namespaceURI !== SR6_NS || r.getAttribute('kind') !== 'compendium')
    return { ok: false, error: 'Not an SR6 compendium file (root must be <sr6:data kind="compendium">).' }
  const a = (n: string) => r.getAttribute(n) ?? undefined
  const source = a('source') ?? '', sharing = a('sharing') as Sr6Compendium['sharing']
  if (!ID.test(a('id') ?? '') || !a('name')) return { ok: false, error: 'The compendium has no id or name.' }
  if (!SOURCE_ID.test(source)) return { ok: false, error: `"${source.slice(0, 40)}" isn’t a valid source id.` }
  if (!SHARING.includes(sharing)) return { ok: false, error: `Unknown sharing "${(sharing ?? '').slice(0, 40)}".` }
  const comp: Sr6Compendium = { id: a('id')!, name: a('name')!, source, sharing, updatedAt: a('updatedAt') ?? '', entries: [], npcs: [] }
  if (sharing === 'campaign') comp.campaign = a('campaign')
  if (a('rev') !== undefined) comp.rev = Number(a('rev'))
  for (const el of r.children) {
    const what = `<${el.localName}> ${(el.getAttribute('id') ?? el.getAttribute('streetName') ?? '').slice(0, 80)}`.trim()
    if (el.localName === 'character') {
      const ch = xmlToSr6(new XMLSerializer().serializeToString(el))
      if (!ch.ok) return { ok: false, error: `${what}: ${ch.reason}` }
      if (!ch.character.npc) return { ok: false, error: `${what} has no <npc> block.` }
      comp.npcs.push(ch.character)
      continue
    }
    const kind = el.namespaceURI === null ? KIND_OF_TAG.get(el.localName) : undefined
    if (!kind) return { ok: false, error: `<${el.localName}> can’t be in a compendium.` }
    if (el.getAttribute('source') !== source)
      return { ok: false, error: `${what} cites "${(el.getAttribute('source') ?? '').slice(0, 40)}", not the compendium’s source ${source}.` }
    const { fields, lines = [] } = COMP_KINDS[kind]!
    let e: Sr6Entry
    try { e = toEntry(el, kind) } catch (err) { return { ok: false, error: `${what}: ${(err as Error).message}` } }
    if (!(e.page >= 1)) return { ok: false, error: `${what} needs a page (1 or more).` }
    const odd = Object.keys(e.attrs).find(k => !fields.includes(k))
    if (odd) return { ok: false, error: `${what}: ${odd.slice(0, 40)} isn’t an attribute of a ${SR6_KINDS[kind].tag}.` }
    const part = [...el.children].find(k => k.localName !== 'name' && k.localName !== 'text' && (k.namespaceURI !== null || !lines.includes(k.localName)))
    if (part) return { ok: false, error: `${what}: <${part.localName}> isn’t a part of a ${SR6_KINDS[kind].tag}.` }
    comp.entries.push(e)
  }
  return { ok: true, compendium: comp }
}

const slug = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'entry'

/** `<source lowercased>.<slug of name>[-n]`: free in that kind's catalog map and in the compendium. */
export function newEntryId(c: Sr6Catalog, kind: Sr6Kind, comp: Pick<Sr6Compendium, 'source' | 'entries'>, name: string): string {
  const base = `${comp.source.toLowerCase()}.${slug(name)}`
  const taken = (id: string) => c.entries[kind].has(id) || comp.entries.some(e => e.kind === kind && e.id === id)
  let id = base
  for (let n = 2; taken(id); n++) id = `${base}-${n}`
  return id
}

/** A book's (or another compendium's) entry as a new entry of `to`: a new id, its source, page 1, the attributes and line
 *  parts kept (stat values), and no description: book text never enters a compendium (the GM writes their own). */
export function copySr6Entry(c: Sr6Catalog, e: Sr6Entry, to: Pick<Sr6Compendium, 'source' | 'entries'>): Sr6Entry {
  if (!COMP_KINDS[e.kind]) throw new Error(`a ${SR6_KINDS[e.kind].tag} can’t be in a compendium`)
  return { id: newEntryId(c, e.kind, to, e.name), kind: e.kind, name: e.name, source: to.source, page: 1, attrs: { ...e.attrs },
    parts: e.parts.map(p => ({ tag: p.tag, attrs: { ...p.attrs }, text: p.text })), text: '' }
}

/** A new entry of `kind` for the form: a free id, page 1, every field and line part empty. */
export function blankSr6Entry(c: Sr6Catalog, kind: Sr6Kind, comp: Pick<Sr6Compendium, 'source' | 'entries'>, name: string): Sr6Entry {
  const k = COMP_KINDS[kind]
  if (!k) throw new Error(`a ${SR6_KINDS[kind].tag} can’t be in a compendium`)
  return { id: newEntryId(c, kind, comp, name), kind, name, source: comp.source, page: 1, attrs: Object.fromEntries(k.fields.map(f => [f, ''])),
    parts: (k.lines ?? []).map(tag => ({ tag, attrs: {}, text: '' })), text: '' }
}
