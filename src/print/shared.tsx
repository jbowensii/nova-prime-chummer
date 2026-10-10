// What both printed sheets (Sheet.tsx, BookSheet.tsx) take from the runner: amp effect lines, the lists, the Risk table,
// and the sheet's own background art (switches, strength, the per-runner image pick) with its tools.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { effectHow, knowledgeList, ruleText } from '../engine'
import type { Derived } from '../engine/derive'
import type { AmpEntry, Build, Catalog } from '../model/types'
import { artSrc, useArtId, useArtIds } from '../ui/Background'
import { DEFAULTS, loadSettings, PRINT_STYLES, saveSettings, type Settings } from '../ui/settings'
import { Modal } from '../ui/bits'
import type { Game } from '../ui/game'
import { IconButton } from '../ui/icons'

export const RISK = [['1 die', '2 dice', '4 dice', '6+ dice'], ['3 dice', '5 dice', '7 dice', '10+ dice'], ['5 dice', '8 dice', '11 dice', '13+ dice'], ['8 dice', '12 dice', '15 dice', 'N/A']]

type Effect = AmpEntry['effects'][number]
function effectText(c: Catalog, e: Effect, n = 1) {
  const how = effectHow(e)
  return `${ruleText(c, e) ?? amountText(c, e.ref, e.param, e.value, n)}${how ? ` (${how})` : ''}`
}
function amountText(c: Catalog, ref: string, param?: string, value?: number, n = 1) {
  const def = c.ampEffects.get(ref)
  const skill = param && (c.skills.get(param)?.name ?? (() => { const s = c.skills.get(param.split('.')[0]); const sp = s?.specs.find(x => x.id === param); return sp && `${s!.name} (${sp.name})` })())
  const who = skill || (param && (c.attributes.get(param as never)?.name ?? param.replace(/^custom:/, '')))
  if (ref === 'rr-spec' || ref === 'rr-skill' || ref === 'rr-attr') return `RR ${n} on ${who ?? '(to choose)'} Tests`
  if (ref === 'negative') return `Drawback (−${value ?? 1})`
  return `${def?.name ?? ref}${param && ref !== 'narrative' ? `: ${param}` : ''}`
}

/** An amp's effect lines, the same ones counted once with "×n" (RR lines say their total instead). */
export const ampLines = (c: Catalog, a: AmpEntry): { e: Effect; text: string }[] =>
  [...a.effects.filter(e => e.ref !== 'narrative' || e.param).reduce((m, e) => { const k = `${e.ref}|${e.param}|${e.value}|${effectHow(e)}`; m.set(k, [e, (m.get(k)?.[1] ?? 0) + 1]); return m }, new Map<string, [Effect, number]>()).values()]
    .map(([e, n]) => ({ e, text: `${effectText(c, e, n)}${!e.ref.startsWith('rr-') && n > 1 ? ` ×${n}` : ''}` }))

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
 *  (this runner's pick in this browser, ignored once that image is off, else the app's), from `game`'s own set. tools: the toolbar's Background
 *  button and its dialog; vars: the strength on screen and in print, for the art's veil and the wash behind the text. */
export function useSheetArt(runner: string, game: Game = 'ca2'): { tools: ReactNode; layer: ReactNode; vars: CSSProperties } {
  const artId = useArtId(game)
  const [s, setS] = useState(loadSettings)
  const [open, setOpen] = useState(false)
  const set = (patch: Partial<Settings>) => { const next = { ...loadSettings(), ...patch }; setS(next); saveSettings(next) }
  // each game's own switches, strength and per-runner pick: an SR6 sheet never follows Anarchy's, nor the other way round
  const sr6 = game === 'sr6'
  const on = (sr6 ? s.sr6SheetArt ?? DEFAULTS.sheetArt : s.sheetArt) === 'on', onPrint = (sr6 ? s.sr6SheetArtPrint ?? DEFAULTS.sheetArtPrint : s.sheetArtPrint) === 'on'
  const setOn = (v: boolean) => set(sr6 ? { sr6SheetArt: v ? 'on' : 'off' } : { sheetArt: v ? 'on' : 'off' })
  const setOnPrint = (v: boolean) => set(sr6 ? { sr6SheetArtPrint: v ? 'on' : 'off' } : { sheetArtPrint: v ? 'on' : 'off' })
  const strength = (sr6 ? s.sr6SheetArtStrength : s.sheetArtStrength) ?? SHEET_ART_DEFAULT
  const ids = useArtIds(game), key = `${sr6 ? 'sr6' : 'ca2'}.sheetArt.${runner}`
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
            <input type="range" min={0} max={100} step={5} value={strength} aria-valuetext={`${strength}%`} disabled={!on && !onPrint}
              onChange={e => set(sr6 ? { sr6SheetArtStrength: Number(e.target.value) } : { sheetArtStrength: Number(e.target.value) })} />
            <output>{strength}%</output>
          </label>
          <label className="check"><input type="checkbox" checked={on} onChange={e => setOn(e.target.checked)} />Background art</label>
          <label className="check"><input type="checkbox" checked={onPrint} onChange={e => setOnPrint(e.target.checked)} />Print it</label>
        </fieldset>
        {(on || onPrint) && ids.length > 0 && <fieldset className="sheet-art-pick">
          <legend>Background image</legend>
          <label className="check"><input type="radio" name="sheet-art-pick" checked={!mine} onChange={() => choose(null)} />Same as the app</label>
          {ids.map((id, i) => <label key={id} className="check"><input type="radio" name="sheet-art-pick" aria-label={`Background image ${i + 1}`}
            checked={mine === id} onChange={() => choose(id)} /><img src={artSrc(game, id)} alt="" /></label>)}
        </fieldset>}
      </Modal>
    </>,
    layer: shownId && <div className={`sheet-art${on ? '' : ' no-screen'}${onPrint ? '' : ' no-print'}`} aria-hidden="true">
      <div style={{ backgroundImage: `url("${artSrc(game, shownId)}")` }} /></div>,
    vars: { '--art-screen': on ? k : 0, '--art-print': onPrint ? k : 0 } as CSSProperties,
  }
}

/** The sheet to print (Settings → Printed sheet, on the print page's toolbar too since 0.8.3): kept in this browser as
 *  before; the print page (EditorView PrintSheet, usePrintStyle) follows it at once. */
const PRINT_STYLE = 'ca2-print-style'
export function SheetType({ styles = PRINT_STYLES }: { styles?: typeof PRINT_STYLES }) {
  const [p, setP] = useState(() => loadSettings().print)
  const pick = (v: Settings['print']) => { saveSettings({ ...loadSettings(), print: v }); setP(v); dispatchEvent(new Event(PRINT_STYLE)) }
  return <select className="sheet-type" aria-label="Sheet type" data-tip="Sheet type" value={styles.some(([v]) => v === p) ? p : styles[0][0]}
    onChange={e => pick(e.target.value as Settings['print'])}>
    {styles.map(([v, label, hint]) => <option key={v} value={v} title={hint}>{label}</option>)}
  </select>
}
export function usePrintStyle() {
  const [p, setP] = useState(() => loadSettings().print)
  useEffect(() => { const f = () => setP(loadSettings().print); addEventListener(PRINT_STYLE, f); return () => removeEventListener(PRINT_STYLE, f) }, [])
  return p
}
