// Build a Catalog from XML files: base data first (public/data, then the core files in custom/imported/core/), then
// overlays in order.
// Same id replaces, <remove id> deletes, new id adds (docs/data-format.md); a book's <prices> sets only its own prices. Imported books
// (custom/imported/) carry ids scoped by source, so two books' same-named entries both stay;
// sources merge by id across the three sources files instead of replacing, and an imported skill
// adds its specs to the base skill of that id. The edits layer (custom/edits/, kind="edits") replaces
// entries by id after the imports and before the house rules; the replaced entries stay in c.original. A GM's compendium
// (kind="compendium", an extra overlay) adds its entries under its own house source.
import type { AttrId, Catalog, Pricing, Source } from '../model/types'
import {
  parseDataFile, toAmp, toAmpEffect, toAmpType, toAttribute, toItem, toLevel, toLifestyle, toMetatype, toPackage, toPrices, toPricing, toRule, toSkill,
  toSource, toVehicle,
} from './parse'
import { compendiumSource, readCompendium } from './compendium'

export const DATA_FILES = ['sources', 'levels', 'metatypes', 'attributes', 'skills', 'pricing', 'amptypes', 'ampeffects',
  'packages', 'vehicles', 'weapons', 'armor', 'lifestyles']
/** The rules engine's core files: built by the core rulebook's import (or a data pack) into custom/imported/core/; in
 * development the owner's local copies in public/data load first. Everything but sources.xml. */
export const CORE_FILES = DATA_FILES.filter(n => n !== 'sources')

/** publisher: a compendium's owner's name (its source's publisher) */
export interface SourceFile { file: string; xml: string; overlay: boolean; publisher?: string }

const IMPORTED = 'custom/imported/'
const originOf = (f: SourceFile): Source['origin'] => !f.overlay ? 'shipped' : f.file.startsWith(IMPORTED) ? 'imported' : 'user'
const defined = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>

/** An imported book the app also ships stays the shipped description, plus the upload's file and checksum;
 * the user's own sources file wins for everything it sets. */
function mergeSource(prev: Source | undefined, s: Source): Source {
  if (!prev) return s
  if (s.origin === 'imported' && prev.origin === 'shipped')
    return { ...prev, file: s.file, sha256: s.sha256, imported: s.imported, texts: prev.texts ?? s.texts, origin: 'imported' }
  return { ...prev, ...defined(s) }
}

/** One edits-layer entry: replaces the same id (kept in c.original), marked edited. An empty description
 * keeps the replaced entry's (the private text an import brought); custom/edits/texts.xml loads after. */
function editEntry(c: Catalog, el: Element) {
  const id = el.getAttribute('id')!
  const put = <T extends { edited?: boolean }>(map: Map<string, T>, orig: Map<string, T>, e: T, text: keyof T) => {
    const prev = map.get(id)
    if (prev && !prev.edited) orig.set(id, prev)
    if (!e[text] && prev) e[text] = prev[text]
    map.set(id, { ...e, edited: true })
  }
  if (el.localName === 'amp') put(c.amps, c.original.amps, toAmp(el), 'narrative')
  else if (el.localName === 'item') put(c.items, c.original.items, toItem(el), 'text')
  else if (el.localName === 'rule') put(c.rules, c.original.rules, toRule(el), 'text')
  else throw new Error(`<${el.localName}> can't be edited`)
}

