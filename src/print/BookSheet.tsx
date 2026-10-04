// "Book style" printed sheet (Settings → Printed sheet): one page laid out like the rulebook's example character sheet.
// Grunge paper on the left, a yellow paint-swish panel on the right, all drawn in CSS/SVG; free fonts only.
import '@fontsource/caveat/700.css'
import { ampCtx, ampEssence, ampRating, ruleHelp } from '../engine'
import { ATTRS } from '../model/types'
import { editHref, useEditor } from '../ui/editor'
import { NpcBlock } from '../ui/NpcBlock'
import { bdClass, printBackdrop } from '../ui/Portrait'
import { HeaderBars } from '../ui/nav'
import { IconButton, IconLink } from '../ui/icons'
import { ampLines, lists, RISK, SheetType, useSheetArt } from './shared'
import './sheet.css'
import './book-sheet.css'

/** "OK/OK/Dis./–" as the book prints it: "[OK / OK / Dis. / –]" */
const ranges = (r: string) => r ? `[${r.split('/').map(x => x.trim()).join(' / ')}]` : ''

function Dots({ n }: { n: number }) {
  return n ? <span className="b-rr"><span className="sr-only">RR {n}</span>{Array.from({ length: n }, (_, i) => <i key={i} aria-hidden="true" />)}</span> : null
}

