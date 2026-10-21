// The runner repo contract (Stored, Repo, ...), the browser (localStorage) repo, and the React context the screens read it from.
// The server repo, which the context is switched to when the server hosts the app, is repo.ts (runner-store).
import { createContext, useContext } from 'react'
import type { Character } from '../../model/types'
import { deleteCharacter, getCharacter, listCharacters, saveCharacter } from './storage'

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
export const browserStore = (key?: string, noun = 'runner'): Repo => ({
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

export const RepoContext = createContext<Repo>(browserRepo)
export const useRepo = () => useContext(RepoContext)
