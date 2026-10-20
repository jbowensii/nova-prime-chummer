# Splitting Nova Prime Chummer into chunks (2026-10-20)

Gossipcat consensus review (consensus `7b470047-1c334066`): Opus measured the repo, ChatGPT reviewed coupling and
interfaces, Gemini reviewed test and workflow boundaries, Opus cross-reviewed both. Every claim below was re-checked
against the code by the orchestrator; claims that failed the check are listed at the end.

## Bottom line

Most of the work and most of the context cost is Shadowrun 6. A session's context shrinks most by splitting SR6 into four
chunks (engine, UI, importer, book data) and giving a single owner to the few files that every SR6 change touches (the
catalog format, the runner format, the app shell, the release files). Four small, low-risk moves make the boundaries
something a test enforces instead of a convention.

## Measurements (git-tracked files, tokens ≈ characters ÷ 4)

| Area | Files | Lines | Tokens |
|---|---|---|---|
| importer/ (sr6: 604k, of which override JSON 266k) | 251 | 55.3k | 1.05M |
| src/ (sr6 335k, ui 170k, engine 49k, print 22k, shared 7k, model 4k) | 186 | 57.0k | 587k |
| tests/ (sr6 214k, server 100k, engine 72k, ui 71k) | 309 | 36.1k | 503k |
| docs/ (superpowers plans 144k) | 56 | 12.2k | 294k |
| e2e/ | 57 | 10.5k | 152k |
| tools/ (cl6check 89k) | 34 | 8.8k | 110k |
| public/data (schemas, defaults) | 96 | 8.8k | 97k |
| server/ | 17 | 5.5k | 84k |

Biggest single files: `importer/sr6/effects.py` (≈68k tokens), `CHANGELOG.md` (46k), `docs/sr6-data-format.md` (40k),
`importer/sr6/overrides/crb.json` (39k), `importer/sr6/catalog.py` (31k), `src/sr6/engine/rules.ts` (22k).

What changes most (last 300 commits, 2026-10-11 to 10-20, 60 merged PRs): `docs/sr6-data-format.md` (47 commits, 29 PRs),
`importer/tests/test_sr6_overrides.py` (28), `overrides/crb.json` (24), `src/sr6/model/character.ts` (23),
`src/sr6/engine/charxml.ts` (22). `package.json`, `package-lock.json` and `CHANGELOG.md` are each in 31 of 60 PRs.

## How the areas already connect (verified)

- App ↔ server: HTTP only; no server file imports `src/`.
- Server → importer: a command line, `python -m importer …` (`server/jobs.mjs:41`). Server tests use a stub worker
  (`tests/server/books.test.ts:2`, `tests/fixtures/stub-worker.mjs`); the real-Python tests skip without Python
  (`tests/server/books-python.test.ts:22`).
- Importer → app: XML files validated against `public/data/sr6/schema` (`tools/validate-data.mjs`, `npm run validate:data`).
- Server keeps the games apart already: `server/games.mjs` defines the `ca2` and `sr6` rulesets with separate roots.
- `src/`: no import cycles and engines never import UI, enforced in CI by `tests/ui/import-cycles.test.ts` (:62, :67), and
  SR6 must not import Anarchy's *engine* (:79). The shell reaches into SR6 only at `src/ui/App.tsx:29` and `src/ui/Books.tsx:9`.

## Where the boundaries leak (verified)

1. **SR6 depends on the Anarchy model for shared types.** `src/model/types.ts` holds both-game types (`newId`,
   `Violation`/`Severity` :401, `Override` :323, `BACKDROPS` :329, identity :338). SR6 imports them in 18 places
   (e.g. `src/sr6/engine/charxml.ts:5`, `src/sr6/engine/rules.ts:8`). The cycle test checks Anarchy's engine, not its
   model, so this is not caught.
2. **Shell helpers live in Anarchy screens.** `serverRepo` defaults to the Anarchy save format (`src/ui/repo.ts:80-83`);
   `arrange`/`ownerGroups` sit in the Anarchy library screen (`src/ui/Library.tsx:198, 216`) and are used by SR6
   (`src/sr6/ui/Runners.tsx:12`, `Npcs.tsx:22`, `Designer.tsx:14`); `downloadJson`/`ExportRunnersDialog` sit beside
   Anarchy export code (`src/ui/Foundry.tsx:31, 52`).
