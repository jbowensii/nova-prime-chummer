// An Anarchy catalog entry named in the editor (an amp, an item, a skill or its specialization, the metatype, a package,
// the lifestyle), with its card on hover, focus or tap (src/core/ui-kit/EntryHover.tsx): the row Game data shows for it
// (browseKinds below), made when shown.
import type { ReactNode } from 'react'
import { currentBuild } from '../domain/career'
import { attrRRBracket, attrRRSources } from '../domain/derive'
import { levelLabel } from '../../catalog/domain/levels'
import { hasNoMetatype } from '../domain/npc'
import { itemPrice } from '../domain/price'
import { bracketed } from '../../../core/shared/effects'
import { formulaText, type Formula } from '../../../core/shared/formula'
import type { AttrId, Catalog, Character, Item, ItemKind, Ref } from '../../formats/domain/types'
import { fmt } from '../../../core/ui-kit/bits'
import type { BrowseKind } from '../../../features/catalog-browser/CatalogBrowser'
import { EditButton, EditedMark } from '../../../features/catalog-edits/editTrigger'
import type { BrowseRow } from '../../../core/ui-kit/types'
import { useEditor } from './editor'
import { EntryHover } from '../../../core/ui-kit/EntryHover'

const ITEM_KINDS: [ItemKind, string][] = [
  ['weapon', 'Weapons'],
  ['armor', 'Armor'],
  ['gear', 'Gear'],
  ['spell', 'Spells'],
  ['complex-form', 'Complex forms'],
]
const vals = (xs: [string, unknown][]) =>
  xs
    .filter(([, v]) => v != null && v !== '' && v !== false)
    .map(([k, v]) => (v === true ? k : `${k} ${v}`))
    .join(' · ')

/** Every browsable kind of the catalog, each entry with its sub-category (amps by type, weapons by category…) and values. */
export function browseKinds(c: Catalog): BrowseKind[] {
  const row = (e: Ref & { name: string }, more: Partial<BrowseRow>): BrowseRow => ({ key: e.id, name: e.name, source: e.source, page: e.page, ...more })
  const edited = (e: { edited?: boolean }) => (e.edited ? <EditedMark /> : undefined)
  // a formula with its value (the standard price is B for an item's cost; Anarchy items have no ratings)
  const formulas = (e: { formulas?: Formula[] }, i?: Item) =>
    (e.formulas ?? [])
      .map(f => {
        const v =
          f.field === 'cost' && i ? itemPrice(c.pricing, { uid: '', kind: i.kind, name: i.name, specialist: i.specialist, armor: i.armor }, i) : undefined
        return `${f.field} = ${formulaText(f, v?.base.toLocaleString('en-US'))}${v ? ` (${v.error ? 'unpriced' : fmt(v.n)})` : ''}`
      })
      .join(' · ')
  const item = (i: Item): BrowseRow =>
    row(i, {
      group: i.category,
      text: i.text,
      marks: edited(i),
      action: <EditButton kind="items" id={i.id} name={i.name} />,
      issues: i.issues,
      details: [
        vals([
          ['specialist', i.specialist],
          ['armor', i.armor],
          ['dv', i.dv],
          ['ranges', i.ranges],
        ]),
        formulas(i, i),
      ]
        .filter(Boolean)
        .join(' · '),
    })
  const items = [...c.items.values()]
  return [
    {
      id: 'amps',
      label: 'Amps',
      rows: [...c.amps.values()].map(a =>
        row(a, {
          group: c.ampTypes.get(a.type)?.name ?? a.type,
          text: a.narrative,
          marks: edited(a),
          action: <EditButton kind="amps" id={a.id} name={a.name} />,
          issues: a.issues,
          details: [
            levelLabel(c, a),
            vals([
              ['rating', a.printedRating],
              ['effects', a.effects.map(x => c.ampEffects.get(x.ref)?.name ?? x.ref).join(', ')],
            ]),
            formulas(a),
          ]
            .filter(Boolean)
            .join(' · '),
        }),
      ),
    },
    {
      id: 'ampeffects',
      label: 'Amp effects',
      rows: [...c.ampEffects.values()].map(e =>
        row(e, {
          group: e.category,
          details: vals([
            ['rating', e.rating],
            ['for', e.types.join(', ')],
            ['max', e.max],
          ]),
        }),
      ),
    },
    ...ITEM_KINDS.map(([k, label]) => ({ id: k, label, rows: items.filter(i => i.kind === k).map(item) })),
    {
      id: 'skills',
      label: 'Skills',
      rows: [...c.skills.values()].map(sk =>
        row(sk, { group: c.attributes.get(sk.attr)?.name, details: vals([['specializations', sk.specs.map(x => x.name).join(', ')]]) }),
      ),
    },
    { id: 'metatypes', label: 'Metatypes', rows: [...c.metatypes.values()].map(m => row(m, { details: vals([['edge', m.edge]]) })) },
    {
      id: 'vehicles',
      label: 'Vehicles',
      rows: [...c.vehicles.values()].map(v =>
        row(v, {
          details: vals([
            ['handling', v.handling],
            ['speed', v.speed],
            ['body', v.body],
            ['armor', v.armor],
            ['pilot', v.pilot],
          ]),
        }),
      ),
    },
    {
      id: 'packages',
      label: 'Packages',
      rows: [...c.packages.values()].map(k => row(k, { group: c.levels.get(k.level)?.name ?? k.level, details: k.archetype })),
    },
    { id: 'lifestyles', label: 'Lifestyles', rows: [...c.lifestyles.values()].map(l => row(l, { text: l.text, details: vals([['per run', l.perRun]]) })) },
    {
      id: 'rules',
      label: 'Rules',
      rows: [...c.rules.values()].map(r =>
        row(
          { ...r, name: r.title },
          { group: r.sheet, text: r.text, details: r.section, marks: edited(r), action: <EditButton kind="rules" id={r.id} name={r.title} /> },
        ),
      ),
    },
  ]
}

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

/** A picker item's card (src/core/ui-kit/bits.tsx PickItem). */
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
