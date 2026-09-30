// A runner's portrait over its backdrop (app.css .bd-*): transparent parts of a PNG/WebP show the backdrop, an opaque
// image covers it. No backdrop = the look before backdrops existed. The print sheet swaps a dark one for white (ink).
import { useEffect, useRef, useState } from 'react'
import { Modal } from './bits'
import { BACKDROPS, type Backdrop, type Character } from '../model/types'

export const BACKDROP_NAMES: Record<Backdrop, string> = {
  white: 'White', grey: 'Neutral grey', dark: 'Dark', grid: 'Grid', halftone: 'Halftone', neon: 'Neon', rain: 'Rain',
}
const DARK: Backdrop[] = ['dark', 'neon', 'rain']
export { BACKDROPS }

/** The backdrop the print sheet uses: the runner's, or white instead of a dark one. */
export const printBackdrop = (b?: Backdrop) => (b && DARK.includes(b) ? 'white' : b)
export const bdClass = (b?: Backdrop) => (b ? ` bd-${b}` : '')

/** The first letter of a name (a whole emoji, not half of one); "?" for none. */
export const initial = (ch: Character) => [...(ch.identity.streetName || ch.identity.name).trim()][0]?.toUpperCase() ?? '?'

/** The portrait (class `face` + backdrop), or the runner's initial when there's none or it doesn't load. */
export function Face({ ch, backdrop = ch.identity.backdrop }: { ch: Character; backdrop?: Backdrop }) {
  const [broken, setBroken] = useState<string>()
  const src = ch.identity.portrait
  return src && broken !== src ? <img className={`face${bdClass(backdrop)}`} src={src} alt="" onError={() => setBroken(src)} />
    : <span className="face" aria-hidden>{initial(ch)}</span>
}

const STAGE = 256, OUT = 384 // the dialog's square preview (CSS px) and the saved portrait (px)

/** A picture as an image element: a chosen file, or the current portrait. */
const loadImage = (src: File | string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = () => reject(new Error(typeof src === 'string' ? 'The current portrait didn’t load.' : 'That file isn’t a picture this browser can read.'))
  if (typeof src === 'string') { img.src = src; return }
  const r = new FileReader()
  r.onload = () => { img.src = r.result as string }
  r.onerror = () => reject(new Error('Couldn’t read that file.'))
  r.readAsDataURL(src)
})

/** The portrait dialog: choose a picture, zoom and drag it into the square, pick the backdrop. Save writes a square
 *  OUT px portrait (PNG when it has transparent parts, which show the backdrop; JPEG otherwise). */
