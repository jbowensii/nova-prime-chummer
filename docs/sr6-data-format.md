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
- **Prices** (`cost`, `avail`, a focus's `karma`, an implant's `essence`) are a number or a formula the app evaluates at
  the rating the item is bought at: numbers, `Rating` (also `Capacity`, `Force` or `Level`, any case: the same
  rating), `+`, `×`/`x`/`*`, `/` (rounded up), `^` and parentheses, an optional leading `+` (an add-on's price) and a
  legality suffix on `avail` (`(L)`, `I`, …). An item priced by its capacity takes its capacity range as its `rating`.
  `per` names what one cost buys (`10 rounds`, `100m`, `month`). A row printing two items is split into two entries:
  `A/B` names with `x/y` prices, `x/month or y/year` prices (`<name> (month)`, `<name> (year)`), and the cyberlimb
  table's per-variant price columns (`<name> (synthetic)`, `<name> (obvious)`). A price naming another item
  (`900 + Gizmo`) stays as printed and is reported.
- **Formulas and issues** (optional children of any entry, after its kind's own children and before `<text>`; see
  Formulas and issues below): `<formula field="cost">R * 200</formula>` says how a field is worked out, the printed
  attribute staying as printed; `<issue field="avail" code="missing" page="91">note</issue>` marks a field the book
  prints nothing for, or one the importer couldn't read.
- **Choices** (optional children of any entry, `<choice kind="…"/>`): what the player picks when the entry is taken.
  `kind` is one of: `quality` (count picks from the qualities of `category`, max the most), `mixed` (a life module's
  `points` to one of `options`), `skill` (one of `from`, names separated by `; `), `specialization` (in the chosen
  skill, or in `category`), `knowledgeskill`, and `sense`, `trueelement`, `licencetype` (one entry of that kind, of
  `category` when given). `free` labels a value the player may write instead (`other (L) item`). The importer writes
  them for a power's `select a sense (sight, hearing, …)`, for a bracketed power definition (`Skill (choose one from
  …)`), for a heading's `selected from the list below` options, and for Fake License's licence type.
- **Cross-references are names** for now: metatype traits, critter powers, NPC gear and weapons are lists as printed.
- **No prose in the catalog files.** Descriptions, game effects and rule text go only to the source's texts file.

## Kinds

Every entry also has `id`, `source`, `page`, `<name>` and the optional `<text>`. `*` = required.

| file / kind | tag | attributes | children |
|---|---|---|---|
| priorities | priority | letter* (A–E) | metatype (name*, points* int)×n, attributes (points* int), skills (points* int), magic (kind* full\|aspected\|mystic-adept\|adept\|technomancer\|mundane, rating int)×n, resources (nuyen* int) |
| metatypes | metatype | — | range (attr* bod\|agi\|rea\|str\|wil\|log\|int\|cha\|edg, min* int, max* int)×9, trait (text)×n, priority (letter* A–E, points* int)×n: a metavariant's adjustment points at each metatype priority it can be taken at |
| attributes | attribute | abbr* (BOD AGI REA STR WIL LOG INT CHA EDG MAG RES ESS), group* physical\|mental\|special | — |
| skills | skill | attr* (bod … edg, mag, res), untrained* true\|false | spec (text)×n |
| qualities | quality | kind* positive\|negative, karma int (the lowest printed), karmaMax int (the highest, when it prints several), perLevel true, maxLevel int, category (the list it is printed in: `Returned Soldier power`; a quality path's bare step: the path), group (a bare step's path: shown `Gestalt: Step 2`), granted true (never bought on its own: granted by another quality's choice, Karma 0) | effect (target* `attr:<abbr>`\|`skill:<id>`\|`derived:<name>`, op* add\|edge-cost, value*, confidence `low`)×n, test (skill*, attr*, threshold int)×n, choice (see Choices; kind quality: category*, count* int, max int)×n: see Qualities granted and chosen |
| weapons | weapon | category*, rating (a rated weapon or mount's range: its SIZE or LEVEL column), dv, modes, ar, ammo, type, mount, blast, avail, cost | — |
| armor | armor | category*, rating, defense, social (its SOCIAL column as printed: `+2`, `–4`, `—`; what it adds to the wearer's Social Rating), capacity, avail, cost | — |
| augmentations | augmentation | type* cyberware\|bioware\|geneware\|nanoware\|symbionts\|transgenics (only cyberware and bioware take a grade), category*, rating, essence, capacity, avail, cost | — |
| grades | grade | essence, cost (multipliers), avail (modifier): decimals (`1.1`, `-1`); types (the augmentation types it is for, absent: cyberware and bioware) | — |
| electronics | device | category*, rating, array, programs, capacity, avail, cost | — |
| programs | program | type* (basic, hacking, autosoft, … as printed), rating, avail, cost (where the book prints them: the core rulebook's per type, its `Autosoft` row's rating formula for the autosofts) | — |
| gear | gear | category*, rating, capacity, karma, avail, cost, per, slots, energy (a weapon power supply's Energy) | — |
| vehicles | vehicle | category*, handling, accel, interval, topSpeed, body, armor, pilot, sensor, seats, avail, cost | — |
| spells | spell | category* combat\|detection\|health\|illusion\|manipulation, tags, range, type, duration, dv, damage, opposed true (its test is opposed), essence true (its threshold counts the target's Essence): see Flags | — |
| rituals | ritual | keywords, threshold | — |
| adeptpowers | adeptpower | cost, perLevel true, maxLevel int, activation | — |
| complexforms | complexform | duration, fade | — |
| metamagics | metamagic | user adept\|magician (absent: any initiate), perLevel true (taken again), maxLevel int: see Flags | — |
| echoes | echo | — | — |
| martialarts | martialart | categories (Grappling, Weapon, … as printed), signature (its signature technique) | — |
| martialtechniques | martialtechnique | category (as printed; a restriction after it goes to the text) | — |
| traditions | tradition | — | — |
| critterpowers | critterpower | type, action, range, duration, weakness true (the book lists it as a weakness) | — |
| critters / spirits / npcs | critter / spirit / npc | category, rating int (NPCs: the Professional Rating), group; bod agi rea str wil log int cha ess mag res edg dr init actions cm move | skills, powers, optionalPowers, weaknesses, attacks, augmentations, gear, weapons (text, each at most once, in this order) |
| sprites | sprite | attack, sleaze, data, firewall, init, res | skills, powers |
| lifestyles | lifestyle | cost (per month) | — |
| contacts | contact | connection, loyalty, archetype | — |
| lifemodules | lifemodule | stage* opening\|adult, requires awakened\|emerged\|adept\|magician; ints attributePoints, skillPoints, adjustmentPoints, nuyen, contactPoints, knowledgeSkills; contactTypes (academic, corporate, criminal, engineering, government, magic, matrix, media, medical, street; absent: any) | choice (kind* mixed, points int, options* tokens: an attribute bod … res, `skill:<skill id>` or `nuyen:<int>`)×n |
| rules | rule | chapter*, level* int 1–4, parent (a rule id) | — |
| actions | action | type (minor, major, edge, boost: the section's words), timing initiative\|anytime, edge int (an Edge action or boost's cost), with (the action it goes with), category (its section) | — |
| packs | pack | category, cost, essence (as printed) | item (text)×n: the contents as printed |
| vehicledesign | design | category (chassis, powertrain, console, …: its table), bp, rating, slots, avail, cost (as printed) | — |
| ammotypes | ammotype | category, dv, ar (the modifiers as printed), avail, cost (a multiplier `x2` or a price) | — |
| qualitypaths | qualitypath | — | step (text)×n: the headings under it |
| qualitysets | qualityset | karma, metatypes (as printed) | quality (text)×n |
| mentorspirits, datastructures, spellfeatures, contacttypes, licencetypes, magictypes, ruleoptions, senses, trueelements | mentorspirit, datastructure, spellfeature, contacttype, licencetype, magictype, ruleoption, sense, trueelement | category | — |
| categories | category | of* (the kind its rows are), table, section, confidence (`low`), why, fits, accessories (see Categories) | — |

**Kinds read from the books' own sections** (actions, packs, vehicle design, ammunition types, mentor spirits, data
structures, quality paths, spell features, contact types, quality sets, licence types, magic types, rule options,
senses, true elements): Game data lists them as printed, with their description; the app has no rules for them yet (an
Edge action on the Edge panel, say, is for the owner to decide), and the Foundry export leaves them out. The importer
reads them by the book's own section words (`importer/sr6/sections.py`), never by an item's name:
- a heading whose parent heading names the kind is an entry: `#### Avoid Incoming (A)` under `### Minor Actions`,
  `### Backdoor Entry` under `## Matrix Actions`, `#### Bear` under `### Mentor Spirit Archetypes`; so is a heading
  naming its kind before a colon (`Quality Path: Critter Bond`, `New Edge Action: …`, `New Contact Type: …`). A
  lower-case box title, a heading naming the kind itself and an example are not;
