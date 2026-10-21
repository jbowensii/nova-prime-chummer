// Background art (server only): the admin's uploaded images, one picked at random on each page load and shown faintly
// behind every page (app.css .bg-art: faint under the content, a little stronger toward the edges; hidden when printing,
// with reduced transparency, or when this browser's Settings hide it). Settings → Background art: the admin's gallery.
// Each game has its own set (Anarchy's at /api/backgrounds, Shadowrun 6's at /api/sr6/backgrounds): a page shows its game's.
// Server side: server/backgrounds.mjs.
import { useEffect, useState } from 'react'
import { problem, send, UNREACHABLE } from '../../core/ui-kit/auth'
import { Modal } from '../../core/ui-kit/bits'
import type { Game } from '../../core/ui-kit/game'

/** Sent after the admin changes the gallery: the page picks again if its image is gone. */
const CHANGED = 'ca2-backgrounds'
const TYPES = ['image/png', 'image/jpeg', 'image/webp'],
  MAX = 10 * 1024 * 1024
/** `game`'s art routes, relative to /api/ (for send) */
const route = (game: Game) => (game === 'sr6' ? 'sr6/backgrounds' : 'backgrounds')
const src = (game: Game, id: string) => `./api/${route(game)}/${id}`

/** This page load's pick per game, shared by the page layer and the character sheet's (src/ca2/print/ui/Sheet.tsx). */
const picked: Record<Game, string | null> = { ca2: null, sr6: null }
export function useArtId(game: Game) {
  const [got, setGot] = useState({ game, id: picked[game] })
  useEffect(() => {
    const load = () =>
      fetch(`./api/${route(game)}`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(
          b => {
            const on: string[] = b?.enabled ?? [],
              p = picked[game]
            picked[game] = p && on.includes(p) ? p : on.length ? on[Math.floor(Math.random() * on.length)] : null
            setGot({ game, id: picked[game] })
          },
          () => {},
        )
    void load()
    addEventListener(CHANGED, load)
    return () => removeEventListener(CHANGED, load)
  }, [game])
  return got.game === game ? got.id : picked[game] // (another game: its pick so far, until its load)
}
export const artSrc = (game: Game, id: string) => src(game, id)

/** Every image of `game`'s that's on, for the sheet's picker (the admin's order). */
export function useArtIds(game: Game) {
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    const load = () =>
      fetch(`./api/${route(game)}`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(
          b => setIds(b?.enabled ?? []),
          () => {},
        )
    void load()
    addEventListener(CHANGED, load)
    return () => removeEventListener(CHANGED, load)
  }, [game])
  return ids
}

export function BackgroundArt({ game }: { game: Game }) {
  const id = useArtId(game)
  // the image in its own layer (dimmed by a filter), the page color over it (::after)
  return (
    id && (
      <div className="bg-art" aria-hidden="true">
        <div style={{ backgroundImage: `url("${src(game, id)}")` }} />
      </div>
    )
  )
}

interface Item {
  id: string
  name: string
  enabled: boolean
  uploaded: string
  size: number
}

