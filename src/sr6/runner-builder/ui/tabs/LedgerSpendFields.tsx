// Ledger: the per-operation fields of the Spend row (the target, the pick, the amounts each op asks for). One block per op, shown for the op chosen.
// Moved out of Ledger.tsx unchanged; the state lives in LedgerForm.ts.
import { GENDER_LIST, GenderList } from '../../../../core/ui-kit/bits'
import { attrRating, choiceOptions, diyAllowed, entryOf, powerCost, priced } from '../../domain/creation/budgets'
import { careerPowerPoints, stolenLeft } from '../../domain/career/career'
import { metamagicFits } from '../../../catalog/domain/data'
import { PET_CLASSES, SHIFT_KINDS, sinName } from '../../../formats/domain/character'
import { ATTR_NAMES, n } from '../editor'
import { ChoiceField } from '../Picker'
import { isAmmoGear, isAmmoType, stacks } from '../../../catalog/domain/categories'
import { Sr6Ref } from '../EntryRef'
import { entryLabel } from '../../../catalog/domain/categories'
import { styleName } from '../../domain/creation/martial'
import { gradeName, gradeOptions } from '../../domain/creation/grades'
import { CRITTER_CLASS_LABELS, trainedWhat } from '../../domain/assets/critters'
import { mountsOf, partsOf } from '../../domain/assets/vehiclemods'
import { packChoices } from '../Picker'
import { LEARN, SELLBACK, type LedgerForm } from './LedgerForm'

