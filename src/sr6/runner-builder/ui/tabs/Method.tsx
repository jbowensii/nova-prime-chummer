// Creation method: the method (one whose settings aren't set can't be picked and says what's missing), then what the
// method asks for: the priority letters (sum to ten: their running total against the target), point buy's character
// points, lifepath's modules, the karma build's pool; then the metatype and magic kind the method allows; then the runner's
// own creation rules (RunnerRules).
import {
  CORE_ATTRS,
  CP_POOLS,
  LETTERS,
  MAGIC_KIND_LABELS,
  PRIORITY_COLUMNS,
  SR6_METHOD_LABELS,
  SR6_METHODS,
  type CpPool,
  type Letter,
  type MagicKind,
  type PriorityColumn,
  type Sr6Method,
} from '../../../formats/domain/character'
import { setMagic, setMetatype, setMethod, setPriority } from '../../domain/creation/actions'
import { flag, loadCreation, methodFill, num, str } from '../../../table-setup/domain/creation'
import { gainedEntry, type Gained, type Grant, type Sr6LifeModuleView, type Sr6PriorityRow } from '../../../catalog/domain/data'
import { useState } from 'react'
import { Stepper } from '../../../../core/ui-kit/bits'
import { awakenedFlag, boughtKind, infectedTypes, runnerInfected, type InfectedType } from '../../domain/creation/infected'
import { missingLabels, MissingList } from '../../../table-setup/ui/MissingList'
import { ATTR_NAMES, n, useSr6Editor } from '../editor'
import { Left } from '../Budgets'
import { RunnerRules } from '../RunnerRules'
import { Sr6Ref } from '../EntryRef'
import type { Sr6Attr } from '../../../formats/domain/character'

const COLUMN_LABELS: Record<PriorityColumn, string> = {
  metatype: 'Metatype',
  attributes: 'Attributes',
  magic: 'Magic or Resonance',
  skills: 'Skills',
  resources: 'Resources',
}
const CP_LABELS: Record<CpPool, string> = {
  attribute: 'Attribute points',
  skill: 'Skill points',
  adjustment: 'Adjustment points',
  resources: 'Nuyen',
  powerPoints: 'Power points',
  spells: 'Spells',
  complexForms: 'Complex forms',
}
const GRANT_WORDS: Record<Grant, string> = {
  attributePoints: 'attribute points',
  skillPoints: 'skill points',
  adjustmentPoints: 'adjustment points',
  nuyen: '¥',
  contactPoints: 'contact points',
  knowledgeSkills: 'knowledge skills',
}

