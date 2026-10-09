// Creation method: the method (one whose settings aren't set can't be picked and says what's missing), then what the
// method asks for: the priority letters (sum to ten: their running total against the target), point buy's character
// points, lifepath's modules, the karma build's pool; then the metatype and magic kind the method allows.
import { CORE_ATTRS, CP_POOLS, LETTERS, MAGIC_KIND_LABELS, PRIORITY_COLUMNS, SR6_METHOD_LABELS, SR6_METHODS, type CpPool, type Letter, type MagicKind, type PriorityColumn, type Sr6Method } from '../../model/character'
import { setMagic, setMetatype, setMethod, setPriority } from '../../engine/actions'
import { num } from '../../engine/creation'
import type { Grant, Sr6LifeModuleView, Sr6PriorityRow } from '../../engine/data'
import { Stepper } from '../../../ui/bits'
import { missingLabels, MissingList } from '../Runners'
import { ATTR_NAMES, n, useSr6Editor } from '../editor'
import type { Sr6Attr } from '../../model/character'

const COLUMN_LABELS: Record<PriorityColumn, string> = { metatype: 'Metatype', attributes: 'Attributes', magic: 'Magic or Resonance', skills: 'Skills', resources: 'Resources' }
const CP_LABELS: Record<CpPool, string> = { attribute: 'Attribute points', skill: 'Skill points', adjustment: 'Adjustment points', resources: 'Nuyen',
  powerPoints: 'Power points', spells: 'Spells', complexForms: 'Complex forms' }
const GRANT_WORDS: Record<Grant, string> = { attributePoints: 'attribute points', skillPoints: 'skill points', adjustmentPoints: 'adjustment points',
  nuyen: '¥', contactPoints: 'contact points', knowledgeSkills: 'knowledge skills' }