3. **Release files collide in half of all PRs** (31 of 60), and have drifted: `package.json` says 0.17.0 while
   `CHANGELOG.md:3` still tops out at 0.16.0.
4. **The SR6 runner format is four files that always change together**: `src/sr6/model/character.ts`,
   `src/sr6/engine/charxml.ts`, `public/data/sr6/schema/character.xsd`, `docs/sr6-character-format.md`.
5. **`docs/sr6-data-format.md`** is ≈40k tokens and in 29 of 60 PRs.
6. **`importer/sr6/effects.py`** is ≈68k tokens with a small outside interface (`read`, `split_cost`, `accessory`,
   `apply`, `copy_links`, and the private `_split_entries` used by `run.py:176`).
7. **The SR6 importer depends on Anarchy importer modules**: `Result` (`importer/recipes/__init__.py:10`, used at
   `importer/sr6/recipes/__init__.py:6`, `importer/sr6/catalog.py:13`) and private CLI helpers `_flag`/`_cmd_ask`
   (`importer/sr6/__main__.py:98, 164`).
8. **Import layout lives in two languages**: `importer/sr6/run.py:1-4` writes `custom/sr6/imported/...` and
   `src/sr6/engine/load.ts` hardcodes the same paths. The schemas already validate the files; only a shared path
   manifest is missing (low priority).
9. **Look-alike file names in both games** (`Npcs.tsx`, `EditEntry.tsx`, `EditorView.tsx`, `Foundry.tsx`,
   `Compendiums.tsx`, `repo.ts`, `Rules.tsx`, `effects.py`, `recipes/`): a session searching by name finds the other
   game's copy.

## Chunk map

| # | Chunk | Paths | Single owner of | Test command | Working context |
|---|---|---|---|---|---|
| C1 | SR6 engine + runner format | `src/sr6/engine/**`, `src/sr6/model/**`, `tests/sr6/**`, `public/data/sr6/schema/character.xsd`, `docs/sr6-character-format.md` | the runner format (4 files) | `npx vitest run tests/sr6` | 60–80k |
| C2 | SR6 UI and sheets | `src/sr6/ui/**`, `src/sr6/print/**`, `tests/ui/*sr6*`, `e2e/sr6-*` | — | `npx vitest run tests/ui` + `npx playwright test e2e/sr6-` | 50–70k |
| C3 | SR6 importer | `importer/sr6/*.py`, `importer/sr6/recipes/**`, `importer/sr6/classes/**`, `importer/tests/test_sr6*` (not overrides) | — | `npm run test:py -- -p "test_sr6*"` | 70–90k (≈30k after splitting effects.py) |
| C4 | SR6 book data + CommLink6 checks | `importer/sr6/overrides/**`, `tools/cl6check/**`, `tools/cl6effects/**`, `importer/tests/test_cl6*`, `test_sr6_overrides.py` | owner rulings | `npm run test:py -- -p "test_cl6*"` + the CommLink6 replay and fresh-import gates | ≈30k |
| C5 | SR6 catalog format | `public/data/sr6/**` (not character.xsd), `docs/sr6-data-format.md`, the three SR6 kind lists (`server/games.mjs`, `src/sr6/model/types.ts`, `importer/sr6/__init__.py`) | catalog format | `npm run validate:data` | ≈40k (≈10k per section after the doc split) |
| C6 | Anarchy | `src/engine/**`, `src/model/**`, `src/print/**`, `src/ui/tabs/**`, Anarchy-only `src/ui` screens, `importer/recipes/**`, `importer/{statblock,effects}.py`, `public/data/schema/**`, `tests/engine`, `tests/books` | — | `npx vitest run tests/engine tests/books` + `npm run test:py` | ≈60k |
| C7 | App shell | `src/shared/**`, `src/main.tsx`, shared `src/ui` files (App, auth, nav, bits, repo, Portrait, Campaigns, Trash, Books, settings, app.css) | shell + shared types | `npx vitest run tests/ui` | ≈40k |
| C8 | Server | `server/**`, `tests/server/**`, non-SR6 `e2e/**` | — | `npx vitest run tests/server` | ≈30k |
| C9 | Importer core | `importer/{__main__,convert,backup,datapack,xmlio,reflow,library,ask,edits}.py`, `importer/pdf/**`, `importer/ai/**` | importer CLI | `npm run test:py` | ≈45k |
| C10 | Platform and release | `package*.json`, `CHANGELOG.md`, `README.md`, `Dockerfile`, `.github/**`, `unraid/**`, `tools/*.mjs`, config | versions, CI, image | `npm run check` | — |

