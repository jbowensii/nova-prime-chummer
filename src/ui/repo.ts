// Where runners are saved: the Chummer server when the app is served by it, else this
// browser's localStorage (local dev, plain static hosting).
import { createContext, useContext } from 'react'
import { characterToXml, xmlToCharacter } from '../engine'
import type { Character } from '../model/types'
import { deleteCharacter, getCharacter, listCharacters, NPC_KEY, saveCharacter } from './storage'
import { track, UNREACHABLE } from './auth'

/** owner, ownerName: the account the runner belongs to (server only; the admin also lists everyone else's, an editor their campaigns') */
export interface Stored<T = Character> {
  ch: T
  rev?: number
  file?: string
  owner?: string
  ownerName?: string
}
/** A saved file the app can't read: listed (never hidden) with the reason, so it can be downloaded or repaired. */
export interface Unreadable {
  file: string
  rev: number
  xml: string
  error: string
  name: string
  owner?: string
  ownerName?: string
}
export type SaveResult = { ok: true; rev?: number; file?: string } | { ok: false; conflict?: { rev: number; file: string; updatedAt?: string }; error?: string }
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
/** keepalive: the request may outlive the page (flush on leave); only honored for bodies under 60 KB */
export interface SaveOpts {
  force?: boolean
  filename?: string
  keepalive?: boolean
}

export interface Repo<T = Character> {
  mode: 'server' | 'browser'
  list(): Promise<Stored<T>[]>
  /** every runner, and the files that couldn't be read */
  listAll(): Promise<{ stored: Stored<T>[]; unreadable: Unreadable[] }>
  /** undefined: no such runner; rejects with the reason when its file can't be read */
  get(id: string): Promise<Stored<T> | undefined>
  save(ch: T, rev?: number, opts?: SaveOpts): Promise<SaveResult>
  remove(id: string): Promise<void>
}

/** A repo over one localStorage key: the runners', or (NPC_KEY) the NPCs'. */
const browserStore = (key?: string, noun = 'runner'): Repo => ({
  mode: 'browser',
  list: async () => listCharacters(key).map(ch => ({ ch })),
  listAll: async () => ({ stored: listCharacters(key).map(ch => ({ ch })), unreadable: [] }),
  get: async id => {
    const ch = getCharacter(id, key)
    return ch && { ch }
  },
  save: async ch => (saveCharacter(ch, key).ok ? { ok: true } : { ok: false, error: `This browser refused to store the ${noun}. Export it so it isn’t lost.` }),
  remove: async id => {
    deleteCharacter(id, key)
  },
})
export const browserRepo: Repo = browserStore()

/** One game's file format: its root tag (`rootAttr`), writer and reader. */
export interface Codec<T> {
  tag: string
  toXml(doc: T): string
  fromXml(xml: string): { ok: true; character: T } | { ok: false; reason: string }
}
export const ca2Codec: Codec<Character> = { tag: 'ca2:character', toXml: ch => characterToXml(ch), fromXml: xml => xmlToCharacter(xml) }

/** `api`: 'characters' (runners), 'npcs' (the GMs' NPC area, same shapes) or another game's ('sr6/characters', with its codec). */
export function serverRepo<T = Character>(base = './', api: string = 'characters', codec: Codec<T> = ca2Codec as unknown as Codec<T>): Repo<T> {
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

const unesc = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
/** An attribute of the file's root tag (<ca2:character>, or a codec's `tag`), read without parsing the file (it may not parse). */
export const rootAttr = (xml: string, name: string, root = 'ca2:character') => {
  const tag = xml.match(new RegExp(`<${root}\\b[^>]*>`))?.[0] ?? ''
  const v = [...tag.matchAll(/\s([\w:.-]+)="([^"]*)"/g)].find(m => m[1] === name)?.[2]
  return v === undefined ? undefined : unesc(v)
}
const rootName = (xml: string, root?: string) => rootAttr(xml, 'streetName', root) || rootAttr(xml, 'name', root)

/** The server repo if this page is served by the Chummer server, else the browser repo. */
export async function detectRepo(): Promise<Repo> {
  try {
    const r = await fetch('./api/health', { cache: 'no-store', signal: AbortSignal.timeout(2500) })
    if (r.ok && (await r.json()).storage === 'server') return serverRepo()
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
export const npcRepoFor = (runners: Repo): Repo => (runners.mode === 'server' ? serverRepo('./', 'npcs') : browserStore(NPC_KEY, 'NPC'))

export const RepoContext = createContext<Repo>(browserRepo)
export const useRepo = () => useContext(RepoContext)
