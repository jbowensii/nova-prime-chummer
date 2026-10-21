// Printable character sheet modelled on the official Anarchy 2.0 fillable sheet (the two-column one, p.1 white/yellow,
// p.2 cyberdeck/vehicles/amps/equipment). Same runner data as Sheet.tsx; only the layout and look differ (official-sheet.css).
import { ampCtx, ampEssence, ampRating } from '../engine/amps'
import { ruleHelp } from '../engine/canon'
import { effectLines, poolMarks } from '../engine/derive'
import { bracketed } from '../shared/effects'
import { SourceLabel } from '../ui/SourceLabel'
import { ATTRS } from '../model/types'
import { editHref, useEditor } from '../ui/editor'
import { NpcBlock } from '../ui/NpcBlock'
import { bdClass, printBackdrop } from '../ui/Portrait'
import { HeaderBars } from '../ui/nav'
import { IconButton, IconLink } from '../ui/icons'
import { ampLines, cells, lists, RISK, rrText, switchedBoxes } from './shared'
import { SheetType, useSheetArt } from '../ui/sheetArt'
import './sheet.css'
import './official-sheet.css'

export function OfficialSheet() {
  const { c, ch, d, balance } = useEditor()
  const b = d.build
  const name = ch.identity.streetName || ch.identity.name || 'Unnamed runner'
  const item = (uid?: string) => b.items.find(i => i.uid === uid)
  const { langs, know, spells, gear } = lists(d, b)
  const art = useSheetArt(ch.id)
  const attrs = [...ATTRS.map(a => [c.attributes.get(a)?.name ?? a, b.attributes[a]] as const)]
  if (ch.npc?.tier !== 'regular') attrs.push(['Edge', d.edge])

  return (
    <div className="sheet-wrap">
      <div className="sheet-tools">
        <HeaderBars>
          <IconLink icon="back" label="Back to editing" href={editHref(ch, 'review')} />
          <IconButton className="primary" icon="print" label="Print or save as PDF" onClick={() => print()} />
          <SheetType />
          {art.tools}
        </HeaderBars>
      </div>
      <article className="sheet official" style={art.vars}>
        {art.layer}

        {/* ---- Page 1: street name, two columns (white main + yellow sidebar) ---- */}
        <div className="o-page o-page1">
          <header className="o-head">
            <div className="o-name">
              <span className="o-eyebrow">Street name</span>
              <h1>{name}</h1>
              <div className="o-role">
                {c.metatypes.get(ch.identity.metatype)?.name}
                {ch.identity.gender ? `, ${ch.identity.gender}` : ''}
                {ch.narrative.keywords[2] ? `, ${ch.narrative.keywords[2]}` : ''}
                {ch.identity.name && ch.identity.name !== name ? ` — ${ch.identity.name}` : ''}
              </div>
            </div>
            <span className="brand" role="img" aria-label="Nova Prime Chummer Anarchy 2.0">
              Nova Prime Chummer <b>Anarchy</b> 2.0
            </span>
          </header>

          <NpcBlock c={c} ch={ch} d={d} />

          <div className="o-grid">
            {/* left: attributes, skills, knowledge, weapons/spells, essence/nuyen/wounds */}
            <div className="o-main">
              <section className="o-attrs" aria-label="Attributes">
                {attrs.map(([label, val]) => (
                  <div className="o-ring" key={label}>
                    <b>{val}</b>
                    <span>{label}</span>
                  </div>
                ))}
              </section>

              <section className="o-block">
                <h2>Skills</h2>
                <table className="o-skills">
                  <thead>
                    <tr>
                      <th>Skill</th>
                      <th>Rating</th>
                      <th>+Att.</th>
                      <th>= DP</th>
                      <th>RR</th>
                      <th className="o-adv">Adv./Dis.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.pools.map((p, i) => (
                      <tr key={i} className={p.spec || (i > 0 && d.pools[i - 1].skill === p.skill) ? 'spec' : ''}>
                        <td>
                          {p.spec
                            ? `(${p.label.replace(/^.*\(|\)$/g, '')} +2)`
                            : i > 0 && d.pools[i - 1].skill === p.skill && !d.pools[i - 1].spec
                              ? `(with ${p.attr.toUpperCase()})`
                              : p.label}
                        </td>
                        <td>{p.spec || (i > 0 && d.pools[i - 1].skill === p.skill) ? '' : p.rating}</td>
                        <td>{p.attr.toUpperCase()}</td>
                        <td>
                          <b>{p.dp}</b>
                        </td>
                        <td>{rrText(p.rr, d.switched?.pools[i]?.rr)}</td>
                        <td className="o-adv">
                          {poolMarks(p).map((m, j) => (
                            <span key={j} title={m.title}>
                              {j ? ', ' : ''}
                              {m.mark}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="o-block o-know">
                <h2>Knowledge skills</h2>
                <div className="o-know-cols">
                  <div>
                    <h3>Languages</h3>
                    <ul>
                      {langs.map(k => (
                        <li key={k.key}>
                          {k.name}
                          {k.native && <span className="o-small"> (native)</span>}
                        </li>
                      ))}
                      {!langs.length && <li>—</li>}
                    </ul>
                  </div>
                  <div>
                    <h3>Knowledge</h3>
                    <ul>
                      {know.map(k => (
                        <li key={k.key}>{k.name}</li>
                      ))}
                      {!know.length && <li>—</li>}
                    </ul>
                  </div>
                </div>
              </section>

              <section className="o-block">
                <h2>Weapons &amp; spells</h2>
                <table className="o-weapons">
                  <thead>
                    <tr>
                      <th>Weapon</th>
                      <th>DV</th>
                      <th>Ranges</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.weapons.map(w => (
                      <tr key={w.uid}>
                        <td>
                          <b>{w.name}</b>
                          {w.specialist && <span className="o-small"> (specialist)</span>}
                          {w.note && <div className="o-small">{w.note}</div>}
                        </td>
                        <td>
                          <b>{bracketed(w.dv, d.switched?.weapons.find(x => x.uid === w.uid)?.dv)}</b>
                          {w.ammo && <div className="o-small">by ammo: {w.ammo.join(', ')}</div>}
                        </td>
                        <td>{w.ranges}</td>
                      </tr>
                    ))}
                    {spells.map(x => {
                      const cat = c.items.get(x.catalogId ?? '') ?? x.snapshot
                      return (
                        <tr key={x.uid} className="o-spell">
                          <td>
                            <b>{x.name}</b>
                            {cat?.category && <span className="o-small"> ({cat.category})</span>}
                          </td>
                          <td colSpan={2}>{x.kind === 'spell' ? 'Spell' : 'Complex form'}</td>
                        </tr>
                      )
                    })}
                    {!d.weapons.length && !spells.length && (
                      <tr>
                        <td colSpan={3}>—</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>

              <div className="o-foot">
                <section className="o-stat">
                  <h2>Essence</h2>
                  <b className="o-big">{d.essence}</b>
                  <p className="o-small">
                    Cancelled hits — magic{d.emerged ? ' & Tasking' : ''}: {d.essenceEffects.magicHitsCancelled}; healing:{' '}
                    {d.essenceEffects.healingHitsCancelled}.{d.essenceEffects.socialDisadvantage && ' Disadvantage on most social Tests.'}
                  </p>
                </section>
                <section className="o-stat">
                  <h2>Nuyen</h2>
                  <b className="o-big">{(ch.finalizedAt ? balance : balance > 0 ? balance : 0).toLocaleString('en-US')}¥</b>
                </section>
                <section className="o-wounds">
                  <h2>Wounds</h2>
                  <div className="o-boxes">
                    {Array.from({ length: d.monitor.light }, (_, i) => (
                      <span key={`l${i}`} title="Light" />
                    ))}
                    {Array.from({ length: d.monitor.serious }, (_, i) => (
                      <span key={`s${i}`} className="s" title="Serious" />
                    ))}
                    <span className="i" title="Incapacitated" />
                  </div>
                  {switchedBoxes(d) && <p className="o-small">{switchedBoxes(d)}</p>}
                  <table className="o-thresh">
                    <thead>
                      <tr>
                        <th>Thresholds</th>
                        <th>L</th>
                        <th>S</th>
                        <th>I</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>No armor</td>
                        {cells(d.thresholds.physicalNone, d.switched?.thresholds.physicalNone)}
                      </tr>
                      {b.mainArmor && (
                        <tr>
                          <td>
                            {item(b.mainArmor)?.name} {bracketed(d.armor.main, d.switched?.armor.main)}
                          </td>
                          {cells(d.thresholds.physicalMain, d.switched?.thresholds.physicalMain)}
                        </tr>
                      )}
                      {b.altArmor && (
                        <tr>
                          <td>
                            {item(b.altArmor)?.name} {bracketed(d.armor.alt, d.switched?.armor.alt)}
                          </td>
                          {cells(d.thresholds.physicalAlt, d.switched?.thresholds.physicalAlt)}
                        </tr>
                      )}
                      <tr>
                        <td>
                          Mental{d.mentalProtection || d.switched?.mentalProtection ? ` (${bracketed(d.mentalProtection, d.switched?.mentalProtection)})` : ''}
                        </td>
                        {cells(d.thresholds.mental, d.switched?.thresholds.mental)}
                      </tr>
                      {d.thresholds.social && (
                        <tr>
                          <td>Social ({d.socialArmor})</td>
                          {cells(d.thresholds.social, d.switched?.thresholds.social)}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </section>
              </div>
            </div>

            {/* right: portrait, keywords, dispositions, cues, risk — the yellow column */}
            <aside className="o-side">
              <div className="o-portrait">
                {ch.identity.portrait ? (
                  <img className={bdClass(printBackdrop(ch.identity.backdrop))} src={ch.identity.portrait} alt="" />
                ) : (
                  <span className="o-small">Portrait</span>
                )}
              </div>
              <section className="o-paper">
                <h2>Keywords</h2>
                <p>{ch.narrative.keywords.filter(Boolean).join(', ') || '—'}</p>
                <p className="o-small">Lifestyle: {c.lifestyles.get(ch.identity.lifestyle ?? 'low')?.name ?? 'Low'}</p>
              </section>
              <section className="o-paper">
                <h2>Dispositions</h2>
                <ul>
                  {ch.narrative.dispositions.filter(Boolean).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                  {!ch.narrative.dispositions.filter(Boolean).length && <li>—</li>}
                </ul>
              </section>
              <section className="o-paper">
                <h2>Cues</h2>
                <ul>
                  {ch.narrative.cues.filter(Boolean).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                  {!ch.narrative.cues.filter(Boolean).length && <li>—</li>}
                </ul>
              </section>
              <section className="o-risk">
                <h2>Risk level</h2>
                <table>
                  <thead>
                    <tr>
                      <th>RR</th>
                      <th>Low</th>
                      <th>Norm</th>
                      <th>High</th>
                      <th>Extr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RISK.map((r, i) => (
                      <tr key={i}>
                        <td>{i}</td>
                        {r.map((x, j) => (
                          <td key={j}>{x}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="o-small">Remaining 1s: 0 none · 1 minor glitch · 2 critical · 3+ disaster.</p>
              </section>
            </aside>
          </div>
        </div>

        {/* ---- Page 2: cyberdeck (when matrix), vehicles/drones, shadow amps, equipment ---- */}
        <div className="o-page o-page2">
          {d.thresholds.matrix && (
            <section className="o-block">
              <h2>Cyberdeck</h2>
              <p>
                Firewall <b>{d.firewall}</b>
                {d.matrixArmor ? `, armor ${d.matrixArmor}` : ''}. Thresholds L/S/I <b>{d.thresholds.matrix.join(' / ')}</b>.
                {d.deckMonitor && (d.deckMonitor.light > 2 || d.deckMonitor.serious > 1)
                  ? ` Deck boxes: ${d.deckMonitor.light} light, ${d.deckMonitor.serious} serious.`
                  : ''}
              </p>
            </section>
          )}

          {d.vehicles.length > 0 && (
            <section className="o-block">
              <h2>Vehicles &amp; drones</h2>
              <table>
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Pilot</th>
                    <th>Body</th>
                    <th>Hand.</th>
                    <th>Speed</th>
                    <th>Armor</th>
                    <th>Dmg L/S/I</th>
                  </tr>
                </thead>
                <tbody>
                  {d.vehicles.map(v => (
                    <tr key={v.uid}>
                      <td>
                        <b>
                          {v.count > 1 ? `${v.count}× ` : ''}
                          {v.name}
                        </b>{' '}
                        <span className="o-small">
                          ({v.chassis}
                          {v.flying ? ', flying' : ''})
                        </span>
                      </td>
                      <td>{v.pilot}</td>
                      <td>{v.body}</td>
                      <td>{v.handling}</td>
                      <td>{v.speed}</td>
                      <td>{v.armor}</td>
                      <td>{v.thresholds.join(' / ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="o-block">
            <h2>Shadow amps</h2>
            <table className="o-amps">
              <thead>
                <tr>
                  <th>Amp</th>
                  <th className="o-src">Source</th>
                  <th>Ess.</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {b.amps.map(a => (
                  <tr key={a.uid}>
                    <td>
                      <b>{a.name}</b>{' '}
                      {!a.name.toLowerCase().includes(a.type) && <span className="o-small">({c.ampTypes.get(a.type)?.name.toLowerCase()})</span>}
                      {a.narrative && <div className="o-small">{a.narrative}</div>}
                      {ampLines(c, a).map(({ e, text }, i) => (
                        <div key={i} className="o-small" title={ruleHelp(c, e.ref)}>
                          {text}
                        </div>
                      ))}
                    </td>
                    <td className="o-src">
                      {(t => (t ? <SourceLabel c={c} source={t.source} page={t.page} id={t.id} /> : <SourceLabel builtByYou />))(
                        a.catalogId ? (c.amps.get(a.catalogId) ?? a.snapshot) : undefined,
                      )}
                    </td>
                    <td>{ampEssence(c, a) || ''}</td>
                    <td>
                      <b>{ampRating(c, a, ampCtx(b, a, c))}</b>
                    </td>
                  </tr>
                ))}
                {!b.amps.length && (
                  <tr>
                    <td colSpan={4}>—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="o-block">
            <h2>Equipment</h2>
            <p>{gear.map(g => (g.note ? `${g.name} (${g.note})` : g.name)).join(', ') || '—'}.</p>
          </section>

          {(d.initiative ?? d.switched?.initiative) &&
            (i => (
              <p className="o-small o-note">
                Initiative enhancement {bracketed(d.initiative?.level ?? '–', d.switched?.initiative?.level)}
                {i.realm ? ` (${i.realm} only)` : ''}: {i.source}.
              </p>
            ))((d.initiative ?? d.switched?.initiative)!)}
          {effectLines(d).map((x, i) => (
            <p key={i} className="o-small o-note">
              {x}.
            </p>
          ))}

          {ch.identity.background && (
            <section className="o-block">
              <h2>Background</h2>
              <p>{ch.identity.background}</p>
            </section>
          )}
        </div>
      </article>
    </div>
  )
}
