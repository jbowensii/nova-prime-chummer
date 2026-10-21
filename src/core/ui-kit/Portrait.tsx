// A runner's portrait over its backdrop (app.css .bd-*): transparent parts of a PNG/WebP show the backdrop, an opaque
// image covers it. No backdrop = the look before backdrops existed. The print sheet swaps a dark one for white (ink).
import { useEffect, useRef, useState } from 'react'
import { Modal } from './bits'
import { BACKDROPS, type Backdrop, type Character } from '../../model/types'

export const BACKDROP_NAMES: Record<Backdrop, string> = {
  white: 'White',
  grey: 'Neutral grey',
  dark: 'Dark',
  grid: 'Grid',
  halftone: 'Halftone',
  neon: 'Neon',
  rain: 'Rain',
}
const DARK: Backdrop[] = ['dark', 'neon', 'rain']
export { BACKDROPS }

/** The backdrop the print sheet uses: the runner's, or white instead of a dark one. */
export const printBackdrop = (b?: Backdrop) => (b && DARK.includes(b) ? 'white' : b)
export const bdClass = (b?: Backdrop) => (b ? ` bd-${b}` : '')

/** The first letter of a name (a whole emoji, not half of one); "?" for none. */
export const initial = (ch: Pick<Character, 'identity'>) => [...(ch.identity.streetName || ch.identity.name).trim()][0]?.toUpperCase() ?? '?'

/** The portrait (class `face` + backdrop), or the runner's initial when there's none or it doesn't load.
 *  token: the round token instead (class `tokenface`, so `img.face` stays the portrait): its own picture, or the portrait when it has none. */
export function Face({ ch, backdrop = ch.identity.backdrop, token }: { ch: Pick<Character, 'identity'>; backdrop?: Backdrop; token?: boolean }) {
  const [broken, setBroken] = useState<string>()
  const src = (token && ch.identity.token) || ch.identity.portrait,
    cls = token ? 'tokenface' : 'face'
  return src && broken !== src ? (
    <img className={`${cls}${bdClass(backdrop)}`} src={src} alt="" onError={() => setBroken(src)} />
  ) : (
    <span className={cls} aria-hidden>
      {initial(ch)}
    </span>
  )
}

const STAGE = 256,
  OUT = 384 // the dialog's square preview (CSS px) and the saved portrait (px)

/** A picture as an image element: a chosen file, or the current portrait. */
const loadImage = (src: File | string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(typeof src === 'string' ? 'The current picture didn’t load.' : 'That file isn’t a picture this browser can read.'))
    if (typeof src === 'string') {
      img.src = src
      return
    }
    const r = new FileReader()
    r.onload = () => {
      img.src = r.result as string
    }
    r.onerror = () => reject(new Error('Couldn’t read that file.'))
    r.readAsDataURL(src)
  })

/** The portrait dialog: choose a picture, zoom and drag it into the square, pick the backdrop. Save writes a square
 *  OUT px portrait (PNG when it has transparent parts, which show the backdrop; JPEG otherwise).
 *  token: the same dialog for the round token: "Same as portrait" (no token of its own, the default) or its own picture,
 *  starting from the portrait's; no backdrop choice (the runner's shows behind it). */
