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
  `[A-Z][A-Z0-9-]{0,19}`) and `page` (the printed page). Then a `<name>`, the kind's own children, its `<option>`,
  `<formula>` and `<issue>` children (see Formulas and issues below), and an optional `<text>`, which is empty in
  imported files.
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
  (`900 + Gizmo`) stays as printed; its `<formula>` reads it (`900 + B`).
- **Cross-references are names** for now: metatype traits, critter powers, NPC gear and weapons are lists as printed.
- **No prose in the catalog files.** Descriptions, game effects and rule text go only to the source's texts file.

## Formulas and issues

The book's values are canon: the printed attribute always stays as printed. Two optional children, which any entry may
carry, say how to evaluate it and where the book leaves a gap. Both come from the importer
(`importer/sr6/formula.py`); an edit can add, change or drop them like any other part of an entry.

### `<formula>`: the rule behind a printed value

```xml
<formula field="cost|avail|rating|essence|capacity|seats|ammo|…" round="up|down" unit="CF" qty="1-9">EXPR</formula>
```

- `field` names the attribute it evaluates (several formulas, one per field). The attribute keeps the printed text.
- `round`: how `/` rounds, `up` (the default) or `down`. The books seldom say; up is the rule unless one does.
- `unit` and `qty`, for a price per unit: what `Q` counts (`CF`, `dose`, `pair`, `dart`, `10` …) and the range the count
  is bought in (`1-9`; absent: any count). `per` on the entry keeps its meaning (what one printed price buys).

**EXPR** is one small grammar:

```
EXPR   := term (('+' | '-') term)*
term   := factor (('*' | '/') factor)*
factor := number | R | Q | M | B | opt.<id> | '(' EXPR ')' | '-' factor | call
call   := tier(R; lo-hi: EXPR; …; lo-: EXPR)     rating bands; `lo: EXPR` is one rating, the last band may be open
        | ref(kind:id, field[, EXPR])          another entry's value (at that rating)
        | ceil(EXPR) | floor(EXPR) | min(EXPR, EXPR) | max(EXPR, EXPR)
```

