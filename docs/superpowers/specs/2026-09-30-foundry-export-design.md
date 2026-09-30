# Foundry VTT export and importer module — Design Spec

Date: 2026-09-30. Approved in conversation, section by section. Chummer 0.6.0 (export) + a new Foundry module
`chummer-anarchy2-importer` 0.1.0 (runners) and 0.2.0 (book data).

Target system: **sra2** (Shadowrun Anarchy 2, https://github.com/VincentVk9373/sra2), examined at v14.3.3 on
Foundry **V14**. sra2 has no importer of its own, no rules engine and changes its data model often (18 world
migrations 13.0.3–13.4.5, which never run on imported data), so all knowledge of sra2 lives in the module.

## 1. Decisions

| Question | Decision |
|---|---|
| Shape | Chummer exports JSON files; a Foundry add-on module uploads them, parses them and builds the documents. Chummer never builds compendium packs. |
| Where the translation lives | **In the module.** Chummer exports its own documented format ("Chummer Anarchy export v1") with every number resolved; only the module knows sra2's fields. An sra2 change means a module release, never a Chummer one. |
| Where runners go | Straight into the world as playable Actors, folder "Chummer Anarchy". The GM picks which runners in the file to import. |
| A runner already in the world | Prompt per runner: **Replace** (default) / **Add as new version** / **Skip**, showing both export dates; "Apply to all". A file older than the world copy: red warning, **Skip** preselected. |
| Replace | Same Actor: the Chummer-made parts are rebuilt; ownership, tokens on scenes, marked wounds and Anarchy, and items the GM added in Foundry (no Chummer id) are kept. |
| Add as new version | A new Actor named "<street name> (<export date>)"; the old one untouched. |
| Version data | Hidden, in the document's flags: Chummer id, export date/time, Chummer version. Never on the sheet. |
| Book text | A choice at export: **Include book descriptions** (default on), with the note "For your own Foundry only. Don't share this file." Off: names, numbers, effects and "CRB p.112"-style references only. |
| Who exports | Book data: admin and editors (the GMs). Runners: a player their own; a GM any runner they can see, a whole campaign at once. Each user imports into their own Foundry. |
| Which book data | The export page lists the books with Canon / Non-canon, all ticked. Data goes out as the app sees it (GM edits and house rules applied), plus the table rules. |
| Re-importing book data | Each entry in the file **replaces** its match (by Chummer id) completely. Entries not in the file are **left alone**, whether older Chummer entries or ones a GM built in Foundry. Nothing is ever deleted for being missing. |
| Module distribution | Public repo `jbowensii/chummer-anarchy2-foundry`, installed by manifest URL, updates through Foundry. Code only, no book content. |
| Testing in Foundry | Optional **Quench** integration (https://github.com/Ethaks/FVTT-Quench): test batches registered on `quenchReady` when Quench is active. Quench v0.10.0 is verified for V13 only (minimum 13.341, no maximum): confirm early that it runs on V14 and report if not. |

## 2. The export file ("Chummer Anarchy export v1")

One JSON document per download, UTF-8, `.ca2foundry.json`:
`runners-YYYY-MM-DD.ca2foundry.json` or `books-YYYY-MM-DD.ca2foundry.json`.

```jsonc
{
  "format": "chummer-anarchy2-export", "version": 1,
  "kind": "runners",                     // or "books"
  "exportedAt": "2026-10-02T09:15:00Z",
  "app": { "name": "Chummer Anarchy 2.0", "version": "0.6.0" },
  "descriptions": true,                  // book descriptions included
  "runners": [ /* §2.1 */ ],             // kind "runners"
  "books": [ /* §2.2 */ ], "tableRules": [ { "name": "", "text": "", "on": true } ]   // kind "books"
}
```

Never in a file: passwords, sessions, keys, other users' data, PDFs, owner usernames. A JSON Schema
(`public/data/schema/export.schema.json`) and a document (`docs/export-format.md`) define it; both sides test
against the schema. A later incompatible change is `version: 2`; the module refuses versions it doesn't know.

### 2.1 A runner

Built from `currentBuild(ch)` (a finalized runner's build is not `ch.build`) and the engine's own numbers
(`derive`, `ampRating`, `ampEssence`, `price`, `balance`), so Foundry shows what Chummer shows.

- `id`, `updatedAt`, `exportedAt`, `streetName`, `realName`, `finalized`
- `metatype` `{ id, name, ranges: { str: [min, max], … }, edge }`, `level` `{ id, name }`, `lifestyle` `{ id, name, perRun }`
- `portrait`: the data URL or null
- `attributes` `{ str, agi, wil, log, cha }`, `edge`, `essence`
- `skills[]` `{ id, name, attr, rating, specs: [{ id, name, attr, custom }] }`; `knowledge[]` `{ name, kind, native }`
- `amps[]` `{ uid, catalogId, source, page, canon, type, typeName, name, rating, essence,
  effects: [{ id, name, category, param, value, note }],
  rr: [{ on: "attribute"|"skill"|"spec", id, name, value }],
  bonuses: { light, serious, physicalThreshold, mentalThreshold, matrixThreshold, armor, anarchy, initiative },
  item?: <item uid>, vehicle?: <vehicle uid>, description? }`
- `items[]` `{ uid, catalogId, kind, name, source, page, canon, price, starting, note,
  weapon?: { dv, dvText, ranges: { melee, short, medium, long }, specialist, ammo },
  armor?: { value, over }, description? }` — ranges as `"ok" | "disadvantage" | "none"`
- `vehicles[]` `{ uid, name, chassis, pilot, body, handling, speed, flyingSpeed, armor, mount, flying,
  thresholds, monitor, weapons: [<item uid>], amp: <amp uid> }`
- `monitor` `{ light, serious, incap }`, `thresholds`, `armor` `{ main, alt }`, `initiative`, `pools[]`
- `narrative` `{ keywords[5], dispositions[4], cues[4] }`, `background`, `notes`
- `nuyen` `{ balance }`, `ledger[]` `{ at, type, summary, amount }` (a summary, not the raw events)
- `description`s only when the file's `descriptions` is true.

### 2.2 A book

`{ source: { id, name, publisher, canon }, amps[], items[], vehicles[], skills[], rules[] }`, entries as the
catalog holds them after the edits layer and house rules: ids scoped (`crb.jazz`), `source`, `page`, `canon`,
effects by id and name, an amp's rating from `ampRating` on its own, `rules[]` `{ id, sheet, section, title,
text? }`. Descriptions only when included.

## 3. Chummer (0.6.0)

- **Engine** `src/engine/export.ts` (pure, no DOM): `exportRunners(c, chs, opts)` and `exportBooks(c, sources,
  opts)` return the objects above. Unit-tested against the schema and the made-up books in
  `tests/fixtures/mini`.
- **UI**
  - Runner editor: **Export for Foundry**. Runner list: a multi-select with **Export for Foundry**, and on a
    campaign page (GMs) **Export campaign for Foundry**.
  - Game data page (admin and editors): **Export book data for Foundry**: ticked books (Canon / Non-canon),
    **Include book descriptions** (on) with the sharing note, then Download.
- **Server**: book data is built in the browser from the catalog the signed-in user already reads, so the rule
  is enforced where the data is served: the Game data export is shown to admin and editors only, and runners
  come from `GET /api/characters`, which already limits what each role sees. No new endpoint. Players can
  already read the catalog files the app itself loads, so the book-data rule keeps the button with the GMs;
  it is not a wall around the data.
- **Docs**: `docs/export-format.md`, README section, CHANGELOG.

## 4. The Foundry module (`chummer-anarchy2-importer`)

- Repo `jbowensii/chummer-anarchy2-foundry`, public, MIT. Plain ES modules (no build step), `module.json` with
  `compatibility { minimum: 14, verified: 14 }`, `relationships.systems: [{ id: "sra2" }]`,
  `relationships.recommends: [{ id: "quench" }]`. Release workflow on `v*` tags: zip + `module.json`, manifest
  URL `…/releases/latest/download/module.json`.
- Files: `scripts/main.js` (hooks, buttons), `scripts/app.js` (the import window, ApplicationV2),
  `scripts/translate/*.js` (pure: Chummer entry → sra2 document data), `scripts/apply/*.js` (creates or
  updates Foundry documents), `scripts/quench.js`, `lang/en.json`, `samples/test-export.json` (made up).
- **Buttons**: "Import from Chummer" in the Actors and Compendium sidebars, GM only.
- **The window**: upload, check (format, version, active system sra2, sra2 version vs the tested one: a warning
  when newer), a preview list with ticks, the per-runner prompt (§1), Import, then a report of created /
  replaced / new version / skipped, and anything turned into plain text.

### 4.1 Translation to sra2 (v14.3.3)

- **Actor `character`**: `name` = street name, `img` and the prototype token from the portrait (uploaded to
  `worlds/<world>/chummer/portraits/<id>.<ext>` with `FilePicker.upload`), `system.attributes.{strength,
  agility, willpower, logic, charisma}`, `system.resources.yens` = balance, `system.keywords.keyword1..5`,
  `system.behaviors.behavior1..4` = dispositions, `system.catchphrases.catchphrase1..4` = cues,
  `system.bio.background`, `system.bio.notes` = notes + a "From Chummer" block (real name, Edge, lifestyle,
  level, ledger summary, anything not modelled), `system.reference` = "Chummer Anarchy 2.0".
- **Embedded items**: one `metatype` (max attributes from the ranges, so sra2 caps correctly); one `skill` per
  skill with `slug` from a Chummer-id → sra2-slug table (the 16 `SKILL_SLUGS`); one `specialization` per spec
  with `linkedSkill` = the skill slug and `slug` = the matching `spec_*` (by table, then by normalised English
  name; a spec sra2 doesn't know gets a new slug `spec_chummer-<id>`).
- **Amps → `feat`**: `featType` from the amp type (quality → trait, cyberware, bioware (cyberware +
  `isBioware`), adept → adept-power, awakened, emerged, spell, cyberdeck, equipment, contact); `rating`,
  `essenceCost`; `rrList[]` from `rr` (`rrType`, `rrValue` capped at 3, `rrTarget` = attribute key or slug);
  `bonusLightDamage`, `bonusSevereDamage`, `bonusPhysicalThreshold`, `bonusMentalThreshold`,
  `bonusMatrixThreshold`, `bonusAnarchy`, `armorValue` from `bonuses`; every other effect a
  `narrativeEffects[]` entry (text, `isNegative`, `value`).
- **Items → `feat`**: weapons `featType: "weapon"` with `damageValue` and all four range fields written
  explicitly (sra2 only fills them from the UI), `weaponType` best-matched, else `custom-weapon`; armor
  `featType: "armor"` + `armorValue`; gear `equipment`; spells `spell`; complex forms `complex-form`. The
  Chummer price goes in the description footer (sra2 computes its own costs).
- **Vehicles**: separate `vehicle` Actors in "Chummer Anarchy/<runner> vehicles", `vehicleType` best-matched or
  `custom-vehicle` with the `custom*` stats, weapons as embedded weapon feats; linked through the runner's
  `system.linkedVehicles` (created first, then the runner patched).
- **Flags** on every created document: `flags["chummer-anarchy2-importer"] = { id, exportedAt, appVersion,
  source, page }`. The only way the module recognises its own documents.
- **Replace** rebuilds the flagged embedded items and the Chummer-owned fields, keeps ownership, tokens,
  `system.damage`, `anarchySpent`, and unflagged items.

### 4.2 Book data

- One world compendium folder per book, with packs as the book has content: Amps, Weapons, Armor, Gear,
  Spells (Item), Vehicles (Actor), Skills & specializations (Item; only new ones, the core 16 reuse sra2's),
  Rules (JournalEntry: a page per rule, grouped by section; the table rules in their own entry).
- Each entry: `system.reference` = "CRB p.112", flags as above plus `canon`, the description when included.
- Re-import: the match by Chummer id is replaced completely (delete + create with the same `_id`, so
  links stay); everything else is left alone.

## 5. Errors and safety

- A wrong, damaged or newer-format file is refused with the reason; nothing changes.
- Each runner and each entry is built completely or not at all (built in memory, created in one call); a
  failure is skipped and listed in the report.
- The file is data only: nothing in it is run; descriptions are cleaned with Foundry's HTML sanitiser before
  they're stored.
- Chummer: book-data export for admin and editors only (UI) over catalog files only signed-in users read;
  runners only those the server already returns to that user.

## 6. Testing

- Chummer: `tests/engine/export.test.ts` (schema-valid output, descriptions on/off, current build of a
  finalized runner, numbers equal to `derive`), an e2e test per button (download contents; the book export is
  hidden for a player).
- Module: translator unit tests with Vitest outside Foundry, on CI; Quench batches inside Foundry ("file
  checks", "runners", "replace and new version", "book data") that import `samples/test-export.json` into a
  throwaway folder, check the sra2 documents, then delete what they made.
- Real books stay local, as with Chummer's `tests/books`.

## 7. Build order

1. Chummer 0.6.0: export format doc + schema, `export.ts`, the buttons, tests.
2. Module 0.1.0: runner import (prompt, Replace keeps play state, vehicles, From Chummer notes, report), Quench.
3. Module 0.2.0: book-data compendiums and the rules journal.
4. The pending Chummer list (runner-list markers, print changes, book-style sheet, print background picker) is
   0.5.8, before or alongside step 1 as the owner chooses.

## 8. Out of scope

A live link between Foundry and Chummer; exporting from Foundry back to Chummer; other Foundry systems; French
names (the module writes English names and sra2's language-independent slugs).
