// Ledger (career): the Anarchy Ledger tab's layout with two currencies. The balances; Record earnings; Spend (pick what,
// see its price and the balances after, Record, confirm); a note; the history with running balances, where an entry that
// may be voided has Void (a reason asked) and a voided one is struck through with its reason. Every price comes from the
// creation settings (src/sr6/engine/career.ts); a refusal reads as a sentence. What the runner lacks a prerequisite for
// is offered too, marked: recorded, Review flags it. What a spend or a history line names (an attribute, a skill, the
// entry picked) shows its card on hover, focus or tap (EntryRef.tsx Sr6AdvanceRef).
import { useState } from 'react'
import { GENDER_LIST, GenderList, Modal } from '../../../ui/bits'
import { attrRating, entryOf, licenceFee, settingQuality } from '../../engine/budgets'
import { balances, earn, ledgerLabel, ledgerRows, note, stolenLeft, voidableIds, voidEntry, type Typed } from '../../engine/career'
import { MAGIC_KINDS, metamagicFits, picksFor } from '../../engine/data'
import {
  CORE_ATTRS,
  MAGIC_KIND_LABELS,
  PURCHASE_KINDS,
  sinName,
  type PickKind,
  type PurchaseKind,
  type Sr6Advance,
  type Sr6Attr,
  type Sr6LedgerEntry,
  type Sr6Purchase,
} from '../../model/character'
import type { Sr6Entry, Sr6Kind } from '../../model/types'
import { ATTR_NAMES, n, reasonText, useSr6Editor } from '../editor'
import { CatalogPicker, type PickedItem } from '../Picker'
import { Sr6AdvanceRef, Sr6Ref } from '../EntryRef'
import { entryLabel } from '../../engine/categories'
import { signatureOf, styleName, techniqueFits } from '../../engine/martial'
import { awakenedFlag } from '../../engine/infected'

