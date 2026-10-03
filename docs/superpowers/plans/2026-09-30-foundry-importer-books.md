# Foundry importer module 0.2.0 (book data) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The importer module also reads Chummer's book-data file and builds world compendiums per book (amps, weapons, armor, gear, spells, vehicles, new skills/specs, rules), replacing its own entries on re-import and leaving everything else alone.

**Architecture:** Same split as 0.1.x: pure code in `scripts/lib/` (reading, translating a book into document data with deterministic ids, planning which entries to replace) tested with Vitest; Foundry code in `scripts/foundry/` (compendium folders and packs, writing entries, the window's book flow); a Quench batch for the Foundry side. The runner translator's amp/item/vehicle mapping is shared, not copied.

**Tech Stack:** as 0.1.x (plain ES modules, Foundry V14, Vitest, Quench).

**Spec:** `chummer-anarchy2/docs/superpowers/specs/2026-09-30-foundry-export-design.md` §1 (book decisions), §4.2, §5, §6; format `chummer-anarchy2/docs/export-format.md` (books: `source`, `amps`, `items`, `vehicles`, `skills`, `specs`, `rules`, top-level `tableRules`, `descriptions`). Plan 3 of 3.

## Global Constraints

- Repo `C:\dev\chummer-anarchy2-foundry`, branch `feat/0.2.0` from `main` (v0.1.1), PR to main; module version 0.2.0, download URL `…/releases/download/v0.2.0/module.zip`.
- `readExport` accepts `kind: "books"` (non-empty `books` array, each with `source.id` and `source.name`); runners files work as before.
- One compendium **folder** per book, named `<book name> (<source id>)`, inside a top folder "Chummer Anarchy". Packs only for content the book has: Amps, Weapons, Armor, Gear, Spells (Item; complex forms go in Spells), Vehicles (Actor), Skills & specializations (Item; only skills/specs sra2 doesn't already have — `skillFor(...).known === false` / `specFor(...).known === false`), Rules (JournalEntry). Pack labels `<Type> — <source id>`, pack names `ca2-<source id lowercased>-<type>` (world packs).
- Table rules: a pack "Table rules — Chummer" (`ca2-table-rules`, JournalEntry) in the top folder, one journal "Table rules" with a page per rule; replaced wholesale on each books import.
- Each entry: `system.reference` = `<source id> p.<page>`; flags `chummer-anarchy2-importer` = `{ id, exportedAt, appVersion, source, page, canon }`; description only when the file has `descriptions: true` (sanitised: `cleanHTML(escapeText(text))`).
- Document `_id` is deterministic from the Chummer id (`docId(chummerId)`: 16 chars `[A-Za-z0-9]` from a stable hash), so a re-import replaces the same document id and links to it keep working.
- Re-import: every entry in the file replaces its match by id completely (delete, then create with `keepId: true`); entries not in the file are left alone, whether older Chummer entries or GM-made ones. Nothing is deleted for being missing.
- GM only; a non-sra2 world refuses; newer sra2 warns (as 0.1.x).
- Rules journals: one JournalEntry per rules sheet section (`section`), one text page per rule (`title`, text when included, else "See <source id> p.<page>"), pages sorted by page then title.
- No book content in the repo: `samples/test-books.json` is made up and validates against `schema/export.schema.json`.

---

### Task 1: Read book files; the made-up sample

**Files:** Modify `scripts/lib/read.js`, `test/read.test.js`; Create `samples/test-books.json`
**Produces:** `readExport(text)` → `{ ok: true, file }` for runners or books; refusals unchanged except books are now accepted (remove the "comes in a later version" refusal; add "This file has no books in it." and "This file is damaged: a book is missing its id or name.").

- [ ] Write `samples/test-books.json`: two made-up books — "Made-Up Core" (`MUC`, canon) with 2 amps (one quality with an rr on a known spec, one cyberware with wound-light), 1 weapon ("Made-up Short Blade", dv "STR+1", melee ok only), 1 armor (value 2), 1 gear, 1 spell, 1 vehicle chassis, 1 new skill ("Made-Up Lore", attr log, one spec), 1 spec on a core skill ("Made-Up Style" on close-combat), 3 rules in two sections; "Made-Up Extras" (`MUX`, non-canon) with 1 amp; `tableRules` with one entry; `descriptions: true` with made-up text including `<b>` to test escaping. Validate against the schema in the test (as `test-export.json` is).
- [ ] Tests: the sample is valid and read; refusals for no books / a damaged book; the old books-refusal test is replaced. Run `npx vitest run` — RED then GREEN. Commit "Read book-data files".

### Task 2: Translate a book (pure, shared mapping)

**Files:** Modify `scripts/lib/translate.js` (extract the amp→feat, item→feat and vehicle→actor mapping out of `translateRunner` into exported functions `ampFeat(amp, ctx)`, `itemFeat(item, ctx)`, `vehicleActor(v, ctx)` used by both; `ctx` carries flag data, sanitize, a spec resolver and a `say()` for textOnly); Create `scripts/lib/books.js`, `test/books.test.js`; `docId` in `scripts/lib/ids.js` (+ test).
**Produces:** `docId(chummerId: string): string` (16 chars, deterministic, collision-tested over the sample ids + 10k random strings); `translateBook(book, { exportedAt, appVersion, descriptions, sanitize }) → { source, packs: { amps?, weapons?, armor?, gear?, spells?, vehicles?, skills?, rules? }, textOnly }` where each pack is an array of document data with `_id: docId(<chummer id>)`, flags per the Global Constraints, `system.reference`; rules packs are JournalEntry data `{ _id, name: section, pages: [{ _id, name: title, type: 'text', text: { content, format: 1 }, sort }] }`; `translateTableRules(tableRules, ctx) → JournalEntry data`.
Book amps: a book amp has no runner context — rr targets resolve through `specFor(skillFor(owning skill).slug, spec)`; `item` sub-object (an equipment amp's base item) adds its weapon/armor fields to the same feat; `mod: true` amps (add-ons) become feats with "Add-on" in the description; `printedRating` noted in the description when it differs from `rating`.

- [ ] Tests (against `samples/test-books.json`): MUC has packs amps/weapons/armor/gear/spells/vehicles/skills/rules and MUX only amps; ids are deterministic (`docId` same input → same id) and flags carry source/page/canon; the weapon is `short-weapons` with close-combat links not needed (known type); the new skill and both specs appear in skills (the core-skill spec linked to `close-combat`), the known-spec rr resolves to its sra2 slug; rules: two journals, pages sorted; descriptions escaped (`&lt;b&gt;`) and absent when `descriptions: false`; `translateRunner` tests still pass unchanged (the refactor keeps runner output identical — add a snapshot-style equality test of `translateRunner(sample)` before refactoring and keep it green).
- [ ] RED → implement → GREEN. Commit "Translate book data (shared amp/item/vehicle mapping)".

### Task 3: Write compendiums (Foundry) with a pure plan

**Files:** Create `scripts/foundry/books.js`; add `planPack(existingIds: Set<string>, incoming: {_id}[]) → { replace: string[], create: string[] }` to `scripts/lib/plan.js` (+ tests).
**Produces:** `importBook(t, { exportedAt, onProgress }) → { source, counts: { [pack]: { created, replaced } }, failed: [{ pack, name, error }] }` and `importTableRules(journal)`.
- Top folder: `Folder` of type `Compendium` named "Chummer Anarchy" (create if missing); book folder `<book name> (<source id>)` inside it.
- Pack: find `game.packs.get('world.' + name)`; else `CompendiumCollection.createCompendium({ label, name, type, package: 'world' })` (check the V14 signature and required fields) and `pack.configure({ folder: bookFolder.id })`. Unlock if locked (`pack.configure({ locked: false })`) for the write, restore after.
- Entries: `planPack` over `pack.index` ids → delete `replace` ids (`DocClass.deleteDocuments(ids, { pack: pack.collection })`), then create all incoming with `DocClass.createDocuments(data, { pack: pack.collection, keepId: true })` in chunks of 100; per-pack try/catch — a failing pack is reported, the others continue.
- Table rules: pack `ca2-table-rules` in the top folder; its journal "Table rules" replaced by id.
- [ ] Tests for `planPack` (pure). `node --check scripts/foundry/books.js`. Verify V14 API names against https://foundryvtt.com/api/v14/ (CompendiumCollection.createCompendium, configure, index, createDocuments/deleteDocuments with `pack`, Folder type "Compendium"). Commit "Write book data into world compendiums".

### Task 4: The window's book flow

**Files:** Modify `scripts/foundry/app.js`, `templates/import.hbs`, `lang/en.json`, `styles/importer.css`
- After a books file is read: preview one row per book (name, source id, Canon/Non-canon, entry counts per type, "descriptions included" or not, a tick, all ticked) plus a "Table rules (n)" row with a tick; Import → per book `importBook` with progress "Importing <book> (2 of 3)…"; report per book: per pack "created n, replaced m", failures with reasons, and the textOnly lines; a line "Entries not in this file were left as they were." Buttons Close and "Open compendiums" (opens the Compendium sidebar tab).
- Runner files behave exactly as in 0.1.1.
- [ ] `node --check`; `npx vitest run` green. Commit "Import window: book data".

### Task 5: Quench, docs, 0.2.0

**Files:** Modify `scripts/foundry/quench.js`, `README.md`, `CHANGELOG.md`, `module.json`
- Quench batch "Chummer Importer: book data": import `samples/test-books.json` with a test pack prefix (add an option to `importBook` for a name prefix and a test top folder "Chummer Importer tests") — assert packs exist in the book folder, entry counts, a weapon's `damageValue`/links, flags and `system.reference`, a rules journal with sorted pages; re-import with one amp changed → same `_id`, changed value, and a GM-made entry added to the pack in between still there; `after()` deletes the test packs (`pack.deleteCompendium()`) and test folders only.
- README: exporting book data from Chummer (Game data → Export book data for Foundry; GMs only; "For your own Foundry only. Don’t share this file."), what the compendiums contain, re-import rule (replaces its own entries, never deletes), skills/specs that sra2 already has are not duplicated. CHANGELOG 0.2.0. `module.json` 0.2.0 + download URL.
- [ ] `npx vitest run`, `node --check`, YAML ok; commit "Quench book-data tests, docs, 0.2.0"; push; open the PR; CI green. The controller merges and releases after the final review; the owner runs Quench and a real book import.
