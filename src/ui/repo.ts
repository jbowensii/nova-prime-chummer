// Where runners are saved: the Nova Prime Chummer server when the app is served by it, else this
// browser's localStorage (local dev, plain static hosting).
import type { Character } from '../model/types'
import { rootAttr } from '../core/shared/xml'
import type { Codec } from '../core/shared/types'
import { deleteCharacter, listCharacters, NPC_KEY } from '../core/ui-kit/storage'
import { track, UNREACHABLE } from '../core/ui-kit/auth'
import { browserRepo, browserStore, type Repo, type SaveResult, type Stored, type Unreadable } from '../core/ui-kit/repoContext'

/** An imported file saved as new: when its id turns out taken after all (the list hadn't loaded yet, or another tab saved
 *  one), once more under a fresh id. Both games' runner and NPC lists. */
export async function saveAsNew<T extends { id: string }>(
  save: (ch: T) => Promise<SaveResult>,
  ch: T,
  freshId: () => string,
): Promise<{ ch: T; r: SaveResult }> {
  const r = await save(ch)
  if (r.ok || !r.conflict) return { ch, r }
  const again = { ...ch, id: freshId() }
  return { ch: again, r: await save(again) }
}
/** `api`: 'characters' (runners), 'npcs' (the GMs' NPC area, same shapes) or another game's ('sr6/characters', with its codec). */
export function serverRepo<T>(codec: Codec<T>, base = './', api: string = 'characters'): Repo<T> {
  type Row = { file: string; rev: number; xml: string; owner?: string; ownerName?: string }
  const rows = async (): Promise<Row[]> => {
    const r = await fetch(`${base}api/${api}`, { cache: 'no-store' })
    if (!r.ok) throw new Error(`the server answered ${r.status}`)
    return r.json()
  }
  const read = (row: Row): Stored<T> | Unreadable => {
    const p = codec.fromXml(row.xml)
    if (p.ok) return { ch: p.character, rev: row.rev, file: row.file, owner: row.owner, ownerName: row.ownerName }
    return { ...row, error: p.reason, name: rootName(row.xml, codec.tag) || row.file.replace(/\.xml$/, '') }
  }
  const listAll = async () => {
    const all = (await rows()).map(read)
    return { stored: all.filter((x): x is Stored<T> => 'ch' in x), unreadable: all.filter((x): x is Unreadable => 'error' in x) }
  }
  return {
    mode: 'server',
    list: async () => (await listAll()).stored,
    listAll,
    // only this runner's file is read: another file that can't be read doesn't matter here
    get: async id => {
      const row = (await rows()).find(r => rootAttr(r.xml, 'id', codec.tag) === id)
      const x = row && read(row)
      if (x && 'error' in x) throw new Error(x.error)
      return x
    },
    // every save and delete, from the editor or the runner list, is tracked: sign-out waits for it (auth.tsx)
    save: (ch, rev, opts = {}) =>
      track(
        (async (): Promise<SaveResult> => {
          const q = new URLSearchParams()
          if (opts.force) q.set('force', '1')
          if (opts.filename) q.set('filename', opts.filename)
          try {
            const body = codec.toXml(ch)
            const r = await fetch(`${base}api/${api}/${encodeURIComponent((ch as { id: string }).id)}${q.size ? `?${q}` : ''}`, {
              method: 'PUT',
              body,
              keepalive: !!opts.keepalive && body.length < 60000,
              headers: { 'Content-Type': 'application/xml', ...(rev != null ? { 'If-Match': String(rev) } : {}) },
            })
            const res = await r.json().catch(() => ({}))
            if (r.status === 409) return { ok: false, conflict: { rev: res.rev, file: res.file, updatedAt: res.updatedAt } }
            if (!r.ok) return { ok: false, error: res.error ?? `the server answered ${r.status}` }
            return { ok: true, rev: res.rev, file: res.file }
          } catch (e) {
            return { ok: false, error: `Couldn’t reach the server: ${(e as Error).message}` }
          }
        })(),
      ),
    // a refused or failed delete rejects with the server's reason (the runner stays where it was)
    remove: id =>
      track(
        (async () => {
          const r = await fetch(`${base}api/${api}/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {
            throw new Error(UNREACHABLE)
          })
          if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `the server answered ${r.status}`)
        })(),
      ),
  }
}

const rootName = (xml: string, root?: string) => rootAttr(xml, 'streetName', root) || rootAttr(xml, 'name', root)

/** The server repo if this page is served by the Nova Prime Chummer server, else the browser repo. */
export async function detectRepo(codec: Codec<Character>): Promise<Repo> {
  try {
    const r = await fetch('./api/health', { cache: 'no-store', signal: AbortSignal.timeout(2500) })
    if (r.ok && (await r.json()).storage === 'server') return serverRepo(codec)
  } catch {
    /* no server: fall back */
  }
  return browserRepo
}

/** One-time move of runners saved in this browser to the server. Returns how many moved. */
export async function migrateBrowserToServer(server: Repo): Promise<number> {
  const local = listCharacters()
  if (!local.length) return 0
  const onServer = new Set((await server.list()).map(s => s.ch.id))
  let moved = 0
  for (const ch of local) {
    if (onServer.has(ch.id)) {
      deleteCharacter(ch.id)
      continue
    }
    if ((await server.save(ch)).ok) {
      deleteCharacter(ch.id)
      moved++
    } // keep it locally if the upload failed
  }
  return moved
}

/** The NPC area next to a runner repo: the server's /api/npcs, or this browser's own NPC key. */
export const npcRepoFor = (runners: Repo, codec: Codec<Character>): Repo =>
  runners.mode === 'server' ? serverRepo(codec, './', 'npcs') : browserStore(NPC_KEY, 'NPC')