const OPS = [
  ['attribute', 'Raise attribute'],
  ['skill', 'Raise skill'],
  ['spec', 'Specialization'],
  ['expertise', 'Expertise'],
  ['knowledge', 'Knowledge or language'],
  ['quality', 'Buy quality'],
  ['buyoff', 'Buy off quality'],
  ['pick', 'Learn spell, ritual, complex form or adept power'],
  ['martialart', 'Learn martial arts style'],
  ['technique', 'Learn martial arts technique'],
  ['powerpoint', 'Power point (mystic adepts)'],
  ['initiate', 'Initiate or submerge'],
  ['purchase', 'Buy gear'],
  ['upgrade', 'Upgrade gear to a higher level'],
  ['drop', 'Drop gear'],
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
const LEARN: PickKind[] = ['spells', 'rituals', 'complexforms', 'adeptpowers']
const whole = (s: string) => (/^-?\d+$/.test(s.trim()) ? Number(s) : NaN)
const signed = (x: number, unit: string) => (x > 0 ? `${n(x)}${unit}` : `+${n(-x)}${unit}`)

export function LedgerTab() {
  const { ch, c, data, cr, p, preview, record, ledger } = useSr6Editor()
  const b = ch.build,
    kind = MAGIC_KINDS[b.magic],
    bal = balances(ch)
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
    licRating: '1',
  })
  const [licences, setLicences] = useState<{ name: string; rating: number }[]>([])
  const [picked, setPicked] = useState<PickedItem | null>(null)
  const [picking, setPicking] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [text, setText] = useState('')
  const [voiding, setVoiding] = useState<Sr6LedgerEntry | null>(null)
  const [why, setWhy] = useState('')
  const set = (patch: Partial<typeof f>) => setF(x => ({ ...x, ...patch }))
  const choose = (o: OpKey) => {
    setOp(o)
    setPicked(null)
    setLicences([])
    setF(x => ({ ...x, target: '', name: '', karma: '', nuyen: '', label: '', gender: '' }))
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

  // a bought item with a higher level in its family (levels.ts) can be upgraded to one
  const upgradable = b.purchases.filter(
    x => x.id && data.siblings(x.kind, x.id).some(s => (data.levelOf(s) ?? 0) > (data.levelOf(data.entry(x.kind, x.id!)) ?? 0)),
  )
  const above = (x: Sr6Purchase | undefined) => (e: Sr6Entry) =>
    !!x?.id && data.family(e.kind, e.id) === data.family(x.kind, x.id) && (data.levelOf(e) ?? 0) > (data.levelOf(data.entry(x.kind, x.id)) ?? 0)
  // the owned lines (accessories too) whose Availability prints a licence fee: licensed on a SIN after creation
  const licensable = b.purchases.flatMap(x => [x, ...x.accessories]).filter(x => licenceFee(x, data) !== undefined)
  // a lifestyle is paid under a SIN: the first unless another is picked
  const sin = b.sins.some(s => s.uid === f.sin) ? f.sin : (b.sins[0]?.uid ?? '')
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
      case 'pick':
        return e ? { op, line: { uid: '', kind: e.kind as PickKind, id: e.id } } : null
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
      case 'drop':
        return f.target ? { op, target: f.target } : null
      // the line's higher level (the old line's grade kept; its accessories follow in applyAdvance)
      case 'upgrade':
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
                ...(upgradable.find(x => x.uid === f.target)?.grade ? { grade: upgradable.find(x => x.uid === f.target)!.grade } : {}),
              },
            }
          : null
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
                licences,
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

  const amount = (e: Sr6LedgerEntry, k: 'karma' | 'nuyen', unit = '') =>
    e.type === 'earn' ? (e[k] ? `+${n(e[k])}${unit}` : '') : e.type === 'advance' && e[k] ? (e[k] > 0 ? `−${n(e[k])}${unit}` : `+${n(-e[k])}${unit}`) : ''
  const rows = ledgerRows(ch),
    voidable = voidableIds(ch)

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
      </p>

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
            {OPS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
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
                set({ target: e.target.value })
                setPicked(null)
              }}
            >
              <option value="">Pick one</option>
              {upgradable.map(x => (
                <option key={x.uid} value={x.uid}>
                  {entryLabel(data.entry(x.kind, x.id!)!)}
                </option>
              ))}
            </select>
          </label>
        )}
        {(op === 'quality' ||
          op === 'pick' ||
          op === 'purchase' ||
          op === 'martialart' ||
          (op === 'technique' && f.target) ||
          (op === 'upgrade' && f.target)) && (
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
        {op === 'drop' && (
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
                  {l.name} ({l.rating})
                  <button aria-label={`Remove licence ${l.name}`} onClick={() => setLicences(licences.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </span>
              ))}
              <input value={f.licName} onChange={e => set({ licName: e.target.value })} placeholder="Licence" aria-label="New licence" />
              <input
                type="number"
                min={1}
                step={1}
                value={f.licRating}
                onChange={e => set({ licRating: e.target.value })}
                aria-label="Licence rating"
                style={{ width: '4.5rem' }}
              />
              <button
                className="btn small"
                disabled={!f.licName.trim()}
                onClick={() => {
                  setLicences([...licences, { name: f.licName.trim(), rating: whole(f.licRating) }])
                  set({ licName: '', licRating: '1' })
                }}
              >
                Add licence
              </button>
            </div>
          </>
        )}
        {/* (a licence is one SIN's: one more SIN for an item, at its fee; owner 2026-10-16) */}
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
                  {voidable.has(e.id) && (
                    <button className="btn small quiet" aria-label={`Void ${ledgerLabel(e)}`} onClick={() => setVoiding(e)}>
                      Void
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
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
            : op === 'pick' || op === 'martialart' || op === 'technique'
              ? 'Learn'
              : op === 'upgrade'
                ? 'Upgrade to'
                : 'Buy gear'
        }
        kinds={
          op === 'quality'
            ? ['qualities']
            : op === 'pick'
              ? LEARN
              : op === 'martialart'
                ? ['martialarts']
                : op === 'technique'
                  ? ['martialtechniques']
                  : op === 'upgrade'
                    ? [upgradable.find(x => x.uid === f.target)?.kind ?? 'gear']
                    : (PURCHASE_KINDS as Sr6Kind[])
        }
        filter={
          op === 'quality' ? e => data.qualities[e.id]?.positive === true : op === 'upgrade' ? above(upgradable.find(x => x.uid === f.target)) : undefined
        }
        note={
          op === 'pick'
            ? e => (picksFor(b.magic)[e.kind as PickKind] ? undefined : `not for ${an(kindName)} ${kindName}`)
            : op === 'technique'
              ? e => (techniqueFits(styleOf(f.target), e) ? undefined : 'not taught by this style')
              : undefined
        }
        onAdd={x => {
          setPicked(x)
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
    </div>
  )
}
