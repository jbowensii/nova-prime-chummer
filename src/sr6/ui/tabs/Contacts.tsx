// Contacts & lifestyle: contacts (name, archetype, connection, loyalty) against the contact points; SINs, real or fake
// with a rating and an optional gender, each with its licences and its lifestyles (and their months); karma turned into nuyen.
// A placeholder SIN (an older file's lifestyle with no SIN) shows as Unnamed SIN until named or given a kind. Once
// finalized the tab is read only: SINs and lifestyles are bought on the Ledger tab.
import { useState, type ReactNode } from 'react'
import { GENDER_LIST, GenderList, Stepper } from '../../../ui/bits'
import { NameField } from '../../../ui/tabs/Skills'
import { num } from '../../engine/creation'
import { bookValue, dataFind } from '../../engine/values'
import { CONTACT_TYPES, sinName, type ContactType, type Sr6Sin } from '../../model/character'
import { n, sr6EditHref, useSr6Editor } from '../editor'
import { Sr6Ref } from '../EntryRef'
import { Suggest } from './Skills'

export function ContactsTab() {
  const { ch, c, data, cr, budgets, act, career } = useSr6Editor()
  const b = ch.build, cp = budgets.contactPoints
  const archetypes = [...c.entries.contacts.values()].map(e => e.name).sort()
  const lifestyles = [...c.entries.lifestyles.values()].sort((a, z) => a.name.localeCompare(z.name)).map(l => {
    const v = bookValue(l, 'cost', undefined, dataFind(data)).n
    return <option key={l.id} value={l.id}>{l.name} ({v === null ? '?' : `${n(v)}¥`} a month)</option>
  })
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
            <td data-label="Archetype"><Sr6Ref kind="contacts" id={[...c.entries.contacts.values()].find(e => e.name === x.archetype)?.id} tabbable={false}>
              <Suggest label={`${who} archetype`} value={x.archetype} options={archetypes} onCommit={v => act({ op: 'contact', uid: x.uid, archetype: v ?? '' })} /></Sr6Ref></td>
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
      <h2>SINs, licences and lifestyles</h2>
      {career ? <p className="muted">Finalized: buy a SIN, a lifestyle or more months of one on the <a href={sr6EditHref(ch.id, 'ledger')}>Ledger tab</a>.</p>
        : !b.sins.length && <p className="muted">A lifestyle is paid under a SIN: add one first.</p>}
      {b.sins.map((s, i) => <Sin key={s.uid} s={s} who={`SIN ${i + 1}`} lifestyles={lifestyles} />)}
      <GenderList />
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

function Sin({ s, who, lifestyles }: { s: Sr6Sin; who: string; lifestyles: ReactNode[] }) {
  const { act, data } = useSr6Editor()
  const [name, setName] = useState(''), [rating, setRating] = useState('1')
  const add = () => { if (name.trim() && !act({ op: 'licence', sin: s.uid, name: name.trim(), rating: Number(rating) || 1 })) { setName(''); setRating('1') } }
  return <section className="stack">
    <div className="row">
      <NameField label={`${who} name`} value={s.name} onCommit={v => act({ op: 'sin', uid: s.uid, name: v })} />
      {s.placeholder ? <>
        <span className="noncanon">{sinName(s)} (placeholder)</span>
        <select aria-label={`${who} kind`} value="" onChange={e => e.target.value && act({ op: 'sin', uid: s.uid, kind: e.target.value as Sr6Sin['kind'] })}>
          <option value="">Make it…</option><option value="real">a real SIN</option><option value="fake">a fake SIN</option></select>
      </> : <span className="noncanon">{s.kind === 'real' ? 'Real SIN' : 'Fake SIN'}</span>}
      {s.kind === 'fake' && <span className="row">Rating <Stepper label={`${who} rating`} value={s.rating ?? 1} min={1} max={99}
        onChange={r => act({ op: 'sin', uid: s.uid, rating: r })} /></span>}
      <label className="inline">Gender <input value={s.gender ?? ''} aria-label={`${who} gender`} placeholder="optional" list={GENDER_LIST} style={{ width: '9rem' }}
        onChange={e => act({ op: 'sin', uid: s.uid, gender: e.target.value })} /></label>
      <span className="spacer" />
      <button className="btn small quiet" aria-label={`Remove ${sinName(s, who)}`} onClick={() => act({ op: 'sin', remove: s.uid })}>Remove</button>
    </div>
    <div className="row">
      {s.licences.map((l, i) => <span key={i} className="chip">{l.name} ({l.rating})
        <button aria-label={`Remove licence ${l.name}`} onClick={() => act({ op: 'licence', sin: s.uid, remove: i })}>×</button></span>)}
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Licence" aria-label={`${who} new licence`} onKeyDown={e => e.key === 'Enter' && add()} />
      <input type="number" min={1} value={rating} onChange={e => setRating(e.target.value)} aria-label={`${who} licence rating`} style={{ width: '4.5rem' }} />
      <button className="btn small" aria-label={`Add licence to ${who}`} disabled={!name.trim()} onClick={add}>Add licence</button>
    </div>
    {(s.lifestyles ?? []).map((l, i) => <div key={l.uid} className="row">
      <Sr6Ref kind="lifestyles" id={l.id} tabbable={false}><select aria-label={`${who} lifestyle ${i + 1}`} value={l.id} onChange={e => act({ op: 'lifestyle', sin: s.uid, uid: l.uid, id: e.target.value })}>
        {lifestyles}
        {!data.entry('lifestyles', l.id) && <option value={l.id}>{l.id} (no longer in the catalog)</option>}
      </select></Sr6Ref>
      <span className="row">Months <Stepper label={`${who} lifestyle ${i + 1} months`} value={l.months} min={1} max={999}
        onChange={months => act({ op: 'lifestyle', sin: s.uid, uid: l.uid, months })} /></span>
      <button className="btn small quiet" aria-label={`Remove ${who} lifestyle ${i + 1}`} onClick={() => act({ op: 'lifestyle', sin: s.uid, remove: l.uid })}>Remove</button>
    </div>)}
    <div className="row">
      <select aria-label={`Add a lifestyle to ${who}`} value="" onChange={e => e.target.value && act({ op: 'lifestyle', sin: s.uid, id: e.target.value })}>
        <option value="">Add a lifestyle…</option>{lifestyles}
      </select>
    </div>
  </section>
}
