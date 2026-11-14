// First visit of an admin to a game that can't build characters yet (no uploaded books and no game data from any source):
// open its Books page instead of its home (App.tsx). Once per game per browser; a failed check changes nothing.
import { api } from '../ui-kit/api'
import type { Game } from '../ui-kit/game'

const KEY = (g: Game) => `chummer.booksSeen.${g}`
const seenHere = new Set<Game>() // blocked storage: remembered for this page load only
const BOOKS: Record<Game, { api: string; hash: string }> = { ca2: { api: 'books', hash: '#/books' }, sr6: { api: 'sr6/books', hash: '#/sr6/books' } }

/** The game a route is the bare home of (never a deep link), else null. */
export const homeGame = (route: string[]): Game | null => (!route.length ? 'ca2' : route.length === 1 && route[0] === 'sr6' ? 'sr6' : null)

export function wasSeen(g: Game): boolean {
  if (seenHere.has(g)) return true
  try {
    return localStorage.getItem(KEY(g)) === '1'
  } catch {
    return false
  }
}
export function markSeen(g: Game) {
  seenHere.add(g)
  try {
    localStorage.setItem(KEY(g), '1')
  } catch {
    /* private mode or full: this page load only */
  }
}

/** Where to send the admin, or null: only with no books and no game data. */
export const booksTarget = (g: Game, books: unknown[], hasData: boolean) => (books.length === 0 && !hasData ? BOOKS[g].hash : null)

/** Check once per game; `hasData` is the game's own test (its shell). Resolves to the hash to open, or null. A failure is not "empty": null, nothing remembered. */
export async function checkBooksFirst(g: Game, hasData: () => Promise<boolean>): Promise<string | null> {
  if (wasSeen(g)) return null
  try {
    const books = await api<unknown[]>(BOOKS[g].api)
    const target = booksTarget(g, books, books.length === 0 && (await hasData()))
    markSeen(g)
    return target
  } catch {
    return null
  }
}
