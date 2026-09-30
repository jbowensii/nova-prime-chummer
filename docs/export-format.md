# Export format (Chummer Anarchy export v1)

One JSON file that other tools read; the first is the Foundry VTT importer module
(`jbowensii/chummer-anarchy2-foundry`). It is separate from the runner's own XML file
(`docs/character-format.md`), which stays the format the app stores. The schema is
`public/data/schema/export.schema.json` (JSON Schema draft 2020-12, `$id` `urn:chummer-anarchy2:export:1`).
The producer is `src/engine/export.ts`.

Two kinds, told apart by `kind`:

- `runners`: one or more runners as the app shows them now (their current build).
- `books`: the ticked books' data (amps, items, vehicles, skills, specializations, rules) as the app sees it, with edits and house rules applied, plus the table rules that are switched on.

Files are named `runners-YYYY-MM-DD.ca2foundry.json` and `books-YYYY-MM-DD.ca2foundry.json` (the date of the export). The importer goes by `format` and `kind`, never the name.

The export dialog says: "For your own Foundry only. Don't share this file."

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
| `finalized` | true once the build is finalized and career play has begun |
| `metatype` | `{ id, name, ranges, edge }`: attribute ranges `[min, max]` per attribute, and the edge |
| `level` | `{ id, name }` of the build level |
| `lifestyle` | `{ id, name, perRun }` |
| `portrait` | a data URL, or `null` |
| `attributes` | `str`, `agi`, `wil`, `log`, `cha` as built |
| `edge`, `essence` | derived |
| `skills` | `[{ id, name, attr, rating, specs: [{ id, name, attr, custom }] }]` |
| `knowledge` | `[{ name, kind, native }]`: knowledge skills and languages |
| `amps` | amps (qualities, powers, programs and so on), see below |
| `items` | gear, weapons, armor, spells and complex forms, see below |
| `vehicles` | `[{ uid, name, chassis, pilot, body, handling, speed, armor, mount, flying, thresholds, monitor }]` |
| `monitor` | `{ light, serious, incap }` |
| `thresholds` | threshold lists by kind |
| `armor` | `{ main, alt }` |
| `initiative` | `{ level, realm?, source }`, or `null` |
| `pools` | `[{ skill, spec?, label, attr, dp, rr }]`: dice pool and Risk Reduction per skill |
| `narrative` | `{ keywords, dispositions, cues }` |
| `background`, `notes` | free text |
| `nuyen` | `{ balance }` |
| `ledger` | `[{ at, type, summary, amount }]`: the active career events, a cost as a negative amount |

### Amps

`uid`, `type`, `typeName`, `name`, `canon`, `rating`, `essence`, `effects`, `rr`, `bonuses`; optionally `catalogId`,
`source`, `page` (when the amp comes from a book), `item` and `vehicle` (the linked item and vehicle), `description`.

- `effects`: `[{ id, name, category, param?, value?, note? }]`, the picks as made. `value` is a number.
- `rr` and `bonuses` are described under Risk Reduction and bonuses.

### Items

`uid`, `kind` (`gear`, `weapon`, `armor`, `spell`, `complex-form`), `name`, `canon`, `price`; optionally `catalogId`,
`source`, `page`, `starting`, `note`, `description`.

- `weapon`: `{ dv, dvText, ranges, specialist, ammo }`. `dv` is the derived damage value, `dvText` what the item prints.
- `armor`: `{ value, over? }`.

## Book

`{ source, amps, items, vehicles, skills, specs, rules }`.

- `source`: `{ id, name, publisher, canon }`.
- `amps`: `id`, `source`, `page`, `canon`, `type`, `typeName`, `name`, `rating`, `essence`, `mod`, `effects`, `rr`, `bonuses`, and optionally `printedRating`, `item` (`{ kind, specialist, armor?, dv?, ranges? }`), `vehicle`, `description`.
  A book amp's `rating` is computed as a non-first quality (`isFirstQuality` false), and a negative rating is clamped to 0.
  `printedRating`, when present, is what the book printed.
- `items`: `id`, `source`, `page`, `canon`, `kind`, `name`, `specialist`, and optionally `category`, `armor`, `dv`, `ranges`, `description`.
- `vehicles`: `id`, `source`, `page`, `name`, `pilot`, `body`, `handling`, `speed`, `armor`, `mount`, optionally `flyingSpeed`.
- `skills`: `id`, `source`, `page`, `name`, `attr`, optionally `alt`, and `specs: [{ id, name, attr }]`.
- `specs`: this book's specializations on another book's skill: `{ skill, id, name, attr, page? }`.
- `rules`: `id`, `source`, `page`, `sheet`, `section`, `title`, and `text` when descriptions are on.

## Ranges

A weapon's ranges are `{ melee, short, medium, long }`, each `"ok"`, `"disadvantage"` or `"none"`.
The catalog writes them as `OK/OK/Dis./–` (melee/short/medium/long); `parseRanges` converts.

## Risk Reduction and bonuses

`rr` lists the Risk Reduction lines an amp gives: `{ on, id, name, value }`, where `on` is `attribute`, `skill` or `spec`,
`id` the attribute, skill or specialization id, and `value` how many times it was picked (1 or more).

`bonuses` are the amp's fixed bonuses, whole numbers of 0 or more, from its effects:

| Bonus | From effect |
|---|---|
| `light` | `wound-light` (at most 1; 0 on a cyberdeck or vehicle amp, whose boxes are its own) |
| `serious` | `wound-serious` (at most 1; 0 on a cyberdeck or vehicle amp) |
| `physicalThreshold` | always 0 |
| `mentalThreshold` | `mental-armor`, one per pick |
| `matrixThreshold` | `firewall-plus`, one per pick |
| `armor` | `armor-plus`, one per pick |
| `anarchy` | always 0 |
| `initiative` | the highest of `init-1`, `init-2`, `init-3` picked (1, 2 or 3) |

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
    "portrait": null,
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
    "monitor": { "light": 4, "serious": 3, "incap": 1 },
    "thresholds": { "physical": [2, 3] },
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
