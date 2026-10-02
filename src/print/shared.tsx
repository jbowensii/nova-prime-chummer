// What both printed sheets (Sheet.tsx, BookSheet.tsx) take from the runner: amp effect lines, the lists, the Risk table,
// and the sheet's own background art (switches, strength, the per-runner image pick) with its tools.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { knowledgeList } from '../engine'
import type { Derived } from '../engine/derive'
import type { AmpEntry, Build, Catalog } from '../model/types'
import { artSrc, useArtId, useArtIds } from '../ui/Background'
import { loadSettings, saveSettings, type Settings } from '../ui/settings'
import { Modal } from '../ui/bits'
import { IconButton } from '../ui/icons'

export const RISK = [['1 die', '2 dice', '4 dice', '6+ dice'], ['3 dice', '5 dice', '7 dice', '10+ dice'], ['5 dice', '8 dice', '11 dice', '13+ dice'], ['8 dice', '12 dice', '15 dice', 'N/A']]

type Effect = AmpEntry['effects'][number]
function effectText(c: Catalog, ref: string, param?: string, value?: number, n = 1) {
  const def = c.ampEffects.get(ref)
  const skill = param && (c.skills.get(param)?.name ?? (() => { const s = c.skills.get(param.split('.')[0]); const sp = s?.specs.find(x => x.id === param); return sp && `${s!.name} (${sp.name})` })())
  const who = skill || (param && (c.attributes.get(param as never)?.name ?? param.replace(/^custom:/, '')))
  if (ref === 'rr-spec' || ref === 'rr-skill' || ref === 'rr-attr') return `RR ${n} on ${who ?? '(to choose)'} Tests`
  if (ref === 'negative') return `Drawback (−${value ?? 1})`
  return `${def?.name ?? ref}${param && ref !== 'narrative' ? `: ${param}` : ''}`
}

/** An amp's effect lines, the same ones counted once with "×n" (RR lines say their total instead). */
export const ampLines = (c: Catalog, a: AmpEntry): { e: Effect; text: string }[] =>
  [...a.effects.filter(e => e.ref !== 'narrative' || e.param).reduce((m, e) => { const k = `${e.ref}|${e.param}|${e.value}`; m.set(k, [e, (m.get(k)?.[1] ?? 0) + 1]); return m }, new Map<string, [Effect, number]>()).values()]
    .map(([e, n]) => ({ e, text: `${effectText(c, e.ref, e.param, e.value, n)}${!e.ref.startsWith('rr-') && n > 1 ? ` ×${n}` : ''}` }))

/** Languages and knowledge in the player's order, hidden rows left off; spells and complex forms; gear (and spare armor). */
export function lists(d: Derived, b: Build) {
  const shown = (kind: 'knowledge' | 'language') => knowledgeList(d.knowledge, kind, b.knowledgeOrder).filter(k => !k.hidden)
  return {
    langs: shown('language'), know: shown('knowledge'),
    spells: b.items.filter(i => i.kind === 'spell' || i.kind === 'complex-form'),
    gear: b.items.filter(i => i.kind === 'gear' || (i.kind === 'armor' && i.uid !== b.mainArmor && i.uid !== b.altArmor)),
  }
}

/** The sheet's strength until the player sets one: a clear but quiet image (100% is near full strength, sheet.css). */
export const SHEET_ART_DEFAULT = 60

/** The sheet's background art: this browser's own switches (screen on, print off by default), its strength, and which image
 *  (this runner's pick in this browser, ignored once that image is off, else the app's). tools: the toolbar's Background
 *  button and its dialog; vars: the strength on screen and in print, for the art's veil and the wash behind the text. */
export function useSheetArt(runner: string): { tools: ReactNode; layer: ReactNode; vars: CSSProperties } {
  const artId = useArtId()
  const [s, setS] = useState(loadSettings)
  const [open, setOpen] = useState(false)
  const set = (patch: Partial<Settings>) => { const next = { ...loadSettings(), ...patch }; setS(next); saveSettings(next) }
  const strength = s.sheetArtStrength ?? SHEET_ART_DEFAULT
  const ids = useArtIds(), key = `ca2.sheetArt.${runner}`
  const read = () => { try { return localStorage.getItem(key) } catch { return null } }
  const [pick, setPick] = useState(read)
  useEffect(() => setPick(read()), [key]) // eslint-disable-line react-hooks/exhaustive-deps -- another runner: its own pick
  const choose = (id: string | null) => {
    setPick(id)
    try { id ? localStorage.setItem(key, id) : localStorage.removeItem(key) } catch { /* private mode: this visit only */ }
  }
  const mine = pick && ids.includes(pick) ? pick : null
  const shownId = mine ?? artId
  const k = shownId ? strength / 100 : 0
  return {
    tools: artId && <>
      <IconButton icon="image" label="Background" aria-haspopup="dialog" onClick={() => setOpen(true)} />
      <Modal open={open} onClose={() => setOpen(false)} title="Background" className="sheet-art-dialog" light>
        <fieldset className="sheet-art-tools">
          <legend className="sr-only">Background art on the sheet</legend>
          <label className="art-strength">Art strength
            <input type="range" min={0} max={100} step={5} value={strength} aria-valuetext={`${strength}%`} disabled={s.sheetArt === 'off' && s.sheetArtPrint === 'off'}
              onChange={e => set({ sheetArtStrength: Number(e.target.value) })} />
            <output>{strength}%</output>
          </label>
          <label className="check"><input type="checkbox" checked={s.sheetArt === 'on'} onChange={e => set({ sheetArt: e.target.checked ? 'on' : 'off' })} />Background art</label>
          <label className="check"><input type="checkbox" checked={s.sheetArtPrint === 'on'} onChange={e => set({ sheetArtPrint: e.target.checked ? 'on' : 'off' })} />Print it</label>
        </fieldset>
        {(s.sheetArt === 'on' || s.sheetArtPrint === 'on') && ids.length > 0 && <fieldset className="sheet-art-pick">
          <legend>Background image</legend>
          <label className="check"><input type="radio" name="sheet-art-pick" checked={!mine} onChange={() => choose(null)} />Same as the app</label>
          {ids.map((id, i) => <label key={id} className="check"><input type="radio" name="sheet-art-pick" aria-label={`Background image ${i + 1}`}
            checked={mine === id} onChange={() => choose(id)} /><img src={artSrc(id)} alt="" /></label>)}
        </fieldset>}
      </Modal>
    </>,
    layer: shownId && <div className={`sheet-art${s.sheetArt === 'on' ? '' : ' no-screen'}${s.sheetArtPrint === 'on' ? '' : ' no-print'}`} aria-hidden="true">
      <div style={{ backgroundImage: `url("${artSrc(shownId)}")` }} /></div>,
    vars: { '--art-screen': s.sheetArt === 'on' ? k : 0, '--art-print': s.sheetArtPrint === 'on' ? k : 0 } as CSSProperties,
  }
}
