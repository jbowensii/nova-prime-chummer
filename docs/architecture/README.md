# Nova Prime Chummer architecture: modules by functionality

Status: proposed 2026-10-20 and approved; **the app moves are complete** (2026-10-21): every src file is in its module
folder and the boundary test reads modules from the folders. Still to do: the importer moves and the context files
(migration plan steps 4 and 5).

The owner's rule: _the split and chunks must be made by functionality, and the software architecture must be modularized
in a meaningful and logical way._ So each module below owns **one thing the app does for its users**, end to end: its
domain logic, its data contract, its screens, its server routes, its importer stage if it has one, its tests and its docs.
Anarchy and Shadowrun 6 stay separate games; what both games use lives in a small shared kernel.

This design came from a gossipcat consensus review (consensus `19263731-31994acf`: Opus mapped every file, ChatGPT mapped
the SR6 capabilities and their de-facto APIs, Gemini mapped the server, importer and tests, Opus cross-reviewed). Every
claim was re-checked against the code by the orchestrator. The full file-by-file map is
[`module-map.tsv`](module-map.tsv): 1,029 tracked files, every one assigned to exactly one module.

## Why a session gets smaller

A coding session works inside one module: it loads that module's own context file, its code and tests, and only the
public interfaces of the modules it depends on. Before the moves, a session on, say, the SR6 rules check had to read
across the old `src/sr6/engine`, `src/sr6/ui`, `src/model` (Anarchy's types), `src/ui` and the server to follow its own code.

## The modules

Token sizes are characters ÷ 4, from `module-map.tsv`.

### Shared kernel (`src/core/`, plus flat shared server files)

| Module | Does | Tokens |
|---|---|---|
| core/shared | XML, formula, effect and source primitives; the types both games share (`newId`, `Violation`/`Severity`, `Override`, backdrops, identity) | 23k |
| core/ui-kit | Widgets, icons, API client, session hooks, settings store, repo context | 41k |
| core/chrome | Page header and main menu | 10k |
| core/app | The app entry and game picker | 6k |
| core/platform | Build, CI, Docker, release files | 127k |

### Features both games use (`src/features/<feature>/`, each passed the game)

| Module | What the user does | Server routes | Tokens |
|---|---|---|---|
| accounts | Sign in (local and OIDC), users, roles | `/api/auth*`, `/api/setup*`, `/api/users*`, `/api/auth-settings` | 73k |
| runner-store | Save runners and NPCs, trash and restore | `/api/characters`, `/api/npcs`, `/api/trash*`, `/api/sr6/designs` | 35k |
| campaigns | Run campaigns, invite players, lock rules | `/api/campaigns*` | 23k |
| compendiums | Share house content with a table | `/api/compendiums*` | 21k |
| book-library | Upload books, run imports, watch progress | `/api/books*` → `python -m importer` | 95k |
| ai-assist | AI settings, "Ask" | `/api/ai-*`, `/api/ask` | 30k |
| backup | Backup, restore, data packs | `/api/backup`, `/api/restore`, `/api/datapack` | 37k |
| appearance | Backgrounds, sheet art, print style | `/api/backgrounds*` | 35k |
| catalog-edits | Edit or correct catalog entries | `/api/edits*`, `/api/samples` | 17k |
| catalog-browser | Browse game data | — | 15k |
| foundry-kit | The download and export dialogs both games share | — | new |

### Shadowrun 6 (`src/sr6/<module>/{domain,ui}/`)

| Module | What the user does | Tokens |
|---|---|---|
| sr6/formats | (contract) runner, catalog, entry and compendium file formats and their schemas | 122k |
| sr6/catalog | (data) load the books' catalog, house overlays, typed views | 73k |
| sr6/table-setup | Choose creation rules for the server, a campaign or a runner | 46k |
| sr6/runner-builder | Build a runner: creation → review → career, in that dependency order (sub-folders `creation`, `review`, `career`, `assets`) | 355k |
| sr6/runner-library | List, import and export runners; sample runners | 14k |
| sr6/npcs | Book NPCs and critters, the GM's own NPCs | 34k |
| sr6/designer | Design vehicles and drones | 9k |
| sr6/compendiums | SR6 compendium pages | 20k |
| sr6/game-data | SR6 game data and rules pages | 14k |
| sr6/print | Print sheets | 38k |
| sr6/foundry | Export to Foundry | 41k |
| sr6/shell | SR6 routes and the editor page | 13k |
| sr6/book-import | Read a book PDF into the catalog (importer stages: convert → layout → regroup → extract → effects → resolve → links) | 480k |
| sr6/book-corrections | Owner rulings and book corrections | 324k (270k is override JSON, searched not read) |
| sr6/cl6-verification | CommLink6 comparison and replay gates | 137k |

### Anarchy (`src/ca2/<module>/{domain,ui}/`)

The same shape: formats 33k, catalog 66k, table-rules 10k, runner-builder 92k, runner-library 24k, npcs 14k, compendiums
13k, game-data 11k, print 23k, foundry 37k, shell 5k, book-import 126k.

Two modules are too big for one session, so they get ordered sub-folders rather than being split further:
`sr6/runner-builder` (creation 149k, review 67k, career 49k, owned critters and vehicles 63k, editor kit 27k) and
`sr6/book-import` (recipes 156k, effects 124k, extract 120k, the rest under 35k each).

`sr6/runner-builder` today: `domain/creation/` (the build, providers, budgets, actions, attributes, skills, karma, essence,
magic, derived values, NPC stat blocks, sample fixes), `domain/review/` (`rules.ts`), `domain/career/` (career, finalize,
house copies, id migration: each needs career), `domain/assets/` (owned critters, critterware, vehicle mods, designs),
`ui/` (the editor kit: context, Picker, EntryRef, Budgets, the view model `view.ts`) and `ui/tabs/`. Inside `domain/`,
creation ← review ← career holds and the boundary test enforces it; `assets` sits outside that order (creation's actions
and purchases use owned critters and vehicle mods, and vehicle mods and designs price through creation's `purchases.ts`).

## How modules may depend on each other

Each module may import only modules ranked below it, and only through their public interface:

```
core/shared (0) → {ca2,sr6}/formats (1) → {ca2,sr6}/catalog (2) → core/ui-kit (3) → core/chrome (5)
  → accounts, runner-store, backup, catalog-edits, book-library (6) → ai-assist, appearance (7)
  → campaigns, catalog-browser (8) → compendiums, foundry-kit, table-setup / table-rules (9)
  → runner-builder (10) → foundry, print, designer (11) → game-data (12)
  → compendium pages, runner-library, book-import UI (13) → npcs (14) → {ca2,sr6}/shell (15) → core/app (20)
```

Four rules on top of the ranks:

1. **The games never import each other.**
2. **Shared code may read a game's `formats` module only**, never its behaviour.
3. **The importer depends only on the shared kernel** and is reached by the server over its command line
   (`server/jobs.mjs:41`).
4. **Inside `sr6/runner-builder/domain`, creation ← review ← career**: creation imports neither review nor career, review
   not career.

### Public interfaces (main ones)

- `sr6/catalog`: `loadSr6Catalog`, `buildSr6Catalog`, `resolveEntry`, `catalogFind`, `sr6Data`, and one
  `catalogForRunner(catalog, runner, { campaign })` that does today's campaign filter + house overlay + typed-view rebuild
  (now done twice, in `src/sr6/shell/ui/EditorView.tsx:99-101` and `src/sr6/foundry/domain/export.ts:612`, and the export copy lacks
  the campaign filter).
- `sr6/table-setup`: `loadCreation`, `CreationRules`, `rulesForRunner`, `parseCreation`, `missingFor`.
- `sr6/runner-builder`: creation `makeProvider`, `allBudgets`, `apply`; review `validateSr6`, `canFinalize`; career
  `currentBuild`, `preview`, `record`, `balances`, `validateCareer`; `migrateSr6Ids`; the editor context; the tabs.
- `sr6/foundry`: `exportSr6Runner(s)`, `exportSr6Books`, `exportSr6Compendium`, the export schemas. Long term it should
  take a runner snapshot from the builder rather than recompute career, house and derived values itself.
- `sr6/print`: the sheets. They read `runnerView`, the print view model, which lives in `sr6/runner-builder/ui/view.ts`
  because the builder's tabs render it too and print ranks above the builder.
- Feature modules: their routes above, plus client helpers (`serverRepo`, `useAutosave`, `arrange`, `ownerGroups`,
  `loadCampaigns`, `CompendiumShell`, `AskButton`).

## What has to be fixed before files can move

Mapping every file to its module shows the code does not split cleanly today: the modules form **three dependency
cycles** (19, 5 and 2 modules), all caused by **37 specific import lines**. Moving folders first would just carry the
cycles into the new layout. The fixes are small and change no behaviour:

| Problem | Evidence | Fix |
|---|---|---|
| SR6 borrows Anarchy's types | `src/sr6/formats/domain/character.ts:5, 508`; `src/core/shared/rules.ts:2`; `src/ca2/formats/domain/types.ts:323, 329, 338, 401-415` | Move the shared types to `src/core/shared/types.ts`, re-exported from the old file |
| Shell helpers live in Anarchy screens | `src/features/runner-store/repo.ts:80-83`, `src/ca2/runner-library/ui/Library.tsx:198, 216`, `src/ca2/foundry/ui/Foundry.tsx:12-52`, `src/ca2/runner-builder/ui/samples.ts:104` | Move them to runner-store and foundry-kit; `serverRepo` takes its file format as an argument |
| The page header imports features | `src/core/chrome/nav.tsx:7, 12, 13`; `src/core/ui-kit/settings.tsx:6-8` | The app passes the header buttons in through one React context |
| Reading an Anarchy file runs creation rules | `src/ca2/formats/domain/charxml.ts:8` → `src/ca2/formats/domain/file.ts:138` → `src/ca2/runner-builder/domain/amps.ts:60-73` | Move the three pure SINner lookups into Anarchy formats |
| SR6's catalog type is defined in table setup | `src/sr6/catalog/domain/types.ts:116`, `creation.ts:37`, `data.ts:8`, `grades.ts:7, 15` | Move `CreationCatalog` to types.ts and `gradeKey` to names.ts |
| SR6 screens import from each other's pages | `src/sr6/runner-builder/ui/tabs/Ledger.tsx:36`, `tabs/Vehicles.tsx:17` → `Designer.tsx:40`; `tabs/Method.tsx:25` → `Runners.tsx:61`; `Compendiums.tsx:34` → `Npcs.tsx:104` | Move `useSr6Designs`, `missingLabels`, `npcChip` to the modules that own them |
| Importer stages reach into each other's private helpers | `importer/sr6/overrides.py:74` → `resolve.py:295 _add_kid`; `run.py:176`; `categories.py:24`; `sr6/__main__.py:98, 164` | Make those helpers public in the stage that owns them |
| Career's legality depends on review's code strings | `src/sr6/runner-builder/domain/career/career.ts:948-965` keeps 19 bare codes from `validateSr6` | Export the set next to `validateSr6`, plus a test that every code is still emitted |

## Target layout

`node tools/arch-move.mjs --only <module prefix> [--dry-run]` moves files by `module-map.tsv` with `git mv`, rewrites
the relative imports that point at them (or from them), rewrites their exact repo paths in tracked text (comments,
docs, the map itself; not `CHANGELOG.md` or `docs/reviews/`, which record their day), and is safe to run again. Where a
file goes:

| Module | File | Goes to |
|---|---|---|
| `core/<m>`, `features/<f>` | `src/**/<name>` | `src/core/<m>/<name>`, `src/features/<f>/<name>` (flat) |
| `ca2/<m>`, `sr6/<m>` | a `.tsx` file, or any file under a `ui/` folder | `src/<game>/<m>/ui/<name>` (`ui/tabs/<name>` for a file in a `tabs/` folder) |
| `ca2/<m>`, `sr6/<m>` | everything else (engine, model, print view models) | `src/<game>/<m>/domain/<name>` |
| `sr6/runner-builder` | a file with a 4th map column (`creation`, `review`, `career`, `assets`, `tabs`) | `src/sr6/runner-builder/<domain or ui>/<column>/<name>` |
| `sr6/runner-builder` | a `.ts` file with the 4th column `ui` (`view.ts`) | `src/sr6/runner-builder/ui/<name>` |
| any moved module | `tests/<folder>/**/*.ts` (not `tests/server/`, not `tests/fixtures/`) | `tests/<area>/<m>/<name>` |
| `core/platform`, `core/archive` | anything | stays |

Also staying: `src/main.tsx` (the Vite entry `index.html` loads), the server, the importer, `public/data`, `e2e/`,
`tests/server/` (it mirrors the flat server) and `tests/fixtures/` (tests read them by path). Folder mentions such as
"`src/shared/`" are not rewritten by the tool; check them by hand. Every src file is now in its module folder, so the
boundary test reads a file's module from its path (`src/<area>/<module>/…`); the map stays as the documentation of
which file belongs where, and the tool still reads it.

## Things the move must not break

- **CommLink6 replay:** `tools/cl6effects/rebuild.py:27` imports `importer.sr6.classes`, `.effects`, `.overrides` by name
  from older base trees. Importer modules keep their import names (a file becomes a package of the same name).
- **Docker:** `Dockerfile:25` copies `server/*.mjs` only, so the server stays flat (it is already one file per feature).
- **Tests:** vitest runs `tests/**/*.test.ts` (`vite.config.ts:43`) and CI runs `importer/tests`; tests stay in `tests/`,
  mirroring the new `src/` layout.
- **Served paths:** `public/data/**` is served by URL and read by the importer, so it does not move.
- **Path mentions:** 674 mentions in comments and docs across 343 files; each move PR rewrites them by script.
- **Authorization stays central:** `server/auth.mjs:287-303` is a default-deny role table (public is an explicit
  allowlist; anything unlisted needs a signed-in user). Splitting it across feature routers would remove that single
  default. Instead, add one test that lists every registered route and asserts its intended role.

## Migration plan: small PRs, each green before merge

Every PR runs `npm run lint`, `npm run format:check`, `npm run check` and CI's browser tests.

1. **Boundary test.** Extend `tests/core/shared/import-cycles.test.ts` with the module ranks and the three rules above, starting
   from an allowlist of today's offending imports that may only shrink. Plus the route-role test.
2. **Refactors, no behaviour change (8 PRs):** the fixes in the table above, one concern per PR. Done when the boundary
   test's allowlist is empty.
   _Status: refactor phase complete (PRs #99-#106 and the PR that dropped Anarchy's `src/engine/index.ts` barrel); the allowlist is `[]`._
3. **Pure moves (about 6 PRs):** `git mv` into `src/core`, `src/features`, `src/ca2`, `src/sr6`, with a scripted rewrite of
   import paths and path mentions; tests move to the matching `tests/` folders. SR6 runner-builder moves last, when no
   SR6 branch is open.
   _Status: move 1 (`--only core/`), move 2 (`--only features/`), move 3 (`--only ca2/`, all of Anarchy) and move 4 (`--only sr6/ --except sr6/runner-builder`, every SR6 module but the builder) and move 5 (`--only sr6/runner-builder`, into its sub-folders) done: the app moves are complete; tests of one module that share a file name keep their old folder (`tests/ca2/runner-builder/engine/price.test.ts`)._
4. **Importer (3 PRs):** public cross-stage helpers; `effects.py` → `importer/sr6/effects/` package; `overrides.py` →
   package. Each behind the CommLink6 gates: the replay (main vs branch, 0 differing rows) and a fresh full import that
   reads 1,079/1,079 effects, 4,474/4,474 completeness and 4,307/4,307 accuracy.
5. **Docs and context files:** _done._ Each module has a short `CLAUDE.md` in its folder (what it owns, its public
   interface, what it imports today, its test command, what not to touch, the other game's look-alike file names), and the
   importer and CommLink6 tools have `importer/CLAUDE.md`, `importer/sr6/CLAUDE.md` and `tools/cl6check/CLAUDE.md`.
   `tests/core/shared/context-files.test.ts` keeps them honest: every module folder has one, and every public name it
   lists is still exported. `docs/sr6-data-format.md` is now an index of `docs/sr6-data-format/<section>.md`. Releases
   have one owner (below).

## Release ownership

A feature PR does **not** bump the version in `package.json` and does **not** edit `CHANGELOG.md`. One release PR does
both: it sets the version, writes the `CHANGELOG.md` entry for everything merged since the last tag
(`git log --oneline <last tag>..origin/main`), and is tagged after merge. That keeps parallel PRs from conflicting on the
same two lines, and keeps the changelog from drifting behind the version (0.17.0 shipped without an entry until this step).

On GitHub, release-please opens that release PR automatically from the conventional-commit history (it needs the
`RELEASE_PLEASE_TOKEN` repository secret, a fine-grained token with Contents and Pull requests write access).

## Not done, on purpose

Per-module `index.ts` barrels (add one when deep imports become a problem; a barrel is what made `src/engine/index.ts` a
cycle hub), server subfolders, moving `public/data`, and tests next to source.
