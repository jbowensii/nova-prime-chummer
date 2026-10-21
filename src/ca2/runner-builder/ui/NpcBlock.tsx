// The NPC block on the Review tab and both printed sheets: kind, tier, fighting spirit, and the pools the GM rolls from.
import type { Derived } from '../domain/derive'
import { npcPoolLabel } from '../domain/npc'
import type { Catalog, Character } from '../../formats/domain/types'

// One line each, in our own words (CRB p.81 has the book's wording).
const SPIRIT: Record<string, string> = {
  null: 'Avoids combat, surrenders if threatened',
  low: 'Stops at the first light wound, or when a quarter of the allies are down',
  high: 'Fights on through light wounds; stops at the first serious one, or when half the allies are down',
  extreme: 'Keeps going until incapacitated; stops only when three quarters of the allies are down',
}
const KIND = { npc: 'NPC', critter: 'Critter', spirit: 'Spirit' }

export function NpcBlock({ c, ch, d, className }: { c: Catalog; ch: Character; d: Derived; className?: string }) {
  const n = ch.npc
  if (!n) return null
  const regular = n.tier === 'regular'
  return (
    <section className={`npc-block ${className ?? ''}`} aria-label="NPC">
      <h2>NPC</h2>
      <p>
        <b>{KIND[n.kind]}</b>, {n.tier} NPC
        {regular ? (
          '. No Edge.'
        ) : (
          <>
            . Edge <b>{d.edge}</b>.
          </>
        )}
      </p>
      {regular && (d.initiative ?? d.switched?.initiative) && (
        <p>
          Without Edge (CRB p.81): its initiative enhancement’s Edge is one more action per combat instead; an amp’s special effect for Edge works once per
          combat, free.
        </p>
      )}
      {n.fightingSpirit && (
        <p>
          Fighting spirit: <b>{n.fightingSpirit[0].toUpperCase() + n.fightingSpirit.slice(1)}</b>. {SPIRIT[n.fightingSpirit]}.
        </p>
      )}
      {regular ? (
        <>
          <p>Average hits (pool in dice, skill rating + attribute, Risk Reduction):</p>
          <ul>
            {d.pools.map((p, i) => {
              const spec = p.spec ? p.label.replace(/^.*\(|\)$/g, '') : undefined
              return <li key={i}>{npcPoolLabel(c.skills.get(p.skill)?.name ?? p.skill, spec, p.rating, p.attr, p.dp - p.rating - (spec ? 2 : 0), p.rr)}</li>
            })}
          </ul>
        </>
      ) : (
        <ul>
          {d.pools.map((p, i) => (
            <li key={i}>
              {p.label} {p.dp} ({p.rating}
              {p.spec ? '+2' : ''}+{p.attr[0].toUpperCase()}, RR {p.rr})
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