export function PortraitEditor({ ch, open, onClose, onSave }: {
  ch: Character; open: boolean; onClose: () => void; onSave: (portrait: string | undefined, backdrop: Backdrop | undefined) => void
}) {
  const [img, setImg] = useState<HTMLImageElement>()
  const [zoom, setZoom] = useState(1)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const [backdrop, setBackdrop] = useState<Backdrop>()
  const [changed, setChanged] = useState(false) // the picture itself: an untouched one is kept as it is
  const [err, setErr] = useState<string>()
  const drag = useRef<{ x: number; y: number } | null>(null)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    setZoom(1); setOff({ x: 0, y: 0 }); setBackdrop(ch.identity.backdrop); setChanged(false); setErr(undefined); setImg(undefined)
    if (ch.identity.portrait) loadImage(ch.identity.portrait).then(setImg, e => setErr((e as Error).message))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // the picture covers the square at zoom 1; dragging can't pull an edge inside it
  const base = img ? STAGE / Math.min(img.width, img.height) : 1
  const w = img ? img.width * base * zoom : STAGE, h = img ? img.height * base * zoom : STAGE
  const clamp = (o: { x: number; y: number }, z = zoom) => {
    const mx = img ? (img.width * base * z - STAGE) / 2 : 0, my = img ? (img.height * base * z - STAGE) / 2 : 0
    return { x: Math.max(-mx, Math.min(mx, o.x)), y: Math.max(-my, Math.min(my, o.y)) }
  }
  const move = (o: { x: number; y: number }) => { setOff(clamp(o)); setChanged(true) }
  const zoomTo = (z: number) => { z = Math.max(1, Math.min(4, z)); setZoom(z); setOff(clamp(off, z)); setChanged(true) }
  const left = (STAGE - w) / 2 + off.x, top = (STAGE - h) / 2 + off.y

  const choose = async (f?: File) => {
    if (!f) return
    try { setImg(await loadImage(f)); setZoom(1); setOff({ x: 0, y: 0 }); setChanged(true); setErr(undefined) }
    catch (e) { setErr((e as Error).message) }
  }
  const save = () => {
    if (!img) return onSave(undefined, backdrop)
    if (!changed) return onSave(ch.identity.portrait, backdrop)
    const k = OUT / STAGE
    const canvas = Object.assign(document.createElement('canvas'), { width: OUT, height: OUT })
    const g = canvas.getContext('2d')!
    g.imageSmoothingQuality = 'high'
    g.drawImage(img, left * k, top * k, w * k, h * k)
    const px = g.getImageData(0, 0, OUT, OUT).data
    let alpha = false
    for (let i = 3; i < px.length && !alpha; i += 4) alpha = px[i] < 255
    onSave(alpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85), backdrop)
  }

  return (
    <Modal open={open} onClose={onClose} title="Portrait" className="portrait-editor"
      actions={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save portrait</button></>}>
      <div className="pe-body">
        <div className="stack">
          <div className={`pe-stage${bdClass(backdrop)}`} style={{ width: STAGE, height: STAGE }} tabIndex={img ? 0 : -1}
            role={img ? 'application' : undefined} aria-label={img ? 'Portrait position: drag, or use the arrow keys' : undefined}
            onPointerDown={e => { if (!img) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX - off.x, y: e.clientY - off.y } }}
            onPointerMove={e => { if (drag.current) move({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }) }}
            onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
            onWheel={e => { if (img) zoomTo(zoom - e.deltaY / 500) }}
            onKeyDown={e => {
              const d = e.shiftKey ? 32 : 8
              const k = ({ ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] } as Record<string, number[]>)[e.key]
              if (k) { e.preventDefault(); move({ x: off.x + k[0], y: off.y + k[1] }) }
            }}>
            {img ? <img src={img.src} alt="" draggable={false} style={{ left, top, width: w, height: h }} />
              : <button className="btn" onClick={() => file.current?.click()}>Choose a picture…</button>}
          </div>
          <label className="pe-zoom">Zoom
            <input type="range" min={1} max={4} step={0.01} value={zoom} disabled={!img} onChange={e => zoomTo(+e.target.value)} /></label>
          <div className="row">
            <input ref={file} type="file" accept="image/*" hidden aria-label="Portrait file" onChange={e => { void choose(e.target.files?.[0]); e.target.value = '' }} />
            {img && <button className="btn small" onClick={() => file.current?.click()}>Choose another picture…</button>}
            <button className="btn small quiet" disabled={!img} onClick={() => move({ x: 0, y: 0 })}>Center</button>
            <button className="btn small quiet" disabled={!img} onClick={() => { setImg(undefined); setChanged(true) }}>Remove picture</button>
          </div>
          {err && <p className="err" role="alert">{err}</p>}
        </div>
        <fieldset className="backdrops">
          <legend>Backdrop</legend>
          <p className="muted">Shows through the transparent parts of a PNG or WebP portrait; a dark one prints as white.</p>
          <div className="swatches">
            {([undefined, ...BACKDROPS] as const).map(b => (
              <label key={b ?? 'none'} title={b ? BACKDROP_NAMES[b] : 'None'}>
                <input type="radio" name="pe-backdrop" checked={backdrop === b} onChange={() => setBackdrop(b)} />
                <span className={b ? `bd-${b}` : 'bd-none'} /><span className="sr-only">{b ? BACKDROP_NAMES[b] : 'None'}</span>
              </label>
            ))}
          </div>
          <p className="muted">Drag the picture to place it; zoom with the slider or the mouse wheel. The square is what shows on the sheet and in the runner list.</p>
        </fieldset>
      </div>
    </Modal>
  )
}
