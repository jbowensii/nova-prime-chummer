# Shadowrun 6th World ruleset — Design Spec

Date: 2026-10-02. Owner's direction in conversation: add a screen before the first screen to pick Shadowrun Anarchy 2.0
or Shadowrun 6e; SR6 gets the same capabilities as the Anarchy side (character builder, book importer, content
creation, NPCs, compendiums, print, export) and its own Foundry module for the `shadowrun6-eden` system. This restarts
the owner's earlier SR6-eden-Forge project (`C:\Users\johnb\Documents\Projects\SR6-eden-Forge`) inside this framework.

## 1. Decisions

| Question | Decision |
|---|---|
| Data source | The PDFs, as for Anarchy: PDF → markdown → a per-book recipe. **Not** Commlink6 (owner: drop it). The earlier project's direct-from-PDF-layout extraction is not repeated. |
| Tables vs descriptions | A **regroup** step between the markdown and the recipe writes one block per item holding its stat-table row and its description together (owner: "if you want to relocate these so they are together in the markup that is good by me"). Matching is by name; anything unpaired goes to the import report, never guessed. |
| Game separation | Fully separate: runners, NPCs, compendiums, campaigns, books, imported data, catalog edits, trash and settings are per game; nothing is shared or mixed. Only the sign-in account and its role (admin / editor (GM) / player) are shared. Anyone may switch games at any time. |
| Game picker | A first screen with two choices; the last choice is remembered (per browser); a game switch in the header after sign-in. |
| Creation methods | All five in the first builder release: priority, sum-to-ten, point buy, karma, lifepath (lifepath data needs Emerald City; usable once that book is imported). Ported from SR6 Forge's engine (`engine/providers.mjs`, `budgets.mjs`, `rules.mjs`) with its tests. |
| Career | The karma/nuyen ledger, ported from SR6 Forge (`advancement-engine.mjs`, `services/ledger.mjs`): append-only, void/undo, each entry records what was bought and the cost. |
| Foundry | A new public module repo `chummer-sr6-foundry` for `shadowrun6-eden` 4.x (Foundry 13–14), built on the Anarchy importer's patterns but separate code. The old SR6 Forge module and content pack are retired. |
| First book | The SR6 core rulebook only; then one book per release in the owner's order. |
| Repos and install | One Chummer repo, one image, one tower04 install (name unchanged for now). |

## 2. Architecture

- **Shared platform (one copy):** server shell, auth/OIDC/users, the rev/If-Match file stores (runners, NPCs,
  compendiums), campaigns, trash, backup, book upload and import jobs, the AI helper, nav/icons, print infrastructure,
  portrait/token editor, `repo.ts`/storage.
- **Per game (`ruleset` = `ca2` | `sr6`):**
  - Storage: existing Anarchy data stays where it is (no migration). SR6 lives under an `sr6/` area beside it
    (characters, `.npcs`, `.compendiums`, campaigns, `custom/` imported data and edits, library uploads).
  - API: every data route is scoped to a ruleset; the server refuses an object from the other game (e.g. adding an
    SR6 runner to an Anarchy campaign, saving Anarchy XML into the SR6 store).
  - Client: the chosen ruleset selects the catalog loader, model, engine, editor tabs, print sheet and export.
  - Backup: one zip holding both games.
- **Code layout:** SR6 code in its own folders (`src/sr6/{model,engine,ui,print}`, `importer/sr6/`), next to the
  Anarchy code; Anarchy code changes only to move behind the ruleset switch.

## 3. Import pipeline (core rulebook)

1. **Upload** the SR6 core rulebook PDF on the SR6 Books page (same upload/job/status flow).
2. **Markdown:** the existing converter (`importer/convert.py`) turns the PDF into markdown with tables as markdown
   tables; kept with the book for inspection.
3. **Regroup:** reads the markdown chapter by chapter; each stat-table row is keyed by item name; each description is
   found under that item's own heading; they are paired by normalized name (case and punctuation ignored, "(rating)"
   and similar suffixes handled, a small alias list for the book's spelling differences). Output: a regrouped markdown
   file with one block per item (table row + description, reading order). Unpaired rows, unpaired descriptions and
   duplicate names go to the import report.
