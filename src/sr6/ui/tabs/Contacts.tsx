// Contacts & lifestyle: contacts (name, archetype, connection, loyalty) against the contact points; the lifestyle and
// its months; SINs, real or fake with a rating, each with its licences; karma turned into nuyen.
import { useState } from 'react'
import { Stepper } from '../../../ui/bits'
import { NameField } from '../../../ui/tabs/Skills'
import { num } from '../../engine/creation'
import { rated } from '../../engine/values'
import { CONTACT_TYPES, type ContactType, type Sr6Sin } from '../../model/character'
import { n, useSr6Editor } from '../editor'
import { Suggest } from './Skills'

export function ContactsTab() {
  const { ch, c, data, cr, budgets, act } = useSr6Editor()
  const b = ch.build, cp = budgets.contactPoints
  const archetypes = [...c.entries.contacts.values()].map(e => e.name).sort()
  const lifestyles = [...c.entries.lifestyles.values()].sort((a, z) => a.name.localeCompare(z.name))
  const rate = num(cr, 'karmaToNuyenRate'), most = num(cr, 'karmaToNuyenMax')
  // lifepath's contact points go by contact type (the Sixth World Companion)
  const typed = b.method === 'lifepath'
  const setType = (uid: string, types: (ContactType | '')[], i: number, v: string) => {
    const next = [...types]; next[i] = v as ContactType
    act({ op: 'contact', uid, types: next.filter((t): t is ContactType => !!t) })
  }
  return (
    <div className="stack">
      <h2>Contacts</h2>
      <p className="muted">Contact points: <b className={cp.left < 0 ? 'err' : ''}>{n(cp.left)} left</b> of {n(cp.max)}.
        {cp.ratingCap > 0 && ` Connection and loyalty go up to ${cp.ratingCap}.`}
        {typed && ' Each life module’s points go to contacts of its types.'}
        {!!cp.karma && <> Ratings past the points: <b>{n(cp.karma)} karma</b>.</>}</p>
      {b.contacts.length > 0 && <div className="contacts-wrap"><table className="data contacts">
        <thead><tr><th>Name</th><th>Archetype</th>{typed && <th>Types</th>}<th>Connection</th><th>Loyalty</th><th /></tr></thead>
        <tbody>{b.contacts.map((x, i) => {
          const who = `Contact ${i + 1}`
          return <tr key={x.uid}>
            <td data-label="Name"><NameField label={`${who} name`} value={x.name} onCommit={name => act({ op: 'contact', uid: x.uid, name })} /></td>
            <td data-label="Archetype"><Suggest label={`${who} archetype`} value={x.archetype} options={archetypes} onCommit={v => act({ op: 'contact', uid: x.uid, archetype: v ?? '' })} /></td>
            {typed && <td data-label="Types"><div className="types">{[0, 1].map(i => <select key={i} aria-label={`${who} type ${i + 1}`} value={x.types?.[i] ?? ''}
              disabled={i === 1 && !x.types?.length} onChange={e => setType(x.uid, [x.types?.[0] ?? '', x.types?.[1] ?? ''], i, e.target.value)}>
              <option value="">{i ? 'No second type' : 'Any type'}</option>
              {CONTACT_TYPES.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
            </select>)}</div></td>}
            {(['connection', 'loyalty'] as const).map(k => <td key={k} data-label={k[0].toUpperCase() + k.slice(1)}><Stepper label={`${who} ${k}`} value={x[k]} min={1} max={99}
              onChange={v => act({ op: 'contact', uid: x.uid, [k]: v })} /></td>)}
            <td className="end"><button className="btn small quiet" aria-label={`Remove ${x.name || who}`} onClick={() => act({ op: 'contact', remove: x.uid })}>Remove</button></td>
          </tr>
        })}</tbody>
      </table></div>}
      <div className="row"><button className="btn" onClick={() => act({ op: 'contact' })}>Add a contact</button></div>

      <hr className="sep" />
      <h2>Lifestyle</h2>
      <div className="row">
        <label className="inline">Lifestyle <select aria-label="Lifestyle" value={b.lifestyle?.id ?? ''}
          onChange={e => act({ op: 'lifestyle', id: e.target.value || null, months: b.lifestyle?.months })}>
          <option value="">None</option>
          {lifestyles.map(l => <option key={l.id} value={l.id}>{l.name} ({rated(l.attrs.cost).n === null ? '?' : `${n(rated(l.attrs.cost).n!)}¥`} a month)</option>)}
          {b.lifestyle && !data.entry('lifestyles', b.lifestyle.id) && <option value={b.lifestyle.id}>{b.lifestyle.id} (no longer in the catalog)</option>}
        </select></label>
        {b.lifestyle && <span className="row">Months <Stepper label="Lifestyle months" value={b.lifestyle.months} min={1} max={999}
          onChange={months => act({ op: 'lifestyle', id: b.lifestyle!.id, months })} /></span>}
      </div>

      <hr className="sep" />
      <h2>SINs and licences</h2>
      {b.sins.map((s, i) => <Sin key={s.uid} s={s} who={`SIN ${i + 1}`} />)}
      <div className="row">
        <button className="btn" onClick={() => act({ op: 'sin', kind: 'fake' })}>Add a SIN</button>
        <button className="btn quiet" onClick={() => act({ op: 'sin', kind: 'real' })}>Add a real SIN</button>
      </div>

      <hr className="sep" />
      <h2>Karma to nuyen</h2>
      <p className="row">Karma turned into nuyen
        <Stepper label="Karma turned into nuyen" value={b.karmaToNuyen} min={0} max={most ?? 999} onChange={to => act({ op: 'karmaToNuyen', delta: to - b.karmaToNuyen })} />
        <span className="muted">{rate !== undefined ? `${n(rate)}¥ each` : 'The rate isn’t set: Table setup → Creation rules.'}{most !== undefined && `, at most ${most}`}</span></p>
    </div>
  )
}

function Sin({ s, who }: { s: Sr6Sin; who: string }) {
  const { act } = useSr6Editor()
  const [name, setName] = useState(''), [rating, setRating] = useState('1')
  const add = () => { if (name.trim() && !act({ op: 'licence', sin: s.uid, name: name.trim(), rating: Number(rating) || 1 })) { setName(''); setRating('1') } }
  return <section className="stack">
    <div className="row">
      <NameField label={`${who} name`} value={s.name} onCommit={v => act({ op: 'sin', uid: s.uid, name: v })} />
      <span className="noncanon">{s.kind === 'real' ? 'Real SIN' : 'Fake SIN'}</span>
      {s.kind === 'fake' && <span className="row">Rating <Stepper label={`${who} rating`} value={s.rating ?? 1} min={1} max={99}
        onChange={r => act({ op: 'sin', uid: s.uid, rating: r })} /></span>}
      <span className="spacer" />
      <button className="btn small quiet" aria-label={`Remove ${s.name || who}`} onClick={() => act({ op: 'sin', remove: s.uid })}>Remove</button>
    </div>
    <div className="row">
      {s.licences.map((l, i) => <span key={i} className="chip">{l.name} ({l.rating})
        <button aria-label={`Remove licence ${l.name}`} onClick={() => act({ op: 'licence', sin: s.uid, remove: i })}>×</button></span>)}
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Licence" aria-label={`${who} new licence`} onKeyDown={e => e.key === 'Enter' && add()} />
      <input type="number" min={1} value={rating} onChange={e => setRating(e.target.value)} aria-label={`${who} licence rating`} style={{ width: '4.5rem' }} />
      <button className="btn small" aria-label={`Add licence to ${who}`} disabled={!name.trim()} onClick={add}>Add licence</button>
    </div>
  </section>
}