export function PortraitEditor({
  ch,
  open,
  onClose,
  onSave,
  token,
}: {
  ch: Pick<Character, 'identity'>
  open: boolean
  onClose: () => void
  onSave: (picture: string | undefined, backdrop: Backdrop | undefined) => void
  token?: boolean
}) {
  const what = token ? 'token' : 'portrait',
    cur = token ? ch.identity.token : ch.identity.portrait
  const [same, setSame] = useState(false) // token: no picture of its own, the portrait serves
  const [img, setImg] = useState<HTMLImageElement>()
  const [zoom, setZoom] = useState(1)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const [backdrop, setBackdrop] = useState<Backdrop>()
  const [changed, setChanged] = useState(false) // the picture itself: an untouched one is kept as it is
  const [err, setErr] = useState<string>()
  const drag = useRef<{ x: number; y: number } | null>(null)
  const file = useRef<HTMLInputElement>(null)
  // opening starts afresh (state adjusted while rendering), then loads the picture it opened with
  const [wasOpen, setWasOpen] = useState(false),
    [src, setSrc] = useState<string>()
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      // a new token starts from the portrait's picture, to be framed for the circle (so it is saved as a picture of its own)
      setSrc(cur ?? (token ? ch.identity.portrait : undefined))
      setZoom(1)
      setOff({ x: 0, y: 0 })
      setBackdrop(ch.identity.backdrop)
      setChanged(!!token && !cur)
      setErr(undefined)
      setImg(undefined)
      setSame(!!token && !cur && !!ch.identity.portrait)
    }
  }
  useEffect(() => {
    if (open && src) loadImage(src).then(setImg, e => setErr((e as Error).message))
  }, [open, src])

  // the picture covers the square at zoom 1; dragging can't pull an edge inside it
  const base = img ? STAGE / Math.min(img.width, img.height) : 1
  const w = img ? img.width * base * zoom : STAGE,
    h = img ? img.height * base * zoom : STAGE
  const clamp = (o: { x: number; y: number }, z = zoom) => {
    const mx = img ? (img.width * base * z - STAGE) / 2 : 0,
      my = img ? (img.height * base * z - STAGE) / 2 : 0
    return { x: Math.max(-mx, Math.min(mx, o.x)), y: Math.max(-my, Math.min(my, o.y)) }
  }
  const move = (o: { x: number; y: number }) => {
    setOff(clamp(o))
    setChanged(true)
  }
  const zoomTo = (z: number) => {
    z = Math.max(1, Math.min(4, z))
    setZoom(z)
    setOff(clamp(off, z))
    setChanged(true)
  }
  const left = (STAGE - w) / 2 + off.x,
    top = (STAGE - h) / 2 + off.y

  const choose = async (f?: File) => {
    if (!f) return
    try {
      setImg(await loadImage(f))
      setZoom(1)
      setOff({ x: 0, y: 0 })
      setChanged(true)
      setErr(undefined)
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const save = () => {
    if (!img || same) return onSave(undefined, backdrop)
    if (!changed) return onSave(cur, backdrop)
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
    <Modal
      open={open}
      onClose={onClose}
      title={token ? 'Token' : 'Portrait'}
      className="portrait-editor"
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save {what}
          </button>
        </>
      }
    >
      <div className="pe-body">
        <div className="stack">
          {token && (
            <label className="row">
              <input
                type="checkbox"
                checked={same}
                disabled={!ch.identity.portrait}
                onChange={e => {
                  setSame(e.target.checked)
                  setChanged(true)
                }}
              />{' '}
              Same as portrait
            </label>
          )}
          <div
            className={`pe-stage${token ? ' round' : ''}${bdClass(backdrop)}`}
            style={{ width: STAGE, height: STAGE }}
            tabIndex={img && !same ? 0 : -1}
            role={img && !same ? 'application' : undefined}
            aria-label={img && !same ? `${token ? 'Token' : 'Portrait'} position: drag, or use the arrow keys` : undefined}
            onPointerDown={e => {
              if (!img || same) return
              e.currentTarget.setPointerCapture(e.pointerId)
              drag.current = { x: e.clientX - off.x, y: e.clientY - off.y }
            }}
            onPointerMove={e => {
              if (drag.current) move({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })
            }}
            onPointerUp={() => {
              drag.current = null
            }}
            onPointerCancel={() => {
              drag.current = null
            }}
            onWheel={e => {
              if (img && !same) zoomTo(zoom - e.deltaY / 500)
            }}
            onKeyDown={e => {
              if (same) return
              const d = e.shiftKey ? 32 : 8
              const k = ({ ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] } as Record<string, number[]>)[e.key]
              if (k) {
                e.preventDefault()
                move({ x: off.x + k[0], y: off.y + k[1] })
              }
            }}
          >
            {same ? (
              <img src={ch.identity.portrait} alt="" draggable={false} style={{ left: 0, top: 0, width: STAGE, height: STAGE }} />
            ) : img ? (
              <img src={img.src} alt="" draggable={false} style={{ left, top, width: w, height: h }} />
            ) : (
              <button className="btn" onClick={() => file.current?.click()}>
                Choose a picture…
              </button>
            )}
          </div>
          <label className="pe-zoom">
            Zoom
            <input type="range" min={1} max={4} step={0.01} value={zoom} disabled={!img || same} onChange={e => zoomTo(+e.target.value)} />
          </label>
          <div className="row">
            <input
              ref={file}
              type="file"
              accept="image/*"
              hidden
              aria-label={token ? 'Token file' : 'Portrait file'}
              onChange={e => {
                setSame(false)
                void choose(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            {(img || same) && (
              <button className="btn small" onClick={() => file.current?.click()}>
                Choose another picture…
              </button>
            )}
            <button className="btn small quiet" disabled={!img || same} onClick={() => move({ x: 0, y: 0 })}>
              Center
            </button>
            {!token && (
              <button
                className="btn small quiet"
                disabled={!img}
                onClick={() => {
                  setImg(undefined)
                  setChanged(true)
                }}
              >
                Remove picture
              </button>
            )}
          </div>
          {err && (
            <p className="err" role="alert">
              {err}
            </p>
          )}
        </div>
        {token ? (
          <p className="muted backdrops">
            The round picture a virtual tabletop puts on the map (Foundry’s token). Same as portrait uses the portrait; untick it to frame the portrait for the
            circle, or choose other art. The runner’s backdrop shows through transparent parts.
          </p>
        ) : (
          <fieldset className="backdrops">
            <legend>Backdrop</legend>
            <p className="muted">Shows through the transparent parts of a PNG or WebP portrait; a dark one prints as white.</p>
            <div className="swatches">
              {([undefined, ...BACKDROPS] as const).map(b => (
                <label key={b ?? 'none'} title={b ? BACKDROP_NAMES[b] : 'None'}>
                  <input type="radio" name="pe-backdrop" checked={backdrop === b} onChange={() => setBackdrop(b)} />
                  <span className={b ? `bd-${b}` : 'bd-none'} />
                  <span className="sr-only">{b ? BACKDROP_NAMES[b] : 'None'}</span>
                </label>
              ))}
            </div>
            <p className="muted">
              Drag the picture to place it; zoom with the slider or the mouse wheel. The square is what shows on the sheet and in the runner list.
            </p>
          </fieldset>
        )}
      </div>
    </Modal>
  )
}