/** `game`'s gallery: Settings shows the one of the game the page is in. */
export function BackgroundSettings({ game }: { game: Game }) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null),
    [busy, setBusy] = useState(false)
  const [doomed, setDoomed] = useState<Item | null>(null)
  const reload = async () => setItems((await (await send(route(game), undefined, 'GET')).json()).items)
  useEffect(() => {
    send(route(game), undefined, 'GET')
      .then(r => r.json())
      .then(b => setItems(b.items))
      .catch(e => setMsg({ text: (e as Error).message, err: true }))
  }, [game])
  const act = async (fn: () => Promise<string>) => {
    setBusy(true)
    setMsg(null)
    try {
      setMsg({ text: await fn() })
    } catch (e) {
      setMsg({ text: (e as Error).message, err: true })
    }
    await reload().catch(() => {})
    dispatchEvent(new Event(CHANGED))
    setBusy(false)
  }
  const upload = (files: File[]) =>
    act(async () => {
      let n = 0
      for (const f of files) {
        if (!TYPES.includes(f.type)) throw new Error(`${f.name} isn’t a PNG, JPEG or WebP image. Pick one of those.`)
        if (f.size > MAX) throw new Error(`${f.name} is larger than 10 MB. Pick a smaller image.`)
        const r = await fetch(`./api/${route(game)}`, {
          method: 'POST',
          body: f,
          headers: { 'Content-Type': f.type, 'X-Filename': encodeURIComponent(f.name) },
        }).catch(() => {
          throw new Error(UNREACHABLE)
        })
        if (!r.ok) throw new Error(`${n ? `Added ${n}. ` : ''}${f.name}: ${await problem(r)}`)
        n++
      }
      return `Added ${n === 1 ? 'the image' : `${n} images`}.`
    })
  const toggle = (b: Item) =>
    act(async () => {
      setItems(xs => xs && xs.map(x => (x.id === b.id ? { ...x, enabled: !b.enabled } : x))) // at once; reload() puts back what the server has
      await send(`${route(game)}/${b.id}`, { enabled: !b.enabled }, 'PUT')
      return b.enabled ? `${b.name} no longer shows.` : `${b.name} shows again.`
    })
  const erase = (b: Item) =>
    act(async () => {
      setDoomed(null)
      await send(`${route(game)}/${b.id}`, undefined, 'DELETE')
      return `Deleted ${b.name}.`
    })
  const on = items?.filter(b => b.enabled).length ?? 0
  return (
    <fieldset className="backup bg-settings">
      <legend>Background art{game === 'sr6' && ' (Shadowrun 6)'}</legend>
      <p className="muted">
        {game === 'sr6'
          ? 'The Shadowrun 6 side’s own images, kept apart from Anarchy’s: shown faintly behind its pages and on its printed sheets'
          : 'Your own images, shown faintly behind every Anarchy page and on its printed sheets'}{' '}
        for everyone signed in:{' '}
        {on === 0 ? 'none are on now' : on === 1 ? 'the one that’s on always shows' : `one of the ${on} that are on, picked at random on each page load`}. PNG,
        JPEG or WebP, 10 MB each, 50 at most. They’re never printed.
      </p>
      {items === null && !msg ? (
        <p className="muted">Loading…</p>
      ) : (
        <ul className="bg-gallery" aria-label="Background images">
          {items?.map(b => (
            <li key={b.id} className={b.enabled ? undefined : 'off'}>
              <img src={src(game, b.id)} alt="" loading="lazy" />
              <span className="name" title={b.name}>
                {b.name}
              </span>
              <label className="check">
                <input type="checkbox" checked={b.enabled} disabled={busy} aria-label={`Show ${b.name}`} onChange={() => void toggle(b)} />
                Show
              </label>
              <button className="btn small quiet" disabled={busy} aria-label={`Delete ${b.name}`} onClick={() => setDoomed(b)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="btn file">
        Upload images…
        <input
          type="file"
          multiple
          accept={TYPES.join(',')}
          aria-label="Upload background images"
          disabled={busy}
          onChange={e => {
            const f = [...(e.target.files ?? [])]
            e.target.value = ''
            if (f.length) void upload(f)
          }}
        />
      </label>
      <div role="status" aria-live="polite">
        {msg && !msg.err && <p className="banner">{msg.text}</p>}
      </div>
      <div role="alert">{msg?.err && <p className="banner err">{msg.text}</p>}</div>
      <Modal
        open={!!doomed}
        onClose={() => setDoomed(null)}
        title={`Delete ${doomed?.name}?`}
        actions={
          <>
            <button className="btn" onClick={() => setDoomed(null)}>
              Cancel
            </button>
            <button className="btn danger" disabled={busy} onClick={() => void erase(doomed!)}>
              Delete
            </button>
          </>
        }
      >
        <p>The image is removed from the server. Upload it again to bring it back.</p>
      </Modal>
    </fieldset>
  )
}