Every chunk also runs `npm run lint` and `npm run format:check`. Sessions should not read `docs/superpowers/**` or
`docs/reviews/**` (≈217k tokens of plan history) unless asked.

## Refactors, best payoff for the risk first

1. **Extend the existing boundary test** (`tests/ui/import-cycles.test.ts`): SR6 must import nothing from `src/model`
   either; the shell may import `src/sr6` only from `App.tsx` and `Books.tsx`. No new tool, no risk.
2. **Move shared types and helpers to `src/shared`**: the cross-game types out of `src/model/types.ts` (re-exported there
   so Anarchy imports don't change), `arrange`/`ownerGroups`, `downloadJson`/`ExportRunnersDialog`, `unedited`; make
   `serverRepo` take its save format as an argument. Moves only; the type check and cycle test catch mistakes.
3. **One release owner**: feature PRs stop bumping `"version"` and editing `CHANGELOG.md`; one release PR does both.
   Removes the collision in half of all PRs and fixes the 0.16/0.17 drift. No code.
4. **Split `importer/sr6/effects.py` into a package** that re-exports the same names (make `_split_entries` public).
   Only safe with a byte-identical CommLink6 replay before and after.
5. **Split `docs/sr6-data-format.md` by its `##` sections** into `docs/sr6-data-format/*.md`, updating source comments
   that cite the path.
6. **Move `Result`, `_flag`, `_cmd_ask` into the importer core** as public helpers.
7. **New owner-ruling override tests go in per-book files** (`test_sr6_overrides_<book>.py`) instead of the end of
   `test_sr6_overrides.py`.
8. **Split the SR6 `RULES` table only in contiguous ranges** that keep today's order (Review shows violations in that
   order), or not at all. Last.

## Working in parallel

- One git worktree per session, one branch per chunk; never switch branches in the main checkout.
- Single owners: C5 (catalog format), C1 (runner format), C7 (shell and `src/shared`), C10 (release files). Another
  session that needs one of those files lands it as a small separate PR first, or asks the owner.
- Merge order follows the dependency graph: format (C5/C1) → importer core / importer (C9, C3) → book data (C4) →
  engine (C1) → UI (C2) → release (C10). Shell (C7) and server (C8) changes go before anything that uses them.
- CI: keep the single full `check` job as the merge gate. **Do not add CI path filters**: a skipped required check
  blocks the merge, and a `src/shared` change must still run both games' tests (keep-games-separate). Sessions iterate
  with their chunk's test command and run the full `npm run check` before opening the PR.
- Each chunk gets a short `CLAUDE.md` (in its root folder, or `docs/chunks/<chunk>.md` for chunks without one) listing:
  the paths it owns, the files it must not edit and who owns them, the other game's look-alike file names, its
  interfaces, its test command, and for C3/C4 the CommLink6 gates.

## Claims that did not survive verification

- "There is an import cycle among `load.ts`, `compendium.ts` and `charxml.ts`" (ChatGPT): no cycle; `charxml.ts`
  imports neither, the entry codec is already split out (`entryxml.ts`), and CI fails on any cycle.
- "A per-game server store needs extracting" (ChatGPT): it exists (`server/games.mjs`).
- "Server tests can't run without the importer" (Gemini): they use a stub worker; the real-Python tests skip without
  Python.
- "Test commands are monolithic" (Gemini): `npx vitest run <folder>` already runs one area.
- "Add CI path filters" (Gemini): rejected for the merge-blocking and cross-game reasons above.
- "`test_sr6_overrides.py` has 33 classes" (Opus): it has 32; the rest of that finding holds.
