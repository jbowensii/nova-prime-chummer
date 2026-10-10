// SR6 "Dossier" printed sheet (Settings → Printed sheet): rounded panels under solid magenta title bars, up to two
// pages. Page 1: personal data, Edge and nuyen, the portrait; attributes beside the derived values; qualities split
// positive/negative; the condition monitor; every skill in two columns plus languages and knowledge; weapons (ranged and
// melee) and armor with the Defense Rating. Then augmentations, gear, contacts, IDs, magic and vehicles. A footer: created
// with Chummer, the date and (printed) the page number. Our own drawing; dark ink, pink frames (sheet.css .sr6-dossier).
import type { ReactNode } from 'react'
import { bdClass, printBackdrop } from '../../ui/Portrait'
import { priced } from '../engine/budgets'
import { MAGIC_KINDS } from '../engine/data'
import { gradeName } from '../engine/grades'
import { CORE_ATTRS, MAGIC_KIND_LABELS, sinName } from '../model/character'
import { ATTR_NAMES, n, useSr6Editor } from '../ui/editor'
import { Hexes, type SheetArt } from './BookSheet'
import { allSkills, attrShown, band, br, PICKS, poolOn, runnerView } from './view'
import { entryLabel } from '../engine/categories'

function Panel({ id, title, className = '', children }: { id: string; title: string; className?: string; children: ReactNode }) {
  return <section className={`d-panel ${className}`} aria-labelledby={id}><h2 id={id}>{title}</h2><div className="d-body">{children}</div></section>
}
/** blank ruled table rows up to `min` */
const pad = (rows: ReactNode[], min: number, cols: number) => [...rows, ...Array.from({ length: Math.max(0, min - rows.length) }, (_, i) =>
  <tr key={`blank${i}`} className="d-blank" aria-hidden="true">{Array.from({ length: cols }, (_, j) => <td key={j} />)}</tr>)]
/** a damage track in one row, every third box marked with its modifier */
function Boxes({ count, label, marks = true }: { count: number | null; label: string; marks?: boolean }) {
  return count === null ? <span className="d-small">a setting isn’t set</span> : <span className="d-boxes" role="img" aria-label={`${label}: ${count} boxes`}>
    {Array.from({ length: count }, (_, i) => <span key={i}>{marks && i % 3 === 2 && <i>−{(i + 1) / 3}</i>}</span>)}</span>
}

