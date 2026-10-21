// Design (a critter's own tab in NPCs & Critters, owner 2026-10-16, BUILDER Q11): no SR6 book prints critter design
// rules, so a stat-block editor with no budget. Attributes (Magic, Resonance and Essence too), initiative dice and
// movement; critter powers and weaknesses picked from the catalog (innate, 0 Karma) with a level and a note; skills
// with a rank and a specialization; the derived values by the book's formulas beside the stat block's (a typed value
// stays: Use derived takes it back); sanity warnings that never stop anything (src/sr6/npcs/domain/critterdesign.ts). The
// skills, powers and weaknesses lines are generated from here; the Stat block tab keeps the rest.
import { useState } from 'react'
import { Stepper } from '../../../../core/ui-kit/bits'
import { CRITTER_ATTRS, critterDerived, critterWarnings, DERIVED, designCritter, redesign } from '../../domain/critterdesign'
import { firstNumber } from '../../../runner-builder/domain/assets/critters'
import type { Sr6CritterPower, Sr6Npc } from '../../../formats/domain/character'
import { useSr6Editor } from '../../../runner-builder/ui/editor'
import { Sr6Ref } from '../../../runner-builder/ui/EntryRef'
import { CatalogPicker } from '../../../runner-builder/ui/Picker'

const DERIVED_LABELS: Record<(typeof DERIVED)[number], [string, string]> = {
  cm: ['Condition monitor', 'the table’s monitor base + Body ÷ its divisor, rounded up (CRB Hong Kong p. 38)'],
  dr: ['Defense Rating', 'Body + its Armor powers’ levels (CRB p. 67)'],
  init: ['Initiative', 'Reaction + Intuition, plus the dice (CRB pp. 39, 67)'],
}
type List = 'powers' | 'weaknesses'