- a bold run-in (`• **Reroll one die:** …`) under a heading naming a run-in kind (Edge boosts and actions, data
  structures, contact types) is an entry;
- an action's type comes from its section's words (or a Matrix action's `(Major)` tag), its timing from `(I)`/`(A)`,
  its Edge cost from `(2 Edge)`, `N-Edge Boosts` or `Cost: N Edge`; a quality path's steps are the headings under it.

The rule sections stay as they were (the rules contents still list them).

**Qualities granted and chosen** (importer v4, `sections.py`, `effects.py`). A section that lists what it grants
(`### Powers` or `### Characteristics` under `## Returned Soldiers`, its text naming the section's noun) makes each heading under the list a quality with Karma 0, `granted`, its
category the section's noun and the list's (`Returned Soldier power`); a power is positive, a characteristic (which
costs nothing) a drawback, negative. A heading printing its price in Karma (`Returned Soldier (12 Karma)`) is a positive
quality at that price, and the choices its text offers from those lists ("Select two powers … and one characteristic
…") are its `<choice kind="quality" category count max>` (max: the most the list allows, "no more than three"). The
builder lists a granted quality with "granted only" and warns (`quality.granted`) when the runner has no quality
offering its list, or more of the list than its choices allow; choosing from a list is not automated yet.

A quality path's bare step heading (`Step 2` under `Quality Path: Gestalt`, owner decision 2026-10-07) is a quality
named as printed, its path its `category` and `group` (the app shows `Gestalt: Step 2`), positive, its Karma the price
its prose states (`By investing 10 Karma`) or the one the path's prose gives it (`spend 10 Karma, and they move to step
1`), else the usual missing issue. Its id is the path's and the step's (`shc.gestalt-step-2`).

A value outside its field's SR6 vocabulary (`importer/sr6/vocab.py`: a critter power's action `Complex`, `Simple` or
`Free`; an adept power's activation likewise; an availability's legality `R` or `F`, SR5's) stays as printed with an
`<issue code="unreadable">` saying why; the corpus pass looks for the field in the other books.

The prose's effects (`importer/sr6/effects.py`, the first phrase templates of the gap plan's effects grammar): `boost
X by N` / `increase X by N`, `+N to X`, `X +N` → `<effect target op="add" value>`; `reduce the cost of Edge boosts
and actions by N … on tests using <Skill>` → `op="edge-cost" value="-N"`; `<Skill> + <Attribute> (N) test` → `<test
skill attr threshold>`, a test the quality calls for. Targets come from the game's vocabulary (attributes, skills,
Defense Rating, Initiative, Composure …), never an item's name. An effect read from a sentence that sets a condition
(`when`, `while`, `if`, `at will`, `with a Minor Action` …) is `confidence="low"`: shown, never applied. The app applies
none of them yet (phase 6).

Metavariants under priority creation: the Companion's development table gives each metavariant its adjustment
points at the metatype priorities it can be taken at (its `<priority>` children); the priority provider offers it at
those letters beside the metatypes the priority table lists, and its `metatypeKarma:<id>` comes out of the starting
karma (a metatype the table lists costs none there).

Implant grades (`grades`): the core rulebook's grade table (used, alphaware, betaware, deltaware) and Body Shop's omega
grade, exoware (cyberware only) and gammaware (an Essence factor only: it isn't offered). A grade's key is its name
without "ware" or "grade" (`alpha`, `omega`, `exo`); the creation settings `grade:<key>:essence|cost|avail` replace
the factors of the standard five (which ship as settings) on Table setup; another grade's are its catalog entry's
(an edit changes them). The augmentation picker
offers every grade whose Essence factor is set (a catalog grade also needs its cost) to the types it is for. The
Foundry book export leaves grades out (a purchase carries its grade's key).

Life modules (lifepath creation) are structured grants with no prose. The Sixth World Companion's recipe
(`importer/sr6/recipes/swc.py`, notes in `swc.md`) writes them: its three opening modules (every runner has them) and
its adult ones, each "+1 to A, B or C" a mixed choice, "+1 to any skill" a skill point, contact points with the module's
contact types. A choice counts its points in the pool its pick lands in. The same recipe writes the Companion's
metavariants and metasapients as metatypes (ranges and traits; their karma is a creation setting, below), its
qualities, critter powers, contacts (their stat blocks as NPCs, group Contact) and rule sections.

The same kind → tag map is `KINDS` in `importer/sr6/__init__.py`, `SR6_KINDS` in `server/games.mjs` and `SR6_KINDS`
in `src/sr6/model/types.ts`.

Three more kinds complete the set:

- `sources`: `<source id* publisher* canon* published cat texts file sha256 imported><name>`. `texts` is the source's
  private descriptions file, relative to `custom/sr6/`. `file`, `sha256` and `imported` (a date) are set by the
  importer. `published` (`2019-08`) is the month the book came out (every core rulebook printing is `CRB`, dated by its
  first; each City Edition chapter by its own edition) and `cat` its Catalyst product number (`CAT28000`): the
  publication order, earliest first, ties by `cat` then `id`, a source without a date last. Load book NPCs uses it: a
  book NPC printed in several books (same kind, same name ignoring case and punctuation) with the same stat block
  loads once, from the earliest book; with different stat blocks each version loads, named `<Name> #1`, `#2`… in that
  order.
- `texts`: `<text of="<kind>" id="<entry id>">…</text>`, merged into the entry's `<text>` by (kind, id).
- `edits`: entries of any kind above, each with `by` (the account that saved it).

### Flags

Read by `importer/sr6/flags.py` from an entry's printed name, the headings it sits under and its text (never an item's
name), and used by the builder, the sheets and the Foundry export:

- **metamagic `user`**: `adept` when its name carries `(Adepts Only)` (the note leaves the name and stays a search
  alias) or it is printed under an `Adept Metamagics` heading; `magician` the same way. Absent: any initiate may take it.
  The metamagic picker offers it only to a runner who may (an adept's to an adept or mystic adept, a magician's to a
  full or aspected magician or mystic adept); Review flags one on any other (`magic.metamagicUser`).
- **metamagic `perLevel`** (`maxLevel`): its text says it can be taken again (`as many times as you like`, `can be taken
  multiple times`; `up to N times`). Taking it again raises the pick's level; each level is one initiation grade's
  metamagic, and Review counts levels against the grade (`magic.metamagicCount`).
- **spell `opposed`**: its test is opposed (`opposed by`, `Opposed test`, `resisted by`, `vs. Willpower + …`, `vs. Object
  Resistance`; not `as opposed to`), and every Combat spell (Direct ones opposed by Willpower + Intuition, Indirect ones
  rolled against Reaction + Willpower). **spell `essence`**: its threshold counts the target's Essence (`Sorcery + Magic
  (5 – Essence)`). Shown in the picker, on the Magic tab and on the sheets.
- **armor `social`**: its SOCIAL column (Firing Squad and later), as printed. The worn armor's add up with Charisma into
  the runner's Social Rating (derived values, Review, the sheet); the export's `values.social` is the number.

## Formulas and issues

Book values are canon: the printed attribute is never rewritten from anything but print. Where the importer can say
how a value is worked out, or that the book leaves it out, the entry carries it as a child; where the entry's own row
leaves a value out and the books print it elsewhere, the importer writes that printed value and says where it found it
(`<found>`, below). The app reads both; an edit (Game data's Edit, or an
override file) is how a table sets what the book leaves out.

```xml
<gear id="crb.flare-kit" source="CRB" page="270" rating="1–6" avail="2" cost="Rating × 200">
  <name>Flare Kit</name><formula field="cost">R * 200</formula><text/></gear>
<gear id="crb.null-box" source="CRB" page="271" cost="150">
  <name>Null Box</name><issue field="avail" code="missing" page="91">no availability printed</issue><text/></gear>
```

**`<formula field round? unit? qty?>EXPR</formula>`.** `field` is the attribute it works out (`cost`, `avail`, `rating`,
`ammo`, `essence`…). The builder prices a bought item with it, at the item's rating, quantity and options, in the
budgets, the ledger and the exports (which show the plain number); without one the printed value is read as above.
EXPR is read by the app's own small parser (`src/engine/formula.ts`, never `eval`):

- numbers, `+ - * /` (`×` too), parentheses, a leading minus;
- `R` the rating, `Q` the quantity, `M` the runner's Magic, `B` this field's printed value, `H` the same field of the
  item it goes on (a material add-on's `H*2`: twice its ammunition's price), `opt.<id>` an option;
- `tier(R; 1-3: a; 4-6: b; 7+: c)`: the value of the band the first argument falls in (a single number is a band);
- `ref(kind:id, field[, R])`: another entry's value (its formula, else its printed value), at this rating or the one
  given, e.g. `ref(gear:crb.flare-kit, cost, 2) + 50`;
- `ceil(x)`, `floor(x)`, `min(a, b, …)`, `max(a, b, …)`.

The result rounds up to a whole number (`round="down"` rounds down; Essence keeps two decimals). `unit` and `qty` say
the price is for `qty` `unit`s (`unit="rounds" qty="10"`). A formula that uses `Q` works out the whole line, so the
line's quantity isn't multiplied in again. A variable the app isn't given (an unrated item's `R`, say) counts as 1, and
Review notes it. A formula that can't be read, or a `ref` to an entry or value that isn't there, leaves the item
**unpriced** (never 0): the entry gets an issue (code `unreadable`) and the builder shows "unpriced".

Game data and the pickers show a formula with its values over the entry's ratings (`Rating × 200¥ (200–1,200¥)`); a
bought item shows its value, with the formula on hover.

**`<issue field code page?>note</issue>`.** `code` is `missing` (the book prints nothing), `unreadable` or
`ambiguous`; `page` is where the book has the entry; the text is a short note. The app shows a warning badge (the field,
the note, the page) in Game data and the pickers, and Game data's **Needs attention** filter lists only these entries.
A runner that uses one gets a cited Review note ("Null Box: the book prints no availability, set it in Game data or an
override file."), never an error. An edit (or an override file) that sets the field clears its issue; the edit dialog
still shows what the book has ("book: none printed").

**`<found field how source? page?>replaced</found>`** (from `importer/sr6/resolve.py`): the field's value was printed
somewhere other than the entry's own row. `how` is `table` (another table of the same book whose row names the item and
has the column: a summary table, a gear list in another chapter, the implant table that prices an implant weapon),
`text` (a sentence of the same book printing the value with its word: `ratings 1 to 6`, `Availability 4`, the item's
own description first), `corpus` (another source of the library: the same kind and name in another book, a card
deck's stat line, the class row a type names: `Cyberprogram, hacking`, `Autosoft`; the latest published wins, and
sources of one date that disagree leave the issue), or `errata` (an errata PDF's statement on its own book, applied
when the errata is newer than the printing; the text keeps the value it replaced). `source` and `page` say where it is
printed. It is provenance for the owner: the app leaves it out of the entry. The corpus pass runs after every import
(an errata or card deck uploaded later counts too); a book removed leaves the values it gave other books until those
are imported again.

## Categories

An item's category is the title of the table it is printed in (owner's model, 2026-10-06): the core rulebook's
`cyberlimb cost and capacity` is the category **Cyberlimb**, its row `Arm (synthetic)` the item. The title is what tells
cyberware from bioware and a cyberlimb's accessories from a weapon's. `importer/sr6/categories.py` reads it for every
table a book's catalog rows come from, by the book's own words, never an item's name:

- **`category`** on a table row (weapons, armor, augmentations, electronics, gear, vehicles, ammunition types) is the
  human name of the title (or section) its recipe took: the words about the table itself set aside (`cost and capacity`,
  `table`, `list`, `stats`, a number), the head of each joined part singular where the book prints the singular (`helmets
  and shields` → Helmet and shield; `clothes` stays). A box titled with its own item's name takes its section, as before.
  A product's configurations (below) take the product.
- **categories.xml**: one `<category of="<kind>">` record per (kind, category), its `<name>` the category, with the
  printed `table` and `section` titles and the link between accessories and hosts, stored once:
  - a title whose last word is `accessories`, `modifications`, `mods` or `enhancements` is an **accessory category**; the
    words before it name its hosts (`cyberlimb accessories` → `fits="Cyberlimb"`; `cyberarm and cyberleg mods` → two).
    A host is a category of the same book by that name, or a kind or augmentation type by its own word (`weapon
    accessories` fit every weapon, `bioware` a bioware augmentation). The host's record lists its accessory categories
    (`accessories="Cyberlimb accessory"`). A host the book has no category for is an issue on the record (`<issue
    field="fits" code="missing">`), never a guess;
  - `confidence="low"` and `why`: the name came from the section heading (the table has no title, its title names no
    category or was split over two lines).
- **`group`** on a row whose printed name needs its category to be understood (a bare part: `Arm`, `Armor`, `Gel`): the
  app shows `Cyberlimb: Arm (synthetic)` in every list, picker, Review message, ledger line and sheet. The printed
  `<name>` never changes. The importer scores each row 0 to 1 from the book's own words: a short name (one word +0.3,
  two +0.2) of common words (+0.2: the book prints them in lower case), a composed name the prose prints (+0.3:
  `cyberarm`, `gel ammo`), a name the book uses for something else too (+0.2: `Armor` is also a spell and a rule), an
  accessory table (+0.25), a table of mostly one-word rows (+0.1) or a third of them composed (+0.15). A maker's or
  model's name (a digit, a capital inside a word, a maker the book's own `Maker Model` names teach, a first word the
  prose never prints in lower case) or a name with its category's words scores 0. From 0.65 the row gets `group`.
- **Composed search names**: such a row also gets the composed names the book prints as `<alias>`es (below): its
  category's stem with the part (`cyber` + `arm`: `Cyberarm`, `Cyberarm (synthetic)`, `Synthetic cyberarm`), and in a
  table of parts the same stem on every one-word row (`Cyberleg`). Commlink6's own names are never written; they are
  only what cl6check measures against.
- **Repeated names**: the same name in another category is another item, with its own printed values; its id names its
  category when the plain one is taken (`crb.glowware-enhancements.armor`), and an earlier import's id follows it by
  its category (moved.py).
- **A brand's line** (regroup `_own_rows`, owner 2026-10-07): a table titled with its heading's own words, a name
  column first (`retro line` under `Qux Retro Line`, WEAPON), lists the heading's own items, never paired with another
  description of their name. A heading printing a maker before the title's words is a brand: its rows are named with it
  as the editions name them (`Zoé Heritage Bearded Axe`; `Line`, `Series`, `Collection`, `Range` left out), searched
  also as `Heritage Bearded Axe` and `Zoé Bearded Axe`, `maker` the brand; a generic item of the same printed name
  (`Tonfa`) is another entry. Without a maker the rows keep their names, `group` the heading. Rows of generic words the
  book prints in lower case (`Fixed`, `Folding`) are the heading's variants, `<heading> (<row>)`.
- **An item's configurations** (`shapes.configuration_rows`, owner 2026-10-07): rows of an item's box under its priced
  first row that print a dash for AVAIL and COST (it comes with the item), or a box row named `… configuration` /
  `… mode`, are the shapes the one item takes: an entry each with its printed stats, named `<item> (<row>
  configuration)`, `configOf` the item's id, never priced apart (the Dassault Alpenstock's spear and knife).
- **Accessories and supplies priced in a sentence** (crb `add_ons`, owner 2026-10-08): an item's own text pricing an
  add-on (`a proprietary laser sight (additional 50 nuyen)`, `“stabilizing arm-brace” for an additional 100 nuyen`) is
  an accessory `<item> <add-on>`, `accessoryOf` the item's id; what the text says it does to the item is its
  `<effect target="item:<field>">` (`increases the Near and Medium Attack Ratings by 1`: `item:ar`, `0,1,1,0,0`, one
  value a range band). `Batteries cost 100¥ each` is a supply `<item> battery` (`Battery for <item>`), `supplyOf` the
  item. A box row priced `additional 100¥` (`Tactical hammer (knife/spike)`) is an accessory of the box's other rows,
  its price the addition. The book prints no availability for them: an issue.
- **A letter printed three times** in a name (`Actioneeer`): the name stays as printed; the spelling with two is a
  search name (not upper case: `Mark III`).
- **A product's configurations** (`shapes.configurations`): a box titled with a maker and a product (`Cougar Weapons
  Armsman Collapsible Polearm`, the maker found by the game's corporate words: Weapons, Arms, Industries…) whose rows are
  short generic words (`Knife`, `One-hand`, `Spear`, `Pike`): each row its own item as printed, `category` the product,
  `maker` the maker, `group` the product; the box's description, footnotes and wireless bonus go with every row.
- The import report lists each table that doesn't fit the pattern (`kind="category"`, `why`): no title, a title naming
  no category, a title naming only the kind (`vehicles` over `Microdrones`: the section's category is taken), a title
  split across lines, mixed rows (a table of two kinds), an accessory table with no host.

The app (`src/sr6/engine/categories.ts`): an accessory goes only on a host of a category its record `fits` (the
accessory action refuses another, `wrong-host`); the accessory picker lists only those; Review warns about an
accessory on the wrong host (`catalog.accessoryHost`, cited to the accessory's page), and it is a problem (an error)
when the accessories' bracketed capacity (`[2]`, `[Rating]`) adds up to more than the host's capacity at its rating
(`catalog.capacity`). An accessory of a category with no record (an import before categories) is offered as before, by
its category's word. **An accessory's bonuses are its host's**, never the runner's: a Strength bonus on a cyberlimb's
accessory raises that limb's own Strength (the runner's natural rating plus the accessories'), an armor (Defense) bonus
that limb's armor; the runner's attributes, Defense Rating and initiative leave them out. The host's own values show on
its line ("This item: STR 5, Armor +2"), beside it on the sheets and in Review's derived values (derive.ts `hosts`).

**The general table reader** (`importer/sr6/tables.py`): any table is an item table when its columns carry item
stats (Avail or Cost, or a kind's stat set); everything else (modifiers, thresholds, skill lists) is a rules table,
never catalogued. An item table's kind comes from its column signature (two vehicle stats: vehicles; ESSENCE:
augmentations; DV with an attack rating, mode or ammo: weapons; DEFENSE RATING: armor; a device rating, attribute
array or programs: electronics; COST MULTIPLIER: ammunition types), then its category's own words, else gear. It reads
the priced tables a recipe leaves unread (titled, or with a name column, and rows named with letters). Where a recipe
reads a table it keeps its own kind: measured over the corpus, the reader gives the same kind for 84% of the recipes'
tables, and the rest are the books' own filing (a weapon mod filed as a weapon, armor modifications as armor, drone
parts as electronics, ammunition as weapons or vehicles) that a column signature can't tell; re-kinding them would move
ids for no gain. Each recipe's notes say where it keeps its map.

**More attributes of a table row**: `maker` (above); a weapon's `skill` and `spec` from its TYPE (`Blade`: Close
Combat, Blades; Club: Clubs; Unarmed). **`<note field>`**: the footnote a mark on a cell points to (`10/6*` with `*
Maximum range is 4 meters` under the table): the value is kept without the mark and the footnote is the field's note
(Game data shows it with the entry's values).

**`<alias>name</alias>`**: another name the book prints the item under. A table row keeps its own name and takes its
description heading's as an alias when the heading prints it longer (`Bloop Hauler` under `Bloop Hauler Long-Van`) or
spells it another way; a box's one row takes the box's title (`Scorcher` under `Bloop Scorcher Vehicle Sprayer`); a
supply table printed right after a weapon and titled with the end of its heading (`Vehicle Sprayer Fuel`) takes
`Scorcher Fuel` and `Fuel for Scorcher`. The importer's resolving pass and the measurement match on aliases too; the
app leaves them out of the entry.

**`<alias id="…" kind="…"/>`**: an id the entry had in an earlier import (owner decision D2). When a re-import renames,
moves or re-kinds an entry (`Zap mic` becomes `Zap microphone`; `Fizz Rounds` moves from gear to ammunition types), the
importer reads the source's previous import before replacing it and gives each new entry the old ids it replaces
(importer/sr6/moved.py): same source, matched by name once a printed rating range, case, punctuation and a plural s
are set aside, else by a maker's name added in front, else by abbreviated words, and only when one new entry matches.
`kind` is set when the old one was another kind. An old entry's own id aliases go with it, so every old id survives a
chain of re-imports. The app resolves an old id to the entry (Sr6Catalog.moved, `resolveEntry`), and the runner editor
turns a saved runner's old ids into the new ones on load (src/sr6/engine/migrate.ts), recording each in `<migrated>`
(docs/sr6-character-format.md).

**Searched.** An issue says how far the importer looked: `searched="book"` (its tables and its text) at import,
`searched="book,corpus"` once the corpus pass, run after every import, has looked in every other source of the library
too. Only then is a `missing` issue really nothing printed anywhere the library holds. A field the book prints two values
for, or prices off another item (`ambiguous`), is the book's own: only a later source settles it.

**Edits.** An edit keeps the book's formulas, except for a field it sets otherwise (the value typed wins), and never
stores issues: an edited entry's issues are the book's, less the fields the edit sets.

### What the importer writes (`importer/sr6/formula.py`)

The SR6 importer reads the books' value styles into formulas, by the style, never by an item's name (each book's notes
are in its recipe's `.md` under `importer/sr6/recipes/`):

| printed | formula |
|---|---|
| `Rating x 2,000¥`, `Force x 4,000¥`, `Capacity x 50¥` (the capacity range is the rating), avail `Rating(L)` | `R*2000`, `R*4000`, `R*50`, `R` |
| `(Rating/3)` | `(R/3)` (rounding up: the books don't say otherwise) |
| `12,000¥ + [4,000¥ x Size]`, avail `6(I) + Size` (the SIZE column's range is the rating) | `12000 + (4000*R)`, `6 + R` |
| `Magic*100¥` | `M*100` |
| `300¥ per CF`, `250¥/pair`, `Rating x 200¥ per dose` | `Q*300`, `Q*250`, `Q*(R*200)`, `unit="CF"` … |
| `2,000¥ (+500¥ per additional dart)` | `2000 + 500*(Q - 1)`, `unit="dart"` |
| `500¥ (+100¥ for thermal smoke)`, `… the mini-outboard (costs 500¥)` in the description | `500 + 100*opt.thermal-smoke` |
| a section's open versions at half the listed price | `(Q*300)*(1 - 0.5*opt.open)` |
| rows printed one per rating band or level (`Matrix Relay` 1–3, 4–6, 7–9, `(Rating 10+)`) | one `tier(R; 1-3: R*1000; 4-6: R*5000; 7-9: R*20000; 10+: R*50000)` on every row |
| seats `2/6`, `2+2` (front and back) | `2 + 6`, `2 + 2` |
| a DV `(1–10) S` | `R` (field `dv`) |
| an energy weapon's `Uses 2 Energy per shot`, with the power supply it comes with | `ref(gear:da.weapon-power-supplies-power-clip, energy)/2`, `round="down"` |

A price worked out from another item the buyer picks (`Commlink cost plus rating x 100`, `x2`, `+100%`, `250¥ +
Certified Credstick Cost`, a row of `*` priced at `one half the Essence and nuyen cost` of a base system) has no catalog
id to `ref`, and `B` is the field's own printed value: the importer writes it as an `ambiguous` issue stating the rule
(`priced from another item: base + R*100`), for the user to settle. A count range a row prints beside a per-unit price
(a trailer's SPACE `1–9`) stays in the text; `qty` is only ever the units one price buys.

Issues the importer writes: `missing` for an item's avail or cost, a quality's Karma, the rating range a rated value
needs (a band row has its band), an implant's Essence, a ranged weapon's modes or ammo, a vehicle stat its stat line
leaves out; `unreadable` for a word or a value no style reads (`Special`, `Body x 500¥`); `ambiguous` for two values in
one cell (`800¥/1,600¥`, `400¥ (A); 450¥ (B)`) and for a price off another item. A dash or `n/a` is a printed value.

Three invented examples:

```xml
<!-- rating bands: the same rule on every band row -->
<gear id="zz.glow-relay" source="ZZ" page="12" category="relays" rating="4–6" avail="4(L)" cost="Rating x 500">
  <name>Glow Relay</name>
  <formula field="cost">tier(R; 1-3: R*100; 4-6: R*500; 7+: R*2000)</formula>
  <formula field="avail">tier(R; 1-3: 2; 4-6: 4; 7+: R)</formula>
</gear>
<!-- rating 5: 2,500¥, avail 4(L) -->

<!-- a price per unit with a cheaper version -->
<gear id="zz.crate" source="ZZ" page="30" category="crates" avail="2" cost="40" per="CF">
  <name>Crate</name>
  <formula field="cost" unit="CF">(Q*40)*(1 - 0.5*opt.open)</formula>
</gear>
<!-- 8 CF: 320¥; 8 CF, open: 160¥ -->

<!-- a price off another item, and a field the book leaves out -->
<gear id="zz.buzz-hack" source="ZZ" page="77" category="hacks" rating="1–4" cost="Widget cost plus rating x 50">
  <name>Buzz Hack</name>
  <issue field="cost" code="ambiguous" page="77">priced from another item: base + R*50</issue>
  <issue field="avail" code="missing" page="77">no availability printed</issue>
</gear>
<!-- the user's edit gives the price (a 1,000¥ widget at rating 2: 1,100¥) and the availability -->
```

## Override files

Game data's **Export my edits…** (editors and the admin) saves the edits layer, every edit or one book's, as an edits
file in its own format (`edits.xsd`), each edit's own description in its `<text>`. **Import edits…** reads such a file
and previews it: new entries, changes to a book's entry (the fields that change), and conflicts with an edit already
here, each with Keep mine or Take theirs. Save edits sends the chosen entries one by one as edits made in the app
(`PUT /api/sr6/edits/<kind>/<id>`); a refused one is listed with why. The file's issues are left out.

## Layout and load order

```
library/sr6/<book-id>/   original.pdf, upload.xml, status.xml, import.xml, book.md, regrouped.md
custom/sr6/
  imported/index.xml               the overlay files, in load order
  imported/sources.xml             the imported books (file, checksum, date)
  imported/crb/<kind>.xml          one file per kind, ids scoped crb.<slug>
  texts/crb.xml                    private descriptions (never committed)
  edits/edits.xml, edits/texts.xml the catalog edits and their descriptions
  creation.xml                     the admin's changes to the standard creation rules (Table setup page; creation.xsd)
```

The app loads `data/sr6/sources.xml`, then `custom/sr6/imported/sources.xml` (merged by source id), then the files in
`custom/sr6/imported/index.xml` (the same id replaces, `<remove>` deletes), then the texts file each source names, then
`custom/sr6/edits/edits.xml` and `edits/texts.xml`, then the compendiums the account can read (see Compendiums below).

**Scoping.** Every imported id is scoped by its source (`crb.zap-gun`), as the Anarchy books are, so two books never
clash. Attribute `abbr` and skill `attr` values are never scoped.

**Edits.** An edit is a full entry of its kind with `by`. It replaces the loaded entry with the same id and survives
re-imports. Its description, if any, is in `edits/texts.xml`. An empty one means the book's text.

## Creation rules

The creation rules are the numbers the books print only in their text: starting karma, caps, exchange rates,
point-buy prices, lifepath counts, augmentation grades. A creation rules file (`<sr6:creation
xmlns:sr6="urn:chummer-sr6:config:1" version="1">`, `creation.xsd`) holds them as `<setting key value source? page?/>`
(500 at most, each key once).

**The standard settings ship with the app**: `public/data/sr6/creation-defaults.xml` holds the core rulebook's numbers
(source `CRB`) and the Sixth World Companion's for sum-to-ten, point buy and lifepath (source `SWC`), each with its
printed page; numbers only, no book text. A new server can build runners with every method a book prints right away.
Left unset, because no book prints them: `maxKarmaLeft`, `karmaToNuyenMax`, `skillPointsExpertise`,
`initiativeDiceMax`, `advance.powerPoint`, `advance.karmaToNuyenRate`, `advance.nuyenToKarmaRate`, and the karma build
(`karmaBuild.*`, `magicKarma:*`: no SR6 book describes one, so Karma build can't be picked until the table enters its
own). `metatypeKarma:` is set to 0 for the core rulebook's five metatypes and to the Companion's karma for the 25
metavariants and metasapients its import writes (`swc.<id>`); a metatype from another book needs its own.

`custom/sr6/creation.xml` holds only what the admin changed (`PUT /api/sr6/creation`, on the Table setup page, `#/sr6/table`):
the server's settings are the standard ones with those keys replaced (`loadCreation` in `src/sr6/engine/creation.ts`).
The Table setup page's Standard column shows each standard value and its page, marks the ones changed, and has **Reset** per
value and **Reset all to standard**; saving sends only the values that differ from the standard. An empty field means
the standard value. An older full `creation.xml` works the same (rows equal to the standard simply match it). **Load
settings file** fills the form from a creation rules file, the standard values filling the rest. A GM may give a
campaign they run its own copy on its page; it is kept in `custom/sr6/campaigns.xml` as the campaign's `<creation>` with the
same `<setting/>` rows (`campaigns.xsd`, `PUT /api/sr6/campaigns/<id> { creation }`, its GMs and the admin; its players
read it), and that campaign's runners are built, checked and priced with it. A campaign's own settings are a full copy,
started from the server's settings. Keys, types and
the methods that need them: `CREATION_KEYS` and `expandKeys` in `src/sr6/engine/creation.ts` (per metatype:
`metatypeKarma:<id>`; per awakened or emerged magic kind: `pointBuy.startRating:<kind>`, `magicKarma:<kind>`,
`lifepath.startRating:<kind>`). A creation method whose settings are unset can't be picked.

Every key, in the order Table setup shows them. *Needed by*: the methods that can't be picked while it is unset (`all`:
every method); `optional`: unset, the rule that reads it is skipped (Advancement: the spend that needs it is refused,
a cap isn't applied, an exchange isn't offered; Derived values: the value shows empty; a grade: it can't be
chosen while its Essence factor is unset). `maxKarmaLeft` and `karmaToNuyenMax` aren't printed in the core rulebook:
unset, there is no limit (a table that uses one enters it from the book or house rule that gives it). A number may be a decimal; `true/false` is the word; a quality id names a catalog quality (`crb.<slug>`).

| group | key | type | needed by | what it is |
|---|---|---|---|---|
| General | `startingKarma` | number | all | Starting karma |
| General | `qualityNetBonusCap` | number | all | Most net karma from qualities |
| General | `qualityMaxCount` | number | all | Most paid qualities |
| General | `oneAttributeAtMax` | true/false | all | Only one attribute at its maximum |
| General | `attributeBaseMax` | number | optional | Adjustment points go on attributes whose metatype maximum is above |
| General | `skillCap` | number | all | Highest skill rank |
| General | `skillCapAptitude` | number | all | Highest skill rank with the aptitude quality |
| General | `aptitudeQuality` | quality id | all | Aptitude quality |
| General | `skillPointsSpec` | number | all | Skill points for a specialization |
| General | `skillPointsExpertise` | number | all | Skill points for an expertise |
| General | `magicMax` | number | all | Highest Magic or Resonance |
| General | `essence` | number | all | Starting Essence |
| General | `contactPointsPerCha` | number | all | Contact points per Charisma |
| General | `knowledgePerLog` | number | all | Free knowledge skills per Logic |
| General | `maxAvailability` | number | all | Highest Availability |
| General | `maxNuyenLeft` | number | all | Most nuyen kept after creation |
| General | `freeSpellsPerMagic` | number | all | Free spells per Magic |
| General | `freeFormsPerResonance` | number | all | Free complex forms per Resonance |
| General | `maxKarmaLeft` | number | optional | Most karma kept after creation (unset: no limit, and Review gives no warning) |
| Karma prices | `karmaAttrPerRank` | number | all | Attribute: karma per rank, times the new rating |
| Karma prices | `karmaSkillPerRank` | number | all | Skill: karma per rank, times the new rank |
| Karma prices | `karmaSpec` | number | all | Specialization |
| Karma prices | `karmaKnowledge` | number | all | Knowledge or language rank |
| Karma prices | `karmaSpell` | number | all | Extra spell or ritual |
| Karma prices | `karmaForm` | number | all | Extra complex form |
| Karma prices | `karmaInitiationBase` | number | all | Initiation or submersion: base |
| Karma prices | `karmaInitiationPerGrade` | number | all | Initiation or submersion: per grade |
| Karma prices | `positiveQualityFactor` | number | optional | Positive qualities cost their karma times (unset: 1) |
| Advancement | `advance.expertise` | number | optional | Expertise after creation |
| Advancement | `advance.qualityFactor` | number | optional | A positive quality after creation costs its karma times |
| Advancement | `advance.buyOffFactor` | number | optional | Buying off a negative quality costs its karma times |
| Advancement | `advance.skillMax` | number | optional | Highest skill rank after creation (unset: no cap) |
| Advancement | `advance.powerPoint` | number | optional | Karma per power point (mystic adepts) |
| Advancement | `advance.karmaToNuyenRate` | number | optional | Nuyen per karma after creation (unset: not offered) |
| Advancement | `advance.nuyenToKarmaRate` | number | optional | Nuyen per karma, nuyen to karma (optional rule; unset: off) |
| Nuyen | `karmaToNuyenRate` | number | all | Nuyen per karma |
| Nuyen | `karmaToNuyenRateInDebt` | number | all | Nuyen per karma with the in-debt quality |
| Nuyen | `inDebtQuality` | quality id | all | In-debt quality |
| Nuyen | `karmaToNuyenMax` | number | optional | Most karma turned into nuyen (unset: no limit) |
| Nuyen | `fakeSinPerRating` | number | all | Fake SIN: nuyen per rating |
| Nuyen | `licencePerRating` | number | all | Fake licence: nuyen per rating |
| Sum to ten | `sumToTenTarget` | number | sum to ten | The letters’ values add up to at most |
| Sum to ten | `letterValue:A` | number | sum to ten | Value of priority A |
| Sum to ten | `letterValue:B` | number | sum to ten | Value of priority B |
| Sum to ten | `letterValue:C` | number | sum to ten | Value of priority C |
| Sum to ten | `letterValue:D` | number | sum to ten | Value of priority D |
| Sum to ten | `letterValue:E` | number | sum to ten | Value of priority E |
| Point buy | `pointBuy.total` | number | point buy | Character points |
| Point buy | `pointBuy.awakened` | number | point buy | Character points to be awakened or emerged |
| Point buy | `pointBuy.free.attribute` | number | point buy | Free attribute points |
| Point buy | `pointBuy.max.attribute` | number | point buy | Most attribute points |
| Point buy | `pointBuy.free.skill` | number | point buy | Free skill points |
| Point buy | `pointBuy.max.skill` | number | point buy | Most skill points |
| Point buy | `pointBuy.free.adjustment` | number | point buy | Free adjustment points |
| Point buy | `pointBuy.max.adjustment` | number | point buy | Most adjustment points |
| Point buy | `pointBuy.free.nuyen` | number | point buy | Free nuyen |
| Point buy | `pointBuy.max.nuyen` | number | point buy | Most nuyen |
| Point buy | `pointBuy.cost.attribute` | number | point buy | Character points per attribute point |
| Point buy | `pointBuy.cost.skill` | number | point buy | Character points per skill point |
| Point buy | `pointBuy.cost.adjustment` | number | point buy | Character points per adjustment point |
| Point buy | `pointBuy.cost.powerPoint` | number | point buy | Character points per power point |
| Point buy | `pointBuy.cost.mysticPowerPoint` | number | point buy | Character points per power point (mystic adept) |
| Point buy | `pointBuy.cost.spell` | number | point buy | Character points per spell |
| Point buy | `pointBuy.cost.complexForm` | number | point buy | Character points per complex form |
| Point buy | `pointBuy.nuyenPerCp` | number | point buy | Nuyen per character point |
| Point buy | `pointBuy.oneSpecialization` | true/false | point buy | Only one specialization |
| Karma build | `karmaBuild.start` | number | karma | Starting karma (karma build) |
| Karma build | `karmaBuild.startRating` | number | karma | Starting Magic or Resonance (karma build) |
| Lifepath | `lifepath.moduleCount` | number | lifepath | Adult life modules to take |
| Lifepath | `lifepath.contactRatingCap` | number | lifepath | Highest contact rating |
| Lifepath | `lifepath.bestAttributeBonus` | number | optional | The best attribute rises by this, up to its metatype maximum; the rest goes on a second attribute (unset: no raise) |
| Lifepath | `lifepath.repeatModules` | number | optional | Adult modules that may be taken twice (unset: none) |
| Lifepath | `lifepath.contactKarma` | number | optional | Karma per contact rating the contact points don't cover (each module's points go only to contacts of its types; unset: not offered, the ratings overspend the points). Karma never raises a contact's connection or loyalty above Charisma: the points must pay for what is above it (SWC p. 31) |
| Lifepath | `lifepath.raisedAttributeStart` | number | optional | Attributes whose metatype maximum is above `attributeBaseMax` start at (Born This Way; unset: 1) |
| Lifepath | `lifepath.mundaneEdge` | number | optional | Edge a runner neither awakened nor emerged gains (Born This Way; unset: none) |
| Augmentation grades | `grade:standard:essence` | number | optional | Standard: Essence times |
| Augmentation grades | `grade:standard:cost` | number | optional | Standard: cost times |
| Augmentation grades | `grade:standard:avail` | number | optional | Standard: Availability plus |
| Augmentation grades | `grade:alpha:essence` | number | optional | Alpha: Essence times |
| Augmentation grades | `grade:alpha:cost` | number | optional | Alpha: cost times |
| Augmentation grades | `grade:alpha:avail` | number | optional | Alpha: Availability plus |
| Augmentation grades | `grade:beta:essence` | number | optional | Beta: Essence times |
| Augmentation grades | `grade:beta:cost` | number | optional | Beta: cost times |
| Augmentation grades | `grade:beta:avail` | number | optional | Beta: Availability plus |
| Augmentation grades | `grade:delta:essence` | number | optional | Delta: Essence times |
| Augmentation grades | `grade:delta:cost` | number | optional | Delta: cost times |
| Augmentation grades | `grade:delta:avail` | number | optional | Delta: Availability plus |
| Augmentation grades | `grade:used:essence` | number | optional | Used: Essence times |
| Augmentation grades | `grade:used:cost` | number | optional | Used: cost times |
| Augmentation grades | `grade:used:avail` | number | optional | Used: Availability plus |
| Derived values | `monitorBase` | number | optional | Condition monitor: boxes before the attribute |
| Derived values | `monitorDivisor` | number | optional | Condition monitor: the attribute divided by (rounded up) |
| Derived values | `initiativeDice` | number | optional | Initiative dice |
| Derived values | `initiativeDiceMax` | number | optional | Most initiative dice, after bonuses, astral too (unset: no cap) |
| Derived values | `astralInitiativeDice` | number | optional | Astral initiative dice |
| Derived values | `specDice` | number | optional | Dice for a specialization |
| Derived values | `expertiseDice` | number | optional | Dice for an expertise |
| Derived values | `untrainedPenalty` | number | optional | Dice off the attribute for an untrained skill |
| Metatypes | `metatypeKarma:<metatype id>` | number | point buy, karma, lifepath | the metatype's karma (one per catalog metatype) |
| Point buy | `pointBuy.startRating:<kind>` | number | point buy | starting Magic or Resonance per awakened or emerged kind |
| Karma build | `magicKarma:<kind>` | number | karma | karma to be that kind |
| Lifepath | `lifepath.startRating:<kind>` | number | lifepath | starting Magic or Resonance per kind |

