// An SR6 NPC's block (the Stat block tab's preview and the NPC's print): its name and headline, the stats at its rating,
// the derived lines, the skills with their pools and every other line as printed. A value the evaluator can't read shows
// as printed with a warning mark.
import { NPC_STATS, npcHeadline, npcParts, npcPools, npcValues, poolText } from '../engine/npc'
import type { Sr6Data } from '../engine/data'
import type { Sr6Npc } from '../model/character'

const DERIVED = ['init', 'dr', 'actions', 'cm', 'move']

export function NpcBlock({ npc, name, data }: { npc: Sr6Npc; name: string; data: Pick<Sr6Data, 'skills'> }) {
  const values = npcValues(npc), labels = new Map(NPC_STATS)
  const shown = (v: (typeof values)[number]) => v.ok ? v.value : <>{v.printed} <span className="warn" title="Can’t read this" aria-label="Can’t read this">⚠</span></>
  const stats = values.filter(v => !DERIVED.includes(v.key))
  const derived = DERIVED.map(k => values.find(v => v.key === k)).filter(v => v !== undefined)
  const pools = npcPools(npc, data)
  const lines = npcParts(npc.kind).filter(([p]) => p !== 'skills').map(([p, label]) => [label, npc.lines.filter(l => l.part === p).map(l => l.text).join('; ')])
    .filter(([, t]) => t)
  return (
    <section className="sr6-npc" aria-label="NPC block">
      <h3>{name}</h3>
      <p className="sr6-npc-head">{npcHeadline(npc)}</p>
      {stats.length > 0 && <div className="sr6-npc-stats">{stats.map(v => <div key={v.key}><span>{v.label}</span><b>{shown(v)}</b></div>)}</div>}
      <dl className="sr6-npc-lines">
        {derived.map(v => <div key={v.key}><dt>{labels.get(v.key)}</dt><dd>{shown(v)}</dd></div>)}
        {pools.length > 0 && <div><dt>Skills</dt><dd>{pools.map(poolText).join(', ')}</dd></div>}
        {lines.map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}
      </dl>
    </section>
  )
}
