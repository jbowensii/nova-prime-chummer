// The printable SR6 sheet (#/sr6/c/<id>/print): the Anarchy print page's toolbar (Back, Print, Sheet type, Background)
// and paper (src/ca2/print/ui/sheet.css: its page-break rules, art veil and print styles) with the SR6 runner's blocks.
// Browser "Save as PDF" makes the PDF. An NPC prints its header, its NPC block (NpcBlock.tsx), background and notes.
// A runner's Book style, Neon, Hex and Dossier sheets: BookSheet.tsx, NeonSheet.tsx, HexSheet.tsx, DossierSheet.tsx (an NPC
// prints its block whatever the style).
import { SR6_PRINT_STYLES } from '../../../core/ui-kit/settings'
import { bdClass, printBackdrop } from '../../../core/ui-kit/Portrait'
import { HeaderBars } from '../../../core/chrome/nav'
import { IconButton, IconLink } from '../../../core/ui-kit/icons'
import { SheetType, usePrintStyle, useSheetArt } from '../../../features/appearance/sheetArt'
import '../../../ca2/print/ui/sheet.css'
import './sheet.css'
import { entryOf, priced } from '../../runner-builder/domain/creation/budgets'
import { MAGIC_KINDS } from '../../catalog/domain/data'
import { gradeName } from '../../runner-builder/domain/creation/grades'
import { CORE_ATTRS, MAGIC_KIND_LABELS, sinKind, sinName, type Sr6Attr } from '../../formats/domain/character'
import { adeptDrainLabel, ATTR_NAMES, n, sr6Href, useSr6Editor } from '../../runner-builder/ui/editor'
import { npcHeadline } from '../../runner-builder/domain/creation/npc'
import { NpcBlock } from '../../runner-builder/ui/NpcBlock'
import { BookSheet } from './BookSheet'
import { NeonSheet } from './NeonSheet'
import { HexSheet } from './HexSheet'
import { DossierSheet } from './DossierSheet'
import { attrShown, band, br, pickFlags, PICKS, poolOn, runnerView } from '../../runner-builder/ui/view'
import { entryLabel } from '../../catalog/domain/categories'

const boxes = (k: number | null, cls = '') =>
  k === null ? (
    <span className="s-small">— (a setting isn’t set)</span>
  ) : (
    <div className="s-boxes sr6-boxes">
      {Array.from({ length: k }, (_, i) => (
        <span key={i} className={cls} />
      ))}
    </div>
  )

