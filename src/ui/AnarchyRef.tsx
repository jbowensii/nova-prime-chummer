// An Anarchy catalog entry named in the editor (an amp, an item, a skill or its specialization, the metatype, a package,
// the lifestyle), with its card on hover, focus or tap (src/ui/EntryHover.tsx): the row Game data shows for it
// (src/ui/tabs/Data.tsx browseKinds), made when shown.
import type { ReactNode } from 'react'
import { attrRRBracket, attrRRSources, bracketed, currentBuild, hasNoMetatype } from '../engine'
import type { AttrId, Catalog, Character } from '../model/types'
import type { BrowseRow } from './types'
import { useEditor } from './editor'
import { EntryHover } from './EntryHover'
import { browseKinds } from './tabs/Data'

/** amps, an item's kind (weapon, armor, gear, spell, complex-form), skills, metatypes, vehicles, packages, lifestyles */
export type AnarchyKind = 'amps' | 'weapon' | 'armor' | 'gear' | 'spell' | 'complex-form' | 'skills' | 'metatypes' | 'vehicles' | 'packages' | 'lifestyles'
const LABEL: Record<AnarchyKind, string> = {
  amps: 'Amp',
  weapon: 'Weapon',
  armor: 'Armor',
  gear: 'Gear',
  spell: 'Spell',
  'complex-form': 'Complex form',
  skills: 'Skill',
  metatypes: 'Metatype',
  vehicles: 'Vehicle',
  packages: 'Package',
  lifestyles: 'Lifestyle',
}

const rows = new WeakMap<Catalog, Map<string, BrowseRow>>()
/** Game data's row for an entry (every kind's rows made once per catalog, on the first card shown). */
export function anarchyRow(c: Catalog, kind: AnarchyKind, id: string): BrowseRow | undefined {
  if (!rows.has(c)) rows.set(c, new Map(browseKinds(c).flatMap(k => k.rows.map(r => [`${k.id}:${r.key}`, r] as [string, BrowseRow]))))
  return rows.get(c)!.get(`${kind}:${id}`)
}
const has = (c: Catalog, kind: AnarchyKind, id: string) =>
  kind === 'amps'
    ? c.amps.has(id)
    : kind === 'skills'
      ? c.skills.has(id)
      : kind === 'metatypes'
        ? c.metatypes.has(id)
        : kind === 'vehicles'
          ? c.vehicles.has(id)
          : kind === 'packages'
            ? c.packages.has(id)
            : kind === 'lifestyles'
              ? c.lifestyles.has(id)
              : c.items.get(id)?.kind === kind

/** `children` naming a catalog entry, with its card (none when it isn't in the catalog). */
export function AnarchyRef({ kind, id, children, tabbable }: { kind: AnarchyKind; id?: string; children: ReactNode; tabbable?: boolean }) {
  const { c } = useEditor()
  const ok = !!id && has(c, kind, id)
  return (
    <EntryHover row={ok ? () => anarchyRow(c, kind, id!)! : undefined} kind={LABEL[kind]} tabbable={tabbable}>
      {children}
    </EntryHover>
  )
}

/** The catalog entry a Review line's path names (`amps.<uid>`, `items.<uid>`, `skills.<id>`), else none. */
export function entryOfPath(c: Catalog, ch: Character, path: string): { kind: AnarchyKind; id: string; name: string } | undefined {
  const [head, key] = path.split('.')
  const amp = head === 'amps' ? ch.build.amps.find(a => a.uid === key) : undefined
  if (amp?.catalogId && c.amps.has(amp.catalogId)) return { kind: 'amps', id: amp.catalogId, name: c.amps.get(amp.catalogId)!.name }
  const item = head === 'items' ? ch.build.items.find(i => i.uid === key) : undefined
  const ie = item?.catalogId ? c.items.get(item.catalogId) : undefined
  if (ie) return { kind: ie.kind, id: ie.id, name: ie.name }
  const sk = head === 'skills' ? c.skills.get(key) : undefined
  return sk && { kind: 'skills', id: sk.id, name: sk.name }
}

/** A picker item's card (src/ui/bits.tsx PickItem). */
export function anarchyCard(c: Catalog, kind: AnarchyKind, id: string): { card?: () => BrowseRow; cardKind?: string } {
  return has(c, kind, id) ? { card: () => anarchyRow(c, kind, id)!, cardKind: LABEL[kind] } : {}
}

/** An attribute's card: its natural rating and the augmented one, the same (Anarchy augments no attribute: what amps give
 *  is Risk Reduction on its tests), the metatype's maximum, the amps giving that RR (attrRRSources, as derive counts it)
 *  and the rule's source and page. */
export function anarchyAttrRow(c: Catalog, ch: Character, a: AttrId): BrowseRow {
  const at = c.attributes.get(a),
    b = ch.finalizedAt ? currentBuild(ch) : ch.build
  const max = (hasNoMetatype(ch) ? [1, 12] : (c.metatypes.get(ch.identity.metatype)?.ranges[a] ?? [1, 6]))[1]
  // (the counted ones; the switchable and conditional ones in brackets, each with its note: owner decision 2026-10-10)
  const rr = attrRRSources(b, a),
    more = attrRRBracket(b, a)
  return {
    key: a,
    name: at?.name ?? a,
    source: at?.source ?? '',
    page: at?.page ?? 0,
    details: [
      `natural ${b.attributes[a] ?? 0}`,
      `augmented ${b.attributes[a] ?? 0}`,
      `max ${max}`,
      rr.length || more.length ? `RR ${bracketed(rr.length, rr.length + more.length)}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    effects: [
      ...rr.map(name => ({ text: `RR +1 on its tests from ${name}`, state: 'applied' as const })),
      ...more.map(x => ({ text: `RR +1 on its tests from ${x.name}${x.how ? ` (${x.how})` : ''}`, state: 'conditional' as const })),
    ],
  }
}

/** `children` naming one of the runner's attributes, with its card on hover, focus or tap. */
export function AnarchyAttrRef({ attr, children, tabbable }: { attr: AttrId; children: ReactNode; tabbable?: boolean }) {
  const { c, ch } = useEditor()
  return (
    <EntryHover row={() => anarchyAttrRow(c, ch, attr)} kind="Attribute" tabbable={tabbable}>
      {children}
    </EntryHover>
  )
}
