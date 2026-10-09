# Export format (Chummer Anarchy export v1)

One JSON file that other tools read; the first is the Foundry VTT importer module
(`jbowensii/chummer-anarchy2-foundry`). It is separate from the runner's own XML file
(`docs/character-format.md`), which stays the format the app stores. The schema is
`public/data/schema/export.schema.json` (JSON Schema draft 2020-12, `$id` `urn:chummer-anarchy2:export:1`).
The producer is `src/engine/export.ts`.
Shadowrun 6 has a separate format, Chummer SR6 export v1: see `docs/sr6-export-format.md`.

Two kinds, told apart by `kind`:

- `runners`: one or more runners as the app shows them now (their current build).
- `books`: the ticked books' data (amps, items, vehicles, skills, specializations, rules) as the app sees it, with edits and house rules applied, plus the table rules that are switched on.

Files are named `runners-YYYY-MM-DD.ca2foundry.json` and `books-YYYY-MM-DD.ca2foundry.json` (the date of the export). The importer goes by `format` and `kind`, never the name.

The export dialog says: "For your own Foundry only. Don’t share this file." The runners dialog adds: "The file includes the text of the runners’ amps and gear. Share it only with people who own the books."

## Envelope

| Field | Meaning |
|---|---|
| `format` | always `"chummer-anarchy2-export"` |
| `version` | `1` |
| `kind` | `"runners"` or `"books"` |
| `exportedAt` | ISO 8601 time of the export |
| `app` | `{ name, version }` of the app that wrote it |
| `descriptions` | `true` if description texts are included (see below) |
| `runners` | kind `runners` (required there): array of runners |
| `books` | kind `books` (required there): array of books |
| `tableRules` | kind `books`: `[{ name, text }]`, the switched-on table rules |

## Runner

Every number is the engine's own, from the runner's current build: attributes, edge, essence, monitor, thresholds, armor,
initiative and dice pools come from `derive`; an amp's `rating` from `ampRating`; `nuyen.balance` from `balance` for a
finalized runner (before that, what is left of the build budget).

| Field | Meaning |
|---|---|
| `id`, `updatedAt`, `exportedAt` | the runner's id, last change, this export's time |
| `streetName`, `realName` | identity |
| `gender` | optional: the runner's gender as the player wrote it (left out when not set) |
| `finalized` | true once the build is finalized and career play has begun |
| `metatype` | `{ id, name, ranges, edge }`: attribute ranges `[min, max]` per attribute, and the edge. A critter or spirit may have none: `id` `""`, `name` "Critter" or "Spirit" |
| `level` | `{ id, name }` of the build level |
| `lifestyle` | `{ id, name, perRun }` |
| `portrait` | a data URL, or `null` |
| `token` | optional, the round token picture: a data URL (`data:image/png` or `data:image/jpeg`, base64), or `null`: none, use the portrait |
| `attributes` | `str`, `agi`, `wil`, `log`, `cha` as built |
| `edge`, `essence` | derived |
| `skills` | `[{ id, name, attr, rating, specs: [{ id, name, attr, custom }] }]` |
| `knowledge` | `[{ name, kind, native }]`: knowledge skills and languages |
| `amps` | amps (qualities, powers, programs and so on), see below |
| `items` | gear, weapons, armor, spells and complex forms, see below |
| `vehicles` | `[{ uid, chassisId, name, chassis, count, pilot, body, handling, speed, armor, mount, flying, thresholds, monitor }]`, see below |
| `monitor` | `{ light, serious, incap }` |
| `thresholds` | `{ physicalNone, physicalMain, physicalAlt, mental, matrix? }`, see below |
| `armor` | `{ main, alt }`: the armor rating with the main and the alternative armor worn (authoritative, see Risk Reduction and bonuses) |
| `initiative` | `{ level, realm?, source }`, or `null` |
| `pools` | `[{ skill, spec?, label, attr, dp, rr }]`: dice pool and Risk Reduction per skill |
| `narrative` | `{ keywords, dispositions, cues }` |
| `background`, `notes` | free text |
| `nuyen` | `{ balance }` |
| `ledger` | `[{ at, type, summary, amount }]`: the active career events, a cost as a negative amount; a `finalize` line is "Creation finished" with the nuyen left as its amount; buy, sell, amp, advance, specialization and knowledge lines name the thing |
| `npc` | optional, an NPC only (absent: a runner): `{ kind, tier, fightingSpirit? }`, `kind` `npc`, `critter` or `spirit`; `tier` `prime` (managed like a runner, with Edge) or `regular` (no Edge, average hits); `fightingSpirit` `null`, `low`, `high` or `extreme`. GM-only data: an NPC's attributes may lie outside its metatype's ranges |

### Amps

`uid`, `type`, `typeName`, `name`, `canon`, `rating`, `essence`, `effects`, `rr`, `bonuses`; optionally `catalogId`,
`source`, `page` (when the amp comes from a book), `item` (the uid of the linked item) and `vehicle` (the chassis catalog id), `description`.