export function Sr6Sheet() {
  const ctx = useSr6Editor(),
    { ch, data, cr, d } = ctx
  const b = ch.build,
    art = useSheetArt(ch.id, 'sr6'),
    k = MAGIC_KINDS[b.magic],
    style = usePrintStyle()
  const {
    name,
    lines,
    nameOf,
    rated,
    know,
    langs,
    gear,
    lifestyle,
    lifeOf,
    licencesOf,
    dv,
    awakened,
    qualityNotes,
    karma,
    nuyen,
    host,
    effectNotes,
    vehicleNotes,
    critterNotes,
  } = runnerView(ctx)
  const acc = (x: (typeof b.purchases)[number]) =>
    x.accessories.length > 0 && (
      <div className="s-small">
        with {x.accessories.map(nameOf).join(', ')}
        {host(x) && ` (${host(x)})`}
      </div>
    )
  const attr = (a: Sr6Attr) => (
    <div key={a}>
      <span>{ATTR_NAMES[a]}</span>
      <b>{attrShown(d, a)}</b>
    </div>
  )
  const init1 = (i?: { base: number; dice: number | null }) => i && `${i.base} + ${i.dice ?? '?'}D6`
  const init = (i?: { base: number; dice: number | null }, o?: { base: number; dice: number | null }) => br(init1(i), init1(o))

  return (
    <div className="sheet-wrap">
      <div className="sheet-tools">
        <HeaderBars>
          <IconLink icon="back" label="Back to editing" href={sr6Href(ch, ch.npc ? 'stats' : 'review')} />
          <IconButton className="primary" icon="print" label="Print or save as PDF" onClick={() => print()} />
          <SheetType styles={SR6_PRINT_STYLES} />
          {art.tools}
        </HeaderBars>
      </div>
      {!ch.npc && style === 'book' ? (
        <BookSheet art={art} />
      ) : !ch.npc && style === 'neon' ? (
        <NeonSheet art={art} />
      ) : !ch.npc && style === 'hex' ? (
        <HexSheet art={art} />
      ) : !ch.npc && style === 'dossier' ? (
        <DossierSheet art={art} />
      ) : ch.npc ? (
        <article className="sheet sr6-sheet" style={art.vars}>
          {art.layer}
          <div className="s-top">
            <header className="s-head">
              <div>
                <div className="s-label">NPC</div>
                <h1>{name}</h1>
                <div className="s-role">{npcHeadline(ch.npc)}</div>
                {ch.identity.name && ch.identity.name !== name && <div className="s-small">{ch.identity.name}</div>}
              </div>
              <span className="brand" role="img" aria-label="Nova Prime Chummer Shadowrun 6">
                Nova Prime Chummer <b>Shadowrun</b> 6
              </span>
            </header>
            {ch.identity.portrait && <img className={`portrait${bdClass(printBackdrop(ch.identity.backdrop))}`} src={ch.identity.portrait} alt="" />}
          </div>
          <NpcBlock npc={ch.npc} name={name} data={data} />
          {ch.identity.background && (
            <section>
              <h2>Background</h2>
              <p>{ch.identity.background}</p>
            </section>
          )}
          {ch.identity.notes && (
            <section>
              <h2>Notes</h2>
              <p>{ch.identity.notes}</p>
            </section>
          )}
        </article>
      ) : (
        <article className="sheet sr6-sheet" style={art.vars}>
          {art.layer}
          <div className="s-top">
            <header className="s-head">
              <div>
                <div className="s-label">Street name</div>
                <h1>{name}</h1>
                <div className="s-role">
                  {[data.metatypes[b.metatype]?.name, ch.identity.gender, b.magic !== 'mundane' && MAGIC_KIND_LABELS[b.magic]].filter(Boolean).join(', ')}
                </div>
                {ch.identity.name && ch.identity.name !== name && <div className="s-small">{ch.identity.name}</div>}
              </div>
              <span className="brand" role="img" aria-label="Nova Prime Chummer Shadowrun 6">
                Nova Prime Chummer <b>Shadowrun</b> 6
              </span>
            </header>
            {ch.identity.portrait && <img className={`portrait${bdClass(printBackdrop(ch.identity.backdrop))}`} src={ch.identity.portrait} alt="" />}
            <section className="s-attrs sr6-attrs">
              {CORE_ATTRS.map(attr)}
              {attr('edg')}
              {k.resonance ? attr('res') : b.magic !== 'mundane' && attr('mag')}
              <div>
                <span>Essence</span>
                <b>{n(d.essence)}</b>
              </div>
            </section>
          </div>

          <div className="s-cols">
            <section>
              <h2>Skills</h2>
              <table className="sr6-pools">
                <thead>
                  <tr>
                    <th>Skill</th>
                    <th>Rank</th>
                    <th>Att.</th>
                    <th>= Dice</th>
                  </tr>
                </thead>
                <tbody>
                  {d.pools.map(p => (
                    <tr key={p.skill} className={p.rank ? '' : 'untrained'}>
                      <td>
                        {p.label}
                        {p.spec && (
                          <div className="s-small">
                            {p.spec}
                            {p.specDp !== undefined && ` ${br(p.specDp, poolOn(d, p.skill)?.specDp)}`}
                          </div>
                        )}
                        {p.expertise && (
                          <div className="s-small">
                            {p.expertise} (expertise){p.expertiseDp !== undefined && ` ${br(p.expertiseDp, poolOn(d, p.skill)?.expertiseDp)}`}
                          </div>
                        )}
                      </td>
                      <td>{p.rank || '—'}</td>
                      <td>{p.attr.toUpperCase()}</td>
                      <td>
                        <b>{br(p.dp, poolOn(d, p.skill)?.dp)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h2>Languages & knowledge</h2>
              <ul>
                {[...langs, ...know].map(x => (
                  <li key={x.uid}>
                    {x.name}
                    {x.native ? (
                      <span className="s-small"> (native)</span>
                    ) : x.kind === 'language' ? (
                      <span className="s-small"> {x.points + x.karma}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {!b.knowledge.length && <p>—</p>}
              <h2>Qualities</h2>
              <ul>
                {b.qualities.map(q => {
                  const v = data.qualities[q.id]
                  return (
                    <li key={q.uid}>
                      {v?.name ?? q.name ?? q.id}
                      {v?.perLevel && ` ${q.level}`}
                      {q.free && <span className="s-small"> (metatype)</span>}
                      {/* (an Infected type's gained powers and weaknesses, Stolen Gear's bounty: view.ts qualityNotes) */}
                      {qualityNotes(q).map(t => (
                        <div key={t} className="s-small">
                          {t}
                        </div>
                      ))}
                    </li>
                  )
                })}
              </ul>
              {!b.qualities.length && <p>—</p>}
            </section>
            <section>
              <h2>Condition monitors</h2>
              <p className="s-small">Physical {br(d.monitors.physical, d.on.monitors.physical) ?? '—'}</p>
              {boxes(d.monitors.physical)}
              <p className="s-small">Stun {br(d.monitors.stun, d.on.monitors.stun) ?? '—'}</p>
              {boxes(d.monitors.stun, 's')}
              <p className="s-small">Overflow {br(d.monitors.overflow, d.on.monitors.overflow)}</p>
              {boxes(d.monitors.overflow, 'i')}
              <p className="s-small">Edge points {d.attrs.edg.augmented}</p>
              <div className="s-boxes sr6-edge" aria-hidden="true">
                {Array.from({ length: d.attrs.edg.augmented }, (_, i) => (
                  <span key={i} />
                ))}
              </div>
              <table className="sr6-derived-t">
                <tbody>
                  {(
                    [
                      ['Initiative', init(d.initiative, d.on.initiative)],
                      ['Astral initiative', init(d.astralInit, d.on.astralInit)],
                      ['Defense Rating', br(d.defenseRating, d.on.defenseRating)],
                      ['Social Rating', br(d.socialRating, d.on.socialRating)],
                      ['Awakened', awakened],
                      ['Composure', br(d.composure, d.on.composure)],
                      ['Judge Intentions', br(d.judgeIntentions, d.on.judgeIntentions)],
                      ['Memory', br(d.memory, d.on.memory)],
                      ['Lift/Carry', br(d.liftCarry, d.on.liftCarry)],
                      ['Drain', d.drain],
                      [d.adeptDrain ? adeptDrainLabel(d.adeptDrain) : 'Adept drain', br(d.adeptDrain?.value, d.on.adeptDrain?.value)],
                      ['Fading', d.fading],
                      ['Spell Attack Rating', br(d.spellAttackRating, d.on.spellAttackRating)],
                      ['Matrix initiative (AR)', d.matrixInit && init(d.matrixInit.ar, d.on.matrixInit?.ar)],
                      ['Matrix initiative (VR cold)', d.matrixInit && init(d.matrixInit.cold, d.on.matrixInit?.cold)],
                      ['Matrix initiative (VR hot)', d.matrixInit && init(d.matrixInit.hot, d.on.matrixInit?.hot)],
                      ['Movement', d.movement ? `${d.movement.walk} m / Sprint ${d.movement.sprint} m +${d.movement.perHit} a hit` : undefined],
                    ] as [string, string | number | undefined][]
                  )
                    .filter(([, v]) => v !== undefined)
                    .map(([l, v]) => (
                      <tr key={l}>
                        <td>{l}</td>
                        <td>
                          <b>{v}</b>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <h2>Karma & nuyen</h2>
              <p>
                {n(karma)} karma · {n(nuyen)}¥
              </p>
            </section>
          </div>

          <section>
            <h2>Weapons</h2>
            <table className="sr6-weapons">
              <thead>
                <tr>
                  <th>Weapon</th>
                  <th>DV</th>
                  <th>Attack Ratings</th>
                  <th>Dice pool</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Unarmed</td>
                  <td>{d.unarmedDamage ? `${d.unarmedDamage.dv}${d.unarmedDamage.physical ? 'P' : 'S'}` : ''}</td>
                  <td>{d.attackRatings.unarmed}</td>
                  <td>{d.pools.find(p => p.label === 'Close Combat')?.dp ?? ''}</td>
                </tr>
                {lines('weapons').map(x => {
                  const w = d.attackRatings.weapons.find(a => a.uid === x.uid)
                  return (
                    <tr key={x.uid}>
                      <td>
                        <b>{nameOf(x)}</b>
                        {acc(x)}
                      </td>
                      <td>{dv(x)}</td>
                      <td>{w ? w.bands.map(band).join('/') : ''}</td>
                      <td>{w?.pool ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
          {lines('armor').length > 0 && (
            <section>
              <h2>Armor</h2>
              <table>
                <thead>
                  <tr>
                    <th>Armor</th>
                    <th>Defense</th>
                    <th>Social</th>
                    <th>Worn</th>
                  </tr>
                </thead>
                <tbody>
                  {lines('armor').map(x => (
                    <tr key={x.uid}>
                      <td>
                        <b>{nameOf(x)}</b>
                        {acc(x)}
                      </td>
                      <td>{entryOf(x, data)?.attrs.defense ?? ''}</td>
                      <td>{entryOf(x, data)?.attrs.social ?? ''}</td>
                      <td>{x.worn ? 'Worn' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {lines('augmentations').length > 0 && (
            <section>
              <h2>Augmentations</h2>
              <table>
                <thead>
                  <tr>
                    <th>Augmentation</th>
                    <th>Grade</th>
                    <th>Essence</th>
                  </tr>
                </thead>
                <tbody>
                  {lines('augmentations').map(x => (
                    <tr key={x.uid}>
                      <td>
                        <b>{nameOf(x)}</b>
                        {x.rating && <span className="s-small"> rating {x.rating}</span>}
                        {acc(x)}
                      </td>
                      <td>{x.grade ? gradeName(data, x.grade) : ''}</td>
                      <td>{n(priced(x, data, cr).essence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {b.magic !== 'mundane' && (
            <section>
              <h2>{k.resonance ? 'Resonance' : 'Magic'}</h2>
              <p className="s-small">
                {[
                  k.spells && b.tradition && `Tradition: ${b.tradition}`,
                  d.drain !== undefined && `Drain ${d.drain}`,
                  d.adeptDrain && `${adeptDrainLabel(d.adeptDrain)} ${br(d.adeptDrain.value, d.on.adeptDrain?.value)}`,
                  d.fading !== undefined && `Fading ${d.fading}`,
                  b.initiation > 0 && `Initiation grade ${b.initiation}`,
                  b.submersion > 0 && `Submersion grade ${b.submersion}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <table className="sr6-picks">
                <tbody>
                  {PICKS.flatMap(([kind, label]) =>
                    b.picks
                      .filter(x => x.kind === kind)
                      .map(x => (
                        <tr key={x.uid}>
                          <td>
                            <b>{(e => (e ? entryLabel(e) : (x.name ?? x.id)))(data.entry(kind, x.id))}</b>
                            {x.level !== undefined && ` ${x.level}`}
                          </td>
                          <td>{[label.replace(/s$/, ''), ...(e => (e ? pickFlags(e) : []))(data.entry(kind, x.id))].join(' · ')}</td>
                        </tr>
                      )),
                  )}
                </tbody>
              </table>
            </section>
          )}
          <div className="s-cols">
            <section>
              <h2>Gear</h2>
              <ul>
                {gear.map(x => (
                  <li key={x.uid}>
                    {x.qty > 1 && `${x.qty}× `}
                    {nameOf(x)}
                    {rated(x) && <span className="s-small"> ({rated(x)})</span>}
                  </li>
                ))}
              </ul>
              {!gear.length && <p>—</p>}
            </section>
            <section>
              <h2>Contacts</h2>
              <ul>
                {b.contacts.map(x => (
                  <li key={x.uid}>
                    {x.name || 'Contact'}
                    {x.archetype && `, ${x.archetype}`}
                    <span className="s-small">
                      {' '}
                      connection {x.connection}, loyalty {x.loyalty}
                    </span>
                  </li>
                ))}
              </ul>
              {!b.contacts.length && <p>—</p>}
              <h2>SINs & lifestyles</h2>
              {!lifestyle && <p>No lifestyle</p>}
              <ul>
                {b.sins.map(s => (
                  <li key={s.uid}>
                    {sinName(s)}{' '}
                    <span className="s-small">
                      ({sinKind(s)}
                      {s.gender && `, ${s.gender}`})
                    </span>
                    {lifeOf(s) && <div>{lifeOf(s)}</div>}
                    {licencesOf(s).length > 0 && <div className="s-small">Licences: {licencesOf(s).join(', ')}</div>}
                  </li>
                ))}
              </ul>
            </section>
          </div>
          {effectNotes.length > 0 && (
            <section>
              <h2>Effects</h2>
              <ul className="s-small">
                {effectNotes.map((x, i) => (
                  <li key={i}>
                    <b>{x.from}:</b> {x.text}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {lines('vehicles').length > 0 && (
            <section>
              <h2>Vehicles & drones</h2>
              <table>
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Handling</th>
                    <th>Body</th>
                    <th>Armor</th>
                    <th>Pilot</th>
                    <th>Sensor</th>
                  </tr>
                </thead>
                <tbody>
                  {lines('vehicles').map(x => {
                    const a = entryOf(x, data)?.attrs ?? {}
                    return (
                      <tr key={x.uid}>
                        <td>
                          <b>{nameOf(x)}</b>
                          {vehicleNotes(x).map(t => (
                            <div key={t} className="s-small">
                              {t}
                            </div>
                          ))}
                        </td>
                        <td>{a.handling}</td>
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
          {/* (the same critter data as the other styles: view.ts critterNotes) */}
          {lines('critters').length > 0 && (
            <section>
              <h2>Critters</h2>
              {lines('critters').map(x => (
                <div key={x.uid}>
                  <b>{nameOf(x)}</b>
                  {critterNotes(x).map(t => (
                    <div key={t} className="s-small">
                      {t}
                    </div>
                  ))}
                </div>
              ))}
            </section>
          )}
          {ch.identity.background && (
            <section>
              <h2>Background</h2>
              <p>{ch.identity.background}</p>
            </section>
          )}
        </article>
      )}
    </div>
  )
}
