// Creation method, lifepath: the modules picked in order (their cost, what each grants) and the running totals.
// Moved out of Method.tsx unchanged.
import { CORE_ATTRS } from '../../../formats/domain/character'
import { num } from '../../../table-setup/domain/creation'
import { type Grant, type Sr6LifeModuleView } from '../../../catalog/domain/data'
import { ATTR_NAMES, n, useSr6Editor } from '../editor'
import { Sr6Ref } from '../EntryRef'
import type { Sr6Attr } from '../../../formats/domain/character'

const GRANT_WORDS: Record<Grant, string> = {
  attributePoints: 'attribute points',
  skillPoints: 'skill points',
  adjustmentPoints: 'adjustment points',
  nuyen: '¥',
  contactPoints: 'contact points',
  knowledgeSkills: 'knowledge skills',
}

export function LifeModules() {
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
          <div key={at} className="stack">
            <div className="row">
              <span>
                <Sr6Ref kind="lifemodules" id={m?.id}>
                  <b>{m?.name ?? t.id}</b>
                </Sr6Ref>{' '}
                <span className="muted">{m ? grants(m) : 'no longer in the catalog'}</span>
              </span>
              <span className="spacer" />
              <button className="btn small quiet" aria-label={`Remove ${m?.name ?? t.id}`} onClick={() => act({ op: 'lifemodule', remove: t.id, at })}>
                Remove
              </button>
            </div>
            <div className="row" data-testid="lifemodule-choices">
              {m?.choices.map((c, i) => (
                <label key={i} className="inline">
                  {c.kind === 'knowledge' ? 'Knowledge skill' : `Choice ${i + 1} (${c.points})`}
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
            </div>
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
