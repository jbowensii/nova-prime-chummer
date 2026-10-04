# Foundry importer module 0.1.0 (runners) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Foundry VTT V14 module for the sra2 system that uploads a Chummer runners file and builds the runners as world Actors, with Replace / Add as new version / Skip.

**Architecture:** Plain ES modules, no build step. Pure code (file reading, sra2 lookup tables, runner → sra2 translation, replace planning) lives in `scripts/lib/` and is unit-tested with Vitest in Node; thin Foundry code (`scripts/foundry/`) creates documents and the import window; Quench batches test the Foundry side inside a real world.

**Tech Stack:** JavaScript (ES2022 modules), Foundry VTT V14 API (ApplicationV2 + HandlebarsApplicationMixin, Actor/Item/Folder documents, FilePicker), Vitest + ajv (dev only), GitHub Actions.

**Spec:** `chummer-anarchy2/docs/superpowers/specs/2026-09-30-foundry-export-design.md` (§1, §4, §4.1, §5, §6); the file format is `chummer-anarchy2/docs/export-format.md` + `public/data/schema/export.schema.json` (v1, shipped in Chummer 0.6.0). Plan 2 of 3; plan 3 (book data, module 0.2.0) follows.

## Global Constraints

- Repo: new public `jbowensii/chummer-anarchy2-foundry`, local clone `C:\dev\chummer-anarchy2-foundry`, MIT license, default branch `main`; work lands through a branch + PR.
- Module id `chummer-anarchy2-importer`, title "Chummer Anarchy 2.0 Importer", `compatibility { minimum: 14, verified: 14 }`, `relationships.systems: [{ id: "sra2", type: "system" }]`, `relationships.recommends: [{ id: "quench", type: "module" }]`. Tested sra2 version constant `TESTED_SRA2 = "14.3.3"`; a newer sra2 shows a warning, never a block.
- Reads only files with `format: "chummer-anarchy2-export"`, `version: 1`, `kind: "runners"`; anything else is refused with the reason and nothing changes. (`kind: "books"` says "Book data import comes in a later version.")
- GM only: the button shows only for `game.user.isGM`.
- Every created document carries `flags["chummer-anarchy2-importer"] = { id, exportedAt, appVersion }` (runner id for the actor; `id` = the Chummer uid for embedded items and vehicles, plus `runner` = the runner id on vehicles). The flag is the only way the module recognises its own documents.
- Runners go into the Actors folder "Chummer Anarchy"; a runner's vehicles into a subfolder "<street name> vehicles".
- Existing runner (same flag id): prompt per runner **Replace** (default) / **Add as new version** / **Skip**, both export dates shown, **Apply to all**. A file older than the world copy: red warning, **Skip** preselected. Several world copies: the newest by `exportedAt` is the one compared and replaced.
- Replace keeps: the Actor document (id, so tokens on scenes stay linked), ownership, `system.damage`, `system.anarchySpent`, `system.tempAnarchy*`, prototype token settings other than the image, and every embedded item without our flag. It rebuilds: name, img, token image, the Chummer-owned `system` fields, and every flagged embedded item.
- Add as new version: a new Actor named `<street name> (<export date, e.g. 2 Oct 2026>)`, vehicles copied likewise.
- Descriptions are sanitised before they're stored (Foundry's `TextEditor`/`foundry.utils.cleanHTML` in V14; plain text is escaped and wrapped in `<p>`).
- No book content in the repo: samples and tests are made up.
- Mapping tables from sra2 v14.3.3: skills `SKILL_SLUGS`; specialisations from its `src/packs/anarchy-items-en/specialization_*.json` (name "Spec: X", `slug`, `linkedSkill`, `linkedAttribute`); attributes `strength agility willpower logic charisma`.

---

### Task 1: Repo, manifest, file reading

**Files:**
- Create: `module.json`, `package.json`, `LICENSE`, `README.md`, `.gitignore`, `.github/workflows/ci.yml`, `schema/export.schema.json` (copied verbatim from Chummer 0.6.0 `public/data/schema/export.schema.json`), `samples/test-export.json`, `scripts/lib/read.js`, `test/read.test.js`
**Interfaces — Produces:** `readExport(text: string): { ok: true, file } | { ok: false, reason: string }`; `FORMAT = 'chummer-anarchy2-export'`, `VERSION = 1`, `MODULE_ID = 'chummer-anarchy2-importer'` (in `scripts/lib/constants.js`).

