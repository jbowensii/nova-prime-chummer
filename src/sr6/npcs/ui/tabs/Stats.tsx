// Stat block (an NPC's own tab): its kind, rating and group, where it was copied from, one row per stat (the value as
// printed, editable, and the value at the rating; a mark when it can't be read), an Add stat for a missing standard key,
// one box per line part the kind uses (a designed critter's skills, powers and weaknesses read only: the Design tab writes
// them), and the NPC block as it prints.
import { useState } from 'react'
import { Stepper } from '../../../../core/ui-kit/bits'
import { NPC_KINDS, NPC_STATS, npcParts, npcValues } from '../../../runner-builder/domain/creation/npc'
import type { Sr6Npc } from '../../../formats/domain/character'
import { NpcBlock } from '../../../runner-builder/ui/NpcBlock'
import { useSr6Editor } from '../../../runner-builder/ui/editor'
import { Sr6Ref } from '../../../runner-builder/ui/EntryRef'

/** a designed critter's lines the Design tab writes */
const DESIGNED = new Set(['skills', 'powers', 'weaknesses'])

export function StatsTab() {
  const { ch, data, update } = useSr6Editor()
  const [adding, setAdding] = useState('')
  const npc = ch.npc
  if (!npc) return <p className="muted">This isn’t an NPC.</p>
  const k = NPC_KINDS[npc.kind],
    values = npcValues(npc)
  const set = (fn: (n: Sr6Npc) => void) =>
    update(d => {
      if (d.npc) fn(d.npc)
    })
  const setStat = (key: string, v: string) =>
    set(n => {
      if (v.trim()) n.stats[key] = v.trim().slice(0, 80)
      else delete n.stats[key]
    })
  const missing = NPC_STATS.filter(([key]) => !(key in npc.stats))
  const lineOf = (part: string) =>
    npc.lines
      .filter(l => l.part === part)
      .map(l => l.text)
      .join('\n')
  const setLine = (part: string, text: string) =>
    set(n => {
      const at = n.lines.findIndex(l => l.part === part)
      const rest = n.lines.filter(l => l.part !== part)
      if (text) rest.splice(at < 0 ? rest.length : at, 0, { part, text }) // keeps its place in the order
      n.lines = rest
    })
  const name = ch.identity.streetName || ch.identity.name || 'Unnamed NPC'
  const from = npc.from

  return (
    <div className="stack">
      <h2>Stat block</h2>
      <p className="muted">
        {k.label}.{' '}
        {from ? (
          <>
            Made from{' '}
            <Sr6Ref kind={from.kind} id={from.id}>
              <b>{from.name}</b>
            </Sr6Ref>{' '}
            ({from.source} p.{from.page}).
          </>
        ) : (
          'Blank.'
        )}{' '}
        The values are a copy: change them here. {k.rating?.letter && `A stat with ${k.rating.letter} in it is worked out at the ${k.rating.label}.`}
      </p>
      <div className="row">
        {k.rating && (
          <label className="inline">
            {k.rating.label}
            <Stepper
              label={k.rating.label}
              value={npc.rating ?? 0}
              min={k.rating.letter ? 1 : 0}
              max={99}
              onChange={v =>
                set(n => {
                  if (v > 0) n.rating = v
                  else delete n.rating
                })
              }
            />
          </label>
        )}
        {npc.kind === 'grunt' && (
          <label className="inline">
            Group
            <input
              value={npc.group ?? ''}
              maxLength={80}
              onChange={e =>
                set(n => {
                  if (e.target.value) n.group = e.target.value
                  else delete n.group
                })
              }
            />
          </label>
        )}
      </div>
      <div className="scroll-x">
        <table className="data sr6-npc-edit">
          <thead>
            <tr>
              <th>Stat</th>
              <th>As printed</th>
              <th>At this {k.rating?.label ?? 'NPC'}</th>
            </tr>
          </thead>
          <tbody>
            {values.map(v => (
              <tr key={v.key}>
                <td>{v.label}</td>
                <td>
                  <input
                    key={v.printed}
                    defaultValue={v.printed}
                    aria-label={`${v.label} as printed`}
                    maxLength={80}
                    onBlur={e => {
                      if (e.target.value !== v.printed) setStat(v.key, e.target.value)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                    }}
                  />
                </td>
                <td>{v.ok ? <b>{v.value}</b> : <span className="warn">⚠ Can’t read this</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {missing.length > 0 && (
        <label className="inline">
          Add stat
          <select
            value={adding}
            onChange={e => {
              const key = e.target.value
              setAdding('')
              if (key)
                set(n => {
                  n.stats[key] = '0'
                })
            }}
          >
            <option value="">Pick one</option>
            {missing.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="muted">Clear a stat’s value to take it off.</p>
      <div className="grid2">
        {npcParts(npc.kind).map(([part, label]) => (
          <label key={part}>
            {label}
            <textarea value={lineOf(part)} maxLength={4000} readOnly={!!npc.design && DESIGNED.has(part)} onChange={e => setLine(part, e.target.value)} />
          </label>
        ))}
      </div>
      {npc.design && <p className="muted">Skills, powers and weaknesses come from the Design tab.</p>}
      <hr className="sep" />
      <NpcBlock npc={npc} name={name} data={data} />
    </div>
  )
}
