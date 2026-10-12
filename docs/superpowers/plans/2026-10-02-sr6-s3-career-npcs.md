# SR6 S3 — Career ledger; NPCs, critters, spirits, sprites; SR6 campaigns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A finalized Shadowrun 6 runner goes on in career mode: the player records earnings (karma and nuyen) and spends them on the Ledger tab: raise an attribute or skill, add a specialization, expertise or knowledge skill, buy or buy off a quality, learn a spell, ritual, complex form or adept power, initiate or submerge, buy or drop gear, pay lifestyle, change a contact, convert karma and nuyen. Each entry records what was bought and what it cost; the ledger is append-only and an entry is undone by voiding it. Back to draft works only while the ledger holds nothing to undo. GMs (admin, editors) get the SR6 NPC area: grunts by Professional Rating, critters, spirits by Force and sprites by Level, made from the catalog's entries or blank, "Load book NPCs", an NPC editor mode with a stat block, an NPC print block, share with a campaign's GMs, trash. SR6 campaigns get the Anarchy pages (create, members, GMs; the GM view lists the shared runners and NPCs) and the SR6 runners page gets Add to campaign.

**Architecture:** Career is a ledger on the runner (`Sr6Character.ledger`, `<ledger>` in the runner file). The build as finalized (`ch.build`) is never changed by career play, so S2's creation budgets and rules keep checking what creation made; the runner as it stands is `currentBuild(ch)` = `ch.build` with every live advance entry since the last Finalize replayed on it (the Forge's apply/undo becomes replay, so a void is just an entry that replay skips). Prices are formulas in `src/sr6/engine/career.ts` (a TypeScript port of the Forge's `advancement-engine.mjs` `preview`, with `services/ledger.mjs`'s append-only list and last-in-first-out undo) over numbers that live in the creation rules (S2's Karma prices keys plus a new optional "Advancement" group); the repo ships none. An SR6 NPC is an SR6 runner file with an `<npc>` block as its first child (what S0's `/api/sr6/npcs` already requires) and a blank build; its stat block is a copy of the catalog entry's printed values plus its rating, evaluated at that rating (`formula()` in `values.ts`). The server needs no change: S0's `/api/sr6/npcs`, `/api/sr6/npcs/trash*` and `/api/sr6/campaigns*` already do everything; S3 adds pages over them.

**Tech Stack:** as the repo already uses (TS/React/Vitest/Playwright/Node server, xmllint-wasm for XSD tests, no new dependencies). No Python in S3.

**Spec:** `docs/superpowers/specs/2026-10-02-sr6-ruleset-design.md` (§1 "Career", "Game separation"; §4 "Finalize → career", "NPCs", the Ledger tab; §6 S3; §7). Builds on S0–S2 (`docs/superpowers/plans/2026-10-02-sr6-s2-builder.md`, as built: see `.superpowers/sdd/sr6/s2-*.md`; the setters take the runner, `Sr6EditorView` lives in `src/sr6/ui/EditorView.tsx`, derived constants are creation settings). Rulings the spec left open are marked (R).

## Global Constraints

