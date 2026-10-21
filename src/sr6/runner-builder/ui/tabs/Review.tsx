// Review: every broken creation rule and note with its page, each linked to the tab where it's fixed (a violation's path
// starts with the tab id), GM approval as Anarchy's, the derived values, and Finalize. In career: the career checks
// (validateCareer, already in the context), the derived values of the runner as it stands, the ledger's balances, and Back
// to draft only while the ledger holds nothing live to undo.
import { useRef, useState } from 'react'
import { resolveEntry } from '../../../catalog/domain/load'
import type { Violation } from '../../../../core/shared/types'
import { Modal } from '../../../../core/ui-kit/bits'
import { balances, canDraft } from '../../domain/career/career'
import { purchaseTab } from '../../domain/creation/purchases'
import { draftAgain, finalizeSr6 } from '../../domain/career/finalize'
import { canFinalizeSr6, DESIGN_APPROVAL } from '../../domain/review/rules'
import { sr6Tabs } from '../tabList'
import { adeptDrainLabel, ATTR_NAMES, n, sr6EditHref, useSr6Editor } from '../editor'
import { entryOfPath, Sr6Ref } from '../EntryRef'
import { attrShown, br, effectNotes } from '../view'
import type { Sr6Derived } from '../../domain/creation/derive'

/** What the +4 caps left out of the attributes and skill pools, each in words (`AGI: 2 bonus not counted`). */
export const capNotes = (d: Sr6Derived) => [
  ...Object.entries(d.on.capped).map(([a, v]) => `${ATTR_NAMES[a as keyof typeof ATTR_NAMES]}: ${v} bonus not counted`),
  ...d.on.pools.filter(p => p.capped).map(p => `${p.label}: ${p.capped} bonus ${p.capped === 1 ? 'die' : 'dice'} not counted`),
]

