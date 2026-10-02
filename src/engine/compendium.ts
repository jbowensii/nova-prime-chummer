// A GM's compendium: one data-format file, <ca2:data kind="compendium">, holding <amp>, <item>, <vehicle> entries that
// all cite the compendium's own source, plus NPCs as embedded <ca2:character> (docs/data-format.md "Compendiums",
// public/data/schema/compendium.xsd). The loader adds its entries to the catalog like a house-rule overlay.
import type { AmpTemplate, Character, Compendium, Item, Rule, Source, VehicleBase } from '../model/types'
import { characterToXml, xmlToCharacter } from './charxml'
import { toAmp, toItem, toVehicle } from './parse'

const DATA_NS = 'urn:chummer-anarchy2:data:1'
/** A source id (server/books.mjs SOURCE_ID). */
export const SOURCE_ID = /^[A-Z][A-Z0-9-]{0,19}$/
const SHARING = ['private', 'campaign', 'table'] as const

// eslint-disable-next-line no-control-regex
const esc = (s: string) => s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const attrs = (o: Record<string, string | number | boolean | undefined>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== false).map(([k, v]) => ` ${k}="${esc(String(v))}"`).join('')

export type EntryKind = 'amps' | 'items' | 'rules'
/** One entry in the data format. Its text (amp narrative, item or rule text) is written only with `withText`: the
 *  edits layer sends descriptions apart, in <description>; a compendium keeps the GM's own text in the entry. */
export function entryXml(kind: EntryKind, e: AmpTemplate | Item | Rule, withText = false): string {
  const ref = { source: e.source, page: e.page }
  if (kind === 'amps') {
    const a = e as AmpTemplate
    return `<amp${attrs({ id: a.id, type: a.type, printedRating: a.printedRating, vehicle: a.vehicle, mod: a.mod, ...ref })}><name>${esc(a.name)}</name>` +
      (a.item ? `<item${attrs({ ...a.item })}/>` : '') + a.effects.map(f => `<effect${attrs({ ref: f.ref, param: f.param, value: f.value, note: f.note })}/>`).join('') +
      `<narrative>${withText ? esc(a.narrative) : ''}</narrative></amp>`
  }
  if (kind === 'items') {
    const i = e as Item
    return `<item${attrs({ id: i.id, kind: i.kind, specialist: i.specialist, armor: i.armor, dv: i.dv, ranges: i.ranges, category: i.category, ...ref })}>` +
      `<name>${esc(i.name)}</name><text>${withText ? esc(i.text) : ''}</text></item>`
  }
  const r = e as Rule
  return `<rule${attrs({ id: r.id, sheet: r.sheet, section: r.section, effects: r.effects.join(' '), ...ref })}><title>${esc(r.title)}</title><text>${withText ? esc(r.text) : ''}</text></rule>`
}

export const vehicleXml = (v: VehicleBase): string =>
  `<vehicle${attrs({ id: v.id, pilot: v.pilot, body: v.body, handling: v.handling, speed: v.speed, flyingSpeed: v.flyingSpeed, armor: v.armor, mount: v.mount, source: v.source, page: v.page })}>` +
  `<name>${esc(v.name)}</name></vehicle>`

/** The compendium file. owner/ownerName aren't written: the owner is the folder it's stored in. */
export function compendiumXml(comp: Compendium): string {
  const root = attrs({ kind: 'compendium', version: 1, id: comp.id, name: comp.name, source: comp.source, sharing: comp.sharing,
    campaign: comp.sharing === 'campaign' ? comp.campaign : undefined, rev: comp.rev, updatedAt: comp.updatedAt })
  const body = [...comp.amps.map(a => entryXml('amps', a, true)), ...comp.items.map(i => entryXml('items', i, true)), ...comp.vehicles.map(vehicleXml),
    ...comp.npcs.map(ch => characterToXml(ch).replace(/^<\?xml[^>]*\?>\s*/, '').trimEnd())]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ca2:data xmlns:ca2="${DATA_NS}"${root}>\n${body.map(b => `  ${b}\n`).join('')}</ca2:data>\n`
}

/** The catalog source a compendium's entries cite: a house source (non-canon, origin user), published by its owner. */
export const compendiumSource = (comp: Pick<Compendium, 'source' | 'name' | 'owner' | 'ownerName'>): Source =>
  ({ id: comp.source, name: comp.name, publisher: comp.ownerName ?? comp.owner ?? '', canon: false, origin: 'user' })

/** Never throws: a bad file comes back with what's wrong. */
export function readCompendium(xml: string): { ok: true; compendium: Compendium } | { ok: false; error: string } {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.getElementsByTagName('parsererror')[0]) return { ok: false, error: 'Not valid XML.' }
  const r = doc.documentElement
  if (r.localName !== 'data' || r.namespaceURI !== DATA_NS || r.getAttribute('kind') !== 'compendium')
    return { ok: false, error: 'Not a compendium file (root must be <ca2:data kind="compendium">).' }
  const a = (n: string) => r.getAttribute(n) ?? undefined
  const source = a('source') ?? '', sharing = a('sharing') as Compendium['sharing']
  if (!a('id') || !a('name')) return { ok: false, error: 'The compendium has no id or name.' }
  if (!SOURCE_ID.test(source)) return { ok: false, error: `"${source}" isn’t a valid source id.` }
  if (!SHARING.includes(sharing)) return { ok: false, error: `Unknown sharing "${sharing ?? ''}".` }
  const comp: Compendium = { id: a('id')!, name: a('name')!, source, sharing, updatedAt: a('updatedAt') ?? '', amps: [], items: [], vehicles: [], npcs: [] }
  if (sharing === 'campaign') comp.campaign = a('campaign')
  if (a('rev') !== undefined) comp.rev = Number(a('rev'))
  for (const el of r.children) {
    const what = `<${el.localName}> ${el.getAttribute('id') ?? el.getAttribute('name') ?? ''}`.trim()
    if (el.localName === 'character') {
      const ch = xmlToCharacter(new XMLSerializer().serializeToString(el))
      if (!ch.ok) return { ok: false, error: `${what}: ${ch.reason}` }
      if (!ch.character.npc) return { ok: false, error: `${what} has no <npc> block.` }
      comp.npcs.push(ch.character as Character)
      continue
    }
    if (el.getAttribute('source') !== source) return { ok: false, error: `${what} cites "${el.getAttribute('source') ?? ''}", not the compendium’s source ${source}.` }
    try {
      if (el.localName === 'amp') comp.amps.push(toAmp(el))
      else if (el.localName === 'item') comp.items.push(toItem(el))
      else if (el.localName === 'vehicle') comp.vehicles.push(toVehicle(el))
      else return { ok: false, error: `<${el.localName}> can’t be in a compendium.` }
    } catch (e) { return { ok: false, error: `${what}: ${(e as Error).message}` } }
  }
  return { ok: true, compendium: comp }
}
