// Martial arts (Firing Squad p. 97): a style is bought with karma (karmaMartialArt) and comes with its signature
// technique free; any other technique of one of the style's categories, or of the General category, is bought
// separately (karmaTechnique). No limit on styles; each technique is learned once, whichever style it was learned under.
import type { Sr6Build, Sr6MartialArt, Sr6Purchase, Sr6Technique } from '../formats/domain/character'
import type { Sr6Entry } from '../formats/domain/types'
import { entryLabel } from '../catalog/domain/categories'
import { num, type CreationRules } from '../table-setup/domain/creation'
import type { Sr6Data } from '../catalog/domain/data'

/** Where the rules are printed: Review's martial-arts checks cite it. */
export const MARTIAL_CITE = { source: 'FS', page: 97 }
const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase()

/** A style's categories as printed ("Grappling, Striking"), lowercased. */
export const styleCategories = (style?: Sr6Entry) =>
  norm(style?.attrs.categories)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
/** A technique's category, lowercased, without a restriction printed after it ("Striking; requires …"). */
export const techniqueCategory = (t?: Sr6Entry) => norm(t?.attrs.category).split(';')[0].trim()
/** A technique the style may teach: General, one of its categories, or its signature; unknown (an entry gone, or no
 *  category printed) counts as allowed. */
export function techniqueFits(style: Sr6Entry | undefined, t: Sr6Entry | undefined): boolean {
  const cats = styleCategories(style),
    cat = techniqueCategory(t)
  return !cats.length || !cat || cat === 'general' || cats.includes(cat) || isSignature(style, t?.name)
}
/** The style's signature technique, by name. */
export const isSignature = (style: Sr6Entry | undefined, name: string | undefined) =>
  !!norm(style?.attrs.signature) && norm(style?.attrs.signature) === norm(name)
export const techniqueName = (data: Sr6Data, t: Sr6Technique) => data.entry('martialtechniques', t.id)?.name ?? t.name ?? t.id
export const styleName = (data: Sr6Data, m: Sr6MartialArt) => data.entry('martialarts', m.id)?.name ?? m.name ?? m.id
/** Every technique the runner has learned, under any style. */
export const learned = (b: Sr6Build) => b.martialArts.flatMap(m => m.techniques)

/** The technique a style's signature names (from `techniques`, the catalog's), when the runner hasn't learned it already. */
export function signatureOf(b: Sr6Build, techniques: Iterable<Sr6Entry>, style: Sr6Entry): Sr6Entry | undefined {
  for (const t of techniques) if (isSignature(style, t.name)) return learned(b).some(x => x.id === t.id) ? undefined : t
  return undefined
}

/** A technique's karma: free for its style's signature, else karmaTechnique (0 unset). */
export const techniqueKarma = (data: Sr6Data, cr: CreationRules, m: Sr6MartialArt, t: Sr6Technique) =>
  isSignature(data.entry('martialarts', m.id), techniqueName(data, t)) ? 0 : (num(cr, 'karmaTechnique') ?? 0)
/** The karma the runner's styles and techniques cost (an unset price counts 0). */
export const martialKarma = (b: Sr6Build, data: Sr6Data, cr: CreationRules) =>
  b.martialArts.reduce((sum, m) => sum + (num(cr, 'karmaMartialArt') ?? 0) + m.techniques.reduce((s, t) => s + techniqueKarma(data, cr, m, t), 0), 0)

/** A technique's printed prerequisite (the catalog's <requires kind> child, importer/sr6/flags.py) and whether the
 *  runner has it: an adept power among its picks, a technique among those it learned, a quality among its qualities, an
 *  augmentation among its augmentations (augmentWords); `met` undefined when it can't be told (kind other, an amount). */
