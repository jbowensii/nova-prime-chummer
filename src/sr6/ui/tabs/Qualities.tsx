// Qualities: the positive and negative ones taken (a leveled one with its level, a metatype trait marked free and kept),
// a picker for each side, and the net karma line against the cap.
import { useState } from 'react'
import { Modal, Picker, Stepper } from '../../../ui/bits'
import { qualityCost, qualityKarma } from '../../engine/budgets'
import { num } from '../../engine/creation'
import { n, useSr6Editor } from '../editor'
import { House } from '../Picker'

export function QualitiesTab() {
  const { ch, c, data, cr, act } = useSr6Editor()
  const b = ch.build
  const [picking, setPicking] = useState<'positive' | 'negative' | null>(null)
  const { pos, neg } = qualityKarma(b, data, cr)
  const cap = num(cr, 'qualityNetBonusCap'), most = num(cr, 'qualityMaxCount')
  const all = Object.values(data.qualities).sort((a, z) => a.name.localeCompare(z.name))
  const side = (positive: boolean) => b.qualities.filter(q => (data.qualities[q.id]?.positive ?? true) === positive)
  const pick = (id: string) => { if (!act({ op: 'quality', id })) setPicking(null) }

  const table = (positive: boolean) => {
    const rows = side(positive)
    return rows.length === 0 ? <p className="muted">None yet.</p> : <div className="scroll-x"><table className="data">
      <thead><tr><th>Quality</th><th>Level</th><th className="num">Karma</th><th /></tr></thead>
      <tbody>{rows.map(q => {
        const v = data.qualities[q.id]
        return <tr key={q.uid}>
          <td><b>{v?.name ?? q.name ?? q.id}</b>{!v && <span className="err"> (no longer in the catalog)</span>}
            {q.free && <> <span className="noncanon">Metatype trait</span></>}</td>
          <td>{v?.perLevel ? <Stepper label={`${v.name} level`} value={q.level} min={1} max={v.maxLevel} onChange={level => act({ op: 'quality', id: q.id, level })} /> : ''}</td>
          <td className="num">{q.free ? 'free' : v?.karma == null ? '?' : v.karmaMax != null
            ? <Stepper label={`${v.name} karma`} value={qualityCost(q, v) / (v.perLevel ? q.level : 1)} min={Math.abs(v.karma)} max={Math.abs(v.karmaMax)} onChange={karma => act({ op: 'quality', id: q.id, karma })} />
            : `${positive ? '−' : '+'}${n(qualityCost(q, v))}`}</td>
          <td>{!q.free && <button className="btn small quiet" onClick={() => act({ op: 'quality', remove: q.uid })}>Remove</button>}</td>
        </tr>
      })}</tbody>
    </table></div>
  }

  return (
    <div className="stack">
      <h2>Qualities</h2>
      <p className="muted">Positive qualities cost karma; negative ones give karma back.
        {cap !== undefined && ` Qualities may give at most ${cap} karma net.`}{most !== undefined && ` At most ${most} paid qualities.`}</p>
      <p>Positive: <b>−{n(pos)}</b> karma · Negative: <b>+{n(neg)}</b> karma · Net: <b className={cap !== undefined && neg - pos > cap ? 'err' : ''}>{neg - pos >= 0 ? '+' : '−'}{n(Math.abs(neg - pos))}</b> karma</p>
      <h3>Positive</h3>
      {table(true)}
      <button className="btn" onClick={() => setPicking('positive')}>Add a positive quality…</button>
      <h3>Negative</h3>
      {table(false)}
      <button className="btn" onClick={() => setPicking('negative')}>Add a negative quality…</button>
      <Modal open={!!picking} onClose={() => setPicking(null)} title={`Add a ${picking ?? ''} quality`}>
        <Picker placeholder="Search qualities" onPick={pick} items={all.filter(q => q.positive === (picking === 'positive')).map(q => ({
          id: q.id, name: q.name, disabled: b.qualities.some(x => x.id === q.id),
          meta: `${q.karma == null ? '?' : q.karma}${q.karmaMax != null ? `–${q.karmaMax}` : ''} karma${q.perLevel ? ` a level, up to ${q.maxLevel}` : ''}${q.granted ? ` · granted only${q.category ? ` (${q.category})` : ''}` : ''}${q.uncounted ? ' · not one of the six' : ''}`,
          price: `${data.entry('qualities', q.id)?.source ?? ''} p.${q.page}`.trim(), label: <House c={c} source={data.entry('qualities', q.id)?.source ?? ''} />,
        }))} />
      </Modal>
    </div>
  )
}
