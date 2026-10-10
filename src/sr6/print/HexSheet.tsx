// SR6 "Hex" printed sheet (Settings → Printed sheet): one page in the official sheet's style. Centred titles between
// hatched rules; personal data on write-in lines; the nine attributes as big hexagons with the derived values under
// them; every skill in three columns with [rank] [pool] brackets; core combat (weapons, armor, Defense Rating,
// REA+INT and Edge as hexagons); qualities; a blank Edge panel by cost 1–5 (the catalog has no Edge actions to list);
// a dark band with the Physical and Stun tracks as hexagons. Our own drawing, dark ink with pink rules (sheet.css .sr6-hex).
import type { ReactNode } from 'react'
import { MAGIC_KINDS } from '../engine/data'
import { MAGIC_KIND_LABELS } from '../model/character'
import { useSr6Editor } from '../ui/editor'
import type { SheetArt } from './BookSheet'
import { allSkills, band, br, poolOn, runnerView } from './view'

/** a pointy-topped hexagon with a value (and a small line under it) inside */
function Hex({ v, sub, className }: { v?: ReactNode; sub?: ReactNode; className?: string }) {
  return <svg viewBox="0 0 24 27" className={className}><polygon points="12,1 23,7.3 23,19.7 12,26 1,19.7 1,7.3" />
    {v !== undefined && <text x="12" y={sub ? 15 : 17.6} className="x-v">{v}</text>}{sub && <text x="12" y="21.4" className="x-s">{sub}</text>}</svg>
}
/** a damage track as hexagons, every third marked with its modifier; boxes past the runner's count blacked out */
function Track({ count, total, label }: { count: number | null; total: number; label: string }) {
  const all = Math.max(total, Math.ceil((count ?? 0) / 3) * 3)
  return <span className="x-track" role="img" aria-label={count === null ? `${label}: a setting isn’t set` : `${label}: ${count} boxes`}>
    {Array.from({ length: all }, (_, i) => <Hex key={i} className={count !== null && i >= count ? 'off' : undefined} v={i % 3 === 2 ? `−${(i + 1) / 3}` : undefined} />)}</span>
}
const Title = ({ id, children }: { id: string; children: ReactNode }) => <h2 id={id} className="x-title"><span>{children}</span></h2>
const F = ({ l, v }: { l: string; v?: ReactNode }) => <div className="x-f"><span>{l}</span><b>{v}</b></div>
/** blank ruled rows up to `min` */
const blanks = (have: number, min: number, row: (i: number) => ReactNode) => Array.from({ length: Math.max(0, min - have) }, (_, i) => row(i))