export function DossierSheet({ art }: { art: SheetArt }) {
  const ctx = useSr6Editor(), { ch, data, cr, d } = ctx
  const b = ch.build, k = MAGIC_KINDS[b.magic], A = (a: keyof typeof d.attrs) => d.attrs[a].augmented
  const v = runnerView(ctx), { lines, nameOf, attrsOf } = v
  const skills = allSkills(d, data), half = Math.ceil(skills.length / 2)
  const mr = k.resonance ? 'res' as const : b.magic !== 'mundane' ? 'mag' as const : undefined
  const dice = d.initiative.dice
  const init1 = (i?: { base: number; dice: number | null }) => i && `${i.base} + ${i.dice ?? '?'}D6`
  const init = (i?: { base: number; dice: number | null }, o?: { base: number; dice: number | null }) => br(init1(i), init1(o))
  const quals = b.qualities.map(q => ({ q, x: data.qualities[q.id] }))
  const qual = ({ q, x }: (typeof quals)[number]) => <tr key={q.uid}><td>{x?.name ?? q.name ?? q.id}{x?.perLevel && ` ${q.level}`}
    {(q.free || q.note) && <span className="d-small"> {[q.free && 'metatype', q.note].filter(Boolean).join(', ')}</span>}</td></tr>
  const pos = quals.filter(x => !x.x || x.x.positive), neg = quals.filter(x => x.x && !x.x.positive)
  const acc = (x: (typeof b.purchases)[number]) => x.accessories.length > 0 && <span className="d-small"> + {x.accessories.map(nameOf).join(', ')}{v.host(x) && ` (${v.host(x)})`}</span>
  const attrRows: [string, ReactNode, ReactNode][] = [...CORE_ATTRS, 'edg' as const, ...(mr ? [mr] : [])].map(a => [ATTR_NAMES[a], d.attrs[a].natural, <b>{attrShown(d, a)}</b>])
  // CRB: a Minor Action, plus one per initiative die
  const derived: [string, ReactNode, ReactNode][] = [['Minor Actions', dice === null ? '' : 1 + dice, <b>{dice === null ? '' : 1 + dice}</b>],
    ['Initiative', d.initiative.base, <b>{init(d.initiative, d.on.initiative)}</b>], ['Initiative (Matrix)', '', ''],
    ['Initiative (Astral)', d.astralInit?.base, <b>{init(d.astralInit, d.on.astralInit)}</b>], ['Composure', d.composure, <b>{br(d.composure, d.on.composure)}</b>],
    ['Judge Intentions', d.judgeIntentions, <b>{d.judgeIntentions}</b>], ['Memory', d.memory, <b>{d.memory}</b>], ['Lift/Carry', d.liftCarry, <b>{d.liftCarry}</b>]]
  const skillTable = (rows: typeof skills, key: string) => <table key={key} className="d-skills">
    <thead><tr><th>Skill</th><th>Attr.</th><th>Rtg</th><th>Pool</th><th>Notes</th></tr></thead>
    <tbody>{pad(rows.map(p => <tr key={p.skill}><td>{p.label}</td><td>{p.attr.toUpperCase()}</td><td>{p.rank}</td><td><b>{br(p.dp, poolOn(d, p.skill)?.dp) ?? '—'}</b></td>
      <td className="d-small">{[p.spec && `${p.spec}${p.specDp !== undefined ? ` ${br(p.specDp, poolOn(d, p.skill)?.specDp)}` : ''}`,
        p.expertise && `${p.expertise}*${p.expertiseDp !== undefined ? ` ${br(p.expertiseDp, poolOn(d, p.skill)?.expertiseDp)}` : ''}`].filter(Boolean).join(', ')}</td></tr>), 10, 5)}</tbody></table>
  const picks = PICKS.map(([kind, label]) => [label, b.picks.filter(x => x.kind === kind)] as const).filter(([, xs]) => xs.length)
  const date = new Date().toLocaleDateString()

  return (
    <article className="sr6-dossier" style={art.vars}>
      {art.layer}
      {/* the printed footer: page margin boxes (src/sr6/print/sheet.css @page sr6dossier) with today's date */}
      <style>{`@page sr6dossier { @bottom-left { content: "${date}, created with Chummer"; } }`}</style>
      <div className="d-row d-first">
        <div className="d-who">
          <span className="k-brand" role="img" aria-label="Chummer Shadowrun 6">Chummer <b>Shadowrun</b> 6</span>
          <Panel id="d-personal" title="Personal data">
            <dl className="d-pairs">
              {([['Alias', v.name], ['Name', ch.identity.name], ['Metatype', data.metatypes[b.metatype]?.name],
                ['Magic/Resonance', mr ? `${MAGIC_KIND_LABELS[b.magic]} ${A(mr)}` : 'Mundane'], ['Gender', ch.identity.gender ?? ''], ['Height', ''], ['Weight', ''], ['Age', ''],
                ['Heat', ''], ['Reputation', ''], ['Karma', n(v.karma)], ['Total Karma', ''], ['Essence', n(d.essence)]] as [string, ReactNode][])
                .map(([l, x]) => <div key={l}><dt>{l}</dt><dd>{x}</dd></div>)}
            </dl>
          </Panel>
        </div>
        <Panel id="d-edge" title="Edge / Nuyen" className="d-edge">
          <div className="d-lbl">Edge <b>{A('edg')}</b></div>
          <Hexes count={A('edg')} total={7} label={`Edge points: ${A('edg')}`} />
          <div className="d-lbl">Nuyen (¥)</div>
          <div className="d-nuyen">{n(v.nuyen)}</div>
        </Panel>
        <Panel id="d-portrait" title="Portrait" className="d-portrait">
          {ch.identity.portrait && <img className={`d-pic${bdClass(printBackdrop(ch.identity.backdrop))}`} src={ch.identity.portrait} alt="" />}
        </Panel>
      </div>

      <div className="d-row d-second">
        <Panel id="d-attrs" title="Attributes">
          <table className="d-attrs"><thead><tr><th /><th>Rtg</th><th>Pool</th><th /><th>Rtg</th><th>Pool</th></tr></thead>
            <tbody>{Array.from({ length: Math.max(attrRows.length, derived.length) }, (_, i) => <tr key={i}>
              {[attrRows[i], derived[i]].map((r, j) => r ? [<th key={`a${j}`} scope="row">{r[0]}</th>, <td key={`b${j}`}>{r[1]}</td>, <td key={`c${j}`}>{r[2]}</td>]
                : [<td key={`a${j}`} />, <td key={`b${j}`} />, <td key={`c${j}`} />])}</tr>)}</tbody></table>
        </Panel>
        <Panel id="d-qualities" title="Qualities">
          <div className="d-split">
            <table><thead><tr><th>Positive</th></tr></thead><tbody>{pad(pos.map(qual), 8, 1)}</tbody></table>
            <table><thead><tr><th>Negative</th></tr></thead><tbody>{pad(neg.map(qual), 8, 1)}</tbody></table>
          </div>
        </Panel>
      </div>

      <Panel id="d-monitor" title="Condition monitor" className="d-monitor">
        <div><div className="d-lbl">Stun <span className="d-small">Healing: BOD + WIL = {A('bod') + A('wil')}</span></div>
          <Boxes count={d.monitors.stun} label="Stun damage track" />
          {d.drain !== undefined && <div className="d-small">Drain resist: {d.drain}</div>}{d.fading !== undefined && <div className="d-small">Fading resist: {d.fading}</div>}</div>
        <div><div className="d-lbl">Physical <span className="d-small">Healing: BOD + BOD = {2 * A('bod')}</span></div>
          <Boxes count={d.monitors.physical} label="Physical damage track" />
          <div className="d-small">Damage resist: BOD {A('bod')}</div></div>
        <div><div className="d-lbl">Overflow</div><Boxes count={d.monitors.overflow} label="Overflow" marks={false} /></div>
      </Panel>

      <Panel id="d-skills" title="Skills" className="d-skillp">
        <div className="d-skillcols">
          {skillTable(skills.slice(0, half), 'a')}{skillTable(skills.slice(half), 'b')}
          <table className="d-know"><thead><tr><th>Language/Knowledge</th></tr></thead>
            <tbody>{pad([...v.langs.map(x => <tr key={x.uid}><td>Lang: {x.name} {x.native ? '(Native)' : x.points + x.karma}</td></tr>),
              ...v.know.map(x => <tr key={x.uid}><td>{x.name}</td></tr>)], 10, 1)}</tbody></table>
        </div>
      </Panel>

      <div className="d-row d-third">
        <Panel id="d-weapons" title="Weapons">
          <table className="d-ranged"><thead><tr><th>Ranged weapon</th><th>Pool</th><th>Damage</th><th>Att.R.</th><th>Mode</th><th>Ammun.</th></tr></thead>
            <tbody>{pad(v.rangedWeapons.map(x => { const a = attrsOf(x); return <tr key={x.uid}><td>{nameOf(x)}{acc(x)}</td><td /><td>{a.dv}</td>
              <td>{v.bands(x).map(band).join('/')}</td><td>{a.modes}</td><td>{a.ammo}</td></tr> }), 4, 6)}</tbody></table>
          <table className="d-melee"><thead><tr><th>Melee weapon</th><th>Pool</th><th>Damage</th><th>Att.R.</th></tr></thead>
            <tbody><tr><td>Unarmed</td><td /><td /><td>{d.attackRatings.unarmed}</td></tr>
              {pad(v.meleeWeapons.map(x => <tr key={x.uid}><td>{nameOf(x)}{acc(x)}</td><td /><td>{attrsOf(x).dv}</td><td>{band(v.bands(x)[0])}</td></tr>), 2, 4)}</tbody></table>
        </Panel>
        <Panel id="d-armor" title="Armor">
          <table><thead><tr><th>Armor</th><th>Rating</th><th>Notes</th></tr></thead>
            <tbody><tr><td>Body</td><td>{A('bod')}</td><td /></tr>
              {pad(lines('armor').map(x => <tr key={x.uid}><td>{nameOf(x)}{acc(x)}</td><td>{attrsOf(x).defense}</td><td>{[x.worn ? 'Worn' : 'Not worn', x.note].filter(Boolean).join(', ')}</td></tr>), 4, 3)}
              <tr className="d-total"><th scope="row">Defensive rating</th><td>{br(d.defenseRating, d.on.defenseRating)}</td><td /></tr></tbody></table>
        </Panel>
      </div>

      <div className="d-row d-third">
        <Panel id="d-augs" title="Augmentations">
          <table><thead><tr><th>Augmentation</th><th>Rating</th><th>Grade</th><th>Essence</th></tr></thead>
            <tbody>{pad(lines('augmentations').map(x => <tr key={x.uid}><td>{nameOf(x)}{acc(x)}</td><td>{x.rating}</td>
              <td>{x.grade && gradeName(data, x.grade)}</td><td>{n(priced(x, data, cr).essence)}</td></tr>), 3, 4)}</tbody></table>
        </Panel>
        <Panel id="d-contacts" title="Contacts">
          <table><thead><tr><th>Contact</th><th>Connection</th><th>Loyalty</th></tr></thead>
            <tbody>{pad(b.contacts.map(x => <tr key={x.uid}><td>{x.name || 'Contact'}{x.archetype && <span className="d-small">, {x.archetype}</span>}</td>
              <td>{x.connection}</td><td>{x.loyalty}</td></tr>), 3, 3)}</tbody></table>
        </Panel>
      </div>

      <div className="d-row d-third">
        <Panel id="d-gear" title="Gear">
          <table><thead><tr><th>Item</th><th>Rating</th><th>Qty</th></tr></thead>
            <tbody>{pad(v.gear.map(x => <tr key={x.uid}><td>{nameOf(x)}{acc(x)}{x.note && <span className="d-small"> {x.note}</span>}</td><td>{x.rating}</td><td>{x.qty}</td></tr>), 4, 3)}</tbody></table>
        </Panel>
        <Panel id="d-ids" title="IDs / lifestyles">
          <table><thead><tr><th>SIN</th><th>Rating</th><th>Licenses</th><th>Lifestyles</th></tr></thead>
            <tbody>{pad(b.sins.map(s => <tr key={s.uid}><td>{sinName(s)}{s.gender && <span className="d-small"> {s.gender}</span>}</td>
              <td>{s.kind === 'real' ? 'real' : s.rating ?? 1}</td>
              <td>{s.licences.map(l => `${l.name} ${l.rating}`).join(', ')}</td><td>{v.lifeOf(s)}</td></tr>), 2, 4)}</tbody></table>
        </Panel>
      </div>

      {picks.length > 0 && <Panel id="d-magic" title={k.resonance ? 'Resonance' : 'Magic'}>
        <p className="d-small">{[k.spells && b.tradition, d.drain !== undefined && `Drain ${d.drain}`, d.fading !== undefined && `Fading ${d.fading}`,
          b.initiation > 0 && `Initiate ${b.initiation}`, b.submersion > 0 && `Submersion ${b.submersion}`].filter(Boolean).join(' · ')}</p>
        <table><thead><tr><th>Name</th><th>Kind</th><th>Type/target</th><th>Range</th><th>Duration</th><th>Drain</th></tr></thead>
          <tbody>{picks.flatMap(([label, xs]) => xs.map(x => { const e = data.entry(x.kind, x.id), a = e?.attrs ?? {}
            return <tr key={x.uid}><td>{e ? entryLabel(e) : x.name ?? x.id}{x.level !== undefined && ` ${x.level}`}</td><td>{label}</td>
              <td>{[a.category, a.type, a.keywords].filter(Boolean).join(', ')}</td><td>{a.range}</td><td>{a.duration}</td><td>{a.dv ?? a.fade}</td></tr> }))}</tbody></table>
      </Panel>}

      {lines('vehicles').length > 0 && <Panel id="d-vehicles" title="Vehicles & drones">
        <table><thead><tr><th>Vehicle</th><th>Hand.</th><th>Accel.</th><th>Speed</th><th>Body</th><th>Armor</th><th>Pilot</th><th>Sensor</th></tr></thead>
          <tbody>{lines('vehicles').map(x => { const a = attrsOf(x); return <tr key={x.uid}><td>{nameOf(x)}{acc(x)}</td><td>{a.handling}</td><td>{a.accel}</td>
            <td>{a.topSpeed}</td><td>{a.body}</td><td>{a.armor}</td><td>{a.pilot}</td><td>{a.sensor}</td></tr> })}</tbody></table>
      </Panel>}

      {(ch.identity.background || ch.identity.notes) && <Panel id="d-notes" title="Notes">
        {ch.identity.background && <p>{ch.identity.background}</p>}{ch.identity.notes && <p>{ch.identity.notes}</p>}</Panel>}

      <footer className="d-foot">{date}, created with Chummer</footer>
    </article>
  )
}
