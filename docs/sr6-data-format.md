# Chummer SR6 data format

The Shadowrun 6 (SR6) catalog is XML, like Anarchy's (`docs/data-format.md`), but in its own namespace, folders and
schemas: neither game reads the other's files. The app ships only `public/data/sr6/sources.xml` (the books an SR6
recipe supports) and the schemas in `public/data/sr6/schema/`. Everything else comes from the PDFs the admin uploads on
the SR6 Books page. `npm run validate:data` checks the shipped file and the made-up test catalog
(`tests/fixtures/sr6/custom`), and `node tools/validate-data.mjs --sr6=<dir>` checks any SR6 custom folder.

## Common rules

Every file has the same root, and one file holds one kind:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="weapons" version="1">
  ...entries...
</sr6:data>
```

- `kind` names the catalog and picks the schema (`public/data/sr6/schema/<kind>.xsd`, sharing `common.xsd`).
  `version` is the schema version, currently `1`. Child elements are unqualified.
- Every entry has `id` (pattern `[a-z0-9][a-z0-9.-]*`, unique within its kind), `source` (a source id, pattern
  `[A-Z][A-Z0-9-]{0,19}`) and `page` (the printed page). Then a `<name>`, the kind's own children, and an optional
  `<text>`, which is empty in imported files.
- An overlay removes an entry loaded before it with `<remove id="..."/>`.
- **Values are kept as printed**, as strings: dashes are normalized to `—`, `¥` and thousands commas are dropped from
  costs, and nothing else changes. Formulas such as `Rating × 500` or `F+1` stay formulas (the builder parses them).
  Only the attributes marked *int* below are integers. Book errors stay as printed: the import report lists a value
  that doesn't fit its column, and fixes go through the edits layer.
- **Cross-references are names** for now: metatype traits, critter powers, NPC gear and weapons are lists as printed.
- **No prose in the catalog files.** Descriptions, game effects and rule text go only to the source's texts file.

## Kinds

Every entry also has `id`, `source`, `page`, `<name>` and the optional `<text>`. `*` = required.

| file / kind | tag | attributes | children |
|---|---|---|---|
| priorities | priority | letter* (A–E) | metatype (name*, points* int)×n, attributes (points* int), skills (points* int), magic (kind* full\|aspected\|mystic-adept\|adept\|technomancer\|mundane, rating int)×n, resources (nuyen* int) |
| metatypes | metatype | — | range (attr* bod\|agi\|rea\|str\|wil\|log\|int\|cha\|edg, min* int, max* int)×9, trait (text)×n |
| attributes | attribute | abbr* (BOD AGI REA STR WIL LOG INT CHA EDG MAG RES ESS), group* physical\|mental\|special | — |
| skills | skill | attr* (bod … edg, mag, res), untrained* true\|false | spec (text)×n |
| qualities | quality | kind* positive\|negative, karma int, perLevel true, maxLevel int | — |
| weapons | weapon | category*, dv, modes, ar, ammo, avail, cost | — |
| armor | armor | category*, defense, capacity, avail, cost | — |
| augmentations | augmentation | type* cyberware\|bioware, category*, rating, essence, capacity, avail, cost | — |
| electronics | device | category*, rating, array, programs, avail, cost | — |
| gear | gear | category*, rating, capacity, avail, cost | — |
| vehicles | vehicle | category*, handling, accel, interval, topSpeed, body, armor, pilot, sensor, seats, avail, cost | — |
| spells | spell | category* combat\|detection\|health\|illusion\|manipulation, tags, range, type, duration, dv, damage | — |
| rituals | ritual | keywords, threshold | — |
| adeptpowers | adeptpower | cost, perLevel true, maxLevel int, activation | — |
| complexforms | complexform | duration, fade | — |
| metamagics | metamagic | — | — |
| echoes | echo | — | — |
| critterpowers | critterpower | type, action, range, duration | — |
| critters / spirits / npcs | critter / spirit / npc | category, rating int (NPCs: the Professional Rating), group; bod agi rea str wil log int cha ess mag res edg dr init actions cm move | skills, powers, optionalPowers, weaknesses, attacks, augmentations, gear, weapons (text, each at most once, in this order) |
| sprites | sprite | attack, sleaze, data, firewall, init, res | skills, powers |
| lifestyles | lifestyle | cost (per month) | — |
| contacts | contact | connection, loyalty, archetype | — |
| lifemodules | lifemodule | stage* opening\|adult, requires awakened\|emerged\|adept\|magician; ints attributePoints, skillPoints, adjustmentPoints, nuyen, contactPoints, knowledgeSkills | choice (kind* mixed, points int, options* tokens: an attribute bod … res, `skill:<skill id>` or `nuyen:<int>`)×n |
| rules | rule | chapter*, level* int 1–4, parent (a rule id) | — |

Life modules (lifepath creation) are structured grants with no prose. No recipe writes them yet (the core rulebook
prints none); they come with a book that prints them.

The same kind → tag map is `KINDS` in `importer/sr6/__init__.py`, `SR6_KINDS` in `server/games.mjs` and `SR6_KINDS`
in `src/sr6/model/types.ts`.

Three more kinds complete the set:

- `sources`: `<source id* publisher* canon* texts file sha256 imported><name>`. `texts` is the source's private
  descriptions file, relative to `custom/sr6/`. `file`, `sha256` and `imported` (a date) are set by the importer.
- `texts`: `<text of="<kind>" id="<entry id>">…</text>`, merged into the entry's `<text>` by (kind, id).
- `edits`: entries of any kind above, each with `by` (the account that saved it).

## Layout and load order

```
library/sr6/<book-id>/   original.pdf, upload.xml, status.xml, import.xml, book.md, regrouped.md
custom/sr6/
  imported/index.xml               the overlay files, in load order
  imported/sources.xml             the imported books (file, checksum, date)
  imported/crb/<kind>.xml          one file per kind, ids scoped crb.<slug>
  texts/crb.xml                    private descriptions (never committed)
  edits/edits.xml, edits/texts.xml the catalog edits and their descriptions
  creation.xml                     the table's creation rules (Game data; creation.xsd)
```

The app loads `data/sr6/sources.xml`, then `custom/sr6/imported/sources.xml` (merged by source id), then the files in
`custom/sr6/imported/index.xml` (the same id replaces, `<remove>` deletes), then the texts file each source names, then
`custom/sr6/edits/edits.xml` and `edits/texts.xml`.

**Scoping.** Every imported id is scoped by its source (`crb.zap-gun`), as the Anarchy books are, so two books never
clash. Attribute `abbr` and skill `attr` values are never scoped.

**Edits.** An edit is a full entry of its kind with `by`. It replaces the loaded entry with the same id and survives
re-imports. Its description, if any, is in `edits/texts.xml`. An empty one means the book's text.

## Creation rules

`custom/sr6/creation.xml` (`<sr6:creation xmlns:sr6="urn:chummer-sr6:config:1" version="1">`, `creation.xsd`) holds the
numbers the core rulebook prints only in its text: starting karma, caps, exchange rates, point-buy prices, lifepath
counts, augmentation grades. Each is `<setting key value source? page?/>` (500 at most, each key once). The admin or an
editor fills them in on Game data from their own book (`PUT /api/sr6/creation`); the app ships none. Keys, types and
the methods that need them: `CREATION_KEYS` and `expandKeys` in `src/sr6/engine/creation.ts` (per metatype:
`metatypeKarma:<id>`; per awakened or emerged magic kind: `pointBuy.startRating:<kind>`, `magicKarma:<kind>`,
`lifepath.startRating:<kind>`). A creation method whose settings are unset can't be picked.