export function ReviewTab() {
  const { ch, c, v, d, data, budgets, replace, career, ro, approve: approveAll } = useSr6Editor()
  const gm = !!approveAll // GM approval is for GMs (editors) and the admin: on a player's runner, in a campaign they run
  const [notes, setNotes] = useState<Record<string, string>>({}) // the optional GM note typed beside each approvable line
  // (the box reads the note from a ref: a tick right after typing can come before the re-render that carries it)
  const typed = useRef(notes)
  const [asking, setAsking] = useState<'finalize' | 'draft' | null>(null)
  const sorted = [...v].sort((a, b) => Number(!!a.approved) - Number(!!b.approved) || (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
  const tabs = sr6Tabs(ch.build.magic, career)
  const bal = balances(ch),
    drafting = canDraft(ch)
  // a pick left on a runner that's no longer awakened is fixed on Creation method (its Magic tab is gone)
  // (a drone's line keeps its `vehicles.<uid>` path and links to Drones)
  const tabOf = (path: string) => {
    const [head, uid] = path.split('.'),
      x = head === 'vehicles' ? ch.build.purchases.find(y => y.uid === uid) : undefined
    return x ? purchaseTab(x, data) : tabs.some(([k]) => k === head) ? head : head === 'magic' ? 'method' : undefined
  }
  const ready = canFinalizeSr6(v)
  const name = ch.identity.streetName || ch.identity.name || 'this runner'

  const [err, setErr] = useState('')
  const done = (r: string | null) => {
    setErr(r ?? '')
    return !r
  }
  // the "Approved by GM" box: ticked approves (with the note typed beside it), unticked revokes. Each sends the whole list,
  // so a tick while one is saving is ignored: it would send a list without the first. The boxes say so with aria-disabled,
  // not disabled, so the one just ticked keeps the focus (the ref: a second tick can come before the re-render)
  const [approving, setApproving] = useState(false)
  const busy = useRef(false)
  const toggle = async (x: Violation, on: boolean) => {
    if (busy.current) return
    busy.current = true
    setApproving(true)
    try {
      return done(
        await approveAll!(
          on
            ? [...ch.overrides, { code: x.code, path: x.path, note: (typed.current[`${x.code}|${x.path}`] ?? '').trim() }]
            : ch.overrides.filter(o => !(o.code === x.code && o.path === x.path)),
        ),
      )
    } finally {
      busy.current = false
      setApproving(false)
    }
  }
  const finalize = () => {
    const next = finalizeSr6(ch, budgets, v)
    if (next) replace(next)
    setAsking(null)
  }
  const draft = () => {
    const next = draftAgain(ch)
    if (next) replace(next)
    setAsking(null)
  }

  const dl = (rows: [string, string | number | null | undefined][]) => (
    <dl className="sr6-derived">
      {rows
        .filter(([, x]) => x !== undefined)
        .map(([k, x]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{x === null ? '—' : typeof x === 'number' ? n(x) : x}</dd>
          </div>
        ))}
    </dl>
  )
  const init1 = (i?: { base: number; dice: number | null }) => i && `${i.base} + ${i.dice ?? '?'}D6`
  const init = (i?: { base: number; dice: number | null }, o?: { base: number; dice: number | null }) => br(init1(i), init1(o))
  const unarmed1 = (u: Sr6Derived['unarmedDamage']) => (u ? `${u.dv}${u.physical ? 'P' : 'S'}` : null)
  const unarmed = (u: Sr6Derived['unarmedDamage'], o: Sr6Derived['unarmedDamage']) => br(unarmed1(u), unarmed1(o))
  const move = (m: Sr6Derived['movement']) => m && `${m.walk} m; Sprint ${m.sprint} m + ${m.perHit} m a hit`

  return (
    <div className="stack">
      <h2>Review</h2>
      <p className="muted">
        Rule problems block finalizing until they’re fixed or a GM approves them; negative Karma or nuyen only fixing clears. Notes never block.
      </p>
      {sorted.length === 0 && <p className="ok">No rule problems and nothing to note.</p>}
      <div>
        {sorted.map(x => {
          const tab = tabOf(x.path),
            o = ch.overrides.find(o => o.code === x.code && o.path === x.path)
          // the entry the line names, with its card (to check the book's numbers against the problem)
          const at = entryOfPath(ch, x.path),
            e = at && resolveEntry(c, at.kind, at.id)
          return (
            <div key={`${x.code}|${x.path}|${x.message}`} className={`viol${x.approved ? ' approved' : ''}`}>
              <span className={`sev ${x.approved ? 'ok' : x.severity === 'error' ? 'err' : 'warn'}`}>
                {x.approved ? 'Approved' : x.severity === 'error' ? 'Problem' : 'Note'}
              </span>
              <span className="msg">
                {tab ? <a href={sr6EditHref(ch.id, tab)}>{x.message}</a> : x.message}{' '}
                {x.page && (
                  <span className="cite">
                    {x.source} p.{x.page}
                  </span>
                )}
                {e && (
                  <>
                    {' '}
                    <Sr6Ref kind={at!.kind} id={e.id}>
                      <span className="muted small">{e.name}</span>
                    </Sr6Ref>
                  </>
                )}
              </span>
              {/* (a designed vehicle's approval: a warning, approved in career too, owner Q8) */}
              {(!career || x.code === DESIGN_APPROVAL) && (
                <span className="row">
                  {(x.severity === 'error' || x.code === DESIGN_APPROVAL) && !x.hard && (
                    <>
                      <label className="check inline">
                        <input
                          type="checkbox"
                          checked={!!x.approved}
                          disabled={!gm}
                          aria-disabled={approving || undefined}
                          onChange={e => void toggle(x, e.target.checked)}
                        />{' '}
                        Approved by GM
                      </label>
                      {gm && !x.approved && (
                        <input
                          aria-label="GM note (optional)"
                          placeholder="Why the GM allows it (optional)"
                          value={notes[`${x.code}|${x.path}`] ?? ''}
                          onChange={e => {
                            typed.current = { ...typed.current, [`${x.code}|${x.path}`]: e.target.value }
                            setNotes(typed.current)
                          }}
                        />
                      )}
                    </>
                  )}
                  {x.hard && <span className="muted small">Fix before finalizing: no GM approval</span>}
                </span>
              )}
              {o && <span className="note">GM: {o.note || 'approved'}</span>}
            </div>
          )
        })}
      </div>

      <hr className="sep" />
      <h2>Derived values</h2>
      {dl([
        ...(['bod', 'agi', 'rea', 'str', 'wil', 'log', 'int', 'cha', 'edg', 'mag', 'res'] as const)
          .filter(a => (a !== 'mag' && a !== 'res') || d.attrs[a].natural > 0)
          .map(a => [ATTR_NAMES[a], attrShown(d, a)] as [string, string | number]),
        ['Essence', d.essence],
        ['Initiative', init(d.initiative, d.on.initiative)],
        ['Astral initiative', init(d.astralInit, d.on.astralInit)],
        ['Physical monitor', br(d.monitors.physical, d.on.monitors.physical)],
        ['Stun monitor', br(d.monitors.stun, d.on.monitors.stun)],
        ['Overflow', br(d.monitors.overflow, d.on.monitors.overflow)],
        ['Defense Rating', br(d.defenseRating, d.on.defenseRating)],
        ['Social Rating', br(d.socialRating, d.on.socialRating)],
        ['Unarmed Attack Rating', br(d.attackRatings.unarmed, d.on.attackRatings.unarmed)],
        ['Composure', br(d.composure, d.on.composure)],
        ['Judge Intentions', d.judgeIntentions],
        ['Memory', d.memory],
        ['Lift/Carry', d.liftCarry],
        ['Drain', d.drain],
        [d.adeptDrain ? adeptDrainLabel(d.adeptDrain) : 'Adept drain', br(d.adeptDrain?.value, d.on.adeptDrain?.value)],
        ['Fading', d.fading],
        ['Unarmed damage', unarmed(d.unarmedDamage, d.on.unarmedDamage)],
        ['Spell Attack Rating', br(d.spellAttackRating, d.on.spellAttackRating)],
        ['Matrix initiative (AR)', d.matrixInit && init(d.matrixInit.ar, d.on.matrixInit?.ar)],
        ['Matrix initiative (VR cold sim)', d.matrixInit && init(d.matrixInit.cold, d.on.matrixInit?.cold)],
        ['Matrix initiative (VR hot sim)', d.matrixInit && init(d.matrixInit.hot, d.on.matrixInit?.hot)],
        ['Movement', move(d.movement)],
        ['Karma left', career ? bal.karma : d.karmaLeft],
        ['Nuyen left', `${n(career ? bal.nuyen : d.nuyenLeft)}¥`],
        // an item's own values from its accessories (a cyberlimb's Strength): the item's, not the runner's
        ...d.hosts.map(h => [h.name, h.text] as [string, string]),
      ])}
      {d.unset.length > 0 && <p className="muted">A dash: a setting it needs isn’t set (Table setup → Creation rules).</p>}
      {capNotes(d).length > 0 && <p className="muted">Capped (CRB Hong Kong pp. 37, 39: an augmented increase is at most +4): {capNotes(d).join('; ')}.</p>}
      {/* (owner decision 2026-10-10: every switchable, conditional and caster or target effect named, as Anarchy's Review does) */}
      {(fx =>
        fx.length > 0 && (
          <>
            <h3 id="review-effects">What its effects do</h3>
            <p className="muted">The numbers above hold the always-on effects; the ones in brackets add the switchable and conditional ones.</p>
            <ul aria-labelledby="review-effects">
              {fx.map((x, i) => (
                <li key={i}>
                  <b>{x.from}:</b> {x.text}
                </li>
              ))}
            </ul>
          </>
        ))(effectNotes(ch.build, data))}

      {err && (
        <p className="banner err" role="alert">
          {err}
        </p>
      )}
      {!ro && (
        <>
          <hr className="sep" />
          <h2>Finalize</h2>
          {!career ? (
            <>
              <p>Finalizing is the last check of creation. It records the karma and nuyen left; the build is then read only.</p>
              <div>
                <button className="btn primary" disabled={!ready} onClick={() => setAsking('finalize')}>
                  Finalize runner
                </button>
                {!ready && <span className="muted"> Fix or approve the problems above first.</span>}
              </div>
            </>
          ) : (
            <>
              <p>
                Finalized{ch.finalizedAt ? ` on ${ch.finalizedAt.slice(0, 10)}` : ''} with {n(ch.final?.karma ?? 0)} karma and {n(ch.final?.nuyen ?? 0)}¥ left.{' '}
                <a href={sr6EditHref(ch.id, 'ledger')}>The ledger</a> now holds {n(bal.karma)} karma and {n(bal.nuyen)}¥.{' '}
                <a href={sr6EditHref(ch.id, 'print')}>Print it</a> or export a copy.
              </p>
              <div>
                <button className="btn" disabled={!drafting} onClick={() => setAsking('draft')}>
                  Back to draft
                </button>
                {!drafting && <span className="muted"> Void the ledger’s earnings and spends first (newest first).</span>}
              </div>
            </>
          )}
        </>
      )}

      <Modal
        open={asking === 'finalize'}
        onClose={() => setAsking(null)}
        title={`Finalize ${name}?`}
        actions={
          <>
            <button className="btn" onClick={() => setAsking(null)}>
              Not yet
            </button>
            <button className="btn primary" onClick={finalize}>
              Finalize
            </button>
          </>
        }
      >
        <p>
          The build becomes read only, with {n(budgets.karma.left)} karma and {n(budgets.nuyen.left)}¥ left. Back to draft undoes it.
        </p>
      </Modal>
      <Modal
        open={asking === 'draft'}
        onClose={() => setAsking(null)}
        title={`Put ${name} back to draft?`}
        actions={
          <>
            <button className="btn" onClick={() => setAsking(null)}>
              Cancel
            </button>
            <button className="btn primary" onClick={draft}>
              Back to draft
            </button>
          </>
        }
      >
        <p>The build can be changed again and the creation checks apply. The ledger keeps its history; finalizing again starts its balances anew.</p>
      </Modal>
    </div>
  )
}
