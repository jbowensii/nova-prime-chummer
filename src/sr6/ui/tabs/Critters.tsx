// Critters (owner 2026-10-16, BUILDER Q9-Q10: its own tab beside Vehicles and Drones): each owned critter with its stat
// block, its powers (innate, 0 Karma), the pet class the player picks (Awakened or Emerged from its own Magic or
// Resonance), tamed or bought, how its Wild Life p. 180 price works out, its named commands and special training (the
// book's lists, pp. 181-183: with the purchase or taught later) against their limits, its companion qualities (with the purchase, from taming, or bonded with the runner's Karma), its critterware and
// gear (the critter-only catalog shown here) and its Essence and Magic (src/sr6/engine/critters.ts). Every step undoes;
// past a limit is a Review warning, never refused. After finalising the tab is read only: the Ledger buys a critter,
// fits critterware or gear, and bonds a quality.
import { useState } from 'react'
import { Stepper } from '../../../ui/bits'
import { priced } from '../../engine/budgets'
import { bondKarma, CRITTER_CLASS_LABELS, critterView, isCritterQuality, isTaught, TRAINED_LABELS, trainedName, trainedWhat } from '../../engine/critters'
import { NPC_STATS } from '../../engine/npc'
import { PET_CLASSES, type PetClass, type Sr6CritterQuality, type Sr6CritterTrained, type Sr6Purchase } from '../../model/character'
import type { Sr6Entry } from '../../model/types'
import { n, useSr6Editor } from '../editor'
import { Sr6Ref } from '../EntryRef'
import { CatalogPicker, PurchaseSection } from '../Picker'

/** What a critter wears or has implanted: augmentations (critterware too), gear and electronics, never a row of the
 *  Purchasing a Critter table or a companion quality. */
export const critterWearable = (e: Sr6Entry) => !/^CRITTERWARE\/(PURCHASE|QUALITY)$/i.test(e.attrs.class ?? '')
const STATS = new Set(['bod', 'agi', 'rea', 'str', 'wil', 'log', 'int', 'cha', 'edg', 'ess', 'mag', 'res'])
const HOW: Record<string, string> = { '': 'with the purchase', tamed: 'from taming', bonded: 'bonded: your Karma' }
type Adding = '' | 'purchase' | 'tamed' | 'bonded'
const ADDING: Record<Exclude<Adding, ''>, string> = {
  purchase: 'a quality with the purchase',
  tamed: 'a negative quality from taming',
  bonded: 'a quality by the bond (your Karma)',
}

export function CrittersTab() {
  const { career } = useSr6Editor()
  return (
    <div className="stack">
      <h2>Critters</h2>
      <PurchaseSection
        kind="critters"
        title="Critters"
        one="a critter"
        hint={
          career
            ? 'After finalising: buy a critter, teach it a command or special training, fit critterware or gear, or bond a quality on the Ledger.'
            : 'Bought at Wild Life’s prices (p. 180), or tamed from the wild (p. 184). Its critter powers are innate: 0 Karma. Commands and special training bought with it add 1 to its Body in the price each (p. 183); taught later, +500¥ or +750¥ (p. 180).'
        }
        accessories={{ kinds: ['augmentations', 'gear', 'electronics'], filter: critterWearable, critter: true }}
        detail={x => <Critter x={x} />}
      />
    </div>
  )
}

