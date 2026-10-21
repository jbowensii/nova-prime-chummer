// The budgets panel (the Anarchy receipt's place and look): one row per budget with what's left of the most there is, in
// the error colour when overspent; a row with a breakdown opens to its lines, each a link to the tab it's spent on. Point
// buy's character points and lifepath's modules show only for their method; pools a method doesn't use are left out.
// In career only the ledger's karma and nuyen (linking to the Ledger tab) and the current build's Essence.
import { balances } from '../engine/career'
import { num } from '../table-setup/domain/creation'
import { MAGIC_KINDS } from '../catalog/domain/data'
import type { Budget } from '../engine/budgets'
import { MAGIC_KIND_LABELS, SR6_METHOD_LABELS } from '../formats/domain/character'
import { n, sr6EditHref, useSr6Editor } from './editor'
import { Sr6Ref } from './EntryRef'
import { SidePanel } from '../../core/shared/ui'

/** What's left of a budget in a sentence: "3 left of 24", or overspent "over by 2 (of 24)" (in the error colour unless
 *  `fine`: a Karma build's spells past the free ones are bought with Karma). */
export function Left({ x, fine = false }: { x: Budget; fine?: boolean }) {
  return x.left < 0 ? (
    <>
      <b className={fine ? '' : 'err'}>over by {n(-x.left)}</b> (of {n(x.max)})
    </>
  ) : (
    <>
      <b>{n(x.left)} left</b> of {n(x.max)}
    </>
  )
}