export function buildCatalog(files: SourceFile[]): Catalog {
  const c: Catalog = { levels: new Map(), metatypes: new Map(), attributes: new Map(), skills: new Map(),
    pricing: undefined as unknown as Pricing, ampTypes: new Map(), ampEffects: new Map(), amps: new Map(),
    vehicles: new Map(), packages: new Map(), items: new Map(), lifestyles: new Map(), sources: new Map(), rules: new Map(),
    original: { amps: new Map(), items: new Map(), rules: new Map() }, files: [], errors: [], coreMissing: [] }
  const targets: Record<string, [Map<string, unknown>, (el: Element) => unknown]> = {
    levels: [c.levels, toLevel], metatypes: [c.metatypes, toMetatype],
    attributes: [c.attributes as Map<AttrId, unknown>, toAttribute], skills: [c.skills, toSkill],
    amptypes: [c.ampTypes, toAmpType], ampeffects: [c.ampEffects, toAmpEffect], amps: [c.amps, toAmp],
    vehicles: [c.vehicles, toVehicle], packages: [c.packages, toPackage],
    gear: [c.items, toItem], weapons: [c.items, toItem], armor: [c.items, toItem], spells: [c.items, toItem],
    complexforms: [c.items, toItem], lifestyles: [c.lifestyles, toLifestyle],
    sources: [c.sources, toSource], rules: [c.rules, toRule],
  }
  const cites: [file: string, source: string][] = []
  const ordered = [...files.filter(f => !f.overlay), ...files.filter(f => f.overlay)]
  for (const f of ordered) {
    const p = parseDataFile(f.xml, f.file)
    if (p.error) { c.errors.push(p.error); continue }
    if (p.kind === 'pricing') {
      // <pricing> replaces the prices; <prices> (a book's partial overlay) sets only its own over them: the last loaded wins
      // (every entry, in document order)
      let orphan = false
      for (const el of p.entries) {
        if (el.localName === 'pricing') c.pricing = toPricing(el)
        else if (!c.pricing) orphan = true
        else c.pricing = { ...c.pricing, ...toPrices(el) }
      }
      if (orphan) { c.errors.push({ file: f.file, message: '<prices> changes nothing without a <pricing> loaded first' }); continue }
    } else if (p.kind === 'texts') {
      // private descriptions merged by id (docs/data-format.md)
      for (const el of p.entries) {
        const id = el.getAttribute('id')!, text = el.textContent ?? ''
        const of = el.getAttribute('of')
        if (of === 'amps') { const a = c.amps.get(id); if (a) a.narrative = text }
        else if (of === 'rules') { const r = c.rules.get(id); if (r) r.text = text }
        else if (of === 'lifestyles') { const l = c.lifestyles.get(id); if (l) l.text = text }
        else { const i = c.items.get(id); if (i) i.text = text }
      }
    } else if (p.kind === 'edits') {
      try {
        for (const el of p.entries) editEntry(c, el)
      } catch (e) {
        c.errors.push({ file: f.file, message: `bad entry: ${(e as Error).message}` }); continue
      }
      for (const el of p.entries) if (el.getAttribute('source')) cites.push([f.file, el.getAttribute('source')!])
    } else if (p.kind === 'compendium') {
      // entries all cite the compendium's source (readCompendium checks); its NPCs aren't catalog entries
      const r = readCompendium(f.xml)
      if (!r.ok) { c.errors.push({ file: f.file, message: r.error }); continue }
      const comp = r.compendium
      c.sources.set(comp.source, compendiumSource({ ...comp, ownerName: f.publisher }))
      for (const a of comp.amps) c.amps.set(a.id, a)
      for (const i of comp.items) c.items.set(i.id, i)
      for (const v of comp.vehicles) c.vehicles.set(v.id, v)
      c.files.push({ file: f.file, kind: p.kind, entries: comp.amps.length + comp.items.length + comp.vehicles.length, overlay: f.overlay })
      continue
    } else {
      const t = targets[p.kind]
      if (!t) { c.errors.push({ file: f.file, message: `unknown kind "${p.kind}"` }); continue }
      const [map, conv] = t
      const origin = originOf(f)
      try {
        for (const el of p.entries) {
          const id = el.getAttribute('id')!, had = c.skills.get(id)
          if (p.kind === 'sources') { const s = { ...toSource(el), origin }; c.sources.set(s.id, mergeSource(c.sources.get(s.id), s)) }
          // an imported book adds specs to a skill it shares with the base data; house rules replace it
          else if (p.kind === 'skills' && origin === 'imported' && had) {
            const add = toSkill(el).specs.filter(s => !had.specs.some(h => h.id === s.id))
            c.skills.set(id, { ...had, specs: [...had.specs, ...add] })
          } else map.set(id, conv(el))
          // house rules must cite a listed source; checked once everything is loaded
          if (origin === 'user' && el.getAttribute('source')) cites.push([f.file, el.getAttribute('source')!])
        }
      } catch (e) {
        c.errors.push({ file: f.file, message: `bad entry: ${(e as Error).message}` }); continue
      }
      for (const id of p.removals) map.delete(id)
    }
    c.files.push({ file: f.file, kind: p.kind, entries: p.entries.length, overlay: f.overlay })
  }
  const reported = new Set<string>()
  for (const [file, source] of cites) {
    const k = `${file} ${source}`
    if (c.sources.has(source) || reported.has(k)) continue
    reported.add(k)
    c.errors.push({ file, message: `source "${source}" isn’t listed in any sources file; treated as not canon` })
  }
  if (!c.pricing) c.errors.push({ file: 'pricing.xml', message: 'no <pricing> entry; prices will be wrong' })
  return c
}