- Branch `feat/sr6` (ledger `.superpowers/sdd/sr6/progress.md`; no push and no tower04 install until the owner says so). Never touch `public/data/*.xml`, `public/custom/`, `custom/`, `library/`, `.extract/private` or `x/`. No book text and no book numbers in the repo or tests: every price, cap and rate the book prints is a creation setting the GM enters; tests and fixtures use made-up names and invented numbers (fixture prices from S2: `karmaAttrPerRank` 3, `karmaSkillPerRank` 3, `karmaSpec` 7, `karmaSpell` 7, `karmaForm` 7, `karmaKnowledge` 3, `karmaInitiationBase` 9, `karmaInitiationPerGrade` 3). Never kill processes by image name.
- Port source, reference only, never copied: `../SR6-eden-Forge\foundry-module\sr6-forge\scripts\engine\advancement-engine.mjs` (`preview`, `applyPatch`, `undoPatch`), `scripts\services\ledger.mjs` (append, last-in-first-out undo) and the 16 tests in `foundry-module\tests\advancement.test.mjs`. The Forge's `snapshot()` (reads an Eden actor) and the `patch` paths are Foundry glue (F1 or dropped). Its default numbers (5 × new rank, 5, × 2, 10 + grade, 2,000¥) are book numbers and are not ported: the tests use the fixture's invented settings.
- Anarchy unchanged: every existing Vitest, Python and Playwright suite passes unchanged. Anarchy files change only where named (Campaigns.tsx gains a `game` prop, nav.tsx's SR6 menu), each with no behaviour change on the Anarchy side.
- Server unchanged (R): S0's SR6 NPC, NPC trash and campaign routes are used as they are. A server test proves the real SR6 NPC file passes them (Task 2).
- Vitest files in `tests/sr6/` and `tests/server/`; e2e in `e2e/sr6-career-npcs.spec.ts`. One file: `npx vitest run tests/sr6/career.test.ts`.

## Review Focus

- Replay is the single source of the current runner: derived values, print, the tabs' career view, export and the next spend all read `currentBuild(ch)`; nothing writes a career change into `ch.build` (Task 3 + Task 4 tests).
- A void can't break a later entry: only the newest live advance can be voided (an older one says to void the later ones first); earnings, conversions and Other entries can be voided any time, and a balance that goes negative that way is a Review warning, never a crash (Task 3 tests).
- A price setting is unset (fresh install, new key): that spend is refused naming the setting and where to set it; nothing is priced at 0 by accident (Task 3 tests).
- A catalog entry a career line uses is gone: the runner still opens, replays and prints from the line's stored name or snapshot; export writes snapshots for career purchases too (Task 3 + Task 4 tests).
- NPCs never reach players or the other game: SR6 NPC pages and menus are GM only, the NPC store refuses runners and runners' store refuses NPCs (S0), an Anarchy file is refused on the SR6 NPC page and an SR6 NPC on the Anarchy one, each saying where it belongs (Task 6 + Task 9).
- A stat the evaluator can't read (`F+?`, a typo the GM entered): shown as printed with a warning mark, never NaN (Task 5 tests).

### Port map (Forge advancement tests → `tests/sr6/career.test.ts`, invented numbers)

| Forge test | S3 test |
|---|---|
| attribute at 5 × new rating | BOD 4 → 5 costs `karmaAttrPerRank` × 5 = 15 karma |
| book's worked example 4 → 6 | two raises 4 → 5 → 6 cost 15 + 18 = 33 |
| Edge through max/current | Edge raises like any attribute, refused at the metatype's maximum (`at-maximum`) |
| skill at 5 × new rank | Tinkering 3 → 4 costs 12; refused at `advance.skillMax` |
| spec 5, expertise needs a spec | spec costs `karmaSpec` 7; expertise refused without a spec (`needs-specialization`), then costs `advance.expertise` |
| spec on an untrained skill | refused `skill-untrained` |
| quality karma doubled both ways | buy costs karma × `advance.qualityFactor`, buy-off karma × `advance.buyOffFactor`; a negative can't be bought, a positive can't be bought off |
| initiate 10 + grade, mundane blocked | grade 0 → 1 costs 9 + 1 × 3 = 12, 2 → 3 costs 18; a mundane refused |
| technomancer submerges | a technomancer's initiate raises `submersion`, not `initiation` |
| only spellcasters learn spells | spell `karmaSpell` for a full magician, refused for a mundane; a complex form `karmaForm` for a technomancer |
| refuses the unaffordable | 3 karma left, a 15-karma raise → `not-enough-karma` |
| apply then undo | record then void the raise: AGI back, karma back, the entry and its void both stay |
| nuyen → karma off by default | `advance.nuyenToKarmaRate` unset → `optional-rule-off` |
| nuyen → karma once on | with the rate set, 1 karma costs that much nuyen |
| not enough nuyen | refused `not-enough-nuyen` |
| reverses exactly | void the conversion: both balances back |

### New creation settings (group "Advancement", `methods: []`: optional; unset → the spend that needs it is refused naming it, or a cap is not applied)

| key | meaning | fixture (invented) |
|---|---|---|
| `advance.expertise` | karma for an expertise after creation | 9 |
| `advance.qualityFactor` | a positive quality costs its karma times | 3 |
| `advance.buyOffFactor` | buying off a negative quality costs its karma times | 3 |
| `advance.skillMax` | highest skill rank after creation (unset: no cap) | 11 |
| `advance.powerPoint` | karma for a power point (mystic adepts) | 7 |
| `advance.karmaToNuyenRate` | nuyen per karma after creation (unset: not offered) | 1100 |
| `advance.nuyenToKarmaRate` | nuyen per karma the other way, an optional rule (unset: off) | left out |

Every other career price reuses S2's Karma prices keys (`karmaAttrPerRank`, `karmaSkillPerRank`, `karmaSpec`, `karmaKnowledge`, `karmaSpell` for spells and rituals, `karmaForm`, `karmaInitiationBase` + `karmaInitiationPerGrade`) and `magicMax` (R: the career prices are the creation karma prices; the Game data labels say so).

---

### Task 1: Advancement settings and the S3 fixture
**Files:** `src/sr6/engine/creation.ts` (`CREATION_GROUPS` + `'Advancement'` after `'Karma prices'`; the seven keys above as `n('Advancement', [], …)`; label of the Karma prices group's intro on Game data: "also the career prices"), `tests/fixtures/sr6/custom/creation.xml` (the six fixture values, `source="CRB"`, invented pages), `tests/fixtures/sr6/custom/imported/crb/npcs.xml` (+ "Lot Boss", `rating="4"`, group "Street Crew", made-up stats and lines; + "Quiet Fixer" `rating="1"`, no group), `spirits.xml` (Spirit of Puddles keeps `F`, `F+1`, `F × 2`, `F/2`, `8 + F/2`, `F × 2 + 2D6`; + "Spirit of Drafts" with `F-1` and a skill line with a rating), `critters.xml` (+ one critter with an `augmentations` line), `sprites.xml` (+ "Echo Sprite" with `(L × 2) + 1` and `L-1`), `src/sr6/ui/Data.tsx` (no code change expected: it renders groups from `CREATION_GROUPS`; check).
- [ ] Tests first: `tests/sr6/creation.test.ts`: the fixture parses with every Advancement key but `advance.nuyenToKarmaRate`; `missingFor('priority', …)` doesn't list any Advancement key (optional); `npm run validate:data` passes on the fixture.
- [ ] Implement, `npm run check`, commit "SR6 S3: advancement settings and the S3 fixture".

### Task 2: Runner file — ledger, NPC block, book key
**Files:**
- `src/sr6/model/character.ts`:
  - `Sr6Advance` (tagged `op`): `attribute {target: Sr6Attr}`, `skill {target}` (+1 rank; a skill not on the runner joins at 1), `spec {target, name}`, `expertise {target, name}`, `knowledge {line: Sr6Knowledge}`, `quality {line: Sr6Quality}`, `buyoff {target: uid; line?: Sr6Quality}` (line: the removed one, for the history), `pick {line: Sr6Pick}` (spells, rituals, complex forms, adept powers; the same leveled power again raises its level), `powerpoint {}`, `initiate {line?: Sr6Pick}` (metamagic or echo), `purchase {line: Sr6Purchase}`, `drop {target: uid; line?: Sr6Purchase}`, `contact {line: Sr6Contact}` (new, or replaces the one with its uid), `lifestyle {id, months}`, `convert {karma}` (> 0 karma to nuyen, < 0 nuyen to karma), `other {}`.
  - `Sr6LedgerEntry = { id: string; at: string } & ({ type: 'finalize'; karma; nuyen } | { type: 'earn'; karma; nuyen; run: string; date: string } | { type: 'advance'; advance: Sr6Advance; label: string; karma: number; nuyen: number } | { type: 'note'; text } | { type: 'void'; eventId; reason })` (advance amounts are spent; negative is gained).
  - `Sr6NpcKind = 'grunt' | 'critter' | 'spirit' | 'sprite'`; `Sr6Npc { kind; rating?: number; group?: string; from?: { kind: Sr6Kind; id: string; name: string; source: string; page: number }; stats: Record<string, string>; lines: { part: string; text: string }[] }`.
  - `Sr6Character` + `ledger: Sr6LedgerEntry[]`, `npc?: Sr6Npc`, `sampleKey?: string`; `blankSr6` gives `ledger: []`.
- `public/data/sr6/schema/character.xsd`, `docs/sr6-character-format.md`: `<npc kind rating? group? fromKind? fromId? fromName? fromSource? fromPage?>` with `<stat key value/>*` (key `[a-z]{1,20}`, value ≤ 80 chars) and `<line part>text</line>*` (part one of `skills powers optionalPowers weaknesses attacks augmentations gear weapons`), **first child of the root** (the server's NPC check); root attribute `sampleKey?`; `<ledger>` after `<build>`: `<entry id at type karma? nuyen? date? event? op? target? name? months? lifestyle? label?>` whose text is the run, note or void reason, and whose one optional child is the advance's line (`<knowledge>`, `<quality>`, `<pick>`, `<purchase>` with its snapshot, `<contact>`), written and read by the same element code as the build's (`buildXml`'s per-line writers and readers, exported within the module).
- `src/sr6/engine/charxml.ts`: write and read both; an unknown entry type or op is refused, or in repair dropped with "Dropped ledger entry N: …"; a missing `<ledger>` reads as `[]`.
- `src/sr6/ui/repo.ts`: `snapshotSr6` also snapshots the lines inside ledger entries; `readSr6Import` refuses an NPC file: "This is an NPC. Import it on NPCs & Critters."; `sr6NpcRepo(base = './') = serverRepo<Sr6Character>(base, 'sr6/npcs', sr6Codec)`; `readSr6NpcImport(xml, taken)` (the mirror: a runner → "This is a runner, not an NPC. Import it on Your runners."; an Anarchy file → xmlToSr6's message; a new id when taken; `ledger`, `finalizedAt`, `final`, `campaign` dropped).
- `tests/fixtures/sr6/runner-career.xml` (a made-up finalized full magician with a finalize entry, an earning, five advances incl. a purchase with a snapshot, a void and a note) and `tests/fixtures/sr6/npc-grunt.xml` (Corner Goon as an NPC), both written by `sr6ToXml` and kept as golden files.
- `tests/sr6/charxml.test.ts`, `tests/ui/sr6-runners.test.ts`, `tests/server/games.test.ts`.
- [ ] Tests first:
  - Both fixtures round-trip equal, validate against `character.xsd` and equal `sr6ToXml` of their parsed form; every `Sr6Advance` op round-trips; an `<entry type="x">` is refused naming it, and repair drops it.
  - An NPC without `<npc>` first fails the XSD; a runner file without `<ledger>` reads with `ledger: []`.
  - `readSr6Import` on `npc-grunt.xml` → the NPC message; `readSr6NpcImport` on `runner-career.xml` → the runner message, on an Anarchy file → the Anarchy message.
  - Server (`games.test.ts`): eve (editor) PUTs `npc-grunt.xml` to `/api/sr6/npcs/<id>` → 201, to `/api/sr6/characters/<id>` → 400; shares it with an SR6 campaign she GMs → it's in the campaign's `npcs`; `runner-career.xml` to `/api/sr6/npcs` → 400.
  - Implement, `npm run check`, commit "SR6 S3: ledger and NPC block in the runner file".

### Task 3: Career engine (port of the Forge's advancement engine and ledger)
**Files:** `src/sr6/engine/career.ts` (new), `src/sr6/engine/finalize.ts`, `src/sr6/engine/index.ts` (re-export), `tests/sr6/career.test.ts` (new), `tests/sr6/review.test.ts`.
- `career.ts`:
  - `sinceFinalize(ch)` (entries after the last `finalize`), `voidedIds(ch)`, `liveAdvances(ch)`.
  - `applyAdvance(b: Sr6Build, a: Sr6Advance): void` (attribute → `attributes[k].karma += 1`; skill → `karma += 1` or a new `{ id, points: 0, karma: 1 }`; spec/expertise set; knowledge/quality/pick/purchase push (a pick of a leveled power already taken raises its level); buyoff/drop remove by uid; powerpoint → `powerPointsBought += 1`; initiate → `initiation` or, for technomancers, `submersion` += 1 and the line pushed; contact upsert by uid; lifestyle → `{ id, months }`; convert/other nothing).
  - `currentBuild(ch): Sr6Build` (a draft: `ch.build`; finalized: a clone with every live advance since the last Finalize applied in order).
  - `ledgerRows(ch): { e; karma: number; nuyen: number; voided: boolean; reason?: string }[]` (running balances: a `finalize` sets both, `earn` adds, `advance` takes its amounts off, voided entries and voids leave them) and `balances(ch): { karma; nuyen }` (the last row's; a finalized runner with no finalize entry, from S2, starts from `ch.final`: R, nothing migrated).
  - `preview(ch, a, data, cr, typed?: { karma?: number; nuyen?: number; label?: string }): { ok: true; label: string; karma: number; nuyen: number } | { ok: false; reason: string }` priced on `currentBuild(ch)`:
    - attribute: `(cur + 1) × karmaAttrPerRank`; cap: the metatype's range maximum (core and Edge); Magic or Resonance `magicMax` + the initiation (submersion) grade (R, verify Task 10); a mag/res raise for a runner without that attribute → `unknown-attribute`. Label "AGI 3 → 4".
    - skill: `(cur + 1) × karmaSkillPerRank`, cap `advance.skillMax`; spec `karmaSpec`, expertise `advance.expertise` (needs a rank, `skill-untrained`; expertise needs a spec, `needs-specialization`; one of each, `already-known`); knowledge `karmaKnowledge` (the line joins at karma rank 1).
    - quality: positive only (`not-positive`), `|karma| × level × advance.qualityFactor`; buyoff: a paid negative only (`not-negative`; a metatype trait `free-trait`), `|karma| × advance.buyOffFactor`.
    - pick: spells/rituals `karmaSpell`, complex forms `karmaForm`, refused when `picksFor(kind)` says no (`cannot-learn`); an adept power costs no karma and needs power points left: `careerPowerPoints(b, data, p)` (adepts: the current natural Magic; mystic adepts: `powerPointsBought`; minus powers' cost, R verify) → `no-power-points`; powerpoint: mystic adepts only, `advance.powerPoint`.
    - initiate: awakened (initiation) or technomancer (submersion), else `mundane-cannot-initiate`; `karmaInitiationBase + newGrade × karmaInitiationPerGrade`; the optional line must be a metamagic (awakened) or echo (technomancer).
    - purchase: nuyen = `priced(line, data, cr).cost` (unreadable → refused `book-value`, R: the GM can buy it as a custom line); drop: 0 (R: no refund; an earning records a sale); lifestyle: `rated(entry.cost) × months` nuyen; contact and other: the `typed` amounts (default 0) and label.
    - convert: > 0 → nuyen `karma × advance.karmaToNuyenRate` gained; < 0 → `advance.nuyenToKarmaRate` (unset → `optional-rule-off`).
    - Any price or rate setting unset → `unset:<key>`; after the spend a balance below 0 → `not-enough-karma` / `not-enough-nuyen`; a draft runner → `not-finalized`.
  - `record(ch, a, data, cr, typed?, now?)`: the runner with the entry appended (uids made here for new lines), or the reason; `earn(ch, karma, nuyen, run, date)`, `note(ch, text)`.
  - `voidEntry(ch, id, reason)`: earn, advance and note may be voided; an advance only when it is the newest live one (`not-latest`); a void or finalize can't be (`not-voidable`); twice → `already-voided`.
  - `canDraft(ch)`: no live earn or advance since the last Finalize.
  - `validateCareer(data, cr, ch): Violation[]` on the current build: `career.karma` / `career.nuyen` (warning: balance below 0, e.g. after voiding an earning), `catalog.missing` and `essence.positive` (S2's checks reused on `currentBuild`), paths into the tabs as S2's.
- `finalize.ts`: `finalizeSr6` also appends `{ type: 'finalize', karma, nuyen }`; `draftAgain(ch)` returns null unless `canDraft(ch)`, else drops `finalizedAt`/`final` and appends a note "Back to draft" (the old entries stay as history; the next Finalize starts the balances again).
- [ ] Tests first: the 16 of the port map, then:
  - `currentBuild`: three advances replay in order; a voided one is skipped; a draft returns `ch.build`; `ch.build` is never changed by `record` or `voidEntry`.
  - balances: finalize 5 karma / 2,000¥, earn 9 / 3,100¥, a 12-karma raise → 2 karma / 5,100¥; void the earning → −7 karma and `career.karma` on `validateCareer`.
  - void: an older advance → `not-latest`; the newest → allowed; then the next newest is allowed; a note can be voided; the finalize entry can't.
  - an unset `karmaSpec` → `unset:karmaSpec`; an unset `advance.skillMax` → no cap.
  - gear: a Zap Gun bought at its catalog cost, a rated device at rating 3, a cost of `12x` → `book-value`; dropping it refunds 0; after its entry is removed from the catalog the runner replays and `catalog.missing` names it from its name.
  - adept power with power points left → 0 karma; none left → `no-power-points`; mystic adept powerpoint costs 7.
  - `draftAgain` with a live earning → null; after voiding it → a draft with the note; finalize again → a second finalize entry and balances from it.
  - Implement, `npm run check`, commit "SR6 S3: career engine (advancement prices, ledger, replay, void)".

### Task 4: Ledger tab and the career editor
**Files:** `src/sr6/ui/tabs/Ledger.tsx` (new), `src/sr6/ui/EditorView.tsx`, `src/sr6/ui/editor.ts`, `src/sr6/ui/Budgets.tsx`, `src/sr6/ui/tabs/Review.tsx`, `src/sr6/print/Sheet.tsx`, `src/ui/bits.tsx` (only the SR6 `finalTip` text passed from SR6; no Anarchy change).
- `EditorView.tsx`: in career the context's `ch` is a view `{ ...ch, build: currentBuild(ch) }` (budgets, derived values and every tab read it; `update` and `replace` still act on the stored runner); tabs read only except Concept, Review and Ledger, the banner says "Finalized: spend karma and nuyen on the Ledger tab."; `SR6_TABS` gains `['ledger', 'Ledger']` before Print, shown only in career and never for an NPC. `Sr6Ctx` gains `record(a, typed?)` and `ledger(fn)` (earn, note, void), both committed with `undoable: false` (R: Void is the undo for the ledger) and refusing with the sentence under the tabs.
- `editor.ts` `REASONS` + the career codes (`not-enough-karma` "Not enough karma.", `not-enough-nuyen`, `at-maximum` "That’s already at its maximum.", `needs-specialization`, `already-known`, `not-positive`, `not-negative`, `cannot-learn`, `no-power-points`, `mundane-cannot-initiate`, `optional-rule-off` "That optional rule is off: Game data → Creation rules.", `book-value`, `not-latest` "Only the newest spend can be voided: void the later ones first.", `not-voidable`, `already-voided`, `not-finalized`); `reasonText('unset:<key>')` → "<label> isn’t set: Game data → Creation rules." (the label from `expandKeys`).
- `Ledger.tsx` (Anarchy's Ledger tab's layout, two currencies): balances line (karma, nuyen); Record earnings (karma, nuyen, run, date); Spend: an op select (Raise attribute, Raise skill, Specialization, Expertise, Knowledge or language, Buy quality, Buy off quality, Learn spell / ritual / complex form / adept power, Power point (mystic adepts), Initiate or Submerge, Buy gear, Drop gear, Lifestyle, Contact, Karma to nuyen, Nuyen to karma, Other), each with its target (attribute and skill selects showing the current rank, S2's `CatalogPicker` for qualities, picks and gear with rating and grade, selects of the runner's lines for buy off and drop, typed amounts for Contact and Other), a live `preview` line ("AGI 3 → 4 · 12 karma · after: 9 karma, 5,100¥" or the refusal sentence) and Record, confirmed in a dialog as Anarchy's; a note; the history table (when, what, karma, nuyen, running karma, running nuyen, Void on what may be voided, a reason asked; voided rows struck through with the reason).
- `Budgets.tsx`: in career only Karma and Nuyen (the ledger balances, linking to Ledger) and Essence (current build).
- `Review.tsx`: in career shows `validateCareer` (not the creation rules), the derived summary on the current build, the balances, and Back to draft disabled with "Void the ledger’s earnings and spends first (newest first)." while `!canDraft`; the confirm text loses "Career changes come with the ledger in a later update".
- `Sheet.tsx`: karma and nuyen left = the ledger balances in career (the current build is already what it prints).
- [ ] Tests first: `tests/sr6/editor.test.ts`: every reason code of `career.ts` has a sentence; `reasonText('unset:advance.expertise')` names "expertise" and Game data. The tab is driven by Task 9's e2e.
- [ ] Implement, `npm run check`, commit "SR6 S3: Ledger tab and career mode in the editor".

### Task 5: NPC engine — stat blocks at a rating
**Files:** `src/sr6/engine/values.ts`, `src/sr6/engine/npc.ts` (new), `src/sr6/engine/index.ts`, `tests/sr6/values.test.ts`, `tests/sr6/npc.test.ts` (new).
- `values.ts` `formula(s, rating, letter: 'F' | 'L')`: `{ n: number | null; dice?: string; ok: boolean }`: numbers, the letter (or `Rating`), `+ - × x * /` and parentheses, left to right with × and / first; a trailing `+ ND6` kept as `dice`; division rounds up (R, verify Task 10); `—`/empty → null ok; anything else → not ok. `rated()` is unchanged.
- `npc.ts`:
  - `NPC_KINDS: Record<Sr6NpcKind, { label: string; kind: 'npcs' | 'critters' | 'spirits' | 'sprites'; rating?: { label: 'Professional Rating' | 'Force' | 'Level'; letter?: 'F' | 'L' } }>` (grunt: Professional Rating, no letter; critter: none; spirit: Force, F; sprite: Level, L).
  - `npcFromEntry(e: Sr6Entry, rating?: number, now?)`: an SR6 NPC (`blankSr6` with `npc`): `stats` = the entry's attrs but `category`, `rating`, `group`; `lines` = its parts in their order; `from` = the entry's kind, id, name, source, page; grunt `rating` = the entry's Professional Rating, spirit/sprite the given rating; `streetName` = the entry's name. `blankSr6Npc(kind, rating?)`.
  - `npcValues(npc): { key: string; label: string; printed: string; value: string; ok: boolean }[]` (labels BOD … EDG, Essence, Magic, Resonance, Defense Rating, Initiative, Actions, Condition monitor, Movement; sprites Attack, Sleaze, Data Processing, Firewall; value = `formula()` at the rating with its dice, or printed when it has no letter and isn't a number).
  - `npcPools(npc, data): { name: string; rating: number | null; attr?: string; pool?: number; printed: string }[]`: the skills line split on commas; "Name N" or bare "Name" (a spirit's or sprite's bare skill is at its rating, R); the name resolved against `data.skills` by `normName`; pool = rating + the stat block's value of the skill's attribute; unresolved → printed only.
  - `bookNpcKey(e) = \`${e.source}|${e.id}\``.
- [ ] Tests first:
  - `formula('F × 2 + 2D6', 4, 'F')` → 8 + "2D6"; `'8 + F/2'` at 3 → 10; `'F+1'` at 4 → 5; `'(L × 2) + 1'` at 3 → 7; `'6 + 1D6'` → 6 + "1D6"; `'F+?'` → not ok; `'—'` → null ok.
  - `npcFromEntry(Spirit of Puddles, 4)`: AGI 5, DR 8, CM 10, Init "8 + 2D6"; at Force 6 they follow; `npcFromEntry(Corner Goon)`: rating 2, group Street Crew, from CRB p.205, lines in order; Glitch Sprite at Level 3: Sleaze 4, Init 7.
  - `npcPools(Corner Goon)`: Close Combat 4 resolves with its attribute and a pool; Spirit of Puddles' "Splashing" (not in the catalog) is printed only; a resolved bare spirit skill is at the Force; an unreadable stat → `ok: false`, its value the printed text.
  - Implement, `npm run check`, commit "SR6 S3: NPC stat blocks at a rating".

### Task 6: SR6 NPC area
**Files:** `src/sr6/ui/Npcs.tsx` (new), `src/sr6/ui/Sr6App.tsx` (routes `npcs` → `<Sr6Npcs />`, `npcs/trash[/<u>]` → `<TrashScreen game="sr6" npcs user />`, both for admin and editors, players sent to `''`), `src/ui/nav.tsx` (SR6 menu: `['sr6/npcs', 'npcs', 'NPCs & Critters', canEdit(me)]` after Your runners; section `sr6/npcs` for `#/sr6/npcs…` and `#/sr6/n/…`).
- The page, Anarchy's `NpcsScreen` shape (`PageHeader "NPCs & Critters"`, intro "Your NPCs, critters, spirits and sprites, for GMs only: players never see them. Share one with a campaign you run and its other GMs can read and print it."): rows with Face, name, a chip (Grunt PR 2 / Critter / Spirit F 4 / Sprite L 3), the campaign tag; mine first, then other owners' groups (`ownerGroups`); search and sort (`arrange`, own storage key `ca2.sr6.npcs.sort`); per row Print (others'), Export (`exportSr6`; mine: stamped and saved), Share with campaign… / Unshare (`send('sr6/campaigns/<id>/npcs', …)`, the campaigns from Task 8's `loadCampaigns('sr6')`, only ones you GM and not archived), Delete (→ SR6 NPC trash; the Trash (n) link to `#/sr6/npcs/trash`).
- New NPC dialog: kind (Grunt, Critter, Spirit, Sprite); "From the catalog" select of that kind's entries, grunts grouped by Professional Rating (`<optgroup label="Professional Rating 2">`), plus "Blank"; Force or Level input (spirits, sprites; whole number ≥ 1, default 1, R: a UI default, not a book number); Create → `npcFromEntry` / `blankSr6Npc` → saved → `#/sr6/n/<id>/stats`. A kind with no catalog entries offers Blank only, with "No <kind> in the imported books yet."
- Import file (multiple; `readSr6NpcImport`); Load book NPCs: every catalog `npcs` entry whose `bookNpcKey` isn't already a `sampleKey` of yours → `npcFromEntry` with `sampleKey` (R: grunts and named NPCs only; critters, spirits and sprites are made one at a time); none in the catalog → "No book NPCs yet: they come with an imported core rulebook."; all there → "The book NPCs are already in your NPCs."
- Left out (R): Foundry export (F1), Move to compendium (S4), duplicates finder.
- `tests/ui/sr6-npcs.test.ts` (new: the book-load selection on pure helpers: already-loaded keys skipped, a renamed copy still counts; the grunt grouping by rating).
- [ ] Tests first as above; the page is driven by Task 9's e2e.
- [ ] Implement, `npm run check`, commit "SR6 S3: SR6 NPC area".

### Task 7: NPC editor mode, NPC block, NPC print
**Files:** `src/sr6/ui/EditorView.tsx` (NPC mode for `#/sr6/n/<id>/<tab>`: `sr6NpcRepo`, home `#/sr6/npcs`, edit hrefs `#/sr6/n/…`, tabs Concept, Stat block, Print; no Budgets panel, Review, Ledger or StateBadge: the kind chip instead; "Back to NPCs & Critters"), `src/sr6/ui/editor.ts` (`sr6NpcHref(id, tab)`; `Sr6Ctx.npc: boolean`), `src/sr6/ui/Sr6App.tsx` (route `n/<id>/<tab>`, GMs only), `src/sr6/ui/tabs/Concept.tsx` (no metatype line for an NPC), `src/sr6/ui/tabs/Stats.tsx` (new), `src/sr6/print/NpcBlock.tsx` (new), `src/sr6/print/Sheet.tsx` (an NPC prints header, NPC block, background and notes), `src/sr6/print/sheet.css` (NPC block bits, existing tokens).
- Stat block tab: kind; rating stepper labelled from `NPC_KINDS` (not for critters); group (grunts); "Made from <name> (CRB p.N)" or "Blank"; one row per stat: label, the printed value (editable text, committed on Enter/blur), the value at the rating, a warning mark with "Can’t read this" when not ok; an Add stat select for a missing standard key; one textarea per line part the kind uses (grunts, critters and spirits: skills, powers, optional powers, weaknesses, attacks, augmentations, gear, weapons; sprites: skills, powers); the NPC block below as a preview.
- `NpcBlock`: name; "Grunt, Professional Rating 2 · Street Crew" / "Spirit, Force 4" / "Sprite, Level 3" / "Critter"; the stats as a table of values; Initiative, Defense Rating, Actions, Condition monitor, Movement; skills with pools ("Close Combat 4 (pool 7)", unresolved as printed); every other line as printed under its label.
- [ ] Tests first: `tests/sr6/npc.test.ts` + the block's text helper (`npcHeadline(npc)` gives the four headline forms). The tabs are driven by Task 9's e2e.
- [ ] Implement, `npm run check`, commit "SR6 S3: NPC editor mode, NPC block and NPC print".

### Task 8: SR6 campaigns
**Files:** `src/ui/Campaigns.tsx` (a `game?: Game` prop on `CampaignsScreen` and `CampaignScreen`, and `loadCampaigns(game = 'ca2')`: `sr6/` before every `campaigns…` API path and `#/sr6` before every link (list, campaign, runner open and print `#/sr6/c/<id>/…`, NPC `#/sr6/n/<id>/stats`, back after delete); `CampaignScreen`'s `c: Catalog` becomes `label: (r: CampaignRunner) => string` (Anarchy passes today's package-and-level text; SR6 passes `''`, R); `<AskRules />` only on Anarchy; Anarchy behaviour unchanged), `src/ui/App.tsx` (its `CampaignScreen` call passes `label` instead of `c`; `loadCampaigns()`'s default keeps Library, Npcs and Compendiums unchanged), `src/sr6/ui/Sr6App.tsx` (routes `campaigns` → `<CampaignsScreen game="sr6" />`, `campaigns/<id>` → `<CampaignScreen game="sr6" … />`), `src/ui/nav.tsx` (SR6 menu: `['sr6/campaigns', 'campaigns', 'Campaigns', true]`), `src/sr6/ui/Runners.tsx` (per row: the campaign tag, Add to campaign… (campaigns joined and not archived, Anarchy's dialog text) / Remove from campaign; no campaign filter, R).
- (R) Minimal SR6 campaigns = Anarchy's pages as they are: create, rename/note, archive, delete when empty, members, co-GMs (admin), the runners grouped by player (GMs and the admin open and print them read only), the shared NPCs for GMs. The server already keeps the two games' campaigns apart (S0 tests).
- `tests/ui/campaigns-game.test.ts` (new: `loadCampaigns('sr6')` calls `/api/sr6/campaigns`, the default `/api/campaigns`).
- [ ] Tests first as above; the existing `e2e/campaigns.spec.ts` and `e2e/npcs.spec.ts` pass unchanged.
- [ ] Implement, `npm run check` + `npx playwright test e2e/campaigns.spec.ts e2e/npcs.spec.ts`, commit "SR6 S3: SR6 campaigns and Add to campaign".

### Task 9: End to end on the made-up fixture
**Files:** `e2e/sr6-career-npcs.spec.ts` (new; own server and data folder as `e2e/sr6-builder.spec.ts`: the mini and SR6 fixtures copied, accounts Ada admin, Gil editor, Pat player; Pat's runner seeded by `PUT /api/sr6/characters/<id>` from `tests/fixtures/sr6/runner-career.xml` with its ledger cut back to the finalize entry; screenshots to `.extract/screenshots/sr6-s3`).
- [ ] e2e first:
  - Pat, career: the runner opens with the Ledger tab and the badge's career tip; Attributes is read only. Record earnings 9 karma, 3,100¥ "Made-up run". Spend: raise Agility (preview "AGI 3 → 4 · 12 karma"), confirm → Attributes shows 4; a specialization; Buy gear: a Zap Gun (nuyen off); Learn a spell; Initiate with a metamagic. A raise above the balance → "Not enough karma."; with Gil's `karmaSpec` removed on Game data, Specialization → "…isn’t set: Game data → Creation rules." (then Gil sets it back). Void the initiation → grade and karma back; Void on the spell is offered, on the older raise not. Review: no creation errors, balances shown, Back to draft disabled with its reason. Print: AGI 4, the Zap Gun, karma and nuyen left = the balances. Export → import → the copy keeps the ledger. Void every spend and the earning → Back to draft → Finalize again → a second "Creation finished" row.
  - Gil, NPCs: NPCs & Critters in the SR6 menu; New NPC → Grunt: Corner Goon under "Professional Rating 2", Lot Boss under 4 → Create → Stat block: BOD 3, "Close Combat 4 (pool …)"; Spirit of Puddles at Force 4: AGI 5, Defense Rating 8, Initiative "8 + 2D6"; Force 6 → AGI 7; a stat typed as `F+?` shows "Can’t read this"; Glitch Sprite at Level 3: Sleaze 4; Fuzzbeast; a blank grunt. Load book NPCs → three added; again → "already in your NPCs". Print a spirit → its NPC block. Delete one → NPC trash → Restore. Import Pat's runner file → refused "Import it on Your runners".
  - Campaigns: Gil creates "Made-up Sixth" on SR6 Campaigns, adds Pat, shares Corner Goon; Pat adds the runner from Your runners (tag shows); Gil's campaign page lists Pat's runner (Print opens `#/sr6/c/<id>/print`, read only) and Corner Goon (opens read only); Pat's view of the campaign has no NPCs.
  - Pat: no NPCs & Critters in the menu; `#/sr6/npcs` sends Pat to Your runners; `page.request.get('/api/sr6/npcs')` → 403.
  - Isolation: Anarchy's NPCs page and Campaigns page list none of the SR6 ones; `/api/npcs` and `/api/campaigns` hold no SR6 file or campaign.
  - Phone width: Ledger, NPCs and Stat block have no sideways scroll. Check by hand: light and dark.
  - Implement, `npx playwright test` (full suite), `npm run check`, commit "SR6 S3: end-to-end career, NPC and campaign test".

### Task 10: Owner's local real-book check (nothing committed)
- [ ] With the real core rulebook imported locally (S1 Task 10's setup), fill Game data → Creation rules → Advancement and confirm the Karma prices double as career prices, with source and page.
- [ ] Record in `.superpowers/sdd/sr6/s3-realbook.md` (git-ignored; numbers and pages only): the career cap on Magic/Resonance, adept power points after creation, how division rounds in spirit and sprite stats, every stat shape `formula()` can't read (each gets a made-up test in `tests/sr6/values.test.ts`), skill names in NPC lines that don't resolve (aliases in S1's recipe, its own commit).
- [ ] Targets: one career runner through five spends matches a hand calculation; every book grunt loads and prints; one spirit per kind and one sprite per kind read with no warning at two ratings. Fixes commit as "SR6 S3: real-book fixes (…)".

### Task 11: Docs and ledger (controller)
- [ ] `README.md` (SR6 career, NPCs, campaigns), `docs/sr6-character-format.md` (Task 2), `docs/sr6-data-format.md` (the Advancement settings), `CHANGELOG.md` (Unreleased: SR6 S3), `.superpowers/sdd/sr6/progress.md` (S3 range, review fixes, what waits for the book; next S4).
- [ ] Final review of S3 (replay and void, prices only from settings, NPC isolation and GM-only access, campaigns per game, Anarchy unchanged), then `npm run check` + `npm run test:py` + Playwright on `feat/sr6`. No release or install here.

## What depends on the real book, and how tests avoid it
- Every career price, cap and exchange rate is a creation setting the owner enters; tests use the fixture's invented values and `made()`; the repo ships none.
- Grunt, critter, spirit and sprite stat blocks come from S1's import; tests use made-up entries. Stat shapes beyond those in Task 5 are added from Task 10 with made-up strings.
- The Magic cap after initiation, adept power points after creation and division rounding are code marked "verify (Task 10)".

## Rulings (R) summary
- Career spends are explicit ledger operations (the Forge's preview → confirm → record), not Anarchy's logged edits: in career every tab but Concept, Review and Ledger is read only and shows the current build; spending happens on the Ledger tab.
- `ch.build` stays as finalized; the current runner is the build plus the live advances since the last Finalize, replayed. Undo is a void entry that replay skips (append-only). Only the newest live advance can be voided; earnings, notes and Other entries any time. Ledger records and voids aren't on the editor's undo stack.
- Two currencies per entry (karma, nuyen); balances run from the latest Finalize entry (an S2-finalized runner without one starts from `final`). A spend that would take a balance below zero is refused; a void that does is a Review warning.
- Career prices reuse the creation Karma prices; seven optional Advancement settings add the rest. An unset price refuses its spend naming the setting; an unset cap means no cap; nuyen → karma is off until its rate is set.
- Gear drops refund nothing; Contact and Other amounts are typed; lifestyle is priced from the catalog × months; adept powers cost power points, mystic adepts buy power points with karma; an initiation may bring one metamagic or echo.
- Back to draft only while no live earning or spend is left since the last Finalize; it adds a note and keeps the history.
- An SR6 NPC is an SR6 runner file with `<npc>` first and a blank build: a copied stat block (printed values) and a rating, evaluated at the rating; no budgets, Review or ledger. Kinds: grunt (Professional Rating), critter, spirit (Force), sprite (Level); from a catalog entry or blank. A bare skill on a spirit or sprite is at its rating. No full-builder NPCs in S3.
- Load book NPCs copies the catalog's `npcs` entries (key `<source>|<id>`); critters, spirits and sprites are made one at a time. No Python.
- SR6 campaigns reuse Anarchy's pages through a `game` prop; the SR6 runners page gets Add to campaign; no campaign filter, duplicates finder, compendium move (S4) or Foundry export (F1). The server is unchanged.
