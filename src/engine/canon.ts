// Canon: whether content comes from the game's official rules (sources.xml canon="true").
// Anything else (published supplements that aren't official, house rules, unknown sources) isn't.
import type { Build, Catalog, Ref } from '../model/types'

export const isCanonSource = (c: Catalog, source: string | undefined): boolean => !!source && !!c.sources.get(source)?.canon

/** Whether `source` is a compendium's, or one the catalog no longer has (a compendium unshared or deleted). */
export const houseSource = (c: Catalog, source: string | undefined) => !!source && (!c.sources.has(source) || !!c.sources.get(source)!.compendium)

export const isCanon = (c: Catalog, ref: Pick<Ref, 'source'>): boolean => isCanonSource(c, ref.source)

/** source of a spec id: its own citation, else its skill's; custom specs have none */
export function specSource(c: Catalog, specId: string): string | undefined {
  const skill = c.skills.get(specId.split('.')[0])
  const spec = skill?.specs.find(s => s.id === specId)
  return spec ? (spec.source ?? skill!.source) : undefined
}

export interface NonCanonUse {
  path: string
  name: string
  source: string
}

/** Catalog content on the runner that isn't canon: amps and items taken from the catalog, specs. */
export function nonCanonUses(c: Catalog, b: Build): NonCanonUse[] {
  const out: NonCanonUse[] = []
  b.amps.forEach((a, i) => {
    const t = a.catalogId ? (c.amps.get(a.catalogId) ?? a.snapshot) : undefined
    if (t && !isCanon(c, t)) out.push({ path: `build.amps.${i}`, name: a.name, source: t.source })
    for (const e of a.effects) {
      const src = e.ref === 'rr-spec' && e.param && !e.param.startsWith('custom:') ? specSource(c, e.param) : undefined
      if (src && !isCanonSource(c, src))
        out.push({ path: `build.amps.${i}`, name: `${a.name}: ${c.skills.get(e.param!.split('.')[0])?.specs.find(s => s.id === e.param)?.name}`, source: src })
    }
  })
  b.items.forEach((it, i) => {
    const t = it.catalogId ? (c.items.get(it.catalogId) ?? it.snapshot) : undefined
    if (t && !isCanon(c, t)) out.push({ path: `build.items.${i}`, name: it.name, source: t.source })
  })
  b.skills.forEach((s, i) => {
    for (const sp of s.specs) {
      const src = sp.startsWith('custom:') ? undefined : specSource(c, sp)
      if (src && !isCanonSource(c, src))
        out.push({ path: `build.skills.${i}`, name: c.skills.get(s.id)?.specs.find(x => x.id === sp)?.name ?? sp, source: src })
    }
  })
  return out
}

/** Hover help for an amp effect: the first rules-reference entry that explains it and has text. */
export function ruleHelp(c: Catalog, effectRef: string): string | undefined {
  for (const r of c.rules.values()) if (r.text && r.effects.includes(effectRef)) return `${r.title}: ${r.text}`
  return undefined
}