| variable | meaning |
|---|---|
| `R` | the rating the item is bought at (Force, Level, Size, Grade and Capacity-priced items alike; `rating` gives the range) |
| `Q` | the count bought (the formula's `unit` and `qty`) |
| `M` | the character's Magic |
| `B` | the same field of the base item: the item this one is built on, fitted to or priced from (the commlink a hack goes in, the instrument a link doubles, the credstick a stick is made of). The builder asks for it when the entry has no host |
| `opt.<id>` | 1 when the entry's `<option id>` is chosen, else 0 |

`<option id="…" name="…"/>` declares an option a formula reads (a part bought with the item, or a version the book
prices apart, such as a section offering open versions of its items at half price).

A value with no number to evaluate (a missing variable, a `ref` to an entry not loaded, a rating outside every band)
is unpriced, never 0. The importer writes a formula for every printed value that is one: `Rating x 2,000¥`,
`(Rating/3)`, `12,000¥ + [4,000¥ x Size]`, `Magic*100¥`, `300¥ per CF`, `2,000¥ (+500¥ per additional dart)`, `x2`,
`Commlink cost plus rating x 100`, `250¥ + Certified Credstick Cost`, front and back seats `2/6`, and a table printing
one row per rating band (all its rows get the same `tier()` rule). A plain number gets none.

### `<issue>`: a gap the user settles

```xml
<issue field="avail|cost|rating|karma|essence|…" code="missing|unreadable|ambiguous" page="N">short note</issue>
```

- `missing`: the book prints nothing for a field the kind needs (an item's availability or price, a quality's Karma,
  the rating range a rated price needs, an implant's Essence).
- `unreadable`: it prints something no formula reads (`Body x 500`, `Special`, a word).
- `ambiguous`: it prints two values for one field (`800¥/1,600¥`, `400¥ (A); 450¥ (B)`).

The note is a few words (`no availability printed`, `printed: Special`), never book text. The UI flags the field as it
flags a sample runner's Review error; the user's edit (`edits/edits.xml`) gives the value and drops the issue. A dash
or `n/a` is a printed value, not an issue.

### Three invented examples

```xml
<!-- rating bands: one rule on every band row -->
<gear id="zz.glow-relay" source="ZZ" page="12" category="relays" rating="4–6" avail="4(L)" cost="Rating x 500">
  <name>Glow Relay</name>
  <formula field="cost">tier(R; 1-3: R*100; 4-6: R*500; 7-: R*2000)</formula>
  <formula field="avail">tier(R; 1-3: 2; 4-6: 4; 7-: R)</formula>
</gear>
<!-- rating 5: 2,500¥, avail 4(L) -->

<!-- a price per unit with a cheaper version -->
<gear id="zz.crate" source="ZZ" page="30" category="crates" avail="2" cost="40" per="CF">
  <name>Crate</name>
  <option id="open" name="open"/>
  <formula field="cost" unit="CF" qty="1-8">(Q*40)*(1 - 0.5*opt.open)</formula>
</gear>
<!-- 8 CF: 320¥; 8 CF, open: 160¥ -->

<!-- the base item's price, and a field the book leaves out -->
<gear id="zz.buzz-hack" source="ZZ" page="77" category="hacks" rating="1–4" cost="Widget cost plus rating x 50">
  <name>Buzz Hack</name>
  <formula field="cost">B + R*50</formula>
  <issue field="avail" code="missing" page="77">no availability printed</issue>
</gear>
<!-- on a 1,000¥ widget at rating 2: 1,100¥; the availability is the user's to give -->
```

## Kinds

Every entry also has `id`, `source`, `page`, `<name>` and the optional `<text>`. `*` = required.

| file / kind | tag | attributes | children |
|---|---|---|---|
| priorities | priority | letter* (A–E) | metatype (name*, points* int)×n, attributes (points* int), skills (points* int), magic (kind* full\|aspected\|mystic-adept\|adept\|technomancer\|mundane, rating int)×n, resources (nuyen* int) |
| metatypes | metatype | — | range (attr* bod\|agi\|rea\|str\|wil\|log\|int\|cha\|edg, min* int, max* int)×9, trait (text)×n, priority (letter* A–E, points* int)×n: a metavariant's adjustment points at each metatype priority it can be taken at |
| attributes | attribute | abbr* (BOD AGI REA STR WIL LOG INT CHA EDG MAG RES ESS), group* physical\|mental\|special | — |
| skills | skill | attr* (bod … edg, mag, res), untrained* true\|false | spec (text)×n |
| qualities | quality | kind* positive\|negative, karma int (the lowest printed), karmaMax int (the highest, when it prints several), perLevel true, maxLevel int | — |
| weapons | weapon | category*, rating (a rated weapon or mount's range: its SIZE or LEVEL column), dv, modes, ar, ammo, type, mount, blast, avail, cost | — |
| armor | armor | category*, rating, defense, capacity, avail, cost | — |
| augmentations | augmentation | type* cyberware\|bioware\|geneware\|nanoware\|symbionts\|transgenics (only cyberware and bioware take a grade), category*, rating, essence, capacity, avail, cost | — |
| grades | grade | essence, cost (multipliers), avail (modifier): decimals (`1.1`, `-1`); types (the augmentation types it is for, absent: cyberware and bioware) | — |
| electronics | device | category*, rating, array, programs, capacity, avail, cost | — |
| programs | program | type* (basic, hacking, autosoft, … as printed), rating, avail, cost (where the book prints them: the core rulebook's per type, its `Autosoft` row's rating formula for the autosofts) | — |
| gear | gear | category*, rating, capacity, karma, avail, cost, per, slots, energy (a weapon power supply's Energy) | — |
| vehicles | vehicle | category*, handling, accel, interval, topSpeed, body, armor, pilot, sensor, seats, avail, cost | — |
| spells | spell | category* combat\|detection\|health\|illusion\|manipulation, tags, range, type, duration, dv, damage | — |
| rituals | ritual | keywords, threshold | — |
| adeptpowers | adeptpower | cost, perLevel true, maxLevel int, activation | — |
| complexforms | complexform | duration, fade | — |
| metamagics | metamagic | — | — |
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