export function HexSheet({ art }: { art: SheetArt }) {
  const ctx = useSr6Editor(), { ch, data, d } = ctx
  const b = ch.build, k = MAGIC_KINDS[b.magic]
  const v = runnerView(ctx), { lines, nameOf, attrsOf } = v
  const init1 = (i?: { base: number; dice: number | null }) => i && `${i.base} + ${i.dice ?? '?'}D6`
  const init = (i?: { base: number; dice: number | null }, o?: { base: number; dice: number | null }) => br(init1(i), init1(o))
  const skills = allSkills(d, data), rows = Math.max(6, Math.ceil(skills.length / 3))
  const mr = k.resonance ? d.attrs.res : b.magic !== 'mundane' ? d.attrs.mag : undefined
  const attrs: [string, { natural: number; augmented: number } | undefined][] = [['BOD', d.attrs.bod], ['AGI', d.attrs.agi], ['REA', d.attrs.rea],
    ['STR', d.attrs.str], ['WIL', d.attrs.wil], ['LOG', d.attrs.log], ['INT', d.attrs.int], ['CHA', d.attrs.cha], ['M/R', mr]]
  const armor = lines('armor'), weapons = lines('weapons'), edge = d.attrs.edg.augmented

  return (
    <article className="sr6-hex" style={art.vars}>
      {art.layer}
      <header className="x-head"><span className="k-brand" role="img" aria-label="Chummer Shadowrun 6">Chummer <b>Shadowrun</b> 6</span></header>

      <section aria-labelledby="x-personal"><Title id="x-personal">Personal data</Title>
        <div className="x-two">
          <F l="Name" v={<>{v.name}{ch.identity.name && ch.identity.name !== v.name && <span className="x-small"> ({ch.identity.name})</span>}</>} />
          <F l="Metatype" v={[data.metatypes[b.metatype]?.name, ch.identity.gender].filter(Boolean).join(', ') || undefined} />
          <F l="Description" v={ch.identity.background.split('\n')[0]} />
          <F l="Archetype" v={b.magic !== 'mundane' ? [MAGIC_KIND_LABELS[b.magic], k.spells && b.tradition].filter(Boolean).join(', ') : undefined} />
        </div>
      </section>

      <section aria-labelledby="x-attrs"><Title id="x-attrs">Attributes</Title>
        <div className="x-attrs">{attrs.map(([l, x]) => <div key={l}><span>{l}</span>
          <Hex v={x?.natural} sub={x && x.augmented !== x.natural ? `(${x.augmented})` : undefined} /></div>)}</div>
        <div className="x-three">
          <div><F l="Initiative" v={init(d.initiative, d.on.initiative)} /><F l="Matrix Initiative" /><F l="Astral Initiative" v={init(d.astralInit, d.on.astralInit)} /></div>
          <div><F l="Composure" v={br(d.composure, d.on.composure)} /><F l="Judge Intentions" v={br(d.judgeIntentions, d.on.judgeIntentions)} /><F l="Memory" v={br(d.memory, d.on.memory)} /></div>
          <div><F l="Lift/Carry" v={br(d.liftCarry, d.on.liftCarry)} /><F l="Movement" /><F l="Defense Rating" v={br(d.defenseRating, d.on.defenseRating)} /></div>
        </div>
      </section>

      <section aria-labelledby="x-skills"><Title id="x-skills">Skills</Title>
        <ul className="x-skills" style={{ gridTemplateRows: `repeat(${rows}, auto)` }}>
          {skills.map(p => <li key={p.skill}><span>{p.label} ({p.attr.toUpperCase()})
            {p.spec && <span className="x-small"> {p.spec}{p.specDp !== undefined && ` ${br(p.specDp, poolOn(d, p.skill)?.specDp)}`}</span>}
            {p.expertise && <span className="x-small"> {p.expertise}*{p.expertiseDp !== undefined && ` ${br(p.expertiseDp, poolOn(d, p.skill)?.expertiseDp)}`}</span>}</span>
            <i>[<b>{p.rank}</b>]</i><i className="x-pool">[<b>{br(p.dp, poolOn(d, p.skill)?.dp) ?? '—'}</b>]</i></li>)}
          {blanks(skills.length, rows * 3, i => <li key={`b${i}`} aria-hidden="true"><span /><i>[<b /> ]</i><i className="x-pool">[<b /> ]</i></li>)}
        </ul>
      </section>

      <section aria-labelledby="x-combat"><Title id="x-combat">Core combat</Title>
        <div className="x-combat">
          <table className="x-weapons"><thead><tr><th>Weapons</th><th>DV</th><th>Mode</th><th>Close</th><th>Near</th><th>Med</th><th>Far</th><th>Ext</th><th>Ammo</th></tr></thead>
            <tbody>{weapons.map(x => { const a = attrsOf(x); return <tr key={x.uid}><td>{nameOf(x)}{x.accessories.length > 0 && <span className="x-small"> + {x.accessories.map(nameOf).join(', ')}{v.host(x) && ` (${v.host(x)})`}</span>}</td>
              <td>{a.dv}</td><td>{a.modes}</td>{v.bands(x).map((y, i) => <td key={i}>{band(y)}</td>)}<td>{a.ammo}</td></tr> })}
              {blanks(weapons.length, 4, i => <tr key={`b${i}`} className="x-blank" aria-hidden="true">{Array.from({ length: 9 }, (_, j) => <td key={j} />)}</tr>)}</tbody></table>
          <div>
            <table><thead><tr><th>Armor</th><th>Rating</th><th>Notes</th></tr></thead>
              <tbody>{armor.map(x => <tr key={x.uid}><td>{nameOf(x)}</td><td>{attrsOf(x).defense}</td><td>{[x.worn && 'Worn', x.note].filter(Boolean).join(', ')}</td></tr>)}
                {blanks(armor.length, 2, i => <tr key={`b${i}`} className="x-blank" aria-hidden="true"><td /><td /><td /></tr>)}</tbody></table>
            <div className="x-big">
              <span>DR</span><Hex v={d.defenseRating} />
              <span>R+I</span><Hex v={d.initiative.base} sub={`+${d.initiative.dice ?? '?'}D6`} />
              <span>EDG</span><Hex v={edge} />
              <span className="x-edge" role="img" aria-label={`Edge points: ${edge}`}>{Array.from({ length: Math.max(7, edge) }, (_, i) => <i key={i} className={i >= edge ? 'off' : undefined} />)}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="x-lower">
        <section aria-labelledby="x-qualities"><Title id="x-qualities">Qualities</Title>
          <ul className="x-lines">{b.qualities.map(q => { const x = data.qualities[q.id]; return <li key={q.uid}>{x?.name ?? q.name ?? q.id}{x?.perLevel && ` ${q.level}`}
            <span className="x-small">{q.free ? ' metatype' : x ? (x.positive ? ' positive' : ' negative') : ''}{q.note && `, ${q.note}`}</span></li> })}
            {blanks(b.qualities.length, 8, i => <li key={`b${i}`} aria-hidden="true" />)}</ul>
        </section>
        <section aria-labelledby="x-edge"><Title id="x-edge">Edge</Title>
          <ol className="x-costs">{[1, 2, 3, 4, 5].map(c => <li key={c}><b>{c}</b><span /><span /></li>)}</ol>
        </section>
      </div>

      <section className="x-band" aria-label="Condition monitor">
        <div><span className="x-bl">Physical</span><Track count={d.monitors.physical} total={18} label="Physical damage track" /></div>
        <div><span className="x-bl">Stun</span><Track count={d.monitors.stun} total={15} label="Stun damage track" />
          <span className="x-bl">Overflow</span><span className="x-over" role="img" aria-label={`Overflow: ${d.monitors.overflow} boxes`}>
            {Array.from({ length: Math.max(1, d.monitors.overflow) }, (_, i) => <Hex key={i} />)}</span></div>
      </section>
    </article>
  )
}
