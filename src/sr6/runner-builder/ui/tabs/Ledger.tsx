// Ledger (career): the Anarchy Ledger tab's layout with two currencies. The balances; Record earnings; Spend (pick what,
// see its price and the balances after, Record, confirm); a note; the history with running balances, where an entry that
// may be voided has Void (a reason asked) and a voided one is struck through with its reason. Every price comes from the
// creation settings (src/sr6/runner-builder/domain/career/career.ts); a refusal reads as a sentence. What the runner lacks a prerequisite for
// is offered too, marked: recorded, Review flags it. What a spend or a history line names (an attribute, a skill, the
// entry picked) shows its card on hover, focus or tap (EntryRef.tsx Sr6AdvanceRef).
import { useRef, useState } from 'react'
import { GENDER_LIST, GenderList, Modal } from '../../../../core/ui-kit/bits'
import {
  attrRating,
  choiceOptions,
  choiceSelectOptions,
  diyAllowed,
  entryOf,
  licenceFee,
  powerCost,
  priced,
  settingQuality,
} from '../../domain/creation/budgets'
import {
  balances,
  careerPowerPoints,
  clearHistory,
  debtAmount,
  deletableIds,
  deleteEntry,
  earn,
  editEntry,
  ledgerLabel,
  ledgerRows,
  note,
  setDebtPercent,
  stolenLeft,
  voidableIds,
  voidEntry,
  type LedgerEdit,
  type Typed,
} from '../../domain/career/career'
import { exportSr6Ledger, readSr6LedgerImport } from '../repo'
import { MAGIC_KINDS, metamagicFits, picksFor } from '../../../catalog/domain/data'
import {
  CORE_ATTRS,
  MAGIC_KIND_LABELS,
  PET_CLASSES,
  PURCHASE_KINDS,
  SLOT_KINDS,
  sinName,
  type PetClass,
  type PickKind,
  type PurchaseKind,
  type SlotKind,
  type Sr6Advance,
  type Sr6Attr,
  type Sr6LedgerEntry,
  type Sr6Purchase,
} from '../../../formats/domain/character'
import type { Sr6Entry, Sr6Kind } from '../../../formats/domain/types'
import { ATTR_NAMES, n, reasonText, useSr6Editor } from '../editor'
import { ACCESSORY_KINDS, CatalogPicker, isAccessory, type PickedItem } from '../Picker'
import { capacityOf, offeredOn } from '../../../catalog/domain/categories'
import { structureOf } from '../../../catalog/domain/structure'
import { Sr6AdvanceRef, Sr6Ref } from '../EntryRef'
import { entryLabel } from '../../../catalog/domain/categories'
import { signatureOf, styleName, techniqueFits } from '../../domain/creation/martial'
import { awakenedFlag } from '../../domain/creation/infected'
import { boughtDesign } from '../../domain/assets/design'
import { gradeName, gradeOptions } from '../../domain/creation/grades'
import { useSr6Designs } from '../repo'
import { CRITTER_CLASS_LABELS, isCritterQuality, trainedWhat } from '../../domain/assets/critters'
import { critterWearable } from './Critters'
import { mountsOf } from '../../domain/assets/vehiclemods'

const OPS = [
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
  ['design', 'Buy a vehicle or drone of your design'],
  ['critter', 'Buy a critter'],
  ['upgrade', 'Upgrade an item I own (grade or level)'],
  ['drop', 'Sell or drop gear'],
  ['fit', 'Fit an accessory, mod, weapon or autosoft (cyberware, gear, vehicle, drone or critter)'],
  ['unfit', 'Remove or sell an accessory (cyberware, gear, vehicle, drone or critter)'],
  ['shift', 'Shift mod slots on a vehicle or drone'],
  ['move', 'Move a weapon to another mount'],
  ['bond', 'Bond: a quality for your critter (Critter Bond)'],
  ['teach', 'Teach your critter a command or special training'],
  ['sin', 'SIN'],
  ['licensed', 'Licence on a SIN'],
  ['lifestyle', 'Lifestyle'],
  ['contact', 'Contact'],
  ['k2n', 'Karma to nuyen'],
  ['n2k', 'Nuyen to karma'],
  ['awakened', 'Awakened override'],
  ['other', 'Other'],
] as const
type OpKey = (typeof OPS)[number][0]
// the four learn ops: each a 'pick' advance of one kind
const LEARN: Record<string, PickKind> = { learnSpell: 'spells', learnRitual: 'rituals', learnComplexForm: 'complexforms', learnAdeptPower: 'adeptpowers' }
const whole = (s: string) => (/^-?\d+$/.test(s.trim()) ? Number(s) : NaN)
// a sale credits back a share of the item's value (SR Missions: 30% by default; the owner edits the figure per sale)
const SELLBACK = 0.3
const signed = (x: number, unit: string) => (x > 0 ? `${n(x)}${unit}` : `+${n(-x)}${unit}`)

