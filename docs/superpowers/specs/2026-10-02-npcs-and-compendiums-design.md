# NPCs, critters and user compendiums — Design Spec

Date: 2026-10-02. Owner's direction in conversation: GMs (editors) and the admin can create, import and export NPCs
and critters, and create their own content (vehicles, gear, weapons, armor, amps, spells…) grouped in their own
compendiums, all exportable to Foundry. Order: NPCs first, then compendiums, then runners using shared custom content.
The owner asked to build all of it without waiting on further questions; the controller's rulings are marked (R).

## 1. Decisions

| Question | Decision |
|---|---|
| Who sees NPCs | (R) A GM-only area: admin and editors. Players never receive NPCs from the server. A GM may share an NPC with a campaign: the campaign's GMs (and the admin) see it; its players don't. |
| Where they're stored | (R) A store apart from runners, so no player path can ever list them: `charDir/.npcs/<owner>/*.xml` (+ `.trash/`), served only by an editor-gated `/api/npcs`. Same character XML format (one reader/writer), with an `npc` block. Backups include it (it's under `characters/`). |
| What an NPC is | A `Character` with `npc: { kind: 'npc' \| 'critter' \| 'spirit', tier: 'prime' \| 'regular', fightingSpirit?: 'null' \| 'low' \| 'high' \| 'extreme' }` (book p.81-82: prime = managed like a PC with Edge; regular = no Edge, average-hit thresholds; on-the-fly needs no record). Critters and spirits may have no metatype (`metatype` = '' shown as "Critter"/"Spirit") and attributes outside metatype ranges. |
| Rules checks | An NPC skips the player-creation checks (budget, level caps, attribute-at-max count, skill caps, runner basics, RR caps, the 5/4/4 narrative count). Structural checks stay (unknown entries, requires-awakened/emerged, essence). Price is shown for information only. |
| Regular NPC numbers | Average hits per pool: **T = round(DP/3) + RR + 1** (book p.81), written like the book: "Ranged Weapons 5 (5+A, RR 1)". Shown on the NPC's Review/print sheet. Prime NPCs show dice pools and Edge like a runner. |
| Editing | The runner editor in an NPC mode: no budget receipt or Finalize/career; the Concept tab gets an NPC panel (kind, tier, fighting spirit); every other tab as for runners (skills, amps, gear, spells, vehicles). |
| Book NPCs and critters | The importer reads the core rulebook's NPC and critter stat blocks (chapter "Hell Is Other People", p.243-265) into the CRB book's NPC list. (R) Stat blocks that give rows for several metatypes import with the human row (others listed in the NPC's notes); "Choose 1 Shadow Amp" options import the first option, the rest listed in notes. Spirits import as spirits. A GM loads them into their NPC area with "Load book NPCs" (copies, like example characters). |
| Export / Foundry | NPCs export in the runners file format with their `npc` block (optional v1 field); the book export carries each book's NPCs (`npcs`, optional). The Foundry module imports them as sra2 `character` actors (sra2 has no NPC actor type — checked in 14.3.3): an "NPCs & Critters" compendium per book; NPC files imported into the world folder "Chummer NPCs". GM-only data (tier, fighting spirit, average hits) goes in the actor's GM description (`system.bio.gmDescription`). Tokens: hostile disposition; regular NPCs unlinked tokens, prime NPCs linked. |
| Compendiums (phase 2) | A compendium = a named collection owned by a GM/admin with a sharing setting (private / campaign GMs / table) holding custom entries: amps, weapons, armor, gear, spells, complex forms, vehicles, NPCs/critters. Books appear as read-only compendiums. Entries are made from scratch, copied from a book entry, or (NPCs) moved in. Stored server-side behind `/api/compendiums` (never the public `/custom/` path), one XML per compendium. Export: a compendium exports like a book (its own source id), and the module imports it as its own compendium folder. |
| Runners using custom content (phase 3) | Entries of compendiums shared with the table (or with a campaign the player is in) join the catalog the player sees, as a source of origin `user`, marked "House" like non-canon content; runners can pick them in every picker. |

## 2. Phases and releases

1. **NPCs** — Chummer 0.7.0 (+ importer recipe), Foundry module 0.5.0.
2. **Compendiums and custom entries** — Chummer 0.8.0, module 0.6.0.
3. **Runners use shared custom entries** — Chummer 0.9.0.

Each phase gets its own plan, built task by task with reviews, released and installed on tower04 before the next.

## 3. Phase 1 detail (NPCs)

- **Model/format:** `Character.npc` (above); character XML `<npc kind tier fightingSpirit/>` element (schema, charxml read/write, importer `character_xml` mirror); export format: optional `npc` on runners, optional `npcs` on books (schema + doc).
- **Engine:** `isNpc(ch)`; validate/price switches; `averageHits(dp, rr)`; derive unchanged.
- **Server:** `server/npcs.mjs`: `GET /api/npcs` (own; admin: all, grouped by owner; editor: + NPCs shared with campaigns they GM), `PUT /api/npcs/:id` (owner only; rev/If-Match; `campaign` kept), `DELETE` (to the owner's NPC trash), trash list/restore; `need('/api/npcs') = editor`; campaigns: GM view lists the campaign's shared NPCs (names, owner), members' view never; account rename/delete moves/retires NPC folders as runner folders are.
- **Client:** `npcRepo` (same `Repo` shape over `/api/npcs`; browser mode: a separate localStorage key); `#/npcs` page (editor/admin only, server or browser mode) with list/search/sort, New NPC (kind, tier, metatype or none), Import file, Load book NPCs, Export for Foundry (multi), share with a campaign; editor route `#/n/<id>/<tab>` reusing EditorView in NPC mode; print sheet NPC block (kind, tier, fighting spirit, average hits for regular NPCs).
- **Importer:** CRB recipe step for p.243-265 NPC/critter/spirit blocks → `custom/imported/crb/npcs/*.xml` + `custom/imported/npcs.xml` index (`<npc source href name kind tier page/>`); Python unittest with a made-up mini PDF/markdown; the owner's real-book check stays local (tests/books).
- **Foundry module 0.5.0:** translateRunner reads `npc` (gmDescription block, token disposition/link), book `npcs` → "NPCs & Critters" pack, world NPC import into "Chummer NPCs", default icons (npc → `grunt`, critter → `critter_awakened`, spirit → `spirit`) as the actor image only when the NPC has no portrait.

## 4. Safety

- Players never receive NPC data: the store is outside every player path, `/api/npcs` is editor-gated, the campaign member view excludes NPCs; tests prove a player gets 403 and an empty roster.
- Book NPC files under `/custom/imported/` are readable by any signed-in user like all imported book data (same as today's book catalog); the NPC *area* and GM-made NPCs are GM-only.
- No book text in the repos (tests use made-up content).