- [ ] **Step 1: Create the repo**

```bash
mkdir -p "C:/dev/chummer-anarchy2-foundry" && cd "C:/dev/chummer-anarchy2-foundry"
git init -b main
gh repo create jbowensii/chummer-anarchy2-foundry --public --source . --description "Foundry VTT (sra2) importer for Chummer Anarchy 2.0 exports" --remote origin
```

- [ ] **Step 2: Write `module.json`**

```json
{
  "id": "chummer-anarchy2-importer",
  "title": "Chummer Anarchy 2.0 Importer",
  "description": "Import runners exported from Chummer Anarchy 2.0 into the Shadowrun Anarchy 2 (sra2) system.",
  "version": "0.1.0",
  "authors": [{ "name": "John Bowens", "url": "https://github.com/jbowensii" }],
  "compatibility": { "minimum": "14", "verified": "14" },
  "relationships": {
    "systems": [{ "id": "sra2", "type": "system", "compatibility": { "minimum": "14.3.3" } }],
    "recommends": [{ "id": "quench", "type": "module", "reason": "In-Foundry tests for the importer" }]
  },
  "esmodules": ["scripts/main.js"],
  "languages": [{ "lang": "en", "name": "English", "path": "lang/en.json" }],
  "url": "https://github.com/jbowensii/chummer-anarchy2-foundry",
  "manifest": "https://github.com/jbowensii/chummer-anarchy2-foundry/releases/latest/download/module.json",
  "download": "https://github.com/jbowensii/chummer-anarchy2-foundry/releases/download/v0.1.0/module.zip",
  "license": "LICENSE"
}
```

- [ ] **Step 3: `package.json` (dev only), `.gitignore` (`node_modules/`, `*.zip`), MIT `LICENSE` (John Bowens, 2026), `ci.yml`** running `npm ci && npm test` on push and PR (Node 22).

```json
{ "name": "chummer-anarchy2-importer", "private": true, "type": "module",
  "scripts": { "test": "vitest run" },
  "devDependencies": { "vitest": "^3", "ajv": "^8" } }
```

