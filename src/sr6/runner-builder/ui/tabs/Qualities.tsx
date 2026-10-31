// Qualities: the positive and negative ones taken (a leveled one with its level, a metatype trait marked free and kept,
// each with its note: the attribute or skill a quality naming its choice is for), a picker for each side (a quality naming
// its choice may be taken again, for another), and the net karma line against the cap.
import { useState } from 'react'
import { Modal, Picker, Stepper } from '../../../../core/ui-kit/bits'
import {
  choiceOptions,
  choiceSelectOptions,
  noteAttr,
  noteSkill,
  qualityChoice,
  qualityCost,
  qualityKarma,
  qualityPrice,
  settingQuality,
  toNuyen,
} from '../../domain/creation/budgets'
import { stolenLeft } from '../../domain/career/career'
import { flag, num } from '../../../table-setup/domain/creation'
import { qualityFitsMetatype, type Sr6QualityView } from '../../../catalog/domain/data'
import { infectedOf, optionalPower, powerRefusal, priceAwakened } from '../../domain/creation/infected'
import { infectedOff } from '../../domain/assets/critterware'
import { n, useSr6Editor } from '../editor'
import { House, Situational } from '../Picker'
import { cardOf, Sr6Ref } from '../EntryRef'

export function QualitiesTab() {
  const { ch, c, data, cr, act } = useSr6Editor()
  const b = ch.build
  const [picking, setPicking] = useState<'positive' | 'negative' | null>(null)
  const { pos, neg } = qualityKarma(b, data, cr)
  const cap = num(cr, 'qualityNetBonusCap'),
    most = num(cr, 'qualityMaxCount')
  const all = Object.values(data.qualities)
    .filter(q => !q.parent)
    .sort((a, z) => a.name.localeCompare(z.name))
  // a quality of a family of levels (levels.ts): its stepper moves the line to the sibling level's entry
  const levels = (id: string) => data.siblings('qualities', id).map(e => data.levelOf(e)!)
  const side = (positive: boolean) => b.qualities.filter(q => (data.qualities[q.id]?.positive ?? true) === positive)
  // (a price by the Awakened flag, <karmaif>: `54 (less 10 if the character is already Awakened; this runner: 44)`)
  const awakenedPrice = (q: Sr6QualityView) =>
    q.karmaIf
      ? ` (${q.karmaIf.note ?? `${q.karmaIf.value} if Awakened`}; this runner: ${priceAwakened(b, data, q.id) ? Math.abs(q.karmaIf.value) : q.karma})`
      : ''
  const pick = (id: string) => {
    if (!act({ op: 'quality', id })) setPicking(null)
  }

  const table = (positive: boolean) => {
    const rows = side(positive)
    return rows.length === 0 ? (
      <p className="muted">None yet.</p>
    ) : (
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>Quality</th>
              <th>Note</th>
              <th>Level</th>
              <th className="num">Karma</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(q => {
              const v = data.qualities[q.id],
                want = qualityChoice(v?.name),
                co = choiceOptions(data, data.entry('qualities', q.id))
              const named =
                want === 'attribute' ? noteAttr(q.note)?.toUpperCase() : want === 'skill' ? data.skills[noteSkill(data, q.note) ?? '']?.name : undefined
              return (
                <tr key={q.uid}>
                  <td>
                    <Sr6Ref kind="qualities" id={q.id}>
                      <b>{v?.name ?? q.name ?? q.id}</b>
                    </Sr6Ref>
                    {!v && <span className="err"> (no longer in the catalog)</span>}
                    <Situational line={q} name={v?.name ?? q.name ?? q.id} />
                    {q.free && (
                      <>
                        {' '}
                        <span className="noncanon">Metatype trait</span>
                      </>
                    )}
                    {/* (No Future errata, NF p. 162: its bounty is the karma converted at creation not yet bought off) */}
                    {settingQuality(b, cr, 'stolenGearQuality', data) === q && (
                      <div className="muted small">
                        Bounty: {stolenLeft(b, cr, data, q)} of {toNuyen(b, cr, data)} karma turned into nuyen not bought off (No Future errata)
                      </div>
                    )}
                  </td>
                  <td>
                    {co && co.kind !== 'text' ? (
                      <select
                        value={q.note ?? ''}
                        aria-label={`${v?.name ?? q.id} note`}
                        onChange={e => act({ op: 'quality', id: q.id, uid: q.uid, note: e.target.value })}
                      >
                        <option value="">Pick one</option>
                        {choiceSelectOptions(co, q.note).map(o => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        key={`${q.uid}:${q.note ?? ''}`}
                        defaultValue={q.note ?? ''}
                        maxLength={200}
                        aria-label={`${v?.name ?? q.id} note`}
                        onBlur={e => {
                          if (e.target.value.trim() !== (q.note ?? '')) act({ op: 'quality', id: q.id, uid: q.uid, note: e.target.value })
                        }}
                      />
                    )}
                    {want && <div className={named ? 'muted small' : 'err small'}>{named ? `For ${named}` : `Name the ${want}`}</div>}
                  </td>
                  <td>
                    {v?.perLevel ? (
                      <Stepper
                        label={`${v.name} level`}
                        value={q.level}
                        min={1}
                        max={Number.isFinite(v.maxLevel) ? v.maxLevel! : 99}
                        onChange={level => act({ op: 'quality', id: q.id, uid: q.uid, level })}
                      />
                    ) : levels(q.id).length > 1 ? (
                      <Stepper
                        label={`${v?.name ?? q.id} level`}
                        value={data.levelOf(data.entry('qualities', q.id)) ?? 1}
                        min={levels(q.id)[0]}
                        max={levels(q.id).at(-1)!}
                        onChange={level => act({ op: 'quality', id: q.id, uid: q.uid, level })}
                      />
                    ) : (
                      ''
                    )}
                  </td>
                  <td className="num">
                    {q.free ? (
                      'free'
                    ) : v?.karma == null ? (
                      '?'
                    ) : v.karmaSteps?.length ? (
                      <select
                        aria-label={`${v.name} karma`}
                        value={qualityCost(q, v) / (v.perLevel ? q.level : 1)}
                        onChange={e => act({ op: 'quality', id: q.id, uid: q.uid, karma: Number(e.target.value) })}
                      >
                        {v.karmaSteps.map(k => (
                          <option key={k} value={Math.abs(k)}>
                            {Math.abs(k)}
                          </option>
                        ))}
                      </select>
                    ) : v.karmaMax != null ? (
                      <Stepper
                        label={`${v.name} karma`}
                        value={qualityCost(q, v) / (v.perLevel ? q.level : 1)}
                        min={Math.abs(v.karma)}
                        max={Math.abs(v.karmaMax)}
                        onChange={karma => act({ op: 'quality', id: q.id, uid: q.uid, karma })}
                      />
                    ) : (
                      // (its Awakened price, the non-human vampire's, the Infected free pick: karma.ts qualityPrice)
                      `${positive ? '−' : '+'}${n(qualityPrice(b, data, q, v))}`
                    )}
                  </td>
                  <td>
                    {!q.free && (
                      <button className="btn small quiet" aria-label={`Remove ${v?.name ?? q.id}`} onClick={() => act({ op: 'quality', remove: q.uid })}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="stack">
      <h2>Qualities</h2>
      <p className="muted">
        Positive qualities cost karma; negative ones give karma back.
        {cap !== undefined && ` Qualities may give at most ${cap} karma net.`}
        {most !== undefined && ` At most ${most} paid qualities.`}
        {flag(cr, 'infectedAllowed') && ' An Infected type is taken on Creation method; its optional powers here.'}
      </p>
      <p>
        Positive: <b>−{n(pos)}</b> karma · Negative: <b>+{n(neg)}</b> karma · Net:{' '}
        <b className={cap !== undefined && neg - pos > cap ? 'err' : ''}>
          {neg - pos >= 0 ? '+' : '−'}
          {n(Math.abs(neg - pos))}
        </b>{' '}
        karma
      </p>
      <h3>Positive</h3>
      {table(true)}
      <button className="btn" onClick={() => setPicking('positive')}>
        Add a positive quality…
      </button>
      <h3>Negative</h3>
      {table(false)}
      <button className="btn" onClick={() => setPicking('negative')}>
        Add a negative quality…
      </button>
      <Modal open={!!picking} onClose={() => setPicking(null)} title={`Add a ${picking ?? ''} quality`}>
        {/* (owner's decision 4: a poser quality is offered only to the metatypes its description names) */}
        {picking && (
          <Picker
            placeholder="Search qualities"
            onPick={pick}
            items={all
              .filter(
                q =>
                  q.positive === (picking === 'positive') &&
                  qualityFitsMetatype(data, b.metatype, q.id) &&
                  !infectedOff(data.entry('qualities', q.id), cr) &&
                  // (an Infected type is taken on Creation method; an optional power only from the runner's type's list)
                  !infectedOf(data.entry('qualities', q.id)) &&
                  !(
                    optionalPower(data.entry('qualities', q.id)) &&
                    ['infected-no-type', 'infected-not-listed'].includes(powerRefusal(b, data, cr, q.id, false) ?? '')
                  ),
              )
              .map(q => ({
                id: q.id,
                name: q.name,
                disabled: !q.multi && !qualityChoice(q.name) && b.qualities.some(x => x.id === q.id),
                ...cardOf(c, 'qualities', q.id),
                text:
                  data.levelOf(data.entry('qualities', q.id)) !== undefined
                    ? `level ${data.levelOf(data.entry('qualities', q.id))} of ${data.siblings('qualities', q.id).length}`
                    : undefined,
                meta: `${q.karma == null ? '?' : q.karmaSteps?.length ? q.karmaSteps.join(' or ') : q.karma}${q.karmaMax != null && !q.karmaSteps?.length ? `–${q.karmaMax}` : ''}${awakenedPrice(q)} karma${q.perLevel ? (Number.isFinite(q.maxLevel) ? ` a level, up to ${q.maxLevel}` : ' a level') : ''}${q.granted ? ` · granted only${q.category ? ` (${q.category})` : ''}` : ''}${q.uncounted ? ' · not one of the six' : ''}`,
                price: `${data.entry('qualities', q.id)?.source ?? ''} p.${q.page}`.trim(),
                label: <House c={c} source={data.entry('qualities', q.id)?.source ?? ''} />,
              }))}
          />
        )}
      </Modal>
    </div>
  )
}
