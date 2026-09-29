// XML element -> typed catalog record. One function per data kind (docs/data-format.md).
import type {
  AmpEffect, AmpTemplate, AmpType, AttrId, Attribute, EffectParam, Item, ItemKind, Level, Lifestyle, LoadError,
  Metatype, Package, Pricing, Ref, Rule, Skill, Source, TemplateItem, VehicleBase,
} from '../model/types'

const str = (el: Element, n: string) => el.getAttribute(n) ?? undefined
const num = (el: Element, n: string) => { const v = el.getAttribute(n); return v == null ? undefined : Number(v) }
const req = (el: Element, n: string) => Number(el.getAttribute(n))
const bool = (el: Element, n: string) => el.getAttribute(n) === 'true'
const child = (el: Element, n: string) => el.getElementsByTagName(n)[0]?.textContent?.trim() ?? ''
const ref = (el: Element): Ref => ({ id: el.getAttribute('id')!, source: el.getAttribute('source')!, page: req(el, 'page') })

export const toLevel = (el: Element): Level => ({ ...ref(el), name: child(el, 'name'), nuyen: req(el, 'nuyen'),
  attrAtMax: req(el, 'attrAtMax'), skillCap: req(el, 'skillCap'), rrAttr: req(el, 'rrAttr'),
  rrSkill: req(el, 'rrSkill'), rrSpec: req(el, 'rrSpec') })

export const toMetatype = (el: Element): Metatype => {
  const ranges = {} as Metatype['ranges']
  for (const r of el.getElementsByTagName('range')) ranges[r.getAttribute('attr') as AttrId] = [req(r, 'min'), req(r, 'max')]
  return { ...ref(el), name: child(el, 'name'), edge: req(el, 'edge'), ranges, racialQuality: child(el, 'racialQuality') }
}

export const toAttribute = (el: Element): Attribute => ({ ...ref(el), name: child(el, 'name'), abbr: el.getAttribute('abbr')! })

export const toSkill = (el: Element): Skill => ({ ...ref(el), name: child(el, 'name'),
  attr: el.getAttribute('attr') as AttrId, alt: str(el, 'alt') as AttrId | undefined,
  requires: str(el, 'requires') as Skill['requires'],
  specs: [...el.getElementsByTagName('spec')].map(s => ({ id: s.getAttribute('id')!, name: s.textContent!.trim(),
    attr: s.getAttribute('attr') as AttrId, source: str(s, 'source'), page: num(s, 'page') })) })

export const toSource = (el: Element): Source => ({ id: el.getAttribute('id')!, name: child(el, 'name'),
  publisher: el.getAttribute('publisher') ?? '', canon: bool(el, 'canon'), texts: str(el, 'texts'),
  file: str(el, 'file'), sha256: str(el, 'sha256'), imported: str(el, 'imported'), origin: 'shipped' })

export const toRule = (el: Element): Rule => ({ ...ref(el), sheet: el.getAttribute('sheet')!, section: el.getAttribute('section') ?? '',
  title: child(el, 'title'), effects: (str(el, 'effects') ?? '').split(/\s+/).filter(Boolean), text: child(el, 'text') })

export const toPricing = (el: Element): Pricing => ({ attrPoint: req(el, 'attrPoint'), attrLastPoint: req(el, 'attrLastPoint'),
  skillLow: req(el, 'skillLow'), skillLowMax: req(el, 'skillLowMax'), skillHigh: req(el, 'skillHigh'),
  spec: req(el, 'spec'), knowledge: req(el, 'knowledge'), ampPoint: req(el, 'ampPoint'), equipment: req(el, 'equipment'),
  weaponStandard: req(el, 'weaponStandard'), weaponSpecialist: req(el, 'weaponSpecialist'),
  armorPoint: req(el, 'armorPoint'), spell: req(el, 'spell'), complexForm: num(el, 'complexForm') ?? req(el, 'spell'),
  refundEffectRemoval: bool(el, 'refundEffectRemoval') })

/** A partial `<prices>` (a book's pricing overlay): only the prices it sets. */
export const toPrices = (el: Element): Partial<Pricing> => Object.fromEntries([...el.attributes]
  .filter(a => !['id', 'source', 'page'].includes(a.name))
  .map(a => [a.name, a.name === 'refundEffectRemoval' ? a.value === 'true' : Number(a.value)]))