- [ ] **Step 4: Write `samples/test-export.json`** — a made-up runners file (no book text): runner "Made-Up Mara" (human; attributes str 2 agi 4 wil 3 log 2 cha 3; skills ranged-weapons 4 with spec `ranged-weapons.pistols` "Pistols", athletics 2, network 2 with custom spec `custom:Fixers`; amps: a cyberware amp with rr on attribute agi 1 and a `wound-light` bonus, a quality with rr on the spec, an adept amp with an initiative level 2 and a narrative effect, a vehicle amp; items: fake SIN + commlink (starting), a weapon (dv "5", ranges ok/ok/disadvantage/none), an armor 2; a vehicle (uid = the vehicle amp's uid, chassisId "medium-drone", count 1); portrait a tiny data:image/png; narrative 5/4/4 made-up strings; ledger with "Creation finished" and an earn) and a second runner "Test Two" with nothing but attributes and one skill. Every field the schema requires, values consistent with `docs/export-format.md`.

- [ ] **Step 5: Write the failing test** `test/read.test.js`

```js
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'
import { readExport } from '../scripts/lib/read.js'

const sample = readFileSync('samples/test-export.json', 'utf8')
describe('reading a Chummer file', () => {
  test('the sample is a valid v1 runners file', () => {
    const check = new Ajv2020({ strict: false, validateFormats: false }).compile(JSON.parse(readFileSync('schema/export.schema.json', 'utf8')))
    expect(check(JSON.parse(sample)), JSON.stringify(check.errors)).toBe(true)
  })
  test('reads it', () => {
    const r = readExport(sample)
    expect(r.ok && r.file.runners.map(x => x.streetName)).toEqual(['Made-Up Mara', 'Test Two'])
  })
  test.each([
    ['not JSON', 'nope', /isn’t a Chummer Anarchy export/],
    ['another format', JSON.stringify({ format: 'x', version: 1 }), /isn’t a Chummer Anarchy export/],
    ['a newer version', JSON.stringify({ format: 'chummer-anarchy2-export', version: 2, kind: 'runners' }), /version 2.*update this module/],
    ['book data', JSON.stringify({ format: 'chummer-anarchy2-export', version: 1, kind: 'books', books: [] }), /Book data import comes in a later version/],
    ['no runners', JSON.stringify({ format: 'chummer-anarchy2-export', version: 1, kind: 'runners' }), /no runners/],
  ])('refuses %s', (_, text, reason) => {
    const r = readExport(text)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(reason)
  })
})
```

- [ ] **Step 6: Run** `npm install && npx vitest run test/read.test.js` — Expected: FAIL, cannot find `scripts/lib/read.js`.

- [ ] **Step 7: Implement** `scripts/lib/constants.js` and `scripts/lib/read.js`

```js
// scripts/lib/constants.js
export const MODULE_ID = 'chummer-anarchy2-importer'
export const FORMAT = 'chummer-anarchy2-export', VERSION = 1
export const TESTED_SRA2 = '14.3.3'
```

```js
// scripts/lib/read.js
// A Chummer Anarchy export file (chummer-anarchy2 docs/export-format.md): checked before anything in the world changes.
import { FORMAT, VERSION } from './constants.js'

const NOT_OURS = 'This file isn’t a Chummer Anarchy export.'
export function readExport(text) {
  let file
  try { file = JSON.parse(text) } catch { return { ok: false, reason: NOT_OURS } }
  if (!file || typeof file !== 'object' || file.format !== FORMAT) return { ok: false, reason: NOT_OURS }
  if (file.version !== VERSION) return { ok: false, reason: `This file is export format version ${file.version}; this module reads version ${VERSION}. Please update this module.` }
  if (file.kind === 'books') return { ok: false, reason: 'This is a book data file. Book data import comes in a later version of this module.' }
  if (file.kind !== 'runners' || !Array.isArray(file.runners) || !file.runners.length) return { ok: false, reason: 'This file has no runners in it.' }
  for (const r of file.runners)
    if (!r || typeof r.id !== 'string' || typeof r.streetName !== 'string' || typeof r.attributes !== 'object')
      return { ok: false, reason: 'This file is damaged: a runner is missing its id, name or attributes.' }
  return { ok: true, file }
}
```

- [ ] **Step 8: Run** `npx vitest run` — Expected: 7 passed.

- [ ] **Step 9: README** (what it does, install by manifest URL, how to export from Chummer, GM only, what Replace keeps, sharing note "For your own Foundry only. Don’t share this file." for files with descriptions, Quench tests, "tested with sra2 14.3.3 on Foundry 14"). **Commit** `git add -A && git commit -m "Module skeleton, manifest, reading a Chummer file"` (on `main`: the repo's first commit), `git push -u origin main`.

---

### Task 2: sra2 lookup tables

**Files:** Create `scripts/lib/sra2.js`, `tools/make-specs.mjs`, `test/sra2.test.js`
**Interfaces — Produces:**
- `ATTR = { str: 'strength', agi: 'agility', wil: 'willpower', log: 'logic', cha: 'charisma' }`
- `SKILLS`: Chummer skill id → `{ slug, name, attr }` for the 16 sra2 skills; Chummer ids that differ: `conjuring → conjuration`, `network → networking` (others equal the slug).
- `SPECS`: array `{ slug, name, skill, attr }` generated from sra2's pack (name without "Spec: ").
- `skillFor(chummerSkill: { id, name, attr }): { slug, name, attr, known: boolean }` — unknown → slug `chummer-<id>`.
- `specFor(skillSlug, spec: { id, name, attr, custom }): { slug, name, attr, known }` — match by normalised name (lowercase, accents stripped, non-alphanumerics → single space) within that skill, then any skill; unknown → `spec_chummer-<slugified name>`.
- `featType(ampType: string): string` — `quality→trait, cyberware→cyberware, bioware→cyberware (isBioware true), adept→adept-power, awakened→awakened, emerged→emerged, cyberdeck→cyberdeck, contact→contact, equipment→equipment, vehicle→equipment`, anything else `equipment`.
- `weaponType(name: string): string` — keyword match on the name for sra2's `WEAPON_TYPES` keys (pistol → `heavy-pistols` unless "light"/"hold-out"/"pocket", smg, assault rifle, shotgun, sniper, machine gun, grenade launcher, rocket/missile, bow, crossbow, taser, throwing, knife/katana/blade → `long-weapons` for katana/sword, `short-weapons` otherwise, unarmed → `bare-hands`), else `custom-weapon`.
- `vehicleType(chassisId: string, name: string): string` — exact sra2 key when the id equals one (`medium-drone` etc.), else keyword match, else `custom-vehicle`.

- [ ] **Step 1: `tools/make-specs.mjs`** reads a local sra2 checkout (`SRA2_DIR` env, default `../sra2x`) `src/packs/anarchy-items-en/specialization_*.json` and prints the `SPECS` array literal, sorted by slug. Run it once against `C:\Users\johnb\AppData\Local\Temp\sra2x` (sra2 v14.3.3, read-only) and paste the output into `scripts/lib/sra2.js` with a comment naming the sra2 version it came from. Also read the sra2 `WEAPON_TYPES` keys (`src/module/models/item-feat.ts`) and `src/module/config/vehicle-types.json` keys into `WEAPON_TYPES` and `VEHICLE_TYPES` constants.

- [ ] **Step 2: Failing tests** `test/sra2.test.js`

```js
import { describe, expect, test } from 'vitest'
import { featType, skillFor, specFor, SPECS, vehicleType, weaponType } from '../scripts/lib/sra2.js'

describe('sra2 tables', () => {
  test('skills', () => {
    expect(skillFor({ id: 'conjuring', name: 'Conjuring', attr: 'log' })).toMatchObject({ slug: 'conjuration', known: true })
    expect(skillFor({ id: 'network', name: 'Network', attr: 'cha' })).toMatchObject({ slug: 'networking', known: true })
    expect(skillFor({ id: 'ranged-weapons', name: 'Ranged Weapons', attr: 'agi' })).toMatchObject({ slug: 'ranged-weapons', attr: 'agility' })
    expect(skillFor({ id: 'made-up', name: 'Made Up', attr: 'log' })).toMatchObject({ slug: 'chummer-made-up', known: false })
  })
  test('specs by name, then a new slug', () => {
    expect(SPECS.length).toBe(91)
    expect(specFor('ranged-weapons', { id: 'ranged-weapons.pistols', name: 'Pistols', attr: 'agi' })).toMatchObject({ slug: 'spec_pistols', known: true })
    expect(specFor('networking', { id: 'custom:Fixers', name: 'Fixers', attr: 'cha', custom: true })).toMatchObject({ slug: 'spec_chummer-fixers', known: false })
  })
  test('feat types', () => {
    expect(['quality', 'bioware', 'adept', 'vehicle', 'something'].map(featType)).toEqual(['trait', 'cyberware', 'adept-power', 'equipment', 'equipment'])
  })
  test('weapon and vehicle types', () => {
    expect(weaponType('Made-up Heavy Pistol')).toBe('heavy-pistols')
    expect(weaponType('Made-up Katana')).toBe('long-weapons')
    expect(weaponType('Something odd')).toBe('custom-weapon')
    expect(vehicleType('medium-drone', 'x')).toBe('medium-drone')
    expect(vehicleType('crb.made-up-bike', 'Made-up Racing Motorcycle')).toBe('racing-motorcycle')
    expect(vehicleType('x', 'Odd thing')).toBe('custom-vehicle')
  })
})
```

- [ ] **Step 3:** Run — FAIL (no module). **Step 4:** Implement `scripts/lib/sra2.js` to the interface above. **Step 5:** Run — PASS. **Step 6:** Commit on branch `feat/0.1.0` (`git switch -c feat/0.1.0` before this task's first edit): `git commit -m "sra2 lookup tables (skills, specs, feat, weapon and vehicle types)"`.

---

### Task 3: Translate a runner (pure)

**Files:** Create `scripts/lib/translate.js`, `test/translate.test.js`
**Interfaces — Consumes:** Task 2 tables, `MODULE_ID`. **Produces:** `translateRunner(runner, { exportedAt, appVersion, sanitize = escapeText }): { actor, items, vehicles, textOnly }` where
- `actor` = `{ name, type: 'character', img: null, system, flags }` (img filled by Task 4 after the portrait upload),
- `items` = embedded item data (`metatype`, `skill`, `specialization`, `feat`) each with `flags[MODULE_ID].id`,
- `vehicles` = `[{ actor: { name, type: 'vehicle', system, flags }, items: [] }]`,
- `textOnly` = human-readable list of what became narrative text (for the report).

Mapping (spec §4.1; field names from sra2 v14.3.3 data models):
- `system.attributes.{strength…}` from `attributes` via `ATTR`; `system.resources.yens` = `nuyen.balance`; `system.keywords.keyword1..5`, `system.behaviors.behavior1..4` (dispositions), `system.catchphrases.catchphrase1..4` (cues); `system.bio.background` = sanitised `background`; `system.bio.notes` = sanitised `notes` + a "From Chummer" block (real name, metatype, level, Edge, Essence, lifestyle, initiative, the ledger lines "date · summary · amount", every amp effect that became text); `system.reference` = `Chummer Anarchy 2.0 <appVersion>`; `system.maxEssence` 6.
- metatype item: `{ name: metatype.name, type: 'metatype', system: { maxStrength: ranges.str[1], …, anarchyBonus: 0 } }`.
- one `skill` per skill: `{ name, type: 'skill', system: { rating, linkedAttribute, slug } }`; one `specialization` per spec: `{ name: 'Spec: ' + name, type: 'specialization', system: { linkedSkill: skill slug, linkedAttribute, slug } }`.
- amps (not the vehicle amp — its uid is a `vehicles[].uid`): `feat` with `featType`, `rating`, `essenceCost` = essence, `isBioware` for bioware, `rrList` from `rr` (`rrType` attribute/skill/specialization, `rrValue` min(3), `rrTarget` = ATTR key / skill slug / spec slug via the runner's own skills), `bonusLightDamage` / `bonusSevereDamage` from bonuses.light/serious, `bonusMentalThreshold`, `bonusMatrixThreshold`, `narrativeEffects` = every effect that isn't rr / wound / mental-armor / firewall-plus / armor-plus, as `{ text: name + (param/value/note), isNegative: category === 'negative' || id === 'negative', value: 0 }`, `description` = sanitised description + "Chummer: <typeName>, <source> p.<page>"; `system.reference` = `<source> p.<page>` when present; `cost` `'free-equipment'`.
- items: weapon → `feat` `featType 'weapon'`, `weaponType(name)`, `damageValue` = `weapon.dv`, `damageType 'physical'`, `meleeRange/shortRange/mediumRange/longRange` from `weapon.ranges`; armor → `feat` `'armor'`, `armorValue` = min(5, armor.value); gear → `equipment`; spell → `spell` (`spellType 'direct'`); complex-form → `complex-form`; `cost` `'free-equipment'` for starting gear else `'equipment'`; description footer "Chummer price: <price>¥".
- vehicles: `{ name, type: 'vehicle', system: { vehicleType, controlMode: 'rigged', customAutopilot: pilot, customStructure: body, customHandling: handling, customSpeed: speed, customArmor: armor, customWeaponMount: mount (text), isFlying: flying, description: 'Chummer: count ×' when count > 1 } }` with `flags[MODULE_ID] = { id: uid, runner: runner.id, exportedAt, appVersion }`.

- [ ] **Step 1: Failing tests** `test/translate.test.js` (against `samples/test-export.json` Made-Up Mara): attributes mapped; yens = balance; keywords/behaviors/catchphrases; one metatype item with maxAgility from ranges; skill slugs (`ranged-weapons`, `networking`); spec `spec_pistols` linked to `ranged-weapons` and `spec_chummer-fixers` linked to `networking`; the cyberware feat has `rrList [{ rrType:'attribute', rrValue:1, rrTarget:'agility' }]` and `bonusLightDamage 1`; the adept feat carries a narrative effect for its narrative effect; the weapon feat has `damageValue '5'` and ranges ok/ok/disadvantage/none; armor feat armorValue 2; the vehicle amp is NOT a feat and there is one vehicle actor with `customAutopilot` = pilot and `flags[MODULE_ID].runner` = the runner id; every item and the actor carry `flags[MODULE_ID].id`; `bio.notes` contains "From Chummer" and the ledger's "Creation finished"; descriptions are escaped (a description containing `<script>` comes out without a script element). Test Two translates with no amps, items or vehicles.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement `translate.js` (default `sanitize` escapes `& < > "` and wraps paragraphs in `<p>`; Task 4 passes Foundry's cleaner). **Step 4:** Run — PASS. **Step 5:** Commit `"Translate a Chummer runner to sra2 documents"`.

---

### Task 4: Apply to the world (Foundry) with a pure plan

**Files:** Create `scripts/lib/plan.js`, `test/plan.test.js`, `scripts/foundry/apply.js`
**Interfaces:**
- Pure: `defaultChoice(existing: { exportedAt } | null, incoming: { exportedAt }): 'create' | 'replace' | 'skip'` (none → create; older file → skip; else replace); `newVersionName(streetName, exportedAt): string` ("Made-Up Mara (2 Oct 2026)", en-GB day month year); `replaceUpdate(translatedActor): object` — the update object for Replace: only `name`, `img`, `prototypeToken.texture.src`, `flags`, and the Chummer-owned `system` paths (`attributes`, `resources.yens`, `maxEssence`, `keywords`, `behaviors`, `catchphrases`, `bio.background`, `bio.notes`, `reference`), never `system.damage`, `anarchySpent`, `tempAnarchy*`, `ownership`.
- Foundry: `findExisting(runnerId): Actor | null` (world actors with our flag id; newest `exportedAt`); `applyRunner(t, choice, { portrait, exportedAt }): Promise<{ actor, action }>` where choice is `replace | new | skip | create`:
  - ensures folders (`Folder.create({ name: 'Chummer Anarchy', type: 'Actor' })` if missing; vehicles subfolder under it);
  - uploads the portrait data URL: `FilePicker.implementation.createDirectory('data', 'worlds/<world>/chummer', {})` and `…/portraits` (ignore "exists"), then `FilePicker.implementation.upload('data', dir, file, {}, { notify: false })` with a `File` from the data URL named `<runnerId>-<exportedAt digits>.<png|jpg>`; sets `img` and `prototypeToken.texture.src`;
  - create/new: `Actor.create({ ...actor, folder, items })`, vehicles created first and their UUIDs written to `system.linkedVehicles`;
  - replace: `actor.update(replaceUpdate(t.actor))`; delete embedded items with our flag (`actor.deleteEmbeddedDocuments('Item', ids)`), create the new ones; vehicles matched by flags `{ runner, id }`: update-in-place the same way (keep their damage), create missing ones, leave others; `system.linkedVehicles` = our vehicles' UUIDs + any unflagged links already there.
  - Each runner in one try/catch: a failure rolls back what this runner created (delete created documents) and is reported; other runners continue.

- [ ] **Step 1: Failing tests** `test/plan.test.js`: `defaultChoice(null, …)` → create; older incoming → skip; same or newer → replace; `newVersionName('Made-Up Mara', '2026-10-02T09:15:00.000Z')` → `'Made-Up Mara (2 Oct 2026)'`; `replaceUpdate` contains `system.attributes` and `system.bio.notes` and has no `system.damage`, `system.anarchySpent`, `ownership` keys (check with flattened keys).
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement `plan.js`; then `scripts/foundry/apply.js` against the V14 API (check signatures at https://foundryvtt.com/api/v14/ for `FilePicker.implementation.upload`, `Actor.create`, `deleteEmbeddedDocuments`, `Folder.create`; follow sra2's own use where it has one). **Step 4:** Run — plan tests PASS (apply.js is covered by Quench in Task 6). **Step 5:** Commit `"Apply runners to the world: create, replace keeping play state, new version"`.

---

### Task 5: The import window and sidebar button

**Files:** Create `scripts/main.js`, `scripts/foundry/app.js`, `templates/import.hbs`, `styles/importer.css` (add `"styles": ["styles/importer.css"]` to module.json), `lang/en.json`
**Interfaces:** `ChummerImportApp extends HandlebarsApplicationMixin(ApplicationV2)` (id `chummer-anarchy2-import`, window title "Import from Chummer"); `main.js` registers it on `init`, adds the button on `renderActorDirectory` (and `changeSidebarTab`/`renderSidebarTab` for the actors tab, as sra2 does), GM only, labelled "Import from Chummer" with an icon.

Window flow (all strings in `lang/en.json`, key prefix `CA2I.`):
1. **Choose file** (`<input type="file" accept=".json,application/json">`) → `readExport(await file.text())`; refused → the reason in a `role="alert"` line.
2. Warnings: `game.system.id !== 'sra2'` → error, no import; `foundry.utils.isNewerVersion(game.system.version, TESTED_SRA2)` → "Tested with sra2 14.3.3; this world runs <v>. The import may miss new fields."
3. **Preview**: one row per runner — portrait thumbnail, street name, "exported <date>", a tick (all ticked); for runners already in the world: "In world: exported <date> · This file: exported <date> (newer|older|same)" and radio Replace / Add as new version / Skip preset by `defaultChoice`, the older case in red; **Apply to all** select (—, Replace, Add as new version, Skip).
4. **Import** → for each ticked runner `applyRunner`, progress text "Importing 2 of 5…".
5. **Report**: created / replaced / new version / skipped / failed (with the reason) per runner, plus "Turned into text:" lines from `textOnly`; buttons Close and "Open <name>" per created actor.

- [ ] **Step 1:** Write the window, template, CSS, strings, and the hook; sanitise descriptions with `foundry.utils.cleanHTML` if present (V14), else Foundry's `TextEditor.implementation` cleaner, passed into `translateRunner`.
- [ ] **Step 2:** `npx vitest run` still passes; load-check the modules parse: `node --check scripts/main.js scripts/foundry/app.js scripts/foundry/apply.js` (they import Foundry globals only at call time).
- [ ] **Step 3:** Commit `"Import window and sidebar button"`.

---

### Task 6: Quench tests, release workflow, 0.1.0

**Files:** Create `scripts/foundry/quench.js` (imported by `main.js` inside `Hooks.on('quenchReady', …)`), `.github/workflows/release.yml`; modify `README.md`, `CHANGELOG.md` (new)
**Quench batches** (registered with `quench.registerBatch('chummer-anarchy2-importer.<name>', fn, { displayName: 'Chummer Importer: <name>' })`, each creating everything in a throwaway folder "Chummer Importer tests" and deleting it in `after`):
- "file checks": `readExport` refusals show their reasons (no world change).
- "runners": import `samples/test-export.json` (fetched from `modules/chummer-anarchy2-importer/samples/test-export.json`) with create; assert the actor's attributes, embedded skill/spec slugs, the metatype caps (`actor.system.attributeMaxes` or the metatype item), rrList on the cyberware feat, the weapon's `damageValue` and ranges, the vehicle actor exists with our flags and is in `system.linkedVehicles`.
- "replace and new version": mark a wound (`system.damage.light[0] = true`), set ownership for a test user id, add an unflagged item; Replace with a copy of the sample whose `exportedAt` is later and one attribute changed → same actor id, attribute updated, wound still marked, ownership kept, unflagged item kept, flagged items rebuilt; Add as new version → a second actor named with the date; an older file → `defaultChoice` gives skip.
Include `samples/` in the release zip.

**release.yml**: on push of tags `v*`: `zip -r module.zip module.json scripts templates styles lang samples LICENSE README.md`, then `gh release upload` (or `softprops/action-gh-release`) the zip and `module.json`; fail if `module.json`'s version ≠ the tag.

- [ ] **Step 1:** Write `quench.js`, wire it in `main.js`, write `release.yml`, README "Tests in Foundry" (install Quench, open it, run the "Chummer Importer" batches), CHANGELOG 0.1.0.
- [ ] **Step 2:** `npx vitest run` passes; `node --check` all scripts.
- [ ] **Step 3:** Commit `"Quench tests, release workflow, 0.1.0"`, push `feat/0.1.0`, open a PR, CI green.
- [ ] **Step 4 (controller, after the final review):** merge, tag `v0.1.0`, confirm the release has `module.zip` and `module.json` and the manifest URL resolves (`curl -sL …/releases/latest/download/module.json` shows version 0.1.0). Then the owner installs it in Foundry by manifest URL and runs the Quench batches; their result is the in-Foundry verification.