export function LedgerSpendFields({ L }: { L: LedgerForm }) {
  const {
    c,
    data,
    cr,
    p,
    choiceContext,
    b,
    kind,
    op,
    f,
    trainedIds,
    setTrainedIds,
    licences,
    setLicences,
    picked,
    setPicked,
    setPicking,
    set,
    kindDesigns,
    dropLabel,
    itemName,
    vehicles,
    critters,
    hosts,
    host,
    companion,
    trainable,
    attrs,
    skills,
    rank,
    kindName,
    an,
    initKind,
    awake,
    stolen,
    upgradable,
    licensable,
    sin,
    sellDefault,
  } = L
  return (
    <>
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
            {b.martialArts
              .slice()
              .sort((a, z) => styleName(data, a).localeCompare(styleName(data, z)))
              .map(m => (
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
            {upgradable
              .slice()
              .sort((a, z) => entryLabel(data.entry(a.kind, a.id!)!).localeCompare(entryLabel(data.entry(z.kind, z.id!)!)))
              .map(x => (
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
        op === 'vehicle' ||
        op === 'drone' ||
        op === 'martialart' ||
        (op === 'technique' && f.target) ||
        (op === 'upgrade' && f.target) ||
        op === 'critter' ||
        (op === 'derive' && f.target) ||
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
      {(op in LEARN || op === 'purchase' || op === 'quality') &&
        picked &&
        (() => {
          const co = choiceOptions(data, picked.e, choiceContext)
          const pp = picked.e.kind === 'adeptpowers' ? careerPowerPoints(b, data, cr, p) : null
          const cost = pp ? powerCost(data, { id: picked.e.id, note: f.note }) : null
          return (
            <>
              {co && (
                <label>
                  {co.kind === 'attribute' || co.kind === 'skill' ? `The ${co.kind} it is for` : 'Its choice'}
                  <ChoiceField co={co} value={f.note} label="Choice note" onChange={v => set({ note: v })} />
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
              .sort((a, z) => (data.qualities[a.id]?.name ?? '').localeCompare(data.qualities[z.id]?.name ?? ''))
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
      {(op === 'vehicle' || op === 'drone') && (
        <label>
          Custom (from your Designer)
          <select aria-label="Design" value={f.target} onChange={e => set({ target: e.target.value })}>
            <option value="">{kindDesigns.length ? 'Pick one' : `None yet: make one in the ${op === 'drone' ? 'Drone' : 'Vehicle'} designer`}</option>
            {kindDesigns.map(d => (
              <option key={d.id} value={d.id}>
                {d.identity.streetName || 'Unnamed design'}
              </option>
            ))}
          </select>{' '}
          <a href={op === 'drone' ? '#/sr6/drones' : '#/sr6/designs'}>Open the {op === 'drone' ? 'Drone' : 'Vehicle'} designer</a>
        </label>
      )}
      {(op === 'vehicle' || op === 'drone') && (
        <label>
          Price (¥, optional: GM adjusts, needs approval)
          <input
            aria-label="Adjusted price"
            type="number"
            min={0}
            step={100}
            value={f.price}
            onChange={e => set({ price: e.target.value })}
            style={{ width: '8rem' }}
          />
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
              {critters
                .slice()
                .sort((a, z) => itemName(a).localeCompare(itemName(z)))
                .map(x => (
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
              {critters
                .slice()
                .sort((a, z) => itemName(a).localeCompare(itemName(z)))
                .map(x => (
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
            {hosts
              .slice()
              .sort((a, z) => itemName(a).localeCompare(itemName(z)))
              .map(x => (
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
            {mountsOf(host, data)
              .slice()
              .sort((a, z) => a.name.localeCompare(z.name))
              .map(m => (
                <option key={m.uid} value={m.uid}>
                  {m.name}
                  {m.builtin ? ' (built in)' : ''}
                </option>
              ))}
          </select>
        </label>
      )}
      {op === 'purchase' && picked && isAmmoGear(picked.e) && (
        <label>
          Ammunition type
          <select aria-label="Ammunition type" value={f.ammo} onChange={e => set({ ammo: e.target.value })}>
            <option value="">Regular</option>
            {[...c.entries.ammotypes.values()]
              .filter(t => isAmmoType(t) && t.id !== 'crb.ammo-regular')
              .sort((a, z) => entryLabel(a).localeCompare(entryLabel(z)))
              .map(t => (
                <option key={t.id} value={t.id}>
                  {entryLabel(t)}
                </option>
              ))}
          </select>
        </label>
      )}
      {op === 'purchase' && picked && stacks(picked.e.kind, picked.e) && (
        <label>
          Quantity{isAmmoGear(picked.e) ? ' (printed units, e.g. 10 rounds each)' : ''}
          <input type="number" min={1} step={1} aria-label="Quantity" value={f.qty} onChange={e => set({ qty: e.target.value })} style={{ width: '6rem' }} />
        </label>
      )}
      {op === 'quantity' && (
        <>
          <label>
            Item
            <select value={f.target} onChange={ev => set({ target: ev.target.value, qty: String(b.purchases.find(x => x.uid === ev.target.value)?.qty ?? 1) })}>
              <option value="">Pick one</option>
              {b.purchases
                .filter(x => stacks(x.kind, entryOf(x, data)))
                .sort((a, z) => dropLabel(a).localeCompare(dropLabel(z)))
                .map(x => (
                  <option key={x.uid} value={x.uid}>
                    {dropLabel(x)} × {x.qty}
                  </option>
                ))}
            </select>
          </label>
          {f.target && (
            <label>
              New quantity
              <input
                type="number"
                min={1}
                step={1}
                aria-label="New quantity"
                value={f.qty}
                onChange={e => set({ qty: e.target.value })}
                style={{ width: '6rem' }}
              />
            </label>
          )}
        </>
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
              {vehicles
                .slice()
                .sort((a, z) => itemName(a).localeCompare(itemName(z)))
                .map(x => (
                  <option key={x.uid} value={x.uid}>
                    {itemName(x)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Two slots from
            <select aria-label="Shift from" value={f.from} onChange={e => set({ from: e.target.value })}>
              {SHIFT_KINDS.map(k => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label>
            One slot to
            <select aria-label="Shift to" value={f.to} onChange={e => set({ to: e.target.value })}>
              {SHIFT_KINDS.map(k => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {op === 'part' && (
        <>
          <label>
            Vehicle or drone
            <select aria-label="Part on" value={f.target} onChange={e => set({ target: e.target.value, name: '' })}>
              <option value="">Pick one</option>
              {vehicles
                .slice()
                .sort((a, z) => itemName(a).localeCompare(itemName(z)))
                .map(x => (
                  <option key={x.uid} value={x.uid}>
                    {itemName(x)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Factory part
            <select aria-label="Factory part" value={f.name} onChange={e => set({ name: e.target.value })}>
              <option value="">Pick one</option>
              {(v => (v ? partsOf(v, data) : []))(vehicles.find(x => x.uid === f.target))
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.origin === 'synth' ? ' (synthesized)' : ''} · {p.hook.replace(/^vehicle-/, '')} {n(p.cost)}
                    {p.removed ? ' (off: put back)' : ''}
                  </option>
                ))}
            </select>
          </label>
        </>
      )}
      {op === 'derive' && (
        <>
          <label>
            Vehicle or drone
            <select aria-label="Derive on" value={f.target} onChange={e => set({ target: e.target.value })}>
              <option value="">Pick one</option>
              {vehicles
                .slice()
                .sort((a, z) => itemName(a).localeCompare(itemName(z)))
                .map(x => (
                  <option key={x.uid} value={x.uid}>
                    {itemName(x)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Hook
            <select aria-label="Derived mod hook" value={f.hook} onChange={e => set({ hook: e.target.value })}>
              {['vehicle-body', 'vehicle-chassis', 'vehicle-powertrain', 'vehicle-electronics', 'vehicle-cf', 'vehicle-accessory', 'vehicle-hardpoint'].map(
                h => (
                  <option key={h}>{h}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Size
            <input aria-label="Derived mod size" size={5} value={f.size} onChange={e => set({ size: e.target.value })} />
          </label>
        </>
      )}
      {op === 'move' && (
        <>
          <label>
            Weapon
            <select aria-label="Weapon to move" value={f.target} onChange={e => set({ target: e.target.value, mount: '' })}>
              <option value="">Pick one</option>
              {vehicles
                .flatMap(x => x.accessories.filter(a => a.kind === 'weapons').map(a => ({ a, l: `${itemName(a)} on ${itemName(x)}` })))
                .sort((p, q) => p.l.localeCompare(q.l))
                .map(({ a, l }) => (
                  <option key={a.uid} value={a.uid}>
                    {l}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Into mount
            <select aria-label="Move to mount" value={f.mount} onChange={e => set({ mount: e.target.value })}>
              <option value="">Pick one</option>
              {(v => (v ? mountsOf(v, data) : []))(vehicles.find(x => x.accessories.some(a => a.uid === f.target)))
                .slice()
                .sort((a, z) => a.name.localeCompare(z.name))
                .map(m => (
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
            {hosts
              .flatMap(x => x.accessories.map(a => ({ a, l: `${itemName(a)} on ${itemName(x)}` })))
              .sort((p, q) => p.l.localeCompare(q.l))
              .map(({ a, l }) => (
                <option key={a.uid} value={a.uid}>
                  {l}
                </option>
              ))}
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
              {b.purchases
                .slice()
                .sort((a, z) => dropLabel(a).localeCompare(dropLabel(z)))
                .map(x => (
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
              {licensable
                .slice()
                .sort((a, z) => itemName(a).localeCompare(itemName(z)))
                .map(x => (
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
              {b.sins
                .map((s, i) => ({ s, l: sinName(s, `SIN ${i + 1}`) }))
                .sort((p, q) => p.l.localeCompare(q.l))
                .map(({ s, l }) => (
                  <option key={s.uid} value={s.uid}>
                    {l}
                  </option>
                ))}
            </select>
          </label>
        </>
      )}
      {/* (which SIN an owned line is registered to: free, any time; an item can be unassigned) */}
      {op === 'assign' && (
        <>
          <label>
            Item
            <select
              aria-label="Item to register"
              value={f.target}
              onChange={e =>
                set({ target: e.target.value, sin: b.purchases.flatMap(x => [x, ...x.accessories]).find(x => x.uid === e.target.value)?.sin ?? '' })
              }
            >
              <option value="">Pick one</option>
              {b.purchases
                .flatMap(x => [x, ...x.accessories])
                .sort((a, z) => itemName(a).localeCompare(itemName(z)))
                .map(x => (
                  <option key={x.uid} value={x.uid}>
                    {itemName(x)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Identity
            <select aria-label="Register to" value={f.sin} onChange={e => set({ sin: e.target.value })}>
              <option value="">Unassigned</option>
              {b.sins.map((s, i) => (
                <option key={s.uid} value={s.uid}>
                  {sinName(s, `SIN ${i + 1}`)}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {op === 'pack' && (
        <label>
          Pack
          <select value={f.target} onChange={e => set({ target: e.target.value })}>
            <option value="">Pick one</option>
            {packChoices(c.entries.packs.values())}
          </select>
        </label>
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
              {[...c.entries.lifestyles.values()]
                .sort((a, z) => a.name.localeCompare(z.name))
                .map(e => (
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
              {b.contacts
                .slice()
                .sort((a, z) => (a.name || 'Unnamed').localeCompare(z.name || 'Unnamed'))
                .map(x => (
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
    </>
  )
}