export function BookSheet() {
  const { c, ch, d, balance } = useEditor()
  const b = d.build
  const street = ch.identity.streetName || ch.identity.name || 'Unnamed runner'
  const item = (uid?: string) => b.items.find(i => i.uid === uid)
  /** the item's category as the catalog (or its snapshot) gives it, in lower case as the book writes it: "heavy pistol" */
  const category = (uid?: string) => { const it = item(uid); return (c.items.get(it?.catalogId ?? '') ?? it?.snapshot)?.category?.toLowerCase() }
  const { langs, know, spells, gear } = lists(d, b)
  const art = useSheetArt(ch.id)
  const lifestyle = c.lifestyles.get(ch.identity.lifestyle ?? 'low')?.name ?? 'Low'
  const nuyen = ch.finalizedAt ? balance : Math.max(balance, 0)
  const things = [...gear.map(g => g.note ? `${g.name} (${g.note})` : g.name),
    ...d.vehicles.map(v => `${v.count > 1 ? `${v.count}× ` : ''}${v.name} (${v.chassis})`), `${nuyen.toLocaleString('en-US')}¥`]
  const notes = (xs: string[], id: string, title: string) => (
    <section aria-labelledby={id}><h2 id={id}>{title}</h2>
      <ul className="b-hand">{xs.map((x, i) => <li key={i}>{x}</li>)}</ul></section>)

  return (
    <div className="sheet-wrap">
      <div className="sheet-tools"><HeaderBars>
        <IconLink icon="back" label="Back to editing" href={editHref(ch, 'review')} />
        <IconButton className="primary" icon="print" label="Print or save as PDF" onClick={() => print()} />
        <SheetType />
        {art.tools}
      </HeaderBars></div>
      <article className="book-sheet" style={art.vars}>
        {art.layer}
        <div className="b-paper">
          <header className="b-head">
            <h1>{street}</h1>
            {ch.identity.name && ch.identity.name !== street && <span className="b-real">{ch.identity.name}</span>}
          </header>
          <div className="b-attrs" role="group" aria-label="Attributes">
            {ATTRS.map(a => <div key={a}><span>{c.attributes.get(a)?.name}</span><b>{b.attributes[a]}</b></div>)}
            {ch.npc?.tier !== 'regular' && <div><span>Edge</span><b>{d.edge}</b></div>}
          </div>
          <p className="b-essence">Essence: <b>{d.essence}</b></p>

          <NpcBlock c={c} ch={ch} d={d} />

          <section aria-labelledby="b-skills">
            <h2 id="b-skills" className="b-th">Skills</h2>
            <table aria-labelledby="b-skills" className="b-skills">
              <thead><tr><th scope="col"><span className="sr-only">Skill</span></th><th scope="col">Rating</th><th scope="col">+Att.</th><th scope="col">= DP</th><th scope="col">RR</th></tr></thead>
              <tbody>
                {d.pools.map((p, i) => {
                  const under = !!p.spec || (i > 0 && d.pools[i - 1].skill === p.skill) // as Sheet.tsx: indented, no rating
                  return <tr key={i} className={under ? 'b-spec' : undefined}>
                    <td>{p.spec ? `${p.label.replace(/^.*\(|\)$/g, '')} +2` : under && !d.pools[i - 1].spec ? `(with ${p.attr.toUpperCase()})` : p.label}</td>
                    <td>{under ? '' : p.rating}</td><td>{p.attr.toUpperCase()}</td><td><b>{p.dp}</b></td><td><Dots n={p.rr} /></td>
                  </tr>
                })}
              </tbody>
            </table>
          </section>

          <section aria-labelledby="b-know" className="b-know">
            <h2 id="b-know">Knowledge skills</h2>
            <p>Languages: {langs.map(k => k.native ? `${k.name} (native)` : k.name).join(', ') || '—'}</p>
            {know.length > 0 && <p>Knowledge: {know.map(k => k.name).join(', ')}</p>}
          </section>

          {b.amps.length > 0 && <section aria-labelledby="b-amps">
            <h2 id="b-amps" className="b-th">Shadow Amps</h2>
            <table aria-labelledby="b-amps" className="b-amps">
              <thead><tr><th scope="col"><span className="sr-only">Amp</span></th><th scope="col">Essence</th><th scope="col">Rating</th></tr></thead>
              <tbody>{b.amps.map(a => (
                <tr key={a.uid}>
                  <td><b>{a.name}</b>{!a.name.toLowerCase().includes(a.type) && <b> ({c.ampTypes.get(a.type)?.name.toLowerCase()})</b>}
                    {[...a.narrative ? [{ text: a.narrative, title: undefined }] : [], ...ampLines(c, a).map(({ e, text }) => ({ text, title: ruleHelp(c, e.ref) }))]
                      .map((x, i) => <span key={i} title={x.title}>{i ? '; ' : ' '}{x.text}</span>)}</td>
                  <td>{ampEssence(c, a) || ''}</td><td>{ampRating(c, a, ampCtx(b, a, c))}</td>
                </tr>))}
              </tbody>
            </table>
          </section>}

          <section aria-labelledby="b-weapons">
            <h2 id="b-weapons" className="b-th">Weapons &amp; Spells</h2>
            <table aria-labelledby="b-weapons" className="b-weapons">
              <thead><tr><th scope="col"><span className="sr-only">Weapon or spell</span></th><th scope="col"><span className="sr-only">Damage value</span></th>
                <th scope="col"><span className="sr-only">Ranges</span></th><th scope="col">Type</th></tr></thead>
              <tbody>
                {d.weapons.map(w => <tr key={w.uid}>
                  <td><b>{w.name}</b> {[category(w.uid), w.specialist && 'specialist', w.note, w.ammo && `by ammo: ${w.ammo.join(', ')}`].filter(Boolean).join(', ')}</td>
                  <td><b>DV {w.dv}</b></td><td>{ranges(w.ranges)}</td><td>Weapon</td></tr>)}
                {spells.map(x => { const cat = c.items.get(x.catalogId ?? '') ?? x.snapshot; return <tr key={x.uid}>
                  <td><b>{x.name}</b> {cat?.category?.toLowerCase()}</td><td /><td /><td>{x.kind === 'spell' ? 'Spell' : 'Complex form'}</td></tr> })}
              </tbody>
            </table>
          </section>

          <div className="b-foot">
            <section aria-labelledby="b-gear" className="b-gear">
              <h2 id="b-gear">Equipment</h2>
              <ul>{things.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </section>
            <section aria-labelledby="b-wounds" className="b-wounds">
              <div className="b-wounds-head"><h2 id="b-wounds">Wounds</h2>
                <div className="b-boxes" role="img" aria-label={`Wound boxes: ${d.monitor.light} light, ${d.monitor.serious} serious, 1 incapacitated`}>
                  <span>{Array.from({ length: d.monitor.light }, (_, i) => <i key={i} />)}</span>
                  <span>{Array.from({ length: d.monitor.serious }, (_, i) => <i key={i} className="s" />)}</span>
                  <span><i className="i" /></span>
                </div></div>
              <table>
                <thead><tr><th scope="col">Thresholds</th><th scope="col">Light</th><th scope="col">Serious</th><th scope="col">Incap.</th></tr></thead>
                <tbody>
                  <tr><td>No armor</td>{d.thresholds.physicalNone.map((x, i) => <td key={i}>{x}</td>)}</tr>
                  {b.mainArmor && <tr><td>Main ({item(b.mainArmor)?.name} {d.armor.main})</td>{d.thresholds.physicalMain.map((x, i) => <td key={i}>{x}</td>)}</tr>}
                  {b.altArmor && <tr><td>Alternate ({item(b.altArmor)?.name} {d.armor.alt})</td>{d.thresholds.physicalAlt.map((x, i) => <td key={i}>{x}</td>)}</tr>}
                  <tr><td>Mental{d.mentalProtection ? ` (armor ${d.mentalProtection})` : ''}</td>{d.thresholds.mental.map((x, i) => <td key={i}>{x}</td>)}</tr>
                  {d.thresholds.matrix && <tr><td>{d.emerged ? 'Matrix & biofeedback' : 'Matrix'} (Firewall {d.firewall})</td>{d.thresholds.matrix.map((x, i) => <td key={i}>{x}</td>)}</tr>}
                </tbody>
              </table>
            </section>
          </div>
        </div>

        <aside className="b-panel" aria-label="Portrait, keywords, dispositions, cues and risk">
          {ch.identity.portrait && <img className={`b-portrait${bdClass(printBackdrop(ch.identity.backdrop))}`} src={ch.identity.portrait} alt="" />}
          {notes([...ch.narrative.keywords.filter(Boolean), `${lifestyle} lifestyle`], 'b-keywords', 'Keywords')}
          {notes(ch.narrative.dispositions.filter(Boolean), 'b-disp', 'Dispositions')}
          {notes(ch.narrative.cues.filter(Boolean), 'b-cues', 'Cues')}
          <section aria-labelledby="b-risk" className="b-risk">
            <h2 id="b-risk">Risk Level</h2>
            <table aria-labelledby="b-risk">
              <thead><tr><th scope="col">RR</th><th scope="col">Low</th><th scope="col">Normal</th><th scope="col">High</th><th scope="col">Extreme</th></tr></thead>
              <tbody>{RISK.map((r, i) => <tr key={i}><th scope="row">{i}</th>{r.map((x, j) => <td key={j}>{x}</td>)}</tr>)}</tbody>
            </table>
            <p>Remaining 1s: 0 = no effect; 1 = minor glitch; 2 = critical glitch; 3+ = disaster</p>
          </section>
        </aside>
      </article>
    </div>
  )
}
