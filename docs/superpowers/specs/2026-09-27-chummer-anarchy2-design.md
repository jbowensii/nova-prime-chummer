# Chummer Anarchy 2.0 — Design Spec

Date: 2026-09-27 · Status: approved design, pre-implementation

A character generator and career tracker for **Shadowrun: Anarchy 2.0**
(Alternative Core Rulebook v1.8), offering the Commlink6 / Chummer
experience for Anarchy 2.0's nuyen-only creation rules. The name ends in
"2" deliberately, because Shadowrun: Anarchy (1st edition, 2016) is a
different game with different rules. This tool supports 2.0 only.

Rules citations below ("CRB p.N") refer to the printed page numbers of the
v1.8 core rulebook.

---

## 1. Goals and non-goals

### v1 must do

1. **Guided creation.** Pick a level of play (Ganger / Runner / Prime
   Runner) and optionally a package (Balanced / Magician / Fighter). Spend
   nuyen with a live budget, and have the level-of-play and metatype limits
   validated.
2. **Shadow Amp builder.** Build amps from a type plus effects taken from
   the Shadow Amp effect table. Rating, cost and Essence are computed and
   the caps are enforced. A catalog of prebuilt amps can be used as-is or
   as a starting point.
3. **Career mode.** After Finalize, log nuyen earned and spend it on
   advancement at the same prices. History is append-only, and an event is
   undone by voiding it.
4. **Print and files.** A printable character sheet modeled on the official
   4-page sheet, a character library in the browser, and export/import of
   `.ca2.json` files.

### Not in v1

- Foundry VTT export
- Importing SR6 or Anarchy 1 characters (the conversion guide is a later
  feature)
- A sync server or any backend
- A dice roller or at-the-table tracking (wounds taken, Edge spent)
- Languages other than English
- Pregens as starter characters (can be added later as sample `.ca2.json`
  files)

---

## 2. Decisions

| Topic | Decision |
|---|---|
| Platform | Static web app, fully client-side, with no backend |
| Stack | React + TypeScript + Vite, with Vitest and Playwright for tests |
| Hosting | Any static host (Unraid nginx, GitHub Pages), or `npm run preview` |
| Game data | XML files in `data/`, each with an XSD schema, served as static files and editable by other applications |
| House rules / extensions | A `custom/` overlay folder with the same schemas, merged over `data/` |
| Rules strictness | The rules as written are enforced by default. Any violation can be marked "GM approved" with a note |
| Character storage | Browser `localStorage` library plus `.ca2.json` file export/import (the file is the durable copy) |
| Sheet output | A print-CSS HTML sheet, saved to PDF with the browser's "Save as PDF". The official sheet PDF is not used |
| Repo | `jbowensii/chummer-anarchy2`, **private** · local clone `Documents\Projects\chummer-anarchy2` |

---

## 3. Architecture

```
chummer-anarchy2/
  data/               XML game data (static)
    schema/           one XSD per data kind: the public contract
  custom/             user overlay XML, same schemas
  src/
    engine/           pure TS: load + merge data, pricing, derive, validate
    model/            Character document + career event types
    ui/               React screens
    print/            print-CSS character sheet
  tests/              Vitest (engine, data integrity) + Playwright smoke
  docs/               this spec, data-format guide for third-party tools
```

**The one layering rule:** `ui/` never computes a rule. Every cost, derived
value and violation comes from `engine/`, which is pure and has no DOM or
React code. Because of that, the engine can later be reused by a Foundry
module or a CLI without changes.

