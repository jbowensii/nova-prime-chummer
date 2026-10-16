# Shadowrun 6 character file format

A Shadowrun 6 runner is one XML file, apart from Anarchy's: the server stores it in `characters/sr6/<username>/`
(`/api/sr6/characters`), and **Export** on the SR6 runners page downloads it. The schema is
`public/data/sr6/schema/character.xsd` (namespace `urn:chummer-sr6:character:1`); `src/sr6/engine/charxml.ts` reads and
writes it. Each game refuses the other's file and says where it belongs.

The file holds what the player chose and spent, never totals: budgets, rule checks and derived values (monitors, Defense
Rating, dice pools) are computed from the build, the catalog and the table's creation rules each time the runner opens.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<sr6:character xmlns:sr6="urn:chummer-sr6:character:1" formatVersion="1" id="…" rev="4" streetName="Sparky"
    name="Pat Doe" gender="…" metatype="crb.glimmerkin" method="priority" backdrop="neon" finalizedAt="…" campaign="…"
    updatedAt="…" lastExportedAt="…" finalKarma="3" finalNuyen="1250">
  <portrait>data:image/png;base64,…</portrait>
  <token>data:image/png;base64,…</token>
  <background>…</background>
  <notes>…</notes>
  <printed source="CRB" page="81"><value key="rea" value="5(7)"/><value key="init" value="8(10) + 3D6"/>…</printed>
  <build method="priority" magic="aspected" aspectedSkill="crb.hexing" tradition="Street hoodoo" drainAttr="cha"
      powerPointsBought="0" initiation="1" submersion="0" karmaToNuyen="3">
    <priority column="metatype" letter="D"/> …          (5; no letter: not assigned yet)
    <cp pool="attribute" points="0"/> …                  (7: point buy's character points per pool)
    <lifemodule id="crb.glow-apprentice"><choice index="0" pick="skill:crb.hexing"/></lifemodule>
    <attribute id="agi" points="3" adjust="1" karma="0"/> …   (11: bod agi rea str wil log int cha edg mag res)
    <skill id="crb.gab" points="5" karma="1" spec="…" expertise="…"/>
    <knowledge uid="k1" kind="language" native="true" points="0" karma="0">…</knowledge>
    <quality uid="q1" id="crb.moonsight" level="1" free="true" name="Moonsight"/>
    <pick uid="p2" kind="adeptpowers" id="crb.quick-step" level="2"><bonus target="rea" value="1" perRating="true"/></pick>
    <martialart uid="m1" id="crb.glow-fist" name="Glow Fist"><technique uid="m1t" id="crb.glow-jab" name="Glow Jab"/></martialart>
    <purchase uid="g1" kind="weapons" id="crb.zap-gun" qty="1">
      <purchase uid="g2" kind="gear" id="crb.zap-scope" qty="1"/>
      <snapshot><weapon id="crb.zap-gun" source="CRB" page="…" …><name>Zap Gun</name>…<text/></weapon></snapshot>
    </purchase>
    <purchase uid="g5" kind="gear" name="Lucky coin" cost="7.5" avail="1" essence="0.1" qty="3" note="…"/>
    <contact uid="c1" name="Gil" archetype="Fixer" connection="3" loyalty="2"/>
    <sin uid="s1" name="Pat Roe" kind="fake" rating="3" gender="…"><licence name="Zap Gun" rating="3"/>
      <lifestyle uid="l1" id="crb.cozy" months="2"/></sin>
    <sin uid="s2" name="Pat Doe" kind="real"/>
  </build>
  <house><quality id="street.lucky-socks" source="STREET" page="1" kind="positive" karma="7"><name>Lucky Socks</name><text>…</text></quality></house>
  <override code="skill.cap" path="skills.crb.gab">GM ok</override>
</sr6:character>
```

## Root

`metatype` and `method` repeat the build's, so a server can list runners without reading the build. `metatype=""` is a
draft with none picked yet. `finalizedAt`, `finalKarma` and `finalNuyen` are set by Finalize (the karma and nuyen left);
`campaign` is set through the server. `rev` is the server's revision counter and is left out of exports. `sampleKey`:
see NPCs below.

`<printed>` (a book sample, from the importer): its stat block's numbers as the book prints them, with the book's
`source` and `page`. `key` is an attribute abbreviation (`5(7)`: natural and augmented), `ess`, `init` (`8(10) + 3D6`),
`cm` (`11/10`, Physical/Stun) or `dr`. Review compares each with what the rules give and warns where they differ ("REA:
the book prints 4(6); the rules give 4(7)", the page cited); the file never corrects them. A copy keeps them.
`level:<quality id>` keeps a level printed on a quality that has none (`Magic Resistance 2`): the quality is taken once,
and Review notes "The book prints Magic Resistance 2; Magic Resistance has no levels (CRB p.72)", never an error.

`<rules>` (after `<printed>`): the runner's own choices of the optional creation rules, over the table's (the server's or
its campaign's own): `<setting key value assumed? source? page?/>`, `value=""` turning a setting off. A setting its
campaign's GM locked keeps the table's value (Review notes the choice is set aside). `assumed`: a book sample's, taken
from its numbers where a book rule explains them (the prime runner's 100 Karma, CRB p. 64); Review notes it ("assumed from
the book's numbers (the book doesn't say)"). None: the table's rules, as before.

`<migrated from to at>` (last): a catalog id the runner named that a re-import renamed, moved or re-kinded, turned into
the new one when the runner was opened (`from` and `to` are `<kind>/<id>`; the entry's `<alias id kind>`,
docs/sr6-data-format.md). Purchases and their accessories, picks, martial arts and their techniques, qualities, the lifestyles, the metatype and the ledger's
lines are turned when the new entry's kind fits the line; a line whose entry is gone with no successor keeps its id and
its snapshot.

`<house>` (after the ledger): copies of the GM compendium entries the runner uses (its qualities, picks, martial arts and
their techniques, purchases and accessories, lifestyles; career spends included), in the SR6 data files' own format with their text, refreshed on every
change while the compendium is readable. When it no longer is (unshared or deleted), each copy stands in for its entry
(prices, rules, sheet and exports) and Review notes "its source … is no longer available; the runner keeps its own
copy". Book entries are never copied here.

## Build

- `method`: `priority`, `sumtoten`, `pointbuy`, `karma` or `lifepath`. `magic`: `full`, `aspected`, `mystic-adept`,
  `adept`, `technomancer` or `mundane`; an aspected magician names its one Magic skill in `aspectedSkill`. `mentorSpirit`:
  the mentor spirit followed (a catalog `mentorspirits` id; the Mentor Spirit quality comes and goes with it), and a
  mystic adept's `mentorAdvantage`, `magician` or `adept` (CRB Hong Kong pp. 162–163). `tradition` is
  free text; `drainAttr` is `log`, `int` or `cha`.
- `awakened` (`true`/`false`): the player's override of the Awakened flag; absent, derived (a magician, aspected
  magician, mystic adept or adept, or an Infected; a technomancer is not). `infectedFrom`: a magic kind, the one the
  runner had before its Infected type changed it (Awakened it, made it a mystic adept or took a technomancer's
  Resonance); taking the type away gives it back, and the creation method rates and prices it. Both absent in older files.
  An `infectedFrom` on a runner with no Infected type (each of its qualities in the catalog) is dropped when the runner
  is opened, recorded as `<migrated from="infectedFrom:<kind>" to="none (no Infected type)">`. An `awakened` value
  other than a boolean is refused; repair leaves it out.
- Spends are counts: attribute `points` (from the attribute pool), `adjust` (adjustment points) and `karma` (ranks bought
  with karma); a skill's `points` and `karma` likewise. A missing number reads as 0.
- `<lifemodule>`: an adult life module taken (lifepath; the same one twice when the table allows it, each copy with its
  own choices); each `<choice>` is the option picked for the module's mixed choice at that index: an attribute
  abbreviation, `skill:<id>` or `nuyen:<n>`. `bestAttr` and `bestExtra` (on `<build>`, lifepath): the best attribute and
  the one that takes what its metatype maximum leaves over, core attributes only.
- `<contact types>`: one or two of the Sixth World Companion's contact types (`academic`, `corporate`, `criminal`,
  `engineering`, `government`, `magic`, `matrix`, `media`, `medical`, `street`); lifepath's contact points go by type.
- `<quality free="true">`: a metatype trait, free and not removable. `name` (on a quality, pick or purchase): the
  catalog name when it was added, shown if the entry later leaves the catalog. `<quality karma>`: for a quality priced
  in a range (`karma`–`karmaMax`, as Allergy's severity sets it), the karma it was taken for; unset, the lowest.
  `<quality boughtOff>`: Stolen Gear's converted karma bought off after creation so far (No Future errata, NF p. 162:
  its bounty is the build's `karmaToNuyen` less this).
- `<skill><spec>…</spec></skill>`: the specializations past the first, one element each (Exotic Weapons, CRB Hong Kong
  p. 95; any skill with the Sixth World Companion's Expanded Specializations, p. 153); each priced as a specialization.
  A file from before 0.13.2 holds them in a `specs` attribute, `; `-separated: still read.
- `<pick kind>`: `spells`, `rituals`, `adeptpowers`, `complexforms`, `metamagics`, `echoes` or `datastructures` (a
  technomancer's data structures, by `level`: Hack & Slash pp. 70–72); `level` for leveled powers
  and for a metamagic taken again (its catalog `perLevel`: the times taken, each one initiation grade's metamagic);
  `note`: the skill or attribute a power naming its choice is for (`Improved Ability (Skill)`: `Firearms`), which its
  `skill:choice` or `attr:choice` effects and its price take (CRB Hong Kong p. 157). A `<quality note>` likewise names an
  `(Attribute)` or `(Skill)` quality's choice.
- `<martialart id>` (after the picks): a martial arts style (catalog `martialarts`), with a `<technique id>` (catalog
  `martialtechniques`) for each technique learned under it, its signature one included (Firing Squad p. 97: it comes
  free with the style). `name` on either: the catalog name when added. A file without any reads as none. Edited on the
  Martial arts tab; a technique's prerequisites are the catalog's (`<requires>`, docs/sr6-data-format.md), never stored
  here. An `<override>` of a martial arts check has the path `martial.<style uid>` (a missing augmentation's:
  `martial.<style uid>.<technique uid>`).
- `<purchase kind>`: `weapons`, `armor`, `augmentations`, `electronics`, `programs` (programs and autosofts), `gear`, `vehicles`, `critters` (an owned critter, below) or `ammotypes` (an ammunition type, from a line bought as gear
  before the importer filed ammunition types apart); `rating` for rated
  items, `grade` for augmentations, `worn` for armor, `seatsRemoved` for a vehicle (cargo, Double Clutch p. 126). A
  vehicle's or drone's accessories are its mods, weapons and autosofts (src/sr6/engine/vehiclemods.ts): a weapon's
  `mount` is the uid of the weapon mount (an accessory of the same vehicle) it sits in (one naming none of them reads as
  in no mount, noted); a vehicle's or drone's `slotShifts` lists the mod slots shifted between categories, in the order
  made (`chassis>powertrain electronics>chassis`: Double Clutch p. 120, any available slots shifted at 2:1, so each
  entry takes two slots from its first category and gives one to its second; read with Double Clutch among the table's
  books only; an entry naming no two categories reads as left out, noted; absent: none); a mod's `diy="true"` is the player's do-it-yourself saving, half its nuyen price (Double Clutch
  p. 120; never an accessory's). Drones are `vehicles` lines too (the Drones tab lists those whose entry is a drone), so
  older files read as they were. A vehicle or drone bought from a design (the Designer, below) has `design` (the
  design's id), `id="design.<that id>"` and a `<snapshot>` always: the vehicle as the design worked out when bought (its
  stats, `cost` the price, `avail`, `dp` its Design Point Value, `approved="true"` when a GM made or approved the
  design, and a `<builtin name ref? rating?>` per mod built in, `<builtin name="Easily Modified" slots category=
  "universal">` for its universal mod slots). Later edits to the design never change it; Review warns "Custom design:
  needs GM approval" until a GM approves it (`vehicle.design`, never blocking) unless the snapshot is `approved`. An item's licences are its SINs' (`<sin><licence item>`); an older file's `licensedOn` (the uids of the SINs an item whose Availability prints a licence fee was licensed on) reads as a licence on each of those SINs, and its `licence="bought"` as one on the first SIN (`unlicensed`: none); one naming no SIN of the runner is left out, noted. Neither is written. No `id`: a custom item at the player's own `cost`, `avail` and
  `essence`. Nested `<purchase>`s are accessories fitted to it. `<snapshot>` holds the catalog entry in the SR6 data
  files' own format (docs/sr6-data-format.md), without its description; Export writes it so the line still reads when
  the entry is gone.
- An owned critter (the Critters tab, src/sr6/engine/critters.ts) is `<purchase kind="critters" id>` naming a catalog
  critter: `pet` the class the player chose, `mundane`, `exotic` or `wild` (absent: mundane; an unknown one is left out,
  noted; Awakened and Emerged come from the critter's Magic or Resonance, never stored), `tamed="true"` when tamed from
  the wild instead of bought (no price, Wild Life p. 184), a `<trained uid what id? name? taught?>` per named command
  (`what="command"`) or special training (`what="training"`): the catalog action of category Critter Command Actions or
  Critter Special Training it is (Wild Life pp. 181-183; the same one may be there twice, Teamwork for two skills);
  `taught="true"` taught after the critter was bought (+500¥ a command, +750¥ a special training, p. 180, no
  Availability; a tamed critter's always are), absent: it came with the purchase (each +1 to the Body in the price
  formula only and +1 Availability, p. 183). An older file's counts, `commands` and `training` on the `<purchase>`, load
  as that many unnamed ones (no `id`, `uid` the line's + `-command-1` …; a tamed critter's taught), noted on a repair
  load (a count that isn't a whole number from 0 is refused, in repair none; one past 99 refused, in repair 99); the
  file is written the new way on its next save. Then a `<quality uid id level name? how?>` per companion quality (catalog qualities of
  class `CRITTERWARE/QUALITY`, pp. 184-186): no `how`, specified with its purchase (each ±1 Availability, its net Karma
  moving the price, p. 180: a net Karma bonus takes its percentage off the whole price, training included, never below 0;
  one a career bond upgraded is priced at the level it was bought at);
  `how="tamed"`, the Wild Soul and the negative balancing it that taming gives; `how="bonded"`,
  bought with the runner's own Karma through the Critter Bond path's Permanent Improvement (SWC p. 139; at creation its
  positives less its negatives, never below 0, in the karma budget). Its accessories are its critterware and gear,
  priced as usual but at its Body where they print one (`Critter's Body x 50¥`) and, an augmentation, +10% a point of
  natural Body over 8 (Body Shop p. 135); their Essence is the critter's, never the runner's. Its price and Availability,
  its powers (innate, 0 Karma), limits and Essence are worked out, never stored. Older files have no critters.
- `<bonus target value perRating?>` (on an accessory: what it adds to its host item, not the runner): what a ware, power or item adds, entered by the player (the catalog has no bonus
  data; a line with none counts its catalog entry's `add` effects instead, the low-confidence ones never). `target` is an
  attribute abbreviation, `initDice`, `defense` (Defense Rating), `physical` (Physical condition monitor boxes: a full
  cyberlimb's, CRB p. 288), `stun`, `overflow`, `unarmedAR`, `unarmedDV` (the unarmed Attack Rating and Damage Value),
  `movement` (metres), `matrixInitDice` (VR initiative dice) or `skill` (that skill's dice pool:
  `skill` holds the catalog skill's id, `<bonus target="skill" skill="crb.firearms" value="1"/>`); `perRating`: times the
  line's rating, less `minus` (`R-1`: `minus="1"`, nothing at rating 1); `byRating`: the book's value per rating,
  comma-separated (`1,2,5`; past its end, the last).
- `<sin kind="real|fake" rating? gender? placeholder?>` with its `<licence>`s and the `<lifestyle uid id months>`s paid
  under it: a lifestyle always belongs to a SIN, a SIN may have none, and a runner may have several of each. `gender` is
  that identity's own (optional; the runner's is the root's `gender`). `placeholder="true"`: an unnamed stand-in
  (`name=""`, `kind="real"`, no rating, free) holding an older file's lifestyle; Review warns until the player names it
  or sets its kind or rating (which makes it a normal SIN), or moves the lifestyle to another SIN.
- `<licence name rating item?>`: one of a SIN's licences (every licence is one SIN's). `rating`: always its SIN's (a
  fake SIN's rating, a real SIN's 1; owner 2026-10-16): the SIN's rating changed, its licences follow and are re-priced,
  and a file's licence at another rating reads at the SIN's (a finalized runner's ledger amounts stay as recorded). A fake
  licence, priced rating × `licencePerRating`; `item`: the uid of an owned line (an accessory's too) whose Availability
  prints a licence fee (`2, 500¥`: rating 2, fee 500¥), the licence `name`d after the Core Rulebook licence type covering
  it (p. 273, the catalog's `licencetypes`: a weapon's Firearm license, a hunting rifle's Hunting license, an
  augmentation's Cyberware license, a cyberdeck's Cyberdeck license, a rigger console's Rigger remote console license, a
  vehicle's Driver's license; any other `Licence (<its category>)`) until the player renames it: on a fake SIN one of its
  fake licences, on a real SIN priced at that fee. One gun carried under three SINs needs three. An item licensed on no
  SIN is a warning; licences are never enforced. An item dropped after finalizing keeps its licences.
- An older file's one `<lifestyle id months>` directly in `<build>` (before lifestyles belonged to SINs) loads onto the
  first `<sin>`; a runner with no SIN gets a placeholder SIN (`uid` the runner's id + `-sin`) to hold it. The same
  happens for a runner whose ledger has an older `lifestyle` spend and no SIN. The file is written the new way on its
  next save.

## Career ledger

A finalized runner's career spends are the `<ledger>` after `<build>` (left out while empty; a file without one reads
as an empty ledger). The build stays as finalized: the runner as it stands is the build with every live advance since
the last finalize entry replayed on it (`src/sr6/engine/career.ts`). The ledger is append-only; a `void` entry undoes
the entry its `event` names.

```xml
  <ledger>
    <entry id="l-1" at="…" type="finalize" karma="31" nuyen="4350"/>
    <entry id="l-2" at="…" type="earn" karma="9" nuyen="3100" date="2026-10-04">Made-up run</entry>
    <entry id="l-3" at="…" type="advance" karma="12" nuyen="0" op="attribute" target="agi" label="AGI 3 → 4"/>
    <entry id="l-5" at="…" type="advance" karma="0" nuyen="290" op="purchase" label="Zap Gun"><purchase …/></entry>
    <entry id="l-8" at="…" type="void" event="l-7">Picked the wrong metamagic</entry>
    <entry id="l-9" at="…" type="note">Owes Fixer Fred a favour</entry>
  </ledger>
```

- `type`: `finalize` (sets both balances), `earn` (adds; the text is the run), `advance` (a spend: `karma` and `nuyen`
  spent, negative when gained; `label` says what was bought), `note` (the text) or `void` (`event`: the entry undone;
  the text is the reason). An unknown `type` or `op` is refused; repair drops the entry ("Dropped ledger entry 3: …").
- `op` (advance): `attribute` and `skill` (`target`: the attribute abbreviation or skill id; +1), `spec` and `expertise`
  (`target` skill, `name`), `knowledge`, `quality`, `pick`, `purchase` and `contact` (the line added, as its build
  element; a `quality`, `pick` or `initiate` whose line is a higher level of a family the runner has, docs/sr6-data-format.md
  "Levels", names the lower level's uid in `target`: that line moves to the new level; a `quality` that is an Infected
  type changing the magic kind names the kind it leaves in `magic`, the one before kept as the build's `infectedFrom`),
  `buyoff` and `drop` (`target`:
  the uid of the line removed; the removed line may follow for the history; a `buyoff` of Stolen Gear with `part`, No
  Future's errata (NF p. 162), buys off that much of the karma converted at creation, `stolenGearBuyOff` Karma each, and
  the line stays with the total so far in its `<quality boughtOff>`; without `part`, the rest, and it goes), `upgrade` (`target`: the uid of the bought
  item replaced by the higher level of its family in the `<purchase>` that follows; its accessories stay), `fit`
  (`target`: the uid of an owned line, a vehicle or drone; the `<purchase>` that follows is fitted to it, at its price,
  half with `diy`; a weapon's `mount` names one of the line's mounts) and `unfit` (`target`: the uid of the accessory
  taken off, no refund; a weapon in it stays, in no mount; the removed `<purchase>` may follow for the history),
  `shift` (`target`: the uid of the vehicle or drone, `from` and `to`: the categories `chassis`, `powertrain` or
  `electronics`; two slots of `from` given for one of `to`, free, out of slots not in use; voiding it shifts them back) and
  `move` (`target`: the uid of a weapon, `mount`: the uid of another weapon mount of the same vehicle it moves to; no new
  charge; voiding it puts the weapon back in its old mount), `bond` (`target`: the uid of an owned critter; the
  `<quality how="bonded">` that follows is bought for it with the runner's Karma, the Critter Bond path's Permanent
  Improvement, SWC p. 139, and a second `<quality>` is the negative taken with it, Wild Life p. 184: Karma = (the
  positive's Karma less the negative's bonus, never below 0) × `advance.qualityFactor`; a first `<quality>` whose `uid`
  names one of the critter's qualities upgrades that one, its id and level replaced, priced at the difference; a `fit`
  or `unfit` may name a critter too: its critterware and gear), `teach` (`target`: the uid of an owned critter; the
  `<trained taught="true">` that follows is taught to it, priced at Wild Life's OPTIONS row, +500¥ a command, +750¥ a
  special training, p. 180; past the critter's limit it is recorded and Review warns; voiding it takes it back),
  `initiate` (an optional metamagic or echo `<pick>`), `sin` (the `<sin>` bought, with its licences, rated as it, and no lifestyles:
  priced as creation prices it, a fake SIN's rating × `fakeSinPerRating`, a real one free, plus its licences' ratings ×
  `licencePerRating`; a `uid` naming a placeholder SIN names it and makes it a normal SIN, its lifestyles kept),
  `licensed` (`target`: the uid of an owned line, an accessory's too, whose Availability prints a licence fee; `sin`: the
  uid of the SIN it is licensed on; `name`: the licence's, the licence type covering the item; on a real SIN priced at
  the fee, on a fake one a fake licence, the SIN's rating × `licencePerRating`; an older entry's `rating` is not read),
  `martialart` (the style with its signature `<technique>`), `technique` (`target`: the uid of the style it is learned under; the `<technique>`), `powerpoint`, `lifestyle` (`lifestyle` id, `months`, `sin`: the
  uid of the SIN it's paid under, `uid`: the new lifestyle's; more months of a lifestyle that SIN has add to it; an older
  entry has no `sin` and goes to the first SIN's lifestyle, more months of it or another replacing it), `convert`
  (the entry's `karma`: positive turns karma into nuyen, negative nuyen into karma), `awakened` (free: the Awakened
  flag's override set after creation, `awakened="true|false"`; absent, derived again; the Ledger tab's Awakened override,
  Review's warning while it differs) and `other`.

## NPCs

An SR6 NPC is the same file with `<npc>` as the root's **first child** (the server keeps NPCs and runners apart by it)
and a blank build. Its stat block is copied from the catalog entry it was made from, or entered by the GM:

```xml
<sr6:character … streetName="Corner Goon" sampleKey="CRB|crb.corner-goon">
  <npc kind="grunt" rating="2" group="Street Crew" fromKind="npcs" fromId="crb.corner-goon" fromName="Corner Goon"
      fromSource="CRB" fromPage="205"><stat key="bod" value="3"/>…<line part="skills">Close Combat 4, Firearms 3</line></npc>
  <build …/>
</sr6:character>
```

- `kind`: `grunt`, `contact` (one of the book's sample contacts), `critter`, `spirit` or `sprite`; `rating` the
  Professional Rating, Force or Level; `group` a grunt's.
- `<stat key value>`: a printed value (key `a`–`z`, at most 20 letters; value at most 80 characters, e.g. `F+1`).
- `<line part>`: `skills`, `powers`, `optionalPowers`, `weaknesses`, `attacks`, `augmentations`, `gear` or `weapons`.
- A critter the GM designs (the Design tab, `src/sr6/engine/critterdesign.ts`) has `designed="true"`, its
  initiative dice in `dice`, and after its lines `<power id? name level? note?>` and `<weakness id? name level? note?>`
  (catalog critter powers by id; none: not in the catalog) and `<skill id? name rank spec?>`. Its `skills`, `powers`
  and `weaknesses` lines are generated from them; its `cm`, `dr` and `init` stats are derived unless the GM typed
  another value.
- `sampleKey` (root): the catalog entry a book NPC was loaded from, `<source>|<id>`. An example runner (Load example
  characters on Your runners) has the book sample it was copied from, `<source>|<sample id>`.
- The runners page refuses an NPC file ("Import it on NPCs & Critters") and the NPC page a runner.

## Vehicle and drone designs

A design (the Designer, `#/sr6/designs`; Double Clutch pp. 150-155; `src/sr6/engine/design.ts`) is the same file with
`<design>` as the root's **first child** (the server keeps designs in `characters/sr6/.designs/<username>/`, every
account its own, at `/api/sr6/designs`, with a trash as runners have) and a blank build. The root's `streetName` is
the design's name. Nothing derived is stored:

```xml
<sr6:character … id="…" streetName="Red Zip">
  <design kind="vehicle" chassis="dc.car" powertrain="dc.wheeled" console="dc.intermediate" diy="true" approved="true">
    <option id="dc.improved-body" level="-1"/><option id="dc.racing" level="1"/><option id="dc.one-off-custom" level="1"/>
    <purchase uid="m1" kind="gear" id="dc.spoof-kit" qty="1"/>
  </design>
  <build …/>
</sr6:character>
```

- `kind`: `vehicle` or `drone`; `chassis`, `powertrain`, `console`: the catalog `vehicledesign` parts picked (absent:
  none yet).
- `<option id level>`: an option, design modification or quality factor (a `vehicledesign` id) and its level, a whole
  number: 1 for one taken once, more for an option bought in levels, negative for one taken in reverse (p. 151).
- `<purchase>`: a mod built in as a design option (a `gear` line as in the build): 2 Design Points per mod slot,
  multiplied with the rest; its nuyen added to the price after the × 1,000 (owner 2026-10-16).
- `diy="true"`: built yourself, half the price (p. 155; the tests are the GM's). `approved="true"`: made or approved by
  a GM (the Designer sets it on a GM's design; a GM may tick or untick it).
- The runners and NPC pages refuse a design file ("Import it in the Designer"), and the Designer a runner or NPC.

## Reading bad files

As Anarchy's: a character XML can't hold (a control character) is refused with its line and column; **Try to repair**
removes it, escapes stray `&`, and drops any child that can't be read ("Dropped purchase 3: qty="x" isn't a number.").
An unknown `method` or `magic` is refused; repair sets `priority` or `mundane` and says so.
