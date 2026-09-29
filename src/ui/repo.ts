// Where runners are saved: the tower04 server when the app is served by it, else this
// browser's localStorage (local dev, plain static hosting).
import { createContext, useContext } from 'react'
import { characterToXml, xmlToCharacter } from '../engine'
import type { Character } from '../model/types'
import { deleteCharacter, getCharacter, listCharacters, saveCharacter } from './storage'
import { track } from './auth'

/** owner, ownerName: the account the runner belongs to (server only; admin and editors also list everyone else's) */
export interface Stored { ch: Character; rev?: number; file?: string; owner?: string; ownerName?: string }
export type SaveResult =
  | { ok: true; rev?: number; file?: string }
  | { ok: false; conflict?: { rev: number; file: string; updatedAt?: string }; error?: string }
/** keepalive: the request may outlive the page (flush on leave); only honored for bodies under 60 KB */
export interface SaveOpts { force?: boolean; filename?: string; keepalive?: boolean }

export interface Repo {
  mode: 'server' | 'browser'
  list(): Promise<Stored[]>
  get(id: string): Promise<Stored | undefined>
  save(ch: Character, rev?: number, opts?: SaveOpts): Promise<SaveResult>
  remove(id: string): Promise<void>
}

export const browserRepo: Repo = {
  mode: 'browser',
  list: async () => listCharacters().map(ch => ({ ch })),
  get: async id => { const ch = getCharacter(id); return ch && { ch } },
  save: async ch => (saveCharacter(ch).ok ? { ok: true } : { ok: false, error: 'This browser refused to store the runner. Export it so it isn’t lost.' }),
  remove: async id => { deleteCharacter(id) },
}

export function serverRepo(base = './'): Repo {
  const list = async (): Promise<Stored[]> => {
    const r = await fetch(`${base}api/characters`, { cache: 'no-store' })
    if (!r.ok) throw new Error(`the server answered ${r.status}`)
    const rows: { file: string; rev: number; xml: string; owner?: string; ownerName?: string }[] = await r.json()
    return rows.flatMap(row => { const p = xmlToCharacter(row.xml)
      return p.ok ? [{ ch: p.character, rev: row.rev, file: row.file, owner: row.owner, ownerName: row.ownerName }] : [] })
  }
  return {
    mode: 'server',
    list,
    get: async id => (await list()).find(s => s.ch.id === id),
    // every save and delete, from the editor or the runner list, is tracked: sign-out waits for it (auth.tsx)
    save: (ch, rev, opts = {}) => track((async (): Promise<SaveResult> => {
      const q = new URLSearchParams()
      if (opts.force) q.set('force', '1')
      if (opts.filename) q.set('filename', opts.filename)
      try {
        const body = characterToXml(ch)
        const r = await fetch(`${base}api/characters/${encodeURIComponent(ch.id)}${q.size ? `?${q}` : ''}`, {
          method: 'PUT', body, keepalive: !!opts.keepalive && body.length < 60000, headers: { 'Content-Type': 'application/xml', ...(rev != null ? { 'If-Match': String(rev) } : {}) },
        })
        const res = await r.json().catch(() => ({}))
        if (r.status === 409) return { ok: false, conflict: { rev: res.rev, file: res.file, updatedAt: res.updatedAt } }
        if (!r.ok) return { ok: false, error: res.error ?? `the server answered ${r.status}` }
        return { ok: true, rev: res.rev, file: res.file }
      } catch (e) {
        return { ok: false, error: `Couldn’t reach the server: ${(e as Error).message}` }
      }
    })()),
    remove: id => track(fetch(`${base}api/characters/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(() => {})),
  }
}

/** The server repo if this page is served by the Chummer server, else the browser repo. */
export async function detectRepo(): Promise<Repo> {
  try {
    const r = await fetch('./api/health', { cache: 'no-store', signal: AbortSignal.timeout(2500) })
    if (r.ok && (await r.json()).storage === 'server') return serverRepo()
  } catch { /* no server: fall back */ }
  return browserRepo
}

/** One-time move of runners saved in this browser to the server. Returns how many moved. */
export async function migrateBrowserToServer(server: Repo): Promise<number> {
  const local = listCharacters()
  if (!local.length) return 0
  const onServer = new Set((await server.list()).map(s => s.ch.id))
  let moved = 0
  for (const ch of local) {
    if (onServer.has(ch.id)) { deleteCharacter(ch.id); continue }
    if ((await server.save(ch)).ok) { deleteCharacter(ch.id); moved++ } // keep it locally if the upload failed
  }
  return moved
}

export const RepoContext = createContext<Repo>(browserRepo)
export const useRepo = () => useContext(RepoContext)