**Data flow at startup**
1. Fetch `data/*.xml`, then `custom/*.xml` (the files listed in
   `custom/index.xml`, since a static host can't list a directory).
2. Parse with the browser's `DOMParser` into typed catalogs.
3. Merge the overlay into the base data by `id`.
4. For the open character, the engine computes price, derived values and
   violations, and React renders the result.

---

## 4. XML data format

### 4.1 Common shape

```xml
<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="ampeffects" version="1">
  <effect id="rr-skill" category="risk" rating="5" max="1" maxScope="amp"
          types="quality cyberware bioware adept equipment cyberdeck vehicle contact"
          source="CRB" page="61">
    <name>Risk Reduction 1 for a Skill</name>
    <param kind="skill"/>
  </effect>
</ca2:data>
```

- The root element is `ca2:data`, and its `kind` names the catalog. The
  `version` attribute is the schema version.
- Every entry has a stable kebab-case `id`. Cross-references always go by
  id: `ref=`, `requires=`, `param=`, `type=`. Display names can change
  freely.
- Every entry carries `source` (a book code, `CRB` or `DHSA` for Daegann's
  Holostreets Shadow Amps list, or `CUSTOM`) and a `page`.
- **Derived values are never stored.** For example, a prebuilt amp lists
  only its type and effects, and its rating, cost and Essence are computed.
  The numbers exist in one place only, so data can't contradict the rules.
- Descriptions are short summaries written for this tool, not text pasted
  from the book.

### 4.2 Data kinds

| File (`kind`) | Contents |
|---|---|
| `levels.xml` | Levels of play: starting nuyen, number of attributes allowed at max, skill rating cap, number of skills allowed at a higher cap, RR caps (attribute / skill / specialization) |
| `metatypes.xml` | Attribute min/max per metatype, starting Edge, racial quality (narrative only) |
| `attributes.xml` | STR, AGI, WIL, LOG, CHA: id, abbreviation, name |
| `skills.xml` | The 14 skills: linked attribute(s), restrictions (Conjuring and Sorcery need Awakened, Cracking needs a cyberdeck), and specializations with their attribute |
| `pricing.xml` | The price list (CRB p.83): per-point costs and breakpoints, as data, so house rules can change them |
| `amptypes.xml` | Quality, Awakened, Cyberware, Bioware, Adept power, Equipment, Cyberdeck, Vehicle/Drone, Contact: base rating, Essence cost, and requirements (Adept power needs Awakened with the Adept option) |
| `ampeffects.xml` | The Shadow Amp effect table (CRB p.61–63): rating, allowed types, max, prerequisite chain, parameter kind, stacking scope |
| `amps.xml` | Prebuilt amps (CRB + DHSA): type, effect refs with parameters, narrative text |
| `vehicles.xml` | Base vehicle and drone chassis (CRB p.60): Pilot, Body, Handling, Speed, Armor, weapon-mount limit |
| `packages.xml` | Guide budgets per level and archetype (CRB p.85–86): attribute points and number at max, skill points, amp points, other items |
| `gear.xml`, `weapons.xml`, `armor.xml` | Equipment catalog. Weapons are `standard` or `specialist`; armor has a rating |
| `spells.xml` | Spells: category, type, short effect |

### 4.3 Overlay rules (`custom/`)

- An entry with the same `id` as a base entry replaces it entirely.
- An entry with `remove="true"` deletes the base entry with that id.
- An entry with a new `id` is added.
- An overlay file that fails to parse or fails its schema is skipped and
  reported on the Data screen with file and line. The app keeps running on
  the base data.

### 4.4 Contract for other applications

- `data/schema/*.xsd` is authoritative.
- `docs/data-format.md` documents each kind, the id and reference rules,
  and the overlay semantics.
- CI validates every file in `data/`, plus `custom/example/`, against the
  schemas and checks that every reference resolves.

### 4.5 Initial content

A one-off, hand-reviewed extraction from `Shadowrun Anarchy 2.0 v1.8.md`
(the core book) and Daegann's *Shadow Amps Expanded List* PDF. The
extraction scripts live in `tools/`. The XML output is committed after
review. There is no permanent extraction pipeline.

---

## 5. Rules model

### 5.1 Pricing (CRB p.83)

Creation and advancement use the same prices:

| Trait | Cost |
|---|---|
| Attribute | 10,000¥ per point; the point that reaches the metatype max costs 20,000¥ |
| Skill | 2,500¥ per point up to rating 5; 5,000¥ per point for ratings 6–8 |
| Specialization | 2,500¥ (needs skill ≥ 1; any number per skill) |
| Knowledge skill | 2,500¥ |
| Shadow Amp | 5,000¥ × rating |
| Equipment | 2,500¥ (the GM may set it higher) |
| Weapon | 2,500¥ standard (melee, or ranged up to rifle); 5,000¥ specialist |
| Armor | 2,500¥ per armor point |
| Spell | 5,000¥ |
| Commlink (with trodes) + fake SIN | free at creation |

Attributes and skills start at 0. Attributes must end within the metatype
range (minimum 1).

Modifying an amp costs the **rating difference** × 5,000¥. That covers
adding an effect or swapping one effect for another (CRB p.83). Removing an
effect gives no refund. The book says nothing about refunds, so this is
our ruling, and it goes in `pricing.xml` so a table can change it.

### 5.2 Levels of play (CRB p.84–85)

| Level | Nuyen | Attributes at max | Skill cap | Risk Reduction cap |
|---|---|---|---|---|
| Ganger | 300,000¥ | 0 | 4 | 1 (total, including stacking) |
| Runner | 375,000¥ | 1 | 5 | 1 for attributes and skills, 2 for specializations |
| Prime Runner | 450,000¥ | 2 | 6 (the book's package table shows "2 at rating 6") | 2 (total, including stacking) |

The caps apply **during creation only**. The book says they "may be
overcome later, during character advancement."

**Open data point:** the text says Prime Runner's skill cap is 6. The
Prime package table shows 40 skill points with "2 at rating 6". v1
encodes the cap as rating 6 for all skills, and the package's "2 at 6" as
guidance only. This goes in `levels.xml` so it can be changed.

### 5.3 Packages

Packages are **guides**, not constraints. The book says nuyen "can be moved
from one category to another one, as long as the total amount remains the
same." The UI shows guide against actual per category. Picking **Free**
shows no guides.

Worked check, Runner Balanced: attributes 14 points with 1 at max
(14 × 10,000¥ + 10,000¥ surcharge = 150,000¥), skills 35 × 2,500¥
= 87,500¥, amps 24 × 5,000¥ = 120,000¥, armor 3 = 7,500¥, 2 weapons
= 5,000¥, 2 equipment = 5,000¥. Total **375,000¥**, which equals the Runner
budget. All 9 packages must total their level's budget exactly. This is a
test.

### 5.4 Shadow Amps

- Rating = the type's base rating + the sum of its effect ratings
  (negative effects included).
- The first **Quality** has base rating 0, every later Quality has base
  rating 3. The racial quality doesn't count and costs nothing.
- **Awakened** starts at rating 0. Its options: astral perception +1,
  astral perception and projection +2, sorcery +1, conjuring +2, adept +1.
- **Essence cost:** Cyberware −1 per amp, Bioware −0.5 per amp. Essence
  starts at 6. Essence ≤ 0 is an error.
- Effects give a legal set of types, a max (per amp or per character), and
  an optional `requires` prerequisite (initiative level 2 needs level 1).
- **Initiative enhancements from different sources don't stack.** Only the
  best one applies. Each level can be limited to one realm (astral,
  physical or VR) for −1 rating per level.
- An **additional narrative effect** is +1. A **negative effect** is −1 to
  −5 and always raises a GM-approval violation.
- Qualities can only be bought during creation. In career mode, adding a
  new Quality raises a GM-approval violation ("after a major event"), but
  upgrading an existing one is normal.
- Equipment must be bought first before it can be converted into an
  Equipment amp.

### 5.5 Derived values

| Value | Rule |
|---|---|
| Edge (starting, per adventure) | From the metatype: 4 for humans, 3 for others |
| Essence | 6 − cyberware − 0.5 × bioware; penalty tiers from the Essence table (CRB p.60) |
| Condition monitor | 2 light, 1 serious, 1 incapacitated; +1 light and/or +1 serious from amp effects |
| Physical thresholds | STR + Armor / +3 / +6, computed for No armor, Main armor and Alternate armor |
| Mental thresholds | WIL + Protection / +3 / +6 |
| Matrix thresholds | Firewall / +3 / +6 (only with a cyberdeck) |
| Dice pool | Skill + linked Attribute; +2 when a specialization applies |
| Risk Reduction | Per attribute, skill and specialization, summed from amps; capped at 3 per Test (and at the level cap during creation) |
| Knowledge | Knowledge skills + Keywords + skills at rating ≥ 4 |

### 5.6 Validation

`validate()` returns a list of `Violation { code, severity: error|warning,
path, message, source, page }`. Codes include:

- `budget.over`
- `attr.range`
- `attr.maxCount`
- `skill.cap`
- `spec.noSkill`
- `rr.cap`
- `amp.effectMax`
- `amp.requires`
- `amp.typeIllegal`
- `amp.negative` (needs GM approval)
- `amp.qualityAfterCreation`
- `essence.dead`
- `skill.requiresAwakened` / `skill.requiresDeck`
- `adept.requiresAwakened`
- `ref.unknown`
- `narrative.count` (warning: fewer than 5 Keywords, 4 Dispositions or 4 Cues)
- `runner.basics` (warning: Athletics, Stealth, Perception, Influence or
  Network below 2, CRB p.84)

A violation that has an override (`{code, path, note}`) is shown as
approved and doesn't block Finalize. **Finalize requires no unapproved
errors.** Warnings never block.

---

## 6. Character document (`.ca2.json`)

```ts
interface CharacterFile {
  formatVersion: 1;
  id: string;                         // uuid
  identity: { name; streetName; metatype; portrait?; background; notes };
  narrative: { keywords: string[5]; dispositions: string[4]; cues: string[4] };
  level: string;                      // levels.xml id
  package: string | "free";
  build: Build;                       // creation snapshot
  finalizedAt?: string;               // set by Finalize; switches to career mode
  career: CareerEvent[];              // append-only
  overrides: { code; path; note }[];
  lastExportedAt?: string;
}
```

- **`Build`** holds attributes, skills (rating plus a list of
  specializations), knowledge skills, amps, gear, weapons, armor and spells.
  Each catalog-backed entry stores its catalog `id` **and a snapshot** of
  the catalog entry, so a character still loads and prints if its data
  later disappears. In that case the entry is shown with a `ref.unknown`
  warning and is never silently dropped.
- **Creation mode:** the build is edited in place, with an in-memory
  undo/redo stack.
- **Finalize:** freezes the build as the baseline and records
  `finalizedAt`.
- **Career mode:** the current state is `baseline + career events`, where
  events are applied in order and voided events are skipped. Event types:
  - `earn { amount, run, date }`
  - `advance { path, from, to, cost }`
  - `buy { item }` / `sell { itemRef }`
  - `amp-modify { ampRef, before, after, cost }`
  - `note { text }`
  - `void { eventId, reason }`

  Nuyen balance = unspent creation nuyen + earnings − costs. The `cost` is
  computed by the engine when the event is created and stored so history
  never changes.
- **Loading:** `formatVersion` runs migrations. A malformed import is
  rejected with a reason, and the existing library is not touched.

---

## 7. UI

The layout is modeled on Commlink6: tabs across the top, the working area
in the middle, and a **summary panel** fixed on the right. The panel shows
nuyen spent and remaining, guide against actual per category, Essence,
Edge, condition monitor thresholds, and a violation count that links to
Review.

| Screen | Purpose |
|---|---|
| **Library** | Character cards (portrait, street name, metatype, level, Creation or Career badge). New / Open / Duplicate / Import / Export / Delete (with confirmation). Reminds you to export a character changed more than 7 days after its last export. |
| **Concept** | Identity, metatype (ranges shown), level of play, package, 5 Keywords / 4 Dispositions / 4 Cues (with hints from CRB p.50–51), background. |
| **Attributes** | Stepper per attribute: min/max, cost of the next point, at-max slots used against the level allowance. |
| **Skills** | The 14 skills: rating stepper, linked attribute, live dice pool and RR. Specialization chips (book list or custom, which is flagged). Knowledge skills list. |
| **Shadow Amps** | Amps grouped by type. **Amp Builder** dialog: start from a catalog amp or a bare type → add the effects legal for that type (rating, max and prerequisite shown) → fill parameters → optional narrative or negative effects → live rating, cost and Essence (in career mode, the cost of the change). **Contacts** is a sub-view. |
| **Gear & Spells** | Armor, weapons (standard or specialist), equipment and spells from the catalog, or custom at a GM-set price. "Convert to Amp" on equipment. Vehicles and drones start from a chassis in `vehicles.xml`. |
| **Review** | All violations with citations; for each, *Fix* (jump to it) or *GM approve* (needs a note). **Finalize** button. |
| **Career** (after Finalize) | The same tabs. Each change opens a confirmation showing its cost and appends an event. **Ledger** tab: earnings entry, running balance, history, void. |
| **Print** | A print-CSS sheet modeled on the official sheet: attributes + Edge, wounds and thresholds (no armor / main / alternate / mental), the RR × risk-level dice table, skills (rating + attribute = dice pool, RR), amps, weapons and spells, keywords, dispositions, cues, knowledge, Essence and its effects, nuyen. |
| **Data** | The XML and overlay files loaded, entry counts, and parse or schema errors with file and line. |

---

## 8. Error handling

- A bad overlay file: skip that file, report it, and keep running on the
  base data.
- Bad base data: a build/CI failure, never shipped.
- An unknown reference in a character: keep the entry and its snapshot,
  raise `ref.unknown`, and never drop it.
- A corrupt import file: reject it with the reason; the library is not
  touched.
- `localStorage` full or unavailable: the app keeps working with the
  character in memory and shows a banner telling you to export.

---

## 9. Testing

- **Engine (Vitest)**
  - All 9 package tables total exactly their level budget.
  - Lightning (CRB p.85) prices to 375,000¥.
  - Smartlink: rating 6, 30,000¥. Upgrading its RR from the pistols
    specialization to the Ranged Weapons skill costs +3 rating, 15,000¥.
  - Thresholds example: an ork with STR 4 and Armor 2 → 6/9/12.
  - One test per violation code.
  - Pricing edges: the last attribute point, a skill crossing rating 5, an
    amp effect swap, initiative non-stacking.
- **Data:** `xmllint --noout --schema` on every file, plus a script that
  checks every reference resolves.
- **UI (Playwright smoke):** create a Runner Balanced character → Finalize
  → earn 50,000¥ → advance a skill → Print renders every section.
- **CI:** a GitHub Actions workflow runs all of the above on every push
  and PR.

---

## 10. Build order

1. **Engine and data:** XSDs, the extraction scripts plus reviewed XML,
   the parser and overlay merge, pricing, derived values, validation, and
   the fixtures.
2. **App shell:** Library, Concept, Attributes, Skills, Gear & Spells,
   Review, and the summary panel.
3. **Amp Builder.**
4. **Career mode and Ledger.**
5. **Print sheet and Data screen.** Playwright smoke test. README.

Each phase ends with its tests passing and gets its own implementation
plan (writing-plans).

---

## 11. Deployment

The app is static, so the three ways to deploy it all serve the same
`dist/` folder:

1. **Any static host:** copy `dist/` anywhere.
2. **Docker:** a `Dockerfile` builds the app (a Node build stage) and serves
   it with `nginx:alpine` on port 80. `/usr/share/nginx/html/custom` is a
   volume, so the host's overlay XML replaces the image's empty
   `custom/index.xml`.
3. **Unraid template:** `unraid/chummer-anarchy2.xml` is a Community-Apps
   style template with a WebUI link, a port mapping (default 8480 → 80),
   and the path `/mnt/user/appdata/chummer-anarchy2/custom` →
   `/usr/share/nginx/html/custom`. The template ships as an option; Docker
   and plain static hosting remain supported.

**First deployment is tower04**, done through the Unraid template, so it
shows up as a managed container (Autostart and Edit work) rather than a
"3rd Party" one. How the image reaches tower04 (built on the tower, or
pulled from GHCR) is decided in the plan, because the repo is private.

---

## 12. Sources on disk (not committed)

- `Downloads\Shadowrun Anachy 2.0\Shadowrun Anarchy 2.0 v1.8.md`: the core
  book as markdown, the primary source
- `…\Shadowrun_Anarchy_2_0_Daegann_Holostreets_Shadow_Amps_Expanded_List.pdf`:
  prebuilt amps
- `…\Shadowrun_Anarchy_2_0_Catalyst_Game_Labs_Conversion_Guide_v1_1_OEF2026.pdf`:
  for the future import feature
- `Downloads\Telegram Desktop\…_Shadowrun_Anarchy_2_0_Character.pdf`: the
  official sheet (layout reference only)
- AnythingLLM workspace `shadowrun-anarchy-2-dot-0`: a RAG over the core
  book. Its model's prose answers are not trusted for numbers; always check
  the source text.

Shadowrun is a registered trademark of The Topps Company, Inc.; Catalyst
Game Labs publishes it under license. This repo is private. Before it ever
goes public, the committed XML content must be re-checked for what may be
redistributed.