const hrefs = (index: string) => [...index.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<file\s+href="([^"]+)"/g)].map(m => m[1])

/** Every file the app loads, in load order: data/*.xml, custom/imported/core/*.xml, custom/imported/sources.xml, custom/sources.xml,
 * the files listed in custom/imported/index.xml, the private texts files named by any source (plus the
 * older single custom/texts.xml), the edits layer (custom/edits/sources.xml, edits.xml, texts.xml), the `extra` overlay
 * files (a GM's compendiums), then the house rules listed in custom/index.xml. `get` returns a
 * file's text, or null when it isn't there; `missing` lists data and listed files that weren't, `coreMissing` the core
 * files found in neither data/ nor custom/imported/core/ (the app then opens on its setup screen). */
export async function collectFiles(get: (path: string) => Promise<string | null>, extra: SourceFile[] = []): Promise<{ files: SourceFile[]; missing: string[]; coreMissing: string[] }> {
  const files: SourceFile[] = []
  const missing: string[] = []
  const data = await Promise.all(DATA_FILES.map(n => get(`data/${n}.xml`)))
  const core = await Promise.all(CORE_FILES.map(n => get(`${IMPORTED}core/${n}.xml`)))
  data.forEach((xml, i) => { if (xml != null) files.push({ file: `${DATA_FILES[i]}.xml`, xml, overlay: false }) })
  core.forEach((xml, i) => { if (xml != null) files.push({ file: `${IMPORTED}core/${CORE_FILES[i]}.xml`, xml, overlay: false }) })
  if (data[0] == null) missing.push('sources')
  const coreMissing = CORE_FILES.filter((_, i) => data[i + 1] == null && core[i] == null)
  const optional = async (path: string) => { const xml = await get(path); if (xml != null) files.push({ file: path, xml, overlay: true }); return xml }
  const listed = async (dir: string) => {
    const index = await get(`${dir}index.xml`)
    for (const href of index ? hrefs(index) : []) {
      const xml = await get(dir + href)
      if (xml == null) missing.push(dir + href); else files.push({ file: dir + href, xml, overlay: true })
    }
  }
  const sourceXml = [files.find(f => f.file === 'sources.xml')?.xml, await optional(`${IMPORTED}sources.xml`), await optional('custom/sources.xml')]
  await listed(IMPORTED)
  const texts = new Set([...sourceXml.join('').matchAll(/\btexts="([^"]+)"/g)].map(m => m[1]))
  for (const t of [...texts, 'texts.xml']) await optional(`custom/${t}`)
  for (const e of ['sources', 'edits', 'texts']) await optional(`custom/edits/${e}.xml`)
  files.push(...extra)
  await listed('custom/')
  return { files, missing, coreMissing }
}

/** Fetch base data, imported books and house-rule overlays, plus `extra` overlay files (see collectFiles; missing indexes = none). */
export async function loadCatalog(baseUrl = './', extra: SourceFile[] = []): Promise<Catalog> {
  // an unreachable server fails the load (the app's failure screen); custom/ files are optional extras
  const get = (path: string) => fetch(baseUrl + path, { cache: 'no-cache' })
    .then(r => r.ok ? r.text() : null, e => { if (path.startsWith('data/')) throw e; return null })
  const { files, missing, coreMissing } = await collectFiles(get, extra)
  const c = buildCatalog(files)
  for (const m of missing) c.errors.push({ file: m, message: 'could not be fetched' })
  c.coreMissing = coreMissing
  return c
}
