// Martial arts (bought with karma as qualities are, Firing Squad p. 97): the styles taken, each with the techniques learned
// under it, a picker for a style (its signature technique comes with it) and one per style for a technique (its signature
// first, then the ones of its categories and General). A technique's printed prerequisites (an adept power, another
// technique, a quality, an augmentation, or something else) show in the picker and on its row, flagged there when the
// runner lacks one (an augmentation as a problem, the others as a note: Review's martial.augmentation and martial.requires).
import { useState } from 'react'
import { Modal, Picker } from '../../../ui/bits'
import { num } from '../../engine/creation'
import { isSignature, learned, prerequisites, prerequisiteText, signatureOf, styleName, techniqueFits, techniqueKarma, techniqueName } from '../../engine/martial'
import type { Sr6Entry } from '../../model/types'
import { n, useSr6Editor } from '../editor'
import { House } from '../Picker'

export function MartialArtsTab() {
  const { ch, c, data, cr, act } = useSr6Editor()
  const b = ch.build
  const [picking, setPicking] = useState<string | null>(null) // 'style', or the uid of the style a technique goes under
  const style = num(cr, 'karmaMartialArt'), technique = num(cr, 'karmaTechnique')
  const styles = [...c.entries.martialarts.values()].sort((a, z) => a.name.localeCompare(z.name))
  const techniques = [...c.entries.martialtechniques.values()].sort((a, z) => a.name.localeCompare(z.name))
  const under = b.martialArts.find(m => m.uid === picking), underEntry = under && data.entry('martialarts', under.id)
  const offer = under ? techniques.filter(e => techniqueFits(underEntry, e))
    .sort((a, z) => Number(isSignature(underEntry, z.name)) - Number(isSignature(underEntry, a.name))) : []
  const where = (e: Sr6Entry) => <House c={c} source={e.source} />
  const close = (err: string | null) => { if (!err) setPicking(null) }
  const needs = (e: Sr6Entry) => prerequisites(data, b, e).map(prerequisiteText).join('; ')

  return (
    <div className="stack">
      <h2>Martial arts</h2>
      <p className="muted">A style{style !== undefined && ` costs ${style} karma and`} comes with its signature technique; each other technique
        {technique !== undefined && ` costs ${technique} karma and`} is one of the style’s categories or General, learned once (Firing Squad p. 97).
        Some techniques also need an adept power, another technique, an augmentation or something else.</p>
      {b.martialArts.length === 0 ? <p className="muted">None yet.</p> : b.martialArts.map(m => {
        const e = data.entry('martialarts', m.id)
        return <section key={m.uid} className="stack">
          <div className="row"><h3>{styleName(data, m)}</h3>{!e && <span className="err"> (no longer in the catalog)</span>}
            {e && <span className="muted">{[e.attrs.categories, `${e.source} p.${e.page}`].filter(Boolean).join(' · ')}</span>}
            <span className="spacer" /><span className="muted">{style !== undefined && `−${n(style)} karma`}</span>
            <button className="btn small" onClick={() => setPicking(m.uid)}>Add a technique…</button>
            <button className="btn small quiet" onClick={() => act({ op: 'martialart', remove: m.uid })}>Remove</button></div>
          {m.techniques.length > 0 && <div className="scroll-x"><table className="data"><tbody>{m.techniques.map(t => {
            const te = data.entry('martialtechniques', t.id), karma = techniqueKarma(data, cr, m, t), pre = prerequisites(data, b, te)
            return <tr key={t.uid}>
              <td><b>{techniqueName(data, t)}</b>{!te && <span className="err"> (no longer in the catalog)</span>}
                {te && <span className="muted"> {[te.attrs.category, `${te.source} p.${te.page}`].filter(Boolean).join(' · ')}</span>}
                {pre.map((p, i) => <div key={i} className={p.met === false ? p.kind === 'augmentation' ? 'err' : 'warn' : 'muted'}>
                  {p.met === false ? '⚠ Requires ' : 'Requires '}{prerequisiteText(p)}{p.met === false && ': the runner doesn’t have it'}</div>)}</td>
              <td className="num">{karma ? `−${n(karma)}` : 'free'}</td>
              <td className="num"><button className="btn small quiet" onClick={() => act({ op: 'technique', style: m.uid, remove: t.uid })}>Remove</button></td>
            </tr>
          })}</tbody></table></div>}
        </section>
      })}
      <div><button className="btn" onClick={() => setPicking('style')}>Add a martial arts style…</button></div>
      <Modal open={picking === 'style'} onClose={() => setPicking(null)} title="Add a martial arts style">
        <Picker placeholder="Search styles" onPick={id => {
          const e = c.entries.martialarts.get(id)
          close(e ? act({ op: 'martialart', id, signature: signatureOf(b, techniques, e)?.id }) : null)
        }} items={styles.map(e => ({ id: e.id, name: e.name, disabled: b.martialArts.some(m => m.id === e.id),
          meta: [e.attrs.categories, e.attrs.signature && `signature: ${e.attrs.signature}`].filter(Boolean).join(' · '),
          price: `${e.source} p.${e.page}`, label: where(e) }))} />
      </Modal>
      <Modal open={!!under} onClose={() => setPicking(null)} title={`Add a technique to ${under ? styleName(data, under) : ''}`}>
        {under && <Picker placeholder="Search techniques" onPick={id => close(act({ op: 'technique', style: under.uid, id }))}
          groups={[...new Set(offer.map(e => e.attrs.category ?? ''))].filter(Boolean).sort()}
          items={offer.map(e => ({ id: e.id, name: e.name, group: e.attrs.category, disabled: learned(b).some(t => t.id === e.id),
              meta: [e.attrs.category, isSignature(underEntry, e.name) && 'signature: free', needs(e) && `requires ${needs(e)}`].filter(Boolean).join(' · '),
              price: `${e.source} p.${e.page}`, label: where(e) }))} />}
      </Modal>
    </div>
  )
}
