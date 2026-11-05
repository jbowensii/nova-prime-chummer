// Where the server keeps its data. One shape (`layout`) that every module reads, so no module builds a path from a root.
//
//   dataLayout(dataPath)   the live layout (docs/plans/desktop-phase2-migration-2026-10-23.md §2):
//     <dataPath>/Config/                 accounts (users, sessions, reset, device-key, auth*, oidc-key), jobs.json, ask-counts.xml
//     <dataPath>/Config/ai/<disk>/       a game's AI settings; the importer's `--library` argument, so its files are in .config/ there
//     <dataPath>/Data/systems/<disk>/    a game's characters/, npcs/, designs/, compendiums/ and its catalog (imported/, edits/, …)
//     <dataPath>/Data/assets/<disk>/     a game's backgrounds/
//     <dataPath>/Library/<disk>/<id>/    a game's uploaded books
//     <dataPath>/Logs/, <dataPath>/Backups/
//   legacyLayout({ charDir, customDir, libraryDir })   the old three folders. Only the migrator (server/migrate.mjs)
//     and the tests of the old shape use it; the server main block starts on dataLayout and refuses a data path that still
//     holds the old tree.
//
// <disk> is anarchy2 for the ca2 game and sr6 for sr6. Routes and XML namespaces keep the ca2 id (server/games.mjs).
// Both games' roots sit under one dataPath, so one volume: a rename between them is atomic. ponytail: no copy fallback for
// EXDEV; a deployment that mounts a system folder from another volume needs one (live account rename and the migrator).
import { join, resolve } from 'node:path'

export const DISK = { ca2: 'anarchy2', sr6: 'sr6' }
/** A game's system folder is also where its account data lives; /custom/ (the catalog and house overlays) never serves these.
 *  (campaigns.xml is guarded by name in server.mjs customGuard, as in the old layout.) */
export const PRIVATE = new Set(['characters', 'npcs', 'designs', 'compendiums'])

export function dataLayout(dataPath) {
  const root = resolve(dataPath)
  const game = id => {
    const sys = join(root, 'Data', 'systems', DISK[id])
    return {
      chars: join(sys, 'characters'),
      npcs: join(sys, 'npcs'),
      designs: id === 'sr6' ? join(sys, 'designs') : null,
      compendiums: join(sys, 'compendiums'),
      custom: sys,
      library: join(root, 'Library', DISK[id]),
      assets: join(root, 'Data', 'assets', DISK[id]),
      ai: join(root, 'Config', 'ai', DISK[id]),
    }
  }
  return {
    kind: 'data',
    root,
    config: join(root, 'Config'),
    backups: join(root, 'Backups'),
    logs: join(root, 'Logs'),
    hidden: PRIVATE,
    never: [join(root, 'Library'), join(root, 'Config'), join(root, 'Backups'), join(root, 'Logs')], // never served, whatever is mounted where
    games: { ca2: game('ca2'), sr6: game('sr6') },
  }
}

export function legacyLayout({ charDir, customDir, libraryDir }) {
  charDir = resolve(charDir)
  customDir = resolve(customDir)
  libraryDir = resolve(libraryDir ?? join(charDir, '..', 'library'))
  const game = (id, sub) => {
    const j = (...p) => (sub ? join(...p, sub) : join(...p))
    const home = j(charDir)
    return {
      chars: home,
      npcs: join(home, '.npcs'),
      designs: id === 'sr6' ? join(home, '.designs') : null,
      compendiums: join(home, '.compendiums'),
      custom: j(customDir),
      library: j(libraryDir),
      assets: j(libraryDir), // backgrounds/ inside
      ai: j(libraryDir), // .config/ inside
    }
  }
  return {
    kind: 'legacy',
    root: null,
    charDir,
    customDir,
    libraryDir,
    config: join(libraryDir, '.config'),
    backups: join(libraryDir, '.backups'),
    logs: null,
    hidden: null, // custom/ is only catalog files: everything but campaigns.xml is served
    never: [libraryDir],
    games: { ca2: game('ca2', ''), sr6: game('sr6', 'sr6') },
  }
}

/** The layout for createServer's options: a dataPath is the live one, the three folders the old one. */
export function layoutOf({ dataPath, charDir, customDir, libraryDir }) {
  if (dataPath) return dataLayout(dataPath)
  if (!charDir || !customDir) throw new Error('createServer needs a dataPath')
  return legacyLayout({ charDir, customDir, libraryDir })
}
