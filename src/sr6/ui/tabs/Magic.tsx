// Magic or Resonance (shown only for an awakened or emerged runner): a magician's tradition and drain attribute (R: S1
// has no traditions kind), spells and rituals against the free ones, adept powers with their levels and power points (a
// mystic adept buys its own), initiation and metamagics (one its text lets be taken again, by level); a technomancer's
// complex forms, submersion and echoes. What the runner's kind can't learn is offered too, marked (Review's errors
// magic.spellsAllowed, adept.ppBudget, magic.metamagicUser). A spell shows whether its test is opposed and
// whether its threshold counts Essence. Every pick can carry the player's bonuses.
import { useState } from 'react'
import { Modal, Picker, Stepper } from '../../../ui/bits'
import { flag, num, str } from '../../engine/creation'
import { noteAttr, noteSkill, powerCost, qualityChoice } from '../../engine/budgets'
import { MAGIC_KINDS, metamagicFits, pickMaxLevel, picksFor } from '../../engine/data'
import type { Sr6Entry } from '../../model/types'
import { pickFlags } from '../../print/view'
import { MAGIC_KIND_LABELS, type PickKind, type Sr6Build } from '../../model/character'
import { ATTR_NAMES, n, useSr6Editor } from '../editor'
import { Bonuses, House } from '../Picker'
import { cardOf, Sr6Ref } from '../EntryRef'
import { Suggest } from './Skills'

