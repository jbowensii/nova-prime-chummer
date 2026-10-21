// Skills: the catalog's active skills grouped by attribute, each with points and karma steppers, its dice pool, a
// specialization and an expertise (the catalog's or the player's own words; on a skill without a rank too, Review's
// skill.specUntrained); then knowledge skills and languages.
import { useState } from 'react'
import { Stepper } from '../../../core/ui-kit/bits'
import { NameField } from '../../../core/shared/ui'
import { num } from '../../table-setup/domain/creation'
import { SR6_ATTRS, type Sr6Knowledge } from '../../formats/domain/character'
import { ATTR_NAMES, useSr6Editor } from '../editor'
import { Left } from '../Budgets'
import { Sr6Ref } from '../EntryRef'
import { br, poolOn } from '../../print/view'
import { manySpecs, notesText } from '../../engine/budgets'
import { adeptBars } from '../../engine/actions'

/** A text box with suggestions that commits on Enter or leaving it ('' clears). */
export function Suggest({ value, label, options, onCommit }: { value: string; label: string; options: string[]; onCommit: (v: string | null) => void }) {
  const [v, setV] = useState(value),
    [was, setWas] = useState(value),
    list = `dl-${label.replace(/\W+/g, '-')}`
  if (value !== was) {
    setWas(value)
    setV(value)
  }
  const commit = () => {
    const t = v.trim()
    if (t !== value) onCommit(t || null)
  }
  return (
    <>
      <input value={v} aria-label={label} list={list} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => e.key === 'Enter' && commit()} />
      <datalist id={list}>
        {options.map(o => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  )
}

export function SkillsTab() {
  const { ch, data, cr, d, budgets, act } = useSr6Editor()
  const b = ch.build
  const [kname, setKname] = useState(''),
    [kkind, setKkind] = useState<Sr6Knowledge['kind']>('knowledge')
  // (owner's decision 3: a pure adept isn't offered Sorcery, Conjuring or Enchanting; one it holds stays, to take off)
  const skills = Object.values(data.skills)
    .filter(s => !adeptBars(b, data, s.id) || b.skills.some(x => x.id === s.id))
    .sort((a, z) => a.name.localeCompare(z.name))
  const native = b.knowledge.find(k => k.native)
  const groups = SR6_ATTRS.map(a => [a, skills.filter(s => s.attr === a)] as const).filter(([, l]) => l.length)
  const cap = num(cr, 'skillCap'),
    spec = num(cr, 'skillPointsSpec'),
    exp = num(cr, 'skillPointsExpertise'),
    expKarma = num(cr, 'advance.expertise')
  const addKnowledge = () => {
    const name = kname.trim()
    if (name && !act({ op: 'knowledge', name, kind: kkind })) setKname('')
  }

  return (
    <div className="stack">
      <h2>Skills</h2>
      <p className="muted">
        Skill points: <Left x={budgets.skillPoints} />.{cap !== undefined && ` The highest rank at creation is ${cap}.`}
        {spec !== undefined && ` A specialization takes ${spec} skill points`}
        {exp !== undefined && `, an expertise ${exp}`}
        {spec !== undefined && '.'}
        {exp === undefined &&
          expKarma !== undefined &&
          ` An expertise costs ${expKarma} karma (it needs the specialization and a rank of ${num(cr, 'advance.expertiseRank') ?? 1} or more).`}
      </p>
      <div className="scroll-x">
        <table className="data sr6-skills">
          <thead>
            <tr>
              <th>Skill</th>
              <th>Points</th>
              <th>Karma</th>
              <th className="num">Rank</th>
              <th className="num">Dice</th>
              <th>Specialization</th>
              <th>Expertise</th>
            </tr>
          </thead>
          {groups.map(([a, list]) => (
            <tbody key={a}>
              <tr className="group">
                <td colSpan={7}>{ATTR_NAMES[a]}</td>
              </tr>
              {list.map(sk => {
                const s = b.skills.find(x => x.id === sk.id),
                  rank = (s?.points ?? 0) + (s?.karma ?? 0)
                const pool = d.pools.find(x => x.skill === sk.id)
                return (
                  <tr key={sk.id}>
                    <td>
                      <Sr6Ref kind="skills" id={sk.id}>
                        <b>{sk.name}</b>
                      </Sr6Ref>
                    </td>
                    {(['points', 'karma'] as const).map(k => (
                      <td key={k}>
                        <Stepper
                          label={`${sk.name} ${k}`}
                          value={s?.[k] ?? 0}
                          min={0}
                          max={99}
                          onChange={to => act({ op: 'skill', target: sk.id, pool: k, delta: to - (s?.[k] ?? 0) })}
                        />
                      </td>
                    ))}
                    <td className="num">{rank || ''}</td>
                    <td className="num" title={notesText(pool?.conditional ?? []) || undefined}>
                      {pool ? br(pool.dp, poolOn(d, sk.id)?.dp) : ''}
                      {pool?.specDp !== undefined && (
                        <div className="muted small">
                          {pool.spec} {br(pool.specDp, poolOn(d, sk.id)?.specDp)}
                        </div>
                      )}
                    </td>
                    {/* (a specialization's card: its skill's, with the specializations the book lists; the box's focus opens it) */}
                    <td>
                      <Sr6Ref kind="skills" id={sk.id} tabbable={false}>
                        <Suggest
                          label={`${sk.name} specialization`}
                          value={s?.spec ?? ''}
                          options={sk.specs}
                          onCommit={v => act({ op: 'spec', target: sk.id, spec: v })}
                        />
                      </Sr6Ref>
                      {/* (Exotic Weapons, CRB Hong Kong p. 95, or any skill with Expanded Specializations, SWC p. 153: more, `; `-separated) */}
                      {(s?.specs?.length || (s?.spec && manySpecs(data, cr, sk.id))) && (
                        <div>
                          <Suggest
                            label={`${sk.name} more specializations`}
                            value={(s?.specs ?? []).join('; ')}
                            options={[]}
                            onCommit={v => act({ op: 'specs', target: sk.id, specs: (v ?? '').split(/;\s*/) })}
                          />
                          {pool?.more?.map(m => (
                            <div key={m.spec} className="muted small">
                              {m.spec} {m.dp}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <Sr6Ref kind="skills" id={sk.id} tabbable={false}>
                        <Suggest
                          label={`${sk.name} expertise`}
                          value={s?.expertise ?? ''}
                          options={sk.specs}
                          onCommit={v => act({ op: 'expertise', target: sk.id, expertise: v })}
                        />
                      </Sr6Ref>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          ))}
        </table>
      </div>

      <hr className="sep" />
      <h2>Knowledge &amp; languages</h2>
      <p className="muted">
        Knowledge points: <Left x={budgets.knowledgePoints} />. One native language is free: tick Native on its line; it counts as level{' '}
        {num(cr, 'languageMax') ?? 4}, the highest a language goes.
      </p>
      {b.knowledge.length > 0 && (
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Native</th>
                <th>Points</th>
                <th>Karma</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {b.knowledge.map(k => (
                <tr key={k.uid}>
                  <td>
                    <NameField label={`Name of ${k.name}`} value={k.name} onCommit={name => act({ op: 'knowledge', uid: k.uid, name })} />
                  </td>
                  <td>
                    <select
                      aria-label={`Kind of ${k.name}`}
                      value={k.kind}
                      onChange={e => act({ op: 'knowledge', uid: k.uid, kind: e.target.value as Sr6Knowledge['kind'] })}
                    >
                      <option value="knowledge">Knowledge</option>
                      <option value="language">Language</option>
                    </select>
                  </td>
                  {/* (owner's decision 6: one native language a runner) */}
                  <td>
                    {k.kind === 'language' && (
                      <input
                        type="checkbox"
                        aria-label={`${k.name} is native`}
                        checked={!!k.native}
                        disabled={!!native && native !== k}
                        title={native && native !== k ? `${native.name} is the native language` : undefined}
                        onChange={e => act({ op: 'knowledge', uid: k.uid, native: e.target.checked })}
                      />
                    )}
                  </td>
                  {(['points', 'karma'] as const).map(p => (
                    <td key={p}>
                      {k.native ? (
                        p === 'points' ? (
                          <span className="muted">native</span>
                        ) : null
                      ) : (
                        <Stepper
                          label={`${k.name} ${p}`}
                          value={k[p]}
                          min={0}
                          max={99}
                          onChange={to => act({ op: 'knowledgeRank', uid: k.uid, pool: p, delta: to - k[p] })}
                        />
                      )}
                    </td>
                  ))}
                  <td>
                    <button className="btn small quiet" aria-label={`Remove ${k.name}`} onClick={() => act({ op: 'knowledge', remove: k.uid })}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row">
        <input
          value={kname}
          onChange={e => setKname(e.target.value)}
          placeholder="Knowledge skill or language"
          aria-label="New knowledge skill or language"
          onKeyDown={e => e.key === 'Enter' && addKnowledge()}
        />
        <select aria-label="New one is a" value={kkind} onChange={e => setKkind(e.target.value as Sr6Knowledge['kind'])}>
          <option value="knowledge">Knowledge</option>
          <option value="language">Language</option>
        </select>
        <button className="btn" disabled={!kname.trim()} onClick={addKnowledge}>
          Add
        </button>
      </div>
    </div>
  )
}
