# Chummer Anarchy 2.0 v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static web app that creates and advances Shadowrun: Anarchy 2.0
characters from XML game data. It ships as a Docker image with an Unraid
template, and its first deployment is on tower04.

**Architecture:** A pure TypeScript rules engine (`src/engine`) over typed
catalogs parsed from XML (`public/data`). A React UI (`src/ui`) only renders
what the engine computes. A character is a creation snapshot plus an
append-only career event log, saved in localStorage and exported as
`.ca2.json`.

**Tech Stack:** Vite 6, React 19, TypeScript 5 (strict), Vitest 3 (jsdom
environment, which provides `DOMParser`), Playwright, `xmllint-wasm` for XSD
validation, nginx:alpine for the image.

**Spec:** `docs/superpowers/specs/2026-09-27-chummer-anarchy2-design.md`

## Global Constraints

- Anarchy **2.0** only. Never mix in Anarchy 1 rules.
- `ui/` never computes a rule. Costs, derived values and violations come from `src/engine/*` only.
- Game data is XML under `public/data/` (served at `/data/`). Overlays go in `public/custom/`, which is listed by `public/custom/index.xml`.
- Every data entry carries `id` (kebab-case), `source`, and `page`. Derived numbers are never stored in the data.
- Prices come from `pricing.xml`, never from constants in code.
- Nothing is dropped silently. An unknown reference is kept and flagged `ref.unknown`.
- Character file extension: `.ca2.json`. `formatVersion: 1`.
- Default container port: 8480 → 80. Appdata: `/mnt/user/appdata/chummer-anarchy2/custom`.
- Book source: `Downloads/Shadowrun Anachy 2.0\Shadowrun Anarchy 2.0 v1.8.md` (CRB). Printed page numbers appear as bare `**NN**` lines in that file.
- Commits: subject under 70 characters, a body explaining why, and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Path note:** the spec says `data/` and `custom/` at the repo root. They live
under `public/` so Vite serves them unchanged at `/data/` and `/custom/`. It's
the same content with a different parent folder.

---

## File Structure

```
public/data/schema/common.xsd         shared attribute groups (id/source/page)
public/data/schema/<kind>.xsd         one per kind
public/data/{levels,metatypes,attributes,skills,pricing,amptypes,ampeffects,
             packages,vehicles,gear,weapons,armor,spells,amps}.xml
public/custom/index.xml               overlay file list (empty by default)
public/samples/*.ca2.json             book characters (Lightning + 12 pregens)
src/model/types.ts                    Catalog + Character types (the shared vocabulary)
src/engine/load.ts                    fetch + parse XML → Catalog; overlay merge
src/engine/parse.ts                   XML element → typed record, one fn per kind
src/engine/price.ts                   attrCost, skillCost, price(build), packageGuide
src/engine/amps.ts                    ampRating, ampEssence, ampChangeCost
src/engine/derive.ts                  derive(catalog, character)
src/engine/validate.ts                validate(catalog, character)
src/engine/career.ts                  currentBuild, balance, makeEvent
src/engine/file.ts                    serialize, parseCharacterFile, migrate
src/engine/index.ts                   re-exports (the only import surface for ui/)
src/core/app/App.tsx  store.ts  library.ts  Library.tsx  SummaryPanel.tsx
src/ui/tabs/{Concept,Attributes,Skills,Amps,AmpBuilder,Gear,Review,Ledger,Data}.tsx
src/print/Sheet.tsx  sheet.css
tools/validate-data.mjs               XSD + reference-integrity check
tools/extract-*.mjs                   one-off extractors (kept for re-runs)
tests/engine/*.test.ts  tests/data/*.test.ts  tests/fixtures/*
e2e/smoke.spec.ts
docs/data-format.md  docs/book-discrepancies.md
Dockerfile  nginx.conf  .dockerignore  unraid/chummer-anarchy2.xml
.github/workflows/ci.yml
```

---

## Shared vocabulary (defined in Task 1, used everywhere)