export const toAmpType = (el: Element): AmpType => ({ ...ref(el), name: child(el, 'name'), base: req(el, 'base'),
  baseAfterFirst: num(el, 'baseAfterFirst'), essence: req(el, 'essence'), requires: str(el, 'requires') })

export const toAmpEffect = (el: Element): AmpEffect => ({ ...ref(el), name: child(el, 'name'),
  category: el.getAttribute('category')!, rating: req(el, 'rating'),
  types: el.getAttribute('types')!.split(/\s+/).filter(Boolean), max: num(el, 'max'),
  requires: str(el, 'requires'), excludes: str(el, 'excludes'),
  param: str(el, 'param') as EffectParam | undefined, gmApproval: bool(el, 'gmApproval') || undefined,
  essence: num(el, 'essence') })

export const toAmp = (el: Element): AmpTemplate => {
  const it = el.getElementsByTagName('item')[0]
  const item: TemplateItem | undefined = it && { kind: it.getAttribute('kind') as TemplateItem['kind'],
    specialist: bool(it, 'specialist') || undefined, armor: num(it, 'armor'), dv: str(it, 'dv'), ranges: str(it, 'ranges') }
  return { ...ref(el), name: child(el, 'name'), type: el.getAttribute('type')!, item, mod: bool(el, 'mod') || undefined,
    effects: [...el.getElementsByTagName('effect')].map(e => ({ ref: e.getAttribute('ref')!, param: str(e, 'param'),
      value: num(e, 'value'), note: str(e, 'note') })),
    narrative: child(el, 'narrative'), printedRating: num(el, 'printedRating'), vehicle: str(el, 'vehicle') }
}

export const toVehicle = (el: Element): VehicleBase => ({ ...ref(el), name: child(el, 'name'), pilot: req(el, 'pilot'),
  body: req(el, 'body'), handling: req(el, 'handling'), speed: req(el, 'speed'), flyingSpeed: num(el, 'flyingSpeed'),
  armor: req(el, 'armor'), mount: el.getAttribute('mount')! })

export const toPackage = (el: Element): Package => ({ ...ref(el), name: child(el, 'name'), level: el.getAttribute('level')!,
  archetype: el.getAttribute('archetype')!, attrPoints: req(el, 'attrPoints'), attrAtMax: req(el, 'attrAtMax'),
  skillPoints: req(el, 'skillPoints'), skillsAtSix: req(el, 'skillsAtSix'), ampPoints: req(el, 'ampPoints'),
  armor: req(el, 'armor'), standardWeapons: req(el, 'standardWeapons'), specialistWeapons: req(el, 'specialistWeapons'),
  equipment: req(el, 'equipment'), spells: req(el, 'spells') })

export const toLifestyle = (el: Element): Lifestyle => ({ ...ref(el), name: child(el, 'name'), perRun: req(el, 'perRun'), text: child(el, 'text') })

export const toItem = (el: Element): Item => ({ ...ref(el), name: child(el, 'name'), kind: el.getAttribute('kind') as ItemKind,
  specialist: bool(el, 'specialist') || undefined, armor: num(el, 'armor'), dv: str(el, 'dv'), ranges: str(el, 'ranges'),
  category: str(el, 'category'), text: child(el, 'text') })

export interface ParsedFile { kind: string; entries: Element[]; removals: string[]; error?: LoadError }

/** Parse one data file. Never throws: a broken file comes back with `error` set. */
export function parseDataFile(xml: string, file: string): ParsedFile {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const perr = doc.getElementsByTagName('parsererror')[0]
  if (perr) {
    const line = Number(perr.textContent?.match(/line (\d+)/i)?.[1]) || undefined
    return { kind: '', entries: [], removals: [], error: { file, line, message: `XML parse error: ${perr.textContent?.trim().split('\n')[0]}` } }
  }
  const root = doc.documentElement
  const kind = root.getAttribute('kind')
  if (root.localName !== 'data' || !kind) return { kind: '', entries: [], removals: [], error: { file, message: 'root must be <ca2:data kind="...">' } }
  const entries: Element[] = [], removals: string[] = []
  for (const el of root.children) (el.localName === 'remove' ? removals.push(el.getAttribute('id')!) : entries.push(el))
  return { kind, entries, removals }
}