/** One owned critter's panel under its line. */
function Critter({ x }: { x: Sr6Purchase }) {
  const { data, cr, act } = useSr6Editor()
  const [adding, setAdding] = useState<Adding>('')
  const [teaching, setTeaching] = useState<'' | Sr6CritterTrained['what']>('')
  const v = critterView(x, data, priced(x, data, cr).essence),
    name = v.name,
    a = v.e?.attrs ?? {}
  const fixed = v.price.cls === 'awakened' || v.price.cls === 'emerged'
  const qname = (q: Sr6CritterQuality) => data.qualities[q.id]?.name ?? q.name ?? q.id
  const qs = x.critterQualities ?? [],
    bond = bondKarma(x, data)
  return (
    <div className="stack" aria-label={`Critter ${name}`} style={{ gap: '0.25rem' }}>
      <span>
        {NPC_STATS.filter(([k]) => STATS.has(k) && a[k])
          .map(([k, l]) => `${l} ${a[k]}`)
          .join(' · ')}
      </span>
      {v.powers && <span>Powers (innate, 0 Karma): {v.powers}</span>}
      {v.weaknesses && <span>Weaknesses: {v.weaknesses}</span>}
      <span className="row">
        <label className="inline">
          Class{' '}
          <select
            aria-label={`${name} class`}
            value={fixed ? v.price.cls : (x.pet ?? 'mundane')}
            disabled={fixed}
            onChange={ev => act({ op: 'critter', uid: x.uid, pet: ev.target.value as PetClass })}
          >
            {fixed ? (
              <option value={v.price.cls}>
                {CRITTER_CLASS_LABELS[v.price.cls]} (its {v.price.cls === 'awakened' ? 'Magic' : 'Resonance'})
              </option>
            ) : (
              PET_CLASSES.map(p => (
                <option key={p} value={p}>
                  {CRITTER_CLASS_LABELS[p]}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="inline">
          <input
            type="checkbox"
            aria-label={`${name} tamed`}
            checked={!!x.tamed}
            onChange={ev => act({ op: 'critter', uid: x.uid, tamed: ev.target.checked })}
          />{' '}
          Tamed from the wild (no price; Wild Soul and a negative quality, Wild Life p. 184)
        </label>
      </span>
      <span className={v.price.ok ? 'muted' : 'warn'} aria-label={`${name} price`}>
        {[...v.price.parts, ...v.price.notes].join(' · ')} · Availability {n(v.price.avail)}
        {v.price.legal ? `(${v.price.legal})` : ''}
      </span>
      {(['command', 'training'] as const).map(w => {
        const lim = w === 'command' ? v.commands : v.training,
          label = w === 'command' ? 'Commands' : 'Special training'
        return (
          <span key={w} className="row">
            {label}{' '}
            <span className={lim.n > lim.max ? 'warn' : undefined}>
              {lim.n} of {lim.max} ({w === 'command' ? 'Logic' : 'Intuition'} × 2)
            </span>
            {(x.trained ?? [])
              .filter(t => t.what === w)
              .map(t => (
                <span key={t.uid} className="chip">
                  {t.id ? (
                    <Sr6Ref kind="actions" id={t.id}>
                      {trainedName(t, data)}
                    </Sr6Ref>
                  ) : (
                    trainedName(t, data)
                  )}{' '}
                  <select
                    aria-label={`${trainedName(t, data)} on ${name}: when`}
                    value={isTaught(x, t) ? 'taught' : 'purchase'}
                    disabled={!!x.tamed}
                    onChange={ev => act({ op: 'critterTrained', host: x.uid, uid: t.uid, taught: ev.target.value === 'taught' })}
                  >
                    <option value="purchase">with the purchase</option>
                    <option value="taught">taught later</option>
                  </select>
                  <button aria-label={`Remove ${trainedName(t, data)} from ${name}`} onClick={() => act({ op: 'critterTrained', host: x.uid, remove: t.uid })}>
                    ×
                  </button>
                </span>
              ))}
            <button className="btn small quiet" aria-label={`Add a ${TRAINED_LABELS[w]} to ${name}`} onClick={() => setTeaching(w)}>
              {w === 'command' ? 'Command…' : 'Special training…'}
            </button>
          </span>
        )
      })}
      <span>
        Companion qualities (Wild Life pp. 184-186; {qs.filter(q => !q.how).length} of 6 with the purchase)
        {bond > 0 && ` · the bond: ${bond} Karma`}
      </span>
      <span className="row">
        {qs.map(q => (
          <span key={q.uid} className="chip">
            <Sr6Ref kind="qualities" id={q.id}>
              {qname(q)}
            </Sr6Ref>
            {data.qualities[q.id]?.perLevel && (
              <Stepper
                label={`${qname(q)} on ${name}: level`}
                value={q.level}
                min={1}
                max={99}
                onChange={l => act({ op: 'critterQuality', host: x.uid, uid: q.uid, level: l })}
              />
            )}{' '}
            <span className="muted">{HOW[q.how ?? '']}</span>
            <button aria-label={`Remove ${qname(q)} from ${name}`} onClick={() => act({ op: 'critterQuality', host: x.uid, remove: q.uid })}>
              ×
            </button>
          </span>
        ))}
        {(x.tamed ? (['tamed', 'bonded'] as const) : (['purchase', 'bonded'] as const)).map(k => (
          <button key={k} className="btn small quiet" aria-label={`Add ${ADDING[k]} to ${name}`} onClick={() => setAdding(k)}>
            {k === 'purchase' ? 'With the purchase…' : k === 'tamed' ? 'From taming…' : 'By the bond…'}
          </button>
        ))}
      </span>
      <span>
        Essence {n(v.essence.base)}
        {v.essence.left !== v.essence.base && ` → ${n(v.essence.left)} (its augmentations)`}
        {v.magic && ` · Magic ${v.magic.base}${v.magic.now !== v.magic.base ? ` → ${v.magic.now}` : ''}`}
        {v.resonance && ` · Resonance ${v.resonance.base}${v.resonance.now !== v.resonance.base ? ` → ${v.resonance.now}` : ''}`}
      </span>
      {teaching && (
        <CatalogPicker
          title={`Add a ${TRAINED_LABELS[teaching]} to ${name}`}
          open
          onClose={() => setTeaching('')}
          kinds={['actions']}
          filter={e => trainedWhat(e) === teaching}
          onAdd={p => act({ op: 'critterTrained', host: x.uid, id: p.e.id })}
        />
      )}
      {adding && (
        <CatalogPicker
          critter
          title={`Add ${ADDING[adding]} to ${name}`}
          open
          onClose={() => setAdding('')}
          kinds={['qualities']}
          filter={e => isCritterQuality(e) && (adding !== 'tamed' || data.qualities[e.id]?.positive === false)}
          onAdd={p => act({ op: 'critterQuality', host: x.uid, id: p.e.id, ...(adding === 'purchase' ? {} : { how: adding }) })}
        />
      )}
    </div>
  )
}