export function MethodTab() {
  const { ch, data, cr, p, budgets, update, act, ro, career } = useSr6Editor()
  const b = ch.build
  // the settings the table hasn't set, filled with the shipped standard values for this runner only (undo, or "Use the table's", reverses it)
  const setUpHere = async () => {
    const std = (await loadCreation().catch(() => null))?.std
    const fill = std ? [...new Map(SR6_METHODS.flatMap(m => methodFill(m, cr, data, std)).map(r => [r.key, r])).values()] : []
    if (!fill.length) return void window.alert('There are no standard values to set here; the table has to set these (Table setup → Creation rules).')
    if (
      !window.confirm(
        `The table hasn't set ${fill.length} of the creation settings these methods need. They will be set to the standard values for this runner only (you can undo this, or go back to the table's later). Set them?`,
      )
    )
      return
    update(d => {
      const keys = new Set(fill.map(r => r.key))
      d.rules = [...(d.rules ?? []).filter(r => !keys.has(r.key)), ...fill]
    })
  }
  const missing = Object.fromEntries(SR6_METHODS.map(m => [m, m === b.method ? [] : missingLabels(m, cr, data)])) as Record<Sr6Method, string[]>
  const letters = b.method === 'priority' || b.method === 'sumtoten'
  const metatypes = p.legalMetatypes(b),
    magic = p.legalMagic(b)
  const magicSkills = Object.values(data.skills).filter(s => s.attr === 'mag')

  return (
    <div className="stack">
      <h2>Creation method</h2>
      <p className="muted">How the runner is built. Switching keeps the spends that still mean something.</p>
      <label>
        Method
        <select value={b.method} onChange={e => update(d => setMethod(d, e.target.value as Sr6Method, data, cr))}>
          {SR6_METHODS.map(m => (
            <option key={m} value={m} disabled={missing[m].length > 0}>
              {SR6_METHOD_LABELS[m]}
              {missing[m].length ? ` (needs ${missing[m].length} ${missing[m].length === 1 ? 'setting' : 'settings'})` : ''}
            </option>
          ))}
        </select>
      </label>
      <MissingList missing={missing} />
      {!ro && !career && SR6_METHODS.some(m => missing[m].length) && (
        <button type="button" className="btn small" onClick={setUpHere}>
          Set this up here
        </button>
      )}

      {letters && <Letters />}
      {b.method === 'pointbuy' && (
        <section className="stack">
          <h3>Character points</h3>
          {budgets.characterPoints && (
            <p className="muted">
              <Left x={budgets.characterPoints} />. Every point has to be spent.
            </p>
          )}
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Spent on</th>
                  <th>Character points</th>
                </tr>
              </thead>
              <tbody>
                {CP_POOLS.map(k => (
                  <tr key={k}>
                    <td>{CP_LABELS[k]}</td>
                    <td>
                      <Stepper label={CP_LABELS[k]} value={b.cp[k]} min={0} max={999} onChange={to => act({ op: 'cp', pool: k, delta: to - b.cp[k] })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {b.method === 'karma' && <p>The karma build has no point pools: everything is bought with the {n(p.startingKarma())} karma it starts with.</p>}
      {b.method === 'lifepath' && <LifeModules />}

      <h3>Metatype</h3>
      <label>
        Metatype
        <Sr6Ref kind="metatypes" id={b.metatype || undefined} tabbable={false}>
          <select aria-label="Metatype" value={b.metatype} onChange={e => update(d => setMetatype(d, e.target.value, data))}>
            <option value="">None yet</option>
            {metatypes.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.adjustmentPoints ? ` (${m.adjustmentPoints} adjustment points)` : ''}
              </option>
            ))}
          </select>
        </Sr6Ref>
      </label>
      {letters && !b.priorities.metatype && <p className="muted">Give Metatype a letter to see which metatypes it allows.</p>}

      <h3>Magic or Resonance</h3>
      {/* (the kind the method buys; an Infected runner's is then the one its type leaves it: actions.ts setMagic) */}
      <label>
        Kind
        <select aria-label="Magic kind" value={boughtKind(b)} onChange={e => update(d => setMagic(d, e.target.value as MagicKind, data, cr))}>
          {magic.map(m => (
            <option key={m.kind} value={m.kind}>
              {MAGIC_KIND_LABELS[m.kind]}
              {m.rating ? ` (rating ${m.rating})` : ''}
              {m.cp ? `, ${m.cp} character points` : ''}
            </option>
          ))}
        </select>
      </label>
      {b.infectedFrom !== undefined && (
        <p className="muted">
          The Infected type makes the runner <b>{MAGIC_KIND_LABELS[b.magic]}</b> (bought as {MAGIC_KIND_LABELS[b.infectedFrom].toLowerCase()}).
        </p>
      )}
      <AwakenedFlag />
      {b.magic === 'aspected' && (
        <label>
          Aspected skill
          <select value={b.aspectedSkill ?? ''} onChange={e => update(d => setMagic(d, 'aspected', data, cr, e.target.value))}>
            <option value="">Pick one</option>
            {magicSkills.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <InfectedSection />
      <RunnerRules />
    </div>
  )
}

/** The Awakened flag (infected.ts awakenedFlag): derived, or the player's override, shown with what it overrides (and
 *  Review's awakened.override warning). */
function AwakenedFlag() {
  const { ch, data, act, career } = useSr6Editor()
  const f = awakenedFlag(ch.build, data),
    yes = (v: boolean) => (v ? 'Awakened' : 'not Awakened')
  return (
    <>
      <label>
        Awakened
        <select
          aria-label="Awakened"
          value={f.override === undefined ? 'auto' : f.override ? 'yes' : 'no'}
          onChange={e => act({ op: 'awakened', value: e.target.value === 'auto' ? null : e.target.value === 'yes' })}
        >
          <option value="auto">
            Derived: {yes(f.derived)} ({f.why})
          </option>
          <option value="yes">Awakened (override)</option>
          <option value="no">Not Awakened (override)</option>
        </select>
      </label>
      {f.override !== undefined && f.override !== f.derived && (
        <p className="warn">
          Derived: {yes(f.derived)} ({f.why}) — overridden to {yes(f.value)}.
        </p>
      )}
      {career && <p className="muted">After finalising, the override is set on the Ledger tab (Spend → Awakened override).</p>}
    </>
  )
}

/** The Sixth World Companion's Infected (pp. 104–114), while the table allows it (or the runner has a type): Infected
 *  yes/no, its type (those of the runner's metatype), and what the type does. */
function InfectedSection() {
  const { ch, data, cr, act } = useSr6Editor()
  const b = ch.build,
    inf = runnerInfected(b, data)
  const [picking, setPicking] = useState(false)
  if (!flag(cr, 'infectedAllowed') && !inf) return null
  const types = infectedTypes(data, b.metatype),
    t = inf?.t
  const power = (id: string) => data.qualities[id]?.name ?? id
  return (
    <section className="stack">
      <h3>Infected</h3>
      <label>
        <input
          type="checkbox"
          checked={!!inf || picking}
          disabled={!inf && !flag(cr, 'infectedAllowed')}
          onChange={e => {
            setPicking(e.target.checked)
            if (!e.target.checked && inf) act({ op: 'infected', id: '' })
          }}
        />{' '}
        Infected (HMHVV, Sixth World Companion p. 104)
      </label>
      {(inf || picking) && (
        <label>
          Type
          <select aria-label="Infected type" value={t?.id ?? ''} onChange={e => act({ op: 'infected', id: e.target.value })}>
            <option value="">{types.length ? 'Pick one' : 'None for this metatype'}</option>
            {t && !types.some(x => x.id === t.id) && <option value={t.id}>{t.name} (not for this metatype)</option>}
            {types.map(x => (
              <option key={x.id} value={x.id}>
                {x.name} (Strain {x.printed ?? x.strain}
                {x.fit === 'alt' && x.alt ? `; ${x.alt.note ?? `${x.alt.karma} Karma`}` : ''})
              </option>
            ))}
          </select>
        </label>
      )}
      {t && (
        <ul className="muted">
          <li>
            Attribute maxima: the type’s{inf?.alt ? ' (added to the metatype’s own)' : ''}; an attribute above one drops to it, the points not refunded
            (Review).
          </li>
          <li>
            Free points: {t.freePhysical} physical and {t.freeMental} mental, counted with the attribute points on Attributes.
          </li>
          <li>
            {t.essence !== undefined
              ? `Essence starts at ${t.essence}.`
              : 'Essence: the book gives no creation Essence for Strain I; the runner keeps its own.'}{' '}
            {t.magicMax?.startsWith('ess')
              ? 'Highest Magic: Essence + initiation grade (it follows Essence).'
              : `Magic ${t.magic ?? 0} for a runner without Magic, ${t.magicLoss ?? 0} less for one with it; highest ${t.magicMax ?? '—'}.`}
          </li>
          {b.infectedFrom !== undefined && (
            <li>
              {b.infectedFrom === 'technomancer' ? 'The technomancer’s Resonance is lost, with no refund. ' : ''}
              Magic kind: {MAGIC_KIND_LABELS[b.infectedFrom]} → {MAGIC_KIND_LABELS[b.magic]}.
            </li>
          )}
          <li>Edge: the Infected rules give no change at creation.</li>
          {(['power', 'weakness'] as const).map(tag => (
            <li key={tag}>
              {tag === 'power' ? 'Gained powers (free)' : 'Gained weaknesses'}: <Gains t={t} tag={tag} />
            </li>
          ))}
          <li>
            Optional powers (Qualities tab): {t.powers.length ? t.powers.map(p => `${power(p.ref)}${p.free ? ' (free pick)' : ''}`).join(', ') : 'none'}.{' '}
            {t.powers.some(p => p.free) && 'One free pick. '}
            {flag(cr, 'infectedPowersAtCreation')
              ? 'This table lets them be bought at creation.'
              : 'At creation only the free pick; the rest after creation, at their own Karma.'}{' '}
            The book’s pace, one every two in-game months, is not enforced.
          </li>
        </ul>
      )}
    </section>
  )
}

/** An Infected type's gained powers or weaknesses (its <power>s, <weakness>s), each with its card when the catalog has it
 *  (data.ts gainedEntry), else as printed, quietly (no error of the player's: Review notes it once, data.unresolved;
 *  Goblin's Dietary Restriction stays as printed, owner 2026-10-16). */
export function Gains({ t, tag }: { t: InfectedType; tag: Gained['tag'] }) {
  const { data } = useSr6Editor()
  const gs = t.gains.filter(g => g.tag === tag)
  if (!gs.length) return <>none listed</>
  return (
    <>
      {gs.map((g, i) => {
        const e = gainedEntry(data, g),
          name = `${g.name}${g.rating ? ` ${g.rating}` : ''}`
        return (
          <span key={i}>
            {i > 0 && ', '}
            {e ? (
              <Sr6Ref kind={e.kind} id={e.id}>
                {name}
              </Sr6Ref>
            ) : (
              <>
                {name} <span className="muted">(as printed; not in the catalog)</span>
              </>
            )}
          </span>
        )
      })}
    </>
  )
}

function Letters() {
  const { ch, data, cr, update } = useSr6Editor()
  const b = ch.build,
    target = num(cr, 'sumToTenTarget'),
    want = str(cr, 'priorityLetters')
  // (street level, CRB Hong Kong p. 63: a letter gives the row below's values)
  const rowOf = (l: Letter) => data.priorities[flag(cr, 'levelStreet') ? LETTERS[Math.min(LETTERS.indexOf(l) + 1, LETTERS.length - 1)] : l]
  const total = PRIORITY_COLUMNS.reduce((s, k) => s + (b.priorities[k] ? (num(cr, `letterValue:${b.priorities[k]}`) ?? 0) : 0), 0)
  const gives = (col: PriorityColumn, row?: Sr6PriorityRow) =>
    !row
      ? ''
      : col === 'attributes'
        ? `${row.attributes} points`
        : col === 'skills'
          ? `${row.skills} points`
          : col === 'resources'
            ? `${n(row.nuyen)}¥`
            : col === 'metatype'
              ? Object.entries(row.metatypes)
                  .map(([id, pts]) => `${data.metatypes[id]?.name ?? id} (${pts} adjustment points)`)
                  .join(', ')
              : Object.entries(row.magic)
                  .map(([k, r]) => `${MAGIC_KIND_LABELS[k as MagicKind]}${r ? ` ${r}` : ''}`)
                  .join(', ')
  return (
    <section className="stack">
      <h3>Priorities</h3>
      <p className="muted">
        {b.method === 'priority' ? (
          want ? (
            `Give the columns the letters ${want.split('').join(', ')}, one each.`
          ) : (
            'Give each column a different letter, A to E.'
          )
        ) : (
          <>
            The letters’ values add up to <b className={target !== undefined && total > target ? 'err' : ''}>{total}</b> of {target ?? '?'}.
          </>
        )}
      </p>
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>Column</th>
              <th>Letter</th>
              <th>Gives</th>
            </tr>
          </thead>
          <tbody>
            {PRIORITY_COLUMNS.map(col => (
              <tr key={col}>
                <td>{COLUMN_LABELS[col]}</td>
                <td>
                  <select
                    aria-label={`${COLUMN_LABELS[col]} priority`}
                    value={b.priorities[col] ?? ''}
                    onChange={e => update(d => setPriority(d, col, (e.target.value || null) as Letter | null, data, cr))}
                  >
                    <option value="">—</option>
                    {LETTERS.map(l => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="muted">{gives(col, b.priorities[col] ? rowOf(b.priorities[col]!) : undefined)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function LifeModules() {
  const { ch, data, cr, p, act } = useSr6Editor()
  const b = ch.build,
    count = num(cr, 'lifepath.moduleCount'),
    bonus = num(cr, 'lifepath.bestAttributeBonus')
  const opening = Object.values(data.lifemodules).filter(m => m.stage === 'opening')
  const free = (p.available?.(b) ?? []).filter(m => !m.taken || m.again)
  const grants = (m: Sr6LifeModuleView) =>
    [
      ...Object.entries(m.grants).map(([k, v]) => (k === 'nuyen' ? `${n(v)}¥` : `${v} ${GRANT_WORDS[k as Grant]}`)),
      ...(m.contactTypes ? [`contacts: ${m.contactTypes.join(', ')}`] : []),
    ].join(', ')
  const rest = b.bestAttr && bonus ? bonus - (p.attributeBonus?.(b, b.bestAttr) ?? 0) : 0
  const option = (o: string) =>
    o.startsWith('skill:')
      ? (data.skills[o.slice(6)]?.name ?? o.slice(6))
      : o.startsWith('nuyen:')
        ? `${n(Number(o.slice(6)))}¥`
        : (ATTR_NAMES[o as Sr6Attr] ?? o)
  return (
    <section className="stack">
      <h3>Life modules</h3>
      <p className="muted">Every runner starts with the opening modules, then picks {count ?? '?'} adult ones.</p>
      <ul>
        {opening.map(m => (
          <li key={m.id}>
            <Sr6Ref kind="lifemodules" id={m.id}>
              <b>{m.name}</b>
            </Sr6Ref>{' '}
            <span className="muted">{grants(m)}</span>
          </li>
        ))}
      </ul>
      {bonus !== undefined && (
        <div className="row">
          <label className="inline">
            Best attribute (+{bonus})
            <select
              aria-label="Best attribute"
              value={b.bestAttr ?? ''}
              onChange={e => act({ op: 'bestAttr', attr: (e.target.value || null) as Sr6Attr | null })}
            >
              <option value="">Pick one</option>
              {CORE_ATTRS.map(a => (
                <option key={a} value={a}>
                  {ATTR_NAMES[a]}
                </option>
              ))}
            </select>
          </label>
          {rest > 0 && (
            <label className="inline">
              The other {rest} goes on
              <select
                aria-label="Best attribute rest"
                value={b.bestExtra ?? ''}
                onChange={e => act({ op: 'bestAttr', attr: b.bestAttr!, extra: (e.target.value || null) as Sr6Attr | null })}
              >
                <option value="">Pick one</option>
                {CORE_ATTRS.filter(a => a !== b.bestAttr).map(a => (
                  <option key={a} value={a}>
                    {ATTR_NAMES[a]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      <h4>
        Adult modules: {b.lifepath.length} of {count ?? '?'}
      </h4>
      {b.lifepath.map((t, at) => {
        const m = data.lifemodules[t.id]
        return (
          <div key={at} className="row">
            <span>
              <Sr6Ref kind="lifemodules" id={m?.id}>
                <b>{m?.name ?? t.id}</b>
              </Sr6Ref>{' '}
              <span className="muted">{m ? grants(m) : 'no longer in the catalog'}</span>
            </span>
            {m?.choices.map((c, i) => (
              <label key={i} className="inline">
                Choice {i + 1} ({c.points})
                <select value={t.choices[i] ?? ''} onChange={e => act({ op: 'lifemodule', id: t.id, choice: i, pick: e.target.value, at })}>
                  <option value="" disabled>
                    Pick one
                  </option>
                  {c.options.map(o => (
                    <option key={o} value={o}>
                      {option(o)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <button className="btn small quiet" aria-label={`Remove ${m?.name ?? t.id}`} onClick={() => act({ op: 'lifemodule', remove: t.id, at })}>
              Remove
            </button>
          </div>
        )
      })}
      {free.length > 0 && (
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Module</th>
                <th>Gives</th>
                <th />
              </tr>
            </thead>
            {/* a module for another magic kind may still be taken: Review's lifepath.requires */}
            <tbody>
              {free.map(m => (
                <tr key={m.id}>
                  <td>
                    <Sr6Ref kind="lifemodules" id={m.id}>
                      {m.name}
                    </Sr6Ref>
                    {!m.fits && <span className="err"> (for {m.requires} runners)</span>}
                  </td>
                  <td className="muted">
                    {grants(m)}
                    {m.choices.length ? `, plus ${m.choices.length} choice` : ''}
                  </td>
                  <td>
                    <button className="btn small" aria-label={`Add ${m.name}`} onClick={() => act({ op: 'lifemodule', id: m.id })}>
                      {m.taken ? 'Add again' : 'Add'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
