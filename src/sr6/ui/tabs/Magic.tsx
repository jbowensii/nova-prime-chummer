// Magic or Resonance (shown only for an awakened or emerged runner): a magician's tradition and drain attribute (R: S1
// has no traditions kind), spells and rituals against the free ones, adept powers with their levels and power points (a
// mystic adept buys its own), initiation and metamagics; a technomancer's complex forms, submersion and echoes. Every
// pick can carry the player's bonuses.
import { useState } from 'react'
import { Modal, Picker, Stepper } from '../../../ui/bits'
import { num } from '../../engine/creation'
import { MAGIC_KINDS, picksFor } from '../../engine/data'
import type { PickKind, Sr6Build } from '../../model/character'
import { ATTR_NAMES, n, useSr6Editor } from '../editor'
import { Bonuses } from '../Picker'
import { Suggest } from './Skills'

const PICKS: [PickKind, string, string][] = [['spells', 'Spells', 'a spell'], ['rituals', 'Rituals', 'a ritual'], ['adeptpowers', 'Adept powers', 'an adept power'],
  ['metamagics', 'Metamagics', 'a metamagic'], ['complexforms', 'Complex forms', 'a complex form'], ['echoes', 'Echoes', 'an echo']]

export function MagicTab() {
  const { ch, c, data, cr, budgets, act, edit } = useSr6Editor()
  const b = ch.build, k = MAGIC_KINDS[b.magic], allowed = picksFor(b.magic)
  const [adding, setAdding] = useState<PickKind | null>(null)
  const slots = budgets.spellSlots, pp = budgets.powerPoints
  const word = k.resonance ? 'complex forms' : 'spells'
  const karma = num(cr, k.resonance ? 'karmaForm' : 'karmaSpell')
  const grade = (key: 'initiation' | 'submersion', label: string) => <p className="row">{label}
    <Stepper label={label} value={b[key]} min={0} max={99} onChange={to => act({ op: key, delta: to - b[key] })} /></p>

  const section = ([kind, title, one]: (typeof PICKS)[number]) => {
    const rows = b.picks.filter(x => x.kind === kind)
    return <section key={kind} className="stack">
      <div className="row"><h3 style={{ margin: 0 }}>{title}</h3><span className="spacer" />
        <button className="btn small" onClick={() => setAdding(kind)}>Add {one}…</button></div>
      {rows.length === 0 ? <p className="muted">None yet.</p> : <div className="scroll-x"><table className="data">
        <tbody>{rows.map(x => {
          const e = data.entry(kind, x.id), power = kind === 'adeptpowers' ? data.powers[x.id] : undefined, name = e?.name ?? x.name ?? x.id
          return <tr key={x.uid}>
            <td><b>{name}</b>{!e && <span className="err"> (no longer in the catalog)</span>}
              {e && <span className="muted"> {[e.attrs.category, e.source && `${e.source} p.${e.page}`].filter(Boolean).join(' · ')}</span>}
              <div><Bonuses uid={x.uid} name={name} bonuses={x.bonuses} rated={!!power?.perLevel} /></div></td>
            <td>{power?.perLevel && <Stepper label={`${name} level`} value={x.level ?? 1} min={1} max={power.maxLevel}
              onChange={level => act({ op: 'powerLevel', uid: x.uid, level })} />}</td>
            <td className="num">{power && (power.cost == null ? '? PP' : `${n(power.cost * (power.perLevel ? x.level ?? 1 : 1))} PP`)}</td>
            <td className="num"><button className="btn small quiet" onClick={() => act({ op: 'pick', remove: x.uid })}>Remove</button></td>
          </tr>
        })}</tbody>
      </table></div>}
    </section>
  }
  const taken = (kind: PickKind, id: string) => kind !== 'adeptpowers' || !data.powers[id]?.perLevel ? b.picks.some(x => x.kind === kind && x.id === id) : false
  const pick = (id: string) => { if (adding && !act({ op: 'pick', kind: adding, id })) setAdding(null) }

  return (
    <div className="stack">
      <h2>{k.resonance ? 'Resonance' : 'Magic'}</h2>
      {(k.spells || k.resonance) && <p className="muted">
        Free {word}: <b className={slots.left < 0 ? 'err' : ''}>{n(slots.left)} left</b> of {n(slots.max)}.
        {karma !== undefined && ` Past the free ones, each costs ${karma} karma.`}</p>}
      {k.spells && <div className="row">
        <label className="inline">Tradition <Suggest label="Tradition" value={b.tradition ?? ''} options={[]}
          onCommit={t => edit((x: Sr6Build) => { if (t) x.tradition = t; else delete x.tradition })} /></label>
        <label className="inline">Drain attribute <select value={b.drainAttr ?? ''}
          onChange={e => edit(x => { if (e.target.value) x.drainAttr = e.target.value as Sr6Build['drainAttr']; else delete x.drainAttr })}>
          <option value="">Pick one</option>
          {(['log', 'int', 'cha'] as const).map(a => <option key={a} value={a}>{ATTR_NAMES[a]}</option>)}</select></label>
      </div>}
      {k.powers && <p className="muted">Power points: <b className={pp.left < 0 ? 'err' : ''}>{n(pp.left)} left</b> of {n(pp.max)}.</p>}
      {k.paysPowers && b.method !== 'pointbuy' && <p className="row">Power points bought
        <Stepper label="Power points bought" value={b.powerPointsBought} min={0} max={pp.cap} onChange={to => act({ op: 'powerPoints', delta: to - b.powerPointsBought })} />
        <span className="muted">at most {pp.cap}; each one lowers the free spells</span></p>}
      {(k.spells || k.powers) && grade('initiation', 'Initiation grade')}
      {k.resonance && grade('submersion', 'Submersion grade')}
      {PICKS.filter(([kind]) => allowed[kind] || b.picks.some(x => x.kind === kind)).map(section)}
      <Modal open={!!adding} onClose={() => setAdding(null)} title={`Add ${PICKS.find(p => p[0] === adding)?.[2] ?? ''}`}>
        {adding && <Picker placeholder="Search" onPick={pick}
          groups={[...new Set([...c.entries[adding].values()].map(e => e.attrs.category ?? ''))].filter(Boolean).sort()}
          items={[...c.entries[adding].values()].sort((a, z) => a.name.localeCompare(z.name)).map(e => {
            const power = adding === 'adeptpowers' ? data.powers[e.id] : undefined
            return { id: e.id, name: e.name, group: e.attrs.category, disabled: taken(adding, e.id),
              meta: [e.attrs.category, power && `${power.cost ?? '?'} PP${power.perLevel ? ` a level, up to ${power.maxLevel}` : ''}`].filter(Boolean).join(', '),
              price: `${e.source} p.${e.page}`, search: `${e.source} p.${e.page}` }
          })} />}
      </Modal>
    </div>
  )
}
