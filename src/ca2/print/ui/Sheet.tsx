// Printable character sheet, laid out like the official Anarchy 2.0 sheet. Browser "Save as PDF" makes the PDF.
import { ampCtx, ampEssence, ampRating } from '../../runner-builder/domain/amps'
import { ruleHelp } from '../../formats/domain/canon'
import { effectLines, poolMarks } from '../../runner-builder/domain/derive'
import { bracketed } from '../../../core/shared/effects'
import { SourceLabel } from '../../table-rules/ui/SourceLabel'
import { ATTRS } from '../../formats/domain/types'
import { editHref, useEditor } from '../../runner-builder/ui/editor'
import { NpcBlock } from '../../runner-builder/ui/NpcBlock'
import { bdClass, printBackdrop } from '../../../core/ui-kit/Portrait'
import { HeaderBars } from '../../../core/chrome/nav'
import { IconButton, IconLink } from '../../../core/ui-kit/icons'
import { ampLines, cells, lists, RISK, rrText, switchedBoxes } from './shared'
import { SheetType, useSheetArt } from '../../../features/appearance/sheetArt'
import '../../../features/appearance/sheet.css'
import './sheet.css'

export function Sheet() {
  const { c, ch, d, balance } = useEditor()
  const b = d.build
  const name = ch.identity.streetName || ch.identity.name || 'Unnamed runner'
  const item = (uid?: string) => b.items.find(i => i.uid === uid)
  const { langs, know, spells, gear } = lists(d, b)
  const art = useSheetArt(ch.id)

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
      <article className="sheet" style={art.vars}>
        {art.layer}
        <div className="s-page1">
          <div className="s-top">
            <header className="s-head">
              <div>
                <div className="s-label">Street name</div>
                <h1>{name}</h1>
                <div className="s-role">
                  {c.metatypes.get(ch.identity.metatype)?.name}
                  {ch.identity.gender ? `, ${ch.identity.gender}` : ''}
                  {ch.narrative.keywords[2] ? `, ${ch.narrative.keywords[2]}` : ''}
                </div>
                {ch.identity.name && ch.identity.name !== name && <div className="s-small">{ch.identity.name}</div>}
              </div>
              <span className="brand" role="img" aria-label="Nova Prime Chummer Anarchy 2.0">
                Nova Prime Chummer <b>Anarchy</b> 2.0
              </span>
            </header>
            {ch.identity.portrait && <img className={`portrait${bdClass(printBackdrop(ch.identity.backdrop))}`} src={ch.identity.portrait} alt="" />}
            <section className="s-attrs">
              {ATTRS.map(a => (
                <div key={a}>
                  <span>{c.attributes.get(a)?.name}</span>
                  <b>{b.attributes[a]}</b>
                </div>
              ))}
              {ch.npc?.tier !== 'regular' && (
                <div>
                  <span>Edge</span>
                  <b>{d.edge}</b>
                </div>
              )}
            </section>
          </div>

          <NpcBlock c={c} ch={ch} d={d} />
          <div className="s-cols">
            <section>
              <h2>Skills</h2>
              <table>
                <thead>
                  <tr>
                    <th>Skill</th>
                    <th>Rating</th>
                    <th>+Att.</th>
                    <th>= DP</th>
                    <th>RR</th>
                    <th className="s-small">Adv./Dis.</th>
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
                      <td className="s-small">
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
              <section className="s-know">
                <h2>Languages & knowledge</h2>
                <p className="s-small s-screen">Knowledge skills have no rating; the GM picks a Skill + Attribute, usually Logic, if a test is needed.</p>
                <div className="s-know-cols">
                  <div>
                    <h3>Languages</h3>
                    <ul className={langs.length > 6 ? 'two' : undefined}>
                      {langs.map(k => (
                        <li key={k.key}>
                          {k.name}
                          {k.native && <span className="s-small"> (native)</span>}
                        </li>
                      ))}
                    </ul>
                    {!langs.length && <p>—</p>}
                  </div>
                  <div>
                    <h3>Knowledge</h3>
                    <ul className={know.length > 6 ? 'two' : undefined}>
                      {know.map(k => (
                        <li key={k.key}>{k.name}</li>
                      ))}
                    </ul>
                    {!know.length && <p>—</p>}
                  </div>
                </div>
              </section>
            </section>

            <section>
              <h2>Wounds</h2>
              <div className="s-boxes">
                {Array.from({ length: d.monitor.light }, (_, i) => (
                  <span key={`l${i}`} title="Light" />
                ))}
                {Array.from({ length: d.monitor.serious }, (_, i) => (
                  <span key={`s${i}`} className="s" title="Serious" />
                ))}
                <span className="i" title="Incapacitated" />
              </div>
              {switchedBoxes(d) && <p className="s-small">{switchedBoxes(d)}</p>}
              <table>
                <thead>
                  <tr>
                    <th>Thresholds</th>
                    <th>Light</th>
                    <th>Serious</th>
                    <th>Incap.</th>
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
                        Main armor ({item(b.mainArmor)?.name} {bracketed(d.armor.main, d.switched?.armor.main)})
                      </td>
                      {cells(d.thresholds.physicalMain, d.switched?.thresholds.physicalMain)}
                    </tr>
                  )}
                  {b.altArmor && (
                    <tr>
                      <td>
                        Alternate ({item(b.altArmor)?.name} {bracketed(d.armor.alt, d.switched?.armor.alt)})
                      </td>
                      {cells(d.thresholds.physicalAlt, d.switched?.thresholds.physicalAlt)}
                    </tr>
                  )}
                  <tr>
                    <td>
                      Mental
                      {d.mentalProtection || d.switched?.mentalProtection ? ` (armor ${bracketed(d.mentalProtection, d.switched?.mentalProtection)})` : ''}
                    </td>
                    {cells(d.thresholds.mental, d.switched?.thresholds.mental)}
                  </tr>
                  {d.thresholds.social && (
                    <tr>
                      <td>Social (armor {d.socialArmor})</td>
                      {cells(d.thresholds.social, d.switched?.thresholds.social)}
                    </tr>
                  )}
                  {d.thresholds.matrix && (
                    <tr>
                      <td>
                        {d.emerged ? 'Matrix & biofeedback' : 'Matrix'} (Firewall {d.firewall}
                        {d.matrixArmor ? `, armor ${d.matrixArmor}` : ''})
                        {d.deckMonitor && (d.deckMonitor.light > 2 || d.deckMonitor.serious > 1) && (
                          <span className="s-small">
                            {' '}
                            deck boxes {d.deckMonitor.light} light, {d.deckMonitor.serious} serious
                          </span>
                        )}
                      </td>
                      {cells(d.thresholds.matrix, d.switched?.thresholds.matrix)}
                    </tr>
                  )}
                </tbody>
              </table>

              <h2>Risk</h2>
              <table className="s-risk">
                <thead>
                  <tr>
                    <th>RR</th>
                    <th>Low</th>
                    <th>Normal</th>
                    <th>High</th>
                    <th>Extreme</th>
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
              <p className="s-small">Remaining 1s: 0 = no effect; 1 = minor glitch; 2 = critical glitch; 3+ = disaster.</p>

              <h2>Essence {d.essence}</h2>
              <p className="s-small">
                Cancelled hits on magic{d.emerged ? ' and Tasking' : ''} Tests: {d.essenceEffects.magicHitsCancelled}. On healing:{' '}
                {d.essenceEffects.healingHitsCancelled}.{d.essenceEffects.socialDisadvantage && ' Disadvantage on most social Tests.'}
              </p>
              {(d.initiative ?? d.switched?.initiative) &&
                (i => (
                  <p className="s-small">
                    Initiative enhancement {bracketed(d.initiative?.level ?? '–', d.switched?.initiative?.level)}
                    {i.realm ? ` (${i.realm} only)` : ''}: {i.source}.
                  </p>
                ))((d.initiative ?? d.switched?.initiative)!)}
              {effectLines(d).map((x, i) => (
                <p key={i} className="s-small s-effect">
                  {x}.
                </p>
              ))}
            </section>
          </div>
        </div>

        <section>
          <h2>Shadow Amps</h2>
          <table>
            <thead>
              <tr>
                <th>Amp</th>
                <th className="s-src">Source</th>
                <th>Essence</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {b.amps.map(a => (
                <tr key={a.uid}>
                  <td>
                    <b>{a.name}</b> {!a.name.toLowerCase().includes(a.type) && <span className="s-small">({c.ampTypes.get(a.type)?.name.toLowerCase()})</span>}
                    {a.narrative && <div className="s-small">{a.narrative}</div>}
                    {ampLines(c, a).map(({ e, text }, i) => (
                      <div key={i} className="s-small" title={ruleHelp(c, e.ref)}>
                        {text}
                      </div>
                    ))}
                  </td>
                  <td className="s-src">
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
            </tbody>
          </table>
        </section>

        {d.vehicles.length > 0 && (
          <section>
            <h2>Vehicles & drones</h2>
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Pilot</th>
                  <th>Body</th>
                  <th>Handling</th>
                  <th>Speed</th>
                  <th>Armor</th>
                  <th>Damage L/S/I</th>
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
                      <span className="s-small">
                        ({v.chassis}
                        {v.flying ? ', flying' : ''}
                        {v.monitor.light > 2 || v.monitor.serious > 1 ? `; wound boxes ${v.monitor.light} light, ${v.monitor.serious} serious` : ''})
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

        <div className="s-cols">
          <section>
            <h2>Weapons</h2>
            <table className="s-weapons">
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
                      {w.specialist && <span className="s-small"> (specialist)</span>}
                      {w.note && <div className="s-small">{w.note}</div>}
                    </td>
                    <td>
                      <b>{bracketed(w.dv, d.switched?.weapons.find(x => x.uid === w.uid)?.dv)}</b>
                      {w.ammo && <div className="s-small">by ammo: {w.ammo.join(', ')}</div>}
                    </td>
                    <td>{w.ranges}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {spells.length > 0 && (
              <>
                <h2>
                  {spells.every(x => x.kind === 'spell') ? 'Spells' : spells.every(x => x.kind === 'complex-form') ? 'Complex forms' : 'Spells & complex forms'}
                </h2>
                <table className="s-spells">
                  <tbody>
                    {spells.map(x => {
                      const cat = c.items.get(x.catalogId ?? '') ?? x.snapshot
                      return (
                        <tr key={x.uid}>
                          <td>
                            <b>{x.name}</b>
                            {cat?.category && <span className="s-small"> ({cat.category})</span>}
                          </td>
                          <td>{x.kind === 'spell' ? 'Spell' : 'Complex form'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
            )}
            <h2>Equipment</h2>
            <p>{gear.map(g => (g.note ? `${g.name} (${g.note})` : g.name)).join(', ') || '—'}.</p>
            <h2>Nuyen</h2>
            <p>{ch.finalizedAt ? balance.toLocaleString('en-US') : (balance > 0 ? balance : 0).toLocaleString('en-US')}¥</p>
          </section>
          <section>
            <h2>Keywords</h2>
            <p>{ch.narrative.keywords.filter(Boolean).join(', ') || '—'}</p>
            <p className="s-small">Lifestyle: {c.lifestyles.get(ch.identity.lifestyle ?? 'low')?.name ?? 'Low'}</p>
            <h2>Dispositions</h2>
            <ul>
              {ch.narrative.dispositions.filter(Boolean).map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
            <h2>Cues</h2>
            <ul>
              {ch.narrative.cues.filter(Boolean).map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </section>
        </div>
        {ch.identity.background && (
          <section>
            <h2>Background</h2>
            <p>{ch.identity.background}</p>
          </section>
        )}
      </article>
    </div>
  )
}