```ts
// src/model/types.ts
export type AttrId = 'str' | 'agi' | 'wil' | 'log' | 'cha';
export const ATTRS: AttrId[] = ['str', 'agi', 'wil', 'log', 'cha'];
export interface Ref { id: string; source: string; page: number }

export interface Level extends Ref { name: string; nuyen: number; attrAtMax: number;
  skillCap: number; rrAttr: number; rrSkill: number; rrSpec: number }
export interface Metatype extends Ref { name: string; edge: number;
  ranges: Record<AttrId, [number, number]>; racialQuality: string }
export interface Attribute extends Ref { name: string; abbr: string }
export interface Spec { id: string; name: string; attr: AttrId }
export interface Skill extends Ref { name: string; attr: AttrId; alt?: AttrId;
  requires?: 'awakened' | 'cyberdeck'; specs: Spec[] }
export interface Pricing { attrPoint: number; attrLastPoint: number;
  skillLow: number; skillLowMax: number; skillHigh: number; spec: number;
  knowledge: number; ampPoint: number; equipment: number; weaponStandard: number;
  weaponSpecialist: number; armorPoint: number; spell: number; refundEffectRemoval: boolean }
export interface AmpType extends Ref { name: string; base: number; baseAfterFirst?: number;
  essence: number; requires?: string }
export interface AmpEffect extends Ref { name: string; category: string; rating: number;
  types: string[]; max?: number; requires?: string; excludes?: string;
  param?: 'skill' | 'spec' | 'attribute' | 'realm' | 'text' | 'value';
  gmApproval?: boolean }
export interface AmpTemplate extends Ref { name: string; type: string;
  effects: EffectPick[]; narrative: string; printedRating?: number; vehicle?: string }
export interface VehicleBase extends Ref { name: string; pilot: number; body: number;
  handling: number; speed: number; flyingSpeed?: number; armor: number; mount: string }
export interface Package extends Ref { level: string; archetype: string;
  attrPoints: number; attrAtMax: number; skillPoints: number; skillsAtSix: number;
  ampPoints: number; armor: number; standardWeapons: number; specialistWeapons: number;
  equipment: number; spells: number }
export type ItemKind = 'gear' | 'weapon' | 'armor' | 'spell';
export interface Item extends Ref { name: string; kind: ItemKind; specialist?: boolean;
  armor?: number; dv?: string; ranges?: string; category?: string; text: string }
export interface LoadError { file: string; line?: number; message: string }
export interface Catalog {
  levels: Map<string, Level>; metatypes: Map<string, Metatype>;
  attributes: Map<AttrId, Attribute>; skills: Map<string, Skill>; pricing: Pricing;
  ampTypes: Map<string, AmpType>; ampEffects: Map<string, AmpEffect>;
  amps: Map<string, AmpTemplate>; vehicles: Map<string, VehicleBase>;
  packages: Map<string, Package>; items: Map<string, Item>;
  files: { file: string; kind: string; entries: number; overlay: boolean }[];
  errors: LoadError[];
}

// character
export interface EffectPick { ref: string; param?: string; value?: number; note?: string }
export interface SkillEntry { id: string; rating: number; specs: string[] } // spec ids or "custom:Name"
export interface AmpEntry { uid: string; catalogId?: string; type: string; name: string;
  narrative: string; effects: EffectPick[]; linkedItem?: string; vehicle?: string;
  snapshot?: AmpTemplate }
export interface ItemEntry { uid: string; catalogId?: string; kind: ItemKind; name: string;
  specialist?: boolean; armor?: number; price?: number; snapshot?: Item }
export interface Build { attributes: Record<AttrId, number>; skills: SkillEntry[];
  knowledge: string[]; amps: AmpEntry[]; items: ItemEntry[];
  mainArmor?: string; altArmor?: string }
export type CareerEvent = { id: string; at: string } & (
  | { type: 'earn'; amount: number; run: string; date: string }
  | { type: 'advance'; path: string; from: number; to: number; cost: number }
  | { type: 'buy'; item: ItemEntry; cost: number }
  | { type: 'sell'; itemUid: string }
  | { type: 'amp-add'; amp: AmpEntry; cost: number }
  | { type: 'amp-modify'; ampUid: string; before: AmpEntry; after: AmpEntry; cost: number }
  | { type: 'spec-add'; skill: string; spec: string; cost: number }
  | { type: 'knowledge-add'; name: string; cost: number }
  | { type: 'note'; text: string }
  | { type: 'void'; eventId: string; reason: string });
export interface Override { code: string; path: string; note: string }
export interface Character { formatVersion: 1; id: string;
  identity: { name: string; streetName: string; metatype: string; portrait?: string;
    background: string; notes: string };
  narrative: { keywords: string[]; dispositions: string[]; cues: string[] };
  level: string; package: string; build: Build; finalizedAt?: string;
  career: CareerEvent[]; overrides: Override[]; lastExportedAt?: string; updatedAt: string }
export type Severity = 'error' | 'warning';
export interface Violation { code: string; severity: Severity; path: string;
  message: string; source?: string; page?: number; approved?: boolean }
```

---

# Phase 1 — Data and engine

### Task 1: Scaffold, types, CI

**Files:** Create `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/core/app/App.tsx` (placeholder "Chummer Anarchy 2.0"), `src/model/types.ts` (the full block above), `.github/workflows/ci.yml`, and `tests/engine/smoke.test.ts`.

- [ ] **Step 1:** `npm create vite@latest . -- --template react-ts` (keep the existing README and .gitignore). Then `npm i -D vitest jsdom @playwright/test xmllint-wasm`.
- [ ] **Step 2:** In `vite.config.ts`, add `test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] }` and `base: './'`, so the build works under any path.
- [ ] **Step 3:** Scripts: `"test": "vitest run"`, `"validate:data": "node tools/validate-data.mjs"`, `"e2e": "playwright test"`, `"check": "tsc -b && npm run validate:data && npm test"`.
- [ ] **Step 4:** Write `tests/engine/smoke.test.ts` asserting `new DOMParser()` exists and `ATTRS.length === 5`. Run `npm test`: it passes.
- [ ] **Step 5:** `ci.yml`: on push and PR, run Node 22, `npm ci`, `npm run check`, `npx playwright install --with-deps chromium`, `npm run build`, `npm run e2e`.
- [ ] **Step 6:** Commit `Scaffold Vite React TS app, shared types, CI`.

### Task 2: Rules data files, XSDs, validator

**Files:** Create the schema files `public/data/schema/{common,levels,metatypes,attributes,skills,pricing,amptypes,ampeffects,packages,vehicles}.xsd`, the matching `.xml` data files, `tools/validate-data.mjs`, and `docs/data-format.md`.

**Produces:** the files the Task 4 loader parses. Every file has the root `<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="K" version="1">`. Child elements are unqualified (`elementFormDefault="unqualified"`).

Content: the values come from the core rulebook; see docs/data-format.md, "Core files" (the CRB import builds them,
`importer/recipes/crb_core.py`). Ids are the app's vocabulary: levels, metatypes, attributes and skills by name, specs
`<skill>.<spec-kebab>`, packages `<level>-<archetype>`; amp effects carry their amp types, max, requires/excludes and param.

- [ ] **Step 1:** Write `common.xsd` defining `attributeGroup name="ref"` (`id` xs:ID-like pattern `[a-z0-9][a-z0-9.-]*`, `source` xs:string required, `page` xs:positiveInteger required), plus one XSD per kind that includes it. Unknown attributes are rejected.
- [ ] **Step 2:** Write the 9 XML files above.
- [ ] **Step 3:** Write `tools/validate-data.mjs`:
  1. For each `public/data/*.xml` and each file listed in `public/custom/index.xml` (plus `tests/fixtures/custom-example/*.xml`), read `kind` from the root, then run `validateXML({ xml, schema: [common, kindXsd] })` from `xmllint-wasm`.
  2. Collect every `id`, then check that every `ref=`, `requires=`, `excludes=`, `type=`, `level=` and `vehicle=` resolves.
  3. Print `file:line message` and `process.exit(1)` on any error.
- [ ] **Step 4:** Run `npm run validate:data`. Expected: `OK 9 files`. Then break one `ref` on purpose: it must fail. Revert.
- [ ] **Step 5:** `docs/data-format.md`: the root element, common attributes, each kind's elements and attributes (copy the tables above), overlay rules (spec §4.3), and a worked custom example.
- [ ] **Step 6:** Commit `Rules data as XML with XSD schemas and validator`.