export function MethodTab() {
  const { ch, data, cr, p, budgets, update, act } = useSr6Editor()
  const b = ch.build
  const missing = Object.fromEntries(SR6_METHODS.map(m => [m, m === b.method ? [] : missingLabels(m, cr, data)])) as Record<Sr6Method, string[]>
  const letters = b.method === 'priority' || b.method === 'sumtoten'
  const metatypes = p.legalMetatypes(b), magic = p.legalMagic(b)
  const magicSkills = Object.values(data.skills).filter(s => s.attr === 'mag')

  return (
    <div className="stack">
      <h2>Creation method</h2>
      <p className="muted">How the runner is built. Switching keeps the spends that still mean something.</p>
      <label>Method
        <select value={b.method} onChange={e => update(d => setMethod(d, e.target.value as Sr6Method, data, cr))}>
          {SR6_METHODS.map(m => <option key={m} value={m} disabled={missing[m].length > 0}>
            {SR6_METHOD_LABELS[m]}{missing[m].length ? ` (needs ${missing[m].length} ${missing[m].length === 1 ? 'setting' : 'settings'})` : ''}</option>)}
        </select></label>
      <MissingList missing={missing} />

      {letters && <Letters />}
      {b.method === 'pointbuy' && <section className="stack">
        <h3>Character points</h3>
        {budgets.characterPoints && <p className={budgets.characterPoints.left < 0 ? 'err' : 'muted'}>
          {n(budgets.characterPoints.left)} left of {n(budgets.characterPoints.max)}. Every point has to be spent.</p>}
        <div className="scroll-x"><table className="data">
          <thead><tr><th>Spent on</th><th>Character points</th></tr></thead>
          <tbody>{CP_POOLS.map(k => <tr key={k}><td>{CP_LABELS[k]}</td>
            <td><Stepper label={CP_LABELS[k]} value={b.cp[k]} min={0} max={999} onChange={to => act({ op: 'cp', pool: k, delta: to - b.cp[k] })} /></td></tr>)}</tbody>
        </table></div>
      </section>}
      {b.method === 'karma' && <p>The karma build has no point pools: everything is bought with the {n(p.startingKarma())} karma it starts with.</p>}
      {b.method === 'lifepath' && <LifeModules />}

      <h3>Metatype</h3>
      <label>Metatype
        <select aria-label="Metatype" value={b.metatype} onChange={e => update(d => setMetatype(d, e.target.value, data))}>
          <option value="">None yet</option>
          {metatypes.map(m => <option key={m.id} value={m.id}>{m.name}{m.adjustmentPoints ? ` (${m.adjustmentPoints} adjustment points)` : ''}</option>)}
        </select></label>
      {letters && !b.priorities.metatype && <p className="muted">Give Metatype a letter to see which metatypes it allows.</p>}

      <h3>Magic or Resonance</h3>
      <label>Kind
        <select aria-label="Magic kind" value={b.magic} onChange={e => update(d => setMagic(d, e.target.value as MagicKind, data, cr))}>
          {magic.map(m => <option key={m.kind} value={m.kind}>{MAGIC_KIND_LABELS[m.kind]}{m.rating ? ` (rating ${m.rating})` : ''}{m.cp ? `, ${m.cp} character points` : ''}</option>)}
        </select></label>
      {b.magic === 'aspected' && <label>Aspected skill
        <select value={b.aspectedSkill ?? ''} onChange={e => update(d => setMagic(d, 'aspected', data, cr, e.target.value))}>
          <option value="">Pick one</option>
          {magicSkills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>}
    </div>
  )
}

function Letters() {
  const { ch, data, cr, update } = useSr6Editor()
  const b = ch.build, target = num(cr, 'sumToTenTarget')
  const total = PRIORITY_COLUMNS.reduce((s, k) => s + (b.priorities[k] ? num(cr, `letterValue:${b.priorities[k]}`) ?? 0 : 0), 0)
  const gives = (col: PriorityColumn, row?: Sr6PriorityRow) => !row ? '' : col === 'attributes' ? `${row.attributes} points`
    : col === 'skills' ? `${row.skills} points` : col === 'resources' ? `${n(row.nuyen)}¥`
    : col === 'metatype' ? Object.entries(row.metatypes).map(([id, pts]) => `${data.metatypes[id]?.name ?? id} (${pts} adjustment points)`).join(', ')
    : Object.entries(row.magic).map(([k, r]) => `${MAGIC_KIND_LABELS[k as MagicKind]}${r ? ` ${r}` : ''}`).join(', ')
  return <section className="stack">
    <h3>Priorities</h3>
    <p className="muted">{b.method === 'priority' ? 'Give each column a different letter, A to E.'
      : <>The letters’ values add up to <b className={target !== undefined && total > target ? 'err' : ''}>{total}</b> of {target ?? '?'}.</>}</p>
    <div className="scroll-x"><table className="data">
      <thead><tr><th>Column</th><th>Letter</th><th>Gives</th></tr></thead>
      <tbody>{PRIORITY_COLUMNS.map(col => <tr key={col}>
        <td>{COLUMN_LABELS[col]}</td>
        <td><select aria-label={`${COLUMN_LABELS[col]} priority`} value={b.priorities[col] ?? ''}
          onChange={e => update(d => setPriority(d, col, (e.target.value || null) as Letter | null, data, cr))}>
          <option value="">—</option>
          {LETTERS.map(l => <option key={l} value={l}>{l}</option>)}
        </select></td>
        <td className="muted">{gives(col, b.priorities[col] ? data.priorities[b.priorities[col]!] : undefined)}</td>
      </tr>)}</tbody>
    </table></div>
  </section>
}

function LifeModules() {
  const { ch, data, cr, p, act } = useSr6Editor()
  const b = ch.build, count = num(cr, 'lifepath.moduleCount'), bonus = num(cr, 'lifepath.bestAttributeBonus')
  const opening = Object.values(data.lifemodules).filter(m => m.stage === 'opening')
  const free = (p.available?.(b) ?? []).filter(m => !m.taken || m.again)
  const grants = (m: Sr6LifeModuleView) => [...Object.entries(m.grants).map(([k, v]) => k === 'nuyen' ? `${n(v)}¥` : `${v} ${GRANT_WORDS[k as Grant]}`),
    ...(m.contactTypes ? [`contacts: ${m.contactTypes.join(', ')}`] : [])].join(', ')
  const rest = b.bestAttr && bonus ? bonus - (p.attributeBonus?.(b, b.bestAttr) ?? 0) : 0
  const option = (o: string) => o.startsWith('skill:') ? data.skills[o.slice(6)]?.name ?? o.slice(6)
    : o.startsWith('nuyen:') ? `${n(Number(o.slice(6)))}¥` : ATTR_NAMES[o as Sr6Attr] ?? o
  return <section className="stack">
    <h3>Life modules</h3>
    <p className="muted">Every runner starts with the opening modules, then picks {count ?? '?'} adult ones.</p>
    <ul>{opening.map(m => <li key={m.id}><b>{m.name}</b> <span className="muted">{grants(m)}</span></li>)}</ul>
    {bonus !== undefined && <div className="row">
      <label className="inline">Best attribute (+{bonus})
        <select aria-label="Best attribute" value={b.bestAttr ?? ''} onChange={e => act({ op: 'bestAttr', attr: (e.target.value || null) as Sr6Attr | null })}>
          <option value="">Pick one</option>
          {CORE_ATTRS.map(a => <option key={a} value={a}>{ATTR_NAMES[a]}</option>)}
        </select></label>
      {rest > 0 && <label className="inline">The other {rest} goes on
        <select aria-label="Best attribute rest" value={b.bestExtra ?? ''} onChange={e => act({ op: 'bestAttr', attr: b.bestAttr!, extra: (e.target.value || null) as Sr6Attr | null })}>
          <option value="">Pick one</option>
          {CORE_ATTRS.filter(a => a !== b.bestAttr).map(a => <option key={a} value={a}>{ATTR_NAMES[a]}</option>)}
        </select></label>}
    </div>}
    <h4>Adult modules: {b.lifepath.length} of {count ?? '?'}</h4>
    {b.lifepath.map((t, at) => {
      const m = data.lifemodules[t.id]
      return <div key={at} className="row">
        <span><b>{m?.name ?? t.id}</b> <span className="muted">{m ? grants(m) : 'no longer in the catalog'}</span></span>
        {m?.choices.map((c, i) => <label key={i} className="inline">Choice {i + 1} ({c.points})
          <select value={t.choices[i] ?? ''} onChange={e => act({ op: 'lifemodule', id: t.id, choice: i, pick: e.target.value, at })}>
            <option value="" disabled>Pick one</option>
            {c.options.map(o => <option key={o} value={o}>{option(o)}</option>)}
          </select></label>)}
        <button className="btn small quiet" aria-label={`Remove ${m?.name ?? t.id}`} onClick={() => act({ op: 'lifemodule', remove: t.id, at })}>Remove</button>
      </div>
    })}
    {free.length > 0 && <div className="scroll-x"><table className="data">
      <thead><tr><th>Module</th><th>Gives</th><th /></tr></thead>
      {/* a module for another magic kind may still be taken: Review's lifepath.requires */}
      <tbody>{free.map(m => <tr key={m.id}><td>{m.name}{!m.fits && <span className="err"> (for {m.requires} runners)</span>}</td><td className="muted">{grants(m)}{m.choices.length ? `, plus ${m.choices.length} choice` : ''}</td>
        <td><button className="btn small" aria-label={`Add ${m.name}`} onClick={() => act({ op: 'lifemodule', id: m.id })}>{m.taken ? 'Add again' : 'Add'}</button></td></tr>)}</tbody>
    </table></div>}
  </section>
}
