# Categories (Shadowrun 6 data format)

Part of the [Shadowrun 6 data format](../sr6-data-format.md).

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

The app (`src/sr6/catalog/domain/categories.ts`): an accessory belongs on a host of a category its record `fits`; the accessory
picker lists every accessory naming hosts, another host's marked ("for Eyeware, not this"), and fits it anyway: Review's
error `catalog.accessoryHost` (cited to the accessory's page; 0.11.1: a warning before, and the action refused it,
`wrong-host`). It is also a problem (an error)
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
turns a saved runner's old ids into the new ones on load (src/sr6/runner-builder/domain/career/migrate.ts), recording each in `<migrated>`
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