The kinds are `full`, `aspected`, `mystic-adept`, `adept` and `technomancer`. An unknown key, or a value that isn't of
its key's type, is listed as an error on Game data and skipped.

## Compendiums (`characters/sr6/.compendiums/<owner>/`)

A GM's own collection of SR6 entries and NPCs, one file per compendium, kept by the server behind `/api/sr6/compendiums`
(GMs only, never under `/custom/`). Schema: `compendium.xsd` (with `common.xsd` and `character.xsd`).

```xml
<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="compendium" version="1"
  id="0123456789ab" name="Street Kit" source="STREET" sharing="campaign" campaign="abcdef012345"
  rev="3" updatedAt="2026-10-04T00:00:00.000Z">
  <weapon id="street.zap-stick" source="STREET" page="1" category="Clubs" dv="3S" modes="SS" cost="120"><name>Zap Stick</name><text>The GM's own words.</text></weapon>
  <spirit id="street.gutter-spirit" source="STREET" page="1" bod="F+1" agi="F"><name>Gutter Spirit</name><skills>Astral, Fumbling</skills><text/></spirit>
  <sr6:character xmlns:sr6="urn:chummer-sr6:character:1" formatVersion="1" id="…" …><npc kind="grunt" …>…</npc>…</sr6:character>
</sr6:data>
```

