// Gear: weapons (attack ratings, accessories from the accessory categories), armor (worn, the Defense and Social Ratings it gives),
// electronics, programs and autosofts (at a rating, priced by the book's formula) and other gear (a quantity where lines stack), and a custom item at the player's own price.
import { useState, type ReactNode } from 'react'
import { Modal } from '../../../../core/ui-kit/bits'
import type { PurchaseKind, Sr6Purchase } from '../../../formats/domain/character'
import { sinName } from '../../../formats/domain/character'
import { entryOf, isFocus, priced, statusesOf, takesMaterial } from '../../domain/creation/budgets'
import { activeRules, deckKarma, DECK_NUYEN_PER_KARMA, isDeckPart } from '../../domain/creation/rule-markers'
import { ratingEdge } from '../../domain/creation/derive'
import { n, useSr6Editor } from '../editor'
import { BuyItemDesign } from '../Builder'
import { Accessories, ACCESSORY_KINDS, isAccessory, MaterialPick, packChoices, PurchaseSection, social } from '../Picker'
import { entryLabel, isAmmoGear, isAmmoType, isExplosive } from '../../../catalog/domain/categories'

const CUSTOM_KINDS: [PurchaseKind, string][] = [
  ['gear', 'Other gear'],
  ['electronics', 'Electronics'],
  ['weapons', 'Weapon'],
  ['armor', 'Armor'],
]
const band = (v: number | null) => (v === null ? '—' : String(v))

/** Career: the Gear tab is read only, so this sits beside it (EditorView, outside the disabled fieldset): every owned line
 *  with an Identity picker that records a free `assign` ledger entry (a fieldset's disabled can't be undone inside it). */
export function CareerIdentities() {
  const { ch, data, record } = useSr6Editor()
  const [err, setErr] = useState<string | null>(null)
  const sins = ch.build.sins,
    lines = ch.build.purchases.flatMap(x => [x, ...x.accessories])
  if (!sins.length || !lines.length) return null
  const label = (x: Sr6Purchase) => (e => (e ? entryLabel(e) : (x.name ?? 'Custom item')))(entryOf(x, data))
  return (
    <section className="stack" aria-label="Identities">
      <h3>Identities (free)</h3>
      {err && (
        <p className="banner err" role="alert">
          {err}
        </p>
      )}
      {lines.map(x => (
        <label key={x.uid} className="inline">
          {label(x)}{' '}
          <select
            aria-label={`${label(x)} identity`}
            value={x.sin ?? ''}
            onChange={e => setErr(record({ op: 'assign', target: x.uid, ...(e.target.value ? { sin: e.target.value } : {}) }))}
          >
            <option value="">Unassigned</option>
            {sins.map(s => (
              <option key={s.uid} value={s.uid}>
                {sinName(s)}
              </option>
            ))}
          </select>
        </label>
      ))}
    </section>
  )
}

/** Buy starter packs (any number; each is one undoable pack line). Shown at the top of the creation Gear tab; career buys on the Ledger. */
export function StarterPacks() {
  const { c, act } = useSr6Editor()
  const [pack, setPack] = useState('')
  if (c.entries.packs.size === 0) return null
  return (
    <div className="row">
      <label className="inline">
        Starter pack{' '}
        <select aria-label="Starter pack" value={pack} onChange={e => setPack(e.target.value)}>
          <option value="">Pick one</option>
          {packChoices(c.entries.packs.values())}
        </select>
      </label>
      <button
        className="btn small"
        disabled={!pack}
        onClick={() => {
          if (!act({ op: 'pack', id: pack })) setPack('')
        }}
      >
        Buy pack
      </button>
      <span className="muted">
        Expands into its items as separate lines, charged at the pack price. Buy as many as you like; remove a pack line (Gear tab) to undo it all.
      </span>
    </div>
  )
}

