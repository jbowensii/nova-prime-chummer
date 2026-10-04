// Attributes: one row per attribute the runner has (Magic for the awakened, Resonance for the emerged) with points,
// adjustment and karma steppers, the metatype's range, the natural and augmented ratings, and a mark at the maximum.
import { Stepper } from '../../../ui/bits'
import { num } from '../../engine/creation'
import { MAGIC_KINDS } from '../../engine/data'
import { CORE_ATTRS, type Sr6Attr } from '../../model/character'
import { ATTR_NAMES, n, useSr6Editor } from '../editor'

const POOLS = [['points', 'Points'], ['adjust', 'Adjustment'], ['karma', 'Karma']] as const

export function AttributesTab() {
  const { ch, data, cr, p, d, budgets, act } = useSr6Editor()
  const b = ch.build, kind = MAGIC_KINDS[b.magic], meta = data.metatypes[b.metatype]
  const attrs: Sr6Attr[] = [...CORE_ATTRS, 'edg', ...(kind.spells || kind.powers ? ['mag' as const] : []), ...(kind.resonance ? ['res' as const] : [])]
  const range = (a: Sr6Attr): [number, number] | undefined =>
    a === 'mag' || a === 'res' ? d.magicMax === null ? undefined : [p.magicRating(b), d.magicMax] : meta?.ranges[a]
  const karmaPrice = num(cr, 'karmaAttrPerRank')
  return (
    <div className="stack">
      <h2>Attributes</h2>
      <p className="muted">
        Attribute points: <b className={budgets.attributePoints.left < 0 ? 'err' : ''}>{n(budgets.attributePoints.left)} left</b> of {n(budgets.attributePoints.max)}.
        {' '}Adjustment points: <b className={budgets.adjustmentPoints.left < 0 ? 'err' : ''}>{n(budgets.adjustmentPoints.left)} left</b> of {n(budgets.adjustmentPoints.max)}.
        {karmaPrice !== undefined && ` A rank bought with karma costs ${karmaPrice} × the new rating.`}
        {!meta && ' Pick a metatype on Creation method to see the ranges.'}
      </p>
      <div className="scroll-x"><table className="data">
        <thead><tr><th>Attribute</th><th>Range</th>{POOLS.map(([, l]) => <th key={l}>{l}</th>)}<th className="num">Natural</th><th className="num">Augmented</th></tr></thead>
        <tbody>{attrs.map(a => {
          const r = range(a), s = b.attributes[a], { natural, augmented } = d.attrs[a], top = r ? natural >= r[1] : false
          return <tr key={a}>
            <td>{ATTR_NAMES[a]}</td>
            <td className="muted">{r ? `${r[0]}–${r[1]}` : '—'}</td>
            {POOLS.map(([k, l]) => <td key={k}><Stepper label={`${ATTR_NAMES[a]} ${l.toLowerCase()}`} value={s[k]} min={0} max={top ? s[k] : 99}
              onChange={to => act({ op: 'attribute', target: a, pool: k, delta: to - s[k] })} /></td>)}
            <td className="num">{natural}{top && <span className="muted"> max</span>}</td>
            <td className="num">{augmented !== natural ? augmented : ''}</td>
          </tr>
        })}</tbody>
      </table></div>
    </div>
  )
}