- The root names the compendium: `id` (12 hex), `name`, its own `source` id (`[A-Z][A-Z0-9-]{0,19}`, chosen when it's
  made, fixed afterwards, unique among the SR6 books' sources and every SR6 compendium; an Anarchy compendium may use
  the same id), `sharing` (`private`, `campaign`: the GMs of that SR6 `campaign`, or `table`), and the server's `rev`
  and `updatedAt`. The owner is the folder, never the file.
- Children, in any order: entries of the compendium kinds (every kind but priorities, metatypes, attributes, skills,
  life modules and rules; `COMP_KINDS` in `src/sr6/engine/compendium.ts`) under their usual tags, with only that kind's
  attributes and string children, every one citing the compendium's `source` with a `page` of 1 or more and the GM's
  own text in `<text>` (never a book's: a copy from a book keeps the stats and drops the description); and NPCs as
  `<sr6:character>` elements exactly as an SR6 runner file's root (`docs/sr6-character-format.md`), each with its `<npc>`
  block.
- Never the other game's: the server refuses a body that names an Anarchy namespace anywhere, and the app refuses an
  Anarchy compendium, an embedded Anarchy runner and any entry in another namespace.
- In the catalog: a GM's SR6 catalog loads every compendium they can read after the edits layer; a player's the `table`
  ones and those shared with an SR6 campaign they play in (`GET /api/sr6/compendiums/shared`: no private ones, no NPCs),
  and a runner sees the table's and its own campaign's. A runner keeps copies of those it uses (`<house>`,
  docs/sr6-character-format.md).
  Its source joins as a house source (`origin: user`, non-canon, publisher: the owner's name); its entries join their
  kinds, its NPCs none. It never replaces anything: a compendium whose source id is already a book's is skipped (Game
  data lists why), and so is one entry whose id another source's entry of that kind already holds. Load book NPCs
  never copies a compendium's NPCs.
