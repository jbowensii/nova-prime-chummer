# Book export additions (Chummer 0.6.2) and importer 0.3.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chummer's book export carries sections for every rule, the books' pregen characters, metatypes and every skill/spec; the Foundry importer organises rules as one journal per topic per book, and adds Characters and Metatypes compendiums, never building an empty one.

**Architecture:** Part A changes Chummer's pure export (`src/engine/export.ts`), its schema/doc, and the Game data panel (which fetches the books' sample characters). Additions are optional v1 fields (format stays version 1, as `docs/export-format.md` allows). Part B changes the module's pure book translator (`scripts/lib/books.js`), the pack list (`scripts/foundry/books.js`), the window counts, and Quench.

**Tech Stack:** as before (Chummer: TS/React/Vitest/Playwright/ajv; module: plain ES modules, Foundry V14, Vitest, Quench).

**Spec:** the owner's decisions recorded in `.superpowers/sdd/next/backlog.md` (2026-10-01), summarised in Global Constraints; base design `docs/superpowers/specs/2026-09-30-foundry-export-design.md`.

## Global Constraints

- Format stays `version: 1`; every new field is optional, so 0.2.x modules still read new files and the 0.3.0 module still reads 0.6.0/0.6.1 files.
- Rule sections: at export, a rule with an empty section gets its sheet's display name (title-cased, with a small table for nicer names: `base` → "Basics", `technomancers` → "Technomancers", `optional` → "Optional rules", `vehicles` → "Vehicles & Drones"; otherwise title-case the sheet id). New optional field `sheetName` on every exported rule = that display name.
- Book `characters` (optional): the book's own sample characters (imported `custom/imported/samples.xml` rows whose `source` is that book), each exported exactly like a runner (`ExportRunner`), descriptions per the file's choice. Server example sets (`/api/samples`) are not books and are not included.
- Book `metatypes` (optional): `{ id, source, page, canon, name, edge, ranges, racialQuality }` for every metatype whose source is the book.
- Book `skills`: every skill whose source is the book, with all its specs (unchanged rule; core skills are CRB's); `specs` as today.
- Module rules layout (owner's option 2): per book one Rules compendium; ONE JournalEntry per rules sheet, named `sheetName` (fallback: title-cased sheet, then "Rules"); inside, a level-1 text page per section (`title.level: 1`, content a short line "<n> rules") followed by that section's rules as level-2 pages (`title.level: 2`), sections in order of first appearance, rules sorted by page then title; every page keeps its flags and reference. Table rules stay one journal. Old per-section journals from 0.2.x are left alone (the README and CHANGELOG say the GM may delete them).
- Module packs: Characters (Actor: translateRunner per book character, portrait uploaded as for runners, vehicles as separate Actor entries in the same pack named "<runner> — <vehicle>", not linked), Metatypes (Item type `metatype`: maxStrength… from `ranges[*][1]`, anarchyBonus from the sra2 table by name else 0, description with edge and racial quality), Skills & specializations (every skill and spec in the file, sra2 slugs via skillFor/specFor, `known` ones too).
- **Never build an empty compendium** (owner's rule): a pack and its book folder are created only when they get at least one entry; also find and fix whatever made the owner see an empty pregens compendium in 0.2.x.
- No book content in either repo: samples are made up. Chummer work on branch `feat/0.6.2`; module on `feat/0.3.0`; the controller merges/releases (Chummer to tower04) after final reviews. Never touch the owner's ignored Chummer files.

---

## Part A — Chummer 0.6.2

### Task A1: Export sections, metatypes, every skill (engine + schema + doc)
**Files:** `src/engine/export.ts`, `public/data/schema/export.schema.json`, `docs/export-format.md`, `tests/engine/export.test.ts`
- [ ] Tests first: a mini-fixture rule with no section exports `section` = its sheet's display name and `sheetName`; a book with metatypes exports them (mini fixtures: check `tests/fixtures/mini/custom/imported/core/metatypes.xml` sources; add a made-up metatype to a test catalog if none has the book's source); every skill of the book with all its specs; the schema accepts files with and without the new optional fields; the doc example still validates. RED → implement (`sheetDisplayName(sheet)` exported helper) → GREEN; `npm run check`; commit "Export: rule sections, metatypes".

### Task A2: Export the books' sample characters
**Files:** `src/engine/export.ts` (`exportBooks(c, sources, tableRules, opts, characters?: Record<sourceId, Character[]>)`), `src/ui/Foundry.tsx` (ExportBooksPanel loads `custom/imported/samples.xml`, reads each ticked book's sample files with the existing reader — reuse/extract `exampleList`/`readCharacterFile` from `src/ui/Library.tsx` rather than duplicating — and passes them), schema (`book.characters`: array of the runner def), doc, tests (engine unit test with a made-up character; e2e on the Game data panel: the mini fixture PREGENS book's sample comes out under that book's `characters`).
- [ ] RED → GREEN; a sample that fails to read is skipped and listed in the panel (not fatal); commit "Export: the books' sample characters".

### Task A3: Docs, version 0.6.2
- [ ] CHANGELOG 0.6.2, README note, version 0.6.2 in package.json/lock; `npm run check`, build, full Playwright run; commit. Controller: PR, merge, tag, release, tower04.

## Part B — Foundry importer 0.3.0

### Task B1: Rules as one journal per topic
**Files:** `scripts/lib/books.js`, `test/books.test.js`, `samples/test-books.json` (add a second sheet and a rule without section but with `sheetName`)
- [ ] Tests first for the Global Constraints' rules layout (journal per sheet named from sheetName/title-case; level-1 section pages then level-2 rule pages in order; ids deterministic: journal `docId(src + ':rules-sheet:' + sheet)`, section page `docId(src + ':section:' + sheet + ':' + section)`); RED → GREEN; commit.

### Task B2: Characters, Metatypes, all skills; no empty packs
**Files:** `scripts/lib/books.js` (characters via translateRunner, metatypes, skills incl. known), `scripts/foundry/books.js` (PACKS gains `characters` Actor and `metatypes` Item; a pack/folder is created only when its list is non-empty; the book folder only when the book has any pack), `scripts/foundry/apply.js` (export `uploadPortrait` for reuse), tests, sample (a made-up character and a metatype in `test-books.json`).
- [ ] Find the empty-compendium cause in 0.2.x (read `importBook`/`getPack`/window flow; e.g. a book with no packs still creating its folder, or a pack created before a translate failure) and cover it with a test of the pure planning part. RED → GREEN; commit.

### Task B3: Window and Quench
**Files:** `scripts/foundry/app.js` (counts for the new packs), `scripts/foundry/quench.js` (book batch: Characters pack has the made-up character with its skills; Metatypes pack; rules journal per sheet with section and rule pages in order; no empty pack exists for a type the sample book lacks), `lang/en.json`.
- [ ] `node --check`, `npx vitest run`; commit.

### Task B4: Docs, 0.3.0, PR
- [ ] README (new compendiums; rules layout; old per-section journals can be deleted; no empty compendiums), CHANGELOG 0.3.0, module.json 0.3.0 + download URL; push, PR, CI green. Controller merges and releases after the final review; the owner re-exports book data from Chummer 0.6.2 and imports.