const article = (w: string) => (/^[aeiou]/i.test(w) ? 'An' : 'A')
const PICKS: [PickKind, string, string][] = [['spells', 'Spells', 'a spell'], ['rituals', 'Rituals', 'a ritual'], ['adeptpowers', 'Adept powers', 'an adept power'],
  ['metamagics', 'Metamagics', 'a metamagic'], ['complexforms', 'Complex forms', 'a complex form'], ['echoes', 'Echoes', 'an echo'],
  ['datastructures', 'Data structures', 'a data structure']]

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
      <div className="row"><h3 style={{ margin: 0 }}>{title}</h3>
        {!allowed[kind] && <span className="muted">{article(MAGIC_KIND_LABELS[b.magic])} {MAGIC_KIND_LABELS[b.magic].toLowerCase()} can’t learn these (CRB p. 67)</span>}
        <span className="spacer" />
        <button className="btn small" onClick={() => setAdding(kind)}>Add {one}…</button></div>
      {rows.length === 0 ? <p className="muted">None yet.</p> : <div className="scroll-x"><table className="data">
        <tbody>{rows.map(x => {
          const e = data.entry(kind, x.id), power = kind === 'adeptpowers' ? data.powers[x.id] : undefined, name = e?.name ?? x.name ?? x.id
          const max = pickMaxLevel(data, kind, x.id), want = qualityChoice(e?.name), levels = data.siblings(kind, x.id).map(s => data.levelOf(s)!)
          const chosen = want === 'attribute' ? noteAttr(x.note)?.toUpperCase() : want === 'skill' ? data.skills[noteSkill(data, x.note) ?? '']?.name : undefined
          return <tr key={x.uid}>
            <td><Sr6Ref kind={kind} id={e?.id}><b>{name}</b></Sr6Ref>{!e && <span className="err"> (no longer in the catalog)</span>}
              {e && <span className="muted"> {[e.attrs.category, ...pickFlags(e), e.source && `${e.source} p.${e.page}`].filter(Boolean).join(' · ')}</span>}
              {want && <div className="row"><input key={`${x.uid}:${x.note ?? ''}`} defaultValue={x.note ?? ''} maxLength={200} placeholder={`the ${want} it is for`}
                aria-label={`${name} note`} onBlur={ev => { if (ev.target.value.trim() !== (x.note ?? '')) act({ op: 'pickNote', uid: x.uid, note: ev.target.value }) }} />
                <span className={chosen ? 'muted small' : 'err small'}>{chosen ? `For ${chosen}` : `Name the ${want}`}</span></div>}
              <div><Bonuses uid={x.uid} name={name} bonuses={x.bonuses} rated={max !== null} /></div></td>
            <td>{max !== null ? <Stepper label={`${name} level`} value={x.level ?? 1} min={1} max={Number.isFinite(max) ? max : 99}
              onChange={level => act({ op: 'powerLevel', uid: x.uid, level })} />
              : levels.length > 1 && <Stepper label={`${name} level`} value={data.levelOf(e) ?? 1} min={levels[0]} max={levels.at(-1)!}
                onChange={level => act({ op: 'powerLevel', uid: x.uid, level })} />}</td>
            <td className="num">{power && (power.cost == null ? '? PP' : `${n(powerCost(data, x))} PP`)}</td>
            <td className="num"><button className="btn small quiet" onClick={() => act({ op: 'pick', remove: x.uid })}>Remove</button></td>
          </tr>
        })}</tbody>
      </table></div>}
    </section>
  }
  const taken = (kind: PickKind, id: string) => pickMaxLevel(data, kind, id) === null && !qualityChoice(data.entry(kind, id)?.name) && b.picks.some(x => x.kind === kind && x.id === id)
  // a metamagic for adepts only (or magicians only) is marked for a runner who may not take it
  const unfit = (e: Sr6Entry) => e.kind === 'metamagics' && !metamagicFits(b.magic, data.metamagics[e.id]?.user)
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
      {/* owner's decisions 5 and 12: the mentor spirit comes with its quality; a mystic adept picks one advantage */}
      {(k.spells || k.powers) && <div className="row">
        <label className="inline">Mentor spirit <select aria-label="Mentor spirit" value={b.mentorSpirit ?? ''} onChange={e => act({ op: 'mentor', id: e.target.value || null })}>
          <option value="">None</option>
          {[...c.entries.mentorspirits.values()].sort((a, z) => a.name.localeCompare(z.name)).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        {b.mentorSpirit && b.magic === 'mystic-adept' && (flag(cr, 'mentorBothAdvantages')
          ? <span className="muted">Both its magician’s and adept’s advantages (house rule)</span>
          : <label className="inline">Advantages <select aria-label="Mentor spirit advantages" value={b.mentorAdvantage ?? ''}
            onChange={e => act({ op: 'mentor', advantage: (e.target.value || null) as 'magician' | 'adept' | null })}>
            <option value="">Pick one</option><option value="magician">The magician’s</option><option value="adept">The adept’s</option></select></label>)}
        {b.mentorSpirit && str(cr, 'mentorSpiritQuality') && <span className="muted">with the {data.qualities[str(cr, 'mentorSpiritQuality')!]?.name ?? 'Mentor Spirit'} quality (Qualities tab)</span>}
      </div>}
      {(k.spells || k.powers) && grade('initiation', 'Initiation grade')}
      {k.resonance && grade('submersion', 'Submersion grade')}
      {/* (data structures, Hack & Slash pp. 70–72: only for a technomancer, or one a runner holds) */}
      {PICKS.filter(([kind]) => kind !== 'datastructures' || allowed.datastructures || b.picks.some(x => x.kind === kind)).map(section)}
      <Modal open={!!adding} onClose={() => setAdding(null)} title={`Add ${PICKS.find(p => p[0] === adding)?.[2] ?? ''}`}>
        {adding && <Picker placeholder="Search" onPick={pick}
          groups={[...new Set([...c.entries[adding].values()].map(e => e.attrs.category ?? ''))].filter(Boolean).sort()}
          items={[...c.entries[adding].values()].sort((a, z) => a.name.localeCompare(z.name)).map(e => {
            const power = adding === 'adeptpowers' ? data.powers[e.id] : undefined
            return { id: e.id, name: e.name, group: e.attrs.category, disabled: taken(adding, e.id), ...cardOf(c, adding, e.id),
              meta: [e.attrs.category, power && `${power.costCombat != null ? `${power.costCombat} PP (combat skill), ` : ''}${power.cost ?? '?'} PP${power.perLevel ? ` a level, up to ${power.maxLevel}` : ''}`, ...pickFlags(e),
                unfit(e) && `not for ${article(MAGIC_KIND_LABELS[b.magic]).toLowerCase()} ${MAGIC_KIND_LABELS[b.magic].toLowerCase()}`].filter(Boolean).join(', '),
              price: `${e.source} p.${e.page}`, search: `${e.source} p.${e.page} ${c.sources.get(e.source)?.name ?? ''}`, label: <House c={c} source={e.source} /> }
          })} />}
      </Modal>
    </div>
  )
}
