// Build a Catalog from XML files: base data first, then overlays in order.
// Same id replaces, <remove id> deletes, new id adds (docs/data-format.md).
import type { AttrId, Catalog, Pricing } from '../model/types'
import {
  parseDataFile, toAmp, toAmpEffect, toAmpType, toAttribute, toItem, toLevel, toLifestyle, toMetatype, toPackage, toPricing, toRule, toSkill,
  toSource, toVehicle,
} from './parse'

export const DATA_FILES = ['sources', 'levels', 'metatypes', 'attributes', 'skills', 'pricing', 'amptypes', 'ampeffects',
  'packages', 'vehicles', 'gear', 'weapons', 'armor', 'spells', 'complexforms', 'amps', 'lifestyles', 'rules']

export interface SourceFile { file: string; xml: string; overlay: boolean }

export function buildCatalog(files: SourceFile[]): Catalog {
  const c: Catalog = { levels: new Map(), metatypes: new Map(), attributes: new Map(), skills: new Map(),
    pricing: undefined as unknown as Pricing, ampTypes: new Map(), ampEffects: new Map(), amps: new Map(),
    vehicles: new Map(), packages: new Map(), items: new Map(), lifestyles: new Map(), sources: new Map(), rules: new Map(),
    files: [], errors: [] }
  const targets: Record<string, [Map<string, unknown>, (el: Element) => unknown]> = {
    levels: [c.levels, toLevel], metatypes: [c.metatypes, toMetatype],
    attributes: [c.attributes as Map<AttrId, unknown>, toAttribute], skills: [c.skills, toSkill],
    amptypes: [c.ampTypes, toAmpType], ampeffects: [c.ampEffects, toAmpEffect], amps: [c.amps, toAmp],
    vehicles: [c.vehicles, toVehicle], packages: [c.packages, toPackage],
    gear: [c.items, toItem], weapons: [c.items, toItem], armor: [c.items, toItem], spells: [c.items, toItem],
    complexforms: [c.items, toItem], lifestyles: [c.lifestyles, toLifestyle],
    sources: [c.sources, toSource], rules: [c.rules, toRule],
  }
  const ordered = [...files.filter(f => !f.overlay), ...files.filter(f => f.overlay)]
  for (const f of ordered) {
    const p = parseDataFile(f.xml, f.file)
    if (p.error) { c.errors.push(p.error); continue }
    if (p.kind === 'pricing') {
      if (p.entries[0]) c.pricing = toPricing(p.entries[0])
    } else if (p.kind === 'texts') {
      // private descriptions merged by id (docs/data-format.md)
      for (const el of p.entries) {
        const id = el.getAttribute('id')!, text = el.textContent ?? ''
        const of = el.getAttribute('of')
        if (of === 'amps') { const a = c.amps.get(id); if (a) a.narrative = text }
        else if (of === 'rules') { const r = c.rules.get(id); if (r) r.text = text }
        else { const i = c.items.get(id); if (i) i.text = text }
      }
    } else {
      const t = targets[p.kind]
      if (!t) { c.errors.push({ file: f.file, message: `unknown kind "${p.kind}"` }); continue }
      const [map, conv] = t
      try {
        for (const el of p.entries) map.set(el.getAttribute('id')!, conv(el))
      } catch (e) {
        c.errors.push({ file: f.file, message: `bad entry: ${(e as Error).message}` }); continue
      }
      for (const id of p.removals) map.delete(id)
    }
    c.files.push({ file: f.file, kind: p.kind, entries: p.entries.length, overlay: f.overlay })
  }
  if (!c.pricing) c.errors.push({ file: 'pricing.xml', message: 'no <pricing> entry; prices will be wrong' })
  return c
}

/** Fetch base data plus overlays listed in custom/index.xml (missing index = no overlays). */
export async function loadCatalog(baseUrl = './'): Promise<Catalog> {
  const get = async (path: string) => { const r = await fetch(baseUrl + path, { cache: 'no-cache' }); return r.ok ? r.text() : null }
  const files: SourceFile[] = []
  const missing: string[] = []
  await Promise.all(DATA_FILES.map(async n => {
    const xml = await get(`data/${n}.xml`)
    if (xml == null) missing.push(n)
    else files.push({ file: `${n}.xml`, xml, overlay: false })
  }))
  files.sort((a, b) => DATA_FILES.indexOf(a.file.replace('.xml', '')) - DATA_FILES.indexOf(b.file.replace('.xml', '')))
  const index = await get('custom/index.xml').catch(() => null)
  // private description files, kept out of the repository: one per source (sources.xml texts="..."),
  // plus the older single custom/texts.xml; each loads only when present
  const sourcesXml = files.find(f => f.file === 'sources.xml')?.xml ?? ''
  const textFiles = [...new Set([...sourcesXml.matchAll(/texts="([^"]+)"/g)].map(m => m[1])), 'texts.xml']
  for (const t of textFiles) {
    const xml = await get(`custom/${t}`).catch(() => null)
    if (xml) files.push({ file: `custom/${t}`, xml, overlay: true })
  }
  if (index) {
    const hrefs = [...index.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<file\s+href="([^"]+)"/g)].map(m => m[1])
    for (const href of hrefs) {
      const xml = await get(`custom/${href}`).catch(() => null)
      if (xml == null) missing.push(`custom/${href}`)
      else files.push({ file: `custom/${href}`, xml, overlay: true })
    }
  }
  const c = buildCatalog(files)
  for (const m of missing) c.errors.push({ file: m, message: 'could not be fetched' })
  return c
}
