import { attrCost, currentBuild, makeAdvance } from '../../engine'
import { ATTRS } from '../../model/types'
import { fmt, Stepper } from '../bits'
import { useEditor } from '../editor'

export function AttributesTab() {
  const { c, ch, d, edit, record, career } = useEditor()
  const meta = c.metatypes.get(ch.identity.metatype)
  const level = c.levels.get(ch.level)
  const b = career ? currentBuild(ch) : ch.build
  const atMax = ATTRS.filter(a => meta && b.attributes[a] === meta.ranges[a][1]).length

  const change = async (a: typeof ATTRS[number], to: number) => {
    if (!career) return edit(x => { x.build.attributes[a] = to })
    const ev = makeAdvance(c, ch, `attributes.${a}`, to)
    await record(ev, `${c.attributes.get(a)?.name} ${b.attributes[a]} → ${to}`)
  }

  return (
    <div className="stack">
      <h2>Attributes</h2>
      <p className="muted">
        {fmt(c.pricing.attrPoint)} a point; the point that reaches your metatype’s maximum costs {fmt(c.pricing.attrLastPoint)}.
        {!career && level && <> {level.name} allows {level.attrAtMax} at maximum: <b className={atMax > level.attrAtMax ? 'err' : ''}>{atMax} of {level.attrAtMax} used</b>.</>}
        {career && ' In career mode each raise is recorded in the ledger.'}
      </p>
      <div className="scroll-x"><table className="data">
        <thead><tr><th>Attribute</th><th>Range</th><th>Rating</th><th className="num">Next point</th><th className="num">RR</th></tr></thead>
        <tbody>
          {ATTRS.map(a => {
            const [min, max] = meta?.ranges[a] ?? [1, 6]
            const v = b.attributes[a] ?? 0
            return (
              <tr key={a}>
                <td>{c.attributes.get(a)?.name}</td>
                <td className="muted">{min}–{max}</td>
                <td><Stepper label={c.attributes.get(a)?.name ?? a} value={v} min={career ? v : min} max={max} onChange={to => change(a, to)} /></td>
                <td className="num">{v < max ? fmt(attrCost(c.pricing, v, v + 1, max)) : <span className="muted">at max</span>}</td>
                <td className="num">{d.rrAttr[a] || ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table></div>
    </div>
  )
}
