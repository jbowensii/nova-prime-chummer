// SR6 "Book style" printed sheet (Settings → Printed sheet): two pages laid out like the official Shadowrun 6 character
// sheet's boxes, in its order (page 1: personal data, attributes, skills, IDs, core combat info, condition monitor,
// qualities, contacts; page 2: weapons, armor, augmentations, gear, matrix, vehicles, spells, powers). Our own drawing
// and colours (the SR6 theme's cyan and pink, sheet.css), no art or text from the PDF. Short boxes keep a few blank
// ruled rows to write in, as the printed sheet does.
import type { ReactNode } from 'react'
import { bdClass, printBackdrop } from '../../ui/Portrait'
import type { useSheetArt } from '../../print/shared'
import { priced } from '../engine/budgets'
import { MAGIC_KINDS } from '../engine/data'
import { gradeName } from '../engine/grades'
import { CORE_ATTRS, MAGIC_KIND_LABELS, sinKind, sinName, type Sr6Attr } from '../model/character'
import { ATTR_NAMES, n, useSr6Editor } from '../ui/editor'
import { AR_BANDS, attrShown, band, br, pickFlags, poolOn, runnerView } from './view'
import { entryLabel } from '../engine/categories'

export type SheetArt = Pick<ReturnType<typeof useSheetArt>, 'layer' | 'vars'>

/** a table's rows padded with blank ruled rows up to `min` */
const pad = (rows: ReactNode[], min: number, cols: number) => [
  ...rows,
  ...Array.from({ length: Math.max(0, min - rows.length) }, (_, i) => (
    <tr key={`blank${i}`} className="k-blank" aria-hidden="true">
      {Array.from({ length: cols }, (_, j) => (
        <td key={j}>&nbsp;</td>
      ))}
    </tr>
  )),
]

function Box({ id, title, side, className = '', children }: { id: string; title: string; side: 'l' | 'r'; className?: string; children: ReactNode }) {
  return (
    <section className={`k-box k-${side} ${className}`} aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  )
}
/** a label and its value on a write-in line */
const F = ({ l, v, hi }: { l: string; v?: ReactNode; hi?: boolean }) => (
  <div className={hi ? 'k-f hi' : 'k-f'}>
    <span>{l}</span>
    <b>{v}</b>
  </div>
)

/** a damage track three boxes a row, each row's last box marked with its modifier; boxes past the runner's count blacked out */
export function Track({ count, rows, label }: { count: number | null; rows: number; label: string }) {
  const total = Math.max(rows, Math.ceil((count ?? 0) / 3)) * 3
  return (
    <div className="k-track" role="img" aria-label={count === null ? `${label}: a setting isn’t set` : `${label}: ${count} boxes`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={count !== null && i >= count ? 'off' : undefined}>
          {i % 3 === 2 && <i>−{(i + 1) / 3}</i>}
        </span>
      ))}
    </div>
  )
}
/** hexagons: `count` open, `total` drawn (the rest blacked out), numbered or not */
export function Hexes({ count, total, label, numbered }: { count: number; total: number; label: string; numbered?: boolean }) {
  return (
    <span className="k-hexes" role="img" aria-label={label}>
      {Array.from({ length: Math.max(total, count) }, (_, i) => (
        <svg key={i} viewBox="0 0 24 21" className={i >= count ? 'off' : undefined}>
          <polygon points="6.2,1 17.8,1 23,10.5 17.8,20 6.2,20 1,10.5" />
          {numbered && (
            <text x="12" y="14.6">
              {i + 1}
            </text>
          )}
        </svg>
      ))}
    </span>
  )
}