export function Budgets() {
  const { ch, data, cr, budgets: B, v, career } = useSr6Editor()
  const b = ch.build,
    kind = MAGIC_KINDS[b.magic]
  const rows: [string, string, Budget | undefined, string?][] = [
    ['karma', 'Karma', B.karma],
    ['nuyen', 'Nuyen', B.nuyen, '¥'],
    ['essence', 'Essence', B.essence],
    ['characterPoints', 'Character points', b.method === 'pointbuy' ? B.characterPoints : undefined],
    ['attributePoints', 'Attribute points', B.attributePoints],
    ['adjustmentPoints', 'Adjustment points', B.adjustmentPoints],
    ['skillPoints', 'Skill points', B.skillPoints],
    ['knowledgePoints', 'Knowledge points', B.knowledgePoints],
    ['contactPoints', 'Contact points', B.contactPoints],
    ['powerPoints', 'Power points', kind.powers ? B.powerPoints : undefined],
    ['spellSlots', kind.resonance ? 'Free complex forms' : 'Free spells', kind.spells || kind.resonance ? B.spellSlots : undefined],
  ]
  // karma, nuyen and Essence always; a pool only when the method gives it or something is spent from it
  const shown = rows.filter(([k, , x]) => x && (['karma', 'nuyen', 'essence'].includes(k) || x.max || x.spent) && (!career || k === 'essence'))
  const bal = balances(ch),
    karmaLeft = career ? bal.karma : B.karma.left
  const modules = num(cr, 'lifepath.moduleCount')
  const errors = v.filter(x => x.severity === 'error' && !x.approved).length
  const warnings = v.filter(x => x.severity === 'warning' && !x.approved).length
  const meta = data.metatypes[b.metatype]?.name

  const left = (x: Budget, unit = '') =>
    x.left < 0 ? `over by ${n(-x.left)}${unit} (of ${n(x.max)}${unit})` : `${n(x.left)}${unit} left of ${n(x.max)}${unit}`
  const head = (label: string, x: Budget, unit = '') => (
    <span className={`line${x.left < 0 ? ' neg' : ''}`}>
      <span className="lbl">{label}</span>
      <span className="lead" />
      {x.left < 0 ? (
        <>
          <span className="amt num">
            over by {n(-x.left)}
            {unit}
          </span>
          <span className="guide">
            (of {n(x.max)}
            {unit})
          </span>
        </>
      ) : (
        <>
          <span className="amt num">
            {n(x.left)}
            {unit}
          </span>
          <span className="guide">
            left of {n(x.max)}
            {unit}
          </span>
        </>
      )}
    </span>
  )
  // the bar a phone shows closed: the most urgent overspend (nuyen can't be approved, then Karma, then the first pool),
  // else the Karma left
  const urgency = (k: string) => (k === 'nuyen' ? 0 : k === 'karma' ? 1 : 2)
  const pools: [string, number, string][] = career
    ? [
        ['Nuyen', bal.nuyen, '¥'],
        ['Karma', bal.karma, ''],
      ]
    : shown
        .filter(([k]) => !(k === 'spellSlots' && b.method === 'karma')) // (a Karma build buys spells past the free ones)
        .sort(([a], [b]) => urgency(a) - urgency(b))
        .map(([, label, x, unit]) => [label, x!.left, unit ?? ''])
  const [peekLabel, peekLeft, peekUnit] = pools.find(([, left]) => left < 0) ?? ['Karma', karmaLeft, '']
  return (
    <SidePanel
      className="receipt sr6-budgets"
      label="Budgets"
      peek={
        <>
          <span>{peekLeft < 0 ? `${peekLabel} over by` : `${peekLabel} left`}</span>
          <span className={peekLeft < 0 ? 'err' : ''}>
            {n(Math.abs(peekLeft))}
            {peekUnit}
          </span>
        </>
      }
    >
      <h2>{career ? 'Career' : `${SR6_METHOD_LABELS[b.method]} build`}</h2>
      <div className="sub">{[meta ?? 'No metatype yet', MAGIC_KIND_LABELS[b.magic]].join(', ')}</div>
      {career &&
        (
          [
            ['Karma', bal.karma, ''],
            ['Nuyen', bal.nuyen, '¥'],
          ] as const
        ).map(([label, x, unit]) => (
          <a key={label} className="budget" href={sr6EditHref(ch.id, 'ledger')}>
            <span className={`line${x < 0 ? ' neg' : ''}`}>
              <span className="lbl">{label}</span>
              <span className="lead" />
              <span className="amt num">
                {n(x)}
                {unit}
              </span>
              <span className="guide">on the ledger</span>
            </span>
          </a>
        ))}
      {shown.map(([k, label, x, unit]) =>
        x!.breakdown?.length ? (
          <details key={k} className="budget">
            <summary aria-label={`${label}: ${left(x!, unit)}`}>{head(label, x!, unit)}</summary>
            <ul className="bud-lines">
              {x!.breakdown.map(l => (
                <li key={l.key}>
                  <a className="line" href={sr6EditHref(ch.id, l.tab)}>
                    {/* (a line naming an entry, the metatype's Karma: its card; the link's focus opens it) */}
                    <span className="lbl">
                      {l.key === 'metatype' ? (
                        <Sr6Ref kind="metatypes" id={b.metatype} tabbable={false}>
                          {l.label}
                        </Sr6Ref>
                      ) : (
                        l.label
                      )}
                    </span>
                    <span className="lead" />
                    <span className="amt num">
                      {l.sign === 'gain' ? '+' : '−'}
                      {n(l.amount)}
                      {unit}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <div key={k} className="budget">
            {head(label, x!, unit)}
          </div>
        ),
      )}
      {b.method === 'lifepath' && (
        <div className="budget">
          <span className={`line${modules !== undefined && b.lifepath.length > modules ? ' neg' : ''}`}>
            <span className="lbl">Adult life modules</span>
            <span className="lead" />
            <span className="amt num">{b.lifepath.length}</span>
            <span className="guide">of {modules ?? '?'}</span>
          </span>
        </div>
      )}
      <a className="issues" href={sr6EditHref(ch.id, 'review')}>
        {errors === 0 && warnings === 0 && <span className="ok">No rule problems</span>}
        {errors > 0 && (
          <span className="err">
            {errors} rule {errors === 1 ? 'problem' : 'problems'}
          </span>
        )}
        {errors > 0 && warnings > 0 && ', '}
        {warnings > 0 && (
          <span className="warn">
            {warnings} {warnings === 1 ? 'note' : 'notes'}
          </span>
        )}
      </a>
    </SidePanel>
  )
}
