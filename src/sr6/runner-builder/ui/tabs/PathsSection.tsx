// Quality Paths on the Qualities tab: the paths the runner may start (or is on), the current step (its text, what it
// grants, the choice it asks, the steps that can follow), and a way to step, rewind or drop. Add/remove mods move the
// quality rows; valmod and choice mods are shown only (applied at the table). domain/paths.ts does the work.
import { useEffect, useState } from 'react'
import type { PathChoiceOption, PathModification, QualityPath } from '../../../catalog/domain/data'
import { getQualityPaths, PATH_BOOKS } from '../../../catalog/domain/load'
import { advancePath, chooseAt, PATH_SOURCE, pathsFor, progressOf, qualityIdOf, removePath, rewindPath, startPath, stepOf } from '../../domain/paths'
import { useSr6Editor } from '../editor'

const nice = (id: string) => (t => t[0].toUpperCase() + t.slice(1))(id.replace(/_/g, ' '))

export function PathsSection({ load = getQualityPaths }: { load?: (book: string) => Promise<QualityPath[]> }) {
  const { c, ch, data, cr, update, ro, career } = useSr6Editor()
  const [paths, setPaths] = useState<QualityPath[]>([])
  const [notes, setNotes] = useState<string[]>([])
  useEffect(() => {
    let live = true
    void Promise.all(PATH_BOOKS.map(b => load(b))).then(r => live && setPaths(r.flat()))
    return () => {
      live = false
    }
  }, [load])
  const shown = pathsFor(ch, data, cr, paths)
  if (shown.length === 0) return null
  // (a finalized runner's qualities come from its ledger, not the build: no stepping there)
  const locked = ro || career
  const run = (fn: (c: typeof ch) => string[]) => update(c => setNotes(fn(c)))
  const bookName = (key: string) => c?.sources.get(PATH_SOURCE[key])?.name ?? nice(key)
  const label = (m: PathModification, path: QualityPath) => {
    if (m.op === 'add' || m.op === 'remove') {
      const id = qualityIdOf(data, m.ref, path.bookKey, path)
      return `${m.op === 'add' ? 'Gains' : 'Loses'} ${id ? data.qualities[id]?.name : m.ref.replace(/^quality:/, '')}`
    }
    return m.op === 'valmod' ? `${m.attr} ${m.value ?? ''}`.trim() : m.op === 'subOption' ? `Option: ${m.label}` : 'Choose one'
  }

  return (
    <section aria-label="Quality paths" className="stack">
      <h3>Quality paths</h3>
      {notes.map(s => (
        <p key={s} className="err small">
          Skipped: {s}
        </p>
      ))}
      {shown.map(path => {
        const p = progressOf(ch, path)
        const cur = p && stepOf(path, p.currentStepId)
        return (
          <div key={path.id} className="card" data-path={path.id}>
            <b>{path.name}</b> <span className="muted small">{bookName(path.bookKey)}</span>{' '}
            {!p ? (
              <button className="btn small" disabled={locked} onClick={() => run(c => startPath(c, path, data, cr))}>
                Start this path
              </button>
            ) : (
              <>
                <button className="btn small quiet" disabled={locked} onClick={() => run(c => rewindPath(c, path, data, cr))}>
                  Back a step
                </button>{' '}
                <button className="btn small quiet" disabled={locked} onClick={() => run(c => removePath(c, path, data, cr))}>
                  Remove path
                </button>
              </>
            )}
            {p && cur && (
              <div>
                <h4>
                  {cur.name} <span className="muted small">(step {p.visitedStepIds.length})</span>
                </h4>
                {cur.body ? (
                  <p>{cur.body}</p>
                ) : (
                  <ul className="muted small">
                    {cur.modifications.map((m, i) => (
                      <li key={i}>{label(m, path)}</li>
                    ))}
                  </ul>
                )}
                {cur.modifications.some(m => m.op === 'valmod' || m.op === 'choice') && (
                  <p className="muted small">Value changes and choices are applied manually at the table.</p>
                )}
                {cur.modifications.map((m, i) =>
                  m.op === 'choice' ? (
                    <Choice
                      key={i}
                      options={m.options.map(o => ({
                        ...o,
                        label:
                          m.type === 'QUALITY'
                            ? (data.qualities[qualityIdOf(data, `quality:${o.ref}`, path.bookKey, path) ?? '']?.name ?? nice(o.ref))
                            : nice(o.ref),
                      }))}
                      stepId={cur.id}
                      pick={p.choicesByStepId[cur.id]}
                      disabled={locked}
                      onPick={(o, s) => run(x => chooseAt(x, path, cur.id, o, s, data, cr))}
                    />
                  ) : null,
                )}
                {cur.nextSteps.length > 0 && (
                  <p>
                    Next:{' '}
                    {cur.nextSteps.map(id => (
                      <button key={id} className="btn small" disabled={locked} onClick={() => run(c => advancePath(c, path, id, data, cr))}>
                        {stepOf(path, id)?.name ?? id}
                      </button>
                    ))}
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

function Choice(props: {
  options: PathChoiceOption[]
  stepId: string
  pick?: { optionRef: string; subOptionRef?: string }
  disabled: boolean
  onPick(option: string, sub?: string): void
}) {
  const sel = props.options.find(o => o.ref === props.pick?.optionRef)
  return (
    <p>
      <select aria-label="Path choice" disabled={props.disabled} value={props.pick?.optionRef ?? ''} onChange={e => props.onPick(e.target.value)}>
        <option value="">Choose…</option>
        {props.options.map(o => (
          <option key={o.ref} value={o.ref}>
            {o.label}
          </option>
        ))}
      </select>{' '}
      {sel?.subOptions?.length ? (
        <select
          aria-label="Path sub-option"
          disabled={props.disabled}
          value={props.pick?.subOptionRef ?? ''}
          onChange={e => props.onPick(sel.ref, e.target.value || undefined)}
        >
          <option value="">Choose…</option>
          {sel.subOptions.map(s => (
            <option key={s.ref} value={s.ref}>
              {nice(s.label)}
            </option>
          ))}
        </select>
      ) : null}
    </p>
  )
}