- `effects`: `[{ id, name, category, param?, value?, note? }]`, the picks as made. `value` is a number.
- `rr` and `bonuses` are described under Risk Reduction and bonuses. On a runner, `bonuses` are attributed so that they add up to the sheet (see there).

### Vehicles

A vehicle amp (`type` `vehicle`) IS the vehicle: `vehicles[].uid` is that amp's own `uid`, and the amp's `vehicle` field is the
chassis catalog id, which is `vehicles[].chassisId` (and the `id` of a book vehicle). `chassis` is the chassis' name.
`count` is how many vehicles or drones the amp stands for (1, plus one per Extra Drone pick). `speed` already includes flying
(doubled or the chassis' flying speed, then Speed upgrades) and is 0 for a fixed one. `thresholds` are the vehicle's three
damage thresholds and `monitor` its own wound boxes; the rigger's `monitor` does not include them.

### Thresholds

`thresholds` has the keys `physicalNone` (no armor worn), `physicalMain` (main armor), `physicalAlt` (alternative armor) and
`mental` (all required), and `matrix` (only when the runner has a firewall: a cyberdeck or an emerged technomancer). Each is an
array of 3 integers: the thresholds for a light, a serious and an incapacitating hit.

### Items

`uid`, `kind` (`gear`, `weapon`, `armor`, `spell`, `complex-form`; book items use the same kinds), `name`, `canon`, `price`; optionally `catalogId`,
`source`, `page`, `category` (the catalog category, as on book items; spells: `combat`, `detection`, `health`, `illusion`, `manipulation`), `starting`, `note`, `description`.

- `weapon`: `{ dv, dvText, ranges, specialist, ammo }`. `dv` is the derived damage value, `dvText` what the item prints.
- `armor`: `{ value, over? }`.

## Book

`{ source, amps, items, vehicles, skills, specs, rules }`, and optionally `metatypes`, `reference`, `characters` and `npcs`.

- `source`: `{ id, name, publisher, canon }`, and `compendium: true` (optional) when the "book" is a GM's compendium rather than a book: its own source id, `publisher` the owner's name, `canon` false, descriptions always included (the GM's own text), and its NPCs in `npcs`. Absent on books.
- `amps`: `id`, `source`, `page`, `canon`, `type`, `typeName`, `name`, `rating`, `essence`, `mod`, `effects`, `rr`, `bonuses`, and optionally `printedRating`, `item` (`{ kind, specialist, armor?, dv?, ranges? }`), `vehicle`, `description`.
  A book amp's `rating` is computed as a non-first quality (`isFirstQuality` false), and a negative rating is clamped to 0.
  `printedRating`, when present, is what the book printed.
- `items`: `id`, `source`, `page`, `canon`, `kind`, `name`, `specialist`, and optionally `category`, `armor`, `dv`, `ranges`, `description`.
- `vehicles`: `id`, `source`, `page`, `name`, `pilot`, `body`, `handling`, `speed`, `armor`, `mount`, optionally `flyingSpeed` (the chassis' flying speed, when it has one).
- `skills`: every skill whose source is this book (core skills belong to the core book): `id`, `source`, `page`, `name`, `attr`, optionally `alt`, and `specs: [{ id, name, attr }]`.
- `metatypes` (optional): `{ id, source, page, canon, name, edge, ranges, racialQuality }` for each metatype whose source is this book; `ranges` as on a runner's metatype.
- `reference` (optional): the kinds the Foundry system has no document for, so the compendiums hold everything: `[{ kind, id, source, page, name, stats, description? }]`, `kind` `levels`, `packages`, `lifestyles`, `ampTypes`, `ampEffects` or `attributes`, `stats` the entry's printed numbers and words (`{ nuyen: 0, skillCap: 6 }`), `description` with descriptions on (a lifestyle's text). The module makes a reference journal per kind, a page per entry.
- `characters` (optional): the book's own sample (pregen) characters, each exactly as a runner in a runners file (see Runner), descriptions per the file's `descriptions`. Only the imported book's samples (`custom/imported/samples.xml` rows whose `source` is this book, matched case-insensitively); the server's example sets are not books and never appear. Absent when the book has none.
- `npcs` (optional): the book's NPCs, critters and spirits, each as a runner with its `npc` block. Absent when the book has none.
- `specs`: this book's specializations on another book's skill: `{ skill, id, name, attr, page? }`.
- `rules`: `id`, `source`, `page`, `sheet`, `section`, `title`, optionally `sheetName`, and `text` when descriptions are on. `sheetName` is the sheet's display name (`base` is "Basics", `technomancers` "Technomancers", `optional` "Optional rules", `vehicles` "Vehicles & Drones"; any other sheet id title-cased). A rule whose section is empty gets its `sheetName` as `section`.

Book vehicles, skills and rules carry no `canon` of their own: take it from `source.canon` of the book they are in.

## Ranges

A weapon's ranges are `{ melee, short, medium, long }`, each `"ok"`, `"disadvantage"` or `"none"`.
The catalog writes them as `OK/OK/Dis./–` (melee/short/medium/long); `parseRanges` converts.

## Risk Reduction and bonuses

`rr` lists the Risk Reduction lines an amp gives: `{ on, id, name, value, skill? }`, where `on` is `attribute`, `skill` or `spec`,
`id` the attribute, skill or specialization id, and `value` how many times it was picked (1 or more). On a `spec` line `skill` is the
id of the skill that owns the specialization, when known.

`bonuses` are the amp's fixed bonuses, whole numbers of 0 or more, from its effects. They are per amp, but the sheet caps some of them
across all amps, so on a runner's amps:

| Bonus | From effect |
|---|---|
| `light` | `wound-light`: 1 on the first amp (not a cyberdeck or vehicle amp, whose boxes are its own) that has it, 0 on every other, so the amps sum to `monitor.light` - 2 |
| `serious` | `wound-serious`, the same way: they sum to `monitor.serious` - 1 |
| `physicalThreshold` | always 0 |
| `mentalThreshold` | `mental-armor`, one per pick |
| `matrixThreshold` | `firewall-plus`, one per pick |
| `armor` | `armor-plus`, one per pick; uncapped raw counts |
| `anarchy` | always 0 |
| `initiative` | the highest of `init-1`, `init-2`, `init-3` picked (1, 2 or 3); on a runner, only the amp that gives the runner's `initiative` (the highest level, the first such amp on a tie) carries it, the others 0 |

The runner's `armor` totals and `thresholds` are authoritative: an amp's `armor` is a raw count, uncapped, and the sheet caps Armor +1
across all amps and applies it by worn armor, so an importer takes armor from the totals, not by summing amps. A book amp has no
runner around it, so its `bonuses` are simply its own values.

## Descriptions

With `descriptions: true` the file carries description texts: amp narratives, item texts, rule texts and the table rules' text.
With `false` those are left out (`description` and `text` are absent; each table rule keeps its `name` and an empty `text`).
A runner amp's `description` is the amp's text as it is on the runner (it may be the player's own); item, rule and table-rule texts are book text. Share a file with descriptions on only with people who own the books.

## What never goes in a file

Passwords, sessions, keys (including the AI provider keys and settings), owner usernames, other users' data beyond the runners exported, campaign membership, PDFs, and the server's own paths. A runner's
portrait and free text are the player's own and are included.

## Versioning

A breaking change is version 2. Readers refuse a `version` they do not know. Additions within v1 are optional fields, so
a reader ignores fields it does not know.

## Example

A made-up runner with one amp and one weapon (no description texts):

```json
{
  "format": "chummer-anarchy2-export",
  "version": 1,
  "kind": "runners",
  "exportedAt": "2026-10-02T09:15:00.000Z",
  "app": { "name": "Chummer Anarchy 2.0", "version": "0.6.0" },
  "descriptions": false,
  "runners": [{
    "id": "r-1", "updatedAt": "2026-10-01T18:00:00.000Z", "exportedAt": "2026-10-02T09:15:00.000Z",
    "streetName": "Sample", "realName": "Made Up", "finalized": true,
    "metatype": { "id": "human", "name": "Human", "ranges": { "str": [1, 6], "agi": [1, 6], "wil": [1, 6], "log": [1, 6], "cha": [1, 6] }, "edge": 2 },
    "level": { "id": "runner", "name": "Runner" },
    "lifestyle": { "id": "low", "name": "Low", "perRun": 5000 },
    "portrait": null, "token": null,
    "attributes": { "str": 2, "agi": 3, "wil": 2, "log": 3, "cha": 2 },
    "edge": 2, "essence": 6,
    "skills": [{ "id": "firearms", "name": "Firearms", "attr": "agi", "rating": 3, "specs": [] }],
    "knowledge": [{ "name": "Sample tongue", "kind": "language", "native": true }],
    "amps": [{ "uid": "a-1", "type": "equipment", "typeName": "Equipment", "name": "Sample gadget", "canon": false, "rating": 1, "essence": 0,
      "effects": [{ "id": "armor-plus", "name": "Armor +1", "category": "combat" }], "rr": [],
      "bonuses": { "light": 0, "serious": 0, "physicalThreshold": 0, "mentalThreshold": 0, "matrixThreshold": 0, "armor": 1, "anarchy": 0, "initiative": 0 } }],
    "items": [{ "uid": "i-1", "kind": "weapon", "name": "Sample pistol", "canon": false, "price": 500,
      "weapon": { "dv": "4P", "dvText": "4P", "ranges": { "melee": "none", "short": "ok", "medium": "ok", "long": "disadvantage" }, "specialist": false, "ammo": [] } }],
    "vehicles": [],
    "monitor": { "light": 2, "serious": 1, "incap": 1 },
    "thresholds": { "physicalNone": [2, 5, 8], "physicalMain": [3, 6, 9], "physicalAlt": [2, 5, 8], "mental": [2, 5, 8] },
    "armor": { "main": 1, "alt": 0 },
    "initiative": null,
    "pools": [{ "skill": "firearms", "label": "Firearms", "attr": "agi", "dp": 6, "rr": 0 }],
    "narrative": { "keywords": ["Sample"], "dispositions": [], "cues": [] },
    "background": "", "notes": "",
    "nuyen": { "balance": 1200 },
    "ledger": []
  }]
}
```
