// SR6 "Neon" printed sheet (Settings → Printed sheet): one dense page to play from. A top band (portrait, name, metatype,
// the numbers rolled most), a left rail (attributes, damage tracks, Edge, qualities, contacts, IDs) and the main column
// (the best dice pools up front, every skill, weapons, armor and ware, magic or resonance, matrix, gear, vehicles).
// Dark ink on white; cyan and pink only as accents and rules, so it prints on any printer (sheet.css .sr6-neon).
import type { ReactNode } from 'react'
import { bdClass, printBackdrop } from '../../ui/Portrait'
import { priced } from '../engine/budgets'
import { MAGIC_KINDS } from '../engine/data'
import { gradeName } from '../engine/grades'
import { CORE_ATTRS, MAGIC_KIND_LABELS, sinName, type Sr6Attr } from '../model/character'
import { n, useSr6Editor } from '../ui/editor'
import { Hexes, type SheetArt } from './BookSheet'
import { attrShown, band, br, PICKS, poolOn, runnerView } from './view'
import { entryLabel } from '../engine/categories'

const H = ({ id, children }: { id: string; children: ReactNode }) => <h2 id={id}>{children}</h2>

/** a damage track in one line, a gap and its modifier after every third box */
function Line({ count, label }: { count: number | null; label: string }) {
  return (
    <div className="n-track">
      <span className="n-tl">
        {label} <b>{count ?? '—'}</b>
      </span>
      {count === null ? (
        <span className="n-small">a setting isn’t set</span>
      ) : (
        <span className="n-boxes" role="img" aria-label={`${label}: ${count} boxes`}>
          {Array.from({ length: Math.ceil(count / 3) }, (_, g) => (
            <span key={g} className="n-g">
              {Array.from({ length: Math.min(3, count - g * 3) }, (_, i) => (
                <i key={i} />
              ))}
              {g * 3 + 3 <= count && <em>−{g + 1}</em>}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}

export function NeonSheet({ art }: { art: SheetArt }) {
  const ctx = useSr6Editor(),
    { ch, data, cr, d } = ctx
  const b = ch.build,
    k = MAGIC_KINDS[b.magic]
  const v = runnerView(ctx),
    { lines, nameOf, attrsOf } = v
  const trained = d.pools.filter(p => p.rank > 0),
    untrained = d.pools.filter(p => !p.rank)
  const best = [...trained].sort((x, y) => y.dp - x.dp || x.label.localeCompare(y.label)).slice(0, 6)
  const init1 = (i?: { base: number; dice: number | null }) => i && `${i.base}+${i.dice ?? '?'}D6`
  const init = (i?: { base: number; dice: number | null }, o?: { base: number; dice: number | null }) => br(init1(i), init1(o))
  const attr = (a: Sr6Attr) => {
    const x = d.attrs[a]
    return (
      <div key={a}>
        <span>{a.toUpperCase()}</span>
        <b>{attrShown(d, a)}</b>
        {x.augmented !== x.natural && <small>{x.natural}</small>}
      </div>
    )
  }
  const keys = (
    [
      ['Initiative', init(d.initiative, d.on.initiative)],
      ['Astral init.', init(d.astralInit, d.on.astralInit)],
      ['Defense', br(d.defenseRating, d.on.defenseRating)],
      ['Social', br(d.socialRating, d.on.socialRating)],
      ['Unarmed AR', d.attackRatings.unarmed],
      ['Essence', n(d.essence)],
      ['Composure', br(d.composure, d.on.composure)],
      ['Judge int.', br(d.judgeIntentions, d.on.judgeIntentions)],
      ['Memory', br(d.memory, d.on.memory)],
      ['Lift/carry', br(d.liftCarry, d.on.liftCarry)],
      ['Drain', d.drain],
      ['Fading', d.fading],
      ['Awakened', v.awakened],
    ] as [string, ReactNode][]
  ).filter(([, x]) => x !== undefined)
  const acc = (x: (typeof b.purchases)[number]) =>
    x.accessories.length > 0 && (
      <span className="n-small">
        {' '}
        + {x.accessories.map(nameOf).join(', ')}
        {v.host(x) && ` (${v.host(x)})`}
      </span>
    )
  const picks = b.picks.length > 0 && PICKS.map(([kind, label]) => [label, b.picks.filter(x => x.kind === kind)] as const).filter(([, xs]) => xs.length)
  const role = [data.metatypes[b.metatype]?.name, ch.identity.gender, b.magic !== 'mundane' && MAGIC_KIND_LABELS[b.magic], k.spells && b.tradition]
    .filter(Boolean)
    .join(' · ')

  return (
    <article className="sr6-neon" style={art.vars}>
      {art.layer}
      <header className="n-top">
        {ch.identity.portrait && <img className={`n-portrait${bdClass(printBackdrop(ch.identity.backdrop))}`} src={ch.identity.portrait} alt="" />}
        <div className="n-id">
          <h1>{v.name}</h1>
          <div className="n-role">{role || '—'}</div>
          {ch.identity.name && ch.identity.name !== v.name && <div className="n-small">{ch.identity.name}</div>}
        </div>
        <span className="n-brand" role="img" aria-label="Nova Prime Chummer Shadowrun 6">
          Nova Prime Chummer <b>SR6</b>
        </span>
      </header>
      <dl className="n-keys" aria-label="Key numbers">
        {keys.map(([l, x]) => (
          <div key={l}>
            <dt>{l}</dt>
            <dd>{x}</dd>
          </div>
        ))}
      </dl>

      <div className="n-body">
        <aside className="n-rail">
          <section aria-labelledby="n-attrs">
            <H id="n-attrs">Attributes</H>
            <div className="n-attrs">
              {CORE_ATTRS.map(attr)}
              {attr('edg')}
              {k.resonance ? attr('res') : b.magic !== 'mundane' && attr('mag')}
            </div>
          </section>
          <section aria-labelledby="n-cm">
            <H id="n-cm">Condition</H>
            <Line count={d.monitors.physical} label="Physical" />
            <Line count={d.monitors.stun} label="Stun" />
            <Line count={d.monitors.overflow} label="Overflow" />
            <div className="n-track">
              <span className="n-tl">
                Edge <b>{d.attrs.edg.augmented}</b>
              </span>
              <Hexes count={d.attrs.edg.augmented} total={d.attrs.edg.augmented} label={`Edge points: ${d.attrs.edg.augmented}`} />
            </div>
          </section>
          <section aria-labelledby="n-qual">
            <H id="n-qual">Qualities</H>
            <ul className="n-list">
              {b.qualities.map(q => {
                const x = data.qualities[q.id]
                return (
                  <li key={q.uid} className={x && !x.positive ? 'neg' : undefined}>
                    {x?.name ?? q.name ?? q.id}
                    {x?.perLevel && ` ${q.level}`}
                    {v.qualityNotes(q).map(t => (
                      <span key={t} className="n-small">
                        {' '}
                        {t}
                      </span>
                    ))}
                  </li>
                )
              })}
            </ul>
            {!b.qualities.length && <p>—</p>}
          </section>
          <section aria-labelledby="n-contacts">
            <H id="n-contacts">Contacts</H>
            <ul className="n-list">
              {b.contacts.map(x => (
                <li key={x.uid}>
                  {x.name || 'Contact'}
                  {x.archetype && <span className="n-small"> {x.archetype}</span>}
                  <span className="n-cl" title="Connection / Loyalty">
                    C{x.connection} L{x.loyalty}
                  </span>
                </li>
              ))}
            </ul>
            {!b.contacts.length && <p>—</p>}
          </section>
          <section aria-labelledby="n-ids">
            <H id="n-ids">IDs & money</H>
            <p>
              <b>{n(v.nuyen)}¥</b> · <b>{n(v.karma)}</b> karma
            </p>
            <ul className="n-list">
              {b.sins.map(s => (
                <li key={s.uid}>
                  {sinName(s)}{' '}
                  <span className="n-small">
                    {s.placeholder ? 'placeholder' : s.kind === 'real' ? 'real' : `fake ${s.rating ?? 1}`}
                    {s.gender && `, ${s.gender}`}
                    {v.licencesOf(s).length > 0 && `; ${v.licencesOf(s).join(', ')}`}
                    {v.lifeOf(s) && `; ${v.lifeOf(s)}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="n-lang">
            <H id="n-lang">Languages & knowledge</H>
            <p>{[...v.langs.map(x => (x.native ? `${x.name} (N)` : `${x.name} ${x.points + x.karma}`)), ...v.know.map(x => x.name)].join(', ') || '—'}</p>
          </section>
        </aside>

        <main className="n-main">
          <section aria-labelledby="n-best">
            <H id="n-best">Dice pools</H>
            <div className="n-best">
              {best.map(p => (
                <div key={p.skill}>
                  <b>{br(p.dp, poolOn(d, p.skill)?.dp)}</b>
                  <span>{p.label}</span>
                </div>
              ))}
              {!best.length && <p>—</p>}
            </div>
          </section>
          <section aria-labelledby="n-skills">
            <H id="n-skills">Skills</H>
            <table className="n-skills">
              <thead>
                <tr>
                  <th>Skill</th>
                  <th>Rnk+Att</th>
                  <th>Pool</th>
                </tr>
              </thead>
              <tbody>
                {trained.map(p => (
                  <tr key={p.skill}>
                    <td>
                      {p.label}
                      {p.spec && (
                        <span className="n-small">
                          {' '}
                          {p.spec}
                          {p.specDp !== undefined && ` ${br(p.specDp, poolOn(d, p.skill)?.specDp)}`}
                        </span>
                      )}
                      {p.expertise && (
                        <span className="n-small">
                          {' '}
                          {p.expertise}*{p.expertiseDp !== undefined && ` ${br(p.expertiseDp, poolOn(d, p.skill)?.expertiseDp)}`}
                        </span>
                      )}
                    </td>
                    <td>
                      {p.rank}+{p.attr.toUpperCase()}
                    </td>
                    <td>
                      <b>{br(p.dp, poolOn(d, p.skill)?.dp)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {untrained.length > 0 && (
              <p className="n-small n-untrained">
                <b>Untrained</b> {untrained.map(p => `${p.label} ${br(p.dp, poolOn(d, p.skill)?.dp)}`).join(' · ')}
              </p>
            )}
          </section>
          <section aria-labelledby="n-weapons">
            <H id="n-weapons">Weapons</H>
            <table className="n-weapons">
              <thead>
                <tr>
                  <th>Weapon</th>
                  <th>DV</th>
                  <th>Mode</th>
                  <th title="Attack Ratings: close / near / medium / far / extreme">AR</th>
                  <th>Ammo</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Unarmed</td>
                  <td />
                  <td />
                  <td>{d.attackRatings.unarmed}</td>
                  <td />
                </tr>
                {lines('weapons').map(x => {
                  const a = attrsOf(x)
                  return (
                    <tr key={x.uid}>
                      <td>
                        <b>{nameOf(x)}</b>
                        {acc(x)}
                      </td>
                      <td>{v.dv(x)}</td>
                      <td>{a.modes}</td>
                      <td>{v.bands(x).map(band).join('/')}</td>
                      <td>{a.ammo}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
          {(lines('armor').length > 0 || lines('augmentations').length > 0) && (
            <section aria-labelledby="n-ware">
              <H id="n-ware">Armor & augmentations</H>
              <ul className="n-flow">
                {lines('armor').map(x => (
                  <li key={x.uid}>
                    <b>{nameOf(x)}</b> {attrsOf(x).defense}
                    {v.social(x) && ` Social ${v.social(x)}`}
                    {x.worn && <span className="n-tag">worn</span>}
                    {acc(x)}
                  </li>
                ))}
                {lines('augmentations').map(x => (
                  <li key={x.uid}>
                    <b>{nameOf(x)}</b>
                    {x.rating && ` ${x.rating}`}
                    <span className="n-small">
                      {' '}
                      {[x.grade && gradeName(data, x.grade), `Ess ${n(priced(x, data, cr).essence)}`].filter(Boolean).join(', ')}
                    </span>
                    {acc(x)}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {picks && (
            <section aria-labelledby="n-magic">
              <H id="n-magic">{k.resonance ? 'Resonance' : 'Magic'}</H>
              <p className="n-small">
                {[
                  d.drain !== undefined && `Drain ${d.drain}`,
                  d.fading !== undefined && `Fading ${d.fading}`,
                  b.initiation > 0 && `Initiate ${b.initiation}`,
                  b.submersion > 0 && `Submersion ${b.submersion}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {picks.map(([label, xs]) => (
                <p key={label}>
                  <span className="n-lbl">{label}</span>{' '}
                  {xs
                    .map(x => {
                      const e = data.entry(x.kind, x.id),
                        a = e?.attrs ?? {},
                        drain = a.dv ?? a.fade
                      return `${e ? entryLabel(e) : (x.name ?? x.id)}${x.level !== undefined ? ` ${x.level}` : ''}${drain ? ` (${x.kind === 'complexforms' ? 'F' : 'D'}${drain})` : ''}`
                    })
                    .join(', ')}
                </p>
              ))}
            </section>
          )}
          {(lines('electronics').length > 0 || lines('programs').length > 0) && (
            <section aria-labelledby="n-matrix">
              <H id="n-matrix">Matrix</H>
              <ul className="n-flow">
                {lines('electronics').map(x => {
                  const a = attrsOf(x)
                  return (
                    <li key={x.uid}>
                      <b>{nameOf(x)}</b>
                      <span className="n-small">
                        {' '}
                        {[(x.rating ?? a.rating) && `DR ${x.rating ?? a.rating}`, a.array && `array ${a.array}`].filter(Boolean).join(', ')}
                      </span>
                    </li>
                  )
                })}
              </ul>
              {lines('programs').length > 0 && (
                <p>
                  <span className="n-lbl">Programs</span> {lines('programs').map(nameOf).join(', ')}
                </p>
              )}
            </section>
          )}
          <section aria-labelledby="n-gear">
            <H id="n-gear">Gear</H>
            <p className="n-gear">
              {lines('gear')
                .map(x => `${x.qty > 1 ? `${x.qty}× ` : ''}${nameOf(x)}${x.rating ? ` ${x.rating}` : ''}`)
                .join(' · ') || '—'}
            </p>
          </section>
          {lines('vehicles').length > 0 && (
            <section aria-labelledby="n-veh">
              <H id="n-veh">Vehicles & drones</H>
              <table className="n-veh">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Hand</th>
                    <th>Accel</th>
                    <th>Speed</th>
                    <th>Body</th>
                    <th>Armor</th>
                    <th>Pilot</th>
                    <th>Sensor</th>
                  </tr>
                </thead>
                <tbody>
                  {lines('vehicles').map(x => {
                    const a = attrsOf(x)
                    return (
                      <tr key={x.uid}>
                        <td>
                          <b>{nameOf(x)}</b>
                          {acc(x)}
                        </td>
                        <td>{a.handling}</td>
                        <td>{a.accel}</td>
                        <td>{a.topSpeed}</td>
                        <td>{a.body}</td>
                        <td>{a.armor}</td>
                        <td>{a.pilot}</td>
                        <td>{a.sensor}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          )}
        </main>
      </div>
    </article>
  )
}