### Task 3: Catalog content: gear, weapons, armor, spells, prebuilt amps

**Files:** Create `tools/extract-crb.mjs`, `tools/extract-dhsa.mjs`, the schemas `public/data/schema/{items,amps}.xsd`, the data files `public/data/{gear,weapons,armor,spells,amps}.xml`, and `tests/data/catalog.test.ts`.

**Sources:**
- CRB markdown sections: *Weapons* (line ~6651), *Weapon Amps* (~6731), *Armor* (~6862), *Armor Amps* (~6901), *Drugs/Toxins* (~6923–7090), *Cyberware* (~7093–7360), *Bioware* (~7360), *Medkits* (~7406), *Contacts* (~7560), *Lifestyle* (~7638), *Mentor spirits* (~7906), spells (~8174–8394), foci (~8599), *Adept powers* (~8673), cyberdecks and programs (~9437), drones and vehicles (~10405+), and the infiltration and con-artist gear lists (~6441, ~6557).
- DHSA PDF: extract with PyMuPDF (`python -c "import fitz"` is available). Red entries are the additions. Record `source="DHSA"`.

**Format:**
- `gear.xml`, `weapons.xml`, `armor.xml` and `spells.xml` all use `<item kind="…">` elements (`kind` = `gear|weapon|armor|spell`). Attributes: `id name source page`, plus `specialist="true"` on specialist weapons, `armor="N"` on armor, and `dv`, `ranges`, `category` where the book gives them. The child `<text>` is a one-line summary written by us.
- `amps.xml` uses `<amp id type source page printedRating="N"><name/><effect ref param? value? note?/>…<narrative/></amp>`. Decompose each book amp into effects from `ampeffects.xml`. A book line that is purely descriptive becomes a `narrative` effect only when the book counts it in the rating; otherwise it goes in `<narrative>` text. `printedRating` is the book's number, kept only for the audit.

- [ ] **Step 1:** Write `extract-crb.mjs`. It slices each section by line range, parses the markdown tables and bullet lists (the lines are `|…|` rows or `**Name** (Type, cost)` bullets), and prints a draft XML to stdout. Run it and redirect to the files.
- [ ] **Step 2:** Write `extract-dhsa.mjs` (spawning a Python PyMuPDF helper), which drafts the additional amps.
- [ ] **Step 3:** Hand-review every file against the source. Fix names, specialist flags and armor values, and decompose the amps. Unmapped oddities go in `docs/book-discrepancies.md`.
- [ ] **Step 4:** Write `tests/data/catalog.test.ts`. It loads each XML with `DOMParser` and asserts:
  - ≥ 1 entry per kind;
  - every weapon has `specialist` set to true or absent;
  - every armor has `armor ≥ 1`;
  - every amp's `type` exists in amptypes;
  - these ids exist: `smartlink` (cyberware, rr-skill ranged-weapons), `wired-reflexes` (initiative), `armor-jacket` (armor 3), `ares-predator` (weapon), `heal`, `invisibility`, `detect-enemies`, and `lightning-bolt` (spells).
- [ ] **Step 5:** `npm run validate:data && npm test`: both pass.
- [ ] **Step 6:** Commit `Catalog content from CRB and Daegann's expanded amp list`.

### Task 4: Loader and overlay merge

**Files:** Create `src/engine/parse.ts`, `src/engine/load.ts`, `tests/engine/load.test.ts`, and `tests/fixtures/custom-example/{index.xml,levels.xml}`.

**Produces:**
- `parseDataFile(xml: string, file: string, overlay: boolean): { kind: string; entries: Element[]; removals: string[]; error?: LoadError }`
- `buildCatalog(files: { file: string; xml: string; overlay: boolean }[]): Catalog`. It is pure, and `loadCatalog(baseUrl = './')` fetches the data and calls it.

- [ ] **Step 1:** Write the failing tests:
  ```ts
  import { readFileSync, readdirSync } from 'node:fs';
  import { buildCatalog } from '../../src/engine/load';
  const base = readdirSync('public/data').filter(f => f.endsWith('.xml'))
    .map(f => ({ file: f, xml: readFileSync(`public/data/${f}`, 'utf8'), overlay: false }));
  test('base catalog loads without errors', () => {
    const c = buildCatalog(base);
    expect(c.errors).toEqual([]);
    expect(c.levels.get('runner')!.nuyen).toBe(/* the runner level's budget */);
    expect(c.metatypes.get('troll')!.ranges.str).toEqual(/* the troll's STR range */);
    expect(c.skills.size).toBe(14);
    expect(c.pricing.attrLastPoint).toBe(/* the last attribute point's price */);
  });
  test('overlay replaces, removes, adds by id', () => {
    const ov = `<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="levels" version="1">
      <level id="runner" nuyen="400000" attrAtMax="2" skillCap="6" rrAttr="2" rrSkill="2" rrSpec="3" source="CUSTOM" page="1"><name>Runner+</name></level>
      <level id="ganger" remove="true" source="CUSTOM" page="1"/>
      <level id="legend" nuyen="600000" attrAtMax="3" skillCap="7" rrAttr="2" rrSkill="2" rrSpec="3" source="CUSTOM" page="1"><name>Legend</name></level>
    </ca2:data>`;
    const c = buildCatalog([...base, { file: 'levels.xml', xml: ov, overlay: true }]);
    expect(c.levels.get('runner')!.nuyen).toBe(400000);
    expect(c.levels.has('ganger')).toBe(false);
    expect(c.levels.get('legend')!.skillCap).toBe(7);
  });
  test('bad overlay is skipped and reported, base still loads', () => {
    const c = buildCatalog([...base, { file: 'broken.xml', xml: '<ca2:data', overlay: true }]);
    expect(c.errors[0].file).toBe('broken.xml');
    expect(c.levels.get('runner')!.nuyen).toBe(/* the runner level's budget */);
  });
  ```