export function GearTab() {
  const { c, d, ch, data, cr, act, edit, career } = useSr6Editor()
  const [custom, setCustom] = useState(false)
  const [name, setName] = useState(''),
    [kind, setKind] = useState<PurchaseKind>('gear'),
    [cost, setCost] = useState(''),
    [avail, setAvail] = useState(''),
    [err, setErr] = useState<string | null>(null)
  // the Attack Rating against a target's Defense Rating: who gains Edge at each range band (CRB Hong Kong p. 45)
  const [dr, setDr] = useState('')
  const target = dr.trim() === '' ? null : Number(dr)
  const edgeAt = (bands: (number | null)[]) => {
    if (target === null || !Number.isFinite(target)) return ''
    const e = bands.map(v => ratingEdge(v, target, cr))
    return e.every(x => x === null) ? '' : ` · Edge ${e.map(x => (x === null ? '—' : x > 0 ? `+${x}` : x < 0 ? `${x}` : '0')).join('/')}`
  }
  const ar = (uid: string) => {
    const w = d.attackRatings.weapons.find(x => x.uid === uid)
    return (
      w &&
      `AR ${w.bands.map(band).join('/')}${w.pool !== undefined ? ` · pool ${w.pool}` : ''}${w.dvBonus ? ` · DV +${w.dvBonus}` : ''}${edgeAt(w.bands)}${w.changes.length ? ` · ${w.changes.join(' · ')}` : ''}${w.ammo.length ? ` · loaded: ${w.ammo.join(' · ')}` : ''}${w.melee ? ` · ${w.melee}` : ''}`
    )
  }
  const u = d.unarmedDamage
  // ammunition's material (silver rounds: Bestial Nature p. 36) and, on an ammunition line, its ammunition types (CRB p. 261)
  const material = (x: Sr6Purchase) => {
    const name = (e => (e ? entryLabel(e) : (x.name ?? 'Custom item')))(entryOf(x, data))
    return (
      <>
        <MaterialPick x={x} name={name} />
        {x.kind === 'gear' && takesMaterial(x, data) && <Accessories host={x} name={name} kinds={['ammotypes']} filter={isAmmoType} ammo />}
      </>
    )
  }
  // an ammunition line's type: exactly one ammunition type fitted to it (none: Regular, x1), priced against the line (purchases.ts)
  const ammoTypes = [...c.entries.ammotypes.values()]
    .filter(e => isAmmoType(e) && e.id !== 'crb.ammo-regular')
    .sort((a, z) => entryLabel(a).localeCompare(entryLabel(z)))
  const ammoType = (x: Sr6Purchase) => {
    const name = (e => (e ? entryLabel(e) : (x.name ?? 'Ammunition')))(entryOf(x, data))
    const cur = x.accessories.find(a => isAmmoType(entryOf(a, data)))
    return (
      <label className="inline">
        Type{' '}
        <select
          aria-label={`${name} ammo type`}
          value={cur?.id ?? ''}
          // one atomic step: the engine replaces whatever type is on the line, so switching types can't stack multipliers
          onChange={e => act({ op: 'ammoType', host: x.uid, id: e.target.value || undefined })}
        >
          <option value="">Regular</option>
          {ammoTypes.map(t => (
            <option key={t.id} value={t.id}>
              {entryLabel(t)}
            </option>
          ))}
        </select>
        <MaterialPick x={x} name={name} />
      </label>
    )
  }
  // gear registered under one of the runner's identities: a commlink runs its persona (CRB p. 174), and licensed gear is
  // carried under the SIN that holds its licence. The picker lives on the gear line here, not on every SIN over on
  // Contacts; it only appears once the runner has an identity to assign to.
  const identity = (x: Sr6Purchase) => {
    const sins = ch.build.sins
    if (sins.length === 0) return null
    const name = (e => (e ? entryLabel(e) : (x.name ?? 'Item')))(entryOf(x, data))
    return (
      <label className="inline">
        Identity{' '}
        <select
          aria-label={`${name} identity`}
          value={x.sin ?? ''}
          onChange={e =>
            edit(b => {
              const p = b.purchases.find(p => p.uid === x.uid)
              if (!p) return
              if (e.target.value) p.sin = e.target.value
              else delete p.sin
            })
          }
        >
          <option value="">Unassigned</option>
          {sins.map(s => (
            <option key={s.uid} value={s.uid}>
              {sinName(s)}
            </option>
          ))}
        </select>
      </label>
    )
  }
  // an identity picker after a section's own per-line detail (weapons' AR, armor's Social, gear's material)
  const withIdentity =
    (base?: (x: Sr6Purchase) => ReactNode) =>
    (x: Sr6Purchase): ReactNode => (
      <>
        {base?.(x)}
        {identity(x)}
      </>
    )
  const close = () => {
    setCustom(false)
    setName('')
    setCost('')
    setAvail('')
    setErr(null)
  }
  const add = () => {
    const why = act({ op: 'purchase', kind, custom: { name: name.trim(), cost: Number(cost) || 0, avail: Number(avail) || 0, essence: 0 } })
    if (why) setErr(why)
    else close()
  }
  return (
    <div className="stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>Gear</h2>
        <span className="spacer" />
        <button className="btn small quiet" onClick={() => setCustom(true)}>
          Custom item…
        </button>
      </div>
      {!career && <StarterPacks />}
      <BuyItemDesign kind="weapon" />
      <PurchaseSection
        kind="weapons"
        title="Weapons"
        one="a weapon"
        offer={e => !isExplosive(e)}
        show={x => !isExplosive(entryOf(x, data))}
        detail={withIdentity(x => [ar(x.uid), ...statusesOf(entryOf(x, data)).map(s => `applies ${s}`)].filter(Boolean).join(' · '))}
        accessories={{ kinds: ACCESSORY_KINDS, filter: isAccessory }}
        hint={`Unarmed: AR ${d.attackRatings.unarmed}${u ? `, DV ${u.dv}${u.physical ? 'P' : 'S'}` : ''}${edgeAt([d.attackRatings.unarmed])}.`}
      />
      <PurchaseSection
        kind="weapons"
        title="Explosives and grenades"
        one="an explosive or grenade"
        offer={isExplosive}
        show={x => isExplosive(entryOf(x, data))}
        detail={withIdentity()}
      />
      <PurchaseSection
        kind="gear"
        title="Detonators and rockets"
        one="a detonator or rocket"
        offer={isExplosive}
        show={x => isExplosive(entryOf(x, data))}
        detail={withIdentity()}
      />
      <label className="inline">
        Target’s DR <input type="number" min={0} value={dr} aria-label="Target’s DR" onChange={e => setDr(e.target.value)} />{' '}
        <span className="muted">
          shows who gains Edge at each range band: + you, − the target (CRB p. 45
          {cr.get('stackingAdvantage')?.value === true ? '; Stacking Advantage, SWC p. 144' : ''})
        </span>
      </label>
      <PurchaseSection
        kind="armor"
        title="Armor"
        one="armor"
        accessories={{ kinds: ACCESSORY_KINDS, filter: isAccessory }}
        bonuses
        detail={withIdentity(x => social(entryOf(x, data)?.attrs.social))}
        hint={`Defense Rating ${d.defenseRating} and Social Rating ${d.socialRating} with the armor worn.`}
      />
      <PurchaseSection
        kind="electronics"
        title="Electronics"
        one="electronics"
        accessories={{ kinds: ACCESSORY_KINDS, filter: isAccessory }}
        bonuses
        detail={withIdentity()}
      />
      {/* Deck Builder: put Karma toward a cyberdeck/cyberhack here, by the deck, at 5,000¥ each (owner, 2026-10-25: on Gear,
          not Contacts). The gain is capped at what those cost, so "+1" is disabled once the deck is fully covered. */}
      {activeRules(ch.build, data).has('DECK_5000_PER_KARMA') &&
        (() => {
          const deckSpend = ch.build.purchases.filter(x => isDeckPart(entryOf(x, data))).reduce((t, x) => t + priced(x, data, cr).cost, 0)
          const covered = deckKarma(ch.build, data) * DECK_NUYEN_PER_KARMA >= deckSpend
          return (
            <p className="row">
              <button type="button" className="btn" disabled={covered} onClick={() => act({ op: 'karmaToDeck', delta: 1 })}>
                1 Karma → {n(DECK_NUYEN_PER_KARMA)}¥ for a cyberdeck
              </button>
              <button type="button" className="btn" disabled={ch.build.karmaToDeck <= 0} onClick={() => act({ op: 'karmaToDeck', delta: -1 })}>
                Take 1 back
              </button>
              <span aria-live="polite">{ch.build.karmaToDeck} karma put into a cyberdeck or cyberhack (Deck Builder)</span>
              <span className="muted">
                {n(DECK_NUYEN_PER_KARMA)}¥ a karma, toward cyberdecks and cyberhacks only{covered ? ' — the deck is covered' : ''}.
              </span>
            </p>
          )
        })()}
      <PurchaseSection kind="programs" title="Programs and autosofts" one="a program" />
      <PurchaseSection
        kind="gear"
        title="Other gear"
        one="other gear"
        offer={e => !isAmmoGear(e) && !isFocus(e) && !isExplosive(e)}
        show={x => !isAmmoGear(entryOf(x, data)) && !isFocus(entryOf(x, data)) && !isExplosive(entryOf(x, data))}
        accessories={{ kinds: ACCESSORY_KINDS, filter: isAccessory }}
        bonuses
        detail={withIdentity(material)}
      />
      <PurchaseSection kind="gear" title="Ammunition" one="ammunition" offer={isAmmoGear} show={x => isAmmoGear(entryOf(x, data))} detail={ammoType} />
      {/* legacy data: a standalone ammunition type bought on its own (an older save, before types were fitted to an ammo
          line). It has no base to price against, so it can only be removed here — new ammo is bought above. */}
      {(() => {
        const orphans = ch.build.purchases.filter(x => x.kind === 'ammotypes')
        return orphans.length === 0 ? null : (
          <section className="stack">
            <h3 style={{ margin: 0 }}>Loose ammunition types (from an older save)</h3>
            <p className="muted" style={{ margin: 0 }}>
              Buy ammo above instead; these aren’t priced. Remove any you don’t want.
            </p>
            {orphans.map(x => {
              const e = entryOf(x, data)
              const name = e ? entryLabel(e) : (x.name ?? 'Ammunition type')
              return (
                <div key={x.uid} className="row">
                  <span>{name}</span>
                  <span className="spacer" />
                  <button className="btn small quiet" aria-label={`Remove ${name}`} onClick={() => act({ op: 'purchase', remove: x.uid })}>
                    Remove
                  </button>
                </div>
              )
            })}
          </section>
        )
      })()}
      <Modal
        open={custom}
        onClose={close}
        title="Custom item"
        actions={
          <>
            <button className="btn" onClick={close}>
              Cancel
            </button>
            <button className="btn primary" disabled={!name.trim()} onClick={add}>
              Add item
            </button>
          </>
        }
      >
        <p className="muted">Something the catalog doesn’t have, at your own price (the GM checks it).</p>
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
        <div className="grid2">
          <label>
            Name <input value={name} onChange={e => setName(e.target.value)} />
          </label>
          <label>
            Kind{' '}
            <select value={kind} onChange={e => setKind(e.target.value as PurchaseKind)}>
              {CUSTOM_KINDS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cost <input type="number" min={0} value={cost} onChange={e => setCost(e.target.value)} />
          </label>
          <label>
            Availability <input type="number" min={0} value={avail} onChange={e => setAvail(e.target.value)} />
          </label>
        </div>
      </Modal>
    </div>
  )
}