export function BookSheet({ art }: { art: SheetArt }) {
  const ctx = useSr6Editor(),
    { ch, data, cr, d } = ctx
  const b = ch.build,
    k = MAGIC_KINDS[b.magic]
  const v = runnerView(ctx),
    { lines, nameOf, attrsOf } = v
  const attr = (a: Sr6Attr) => <>{attrShown(d, a)}</>
  const init1 = (i?: { base: number; dice: number | null }) => i && `${i.base} + ${i.dice ?? '?'}D6`
  const init = (i?: { base: number; dice: number | null }, o?: { base: number; dice: number | null }) => br(init1(i), init1(o))
  const trained = d.pools.filter(p => p.rank > 0),
    half = Math.ceil(trained.length / 2)
  const armor = lines('armor'),
    worn = armor.find(x => x.worn) ?? armor[0]
  const ranged = v.rangedWeapons[0],
    melee = v.meleeWeapons[0]
  const licences = b.sins.flatMap(v.licencesOf)
  const acc = (x: (typeof b.purchases)[number]) =>
    x.accessories.length > 0 && (
      <div className="k-small">
        with {x.accessories.map(nameOf).join(', ')}
        {v.host(x) && ` (${v.host(x)})`}
      </div>
    )
  const skillTable = (rows: typeof trained, key: string) => (
    <table key={key} className="k-skills">
      <thead>
        <tr>
          <th>Skill</th>
          <th>Rnk</th>
          <th>Att</th>
          <th>Pool</th>
        </tr>
      </thead>
      <tbody>
        {pad(
          rows.map(p => (
            <tr key={p.skill}>
              <td>
                {p.label}
                {p.spec && (
                  <div className="k-small">
                    {p.spec}
                    {p.specDp !== undefined && ` ${br(p.specDp, poolOn(d, p.skill)?.specDp)}`}
                  </div>
                )}
                {p.expertise && (
                  <div className="k-small">
                    {p.expertise} (expertise){p.expertiseDp !== undefined && ` ${br(p.expertiseDp, poolOn(d, p.skill)?.expertiseDp)}`}
                  </div>
                )}
              </td>
              <td>{p.rank}</td>
              <td>{p.attr.toUpperCase()}</td>
              <td>
                <b>{br(p.dp, poolOn(d, p.skill)?.dp)}</b>
              </td>
            </tr>
          )),
          8,
          4,
        )}
      </tbody>
    </table>
  )
  const picks = (kinds: string[]) => b.picks.filter(x => kinds.includes(x.kind))
  const head = (
    <header className="k-head">
      <span className="k-brand" role="img" aria-label="Nova Prime Chummer Shadowrun 6">
        Nova Prime Chummer <b>Shadowrun</b> 6
      </span>
      <div className="k-who">
        <F l="Character" v={v.name} />
        <F l="Player" />
        <F l="Notes" v={ch.identity.notes.split('\n')[0]} />
      </div>
    </header>
  )

  return (
    <article className="sr6-book" style={art.vars}>
      {art.layer}
      <div className="k-page">
        {head}
        <div className="k-grid">
          <div className="k-col">
            <Box id="k-personal" title="Personal data" side="l">
              {ch.identity.portrait && <img className={`k-portrait${bdClass(printBackdrop(ch.identity.backdrop))}`} src={ch.identity.portrait} alt="" />}
              <F
                l="Name/primary alias"
                v={
                  <>
                    {v.name}
                    {ch.identity.name && ch.identity.name !== v.name && <span className="k-small"> ({ch.identity.name})</span>}
                  </>
                }
              />
              <div className="k-row">
                <F l="Metatype" v={data.metatypes[b.metatype]?.name} />
                <F l="Ethnicity" />
              </div>
              <div className="k-row">
                <F l="Age" />
                <F l="Gender" v={ch.identity.gender} />
                <F l="Height" />
                <F l="Weight" />
              </div>
              <div className="k-row">
                <F l="Reputation" />
                <F l="Heat" />
              </div>
              <div className="k-row">
                <F l="Karma" v={n(v.karma)} />
                <F l="Total karma" />
                <F l="Misc" v={b.magic !== 'mundane' ? MAGIC_KIND_LABELS[b.magic] : undefined} />
              </div>
              <F l="Awakened" v={v.awakened} />
            </Box>
            <Box id="k-attrs" title="Attributes" side="l" className="k-attrs">
              <div>
                {CORE_ATTRS.map(a => (
                  <F key={a} l={ATTR_NAMES[a]} v={attr(a)} hi={['bod', 'agi', 'rea', 'str'].includes(a)} />
                ))}
                <F l="Edge" v={attr('edg')} />
                <div className="k-f">
                  <span>Edge points</span>
                  <Hexes count={d.attrs.edg.augmented} total={7} label={`Edge points: ${d.attrs.edg.augmented}`} />
                </div>
                <F l="Unarmed AR" v={d.attackRatings.unarmed} />
              </div>
              <div>
                <F l="Essence" v={n(d.essence)} />
                <F l="Magic/Resonance" v={k.resonance ? attr('res') : b.magic !== 'mundane' ? attr('mag') : undefined} />
                <F l="Initiative" v={init(d.initiative, d.on.initiative)} hi />
                <F l="Matrix initiative" hi />
                <F l="Astral initiative" v={init(d.astralInit)} hi />
                <F l="Composure" v={br(d.composure, d.on.composure)} />
                <F l="Judge intentions" v={d.judgeIntentions} />
                <F l="Memory" v={d.memory} />
                <F l="Lift/carry" v={d.liftCarry} />
                <F l="Movement" />
                <F l="Defense rating" v={br(d.defenseRating, d.on.defenseRating)} />
                <F l="Social rating" v={br(d.socialRating, d.on.socialRating)} />
              </div>
            </Box>
            <Box id="k-skills" title="Skills" side="l" className="k-long">
              <div className="k-split">
                {skillTable(trained.slice(0, half), 'a')}
                {skillTable(trained.slice(half), 'b')}
              </div>
              <p className="k-know">
                <b>Languages</b> {v.langs.map(x => (x.native ? `${x.name} (native)` : `${x.name} ${x.points + x.karma}`)).join(', ') || '—'}
              </p>
              <p className="k-know">
                <b>Knowledge</b> {v.know.map(x => x.name).join(', ') || '—'}
              </p>
            </Box>
            <Box id="k-ids" title="IDs / lifestyles / currency" side="l">
              <F l="Primary lifestyle" v={v.lifestyle} />
              <div className="k-row">
                <F l="Nuyen" v={`${n(v.nuyen)}¥`} />
                <F l="Licenses" v={licences.join(', ')} />
              </div>
              <table className="k-plain">
                <thead>
                  <tr>
                    <th>Fake IDs / related lifestyles / funds / licenses</th>
                  </tr>
                </thead>
                <tbody>
                  {pad(
                    b.sins.map(s => (
                      <tr key={s.uid}>
                        <td>
                          {sinName(s)}{' '}
                          <span className="k-small">
                            ({sinKind(s)}
                            {s.gender && `, ${s.gender}`})
                          </span>
                          {v.lifeOf(s) && <span className="k-small"> · {v.lifeOf(s)}</span>}
                          {v.licencesOf(s).length > 0 && <span className="k-small"> · {v.licencesOf(s).join(', ')}</span>}
                        </td>
                      </tr>
                    )),
                    3,
                    1,
                  )}
                </tbody>
              </table>
            </Box>
          </div>
          <div className="k-col">
            <Box id="k-combat" title="Core combat info" side="r" className="k-combat">
              <div className="k-row">
                <F l="Primary armor" v={worn && nameOf(worn)} />
                <F l="Rating" v={worn && attrsOf(worn).defense} />
              </div>
              <F l="Primary ranged weapon" v={ranged && nameOf(ranged)} />
              <table className="k-mini">
                <thead>
                  <tr>
                    <th>DV</th>
                    <th>Mode</th>
                    {AR_BANDS.map(x => (
                      <th key={x}>{x}</th>
                    ))}
                    <th>Ammo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{ranged && v.dv(ranged)}</td>
                    <td>{ranged && attrsOf(ranged).modes}</td>
                    {(ranged ? v.bands(ranged) : AR_BANDS.map(() => null)).map((x, i) => (
                      <td key={i}>{ranged ? band(x) : ''}</td>
                    ))}
                    <td>{ranged && attrsOf(ranged).ammo}</td>
                  </tr>
                </tbody>
              </table>
              <F l="Primary melee weapon" v={melee && nameOf(melee)} />
              <table className="k-mini">
                <thead>
                  <tr>
                    <th>DV</th>
                    <th>Close</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{melee && v.dv(melee)}</td>
                    <td>{melee ? band(v.bands(melee)[0]) : d.attackRatings.unarmed}</td>
                  </tr>
                </tbody>
              </table>
            </Box>
            <Box id="k-monitor" title="Condition monitor" side="r" className="k-monitor">
              <div>
                <h3>Physical damage track</h3>
                <Track count={d.monitors.physical} rows={6} label="Physical damage track" />
              </div>
              <div>
                <h3>Stun damage track</h3>
                <Track count={d.monitors.stun} rows={4} label="Stun damage track" />
                <h3>Overflow</h3>
                <div className="k-over" role="img" aria-label={`Overflow: ${d.monitors.overflow} boxes`}>
                  {Array.from({ length: d.monitors.overflow }, (_, i) => (
                    <span key={i} />
                  ))}
                </div>
              </div>
            </Box>
            <Box id="k-qualities" title="Qualities" side="r">
              <table>
                <thead>
                  <tr>
                    <th>Quality</th>
                    <th>Notes</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {pad(
                    b.qualities.map(q => {
                      const x = data.qualities[q.id]
                      return (
                        <tr key={q.uid}>
                          <td>
                            {x?.name ?? q.name ?? q.id}
                            {x?.perLevel && ` ${q.level}`}
                          </td>
                          <td className="k-small">{[q.note, ...v.qualityNotes(q)].filter(Boolean).join('; ')}</td>
                          <td>{q.free ? 'Metatype' : x ? (x.positive ? 'Positive' : 'Negative') : ''}</td>
                        </tr>
                      )
                    }),
                    6,
                    3,
                  )}
                </tbody>
              </table>
            </Box>
            <Box id="k-contacts" title="Contacts" side="r">
              <table className="k-contacts">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Loyalty</th>
                    <th>Connection</th>
                  </tr>
                </thead>
                <tbody>
                  {pad(
                    b.contacts.map(x => (
                      <tr key={x.uid}>
                        <td>
                          {x.name || 'Contact'}
                          {x.archetype && <span className="k-small">, {x.archetype}</span>}
                        </td>
                        <td>{x.loyalty}</td>
                        <td>{x.connection}</td>
                      </tr>
                    )),
                    5,
                    3,
                  )}
                </tbody>
              </table>
            </Box>
          </div>
        </div>
      </div>

      <div className="k-page k-page2">
        {head}
        <div className="k-grid">
          <div className="k-col">
            <Box id="k-ranged" title="Ranged weapons" side="l">
              <table className="k-ranged">
                <thead>
                  <tr>
                    <th>Weapon</th>
                    <th>DV</th>
                    <th>Mode</th>
                    {AR_BANDS.map(x => (
                      <th key={x} title={`Attack Rating, ${x}`}>
                        {x.slice(0, 3)}
                      </th>
                    ))}
                    <th>Ammo</th>
                  </tr>
                </thead>
                <tbody>
                  {pad(
                    v.rangedWeapons.map(x => {
                      const a = attrsOf(x)
                      return (
                        <tr key={x.uid}>
                          <td>
                            {nameOf(x)}
                            {acc(x)}
                          </td>
                          <td>{v.dv(x)}</td>
                          <td>{a.modes}</td>
                          {v.bands(x).map((y, i) => (
                            <td key={i}>{band(y)}</td>
                          ))}
                          <td>{a.ammo}</td>
                        </tr>
                      )
                    }),
                    4,
                    9,
                  )}
                </tbody>
              </table>
            </Box>
            <Box id="k-armor" title="Armor" side="l">
              <table>
                <thead>
                  <tr>
                    <th>Armor</th>
                    <th>Rating</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {pad(
                    armor.map(x => (
                      <tr key={x.uid}>
                        <td>
                          {nameOf(x)}
                          {acc(x)}
                        </td>
                        <td>{attrsOf(x).defense}</td>
                        <td>{[x.worn && 'Worn', v.social(x) && `Social ${v.social(x)}`, x.note].filter(Boolean).join(', ')}</td>
                      </tr>
                    )),
                    3,
                    3,
                  )}
                </tbody>
              </table>
            </Box>
            <Box id="k-augs" title="Augmentations" side="l">
              <table>
                <thead>
                  <tr>
                    <th>Augmentation</th>
                    <th>Rating</th>
                    <th>Notes</th>
                    <th>Essence</th>
                  </tr>
                </thead>
                <tbody>
                  {pad(
                    lines('augmentations').map(x => (
                      <tr key={x.uid}>
                        <td>
                          {nameOf(x)}
                          {acc(x)}
                        </td>
                        <td>{x.rating}</td>
                        <td>{[x.grade && gradeName(data, x.grade), x.note].filter(Boolean).join(', ')}</td>
                        <td>{n(priced(x, data, cr).essence)}</td>
                      </tr>
                    )),
                    4,
                    4,
                  )}
                </tbody>
              </table>
            </Box>
            <Box id="k-gear" title="Gear" side="l" className="k-long">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {pad(
                    lines('gear').map(x => (
                      <tr key={x.uid}>
                        <td>
                          {x.qty > 1 && `${x.qty}× `}
                          {nameOf(x)}
                          {x.note && <span className="k-small"> {x.note}</span>}
                        </td>
                        <td>{x.rating}</td>
                      </tr>
                    )),
                    8,
                    2,
                  )}
                </tbody>
              </table>
            </Box>
          </div>
          <div className="k-col">
            <Box id="k-melee" title="Melee weapons" side="r">
              <table>
                <thead>
                  <tr>
                    <th>Weapon</th>
                    <th>DV</th>
                    <th>Close</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Unarmed</td>
                    <td />
                    <td>{d.attackRatings.unarmed}</td>
                  </tr>
                  {pad(
                    v.meleeWeapons.map(x => (
                      <tr key={x.uid}>
                        <td>
                          {nameOf(x)}
                          {acc(x)}
                        </td>
                        <td>{v.dv(x)}</td>
                        <td>{band(v.bands(x)[0])}</td>
                      </tr>
                    )),
                    2,
                    3,
                  )}
                </tbody>
              </table>
            </Box>
            <Box id="k-matrix" title="Matrix stats" side="r" className="k-matrix">
              <div className="k-row">
                <F l="Attack" />
                <F l="Sleaze" />
                <F l="Data proc." />
                <F l="Firewall" />
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Devices</th>
                    <th>DR</th>
                    <th>Array</th>
                  </tr>
                </thead>
                <tbody>
                  {pad(
                    lines('electronics').map(x => {
                      const a = attrsOf(x)
                      return (
                        <tr key={x.uid}>
                          <td>
                            {nameOf(x)}
                            {acc(x)}
                          </td>
                          <td>{x.rating ?? a.rating}</td>
                          <td>{a.array}</td>
                        </tr>
                      )
                    }),
                    2,
                    3,
                  )}
                </tbody>
              </table>
              <F l="Programs" v={lines('programs').map(nameOf).join(', ')} />
              <div className="k-f">
                <span>Matrix condition monitor</span>
                <Hexes count={12} total={12} label="Matrix condition monitor: 12 boxes" numbered />
              </div>
            </Box>
            {(lines('vehicles').length ? lines('vehicles') : [undefined]).map((x, i) => {
              const a = x ? attrsOf(x) : {}
              return (
                <Box key={x?.uid ?? 'none'} id={`k-vehicle${i}`} title="Vehicle" side="r" className="k-vehicle">
                  <div className="k-row">
                    <F l="Vehicle" v={x && nameOf(x)} />
                    <F l="Handling" v={a.handling} />
                  </div>
                  <div className="k-row">
                    <F l="Acceleration" v={a.accel} />
                    <F l="Speed interval" v={a.interval} />
                  </div>
                  <div className="k-row">
                    <F l="Top speed" v={a.topSpeed} />
                    <F l="Body" v={a.body} />
                  </div>
                  <div className="k-row">
                    <F l="Armor" v={a.armor} />
                    <F l="Pilot" v={a.pilot} />
                  </div>
                  <div className="k-row">
                    <F l="Sensor" v={a.sensor} />
                    <F l="Seats" v={a.seats} />
                  </div>
                  <F l="Notes" v={x && v.vehicleNotes(x).join('; ')} />
                </Box>
              )
            })}
            {/* (the same critter data as the other styles: view.ts critterNotes) */}
            {lines('critters').map((x, i) => (
              <Box key={x.uid} id={`k-critter${i}`} title="Critter" side="r" className="k-vehicle">
                <F l="Critter" v={nameOf(x)} />
                <F l="Notes" v={v.critterNotes(x).join('; ')} />
              </Box>
            ))}
            <Box id="k-spells" title="Spells / preparations / rituals / complex forms" side="r">
              <table className="k-spells">
                <thead>
                  <tr>
                    <th>S/P/R/CF</th>
                    <th>Type/target</th>
                    <th>Range</th>
                    <th>Duration</th>
                    <th>Drain</th>
                  </tr>
                </thead>
                <tbody>
                  {pad(
                    picks(['spells', 'rituals', 'complexforms']).map(x => {
                      const e = data.entry(x.kind, x.id),
                        a = e?.attrs ?? {}
                      return (
                        <tr key={x.uid}>
                          <td>{e ? entryLabel(e) : (x.name ?? x.id)}</td>
                          <td>{[a.category, a.type, a.keywords, ...(e ? pickFlags(e) : [])].filter(Boolean).join(', ')}</td>
                          <td>{a.range}</td>
                          <td>{a.duration}</td>
                          <td>{a.dv ?? a.fade ?? a.threshold}</td>
                        </tr>
                      )
                    }),
                    5,
                    5,
                  )}
                </tbody>
              </table>
            </Box>
            <Box id="k-powers" title="Adept powers or other abilities" side="r">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Level</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {pad(
                    picks(['adeptpowers', 'metamagics', 'echoes']).map(x => {
                      const e = data.entry(x.kind, x.id),
                        pw = data.powers[x.id]
                      return (
                        <tr key={x.uid}>
                          <td>{e ? entryLabel(e) : (x.name ?? x.id)}</td>
                          <td>{x.level}</td>
                          <td className="k-small">
                            {x.kind === 'adeptpowers'
                              ? pw?.cost != null && `${pw.cost} PP${pw.perLevel ? ' a level' : ''}`
                              : x.kind === 'metamagics'
                                ? ['Metamagic', ...(e ? pickFlags(e) : [])].join(', ')
                                : 'Echo'}
                          </td>
                        </tr>
                      )
                    }),
                    4,
                    3,
                  )}
                </tbody>
              </table>
            </Box>
          </div>
        </div>
        {(ch.identity.background || ch.identity.notes || v.effectNotes.length > 0) && (
          <section className="k-box k-wide" aria-labelledby="k-notes">
            <h2 id="k-notes">Notes</h2>
            {ch.identity.background && <p>{ch.identity.background}</p>}
            {ch.identity.notes && <p>{ch.identity.notes}</p>}
            {v.effectNotes.length > 0 && (
              <ul className="k-small">
                {v.effectNotes.map((x, i) => (
                  <li key={i}>
                    <b>{x.from}:</b> {x.text}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </article>
  )
}