export function LedgerTab() {
  const { ch, c, data, cr, p, preview, record, ledger } = useSr6Editor()
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
    diy: false,
    pet: 'mundane',
    neg: '',
    refund: '',
    grade: '',
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
  const hosts = ch.build.purchases.filter(x => x.kind === 'vehicles' || x.kind === 'critters' || canHost(x)),
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
    setF(x => ({ ...x, target: '', name: '', karma: '', nuyen: '', label: '', gender: '', mount: '', diy: false, neg: '', refund: '', grade: '', note: '' }))
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
          ? { op: 'pick', line: { uid: '', kind: e.kind as PickKind, id: e.id, ...(choiceOptions(data, e) && f.note.trim() ? { note: f.note.trim() } : {}) } }
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
      case 'purchase':
        return e
          ? {
              op,
              line: {
                uid: '',
                kind: e.kind as PurchaseKind,
                id: e.id,
                qty: 1,
                accessories: [],
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
      // one of your designs (the Designer) as it works out now
      case 'design': {
        const doc = designs.find(d => d.id === f.target)
        return doc ? { op: 'purchase', line: boughtDesign(doc, data, cr, '') } : null
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
        return f.target ? { op, target: f.target, from: f.from as SlotKind, to: f.to as SlotKind } : null
      case 'move':
        return f.target && f.mount ? { op, target: f.target, mount: f.mount } : null
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
      case 'lifestyle':
        return f.target && sin ? { op, id: f.target, months: whole(f.months), sin } : null
      case 'licensed':
        return f.target && sin ? { op, target: f.target, sin } : null
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

  return (
    <div className="stack sr6-ledger">
      <h2>Ledger</h2>
      <p className="muted">
        Earnings add karma and nuyen; spends take them off at the table’s prices (Table setup → Creation rules). The ledger only grows: a mistake is undone by
        voiding it, newest spend first.
      </p>
      <p className="sr6-balances">
        <span>
          Karma <b className={bal.karma < 0 ? 'err' : ''}>{n(bal.karma)}</b>
        </span>
        <span>
          Nuyen <b className={bal.nuyen < 0 ? 'err' : ''}>{n(bal.nuyen)}¥</b>
        </span>
        {debt > 0 && (
          <span className="muted">
            after debt −{n(debt)}¥ ({ch.debtPercent}%)
          </span>
        )}
      </p>

      <div className="row">
        <button className="btn small" onClick={() => exportSr6Ledger(c, ch)}>
          Export ledger
        </button>
        <button className="btn small" onClick={() => importRef.current?.click()}>
          Import ledger
        </button>
        {deletable.size > 0 && (
          <button className="btn small quiet" onClick={clearAll}>
            Clear history
          </button>
        )}
        <input
          ref={importRef}
          type="file"
          accept=".xml,application/xml,text/xml"
          hidden
          onChange={e => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void importLedger(file)
          }}
        />
      </div>

      {inDebtQ && (
        <div className="row">
          <label>
            In Debt (CRB-HK): debt as a % of the nuyen total
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={ch.debtPercent ?? 0}
              onChange={e => setDebt(Math.max(0, Math.min(100, whole(e.target.value) || 0)))}
              aria-label="Debt percent"
              style={{ width: '6rem' }}
            />
          </label>
          {debt > 0 && (
            <span className="muted" style={{ alignSelf: 'end' }}>
              −{n(debt)}¥ of {n(rawNuyen)}¥ comes off the total.
            </span>
          )}
        </div>
      )}

      <h3>Record earnings</h3>
      <div className="row">
        <label>
          Karma
          <input type="number" min={0} step={1} value={gain.karma} onChange={e => setGain({ ...gain, karma: e.target.value })} style={{ width: '6rem' }} />
        </label>
        <label>
          Nuyen
          <input type="number" min={0} step={100} value={gain.nuyen} onChange={e => setGain({ ...gain, nuyen: e.target.value })} style={{ width: '8rem' }} />
        </label>
        <label style={{ flex: 1, minWidth: '10rem' }}>
          Run
          <input value={gain.run} onChange={e => setGain({ ...gain, run: e.target.value })} placeholder="e.g. Warehouse job" />
        </label>
        <label>
          Date
          <input type="date" value={gain.date} onChange={e => setGain({ ...gain, date: e.target.value })} />
        </label>
        <button className="btn primary" style={{ alignSelf: 'end' }} disabled={!earnOk} onClick={recordEarnings}>
          Record earnings
        </button>
      </div>

      <h3>Spend</h3>
      <div className="row">
        <label>
          What
          <select value={op} onChange={e => choose(e.target.value as OpKey)}>
            {OPS.filter(([k, l]) => k === op || l.toLowerCase().includes(opFind.trim().toLowerCase())).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Find
          <input value={opFind} placeholder="type to filter" aria-label="Filter what to spend on" onChange={e => setOpFind(e.target.value)} />
        </label>
        {op === 'attribute' && (
          <label>
            Attribute
            <select value={f.target} onChange={e => set({ target: e.target.value })}>
              <option value="">Pick one</option>
              {attrs.map(a => (
                <option key={a} value={a}>
                  {ATTR_NAMES[a]} ({attrRating(b, a, p)})
                </option>
              ))}
            </select>
          </label>
        )}
        {op === 'skill' && (
          <label>
            Skill
            <select value={f.target} onChange={e => set({ target: e.target.value })}>
              <option value="">Pick one</option>
              {skills.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({rank(s.id) || '—'})
                </option>
              ))}
            </select>
          </label>
        )}
        {(op === 'spec' || op === 'expertise') && (
          <>
            <label>
              Skill
              <select value={f.target} onChange={e => set({ target: e.target.value })}>
                <option value="">Pick one</option>
                {skills.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({rank(s.id) || '—'})
                  </option>
                ))}
              </select>
            </label>
            <label>
              {op === 'spec' ? 'Specialization' : 'Expertise'}
              <input list="sr6-ledger-specs" value={f.name} onChange={e => set({ name: e.target.value })} />
            </label>
            <datalist id="sr6-ledger-specs">
              {(data.skills[f.target]?.specs ?? []).map(x => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </>
        )}
        {op === 'knowledge' && (
          <>
            <label>
              Kind
              <select value={f.kind} onChange={e => set({ kind: e.target.value })}>
                <option value="knowledge">Knowledge</option>
                <option value="language">Language</option>
              </select>
            </label>
            <label>
              Name
              <input value={f.name} onChange={e => set({ name: e.target.value })} />
            </label>
          </>
        )}
        {op === 'technique' && (
          <label>
            Style
            <select
              value={f.target}
              onChange={e => {
                set({ target: e.target.value })
                setPicked(null)
              }}
            >
              <option value="">Pick one</option>
              {b.martialArts.map(m => (
                <option key={m.uid} value={m.uid}>
                  {styleName(data, m)}
                </option>
              ))}
            </select>
          </label>
        )}
        {op === 'upgrade' && (
          <label>
            Item
            <select
              value={f.target}
              onChange={e => {
                set({ target: e.target.value, grade: '' })
                setPicked(null)
              }}
            >
              <option value="">Pick one</option>
              {upgradable.map(x => (
                <option key={x.uid} value={x.uid}>
                  {entryLabel(data.entry(x.kind, x.id!)!)}
                  {x.grade ? `, ${gradeName(data, x.grade)}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {op === 'upgrade' &&
          f.target &&
          (() => {
            const cur = upgradable.find(x => x.uid === f.target)
            const opts = cur?.kind === 'augmentations' ? gradeOptions(cr, data, cur.id ? data.entry(cur.kind, cur.id) : undefined) : []
            return opts.length > 1 ? (
              <label>
                Grade
                <select value={f.grade || cur?.grade || opts[0]} onChange={e => set({ grade: e.target.value })}>
                  {opts.map(g => (
                    <option key={g} value={g}>
                      {gradeName(data, g)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null
          })()}
        {(op === 'quality' ||
          op in LEARN ||
          op === 'purchase' ||
          op === 'martialart' ||
          (op === 'technique' && f.target) ||
          (op === 'upgrade' && f.target) ||
          op === 'critter' ||
          (op === 'fit' && f.target)) && (
          <div style={{ alignSelf: 'end' }}>
            {picked && (
              <span>
                <Sr6Ref kind={picked.e.kind} id={picked.e.id}>
                  {entryLabel(picked.e)}
                </Sr6Ref>
                {picked.rating ? ` (rating ${picked.rating})` : ''}
                {picked.grade ? `, ${picked.grade}` : ''}{' '}
              </span>
            )}
            <button className="btn small" onClick={() => setPicking(true)}>
              {picked ? 'Change…' : 'Pick from the catalog…'}
            </button>
          </div>
        )}
        {op in LEARN &&
          picked &&
          (() => {
            const co = choiceOptions(data, picked.e)
            const pp = picked.e.kind === 'adeptpowers' ? careerPowerPoints(b, data, cr, p) : null
            const cost = pp ? powerCost(data, { id: picked.e.id, note: f.note }) : null
            return (
              <>
                {co && (
                  <label>
                    The {co.kind} it is for
                    <select value={f.note} aria-label="Choice note" onChange={e => set({ note: e.target.value })}>
                      <option value="">Pick one</option>
                      {choiceSelectOptions(co, f.note).map(o => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {pp && (
                  <span className="muted" style={{ alignSelf: 'end' }}>
                    {cost != null ? `${cost} power point${cost === 1 ? '' : 's'} · ` : ''}
                    {pp.left} of {pp.max} power points left
                  </span>
                )}
              </>
            )
          })()}
        {op === 'buyoff' && (
          <label>
            Quality
            <select value={f.target} onChange={e => set({ target: e.target.value })}>
              <option value="">Pick one</option>
              {b.qualities
                .filter(q => !q.free && data.qualities[q.id]?.positive === false)
                .map(q => (
                  <option key={q.uid} value={q.uid}>
                    {data.qualities[q.id]?.name ?? q.name ?? q.id}
                  </option>
                ))}
            </select>
          </label>
        )}
        {op === 'buyoff' && stolen && f.target === stolen.uid && (
          <label>
            Converted karma (of {stolenLeft(b, cr, data, stolen)})
            <input
              type="number"
              min={1}
              step={1}
              value={f.karma}
              onChange={e => set({ karma: e.target.value })}
              placeholder="all"
              aria-label="Converted karma to buy off"
              style={{ width: '6rem' }}
            />
          </label>
        )}
        {op === 'initiate' && (
          <label>
            {kind.resonance ? 'Echo' : 'Metamagic'} (optional)
            <select value={f.target} onChange={e => set({ target: e.target.value })}>
              <option value="">None</option>
              {[...c.entries[initKind].values()]
                .sort((x, y) => x.name.localeCompare(y.name))
                // (a metamagic for adepts only, or magicians only, marked for a runner who may not take it)
                .map(e => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {initKind === 'metamagics' && !metamagicFits(b.magic, data.metamagics[e.id]?.user) ? ` (not for ${an(kindName)} ${kindName})` : ''}
                  </option>
                ))}
            </select>
          </label>
        )}
        {op === 'design' && (
          <label>
            Design
            <select aria-label="Design" value={f.target} onChange={e => set({ target: e.target.value })}>
              <option value="">{designs.length ? 'Pick one' : 'None yet: make one in the Designer'}</option>
              {designs.map(d => (
                <option key={d.id} value={d.id}>
                  {d.identity.streetName || 'Unnamed design'}
                </option>
              ))}
            </select>
          </label>
        )}
        {op === 'critter' && (
          <>
            <label>
              Class
              <select aria-label="Critter class" value={f.pet} onChange={e => set({ pet: e.target.value })}>
                {PET_CLASSES.map(k => (
                  <option key={k} value={k}>
                    {CRITTER_CLASS_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            {(['command', 'training'] as const).map(w => (
              <fieldset key={w} className="row" aria-label={w === 'command' ? 'Commands it comes with' : 'Special training it comes with'}>
                <legend>{w === 'command' ? 'Commands it comes with' : 'Special training it comes with'}</legend>
                {trainable
                  .filter(e => trainedWhat(e) === w)
                  .map(e => (
                    <label key={e.id} className="inline">
                      <input
                        type="checkbox"
                        checked={trainedIds.includes(e.id)}
                        onChange={ev => setTrainedIds(ids => (ev.target.checked ? [...ids, e.id] : ids.filter(i => i !== e.id)))}
                      />{' '}
                      {e.name}
                    </label>
                  ))}
              </fieldset>
            ))}
          </>
        )}
        {op === 'teach' && (
          <>
            <label>
              Critter
              <select aria-label="Taught critter" value={f.target} onChange={e => set({ target: e.target.value })}>
                <option value="">Pick one</option>
                {critters.map(x => (
                  <option key={x.uid} value={x.uid}>
                    {itemName(x)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Command or special training
              <select aria-label="Taught" value={f.name} onChange={e => set({ name: e.target.value })}>
                <option value="">Pick one</option>
                {(['command', 'training'] as const).map(w => (
                  <optgroup key={w} label={w === 'command' ? 'Commands' : 'Special training'}>
                    {trainable
                      .filter(e => trainedWhat(e) === w)
                      .map(e => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </>
        )}
        {op === 'bond' && (
          <>
            <label>
              Critter
              <select aria-label="Bonded critter" value={f.target} onChange={e => set({ target: e.target.value })}>
                <option value="">Pick one</option>
                {critters.map(x => (
                  <option key={x.uid} value={x.uid}>
                    {itemName(x)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quality
              <select aria-label="Bonded quality" value={f.name} onChange={e => set({ name: e.target.value })}>
                <option value="">Pick one</option>
                {companion
                  .filter(e => data.qualities[e.id]?.positive)
                  .map(e => (
                    <option key={e.id} value={e.id}>
                      {entryLabel(e)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              With the negative
              <select aria-label="Negative taken with it" value={f.neg} onChange={e => set({ neg: e.target.value })}>
                <option value="">None</option>
                {companion
                  .filter(e => data.qualities[e.id]?.positive === false)
                  .map(e => (
                    <option key={e.id} value={e.id}>
                      {entryLabel(e)}
                    </option>
                  ))}
              </select>
            </label>
          </>
        )}
        {op === 'fit' && (
          <label>
            Item to fit onto
            <select
              aria-label="Fit to"
              value={f.target}
              onChange={e => {
                set({ target: e.target.value, mount: '' })
                setPicked(null)
              }}
            >
              <option value="">Pick one</option>
              {hosts.map(x => (
                <option key={x.uid} value={x.uid}>
                  {itemName(x)}
                </option>
              ))}
            </select>
          </label>
        )}
        {op === 'fit' && host && picked?.e.kind === 'weapons' && (
          <label>
            Weapon mount
            <select aria-label="In weapon mount" value={f.mount} onChange={e => set({ mount: e.target.value })}>
              <option value="">None</option>
              {mountsOf(host, data).map(m => (
                <option key={m.uid} value={m.uid}>
                  {m.name}
                  {m.builtin ? ' (built in)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {op === 'fit' && picked && diyAllowed(picked.e) && (
          <label className="inline" style={{ alignSelf: 'end' }}>
            <input type="checkbox" aria-label="Do it yourself" checked={f.diy} onChange={e => set({ diy: e.target.checked })} /> Do it yourself (half price)
          </label>
        )}
        {op === 'shift' && (
          <>
            <label>
              Vehicle or drone
              <select aria-label="Shift on" value={f.target} onChange={e => set({ target: e.target.value })}>
                <option value="">Pick one</option>
                {vehicles.map(x => (
                  <option key={x.uid} value={x.uid}>
                    {itemName(x)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Two slots from
              <select aria-label="Shift from" value={f.from} onChange={e => set({ from: e.target.value })}>
                {SLOT_KINDS.map(k => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label>
              One slot to
              <select aria-label="Shift to" value={f.to} onChange={e => set({ to: e.target.value })}>
                {SLOT_KINDS.map(k => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {op === 'move' && (
          <>
            <label>
              Weapon
              <select aria-label="Weapon to move" value={f.target} onChange={e => set({ target: e.target.value, mount: '' })}>
                <option value="">Pick one</option>
                {vehicles.flatMap(x =>
                  x.accessories
                    .filter(a => a.kind === 'weapons')
                    .map(a => (
                      <option key={a.uid} value={a.uid}>
                        {itemName(a)} on {itemName(x)}
                      </option>
                    )),
                )}
              </select>
            </label>
            <label>
              Into mount
              <select aria-label="Move to mount" value={f.mount} onChange={e => set({ mount: e.target.value })}>
                <option value="">Pick one</option>
                {(v => (v ? mountsOf(v, data) : []))(vehicles.find(x => x.accessories.some(a => a.uid === f.target))).map(m => (
                  <option key={m.uid} value={m.uid}>
                    {m.name}
                    {m.builtin ? ' (built in)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {op === 'unfit' && (
          <label>
            Fitted item
            <select aria-label="Fitted item" value={f.target} onChange={e => set({ target: e.target.value })}>
              <option value="">Pick one</option>
              {hosts.flatMap(x =>
                x.accessories.map(a => (
                  <option key={a.uid} value={a.uid}>
                    {itemName(a)} on {itemName(x)}
                  </option>
                )),
              )}
            </select>
          </label>
        )}
        {op === 'unfit' &&
          f.target &&
          (() => {
            const acc = hosts.flatMap(x => x.accessories).find(a => a.uid === f.target)
            const pr = acc ? priced({ ...acc, accessories: [] }, data, cr) : undefined
            const def = pr?.ok ? Math.round(pr.cost * SELLBACK) : 0
            return (
              <label>
                Sell for (¥)
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={f.refund}
                  placeholder={`${n(def)} (30%) — blank to just remove`}
                  onChange={e => set({ refund: e.target.value })}
                  aria-label="Sale price in nuyen"
                />
              </label>
            )
          })()}
        {op === 'drop' && (
          <>
            <label>
              Item
              <select value={f.target} onChange={e => set({ target: e.target.value })}>
                <option value="">Pick one</option>
                {b.purchases.map(x => (
                  <option key={x.uid} value={x.uid}>
                    {(x.id && (e => e && entryLabel(e))(data.entry(x.kind, x.id))) || x.name || 'Custom item'}
                  </option>
                ))}
              </select>
            </label>
            {f.target && (
              <label>
                Sell for (¥)
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={f.refund}
                  placeholder={`${sellDefault} (30%)`}
                  onChange={e => set({ refund: e.target.value })}
                  aria-label="Sale price in nuyen credited back"
                  style={{ width: '9rem' }}
                />
              </label>
            )}
          </>
        )}
        {op === 'sin' && (
          <>
            {b.sins.some(s => s.placeholder) && (
              <label>
                Which
                <select value={f.target} onChange={e => set({ target: e.target.value })}>
                  <option value="">A new SIN</option>
                  {b.sins
                    .filter(s => s.placeholder)
                    .map(s => (
                      <option key={s.uid} value={s.uid}>
                        Name the unnamed SIN
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label>
              Name
              <input value={f.name} onChange={e => set({ name: e.target.value })} />
            </label>
            <label>
              Kind
              <select value={f.sinKind} onChange={e => set({ sinKind: e.target.value })}>
                <option value="fake">Fake</option>
                <option value="real">Real</option>
              </select>
            </label>
            {f.sinKind === 'fake' && (
              <label>
                Rating
                <input type="number" min={1} step={1} value={f.rating} onChange={e => set({ rating: e.target.value })} style={{ width: '5rem' }} />
              </label>
            )}
            <label>
              Gender
              <input value={f.gender} onChange={e => set({ gender: e.target.value })} placeholder="optional" list={GENDER_LIST} style={{ width: '9rem' }} />
              <GenderList />
            </label>
            <div className="row" style={{ alignSelf: 'end' }}>
              {licences.map((l, i) => (
                <span key={i} className="chip">
                  {l}
                  <button aria-label={`Remove licence ${l}`} onClick={() => setLicences(licences.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </span>
              ))}
              <input value={f.licName} onChange={e => set({ licName: e.target.value })} placeholder="Licence" aria-label="New licence" />
              <button
                className="btn small"
                disabled={!f.licName.trim()}
                onClick={() => {
                  setLicences([...licences, f.licName.trim()])
                  set({ licName: '' })
                }}
              >
                Add licence
              </button>
            </div>
          </>
        )}
        {/* (a licence is one SIN's: one more SIN for an item, at its fee on a real SIN, a fake licence rated as a fake one; owner 2026-10-16) */}
        {op === 'licensed' && (
          <>
            <label>
              Item
              <select aria-label="Licensed item" value={f.target} onChange={e => set({ target: e.target.value })}>
                <option value="">Pick one</option>
                {licensable.map(x => (
                  <option key={x.uid} value={x.uid}>
                    {(e => (e ? entryLabel(e) : (x.name ?? 'Custom item')))(entryOf(x, data))}
                  </option>
                ))}
              </select>
            </label>
            <label>
              SIN
              <select aria-label="Licensed on" value={sin} onChange={e => set({ sin: e.target.value })}>
                {!b.sins.length && <option value="">The runner has no SIN</option>}
                {b.sins.map((s, i) => (
                  <option key={s.uid} value={s.uid}>
                    {sinName(s, `SIN ${i + 1}`)}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {op === 'lifestyle' && (
          <>
            <label>
              SIN
              <select value={sin} onChange={e => set({ sin: e.target.value })}>
                {!b.sins.length && <option value="">The runner has no SIN</option>}
                {b.sins.map((s, i) => (
                  <option key={s.uid} value={s.uid}>
                    {sinName(s, `SIN ${i + 1}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Lifestyle
              <select value={f.target} onChange={e => set({ target: e.target.value })}>
                <option value="">Pick one</option>
                {[...c.entries.lifestyles.values()].map(e => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Months
              <input type="number" min={1} step={1} value={f.months} onChange={e => set({ months: e.target.value })} style={{ width: '5rem' }} />
            </label>
          </>
        )}
        {op === 'contact' && (
          <>
            <label>
              Contact
              <select
                value={f.target}
                onChange={e => {
                  const x = b.contacts.find(k => k.uid === e.target.value)
                  set(
                    x
                      ? { target: x.uid, name: x.name, archetype: x.archetype, connection: String(x.connection), loyalty: String(x.loyalty) }
                      : { target: '', name: '', archetype: '', connection: '1', loyalty: '1' },
                  )
                }}
              >
                <option value="">New contact</option>
                {b.contacts.map(x => (
                  <option key={x.uid} value={x.uid}>
                    {x.name || 'Unnamed'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Name
              <input value={f.name} onChange={e => set({ name: e.target.value })} />
            </label>
            <label>
              Archetype
              <input value={f.archetype} onChange={e => set({ archetype: e.target.value })} />
            </label>
            <label>
              Connection
              <input type="number" min={1} step={1} value={f.connection} onChange={e => set({ connection: e.target.value })} style={{ width: '5rem' }} />
            </label>
            <label>
              Loyalty
              <input type="number" min={1} step={1} value={f.loyalty} onChange={e => set({ loyalty: e.target.value })} style={{ width: '5rem' }} />
            </label>
          </>
        )}
        {(op === 'k2n' || op === 'n2k') && (
          <label>
            Karma
            <input type="number" min={1} step={1} value={f.karma} onChange={e => set({ karma: e.target.value })} style={{ width: '6rem' }} />
          </label>
        )}
        {/* (the Awakened flag's override after creation, free; Review warns while it differs: owner 2026-10-16) */}
        {op === 'awakened' && (
          <label>
            Awakened
            <select aria-label="Awakened override" value={f.target} onChange={e => set({ target: e.target.value })}>
              <option value="">Pick one</option>
              <option value="auto">
                Derived: {awake.derived ? 'Awakened' : 'not Awakened'} ({awake.why})
              </option>
              <option value="yes">Awakened (override)</option>
              <option value="no">Not Awakened (override)</option>
            </select>
          </label>
        )}
        {op === 'other' && (
          <label style={{ flex: 1, minWidth: '10rem' }}>
            What it was
            <input value={f.label} onChange={e => set({ label: e.target.value })} />
          </label>
        )}
        {(op === 'contact' || op === 'other') && (
          <>
            <label>
              Karma spent
              <input type="number" step={1} value={f.karma} onChange={e => set({ karma: e.target.value })} style={{ width: '6rem' }} />
            </label>
            <label>
              Nuyen spent
              <input type="number" step={100} value={f.nuyen} onChange={e => set({ nuyen: e.target.value })} style={{ width: '8rem' }} />
            </label>
          </>
        )}
      </div>
      <div className="row">
        <p className={`sr6-preview${pv && !pv.ok ? ' err' : ''}`} role="status" aria-label="Price" style={{ flex: 1, margin: 0 }}>
          {!pv ? (
            <span className="muted">Pick what to buy.</span>
          ) : pv.ok ? (
            <>
              {pv.label ? <Sr6AdvanceRef advance={adv!}>{pv.label}</Sr6AdvanceRef> : null}
              {pv.label && priceRest ? ' · ' : ''}
              {priceRest}
            </>
          ) : (
            reasonText(pv.reason)
          )}
        </p>
        <button className="btn primary" disabled={!pv?.ok} onClick={() => setConfirm(true)}>
          Record
        </button>
      </div>

      <div className="row">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Add a note to the history" aria-label="Note" style={{ flex: 1 }} />
        <button
          className="btn small"
          disabled={!text.trim()}
          onClick={() => {
            if (!ledger(x => ({ ok: true, ch: note(x, text.trim()) }))) setText('')
          }}
        >
          Add note
        </button>
      </div>

      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>When</th>
              <th>What</th>
              <th className="num">Karma</th>
              <th className="num">Nuyen</th>
              <th className="num">Karma left</th>
              <th className="num">Nuyen left</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, karma, nuyen, voided, reason }) => (
              <tr key={e.id} className={voided ? 'voided' : undefined}>
                <td className="muted">{e.at.slice(0, 10)}</td>
                <td>
                  {e.type === 'advance' ? <Sr6AdvanceRef advance={e.advance}>{ledgerLabel(e)}</Sr6AdvanceRef> : ledgerLabel(e)}
                  {voided && reason && <span className="muted why">Voided: {reason}</span>}
                </td>
                <td className="num">{amount(e, 'karma')}</td>
                <td className="num">{amount(e, 'nuyen', '¥')}</td>
                <td className="num">{voided || e.type === 'note' || e.type === 'void' ? '' : n(karma)}</td>
                <td className="num">{voided || e.type === 'note' || e.type === 'void' ? '' : `${n(nuyen)}¥`}</td>
                <td className="num">
                  {!voided && e.type !== 'void' && (
                    <button className="btn small quiet" aria-label={`Edit ${ledgerLabel(e)}`} onClick={() => openEdit(e)}>
                      Edit
                    </button>
                  )}
                  {voidable.has(e.id) && (
                    <button className="btn small quiet" aria-label={`Void ${ledgerLabel(e)}`} onClick={() => setVoiding(e)}>
                      Void
                    </button>
                  )}
                  {deletable.has(e.id) && (
                    <button className="btn small quiet" aria-label={`Delete ${ledgerLabel(e)}`} onClick={() => doDelete(e)}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {debt > 0 && (
              <tr>
                <td />
                <td className="muted">In Debt ({ch.debtPercent}%)</td>
                <td />
                <td className="num muted">−{n(debt)}¥</td>
                <td />
                <td className="num muted">{n(rawNuyen)}¥</td>
                <td />
              </tr>
            )}
            <tr>
              <td />
              <td>
                <b>Balance</b>
              </td>
              <td />
              <td />
              <td className={`num${bal.karma < 0 ? ' err' : ''}`}>
                <b>{n(bal.karma)}</b>
              </td>
              <td className={`num${bal.nuyen < 0 ? ' err' : ''}`}>
                <b>{n(bal.nuyen)}¥</b>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <CatalogPicker
        open={picking}
        onClose={() => setPicking(false)}
        grades={op === 'purchase'}
        title={
          op === 'quality'
            ? 'Buy a quality'
            : op in LEARN || op === 'martialart' || op === 'technique'
              ? 'Learn'
              : op === 'upgrade'
                ? 'Upgrade to'
                : op === 'fit'
                  ? 'Fit'
                  : op === 'critter'
                    ? 'Buy a critter'
                    : 'Buy gear'
        }
        critter={(op === 'fit' && host?.kind === 'critters') || undefined}
        kinds={
          op === 'quality'
            ? ['qualities']
            : op in LEARN
              ? [LEARN[op]]
              : op === 'martialart'
                ? ['martialarts']
                : op === 'technique'
                  ? ['martialtechniques']
                  : op === 'upgrade'
                    ? [upgradable.find(x => x.uid === f.target)?.kind ?? 'gear']
                    : op === 'fit'
                      ? host?.kind === 'critters'
                        ? ['augmentations', 'gear', 'electronics']
                        : host?.kind === 'vehicles'
                          ? ['gear', 'weapons', 'electronics', 'programs']
                          : ACCESSORY_KINDS // cyberware/bioware/gear host: the accessory kinds, filtered to what fits it
                      : op === 'critter'
                        ? ['critters']
                        : (PURCHASE_KINDS.filter(k => k !== 'critters') as Sr6Kind[])
        }
        filter={
          op === 'quality'
            ? e => data.qualities[e.id]?.positive === true
            : op === 'upgrade'
              ? above(upgradable.find(x => x.uid === f.target))
              : op === 'fit'
                ? host?.kind === 'critters'
                  ? critterWearable
                  : host?.kind === 'vehicles'
                    ? e => e.kind !== 'weapons' || !isAccessory(e)
                    : e => offeredOn(data.categories, e, entryOf(host!, data), undefined, isAccessory) // only accessories that fit the implant/host
                : undefined
        }
        note={
          op in LEARN
            ? e => (picksFor(b.magic)[e.kind as PickKind] ? undefined : `not for ${an(kindName)} ${kindName}`)
            : op === 'technique'
              ? e => (techniqueFits(styleOf(f.target), e) ? undefined : 'not taught by this style')
              : undefined
        }
        onAdd={x => {
          setPicked(x)
          set({ note: '' })
          return null
        }}
      />
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Record this spend?"
        actions={
          <>
            <button className="btn" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button className="btn primary" onClick={spend}>
              Record it
            </button>
          </>
        }
      >
        <p>{priceLine}</p>
        <p className="muted">It goes in the ledger; Void takes it back while it’s the newest spend.</p>
      </Modal>
      <Modal
        open={!!voiding}
        onClose={() => setVoiding(null)}
        title="Void this entry?"
        actions={
          <>
            <button className="btn" onClick={() => setVoiding(null)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!why.trim()} onClick={doVoid}>
              Void
            </button>
          </>
        }
      >
        <p>{voiding && ledgerLabel(voiding)}</p>
        <label>
          Why
          <input autoFocus value={why} onChange={e => setWhy(e.target.value)} placeholder="e.g. Picked the wrong one" />
        </label>
      </Modal>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit this line"
        actions={
          <>
            <button className="btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn primary" onClick={saveEdit}>
              Save
            </button>
          </>
        }
      >
        {editing && (
          <div className="stack">
            {(editing.type === 'finalize' || editing.type === 'earn' || editing.type === 'advance') && (
              <div className="row">
                <label>
                  Karma
                  <input
                    type="number"
                    step={1}
                    value={ef.karma ?? 0}
                    onChange={e => setEf({ ...ef, karma: whole(e.target.value) || 0 })}
                    style={{ width: '7rem' }}
                  />
                </label>
                <label>
                  Nuyen
                  <input
                    type="number"
                    step={100}
                    value={ef.nuyen ?? 0}
                    onChange={e => setEf({ ...ef, nuyen: whole(e.target.value) || 0 })}
                    style={{ width: '9rem' }}
                  />
                </label>
              </div>
            )}
            {editing.type === 'earn' && (
              <div className="row">
                <label style={{ flex: 1 }}>
                  Run
                  <input value={ef.run ?? ''} onChange={e => setEf({ ...ef, run: e.target.value })} />
                </label>
                <label>
                  Date
                  <input type="date" value={ef.date ?? ''} onChange={e => setEf({ ...ef, date: e.target.value })} />
                </label>
              </div>
            )}
            {editing.type === 'advance' && (
              <label>
                What it was
                <input value={ef.label ?? ''} onChange={e => setEf({ ...ef, label: e.target.value })} />
              </label>
            )}
            {editing.type === 'note' && (
              <label>
                Note
                <input autoFocus value={ef.text ?? ''} onChange={e => setEf({ ...ef, text: e.target.value })} />
              </label>
            )}
            <p className="muted">A spend’s amounts are a plus taken off; a plus here spends more, a minus gives back. The balances re-total from the line.</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