- [ ] **Step 2:** `npm test -- load`: it fails because the module is missing.
- [ ] **Step 3:** Implement:
  - `parse.ts`: one `toX(el: Element): X` function per kind. Read attributes with `Number()`/`String()`; `types` is split on whitespace. A parse error is detected by `doc.querySelector('parsererror')`, and the line comes from its text.
  - `load.ts`:
    1. Process base files first, then overlays in `index.xml` order.
    2. For each file, `map.set(id, toX(el))`, or `map.delete(id)` when `remove="true"`.
    3. `items` gathers gear/weapons/armor/spells into one map. The `pricing` kind takes its single element.
    4. `loadCatalog` fetches `data/<name>.xml` for the 14 known names, then `custom/index.xml` (a missing index file is OK), then each `<file href>` it lists.
- [ ] **Step 4:** `npm test -- load`: it passes.
- [ ] **Step 5:** Commit `XML catalog loader with id-based overlay merge`.

### Task 5: Pricing and package guides

**Files:** Create `src/engine/price.ts` and `tests/engine/price.test.ts`.

**Produces:**
- `attrCost(p: Pricing, from: number, to: number, max: number): number`
- `skillCost(p: Pricing, from: number, to: number): number`
- `itemCost(p: Pricing, i: ItemEntry): number`
- `price(c: Catalog, ch: Character): PriceBreakdown`, where
  `PriceBreakdown = { attributes, skills, amps, gear, spells, total, budget, remaining }`. All are nuyen. `budget` = the level's nuyen.
- `packageGuide(c: Catalog, pkgId: string): Omit<PriceBreakdown,'total'|'budget'|'remaining'>`

Rules:
- An attribute point equal to the metatype max costs `attrLastPoint`; every other point costs `attrPoint`, counting from 0.
- A skill point ≤ `skillLowMax` costs `skillLow`, else `skillHigh`.
- Each spec costs `spec`, and each knowledge skill costs `knowledge`.
- An amp costs `ampRating × ampPoint` (the rating comes from Task 6).
- Items: armor costs `armor × armorPoint`; a weapon costs `specialist ? weaponSpecialist : weaponStandard`; gear costs `equipment`; a spell costs `spell`. `ItemEntry.price` overrides all of these (the GM-set price).
- Commlink and fake SIN are not items (free), so they're simply not in the build.
- The package guide:
  - attributes = `attrPoints·attrPoint + attrAtMax·(attrLastPoint−attrPoint)`
  - skills = `skillPoints·skillLow + skillsAtSix·(skillHigh−skillLow)`
  - amps = `ampPoints·ampPoint`
  - gear = `armor·armorPoint + standardWeapons·weaponStandard + specialistWeapons·weaponSpecialist + equipment·equipment`
  - spells = `spells·spell`

- [ ] **Step 1:** Write the failing tests:
  ```ts
  // values come from the core rulebook; see docs/data-format.md, core data
  test('attribute last point surcharge', () => { /* the point reaching the metatype max costs attrLastPoint */ });
  test('skill breakpoint at skillLowMax', () => { /* skillLow up to skillLowMax, then skillHigh */ });
  test.each(['ganger','runner','prime'].flatMap(l =>
    ['balanced','magician','fighter'].map(a => `${l}-${a}`)))
  ('%s package totals its level budget', id => {
    const g = packageGuide(cat, id); const lvl = cat.levels.get(cat.packages.get(id)!.level)!;
    expect(g.attributes + g.skills + g.amps + g.gear + g.spells).toBe(lvl.nuyen);
  });
  test('the book's creation example prices to exactly its level budget', () => { /* remaining 0 */ });
  ```
  `P` = `cat.pricing`; `cat` = `buildCatalog(base)`, via a shared helper `tests/helpers.ts` exporting `cat` and `base`.
