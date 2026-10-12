// Which game the app shows: the hash says (#/sr6… is Shadowrun 6, everything else Anarchy, as before 0.9.0), and this
// browser remembers the last pick or header switch, which decides where a bare #/ opens (App.tsx).
export type Game = 'ca2' | 'sr6'
export const GAME_KEY = 'chummer.game'

export const gameOf = (route: string[]): Game => (route[0] === 'sr6' ? 'sr6' : 'ca2')
export const homeOf = (g: Game) => (g === 'sr6' ? '#/sr6' : '#/')

/** The remembered game; null when none was picked, the value is junk, or storage is blocked. */
export function storedGame(): Game | null {
  try {
    const g = localStorage.getItem(GAME_KEY)
    return g === 'ca2' || g === 'sr6' ? g : null
  } catch {
    return null
  }
}

/** Remember the game; blocked storage just doesn't remember (the page still goes there). */
export function storeGame(g: Game) {
  try {
    localStorage.setItem(GAME_KEY, g)
  } catch {
    /* private mode or full: not remembered */
  }
}
