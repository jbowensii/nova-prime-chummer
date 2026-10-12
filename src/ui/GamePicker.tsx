// The first screen of a browser that hasn't picked a game yet (App.tsx): two big choices. A pick is remembered here
// (game.ts) and opens that game's home; the header's switch (nav.tsx) changes it later.
import { homeOf, storeGame, type Game } from './game'

const GAMES: [Game, string, string, string][] = [
  ['sr6', '6th World', 'Shadowrun 6th World', 'The full rules: priority builds, dice pools, Edge and every piece of gear.'],
  ['ca2', 'Anarchy 2.0', 'Shadowrun Anarchy 2.0', 'The story-first rules: runners built from shadow amps, cues and plot points.'],
]

export function GamePicker({ onPick }: { onPick: (g: Game) => void }) {
  const pick = (g: Game) => {
    storeGame(g)
    onPick(g)
    location.assign(homeOf(g))
  }
  return (
    <main className="lib gamepick">
      {/* no game yet: the neutral name, not either game's brand (bits.tsx Brand) */}
      <div><span className="brand-row"><span className="brand">Chummer</span><span className="ver">v{__APP_VERSION__}</span></span></div>
      <h1>Choose your game</h1>
      <p>Each game keeps its own runners, NPCs and campaigns. You can switch at any time from the icon in the header.</p>
      <div className="games">
        {GAMES.map(([g, word, name, what]) =>
          <button key={g} type="button" className={`game ${g}`} aria-label={name} aria-describedby={`game-${g}`} onClick={() => pick(g)}>
            <span className="name" aria-hidden="true">Shadowrun <b>{word}</b></span>
            <span className="what" id={`game-${g}`}>{what}</span>
          </button>)}
      </div>
    </main>
  )
}