- [ ] **Step 2:** Create the creation example's sample runner (CRB p.85) from the book: its attributes, skills, amps, items and narrative.
- [ ] **Step 3:** Run it: fails. Step 4: implement `price.ts` (with a stub `ampRating` import from Task 6; do Task 6 first if you're executing sequentially). Step 5: it passes.
- [ ] **Step 6:** Commit `Nuyen pricing and package guide budgets`.

### Task 6: Amp rating, Essence, change cost

**Files:** Create `src/engine/amps.ts` and `tests/engine/amps.test.ts`.

**Produces:**
- `ampRating(c: Catalog, amp: AmpEntry, ctx: { isFirstQuality: boolean }): number`
- `ampEssence(c: Catalog, amp: AmpEntry): number`
- `ampChangeCost(c: Catalog, before: AmpEntry, after: AmpEntry, ctx): number`
- `firstQualityUid(build: Build): string | undefined`

Rules:
- Rating = type base (for quality, 0 if it's the first quality amp in the build order, otherwise `baseAfterFirst`) plus the sum of the effect ratings. `negative` contributes `−value`. `rcc` contributes `1 × (value ?? 1)`.
- Essence = the type's essence, per amp.
- Change cost = `max(0, rating(after) − rating(before)) × ampPoint`. When the rating goes down and `refundEffectRemoval` is true, it's negative.

- [ ] **Step 1:** Failing tests:
  - cyberware + rr-skill ranged-weapons → base + the effect's rating, cost × ampPoint.
  - An upgrade from rr-spec to rr-skill costs the rating difference × ampPoint.
  - The creation example's and a pregen's amps rate as printed; the second quality gets baseAfterFirst; Essence per type.
  (values come from the core rulebook; see docs/data-format.md, core data)
- [ ] **Steps 2–5:** Run it (fails), implement, run it (passes), then commit `Shadow Amp rating, Essence and change cost`.

### Task 7: Derived values

**Files:** Create `src/engine/derive.ts` and `tests/engine/derive.test.ts`.

**Produces:** `derive(c: Catalog, ch: Character): Derived` where

```ts
interface Derived {
  build: Build; // current (baseline + career)
  edge: number;
  essence: number;
  essenceEffects: string[];
  monitor: { light: number; serious: number; incap: 1 };
  armor: { none: number; main: number; alt: number };
  thresholds: { physicalNone: [number, number, number]; physicalMain: [number, number, number];
    physicalAlt: [number, number, number]; mental: [number, number, number];
    matrix?: [number, number, number] };
  pools: { skill: string; spec?: string; attr: AttrId; dp: number; rr: number }[];
  rrAttr: Record<AttrId, number>;
  initiative?: { level: number; source: string };
  knowledge: string[];
  awakened: { perception: boolean; projection: boolean; sorcery: boolean;
    conjuring: boolean; adept: boolean };
  firewall?: number;
  attack?: number;
}
```

Rules:
- Armor from an item = its `armor`, plus `armor-plus` from amps (quality/cyber/bio/adept amps always apply; an equipment amp applies only to its linked item).
- Physical thresholds = STR + armor, +3, +6. Mental = WIL + protection (0 in v1, +3, +6). Matrix = firewall (the cyberdeck amp's base 1 + firewall-plus).
- The monitor starts at 2 light / 1 serious, plus `wound-light`/`wound-serious` (max +1 each).
- Pools:
  - one row per skill with rating > 0, using its default attr, `dp = rating + attr`;
  - one row per spec with `dp = rating + 2 + specAttr`;
  - an extra row with the `alt` attr for skills that have one.
- RR sums the rr-* effects matching that skill/spec/attr (an rr-skill also counts for all of its specs), capped at 3.
- Initiative is the highest completed init chain among amps. No stacking.
- Essence effects follow the CRB p.60 tiers.
- Knowledge = knowledge + keywords + the names of skills with rating ≥ 4.

- [ ] **Step 1:** Failing tests:
  - Ork STR 4, main armor 2 → physicalMain `[6, 9, 12]` (CRB p.70 example).
  - Hercules (dwarf STR 2, WIL 2, AGI 3, CHA 4, LOG 3; lined coat 3; clothes 1): physicalNone `[2,5,8]`, physicalMain `[5,8,11]`, physicalAlt `[3,6,9]`, mental `[2,5,8]`.
  - Hercules pools: athletics/str 5, athletics.ranged-defense/agi 8, influence.bluff/cha 11, ranged-weapons.pistols/agi 10.
  - Two amps with init-1 and init-1..3 → initiative level 3 (no sum).
  - Essence 6 − 2 cyber − 1 bio = 3.5, which triggers the magic −1 (≤5) and healing −1 (≤4) tiers.
- [ ] **Steps 2–5:** fail / implement / pass / commit `Derived values: thresholds, pools, RR, Essence, initiative`.

### Task 8: Validation

**Files:** Create `src/engine/validate.ts` and `tests/engine/validate.test.ts`.

**Produces:** `validate(c: Catalog, ch: Character): Violation[]`. Each violation gets `approved: true` when `ch.overrides` has the same `code` and `path`. `canFinalize(v: Violation[]): boolean` = no unapproved error.

The codes (all from spec §5.6). Paths look like `attributes.str`, `skills.stealth`, `amps.<uid>.effects.<i>`, `items.<uid>`.

| code | severity | condition |
|---|---|---|
| budget.over | error | `price.remaining < 0` (creation only; in career, the balance < 0) |
| attr.range | error | an attribute is outside the metatype [min, max] |
| attr.maxCount | error | the count of attributes at max exceeds `level.attrAtMax` (creation only) |
| skill.cap | error | a rating is above `level.skillCap` (creation), or above 8 (any time) |
| spec.noSkill | error | a spec on a skill with rating 0 |
| rr.cap | error | a derived RR is above the level cap for attr/skill/spec (creation), or above 3 (any time) |
| amp.effectMax | error | an effect's count in one amp exceeds `max` |
| amp.requires | error | a `requires` effect is missing, or an `excludes` effect is present |
| amp.typeIllegal | error | the effect's `types` doesn't include the amp's type |
| amp.negative | error | any `negative` effect (needs a GM override) |
| amp.qualityAfterCreation | error | an `amp-add` event of type quality in career |
| amp.noItem | error | an equipment amp without a `linkedItem` present in the items |
| adept.requiresAwakened | error | an adept amp without the `awk-adept` option |
| skill.requiresAwakened | error | conjuring>0 without awk-conjuring, or sorcery>0 without awk-sorcery |
| skill.requiresDeck | error | cracking>0 without a cyberdeck amp |
| essence.dead | error | essence ≤ 0 |
| vehicle.armor | error | vehicle-armor count exceeds the chassis Body |
| ref.unknown | warning | a catalogId, skill, spec or effect ref not in the catalog |
| narrative.count | warning | keywords ≠ 5, dispositions ≠ 4, or cues ≠ 4 |
| runner.basics | warning | athletics, stealth, perception, influence or network below 2 |
| custom.content | warning | a custom spec or an item with a GM `price` |

- [ ] **Step 1:** One failing test per code. Build each from a `blankCharacter()` helper plus one change, and assert the code appears exactly once. Also test that Lightning has zero errors, and that an override flips `approved`.
- [ ] **Steps 2–5:** fail / implement / pass / commit `Rule validation with GM overrides`.

### Task 9: Career events

**Files:** Create `src/engine/career.ts` and `tests/engine/career.test.ts`.

**Produces:**
- `currentBuild(ch): Build` — applies the non-voided events to a deep copy of `ch.build`.
- `balance(c, ch): number` — creation remaining (at finalize) + Σ earn − Σ event costs.
- `makeAdvance(c, ch, path, to): CareerEvent`
- `makeAmpModify(c, ch, uid, after)`, `makeAmpAdd`, `makeBuy`, `makeSpec`, `makeKnowledge`
- `voidEvent(ch, id, reason)`
- `finalize(ch): Character`

`advance` handles paths `attributes.<id>` (cost via attrCost with the metatype max) and `skills.<id>` (cost via skillCost). Level caps don't apply after finalize.

- [ ] **Step 1:** Failing tests:
  - Finalize Lightning → balance 0.
  - `earn` 50,000 → balance 50,000.
  - Advance Stealth 5→6 costs skillHigh → balance 50,000 − skillHigh, and `currentBuild` shows stealth 6.
  - Void the advance → balance 50,000 and stealth 5.
  - Amp-modify smartlink rr-spec→rr-skill costs the rating difference × ampPoint.
  - Selling an item removes it from `currentBuild` and costs 0.
  - A second void of the same event is rejected (it throws).
- [ ] **Steps 2–5:** fail / implement / pass / commit `Career event log: earn, advance, amp changes, void`.

### Task 10: Character file I/O

**Files:** Create `src/engine/file.ts` and `tests/engine/file.test.ts`.

**Produces:**
- `blankCharacter(level = 'runner', metatype = 'human'): Character`
- `serialize(ch): string` — pretty-printed JSON.
- `parseCharacterFile(text): { ok: true; character: Character } | { ok: false; reason: string }` — checks `formatVersion`, the required fields and their types. It never throws.
- `migrate(raw): Character` — a v1 identity function; the registry is ready for later versions.
- `snapshotEntries(c, ch)` — fills `snapshot` on catalog-backed entries.

- [ ] **Step 1:** Failing tests:
  - Round-trip of Lightning is equal.
  - `parseCharacterFile('{')` → ok false, with a reason containing "JSON".
  - Missing `build` → ok false.
  - `formatVersion: 99` → ok false, "newer version".
  - After `snapshotEntries`, removing the catalog entry and re-deriving keeps the item and raises `ref.unknown`.
- [ ] **Steps 2–5:** fail / implement / pass / commit `Character file serialize, import checks, snapshots`.

### Task 11: Book characters as fixtures and discrepancy audit

**Files:** Create `public/samples/{hercules,wild-jane,trash,gambit,charon,luna,casper,echo,drakk,white-rabbit,mictlan,capitan}.ca2.json`, `public/samples/index.json` (the list), `tests/engine/pregens.test.ts`, and `docs/book-discrepancies.md`.

- [ ] **Step 1:** For each pregen (CRB p.88–113), encode:
  - its attributes, read from the attribute block, or back-computed from the printed dice pools (DP − rating) when the block is unreadable;
  - skills and specs;
  - amps decomposed into effects;
  - weapons, armor and gear as items;
  - keywords, dispositions and cues.
  Level: runner.
- [ ] **Step 2:** `pregens.test.ts`, for each sample:
  - (a) `validate` has no `ref.unknown`;
  - (b) every amp's computed rating equals its printed rating, **unless** the amp is listed in `docs/book-discrepancies.md` (the test parses the `| sample | amp | printed | computed | why |` table);
  - (c) every printed dice pool equals the derived pool;
  - (d) the printed thresholds equal the derived ones;
  - (e) the total price is recorded in the report, but isn't asserted, since the book doesn't state that pregens are exactly on budget.
- [ ] **Step 3:** Run it, then investigate every mismatch in the source text. Either fix the fixture (our encoding error) or add a discrepancy row (a book error, e.g. Hercules' Well-Stocked Closet: printed 2, computed 3 = equipment 0 + armor-plus 1 + rr-spec 2).
- [ ] **Step 4:** All pass. Commit `Book pregens as fixtures; discrepancy audit`.

# Phase 2 — App shell and creation

UI tasks are verified with Vitest component tests only where a rule-like UI
behavior exists. Everything else is verified by the Playwright smoke test
(Task 20) and by driving the app in the browser pane (Task 22). Styling
uses plain CSS with custom-property tokens, a dark-first neon-on-graphite
theme with a light option. It must work at 1280px and down to 768px.

### Task 12: Store, library, app frame

**Files:** Create `src/ui/store.ts`, `src/ui/library.ts`, `src/core/app/App.tsx`, `src/ui/Library.tsx`, `src/core/ui-kit/app.css`, and `tests/ui/library.test.ts`.

**Produces:**
- `library.ts`: `listCharacters(): Character[]`, `saveCharacter(ch)`, `deleteCharacter(id)`, `needsExportReminder(ch, now)`. Each wraps `localStorage` key `ca2.library.v1` in try/catch. On failure it returns `{ ok: false }` and the UI shows the "export now" banner.
- `store.ts`: `useCharacter()`, which is a `useReducer` with the actions `set(path, value)`, `replace(ch)`, `undo`, `redo` (a snapshot stack, capped at 100, in creation mode only), and `appendEvent(ev)`. It autosaves with a 500 ms debounce.
- `App.tsx`: loads the catalog once (with a loading/error screen). Routing via the URL hash: `#/` is the Library, `#/c/<id>/<tab>`.
- `Library.tsx`: the cards, New (level + metatype picker), Import (file input `.ca2.json`, via `parseCharacterFile`, showing the reason on failure), Export (a Blob download named `<streetName||name>.ca2.json` that sets `lastExportedAt`), Duplicate, Delete (confirm), and **Load book samples** (fetches `samples/index.json`, then imports each file, skipping ids already present).

- [ ] **Step 1:** Tests for `library.ts`, with localStorage mocked by jsdom: save/list/delete round-trip; `needsExportReminder` is true when `updatedAt − lastExportedAt > 7 days`; a thrown `setItem` returns `{ ok: false }`.
- [ ] **Step 2:** Implement, then `npm run dev`, then check by hand: create, reload (it persists), import Lightning from `public/samples`, export.
- [ ] **Step 3:** Commit `App shell, character library, import/export`.

### Task 13: Summary panel and Concept tab

**Files:** Create `src/ui/SummaryPanel.tsx` and `src/ui/tabs/Concept.tsx`.

- `SummaryPanel` reads `price()`, `derive()`, `validate()` and `balance()` (in career mode). It shows:
  - nuyen spent/remaining (red when negative);
  - per-category actual against the package guide (a bar per category; hidden for Free);
  - Essence, Edge, the monitor boxes, and the three physical threshold rows plus mental;
  - errors and warnings as a count that links to `#/c/<id>/review`.
- `Concept`:
  - name, street name, metatype select (shows the ranges; changing it re-validates, never auto-edits);
  - level select, package select (filtered by level, plus Free);
  - portrait upload, downscaled to a 256px JPEG data URL through a canvas;
  - background and notes;
  - 5/4/4 text inputs for keywords, dispositions and cues, with the hints from CRB p.50–51 as placeholders.
- [ ] **Step 1:** Implement both. Check: switching the package changes the guide bars, and switching the level changes the budget.
- [ ] **Step 2:** Commit `Summary panel and Concept tab`.

### Task 14: Attributes and Skills tabs

**Files:** Create `src/ui/tabs/Attributes.tsx` and `src/ui/tabs/Skills.tsx`.

- Attributes: a row per attribute with − / value / +, `min–max`, and "next point: <price>" (from `attrCost(p, v, v+1, max)`). There's an at-max counter "1 / 1". Buttons are disabled only at the hard metatype bounds; level-cap problems show as violations, not disabled buttons.
- Skills: the 14 rows with a rating stepper (0–8), the linked attribute, the DP and RR from `derive().pools`, and "next point" cost. Spec chips come from `skill.specs`, plus "custom…" (stored as `custom:Name`). The knowledge list has add and remove, with a note listing the automatic knowledge from `derive().knowledge`.
- [ ] **Step 1:** Implement. Check with the Lightning sample: the DPs match the engine tests.
- [ ] **Step 2:** Commit `Attributes and Skills tabs`.

### Task 15: Gear and Spells tab

**Files:** Create `src/ui/tabs/Gear.tsx`.

- Four sections: Armor, Weapons, Equipment and Spells. Each has a catalog picker (searchable by name/category, showing source+page and the one-line text) and "Custom…" (name, kind, specialist flag, armor, GM price).
- Choose main armor and alternate armor.
- An "Convert to amp" button on gear/weapons creates an equipment `AmpEntry` with `linkedItem`, then opens the Amp Builder (Task 17; until then it just adds the amp).
- Vehicles and drones are **not** items. They're vehicle amps (Task 17).
- [ ] **Step 1:** Implement. Check: adding armor costs its points × armorPoint in the panel, and a specialist weapon costs weaponSpecialist.
- [ ] **Step 2:** Commit `Gear and Spells tab`.

### Task 16: Review tab and Finalize

**Files:** Create `src/ui/tabs/Review.tsx`.

- Lists `validate()`, grouped errors first. Each row shows the message, "CRB p.N", a **Fix** link (navigates to the tab that owns the path), and **GM approve** (a note prompt, which adds an `Override`) or **Revoke**.
- **Finalize** is enabled when `canFinalize`. It confirms, then calls `finalize(ch)`, which switches the app to career mode.
- [ ] **Step 1:** Implement. Check: a Ganger with an attribute at max shows `attr.maxCount`; approving it enables Finalize.
- [ ] **Step 2:** Commit `Review tab with GM overrides and Finalize`.

# Phase 3 — Amp Builder

### Task 17: Amps tab and Amp Builder dialog

**Files:** Create `src/ui/tabs/Amps.tsx`, `src/ui/tabs/AmpBuilder.tsx`, and `tests/ui/ampBuilder.test.ts`.

**Consumes:** `ampRating`, `ampEssence`, `ampChangeCost`, and `validate`, filtered to `amps.<uid>`.

**Produces:** `legalEffects(c, amp): { effect: AmpEffect; allowed: boolean; reason?: string }[]`, a pure helper in `src/engine/amps.ts` (engine, because it's a rule). `allowed` is false when:
- the type isn't in `effect.types`;
- the count is ≥ `max`;
- `requires` is unmet;
- `excludes` is present.

- Amps tab: grouped by type, with Contacts as its own sub-tab. Each row shows name, type, rating, cost, Essence, a one-line list of its effects, and Edit / Remove.
- Builder dialog:
  1. Start from a catalog amp (searchable, filterable by type) or a bare type. Vehicle amps also pick a chassis.
  2. Name and narrative.
  3. The effect picker from `legalEffects`; disabled entries show their reason.
  4. Each added effect row has a param input: a skill select, a spec select, an attribute select, a realm select, text, or a value (1–5).
  5. A live footer: "Rating N · N × amp point price · Essence −X". In career mode it shows "Change: +N rating · Z¥".
  6. Save runs `validate` on just that amp. Errors are shown inline, but saving is still allowed (they become violations).
- [ ] **Step 1:** Failing tests for `legalEffects`:
  - awk options only on the awakened type;
  - init-2 disabled until init-1 is present;
  - rr-skill disabled after one is present;
  - awk-astral-projection disabled when awk-astral-perception is present.
- [ ] **Step 2:** Implement the helper and pass the tests. Then implement the UI. Check: rebuild Lightning's Cat mentor from a bare quality, which shows rating 6 and 30,000¥.
- [ ] **Step 3:** Commit `Shadow Amp builder`.

# Phase 4 — Career

### Task 18: Career mode and Ledger

**Files:** Modify `src/ui/tabs/{Attributes,Skills,Gear,Amps}.tsx` and `src/core/app/App.tsx`. Create `src/ui/tabs/Ledger.tsx`.

- When `ch.finalizedAt` is set, every edit becomes a `make*` event behind a confirm dialog ("Stealth 5 → 6 · <price> · balance after: <balance>"). Direct edits of `build` are disabled. Undo/redo are hidden, and Void on the ledger replaces them.
- Balance < 0 after an event is allowed but shown red (it raises `budget.over`).
- Ledger tab: an "Earn" form (amount, run name, date defaulting to today), a history table (date, description, ±nuyen, running balance), voided rows struck through, and Void (with a reason prompt).
- [ ] **Step 1:** Implement. Check with Lightning: finalize, earn 50,000, raise Stealth, void it, and the balance returns to 50,000.
- [ ] **Step 2:** Commit `Career mode with ledger and voidable events`.

# Phase 5 — Print, Data screen, smoke test

### Task 19: Print sheet

**Files:** Create `src/print/Sheet.tsx` and `src/print/sheet.css`. Add route `#/c/<id>/print`.

- The sections, in the official sheet's order:
  1. Header with street name
  2. Attributes plus Edge
  3. Wounds: monitor boxes and the thresholds table (No armor / Main / Alternate / Mental, plus Matrix when present)
  4. The RR × risk-level table (a static copy of the CRB table: RR 0–3 × Low/Normal/High/Extreme)
  5. Skills table (rating, +ATT., = DP, RR) with spec rows
  6. Knowledge skills
  7. Essence and cancelled hits
  8. Shadow Amps (name/type, effects summary, rating)
  9. Weapons and spells (type, DV, ranges)
  10. Equipment
  11. Keywords, dispositions and cues
  12. Nuyen
- `@media print`: A4/Letter safe, no app chrome, `break-inside: avoid` on sections. There's a "Print / Save as PDF" button that calls `window.print()`.
- [ ] **Step 1:** Implement. Check with Hercules: the sheet matches the CRB p.88 values.
- [ ] **Step 2:** Commit `Printable character sheet`.

### Task 20: Data screen and Playwright smoke

**Files:** Create `src/ui/tabs/Data.tsx`, `playwright.config.ts`, and `e2e/smoke.spec.ts`.

- Data screen: a table of `catalog.files` (file, kind, entries, base/overlay) and `catalog.errors` (file:line message), plus a link to `docs/data-format.md` on GitHub.
- `playwright.config.ts`: `webServer: { command: 'npm run preview -- --port 4173', port: 4173 }`.
- Smoke flow:
  1. New Runner human.
  2. Set all 5 attributes to 3 and Athletics, Stealth, Perception, Influence and Network to 2.
  3. Add an armor jacket.
  4. Approve any warnings.
  5. Finalize.
  6. Ledger: earn 50,000.
  7. Skills: Stealth 2→3 (confirm).
  8. Assert the balance text shows the correct value computed in the test.
  9. Open print, and assert the headings "Skills", "Shadow Amps" and "Keywords" are visible.
- [ ] **Step 1:** Implement, then `npm run build && npm run e2e`: it passes.
- [ ] **Step 2:** Commit `Data screen and end-to-end smoke test`.

# Phase 6 — Packaging and deployment

### Task 21: Dockerfile, nginx, Unraid template

**Files:** Create `Dockerfile`, `nginx.conf`, `.dockerignore`, `unraid/chummer-anarchy2.xml`, and `unraid/icon.png` (a 256px icon). Update `README.md`.

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
VOLUME /usr/share/nginx/html/custom
EXPOSE 80
```

`nginx.conf`: `listen 80;`, `root /usr/share/nginx/html;`, `location / { try_files $uri $uri/ /index.html; }`, and `location ~* \.xml$ { add_header Cache-Control "no-cache"; }` so overlay edits show up on reload.

The volume problem: mounting an empty host folder over `custom/` would hide the image's `index.xml`. The loader already treats a missing `custom/index.xml` as "no overlays", so an empty mount is fine. The README tells users to add `index.xml` when they add overlays.

Unraid template:

```xml
<?xml version="1.0"?>
<Container version="2">
  <Name>chummer-anarchy2</Name>
  <Repository>chummer-anarchy2:latest</Repository>
  <Network>bridge</Network>
  <Shell>sh</Shell>
  <Privileged>false</Privileged>
  <Overview>Character generator and career tracker for Shadowrun: Anarchy 2.0. Static web app; characters are stored in your browser and exported as .ca2.json files. Put overlay XML (house rules, extra gear) in the custom folder.</Overview>
  <Category>Tools: Other:</Category>
  <WebUI>http://[IP]:[PORT:80]/</WebUI>
  <Icon>https://raw.githubusercontent.com/jbowensii/chummer-anarchy2/main/unraid/icon.png</Icon>
  <Config Name="WebUI Port" Target="80" Default="8480" Mode="tcp" Type="Port" Display="always" Required="true">8480</Config>
  <Config Name="Custom data" Target="/usr/share/nginx/html/custom" Default="/mnt/user/appdata/chummer-anarchy2/custom" Mode="rw" Type="Path" Display="always" Required="false">/mnt/user/appdata/chummer-anarchy2/custom</Config>
</Container>
```

Because the repo is private, `Repository` is a local image tag built on the tower. A public-registry variant (`ghcr.io/jbowensii/chummer-anarchy2:latest`) is documented in the README for later.

- [ ] **Step 1:** Write the files. Check `nginx.conf` syntax during the tower build (Task 22).
- [ ] **Step 2:** Commit `Docker image, nginx config, Unraid template`.

### Task 22: Deploy to tower04 and test in the browser

**How to reach the tower:** from JohnsPC, reach tower04 over SMB (`\\TOWER04\…`) and run shell commands through its ttyd web terminal (the `tower-terminal` skill). SSH from the PC doesn't work. Confirm tower04's IP and a free port 8480 first (`docker ps --format '{{.Ports}}'`).

- [ ] **Step 1:** Push `main`. On tower04, clone the repo into `/mnt/user/appdata/chummer-anarchy2/src`, using `gh`, or the git plus a token John provides. If the tower can't authenticate, copy the working tree over SMB instead (excluding `node_modules`).
- [ ] **Step 2:** `cd /mnt/user/appdata/chummer-anarchy2/src && docker build -t chummer-anarchy2:latest .` (expect success), then `mkdir -p /mnt/user/appdata/chummer-anarchy2/custom`.
- [ ] **Step 3:** Copy `unraid/chummer-anarchy2.xml` to `/boot/config/plugins/dockerMan/templates-user/my-chummer-anarchy2.xml`. Then create the container through Unraid's **Add Container** UI with that template, so it's template-managed, and turn Autostart on.
- [ ] **Step 4:** Open `http://<tower04-ip>:8480/` in the browser pane, then:
  1. The Data screen shows 14 files and 0 errors.
  2. Load book samples → 13 characters appear.
  3. Open each sample: the panel shows no `ref.unknown`. For the creation example, remaining is 0.
  4. Hercules' print sheet shows the thresholds 2/5/8, 5/8/11, 3/6/9 and 2/5/8.
  5. Build a new Runner Balanced character from scratch following the book package, finalize, earn, advance.
  6. Record the results in `docs/deploy-tower04.md`.
- [ ] **Step 5:** Commit `Deployed to tower04; verification notes`.

---

## Self-review

- **Spec coverage:**
  - §1 goals: Tasks 12–19.
  - §2 decisions: Tasks 1, 2 and 21.
  - §3 architecture: Tasks 1, 4 and 12.
  - §4 XML, schemas, overlays and contract: Tasks 2–4.
  - §5 rules: Tasks 5–9.
  - §6 file format: Tasks 9, 10 and 12.
  - §7 UI screens: Tasks 12–20.
  - §8 error handling: Tasks 4, 10 and 12.
  - §9 tests: Tasks 5–11 and 20.
  - §10 build order: the phases.
  - §11 deploy: Tasks 21–22.
  - Addition beyond the spec: book samples are loadable in the app (Task 12). It's cheap, and it's how John tests "with the examples".
- **Deliberate deviation:** data lives in `public/data` instead of `data/`, as explained in the path note.
- **Types:** `ampRating`, `price`, `derive`, `validate`, `balance`, `currentBuild` and `legalEffects` use the same names in every task.
