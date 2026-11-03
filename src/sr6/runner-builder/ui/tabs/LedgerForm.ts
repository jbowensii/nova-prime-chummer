// Ledger form state: the Ledger tab's state and everything derived from it (the price preview, the option lists the spend fields
// offer, the handlers), in one hook so the tab and its sibling files share it. Moved out of Ledger.tsx unchanged.
import { useRef, useState } from 'react'
import { choiceCtx, choiceOptions, diyAllowed, entryOf, licenceFee, priced, settingQuality } from '../../domain/creation/budgets'
import {
  balances,
  clearHistory,
  debtAmount,
  deletableIds,
  deleteEntry,
  earn,
  editEntry,
  ledgerLabel,
  ledgerRows,
  setDebtPercent,
  voidableIds,
  voidEntry,
  type LedgerEdit,
  type Typed,
} from '../../domain/career/career'
import { readSr6LedgerImport } from '../repo'
import { MAGIC_KINDS } from '../../../catalog/domain/data'
import {
  CORE_ATTRS,
  MAGIC_KIND_LABELS,
  PURCHASE_KINDS,
  type PetClass,
  type PickKind,
  type PurchaseKind,
  type ShiftKind,
  type Sr6Advance,
  type Sr6Attr,
  type Sr6LedgerEntry,
  type Sr6Purchase,
} from '../../../formats/domain/character'
import type { Sr6Entry, Sr6Kind } from '../../../formats/domain/types'
import { n, useSr6Editor } from '../editor'
import { type PickedItem } from '../Picker'
import { capacityOf, isAmmoGear, stacks } from '../../../catalog/domain/categories'
import { deep } from '../../domain/creation/actions'
import { newId } from '../../../../core/shared/types'
import { structureOf } from '../../../catalog/domain/structure'
import { entryLabel } from '../../../catalog/domain/categories'
import { signatureOf } from '../../domain/creation/martial'
import { awakenedFlag } from '../../domain/creation/infected'
import { boughtDesign } from '../../domain/assets/design'
import { useSr6Designs } from '../repo'
import { isCritterQuality, trainedWhat } from '../../domain/assets/critters'
import { deriveMod } from '../../domain/assets/derive'
import { accessoryProblem } from '../../domain/creation/actions'
import { expandPack } from '../../domain/creation/packs'

export const OPS = [
  ['attribute', 'Raise attribute'],
  ['skill', 'Raise skill'],
  ['spec', 'Specialization'],
  ['expertise', 'Expertise'],
  ['knowledge', 'Knowledge or language'],
  ['quality', 'Buy quality'],
  ['buyoff', 'Buy off quality'],
  ['learnSpell', 'Learn spell'],
  ['learnRitual', 'Learn ritual'],
  ['learnComplexForm', 'Learn complex form'],
  ['learnAdeptPower', 'Learn adept power'],
  ['martialart', 'Learn martial arts style'],
  ['technique', 'Learn martial arts technique'],
  ['powerpoint', 'Power point (mystic adepts)'],
  ['initiate', 'Initiate or submerge'],
  ['purchase', 'Buy gear'],
  ['pack', 'Buy a starter pack (expanded into its items)'],
  ['vehicle', 'Buy a vehicle'],
  ['drone', 'Buy a drone'],
  ['critter', 'Buy a critter'],
  ['upgrade', 'Upgrade an item I own (grade or level)'],
  ['quantity', 'Change how many of an item I own'],
  ['drop', 'Sell or drop gear'],
  ['fit', 'Fit an accessory, mod, weapon or autosoft (cyberware, gear, vehicle, drone or critter)'],
  ['unfit', 'Remove or sell an accessory (cyberware, gear, vehicle, drone or critter)'],
  ['shift', 'Shift mod slots on a vehicle or drone'],
  ['move', 'Move a weapon to another mount'],
  ['part', 'Take a factory part off a vehicle or drone, or put it back'],
  ['derive', 'GM: derive a mod from any gear for a vehicle or drone'],
  ['bond', 'Bond: a quality for your critter (Critter Bond)'],
  ['teach', 'Teach your critter a command or special training'],
  ['sin', 'SIN'],
  ['licensed', 'Licence on a SIN'],
  ['assign', 'Register an item to a SIN (free)'],
  ['lifestyle', 'Lifestyle'],
  ['contact', 'Contact'],
  ['k2n', 'Karma to nuyen'],
  ['n2k', 'Nuyen to karma'],
  ['awakened', 'Awakened override'],
  ['other', 'Other'],
] as const
export type OpKey = (typeof OPS)[number][0]