export interface Prerequisite {
  kind: 'adeptpower' | 'technique' | 'quality' | 'augmentation' | 'other'
  name: string
  met?: boolean
}
const KINDS = ['adeptpower', 'technique', 'quality', 'augmentation']
/** A name the runner's line has: the same, or that one with a note (`Bending of the Reed (Melee)`: either version). */
const names = (need: string, have: (string | undefined)[]) => have.some(h => norm(h) === norm(need) || norm(h).startsWith(`${norm(need)} (`))
/** A word's stem, compared without case: `cyberlimbs`, `implanted` -> `cyberlimb`, `implant`. */
const stem = (w: string) => w.toLowerCase().replace(/(?:ed|s)$/, '')
const words = (s: string | undefined) =>
  (s ?? '')
    .split(/[^A-Za-z]+/)
    .filter(w => w.length > 2)
    .map(stem)
// how much or which one, never what: `at least one full cyberlimb`, `an intact cyberlimb`
const QUALIFIERS = new Set(['the', 'least', 'one', 'two', 'any', 'full', 'intact', 'and'].map(stem))
/** An augmentation prerequisite against the runner's augmentations (accessories included): each alternative it prints
 *  (`bone lacing, bone density, or a full cyberlimb`) is met by a line whose name, label, category or search names hold
 *  one of its words (`cyberlimb` in `Cyberlimb: Arm (synthetic)`, `implant` in `cyber-implant weapons`); an alternative
 *  printing an amount (`+1 Reaction bonus from augmentations`, `2.0 Essence spent on …`) can't be told. True when one
 *  is met; false when every alternative could be told and none is; else undefined. */
function augmentWords(data: Sr6Data, b: Sr6Build): Set<string> {
  const out = new Set<string>()
  const add = (x: Sr6Purchase) => {
    if (x.kind === 'augmentations') {
      const e = x.id ? data.entry('augmentations', x.id) : undefined
      for (const s of [x.name, e?.name, e && entryLabel(e), e?.attrs.category, ...(e?.aliases ?? [])]) for (const w of words(s)) out.add(w)
    }
    x.accessories.forEach(add)
  }
  b.purchases.forEach(add)
  return out
}
function augmentMet(need: string, have: Set<string>): boolean | undefined {
  let unknown = false
  for (const alt of need.split(/,\s*(?:or\s+)?|\s+or\s+/)) {
    if (/\d/.test(alt)) {
      unknown = true
      continue
    }
    if (words(alt).some(w => !QUALIFIERS.has(w) && have.has(w))) return true
  }
  return unknown ? undefined : false
}
export function prerequisites(data: Sr6Data, b: Sr6Build, t: Sr6Entry | undefined): Prerequisite[] {
  let augments: Set<string> | undefined
  return (t?.parts ?? [])
    .filter(p => p.tag === 'requires')
    .map(p => {
      const kind = (KINDS.includes(p.attrs.kind) ? p.attrs.kind : 'other') as Prerequisite['kind'],
        name = p.text.trim()
      if (kind === 'augmentation') {
        const met = augmentMet(name, (augments ??= augmentWords(data, b)))
        return { kind, name, ...(met === undefined ? {} : { met }) }
      }
      const have =
        kind === 'adeptpower'
          ? b.picks.filter(x => x.kind === 'adeptpowers').map(x => data.entry('adeptpowers', x.id)?.name ?? x.name)
          : kind === 'technique'
            ? learned(b)
                .filter(x => x.id !== t!.id)
                .map(x => techniqueName(data, x))
            : kind === 'quality'
              ? b.qualities.map(q => data.qualities[q.id]?.name ?? q.name)
              : undefined
      return { kind, name, ...(have ? { met: names(name, have) } : {}) }
    })
}
/** A prerequisite as a phrase: `the Kick Attack technique`, `the Killing Hands adept power`, `at least one cyberlimb`. */
export const prerequisiteText = (p: Prerequisite) =>
  p.kind === 'other' || p.kind === 'augmentation' ? p.name : `the ${p.name} ${p.kind === 'adeptpower' ? 'adept power' : p.kind}`
