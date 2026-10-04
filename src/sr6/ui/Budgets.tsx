// The budgets panel (the Anarchy receipt's place and look): one row per budget with what's left of the most there is, in
// the error colour when overspent; a row with a breakdown opens to its lines, each a link to the tab it's spent on. Point
// buy's character points and lifepath's modules show only for their method; pools a method doesn't use are left out.
// In career only the ledger's karma and nuyen (linking to the Ledger tab) and the current build's Essence.
import { useState } from 'react'
import { balances } from '../engine/career'
import { num } from '../engine/creation'
import { MAGIC_KINDS } from '../engine/data'
import type { Budget } from '../engine/budgets'
import { MAGIC_KIND_LABELS, SR6_METHOD_LABELS } from '../model/character'
import { n, sr6EditHref, useSr6Editor } from './editor'

export function Budgets() {
  const { ch, data, cr, budgets: B, v, career } = useSr6Editor()
  const [open, setOpen] = useState(false)
  const b = ch.build, kind = MAGIC_KINDS[b.magic]
  const rows: [string, string, Budget | undefined, string?][] = [
    ['karma', 'Karma', B.karma], ['nuyen', 'Nuyen', B.nuyen, '¥'], ['essence', 'Essence', B.essence],
    ['characterPoints', 'Character points', b.method === 'pointbuy' ? B.characterPoints : undefined],
    ['attributePoints', 'Attribute points', B.attributePoints], ['adjustmentPoints', 'Adjustment points', B.adjustmentPoints],
    ['skillPoints', 'Skill points', B.skillPoints], ['knowledgePoints', 'Knowledge points', B.knowledgePoints],
    ['contactPoints', 'Contact points', B.contactPoints],
    ['powerPoints', 'Power points', kind.powers ? B.powerPoints : undefined],
    ['spellSlots', kind.resonance ? 'Free complex forms' : 'Free spells', kind.spells || kind.resonance ? B.spellSlots : undefined],
  ]
  // karma, nuyen and Essence always; a pool only when the method gives it or something is spent from it
  const shown = rows.filter(([k, , x]) => x && (['karma', 'nuyen', 'essence'].includes(k) || x.max || x.spent) && (!career || k === 'essence'))
  const bal = balances(ch), karmaLeft = career ? bal.karma : B.karma.left
  const modules = num(cr, 'lifepath.moduleCount')
  const errors = v.filter(x => x.severity === 'error' && !x.approved).length
  const warnings = v.filter(x => x.severity === 'warning' && !x.approved).length
  const meta = data.metatypes[b.metatype]?.name

  const head = (label: string, x: Budget, unit = '') => (
    <span className={`line${x.left < 0 ? ' neg' : ''}`}>
      <span className="lbl">{label}</span><span className="lead" />
      <span className="amt num">{n(x.left)}{unit}</span><span className="guide">left of {n(x.max)}{unit}</span>
    </span>
  )
  return (
    <aside className={`receipt sr6-budgets${open ? ' open' : ''}`} aria-label="Budgets" onClick={() => setOpen(o => !o)}>
      <div className="peek"><span>{karmaLeft < 0 ? 'Karma over by' : 'Karma left'}</span><span className={karmaLeft < 0 ? 'err' : ''}>{n(Math.abs(karmaLeft))}</span></div>
      <div onClick={e => e.stopPropagation()}>
        <h2>{career ? 'Career' : `${SR6_METHOD_LABELS[b.method]} build`}</h2>
        <div className="sub">{[meta ?? 'No metatype yet', MAGIC_KIND_LABELS[b.magic]].join(', ')}</div>
        {career && ([['Karma', bal.karma, ''], ['Nuyen', bal.nuyen, '¥']] as const).map(([label, x, unit]) =>
          <a key={label} className="budget" href={sr6EditHref(ch.id, 'ledger')}><span className={`line${x < 0 ? ' neg' : ''}`}>
            <span className="lbl">{label}</span><span className="lead" /><span className="amt num">{n(x)}{unit}</span><span className="guide">on the ledger</span></span></a>)}
        {shown.map(([k, label, x, unit]) => x!.breakdown?.length
          ? <details key={k} className="budget"><summary aria-label={`${label}: ${n(x!.left)}${unit ?? ''} left of ${n(x!.max)}${unit ?? ''}`}>{head(label, x!, unit)}</summary>
            <ul className="bud-lines">{x!.breakdown.map(l => <li key={l.key}><a className="line" href={sr6EditHref(ch.id, l.tab)}>
              <span className="lbl">{l.label}</span><span className="lead" /><span className="amt num">{l.sign === 'gain' ? '+' : '−'}{n(l.amount)}{unit}</span></a></li>)}</ul>
          </details>
          : <div key={k} className="budget">{head(label, x!, unit)}</div>)}
        {b.method === 'lifepath' && <div className="budget"><span className={`line${modules !== undefined && b.lifepath.length > modules ? ' neg' : ''}`}>
          <span className="lbl">Adult life modules</span><span className="lead" />
          <span className="amt num">{b.lifepath.length}</span><span className="guide">of {modules ?? '?'}</span></span></div>}
        <a className="issues" href={sr6EditHref(ch.id, 'review')}>
          {errors === 0 && warnings === 0 && <span className="ok">No rule problems</span>}
          {errors > 0 && <span className="err">{errors} rule {errors === 1 ? 'problem' : 'problems'}</span>}
          {errors > 0 && warnings > 0 && ', '}
          {warnings > 0 && <span className="warn">{warnings} {warnings === 1 ? 'note' : 'notes'}</span>}
        </a>
      </div>
    </aside>
  )
}