4. **Recipe** (`importer/sr6/recipes/crb.py`) reads only the regrouped file and writes the SR6 catalog (XML + XSD per
   kind): priority table, metatypes, attributes, skills and specializations, qualities, gear (weapons, armor,
   cyberware/bioware, electronics, others), spells, rituals, adept powers, complex forms, critters, spirits, sprites,
   NPCs, lifestyles, contacts, and rule sections (Rules page and Foundry journals).
5. **Book errors** stay as printed: warnings in the app, never corrected in the files; fixes go through the edits
   layer and survive re-imports.
6. The earlier project's PDF table code (`extractor/xtable.py`, `rowengine.py`) is used only where the converter loses
   a table.

## 4. Builder

- **Model:** attributes BOD AGI REA STR WIL LOG INT CHA EDG (+ MAG or RES); essence; skills with specializations and
  expertise; knowledge skills and languages; qualities; tradition, spells, rituals, adept powers, initiation and
  metamagics; complex forms, echoes, submersion; augmentations with grades; gear with ratings and accessories;
  vehicles and drones; contacts; lifestyles; SINs and licences; karma, nuyen, Edge. One XML file per runner with its
  own XSD (`sr6:character`), read/write/repair like `charxml.ts`.
- **Engine:** one engine with a budget provider per method; itemized budgets (attribute points, skill points, karma,
  nuyen, essence, power points, contact points, knowledge points). Rule numbers (priority rows, limits) come from the
  imported core rulebook catalog, not code.
- **Derived values:** dice pools, condition monitors, initiative, Defense Rating, Attack Ratings, Composure, Judge
  Intentions, Memory, lift/carry, essence and its magic loss. Review lists every broken rule with its page.
- **Editor tabs:** Concept, Creation method, Attributes, Skills, Qualities, Magic or Resonance (when present),
  Augmentations, Gear, Vehicles, Contacts & lifestyle, Review, Ledger.
- **Finalize → career:** changes go through the karma/nuyen ledger.
- **NPCs:** the NPC area as in Anarchy (GM-only store, sharing with a campaign's GMs, trash); SR6 grunts by
  Professional Rating, critters, spirits and sprites in the editor's NPC mode.
- **Compendiums:** per-game, as Anarchy's (private / campaign GMs / table), holding SR6 entry kinds.
- **Print:** an SR6 sheet on the shared print page (background, portrait, page-break rules); a rulebook-style sheet later.

## 5. Export and Foundry module

- **Export:** a separate format "Chummer SR6 export v1" (`public/data/schema/sr6-export.schema.json`,
  `docs/sr6-export-format.md`): runners and NPCs (portrait, token, item categories); book export per book (all
  selectable, descriptions toggle, GM-only); compendiums export as their own books. Each module refuses the other
  game's file with a clear message.
- **`chummer-sr6-foundry`:** runners → Player actors; NPCs/critters/spirits/sprites → NPC/Critter/Spirit actors;
  items → Eden types (skill, quality, gear by `system.type`, spell, ritual, adeptpower, complexform, contact,
  lifestyle, sin, focus, metamagic, echo). Writes raw inputs only and lets Eden derive pools and monitors. Same
  behaviour as the Anarchy module: world import with Replace / Add as new version / Skip; book compendiums per book
  and topic, never empty; icon rules (owner's shadowrun-gen art, never overwrite user-chosen art); separate portrait
  and token; GM-only data in GM notes; Quench tests.

## 6. Releases

| Release | Content |
|---|---|
| S0 | Game picker, per-game storage and API scoping; Anarchy moved behind the switch, otherwise unchanged; existing data keeps working. |
| S1 | Core rulebook import: markdown → regroup → recipe; SR6 catalog; SR6 Books, Rules and Game data pages. |
| S2 | SR6 model, engine with all five methods (ported with tests), editor tabs, Review, print. |
| S3 | Career ledger; NPCs, critters, spirits, sprites. |
| S4 | SR6 compendiums. |
| F1 | `chummer-sr6-foundry` first release (runners and books), alongside S2/S3 once the export format is fixed. |
| Later | One supplement per release, in the owner's order (lifepath data with Emerald City). |

Each release is built task by task with reviews, released and installed on tower04 before the next.

## 7. Safety

- No book text in either repo; tests use made-up content; the owner's real-book check stays local.
- Book art stays local only.
- Game separation is enforced by the server (tests prove an object from one game can't be read, saved or shared in the other).
- The owner's ignored files and private data are never committed.