/** What a buy op offers in the picker: vehicles and drones have their own ops; Buy gear holds the rest. */
export function buyKinds(op: OpKey): Sr6Kind[] {
  if (op === 'vehicle' || op === 'drone') return ['vehicles'] // a drone is a vehicles entry of drone class (isDrone)
  // (an ammunition type is picked on the ammunition line it is for, not bought alone: on its own it has no price to multiply)
  return PURCHASE_KINDS.filter(k => k !== 'critters' && k !== 'vehicles' && k !== 'ammotypes') as Sr6Kind[]
}
// the four learn ops: each a 'pick' advance of one kind
export const LEARN: Record<string, PickKind> = {
  learnSpell: 'spells',
  learnRitual: 'rituals',
  learnComplexForm: 'complexforms',
  learnAdeptPower: 'adeptpowers',
}
export const whole = (s: string) => (/^-?\d+$/.test(s.trim()) ? Number(s) : NaN)
// a sale credits back a share of the item's value (SR Missions: 30% by default; the owner edits the figure per sale)
export const SELLBACK = 0.3
export const signed = (x: number, unit: string) => (x > 0 ? `${n(x)}${unit}` : `+${n(-x)}${unit}`)

export function useLedgerForm() {
  const { ch, c, data, cr, p, preview, record, ledger } = useSr6Editor()
  const choiceContext = choiceCtx(data, ch.build)
  const b = ch.build,
    kind = MAGIC_KINDS[b.magic],
    bal = balances(ch)
  // In Debt (CRB-HK): a % of the nuyen total taken off the balance; rawNuyen is the total before that
  const inDebtQ = settingQuality(b, cr, 'inDebtQuality', data)
  const rawNuyen = ledgerRows(ch).at(-1)?.nuyen ?? ch.final?.nuyen ?? 0
  const debt = debtAmount(ch, rawNuyen)
  const today = new Date().toISOString().slice(0, 10)
  const [gain, setGain] = useState({ karma: '', nuyen: '', run: '', date: today })
  const [op, setOp] = useState<OpKey>('attribute')
  const [f, setF] = useState({
    target: '',
    name: '',
    kind: 'knowledge',
    months: '1',
    sin: '',
    karma: '',
    nuyen: '',
    label: '',
    archetype: '',
    connection: '1',
    loyalty: '1',
    sinKind: 'fake',
    rating: '1',
    gender: '',
    licName: '',
    mount: '',
    from: 'chassis',
    to: 'powertrain',
    hook: 'vehicle-body', // a derived mod's hook and size (derive)
    size: '0.5',
    diy: false,
    pet: 'mundane',
    neg: '',
    refund: '',
    grade: '',
    price: '', // a vehicle/drone's GM-adjusted nuyen price (blank: the catalog/design price)
    ammo: '', // an ammunition line's ammunition type (blank: Regular)
    qty: '1', // how many of a stacking item (gear, ammunition, electronics, programs) a buy is for
    note: '', // the attribute/skill a chosen power or spell names (Attribute Boost, Improved Ability)
  })
  // (a critter bought: the commands and special training it comes with, catalog ids)
  const [trainedIds, setTrainedIds] = useState<string[]>([])
  // (a new SIN's licences by name: each is rated as the SIN, career.ts)
  const [licences, setLicences] = useState<string[]>([])
  const [picked, setPicked] = useState<PickedItem | null>(null)
  const [picking, setPicking] = useState(false)
  const [opFind, setOpFind] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [text, setText] = useState('')
  const [voiding, setVoiding] = useState<Sr6LedgerEntry | null>(null)
  const [why, setWhy] = useState('')
  const [editing, setEditing] = useState<Sr6LedgerEntry | null>(null)
  const [ef, setEf] = useState<LedgerEdit>({})
  const importRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<typeof f>) => setF(x => ({ ...x, ...patch }))
  const designs = useSr6Designs()
  const designName = (d: (typeof designs)[number]) => d.identity.streetName || 'Unnamed design'
  const kindDesigns = designs.filter(d => (d.design!.kind === 'drone') === (op === 'drone')).sort((x, y) => designName(x).localeCompare(designName(y)))
  const dropLabel = (x: Sr6Purchase) => (x.id && (e => e && entryLabel(e))(data.entry(x.kind, x.id))) || x.name || 'Custom item'
  const itemName = (x: Sr6Purchase) => (e => (e ? entryLabel(e) : (x.name ?? 'Custom item')))(entryOf(x, data))
  // the runner's vehicles and drones (fit: one of them; unfit: what is fitted to them), and critters (critterware, gear)
  const vehicles = ch.build.purchases.filter(x => x.kind === 'vehicles'),
    critters = ch.build.purchases.filter(x => x.kind === 'critters')
  // anything that can carry an accessory in career: vehicles and critters (mods, autosofts, critterware) plus cyberware,
  // bioware and gear that prints slots or a Capacity (an implant's enhancements, a cyberdeck inside a cyberdeck shell)
  const canHost = (x: Sr6Purchase) => {
    const e = entryOf(x, data)
    return !!e && (structureOf(e).slots.length > 0 || capacityOf(e, x.rating ?? 1) !== null)
  }
  // (nested lines too: a weapon in a vehicle's mount, or built into a cyberarm, takes its own accessories)
  const hosts = deep(ch.build.purchases).filter(x => x.kind === 'vehicles' || x.kind === 'critters' || canHost(x)),
    host = hosts.find(x => x.uid === f.target)
  // (bond: the critter companion qualities in the catalog)
  const companion = [...c.entries.qualities.values()].filter(isCritterQuality).sort((x, y) => x.name.localeCompare(y.name))
  // (critter and teach: the book's Critter Command Actions and Critter Special Training in the catalog)
  const trainable = [...c.entries.actions.values()].filter(e => trainedWhat(e)).sort((x, y) => x.name.localeCompare(y.name))
  const choose = (o: OpKey) => {
    setOp(o)
    setPicked(null)
    setLicences([])
    setTrainedIds([])
    setF(x => ({
      ...x,
      target: '',
      name: '',
      karma: '',
      nuyen: '',
      label: '',
      gender: '',
      mount: '',
      diy: false,
      neg: '',
      refund: '',
      grade: '',
      price: '',
      ammo: '',
      qty: '1',
      note: '',
    }))
  }

  const attrs: Sr6Attr[] = [...CORE_ATTRS, 'edg', ...(kind.spells || kind.powers ? ['mag' as const] : []), ...(kind.resonance ? ['res' as const] : [])]
  const skills = Object.values(data.skills).sort((x, y) => x.name.localeCompare(y.name))
  const rank = (id: string) => {
    const s = b.skills.find(x => x.id === id)
    return s ? s.points + s.karma : 0
  }
  const kindName = MAGIC_KIND_LABELS[b.magic].toLowerCase(),
    an = (w: string) => (/^[aeiou]/.test(w) ? 'an' : 'a')
  const styleOf = (uid: string) => data.entry('martialarts', b.martialArts.find(m => m.uid === uid)?.id ?? '')
  const initKind: Sr6Kind = kind.resonance ? 'echoes' : 'metamagics'
  const awake = awakenedFlag(b, data),
    stolen = settingQuality(b, cr, 'stolenGearQuality', data)
  const typedAmounts: Typed = { karma: whole(f.karma || '0'), nuyen: whole(f.nuyen || '0'), label: f.label }

  // what the runner owns that is upgraded in place (keeping its accessories): every augmentation (cyberware/bioware —
  // you can't just sell and re-buy it without losing its mods), plus any item with a higher level in its family (levels.ts).
  // Gear with no accessories is better sold and re-bought, so it isn't forced onto this list.
  const upgradable = b.purchases.filter(
    x => x.id && (x.kind === 'augmentations' || data.siblings(x.kind, x.id).some(s => (data.levelOf(s) ?? 0) > (data.levelOf(data.entry(x.kind, x.id!)) ?? 0))),
  )
  const above = (x: Sr6Purchase | undefined) => (e: Sr6Entry) =>
    !!x?.id && data.family(e.kind, e.id) === data.family(x.kind, x.id) && (data.levelOf(e) ?? 0) > (data.levelOf(data.entry(x.kind, x.id)) ?? 0)
  // the owned lines (accessories too) whose Availability prints a licence fee: licensed on a SIN after creation
  const licensable = b.purchases.flatMap(x => [x, ...x.accessories]).filter(x => licenceFee(x, data) !== undefined)
  // a lifestyle is paid under a SIN: the first unless another is picked
  const sin = b.sins.some(s => s.uid === f.sin) ? f.sin : (b.sins[0]?.uid ?? '')
  // selling gear: the item picked and the default sellback (30% of its book value), which the owner may edit per sale
  const dropItem = op === 'drop' && f.target ? b.purchases.find(x => x.uid === f.target) : undefined
  const dropPriced = dropItem ? priced({ ...dropItem, accessories: [] }, data, cr) : undefined
  const sellDefault = dropPriced?.ok ? Math.round(dropPriced.cost * SELLBACK) : 0
  /** what the form says to buy, or null while it's incomplete */
  const advance = (): Sr6Advance | null => {
    const e = picked?.e
    switch (op) {
      case 'attribute':
        return f.target ? { op, target: f.target as Sr6Attr } : null
      case 'skill':
        return f.target ? { op, target: f.target } : null
      case 'spec':
      case 'expertise':
        return f.target && f.name.trim() ? { op, target: f.target, name: f.name.trim() } : null
      case 'knowledge':
        return f.name.trim()
          ? { op, line: { uid: '', name: f.name.trim(), kind: f.kind === 'language' ? 'language' : 'knowledge', points: 0, karma: 1 } }
          : null
      case 'quality':
        return e ? { op, line: { uid: '', id: e.id, level: 1 } } : null
      case 'buyoff':
        // (Stolen Gear: the part of its converted karma bought off; none, all of it)
        return f.target ? { op, target: f.target, ...(stolen?.uid === f.target && f.karma.trim() ? { part: whole(f.karma) } : {}) } : null
      case 'learnSpell':
      case 'learnRitual':
      case 'learnComplexForm':
      case 'learnAdeptPower':
        // a power/spell that names a choice (Attribute Boost, Improved Ability) carries it as the pick's note
        return e
          ? {
              op: 'pick',
              line: { uid: '', kind: e.kind as PickKind, id: e.id, ...(choiceOptions(data, e, choiceContext) && f.note.trim() ? { note: f.note.trim() } : {}) },
            }
          : null
      case 'martialart': {
        const sig = e && signatureOf(b, c.entries.martialtechniques.values(), e)
        return e ? { op, line: { uid: '', id: e.id, techniques: sig ? [{ uid: '', id: sig.id }] : [] } } : null
      }
      case 'technique':
        return f.target && e ? { op, target: f.target, line: { uid: '', id: e.id } } : null
      case 'powerpoint':
        return { op }
      case 'initiate':
        return { op, ...(f.target ? { line: { uid: '', kind: initKind as PickKind, id: f.target } } : {}) }
      // Custom: one of your designs (the Designer) as it works out now; else the catalog pick, bought like gear
      case 'vehicle':
      case 'drone': {
        const doc = f.target ? designs.find(d => d.id === f.target) : undefined
        const line: Sr6Purchase | null = f.target
          ? doc
            ? boughtDesign(doc, data, cr, '')
            : null
          : e
            ? { uid: '', kind: 'vehicles', id: e.id, qty: 1, accessories: [] }
            : null
        if (!line) return null
        // a price typed that differs from the computed one is recorded as the line's gmPrice (Review asks a GM to approve it)
        const pr = f.price.trim() ? priced(line, data, cr) : undefined
        const typed = f.price.trim() ? whole(f.price) : NaN
        return { op: 'purchase', line: pr?.ok && Number.isFinite(typed) && typed >= 0 && typed !== pr.cost ? { ...line, gmPrice: typed } : line }
      }
      case 'purchase':
        return e
          ? {
              op,
              line: {
                uid: '',
                kind: e.kind as PurchaseKind,
                id: e.id,
                qty: stacks(e.kind, e) ? Math.max(1, whole(f.qty) || 1) : 1,
                ...(choiceOptions(data, e, choiceContext) && f.note.trim() ? { note: f.note.trim() } : {}),
                accessories: f.ammo && isAmmoGear(e) ? [{ uid: newId(), kind: 'ammotypes', id: f.ammo, qty: 1, accessories: [] }] : [],
                ...(picked!.rating ? { rating: picked!.rating } : {}),
                ...(picked!.grade ? { grade: picked!.grade } : {}),
              },
            }
          : null
      // a critter at the pet class picked, with the commands and special training it comes with (Wild Life pp. 180-183)
      case 'critter':
        return e
          ? {
              op: 'purchase',
              line: {
                uid: '',
                kind: 'critters',
                id: e.id,
                qty: 1,
                accessories: [],
                ...(f.pet !== 'mundane' ? { pet: f.pet as PetClass } : {}),
                ...(trainedIds.length ? { trained: trainedIds.map(id => ({ uid: '', what: trainedWhat(data.entry('actions', id))!, id })) } : {}),
              },
            }
          : null
      // a positive companion quality (one the critter has: a level more) and the negative taken with it (SWC p. 139)
      case 'bond': {
        const had = critters.find(x => x.uid === f.target)?.critterQualities?.find(q => q.id === f.name)
        return f.target && f.name
          ? {
              op,
              target: f.target,
              line: had ? { ...had, level: had.level + 1 } : { uid: '', id: f.name, level: 1 },
              ...(f.neg ? { with: { uid: '', id: f.neg, level: 1 } } : {}),
            }
          : null
      }
      // a command or special training taught to a critter the runner owns (+500¥, +750¥: Wild Life p. 180)
      case 'teach': {
        const w = trainedWhat(data.entry('actions', f.name))
        return f.target && w ? { op, target: f.target, line: { uid: '', what: w, id: f.name, taught: true } } : null
      }
      case 'quantity': {
        const q = whole(f.qty)
        return f.target && q >= 1 ? { op, target: f.target, qty: q } : null
      }
      case 'drop': {
        if (!f.target) return null
        const r = whole(f.refund)
        const refund = f.refund.trim() && Number.isFinite(r) ? Math.max(0, r) : sellDefault
        return { op, target: f.target, ...(refund > 0 ? { refund } : {}) }
      }
      case 'unfit': {
        // blank sale price just removes the accessory; a number sells it back for that nuyen
        if (!f.target) return null
        const r = whole(f.refund)
        const refund = f.refund.trim() && Number.isFinite(r) && r > 0 ? r : undefined
        return { op, target: f.target, ...(refund ? { refund } : {}) }
      }
      // (two slots of one category into one of another, Double Clutch p. 120; a weapon into another of its vehicle's mounts)
      case 'shift':
        return f.target ? { op, target: f.target, from: f.from as ShiftKind, to: f.to as ShiftKind } : null
      case 'move':
        return f.target && f.mount ? { op, target: f.target, mount: f.mount } : null
      // (a factory part off, or back if it is off: free, no refund; plan decomposition D1/D4)
      case 'part': {
        const v = vehicles.find(x => x.uid === f.target)
        return v && f.name ? { op, target: f.target, part: f.name, ...(v.removedParts?.includes(f.name) ? { restore: true as const } : {}) } : null
      }
      // (a GM derives a mod from the gear picked, set to a hook and size, and fits it; its price is the source's)
      case 'derive': {
        const size = Number(f.size)
        return f.target && e && size > 0 && f.hook
          ? { op: 'fit', target: f.target, line: { ...deriveMod(e, { hook: f.hook, size, ...(picked!.rating ? { rating: picked!.rating } : {}) }), uid: '' } }
          : null
      }
      // (a weapon into one of the vehicle's mounts; do it yourself: a mod at half price, Double Clutch p. 120)
      case 'fit':
        return f.target && e
          ? {
              op,
              target: f.target,
              line: {
                uid: '',
                kind: e.kind as PurchaseKind,
                id: e.id,
                qty: 1,
                accessories: [],
                ...(picked!.rating ? { rating: picked!.rating } : {}),
                ...(f.mount && e.kind === 'weapons' ? { mount: f.mount } : {}),
                ...(f.diy && diyAllowed(e) ? { diy: true as const } : {}),
              },
            }
          : null
      // upgrade in place: a higher level picked from the catalog (e), a new grade (f.grade), or both; the old line's
      // accessories follow in applyAdvance, and the preview charges the difference in cost
      case 'upgrade': {
        const cur = upgradable.find(x => x.uid === f.target)
        if (!cur) return null
        const grade = f.grade || cur.grade
        return {
          op,
          target: f.target,
          line: { uid: '', kind: (e?.kind ?? cur.kind) as PurchaseKind, id: e?.id ?? cur.id!, qty: 1, accessories: [], ...(grade ? { grade } : {}) },
        }
      }
      // a new SIN, or (target) the placeholder one named
      case 'sin':
        return f.name.trim()
          ? {
              op,
              line: {
                uid: f.target,
                name: f.name.trim(),
                kind: f.sinKind === 'real' ? 'real' : 'fake',
                ...(f.sinKind === 'real' ? {} : { rating: whole(f.rating) }),
                ...(f.gender.trim() ? { gender: f.gender.trim() } : {}),
                licences: licences.map(name => ({ name, rating: 1 })),
              },
            }
          : null
      case 'pack': {
        const x = f.target ? expandPack(data, f.target, b, (h, a) => accessoryProblem(h, a, data)) : undefined
        return x ? { op, ...x } : null
      }
      case 'lifestyle':
        return f.target && sin ? { op, id: f.target, months: whole(f.months), sin } : null
      case 'licensed':
        return f.target && sin ? { op, target: f.target, sin } : null
      case 'assign':
        return f.target ? { op, target: f.target, ...(f.sin ? { sin: f.sin } : {}) } : null
      case 'contact':
        return f.name.trim() || f.target
          ? { op, line: { uid: f.target, name: f.name.trim(), archetype: f.archetype.trim(), connection: whole(f.connection), loyalty: whole(f.loyalty) } }
          : null
      case 'k2n':
        return whole(f.karma) > 0 ? { op: 'convert', karma: whole(f.karma) } : null
      case 'n2k':
        return whole(f.karma) > 0 ? { op: 'convert', karma: -whole(f.karma) } : null
      case 'awakened':
        return f.target ? { op, ...(f.target === 'auto' ? {} : { value: f.target === 'yes' }) } : null
      case 'other':
        return { op }
    }
  }
  const adv = advance()
  const typed = op === 'contact' || op === 'other' ? typedAmounts : undefined
  const pv = adv && preview(adv, typed)
  const priceRest =
    pv && pv.ok
      ? [
          pv.karma ? signed(pv.karma, ' karma') : '',
          pv.nuyen ? signed(pv.nuyen, '¥') : '',
          `after: ${n(bal.karma - pv.karma)} karma, ${n(bal.nuyen - pv.nuyen)}¥`,
        ]
          .filter(Boolean)
          .join(' · ')
      : ''
  const priceLine = pv && pv.ok ? [pv.label, priceRest].filter(Boolean).join(' · ') : ''
  const spend = () => {
    if (adv && !record(adv, typed)) choose(op)
    setConfirm(false)
  }

  const recordEarnings = () => {
    const k = whole(gain.karma || '0'),
      y = whole(gain.nuyen || '0')
    if (!ledger(x => ({ ok: true, ch: earn(x, k, y, gain.run.trim() || 'Run', gain.date) }))) setGain({ karma: '', nuyen: '', run: '', date: gain.date })
  }
  const earnOk = [gain.karma || '0', gain.nuyen || '0'].every(v => whole(v) >= 0) && (whole(gain.karma || '0') > 0 || whole(gain.nuyen || '0') > 0)
  const doVoid = () => {
    if (voiding && !ledger(x => voidEntry(x, voiding.id, why.trim()))) {
      setVoiding(null)
      setWhy('')
    }
  }
  // edit any line: amounts and its text, keyed by the entry's kind
  const openEdit = (e: Sr6LedgerEntry) => {
    setEditing(e)
    setEf(
      e.type === 'earn'
        ? { karma: e.karma, nuyen: e.nuyen, run: e.run, date: e.date }
        : e.type === 'finalize' || e.type === 'advance'
          ? { karma: e.karma, nuyen: e.nuyen, ...(e.type === 'advance' ? { label: e.label } : {}) }
          : e.type === 'note'
            ? { text: e.text }
            : { reason: e.reason },
    )
  }
  const saveEdit = () => {
    if (editing && !ledger(x => ({ ok: true, ch: editEntry(x, editing.id, ef) }))) {
      setEditing(null)
      setEf({})
    }
  }
  const importLedger = async (file: File) => {
    const r = readSr6LedgerImport(await file.text())
    if (!r.ok) {
      window.alert(r.reason)
      return
    }
    if (window.confirm(`Replace this runner’s ${ch.ledger.length} ledger line(s) with the ${r.ledger.length} from the file?`))
      ledger(x => ({ ok: true, ch: { ...x, ledger: r.ledger } }))
  }
  const setDebt = (pct: number) => ledger(x => ({ ok: true, ch: setDebtPercent(x, pct) }))
  // delete (not void): removes a line outright, for clearing out mistakes while building
  const doDelete = (e: Sr6LedgerEntry) => {
    if (window.confirm(`Delete “${ledgerLabel(e)}” from the ledger? This removes it with no record (use Void to keep an audit trail).`))
      ledger(x => deleteEntry(x, e.id))
  }
  const clearAll = () => {
    if (window.confirm('Clear the whole career history and start over? The finalized character is kept; every earning, spend and note after it is removed.'))
      ledger(x => ({ ok: true, ch: clearHistory(x) }))
  }

  const amount = (e: Sr6LedgerEntry, k: 'karma' | 'nuyen', unit = '') =>
    e.type === 'earn' ? (e[k] ? `+${n(e[k])}${unit}` : '') : e.type === 'advance' && e[k] ? (e[k] > 0 ? `−${n(e[k])}${unit}` : `+${n(-e[k])}${unit}`) : ''
  const rows = ledgerRows(ch),
    voidable = voidableIds(ch),
    deletable = deletableIds(ch)
  return {
    ch,
    c,
    data,
    cr,
    p,
    preview,
    record,
    ledger,
    choiceContext,
    b,
    kind,
    bal,
    inDebtQ,
    rawNuyen,
    debt,
    today,
    gain,
    setGain,
    op,
    setOp,
    f,
    setF,
    trainedIds,
    setTrainedIds,
    licences,
    setLicences,
    picked,
    setPicked,
    picking,
    setPicking,
    opFind,
    setOpFind,
    confirm,
    setConfirm,
    text,
    setText,
    voiding,
    setVoiding,
    why,
    setWhy,
    editing,
    setEditing,
    ef,
    setEf,
    importRef,
    set,
    designs,
    designName,
    kindDesigns,
    dropLabel,
    itemName,
    vehicles,
    critters,
    canHost,
    hosts,
    host,
    companion,
    trainable,
    choose,
    attrs,
    skills,
    rank,
    kindName,
    an,
    styleOf,
    initKind,
    awake,
    stolen,
    typedAmounts,
    upgradable,
    above,
    licensable,
    sin,
    dropItem,
    dropPriced,
    sellDefault,
    advance,
    adv,
    typed,
    pv,
    priceRest,
    priceLine,
    spend,
    recordEarnings,
    earnOk,
    doVoid,
    openEdit,
    saveEdit,
    importLedger,
    setDebt,
    doDelete,
    clearAll,
    amount,
    rows,
    voidable,
    deletable,
  }
}
export type LedgerForm = ReturnType<typeof useLedgerForm>