export function DesignTab() {
  const { c, ch, data, cr, update } = useSr6Editor()
  const [adding, setAdding] = useState<List | ''>('')
  const npc = ch.npc
  if (npc?.kind !== 'critter') return <p className="muted">Only a critter is designed here.</p>
  if (!npc.design)
    return (
      <div className="stack">
        <h2>Design</h2>
        <p>
          Design this critter: its powers, weaknesses and skills picked from the catalog, its Condition Monitor, Defense Rating and Initiative worked out for
          you. Its printed lines are read into the catalog’s entries; its printed values stay until you change them.
        </p>
        <p>
          <button className="btn primary" onClick={() => update(d => d.npc && designCritter(d.npc, data, cr))}>
            Design this critter
          </button>
        </p>
      </div>
    )
  const d = npc.design
  const set = (fn: (n: Sr6Npc) => void) =>
    update(x => {
      if (x.npc?.design) redesign(x.npc, data, cr, fn)
    })
  const setStat = (k: string, v: string) =>
    set(n => {
      if (v.trim() && v.trim() !== '0') n.stats[k] = v.trim().slice(0, 80)
      else delete n.stats[k]
    })
  const derived = critterDerived(npc, data, cr)
  const printed = [...c.entries.critters.values()].filter(e => c.sources.get(e.source)?.origin !== 'user')
  const warnings = critterWarnings(npc, data, cr, printed)
  const skills = Object.values(data.skills)
    .filter(s => !d.skills.some(x => x.id === s.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  const powerRow = (list: List, p: Sr6CritterPower, i: number) => {
    const edit = (fn: (q: Sr6CritterPower) => void) =>
      set(n => {
        fn(n.design![list][i])
      })
    return (
      <li key={`${p.id ?? p.name}-${i}`} className="row">
        {p.id ? (
          <Sr6Ref kind="critterpowers" id={p.id}>
            {p.name}
          </Sr6Ref>
        ) : (
          <span>{p.name}</span>
        )}
        <label className="inline">
          Level
          <input
            type="number"
            min={0}
            step={1}
            style={{ width: '4em' }}
            aria-label={`${p.name} level`}
            value={p.level ?? ''}
            onChange={e =>
              edit(q => {
                const v = Math.floor(Number(e.target.value))
                if (e.target.value !== '' && v >= 0) q.level = v
                else delete q.level
              })
            }
          />
        </label>
        <label className="inline">
          Note
          <input
            aria-label={`${p.name} note`}
            value={p.note ?? ''}
            maxLength={200}
            onChange={e =>
              edit(q => {
                if (e.target.value) q.note = e.target.value
                else delete q.note
              })
            }
          />
        </label>
        <button
          className="btn small quiet"
          aria-label={`Remove ${p.name}`}
          onClick={() =>
            set(n => {
              n.design![list].splice(i, 1)
            })
          }
        >
          Remove
        </button>
      </li>
    )
  }

  return (
    <div className="stack">
      <h2>Design</h2>
      <p className="muted">
        No SR6 book prints rules for designing a critter: nothing here is a budget, and a warning never stops you. Critter powers are innate: 0 Karma.
      </p>

      <h3>Attributes</h3>
      <div className="row">
        {CRITTER_ATTRS.map(([k, label]) =>
          k === 'ess' ? (
            <label key={k} className="inline">
              {label}
              <input
                type="number"
                min={0}
                step={0.1}
                style={{ width: '5em' }}
                aria-label={label}
                value={npc.stats.ess ?? ''}
                onChange={e => setStat('ess', e.target.value)}
              />
            </label>
          ) : (
            <label key={k} className="inline">
              {label}
              <Stepper label={label} value={firstNumber(npc.stats[k])} min={0} max={99} onChange={v => setStat(k, String(v))} />
            </label>
          ),
        )}
      </div>
      <div className="row">
        <label className="inline">
          Initiative dice
          <Stepper
            label="Initiative dice"
            value={d.dice}
            min={1}
            max={99}
            onChange={v =>
              set(n => {
                n.design!.dice = v
              })
            }
          />
        </label>
        <label className="inline">
          Movement
          <input
            key={npc.stats.move ?? ''}
            aria-label="Movement"
            defaultValue={npc.stats.move ?? ''}
            maxLength={80}
            onBlur={e => {
              if (e.target.value !== (npc.stats.move ?? '')) setStat('move', e.target.value)
            }}
          />
        </label>
      </div>

      {(['powers', 'weaknesses'] as const).map(list => (
        <section key={list} aria-label={list === 'powers' ? 'Powers' : 'Weaknesses'} className="stack" style={{ gap: '0.25rem' }}>
          <h3>{list === 'powers' ? 'Powers (innate, 0 Karma)' : 'Weaknesses'}</h3>
          {d[list].length ? <ul style={{ listStyle: 'none', padding: 0 }}>{d[list].map((p, i) => powerRow(list, p, i))}</ul> : <p className="muted">None.</p>}
          <p>
            <button className="btn small" onClick={() => setAdding(list)}>
              {list === 'powers' ? 'Add power…' : 'Add weakness…'}
            </button>
          </p>
        </section>
      ))}

      <section aria-label="Skills" className="stack" style={{ gap: '0.25rem' }}>
        <h3>Skills</h3>
        {d.skills.length ? (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {d.skills.map((s, i) => (
              <li key={`${s.id ?? s.name}-${i}`} className="row">
                {s.id ? (
                  <Sr6Ref kind="skills" id={s.id}>
                    {s.name}
                  </Sr6Ref>
                ) : (
                  <span>{s.name}</span>
                )}
                <Stepper
                  label={`${s.name} rank`}
                  value={s.rank}
                  min={0}
                  max={99}
                  onChange={v =>
                    set(n => {
                      n.design!.skills[i].rank = v
                    })
                  }
                />
                <label className="inline">
                  Specialization
                  <input
                    aria-label={`${s.name} specialization`}
                    value={s.spec ?? ''}
                    maxLength={80}
                    onChange={e =>
                      set(n => {
                        if (e.target.value) n.design!.skills[i].spec = e.target.value
                        else delete n.design!.skills[i].spec
                      })
                    }
                  />
                </label>
                <button
                  className="btn small quiet"
                  aria-label={`Remove ${s.name}`}
                  onClick={() =>
                    set(n => {
                      n.design!.skills.splice(i, 1)
                    })
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">None.</p>
        )}
        <label className="inline">
          Add skill
          <select
            value=""
            onChange={e => {
              const s = data.skills[e.target.value]
              if (s)
                set(n => {
                  n.design!.skills.push({ id: s.id, name: s.name, rank: 1 })
                })
            }}
          >
            <option value="">Pick one</option>
            {skills.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <h3>Derived</h3>
      <table className="data">
        <thead>
          <tr>
            <th>Value</th>
            <th>Worked out</th>
            <th>Stat block</th>
            <th>How</th>
          </tr>
        </thead>
        <tbody>
          {DERIVED.map(k => (
            <tr key={k}>
              <td>{DERIVED_LABELS[k][0]}</td>
              <td>{derived[k] ?? <span className="warn">Set the monitor base and divisor: Table setup → Creation rules</span>}</td>
              <td>
                {npc.stats[k] ?? '—'}
                {derived[k] != null && npc.stats[k] !== derived[k] && (
                  <>
                    {' '}
                    <button
                      className="btn small quiet"
                      aria-label={`Use the worked-out ${DERIVED_LABELS[k][0]}`}
                      onClick={() =>
                        update(x => {
                          if (x.npc) x.npc.stats[k] = derived[k]!
                        })
                      }
                    >
                      Use worked out
                    </button>
                  </>
                )}
              </td>
              <td className="muted">{DERIVED_LABELS[k][1]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {warnings.length > 0 && (
        <>
          <h3 id="design-warnings">Warnings</h3>
          <ul aria-labelledby="design-warnings">
            {warnings.map(w => (
              <li key={w.message} className="warn">
                {w.message}
                {w.source && ` (${w.source}${w.page ? ` p. ${w.page}` : ''})`}
              </li>
            ))}
          </ul>
        </>
      )}

      {adding && (
        <CatalogPicker
          title={adding === 'powers' ? 'Add a critter power' : 'Add a weakness'}
          open
          onClose={() => setAdding('')}
          kinds={['critterpowers']}
          filter={e => (e.attrs.weakness === 'true') === (adding === 'weaknesses')}
          onAdd={p => {
            set(n => {
              n.design![adding].push({ id: p.e.id, name: p.e.name })
            })
            return null
          }}
        />
      )}
    </div>
  )
}
