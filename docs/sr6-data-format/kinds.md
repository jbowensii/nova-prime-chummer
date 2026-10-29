# Kinds (Shadowrun 6 data format)

Part of the [Shadowrun 6 data format](../sr6-data-format.md).

Every entry also has `id`, `source`, `page`, `<name>` and the optional `<text>`. `*` = required.

| file / kind | tag | attributes | children |
|---|---|---|---|
| priorities | priority | letter* (A–E) | metatype (name*, points* int)×n, attributes (points* int), skills (points* int), magic (kind* full\|aspected\|mystic-adept\|adept\|technomancer\|mundane, rating int)×n, resources (nuyen* int) |
| metatypes | metatype | — | range (attr* bod\|agi\|rea\|str\|wil\|log\|int\|cha\|edg, min* int, max* int)×9, trait (text)×n, priority (letter* A–E, points* int)×n: a metavariant's adjustment points at each metatype priority it can be taken at |
| attributes | attribute | abbr* (BOD AGI REA STR WIL LOG INT CHA EDG MAG RES ESS), group* physical\|mental\|special | — |
| skills | skill | attr* (bod … edg, mag, res), untrained* true\|false | spec (text)×n |
| qualities | quality | kind* positive\|negative, karma int (the lowest printed), karmaMax int (the highest, when it prints several), karmaSteps (the prices a line lists as its choices, `7 or 12 Karma`: `7 12`, bought at one of them and never between; a range, `2 to 20 Karma`, has none), perLevel true, maxLevel int, category (the list it is printed in: `Returned Soldier power`; a quality path's bare step: the path), group (a bare step's path: shown `Gestalt: Step 2`), granted true (never bought on its own: granted by another quality's choice, Karma 0), class (`INFECTED`, `INFECTED/OPTIONAL_POWER`: see Infected characters) | infected, infectedalt×n, optionalpower×n, karmaif×n first (see Infected characters); effect (target*, op*, value*, switch, confidence `low`, when, spec, affects: see Effects)×n, link (rel* grants\|as, name*, kind, ref, level, when)×n, test (skill*, attr*, threshold int)×n, choice (see Choices; kind quality: category*, count* int, max int)×n: see Qualities granted and chosen |
| weapons | weapon | category*, rating (a rated weapon or mount's range: its SIZE or LEVEL column), dv, modes, ar, ammo, type, mount, blast, avail, cost, per | — |
| armor | armor | category*, rating, defense, social (its SOCIAL column as printed: `+2`, `–4`, `—`; what it adds to the wearer's Social Rating), capacity, avail, cost | — |
| augmentations | augmentation | type* cyberware\|bioware\|geneware\|nanoware\|symbionts\|transgenics (only cyberware and bioware take a grade), category*, rating, essence, capacity, avail, cost | — |
| grades | grade | essence, cost (multipliers), avail (modifier): decimals (`1.1`, `-1`); types (the augmentation types it is for, absent: cyberware and bioware) | — |
| electronics | device | category*, rating, array, programs, capacity, avail, cost | — |
| programs | program | type* (basic, hacking, autosoft, … as printed), rating, avail, cost (where the book prints them: the core rulebook's per type, its `Autosoft` row's rating formula for the autosofts) | — |
| gear | gear | category*, rating, capacity, karma, avail, cost, per, slots, energy (a weapon power supply's Energy), range, pilot, sensor (a rocket or missile's range as printed and the Pilot and Sensor of its guidance), hardpoint small\|standard\|large\|huge (the hardpoint a vehicle weapon mount, drone rack or mechanical arm attaches to: its HARDPOINT column, Double Clutch pp. 142-145) | — |
| vehicles | vehicle | category*, handling, accel, interval, topSpeed, body, armor, pilot, sensor, seats, avail, cost | builtin (name*, ref, rating, slots, category, source, page)×n and note (field `builtin`)×n: see Built-in modifications |
| spells | spell | category* combat\|detection\|health\|illusion\|manipulation, tags, range, type, duration, dv, damage, opposed true (its test is opposed), essence true (its test counts the target's Essence, in its threshold or its resistance): see Flags | — |
| rituals | ritual | keywords, threshold | — |
| adeptpowers | adeptpower | cost, costCombat (the price for a combat skill, the power's `Combat skill: 1.0 PP per level; other skills 0.5 PP per level`: cost then the other skills'), perLevel true, maxLevel int, activation | — |
| complexforms | complexform | duration, fade | — |
| metamagics | metamagic | user adept\|magician (absent: any initiate), perLevel true (taken again), maxLevel int: see Flags | — |
| echoes | echo | — | — |
| martialarts | martialart | categories (Grappling, Weapon, … as printed), signature (its signature technique) | — |
| martialtechniques | martialtechnique | category (as printed; a restriction after it goes to the text) | `<requires kind>` (adeptpower, technique, quality, augmentation, other: its prerequisites, below) |
| traditions | tradition | drain log\|int\|cha (the attribute it resists Drain with besides Willpower, as its text prints it: `Tradition Attribute: Logic`, `Drain: Willpower + Intuition`; flags.py `tradition`) | — |
| critterpowers | critterpower | type, action, range, duration, tags (Street Wyrd: `Free`, `Great`), weakness true (the book lists it as a weakness: a stat block's `Weaknesses:`, or a heading under a `Weaknesses` section, the core rulebook's pp. 228-229) | — |
| critters / spirits / npcs | critter / spirit / npc | category, rating int (NPCs: the Professional Rating), group; bod agi rea str wil log int cha ess mag res edg dr init actions cm move | skills, powers, optionalPowers, spells, weaknesses, attacks, augmentations, gear, weapons (text, each at most once, in this order) |
| sprites | sprite | attack, sleaze, data, firewall, init, res | skills, powers |
| lifestyles | lifestyle | cost (per month) | — |
| contacts | contact | connection, loyalty, archetype | — |
| lifemodules | lifemodule | stage* opening\|adult, requires awakened\|emerged\|adept\|magician; ints attributePoints, skillPoints, adjustmentPoints, nuyen, contactPoints, knowledgeSkills; contactTypes (academic, corporate, criminal, engineering, government, magic, matrix, media, medical, street; absent: any) | choice (kind* mixed, points int, options* tokens: an attribute bod … res, `skill:<skill id>` or `nuyen:<int>`)×n |
| rules | rule | chapter*, level* int 1–4, parent (a rule id) | — |
| actions | action | type (minor, major, edge, boost: the section's words), timing initiative\|anytime, edge int (an Edge action or boost's cost), with (the action it goes with), category (its section) | — |
| packs | pack | category, cost, essence (as printed) | item (text)×n: the contents as printed |
| vehicledesign | design | category (chassis type, powertrain type, console type, size class, …: its table or section), bp (its BUILD POINTS column), dp (its cost in Design Points as printed, `2 x Armor Rating`, `4`, `-10`: a cost, not an effect), perLevel true (dp is per level), max (the most it may be taken, as printed: `4`, `2 x Body`, `min(4, Body)`, `50% x Seat`, `Size Class 20`), maxReverse (the most it may be taken in reverse, when the book says; absent: max), multiplier (a quality factor's `Cost Multiplier`, `x2`, `x0.5`), rating, slots, avail, cost; a chassis's body, armor, handling, seats, sizeClass, a powertrain's accel, interval, topSpeed, a console's pilot, sensor, each table's special, a size class's length, weight, cargo (all as printed: see Vehicle design) | — |
| ammotypes | ammotype | category, dv, ar (the modifiers as printed), avail, cost (a multiplier `x2` or a price) | — |
| qualitypaths | qualitypath | — | step (text)×n: the headings under it |
| qualitysets | qualityset | karma, metatypes (as printed) | quality (text)×n |
| mentorspirits, datastructures, spellfeatures, contacttypes, licencetypes, magictypes, ruleoptions, senses, trueelements | mentorspirit, datastructure, spellfeature, contacttype, licencetype, magictype, ruleoption, sense, trueelement | category | — |
| categories | category | of* (the kind its rows are), table, section, confidence (`low`), why, fits, accessories (see Categories) | — |

**Critter powers a stat block names.** A being's `Powers` line is read by `powerlist.power_list`: the commas a book ran
together (`Armor 2. Astral Form`, `Hardened Armor 2; Immunity (Cold)`) are put back, and a sentence the line runs on with
(`Sapience damage increases to 9P, a glitch raises it 10P …`, text after a power's brackets) goes to the entry's text as a
`**Power notes:**` line, not to the list. The critter powers a book prints are its headings under `New Critter Power(s)`
(a creature's stat block under one is a creature), its bold run-ins, and a plain name line over `**Type:** M **Action:**
Auto` / `**Range:** Self **Duration:** Special` (30 Nights p. 139). A power a stat block names that no kind defines (not as a critter power, adept power, quality, bioware, spell, ritual, complex form, echo or metamagic, by name or a 75% likeness, or by its first words) but a rules section of a book describes under its own heading (`Tech Infestation`, `Mental Attribute Boost` in the monad chapters; `Wild Spirit` for the `Wild Spirits` section) gets `statpowers.py`'s critter power: that section's name, page and text, in the file `section-powers.xml` of the section's source (ids `<source>.section-<name>`, never a real entry's) and its texts file; only a section of a critter, monad or power chapter, or of the book whose stat block names it, counts (one per book that describes it; the app takes the NPC's own book's, then the latest printing's). The pass runs over every source after any book is imported or removed and makes the files afresh. A power no book describes stays as the stat block prints it (the app builds a generic critter power from it).

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
  structures, contact types, a critter's special training) is an entry;
- an action's type comes from its section's words (or a Matrix action's `(Major)` tag), its timing from `(I)`/`(A)`,
  its Edge cost from `(2 Edge)`, `N-Edge Boosts` or `Cost: N Edge`; a quality path's steps are the headings under it.

The rule sections stay as they were (the rules contents still list them).

Wild Life's two lists of what a critter learns are actions by their section (`category`): each `#### Name` under `###
Critter Command Actions` (pp. 181-182) and each bold run-in under `## Critter Special Training` (pp. 182-183), with
their description, no other printed field. Never a runner's: the app offers them only for an owned critter (the
Critters tab and the Ledger's Teach, `src/sr6/runner-builder/domain/assets/critters.ts` `trainedWhat`, owner 2026-10-16).

**Vehicle design** (Double Clutch pp. 150-154; `sections.design_tables`, `design_terms`). Each row of a table with a
BUILD POINTS column (chassis, powertrain and console types) and of the size class table (first header SIZE CLASS, a
CARGO column; its rows named `Size Class 0` … `Size Class 20`) is a `design`, its columns its attributes as printed
(`special` too: the console's `10`/`12` and the Bike's `0` are stored and shown, no rule reads them, owner 2026-10-16).
Each option, modification and quality factor heading's text gives its terms: `Cost: 4 per level` (dp 4, perLevel), `Cost:
20`, `Cost: Heavy Duty +10, Lightweight –10` (a heading over several: each its own), `Maximum level is 4`, `a maximum of 3
levels`, `cannot be higher than twice the vehicle's Body` (`2 x Body`), `4 or the vehicle's original Body value,
whichever is lower` (`min(4, Body)`), `the maximum decrease is 2 levels` (maxReverse), `can only be purchased once` (max
1), `Cost Multiplier: x2`; a heading's `(x0.5 BP)` is its multiplier. Improved Handling's second price (3 per level for
on-road or off-road only) stays in its text; the Designer applies it as a design option's `road`.

The Designer (`src/sr6/runner-builder/domain/assets/design.ts`, owner 2026-10-16) reads them: a chassis, powertrain or console by its category,
a quality factor by its `multiplier` (all multiplied together), an option bought in levels by `perLevel` (or a rating, or
a cost × a word), any other a design modification at its flat `dp`. Price = (the Design Points summed × every multiplier)
× 1,000¥ + the built-in mods' nuyen (2 Design Points per mod slot); half when built yourself. A table's `special` that
changes handling, off-road handling or cargo (`-2 handling`, `-2 to off road handling`, `Extra cargo (+4 CF)`) or reads
`No Top Speed loss` is applied; any other (the console's 10/12, the Bike's 0) is shown as printed. What each option and
modification changes is the book's rule for it by name (pp. 151-153); an unknown one counts its Design Points only. Each
`max` form is read against the design: a number (levels; in reverse too unless `maxReverse`), `Size Class N` (the
resulting size), `k x Stat` (the option's stat at most k × the final Stat, or k × its own starting value), `P% x Stat`
(the increase at most P% of the starting Stat), a bare `Stat` (levels up to its starting value) and `min(…)` (each);
passing one is a warning, never refused. The starting Cargo Factors include a table's extra cargo (the Truck's +4);
Improved Size's seats never take a vehicle below 1 seat (owner 2026-10-16).

**Built-in modifications** (Double Clutch p. 146, owner 2026-10-16; `resolve._builtin_mods`, in the corpus pass after
every import). A book's `Core Vehicle Modifications` box lists, as bold run-ins under its group headings, the
modifications the core rulebook's vehicles already have. Each vehicle it names, in the library's other books (by name,
alias, or either part of a slash name: `Federated-Boeing Commuter/Osprey X`), gets one `<builtin>` per modification:
`name` as printed, its trailing number the `rating` (`Realistic features 4`), `ref` the box book's gear entry of that name
when exactly one matches by its words (`Ceramic plate armor` is `Ceramic Plate`; of several levels the rating's), or
`slots` and `category` for `4 additional Chassis mod slots`; `source` and `page` are the box's. A line or part that is a
sentence (`As Nissan Samurai, except …`, `upgradable to rating 3 for 500¥`) is a `<note field="builtin">` as printed.
They are already paid for (shown as built in, never taken off); each pass replaces the ones the last gave.

**Owned vehicles and drones** (the app: `src/sr6/runner-builder/domain/assets/vehiclemods.ts`, the Vehicles and Drones tabs' Modify panel,
owner 2026-10-16). A `vehicles` entry is a drone by its class (`DRONE_…`) or category (`drone`). A gear entry is a vehicle
mod by its class (`MOD_CHASSIS`, `MOD_SKIN`, `MOD_HARD`: chassis slots; `MOD_POWER`: powertrain; `MOD_ELEC`: electronics;
`ACCESSORY/VEHICLE…`, `ACCESSORY/TIRES`: an accessory, no slots) or else its category's words; one with a `hardpoint`
(or a `… weapon mount`, by its name: a heavy one large) sits on a hardpoint. With Double Clutch (source `DC`) among the
table's books: each category has the unmodified Body in mod slots (p. 120) plus a `<builtin slots category>`'s; a mod
takes its `slots` at its rating; the free hardpoints are Body / 3 standard ones (a small drone with Body over 3: one small;
a micro or mini drone: none; p. 124), plus a `Small|Standard|Large|Huge hardpoint` mod's (0.5, 1, 2, 3 standard ones),
and a device takes its `hardpoint`'s. A built-in mod with a `ref` counts as fitted there (owner 2026-10-16): a built-in
weapon mount holds a weapon and takes its hardpoints (or counts among the core rulebook's mounts), a built-in hardpoint
mod adds its; its mod slots aren't counted. Without it, the core rulebook's: up to Body / 3 weapon mounts, a heavy one counting
two (CRB p. 295). A drone runs half its Pilot (rounded up) in autosofts and programs (CRB p. 201). A weapon sits in one
mount (small: an SMG or smaller; standard: an assault rifle or smaller; large: any; DC p. 142, by its class or category).
What goes past these is Review's `vehicle.mods` warning, never refused. A mod (not an accessory) may be installed by the
player, half its nuyen (`diy`, p. 120; the install test is the GM's).

**Martial arts** (Firing Squad p. 97). The builder buys a style on its Martial arts tab (`karmaMartialArt`); its signature
technique, the `martialtechniques` entry whose name is the style's `signature`, comes with it free. Each other technique
(`karmaTechnique`) is learned under a style, of one of its `categories` (compared without case) or `General`; career
spends are the Ledger's `martialart` and `technique` ops at the same prices. Review flags a style taken twice
(`martial.duplicateStyle`), a technique learned twice under any styles (`martial.duplicateTechnique`) and one outside its
style's categories (`martial.category`, path `martial.<style uid>.<technique uid>`), each cited to Firing Squad p. 97.
The technique pickers (the tab's and the Ledger's) list every technique, the style's own first; one it doesn't teach is
marked, and taken it is that error (0.11.1: before, the pickers hid it and the Ledger refused it).

**Technique prerequisites** (`importer/sr6/flags.py` `requires`). A technique's closing `Category:` line (a label line,
or run on after its last sentence and wrapped) and the Restriction label `shapes.martial` makes of what follows its `;`
print what else it needs: each `requires X` and `[the] user must [already] know|have X` clause is a `<requires
kind="…">X</requires>` child, X as printed (`Kick Attack`, `at least one full cyberlimb`). Its kind is the word after the
name (`the Kick Attack technique`: `technique`; `X power`, `X adept power`: `adeptpower`; `X quality`: `quality`), else
`technique` after `know`, else `augmentation` when X names augmentations by their words (`cyber…`, `bio…`, `implant…`,
`augment…`, `…ware`: `at least one full cyberlimb`, `an implanted firearm`), else the word after the name where the
technique's own text names it (`has the Killing Hands power active`), else `other`. A usage note (`may only be used
with swords`) is none. A technique printed under a section heading (Body Shop's `Cyberware Martial Arts Techniques`)
takes its category from the same closing line, without the prerequisites after it. The builder shows them in the
technique picker and on the technique's row. Review's `martial.requires` is an error (0.11.1: a warning before; path
`martial.<style uid>.<technique uid>`, one GM approval a technique), cited to Firing Squad p. 97, when the runner lacks
an `adeptpower` (among its picks), a `technique` (learned under any style) or a `quality`; a name matches as printed or with a note after it (`bending of the reed` is met by either
`Bending of the Reed (Melee)` or `(Ranged)`), without case. A missing `augmentation` is an error,
`martial.augmentation` (path `martial.<style uid>.<technique uid>`): the technique may still be taken, and a GM may
approve it. Each alternative it prints (`bone lacing, bone density, or a full cyberlimb`) is met by one of the runner's
augmentations (accessories included) whose name, label (`Cyberlimb: Arm (synthetic)`), category (`cyber-implant
weapons`) or search names hold one of its words, stemmed (quantifiers such as `at least one`, `full`, `intact` aside);
an alternative printing an amount (`+1 Reaction bonus from augmentations`, `2.0 Essence spent on …`) can't be told, so
when no alternative is met and one can't be told, nothing is flagged. `other` is shown, never checked.

**Options learned one at a time** (`importer/sr6/flags.py` `options`, any kind). An entry whose text says to choose one
of the options it lists when it is learned (`against melee or ranged attacks (choose which category when learning this
technique)`) and that it may be taken as many times as there are options to gain them all (`may be taken up to twice in
order to gain both`) is one entry per option, `<Name> (<Option>)` (`Bending of the Reed (Melee)`, `(Ranged)`), each
with the printed heading as a search name (`<alias>`); a re-import gives the old id to the first (moved.py's split
tier), so a saved runner's old technique becomes that one. A name printing the version in other case (`Bending of the
Reed (melee)` in a stat block or a style's signature) is the same entry.

**Qualities granted and chosen** (importer v4, `sections.py`, `effects.py`). A section that lists what it grants
(`### Powers` or `### Characteristics` under `## Returned Soldiers`, its text naming the section's noun) makes each heading under the list a quality with Karma 0, `granted`, its
category the section's noun and the list's (`Returned Soldier power`); a power is positive, a characteristic (which
costs nothing) a drawback, negative. A heading printing its price in Karma (`Returned Soldier (12 Karma)`) is a positive
quality at that price, and the choices its text offers from those lists ("Select two powers … and one characteristic
…") are its `<choice kind="quality" category count max>` (max: the most the list allows, "no more than three"). The
builder lists a granted quality with "granted only". Review's `quality.granted` is an error when the runner has no
quality offering its list (a prerequisite it lacks; 0.11.1: a warning before), and `quality.grantedCount` warns when it
has more of the list than its choices allow; choosing from a list is not automated yet.

**Infected characters** (owner decision 2026-10-16; Sixth World Companion pp. 104–114). A block that is only a `QUALITY |
KARMA` table, its rows no blocks of their own and no prose (the Companion's Infected Optional Powers Table, p. 109), lists
qualities bought at the price its row prints (`swc.py` `_priced_list`): each row a positive quality, named as printed
(`Armor (per point)`, `Corrosive Spit (per level)`: `perLevel`, no maximum, so one entry with its level on the runner's
line), its category the table's title less `Table` (`Infected Optional Powers`), its id the category's and the name's
(`swc.infected-optional-powers.biosonar`: the metagenic Biosonar, p. 122, keeps `swc.biosonar`). A row prints no
description; one the book also prints as a critter power has that power's (`Sharpened Natural Weapon`, p. 114), the rest
none (their critter powers are the core rulebook's and Street Wyrd's). Critter powers stay innate, Karma 0.
The Infected qualities (pp. 110–114, Bandersnatch … Wendigo, Carrier) and the optional powers carry a class
(`classes/section_prefix.json`): `INFECTED`, Commlink6's own quality type, and `INFECTED/OPTIONAL_POWER`, ours. The app
offers and accepts an entry of either only while the table's `infectedAllowed` is on (`critterware.ts` `infectedOff`: the
quality pickers, every catalog picker, the editor's `quality` op, `rule-off`, and the career `quality` spend,
`optional-rule-off`); a runner keeps one it has. After creation such a quality costs its own Karma, never times
`advance.qualityFactor` ("Infected qualities do not have their cost doubled when purchased during gameplay", p. 106; the
optional powers likewise).

**Infected rules as data** (owner decisions 2026-10-16, `swc.py` `_infected`; the app plays them: see below). The
Companion prints each type as a quality (pp. 110–114: `Cost:`, `Gained Powers:`, `Optional Powers:`, `Gained
Weaknesses:`, `Attack:`, `Notes:`) and its attribute maxima as a row of the Infected Metatype Attributes table (p. 109,
`TYPE | BASE | BOD … CHA`). Each Infected quality's first children, in this order (`common.xsd` Quality):

- `<infected strain base [printed] [awakens] freePhysical freeMental [essence magic magicLoss] magicMax/>`, one:
  - `strain` `I`, `II` or `III`, from the Notes' `carry HMHVV Strain …`; Strain Ia (Mutaqua, Nosferatu) is `I` with
    `printed="Ia"` (owner: Ia follows Strain I's rules).
  - `base` the base metatype as the table's BASE prints it (`Human`, `Sasquatch`, `Centaur`, `Naga`, `Merrow`): the only
    metatype that may take it (Commlink6's `<prerequisite type="METATYPE">` says the same for the five core ones).
  - `awakens` what a character not yet Awakened Awakens as, from the Notes' `Awaken as adepts|magicians`: Mutaqua `adept`,
    Nosferatu and Wendigo `magician`; the rest none (every Infected is Awakened and dual-natured but not a magician or
    adept, p. 105). One already Awakened as the other kind becomes a mystic adept (the same Notes).
  - `freePhysical="2" freeMental="2"`: the free attribute points every Infected quality gives (p. 104), applied before
    its attribute cuts.
  - Strain II and III: `essence="5"` (Essence becomes 5), `magic="1"` (a character with no Magic gets 1), `magicLoss="1"`
    (one with Magic loses 1), `magicMax="5+initiate-grade"` (p. 106). Strain I: `magicMax="ess+initiate-grade"` (Magic
    follows Essence), and no `essence`: the book gives no starting Essence for a Strain I character created as one (only the
    in-play disease, p. 107, says Essence 1), so the character keeps its own; the app shows that note (owner). The chapter
    has no Edge rule for creation: none is stored.
- `<infectedalt base="other" karma bod … cha page note/>`, the non-human vampire only (sidebar `NON-HUMAN VAMPIRES`, p. 109,
  read from its `+1 BOD, STR, WILL, and +2 REA and CHA` and `total cost of 32`): any base metatype but the type's own takes
  it at `karma` (32), each attribute value added to that metatype's own maxima (bod 1, rea 2, str 1, wil 1, cha 2), the
  quality's `when="Human"` maxima not applying; `note` "32 Karma for a non-human vampire". The entry's own `(+10 Karma for
  non-humans)` and "no changes to their attribute maximums" (p. 113) are not used (owner).
- `<optionalpower ref [free="true"]/>`, one per optional power the type may buy (its `Optional Powers:` line), `ref` the
  optional power's quality id (`swc.infected-optional-powers.fear`): an item names the row of its name and of each item in
  its parenthesis (`Enhanced Senses (Hearing, Smell)`: two), else the one row of its name (`Magical Guard (self only, …)`,
  `Armor +1`: `Armor (per point)`). `free`: one the type's free pick may take (`Gain one of the Enhanced Senses or Immunities
  as a free Optional Power`; Goblin's `Gain one Optional Powers (except Regeneration) for free`: every one but
  Regeneration). One free pick per character. A type with no `Optional Powers:` line (Ghoul, Grendel, Jabbawock, Lamia) has
  none; an item naming no row is reported (`unmatched`): Chiron's `Immunity (Age)`, which the table does not price.
- `<power name [rating] [ref]/>` and `<weakness name/>`, one per item of the type's `Gained Powers:` and `Gained
  Weaknesses:` lines (after the optional powers): `name` as printed less page citations (`Natural Weapon (Claws, Bite)`,
  `Magical Guard (self only)`), `rating` a printed number (`Armor 1`, `Armor (4)`, `Built Tough 2`), `ref` the critter
  power's id when the same book prints it. The app finds the rest by the name less its parenthesis across the catalog
  (`data.ts` `gainedEntry`: a power among the critter powers, then the qualities; a weakness among the critter
  weaknesses, the core rulebook's rules entries, p. 228) and lists a name it can't find as `data.unresolved` (noted once
  in the runner's Review, shown as printed), never guessed. A name the book misprints is the owner's override row
  (`"gen": "owner"`, a kid that `replaces` the printed one): Nibiinaabe's `Darkness`, a spell, is `Innate Spell
  (Darkness)`. Modifiers (`+1 initiative die`, `–1 Logic`) and the free pick's sentence are not items. They cost nothing
  (owner: critter powers cost 0); the Creation method tab's Infected section and the printed sheet list them.
- `<karmaif flag="awakened" value note/>`: the quality's Karma when the character is Awakened (a magician, adept, mystic
  adept or aspected magician; a technomancer is not), from a price note `(–10 Karma if character is already Awakened)`:
  Mutaqua 54/44, Nosferatu 48/38, Wendigo 47/37, `note` "less 10 if the character is already Awakened" (shown where the
  table prints `(see desc.)`); and from a `See text` price whose paragraphs give one price for non-Awakened and one for
  Awakened characters: Astral Hazing (p. 127) `karma="8"` and `value="15"`, `note` "15 if the character is Awakened" (one
  item; Commlink6's two records, `astral_hazing_non_awakened`/`_awakened`, are an accepted structural difference).

Attribute maxima stay `<effect target="attr-max:<a>" op="set" value when="<base>"/>`, the type's own table row, `when` its
base metatype (effects.py: a quality's row of a table whose second column is BASE). The Ghoul, the one type the table
prints for several bases, is one quality per base (owner): `Ghoul (Human)`, `Ghoul (Dwarf)`, `Ghoul (Elf)`, `Ghoul (Ork)`,
`Ghoul (Troll)` (`swc.ghoul-human` …, the old `swc.ghoul` an alias of the first), each 29 Karma (the table's; the entry's
`Cost: 27 Karma` is a misprint, the override table sets 29), each with its own row's maxima and its own `<infected
base>`. The gained powers, weaknesses and attacks stay in the description: the printed lists have typos (a missing comma,
`Induced Dormancy (Lack of Air, (Essence) Minutes` unbalanced) and name critter powers of other books.

**Infected characters in the app** (`src/sr6/runner-builder/domain/creation/infected.ts`, owner decisions 2026-10-16). A runner is Infected while
it has one Infected type (a quality with `<infected>`): Creation method's Infected yes/no and type selector (shown while
`infectedAllowed` is on, or the runner has a type) list the types whose `base` is the runner's metatype by name, a metavariant's its parent's (`baseMetatype`, a list by name: Hobgoblin is Ork; a metasapient has none) (the
Ghoul's one per base), and the non-human vampire for any other metatype through its `<infectedalt base="other">`; the
editor's `infected` op (and the `quality` op given a type) takes it, replacing the one the runner has, and taking it away
restores the runner. From the type:

- Attribute maxima: an `attr-max` effect with a `when` holds only when the `when` is the runner's metatype's name or its parent's
  (`effects.ts` `maxEffects`: the type's own row; any other `when`, a condition, never); the `<infectedalt>` values are
  added to the runner's own metatype maxima. An Infected's core attribute above its maximum drops to it on the derived
  values, the spend not refunded (Review's warning `infected.dropped`, in place of `attr.creationMax`).
- `freePhysical`, `freeMental`: added to the attribute points as far as points are spent on attributes of that group.
- `essence`: the Essence the runner starts at (else the `essence` setting; Strain I's note: the book gives none).
  `magic`/`magicLoss`: Magic 1 for a runner whose bought kind has none, 1 less for one with it (`providers.ts`).
  `magicMax`: the highest Magic in place of `magicMax` (`5+initiate-grade`; `ess+initiate-grade`: the starting Essence's
  whole points plus the grade, Essence's loss then taken off as everyone's).
- `awakens`: a runner not Awakened becomes an adept or full magician, one Awakened as the other kind a mystic adept, and a
  technomancer loses Resonance (no refund); the kind before is the build's `infectedFrom` (docs/sr6-character-format.md):
  the method rates and prices that bought kind (the priority row's Magic, point buy's and the Karma build's price), and
  `prio.magicAllowed`/`reconcile` read it.
- `<optionalpower>`: an optional power (class `INFECTED/OPTIONAL_POWER`) is refused (`infected-no-type`,
  `infected-not-listed`) unless the runner's type lists it; at creation only one the free pick may take, free (one level),
  unless the table's `infectedPowersAtCreation` is on (`infected-after-creation`); after creation at its own Karma, the
  free pick free while unused. The free pick is the dearest `free` line the runner has. Review's `infected.power` flags a
  line that no longer fits. The book's pace (one every two in-game months) is shown, not enforced.
- Edge: no rule; Creation method says so. Review's `infected.off` warns when a runner has Infected entries while the
  table's `infectedAllowed` is off (kept), `infected.metatype` when the type isn't for its metatype.

The **Awakened flag** (`infected.ts` `awakenedFlag`, `Sr6Derived.awakened`): Awakened is a magician, aspected magician,
mystic adept or adept (`data.ts` `awakenedKind`), or an Infected; a technomancer is Emerged, not Awakened (CRB pp.
127–128); `providers.ts` keeps its own "awakened or emerged" for what is either (a method's Magic or Resonance and its
price, the lifepath mundane's Edge). The player may override it (Creation method's Awakened: derived, yes or no; the
build's `awakened`): shown with the derived value and why, and a Review warning (`awakened.override`) while it differs.
A `<karmaif flag="awakened">` price holds while the flag is on (an Infected type's own: Awakened before it, the bought
kind or the override), at creation, after it and in the Qualities picker (`54 (less 10 if the character is already
Awakened; this runner: 44)`); the non-human vampire costs its `<infectedalt>` karma.

A quality path's bare step heading (`Step 2` under `Quality Path: Gestalt`, owner decision 2026-10-07) is a quality
named as printed, its path its `category` and `group` (the app shows `Gestalt: Step 2`), positive, its Karma the price
its prose states (`By investing 10 Karma`) or the one the path's prose gives it (`spend 10 Karma, and they move to step
1`), else the usual missing issue. Its id is the path's and the step's (`shc.gestalt-step-2`).

A value outside its field's SR6 vocabulary (`importer/sr6/vocab.py`: a critter power's action `Complex`, `Simple` or
`Free`; an adept power's activation likewise; an availability's legality `R` or `F`, SR5's) stays as printed with an
`<issue code="unreadable">` saying why; the corpus pass looks for the field in the other books.

**Effects** (`importer/sr6/effects.py`, owner decisions 2026-10-10). After a recipe has read a book, one pass
(`effects.apply`, run.py) reads every entry's effects from its description and from the book's tables: qualities,
adept powers, ware, gear, weapons, armor, ammunition, accessories, vehicle mods, spells, critter powers, metamagics,
echoes, programs, foci, mentor spirits, data structures and the rest (not rules, stat blocks, vocabularies or life
modules, whose points are their own attributes and choices). General rules over the sentences, the game's vocabulary
only, never an item's name. Each effect is `<effect target op value [switch] [confidence] [when] [spec] [affects] [from] [rule]>` (`from`, `rule`: see Whole-object effects):

- **Targets**: `attr:<abbr>` (bod … cha, edg, mag, res, ess); `attr-max:<abbr>` an attribute's maximum
  (`attr-max:choice`: the one the player picks); `skill:<id>` a skill's pool (a specialization it is limited to in
  `spec`; `skill:choice` a chosen skill); `test:<type>` a test type, shown on every pool it covers: `social` (Con,
  Influence: the tests that influence or con someone, CRB p. 97), `matrix` (Cracking, Electronics), `magic`,
  `resonance`, `combat`, `vehicle`, `physical` and `mental` (the skills linked to those attributes), `attr-<abbr>` (the
  tests using that attribute), `damage-resistance`, `drain-resistance`, `toxin-resistance`, `magic-resistance`,
  `defense`, `defense-astral` (the astral defense pool: `defense tests against astral attacks`, `astral defense dice`),
  `defense-spell-direct` and `defense-spell-indirect` (defense tests against direct or indirect combat spells;
  `derived:defense-astral` stays the astral Defense Rating), `surprise`, `crash`, `addiction`, `spell-<category>`,
  `all`, and `other` (tests whose words name no skill, test type or activity: its words in `when`). A test the book names by activity (`tests involving grappling,
  escaping bonds`) is that activity's skill (owner decision 2026-10-10; `effects.ACTIVITIES`, from the core rulebook's
  skill descriptions: grappling Close Combat, escaping Athletics, haggling Influence …), its specialization in `spec`
  when the activity is one, else the activity's words in `when`; `derived:<name>` Defense Rating (`defense`, `defense-astral`, `social`),
  `matrix-defense` (the Matrix Defense Rating: `Matrix Defense Rating`, a Matrix program's `+2 to Defense Rating`, CRB p. 184),
  initiative (`initiative`, `initiative-dice`, `matrix-initiative`, `matrix-initiative-dice`), condition monitor boxes
  (`physical-monitor`, `stun-monitor`, `matrix-monitor`, `overflow`), `composure`, `judge-intentions`, `memory`, `lift`, `movement`,
  `minor-actions`, `major-actions`, `hardened-armor`, `damage-reduction`, `power-points`, the unarmed attack's `unarmed-ar`,
  `unarmed-dv` (`add`, or `set` from a table's `3P`: the bone lacing table, CRB Hong Kong p. 286) and `unarmed-damage`
  (`set` `P`: `unarmed combat damage becomes Physical`); the rule changes the review of 2026-10-18 found no word for, each shown
  and never applied: `adept-drain-attribute` (`set` the attribute adept power drain is resisted with instead of Willpower or
  Body: an attribute abbreviation, `choice` for any physical attribute, or `tradition`; the Ways, Street Wyrd p. 76), `wound-penalty`
  (`add -1`: one die of the wound penalty ignored), `wound-threshold` (`add` N: the wound penalty starts N boxes farther down the
  Condition Monitor, Pain Resistance) and `drain-value` (`add` N: the Drain Value of a spell or tool raised, a cost); `matrix:<name>` a Matrix attribute
  (`attack`, `sleaze`, `data-processing`, `firewall`, `choice`) or `matrix:overwatch`; `item:<field>` the item's own
  stat, or on an add-on (accessory, ammunition, vehicle mod) the stat of the item it fits (`ar`, a value a range band
  `0,1,1,0,0`; `dv`, `concealability`, `handling`, `acceleration`, `speed-interval`, `top-speed`, `body`, `armor`,
  `pilot`, `sensor`, `seats`, `size`, `ammo` an ammunition belt's or magazine's capacity, `damage-type` `set` `S` or `P`:
  ammunition that makes the damage Stun or Physical; the Foundry module is to map `S` to the weapon's `system.stun` (planned, not done yet)); `action:<name>` an Edge or
  Matrix action (`the Snoop action`, `Called Shot—Disarm`, a list after `action:`); `complex-form:<name>` a complex
  form named as what the bonus is on; `lifestyle:<name>` lifestyle points; `resource:<name>` a creation resource (`maxed-out-attributes` and `maxed-out-skills`, `set` the number that may start at their maximum, 0 for `may not start with any`; `adjust-drake`, `add` a drake's Adjustment Attributes);
  `skill-max:<id>` a skill's maximum (`skill-max:choice`: Aptitude's 10, Genetic Optimization's +1); `sense:<name>`
  a sense the entry is named for or grants (`low-light-vision`, `thermographic-vision`, `ultrasound`, `wide-band-hearing`
  …: `effects.SENSES`, a rule of its own, shown); `action-max:<name>` the cap on an action's bonus (`increases the
  maximum dice pool bonus for Take Aim by its rating`, a raised maximum, shown; owner decision 2026-10-11);
  `pool:chase` the chase pool's Edge (Double Clutch p. 175); `derived:essence-hole` an Essence hole (`0.25 Essence
  per level`, Bestial Nature p. 21; `free up 0.1 Essence`, Companion p. 132: `R*0.25`, `R*0.1`, shown);
  `pricemod:<what>` a price in percent (`armor` for armor and clothing, `lifestyle`, `gear`, `everything`: `0.1` is
  +10%); `derived:monthly-cost` nuyen a month (`R*500`). A Matrix attribute, attribute or skill the entry leaves to the
  `limb-attr:<abbr>` (bod, agi, rea, str) a cyberlimb's own attribute, never the runner's (`Basic limbs are installed with
  all Physical attributes at 2`, CRB p. 288: `set` `2`; the section's rule, so every limb of the class in every book has
  it); a Matrix attribute, attribute or skill the entry leaves to the
  player (`this attribute`, `the chosen Matrix attribute`) is `<family>:choice`; a variant row's words resolve it
  (`Cyberjack Boosters (Firewall)`: `matrix:firewall`; `(Agility)`: `attr:agi`), and a variant named for a family
  (`(attribute)`, `(skill)`) keeps that family's effects only.
- **Incompatibilities** (`<incompatible targets? names? family?/>`, `<compatible name switch="wireless"/>`; augmentations,
  adept powers and qualities): what the text says the entry can't be combined with (CRB Hong Kong pp. 157, 286–293):
  `targets` the attributes and initiative an augmentation raising them can't go with (`incompatible with augmentations
  that affect Reaction or Initiative`: `attr:rea derived:initiative-dice`), `names` the entries it names (`including
  wired reflexes`, `; `-separated, a name matching an entry whose name starts with its words), `family` the name only
  one entry starting with may be installed (`you can only have one installed at a time`: `Bone Lacing`); `<compatible>`
  a wireless bonus's exception (`compatible with a wireless wired reflexes system`). Review's `gear.incompatible` is an
  error on each pair (a GM may approve it), `gear.incompatibleWireless` a note for a pair the wireless bonus allows.
- **Operations** (the rule-changing effects are kinds of their own): `add`, `set` (an infected type's attribute
  maximum), `edge` (N bonus Edge on those tests), `edge-cost` (Edge boosts and actions cost N more, -N less),
  `edge-cost-set` (an Edge action's new cost), `no-edge` (no Edge may be spent), `no-edge-gain` (none gained),
  `wild-die`, `hits` (N extra hits), `threshold` (the tests' threshold moves by N: a toxin extractor's `-R`), `threshold-set` (their new threshold: spider eyes' Surprise tests at 2). An extra
  Minor or Major Action, Hardened Armor N and Overwatch -N are `add`s on their targets; `set` also gives a rating
  (`the Magic attribute at 3`, an artificial skill at the hardwire's rating).
- **Values**: a number; `R`, `-R`, `R*N` (x the line's rating or level: `adds its rating`, `per level`, `each point
  of this mod`, `each point of X rating`; a value's own clause decides: `+1 to AR per level, and +1 to DV for every
  two levels (round up)` is `R` and `R/2 RU`, a formula, shown); a formula over a value of the character's (`dice
  equal to your Initiate Grade`: `initiate-grade`; `increased by their Magic`: `mag`; `add your ranks in Con to your dice pool`: `rank:con`, a skill's ranks, owner 2026-10-17), shown; `R-1`, `R*N-N` (so much per level after the first: `each level after the
  first grants a +1 dice pool modifier for such tests`, Nimble Fingers; counted as rating − 1, never below 0; owner
  decision 2026-10-11); `R[1,1,2,2]` (the book's own value per rating, a per-rating table: rating 3 gives the third,
  beyond the table the last; owner decision 2026-10-11, for the owner's overrides of table-driven items); a range
  band `x` in an `item:ar` list (`2,1,-2,0,x`: the band removed, `removes the longest-range Attack Rating`, shown `—`;
  owner decision 2026-10-11); a formula with the book's rounding (`edg/2 RD`: half Edge rounded down, `RU` when the
  book is silent; `nanite-volume/2 RU`: +1 for every two points of nanite volume; owner decision 13, 2026-10-11:
  shown with the formula, never applied); `hits` (a spell's or complex form's, per net hit: `net hits are added to the
  subject's Defense Rating`, `each hit increases the target's Overwatch Score by 1`); `N` a native language; `20%` a
  percent of the base value; `R/-R` a vehicle's on-road and off-road Handling; or a formula over attributes (`edg`,
  `edg/2`: a drake's Armor by its Edge); `a/b` a vehicle stat on the road and off it, on-road first (`R/-R` Handling; a
  tire's `5/-5` Acceleration and `10/-10` Speed Interval, Double Clutch pp. 122-123); `bod`, `bod/2 RU` on a vehicle
  accessory's `item:ar`: the vehicle's own Body (Shredders, p. 123). `hits`, percents and formulas are shown, never applied.
- **How it is turned on** (`switch`): none (always on: in the total shown first), `wireless`, `activated` (at will,
  an action, overdrive, a drug while it acts, a data structure for the action after its Minor Action), `sustained`
  (a spell, ritual or complex form while it lasts),
  `conditional` (some tests or situations: `when` holds the condition's words, `while in the Matrix`, or a mentor
  spirit's role `magician`/`adept`). A switchable or conditional effect counts in the bracketed total, `Con 6 (9)`, as
  a book's stat block prints it (owner decision 2026-10-10). `confidence="low"` (a condition the importer found no
  words for, a formula per point of something) is shown, never applied.
- **Machine conditions** (owner, 2026-10-29: calculated, not notes): a `when` the app decides from the runner, never a
  note: `attr:<abbr>>=N` or `attr:<abbr><=N` (the importer writes `if the character's Strength is 6 or greater` as
  `attr:str>=6`, `emit.py machine_when`), a metatype's name (`Troll`: the runner's metatype or its parent), or a role
  `adept`, `magician`, `mystic adept`, `technomancer` (the runner's magic kind). When it holds the effect is always on
  (its `conditional` switch dropped); when it does not, it is left out of both totals (`effects.ts whenHolds`,
  `bonuses.ts decided`). Any other `when` is a situation only the table knows (`in animal form`, `per additional
  barrel fired`): it stays a switch, off in the total shown first and on in the bracketed one.
- **Specialization** (`spec`): a skill effect limited to a specialization (`+2 dice on climbing tests`: `Climbing`;
  `Influence (Etiquette or Negotiation)`: either). It is added to that specialization's pool when the runner has it,
  else to the skill's bracketed total (owner decision 2026-10-10).
- **What others get** (`affects="others"`, owner decision 16, 2026-10-11): a sentence about what others gain against
  the entry (`Users of the drug grant 2 Edge when resisting a Con test`, `+1 Edge for Perception tests to see them`,
  `tests made against you gain a bonus Edge`) is read and kept, never counted on the runner, worded "others get: …";
  the Foundry export lists it in the description, no Active Effect.
- **Whom it affects** (`affects`, spells, rituals and complex forms): `target` when its sentence names the target,
  subject, device, ally … before the caster; else `caster` (it names the caster, `you gain`, or no one); a sentence
  opening with a pronoun is about whom the one before was. A caster's effect counts on the caster while sustained (in
  brackets); a target's is stored on the spell and never counted on the caster. Each gets the note `affects the caster`
  or `affects target(s)` (owner decisions 2026-10-10, both games).

What the rules read: lists (`+1 to your Agility, Body, Reaction, and Strength`), `increase X by N` / `X +N` / `+N
to X` / `+N X` / `a +N bonus on X` / `X is increased by N` / `adds its rating to X` / `the X's rating is added to Y`
/ `X equal to its rating`, Edge phrasings (`gain a (bonus) point of Edge on X`, `+1 Edge for X`, `cannot spend or
gain Edge on X`, `Edge Boosts cost N less for X`, `reduce the Edge cost of the X Edge Action by N`, `X (N Edge)` in
a list of Edge actions), initiative dice (`+1D6 Initiative`, `an additional Initiative Die`, `in VR` for Matrix; `with 4D6
Initiative Dice` sets them, `removes one Initiative Die` is -1),
condition monitor boxes (`adds one box to the Physical Condition Monitor`, `two extra boxes of Overflow`, `1 less Stun
Box`), maxima (`maximum (but not current) rank increases by 1`, `physical attribute maximums are reduced by 1`,
`racial limit`), Attack Rating bands (`+2/–/–1/–2/–3`), movement (`10/40/+3`), wild dice, extra hits, Minor
Actions (`an additional two Minor Actions`, `use the Move and Avoid Incoming Minor Actions an additional time`),
Hardened Armor, Overwatch, incoming damage (`reduces the Damage Value of any attack by 1`, `incoming DV by its rating`:
`derived:damage-reduction`, not the item's DV), thresholds (`reducing thresholds by 1`, `have their threshold increased by
1`, `-1 for all repair test thresholds`; `the threshold for Surprise tests is 1`: `threshold-set`), lifestyle points, an Attack Rating modifier limited to fire modes
(`decreases the Semi-Auto and Burst Fire Attack Rating modifiers by 1`: `item:ar` +1 with the modes in `when`), a
stat moved between on- and off-road, a rating subtracted from a stat, a cost in percent or nuyen a month, a
knowledge or language skill granted (`gain the knowledge skill Dragon Lore`: `skill:knowledge` +1, the name in
`spec`; `Sorbian (N)`: `skill:language` set `N`), Edge cost on a named action (`When using Called Shot—Disarm, reduce
the Edge cost by 1`). A labelled line naming a target (`**AR:** +2`) reads as one, and a label's switch (`**Wireless
bonus:**`) holds for the sentences after it in its paragraph. Not the entry's: what others suffer (`Those looking for
you …`, `tests made against you`), what using it costs (`3 additional Major Actions required to reload`), a test's
threshold, a cap (`up to a maximum of five initiative dice`). Not a condition: use-it-or-lose-it clauses (`that must
be spent on that test, or it goes away`), the test an Edge is given on (`When performing a Juryrigging test`, `when
targeted by spells`), `can only be spent`, `each time it is used`.

**Across sentences** (owner decision 8, 2026-10-11): a stat printed with its number (`Weapon commlinks have … Firewall
2.`) carries into the next sentence that refers back to it (`Its Firewall attribute is cumulative with other devices`):
`matrix:firewall add 2`. **Edge on a condition with no test named** (decision 9): `offers a bonus Edge if the
opposition doesn't have a vision enhancement` is `test:other edge 1` with the condition's words. **A section's own
rule** (decision 10): a section intro sentence opening with the section's noun (`Missiles are rockets … with sensor
packages adding their rating to the attack roll`) is an effect of the items that noun names (`test:combat add R` on
the Missile Variant; `All rockets and missiles …` on every item), as an `Each …` sentence is.

**A condition from what a test resists** (owner decision 2026-10-11): `more resistant to ingested poisons and toxins,
gaining +1 Edge on tests to resist` is Edge on Toxin Resistance tests with `when="ingested poisons and toxins"`
(the bracket, with its note), not on every toxin test.

**Rows printed under a group header** (owner decision 2026-10-11; `regroup._valueless`): a table row whose value
cells hold no value (`Awareness | Extreme | —`) over rows indented under it is a group header, no item; the indented
rows are the items (`Basic`, `Tactical (rating 1–3)`), each with `group="Awareness"` (shown `Awareness: Basic`), an id
carrying the group (`bs.awareness-basic`), search names `Awareness Basic` and `Basic Awareness`, the heading's text
shared and read by its own run-in (`**Basic:** …`), and the old header id (`bs.awareness`) kept as an alias on the
first of them (moved.py). A transgenic "of the base item" whose base is such a group links to each of its rows.

**Entries named for what they give**: a program or gear named for a skillsoft kind (`Activesofts`, `Knowsofts`,
`Linguasofts`, and an autosoft named for a skill) gives that skill (or a chosen one) at its rating (`set R`, CRB
p. 272); an entry named for a sense (`Low-Light Vision`, `Enhanced Senses (Thermographic)`) has it (`sense:`).

**A variant or rating row with no text of its own** (`Cyberjack Boosters (Firewall) (Rating 1)`, `Move-by-wire
system (Rating 2)`) reads its parent's description (the entry named without the parentheses, or the book's block of
that name when it is no entry), keeping the sentences about its own variant words or about no variant (`A Data
Processing or Firewall cyberjack booster improves that Matrix attribute …`, not `A Matrix Initiative booster …`). A
text that is only label lines (`**Treatment time:** 2 months`) takes the rule the book describes the item under.

**Section-wide statements** (owner decision 2026-10-10): a sentence of a section's intro opening `Each`, `Every`,
`All` or `Any` (`Each cyberlimb adds one box to the character's Physical Condition Monitor`) is an effect of every
item printed in that section (`effects.section_effects`), unless the item's own text excepts it (a sentence of its
own saying it doesn't). Partial limbs, printed with the accessories, don't get it.

Tables: a row naming the entry (or its parenthesised variant: `Cyberjack (Rating 1)` the row `Rating 1`) whose
header has a target column: an infected type's attribute maxima (six attribute columns or more: `set`, its base
metatype in `when`; `Ghoul (Dwarf)` reads the `Ghoul` row whose BASE is Dwarf), a signed modifier (`AR +2`, `DV –1`: an ammo type's), a bonus column (`MATRIX INIT BONUS`). An
armor's Defense Rating column is its defense field, not an effect.

**Links** (`<link rel="grants"|"as" name kind ref level when>`): an entry that grants another (`gain the Built Tough
quality`, `1 free level of Rapid Healing`, `gain the critter power Immunity (Pathogens, Toxins) with a rating of 2`: the
bracket with a comma is its `when`; `Free Vocal Control power`; a drug's `Effect:` list naming one with its page,
`High Pain Tolerance (p. 72)`) or works as another (`the same result as a Personalized Grip`) names it;
`ref` its id when the book tells (its own entry, or the book a citation names: `p. 70, SR6` -> `crb.`). The app uses
the linked entry's effects (`effects.ts linkedEntries`, by id, else by name). A link also names an entry the text only
points to (`See Magic Resistance, p. 72, SR6`; `See p. 76, SR6` for the entry's own name in that book; `function
exactly like the X quality`; `the same as the X quality`; `also have the X benefits`; `function as a laser sight or as
a smartgun system`; tires `(with the same modifiers)`; `works in exactly the same way as the X system`). A variant priced from its base item (`essence="fifty percent more Essence than the base item"`: `Transgenic gills`)
works as that item (the same kind's entry named as the rest of its name, the bioware one when two share it; owner
decision 2026-10-10).

**Whole-object effects** (owner direction 2026-10-17: the reader is the primary source of every entry's effects, from
its text, tables, printed fields, name and category, siblings, links and section intros; Commlink6 is only a rare
override). Besides the pass above:

- An entry with no description of its own reads its book block's prose (a mentor spirit's `**All:** Edge Boosts cost 1
  less for Outdoors tests` lines, less the fluff after `Similar Archetypes`): `effects._block_text`. Siblings that
  share a description are the entries of one category (a `Gain …` sentence is not cut for an `(Gain)` entry of another).
- Entries an override adds are read too (run.py `_read`: `effects.apply(only=…)` after `overrides.texts`).
- After every book is imported or removed (run.py `_links`, `effects.copy_links`), each `<link rel="grants|as">` whose
  entry is found (by `ref`, else its name and kind, in any book) copies the linked entry's effects into the entry:
  `from="<linked id>"` on each copy, `when` of the link on it (`switch="conditional"` unless it has one), none for a
  target, op and specialization the entry has of its own (the book's word for the entry wins), a `grants` link at its
  `level` (the lowest when it names none: `R` counted at that level, a value that cannot be is not copied), two
  levels deep as the app reads them; two links giving the same on-road/off-road pair (Smart Tires) the better of each
  side. The link is marked `copied="yes"`: the app (`linkedEntries`) and the Foundry module (the export's link
  `copied: true`, its effects' `from`) do not follow it again, so nothing is counted twice. A correction follows: when the user has
  corrected the linked entry (the edits layer, `Sr6Entry.edited`, load.ts), the entry's stored copies `from` it are stale, the app
  (`linkedEntries`, `ownParts`, `staleCopies`) follows the link live as an uncopied one, and the export gives that entry's live
  effects as copies `from` it, the link still `copied`; every other copied link stays its stored copies. Run again it starts from the
  entries' own effects (`from` copies are dropped first).
- Batch 2 (2026-10-17), all from the book's words: an Edge bought back by a clause (`must be used on that test or it is lost` keeps the
  test it names, or the one before's); `will not be able to gain any Edge on …`; Edge-cost lists whose lines print `(1 Karma)`,
  `(1,2, or 3 Edge only on …)` or `Escape!`; a named Matrix action (`a Data Spike Matrix Action`: `action:data-spike`; a data
  structure's `a test to compile or register a sprite`); `-1 dice pool penalty to all tests that include Magic` is `test:attr-mag`; a
  body modification's, quality's, critter power's or martial technique's AR or DV in natural-weapon words is `derived:unarmed-ar|dv`;
  an ammo type's unsigned DV is `item:dv` `set`; percent prices (`lowered by fifteen percent`, `fitted gear … ten percent per level`);
  Essence per level (`attr:ess` `-R`) or grade (`derived:essence-hole` `R`); an add-on's sentence in its host's text is the add-on's
  (`less_accessory`); a power focus reads its type's rule (`Power Foci`); a foundation armor's Acceleration and Top Speed come from the
  section's blocks (`-R*0.5`, `-R*10`); a maker's laser sight keeps the core +1 at the ranges it works at; a section's `Notes:` line
  with a sentence for each version (`Small … Large blast shields`) gives each item of the name its own; an item whose name holds a
  section's words reads that section (`Machine Gun Blast Shield (small)`); a musical instrument's `Dice pool effect: N` is `skill:con`
  on a Performance test.
- An id row with `"gen": "cl6"` in importer/sr6/overrides/<book>.json is an effect only Commlink6 has (its `why` says so in one line;
  `effects` replace the entry's effect of that target and op, each written `gen="cl6"` and exported as `gen: "cl6"`): the owner's direction, a rare
  override of the reader, visible as one. Not expressible: a
  multiplier (Warhead FRAG's DAMAGE 0.75).
- Batch 3 (2026-10-17, owner rulings): Commlink6's own effect is a marked `gen="cl6"` override where the reader cannot derive it from the book,
  carrying whom it is for in its target (`apply=` character is the owner: `attr:`, `skill:`, `test:`; item or add-on: `item:`; the unarmed attack:
  `derived:unarmed-*`; a persona: `matrix:`/`derived:matrix-defense`); the book wins where Commlink6 contradicts the printed text (the rows are
  not written). An effect of a row may carry `"replaces": "<target>"`: the entry's effect of that target (and the same op) goes instead of
  the one of the effect's own target (the book names no test, `test:other`, and Commlink6 names Perception: Flare compensation). Where
  Commlink6 splits one bonus over the defense pools (Awareness, Combat Sense, Cognitive Shield, Magic Resistance, Blubber, Dragon Skin …),
  one effect is written per pool: `test:defense` (physical), `test:defense-spell-direct`, `test:defense-spell-indirect`,
  `test:defense-astral`, the book's own (the physical) from the reader and the others `gen="cl6"`. The reader also takes: a skill's ranks added
  to a test's dice pool (`rank:con` on `derived:composure`, `derived:judge-intentions`), a threshold the entry sets (`threshold-set`: spider
  eyes' Surprise tests at 2), a band stated for one range (`+2 AR at Close range only`: `2,0,0,0,0`), the unarmed attack's base damage value
  (`[(STR/2) + 1]P`: Physical, `derived:unarmed-dv` `set` `str/2+1`, a formula over Strength, shown, never applied), and a multiplier on a value (`item:dv` `set` `x0.75`: the Frag warhead's damage, Commlink6's; shown as `× 0.75`, never applied), a metamagic that raises the natural weapon, `tests involving a physical attribute`
  (`test:physical`), `touch-based` tests (the Tactile specialization), `gain access to a network` (Cracking), ammunition that uses the wild die
  (`skill:firearms`), `An implanted version of the X enhancement` (works as it), and two entries named alike but for `External` / `Internal` (`SmartCam`) read only the sentences that do not name the other.
  A power that `functions … as X, except …` is no link to X (its effects are not X's).
- The complete effects review (2026-10-18, owner-approved): the reader's rules by the families of misreading it found, and a `gen="book"` row where no
  rule says it. The reader: the words after a test's name (`tests made in your Territory`, `tests to hide your origin`, `rolls to resist heat-based
  attacks`) are its condition, up to twelve words, never cut on a dangling article and never a fragment, a question, a price or flavor (a drug's story
  is cut from its `Effect:` line, a quality's `if you take this quality` is no condition); a dice modifier on tests it names no target of is
  `test:other` with their words as its condition, on every test or action `test:all`; tests that involve an attribute are `test:attr-*`, never the
  attribute; an attribute listed as what resists a spell, and a prose `body`, are not raised; Edge or dice for resisting a skill's or a spell's tests are
  the defender's (`test:other`, `test:magic-resistance`); Edge against a kind of target is `test:other` with `vs. …`; what others gain (`the opposing
  individual gains a point of Edge`) is `affects="others"`; a bonus Minor Action handed back is conditional on its trigger; a wireless line that brings
  a bonus to N adds the difference from the base; `(choose one)` or `the choice of one skill is permanent` is `skill:choice` (a run-in label holds for
  the sentences after it, and a variant's label may carry a prefix or suffix, `Endo-Booster`, `Swimming tail`; the paragraphs after the last variant's
  are every variant's); a percent is a percent (`50%`, `R*20%` per rating), thresholds `threshold` (`-1`, a higher one the opposition's:
  `affects="others"`), `Each point of nanite volume put in overdrive adds` is `nanite-volume`, `each point of your own Essence loss` is `-(6-ess) RU`;
  overdrive lines: dice on `test:other`, `Convert one die … to a wild die` or `one of which must be a wild die` is `wild-die` on the same tests; a table
  note for another model (`Use the wild die on garrote attacks`) is skipped; an ammo type's printed AR and DV are its effects, once (its text's copy and a
  second, SR5 table are not); prices (`pays ten percent extra for any worn or fitted clothing`), `increase all Lifestyle costs by 500 nuyen per
  month`, `gains four Physical Condition Monitor boxes`, `Add your dracogenesis rating to all flying tests`, a critter's `Gained Powers:` line, the Edge
  cost of an action it names (`reduces the Edge cost for Protect the Principal by 2`), a reward for a result (`if you completely resist all damage …,
  gain a point of Edge`), `cannot earn Edge or spend Edge in any form`, and `all tests involving the operation of a vehicle` (`test:vehicle`).
  A `gen="book"` row (importer/sr6/overrides/<book>.book.json; `why` names the review's findings) puts in its `effects` (written `gen="book"`, exported as
  `gen: "book"`) in place of the reader's of the same target and operation, as a Commlink6 row does (`"keep": true` adds only what is not there; one already
  there is not added twice), takes out the effects its `drops` name exactly (those attributes equal, the ones it leaves out absent; a drop that matches
  nothing is reported) and adds a link through `kids`. The rows are mostly generated from the review's findings against the reader of the day
  (the review's scripts, not in the repository, regenerate them when the reader changes), a few written by hand; a rule in the reader is
  preferred, and a row is deleted when a rule makes it redundant.
- A rule the book states for all the items of a class (a section intro's `Each cyberlimb adds one box`, `Basic limbs are
  installed with all Physical attributes at 2` -> `limb-attr:*` `set` 2, CRB p. 288, or a variant's own table row,
  `Missile Variant` NOTES `+2 to Attack Rating` and the section's `Missiles are rockets … sensor packages adding their
  rating to the attack roll`, CRB p. 264-265, `when` the variant) carries `rule="<its heading>"`: copy_links gives it to the entries of
  the same kind and CL6 class (`class=`, only the verified `CYBERWARE/CYBER_LIMBS` and `AMMUNITION/ROCKETS`) in other books that
  have no effect of their own for it and whose text does not speak of it (Body Shop's Additional Cyberarm; Tarnished Star's
  Foamtek rocket; not a partial limb: forearm, hand, lower leg, foot). `rule` is import bookkeeping; the copy carries
  `from="<source>:<heading>"` and no `rule`.

**What the app does with them** (`src/sr6/catalog/domain/effects.ts`): an `add` on an attribute, Defense Rating,
initiative dice, Physical, Stun or Overflow boxes, a skill's pool, or a test type's pools is a bonus (lineBonuses: a
player's own bonuses still override, D3). The total shown first holds the always-on ones; the bracketed total
(`derive.ts` on) adds the switchable and conditional ones, shown `6 (9)` on every sheet, Review and the Skills tab
(shared rule: `src/core/shared/effects.ts` counts, both games). `attr-max` effects of a quality set or raise the
attribute's maximum (attrMax); the rest (Edge rules, extra actions, Matrix and item
stats, links) are shown on the hover card and listed on the printed sheet's Effects (runnerView.effectNotes). The
Foundry export carries every effect and link (`effects`, `links`) and both totals (`derived`, `derivedOn`, an
attribute's `switched`); the module applies the ones Eden has a field for.
The quality the creation settings name (`builtToughQuality`, `dermalDepositsQuality`) counts once when its own
effects add the same.

**Descriptions the effects rely on**: a description cut at a page break with a table between its halves gets its
rest back (regroup `_continuations`); a part heading every entry of a section prints (`##### Advantages` under each
mentor spirit) is part of the entry; a Companion sub-quality has its own lines, not its block's; a variant row whose
own text is short (`Genotype Enhancement (NeoElastian)`) gets the run-in paragraph the book prints for it under the
parent (`**NeoElastian:** …`); a description several entries share (`High performance engines … Racing engines …`)
is read per entry from the sentence naming it.

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
in `src/sr6/formats/domain/types.ts`.

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
  The metamagic pickers (the Magic tab's and the Ledger's initiation) offer every metamagic, one the runner may not
  take marked (an adept's is for an adept or mystic adept, a magician's for a full or aspected magician or mystic
  adept); taken, it is an error, `magic.metamagicUser` (0.11.1: before, the pickers hid it and the Ledger refused it).
- **metamagic `perLevel`** (`maxLevel`): its text says it can be taken again (`as many times as you like`, `can be taken
  multiple times`; `up to N times`). Taking it again raises the pick's level; each level is one initiation grade's
  metamagic, and Review counts levels against the grade (`magic.metamagicCount`).
- **spell `opposed`**: its test is opposed (`opposed by`, `Opposed test`, `resisted by`, `vs. Willpower + …`, `vs. Object
  Resistance`; not `as opposed to`), and every Combat spell (Direct ones opposed by Willpower + Intuition, Indirect ones
  rolled against Reaction + Willpower). **spell `essence`**: its test counts the target's Essence, in its threshold
  (`Sorcery + Magic (5 – Essence)`, `6 minus the target's Essence`) or its resistance (`Body + Essence`). Shown in the picker, on the Magic tab and on the sheets.
- **armor `social`**: its SOCIAL column (Firing Squad and later), as printed. The worn armor's add up with Charisma into
  the runner's Social Rating (derived values, Review, the sheet); the export's `values.social` is the number. Clothing is
  armor (owner 2026-10-15): Smooth Operations' OUTFIT table imports as armor, category Clothing, no `defense` (it adds none),
  its SOCIAL RATING column as `social` as printed (`–8`, `—`, `Rating`).
- **gear `capacity`** of a cyberdeck case (Hack & Slash): the CAPACITY (CYBERDECK/CYBERHACK) column as printed (`12/4 (includes
  cyberhack and deck)`, `4/Not Available`, `Unlimited/Unlimited`); the engine reads only a plain number there, so these show and
  take part in no capacity check.

### Levels: one item per level

Owner decision 2026-10-11: every item with levels is one catalog item per level, otherwise duplicates, positive and
negative levels alike. The files stay as printed (one rated or leveled entry); the app expands them when the catalog
loads (`src/sr6/catalog/domain/levels.ts`, the last step of `buildSr6Catalog`, after the edits layer), so nothing is
re-imported and an edit on the printed entry reaches every level:

- an entry with a printed rating range (`rating="1–4"`) is one entry per rating, `rating="N"`: its printed `Rating ×
  500` and formulas price at that rating, its `R` effects count it;
- an entry taken by level up to a printed maximum (`perLevel="true" maxLevel="3"`, or the range in its name, `Will to
  Live (1-3)`: qualities, adept powers, metamagics) is one entry per level with `perLevel` and `maxLevel` dropped, its
  Karma (a range's both ends) or power-point cost × the level, and its per-level effects worked out (`R` → `2`,
  `R*2` → `4`), so a level is a plain entry; one with no printed maximum stays as it is, its level on the runner's line
  (an edit that sets `maxLevel` turns it into levels);
- rows the book prints one per level (`Cyberjack (Rating 2)`, `Wired Reflexes 3` with siblings 1..n) are grouped as a
  family without duplication; the bare-number form counts only when the numbers run 1..n and the rows' effects or
  formulas use the rating (so `Ares Predator VI` is a model, not a level), and such a row with no rating of its own
  reads its `R` at its level.

A level is `<Name> N` (a trailing `(1-3)` or `(rating 1–6)` in the printed name dropped), id `<parent id>.<N>`, with
`family="<parent id>"` and `level="N"` (a printed row's family is `<source>.<base name slug>`), the parent's other
attributes, parts, formulas and issues, and the parent's name as a search alias. The parent leaves `Sr6Catalog.entries`
(pickers and Game data list the levels) and stays in `Sr6Catalog.levels` by `entryKey(kind, id)`: `resolveEntry` and a
formula's `ref()` still read it, `data.named()` answers its lowest level by its printed name (a `<link level>` picks
that level), the typed views keep it marked `parent`, and its own issues are the family's (Review names them for a
runner holding any level). An edit keyed by a level's id (`crb.wired-reflexes.2`) is that level, its text the
parent's when it has none. `Sr6Data` offers `family`, `atLevel`, `siblings`, `levelOf` and `sameFamily` (a creation
setting naming a quality, `builtToughQuality`, matches any level of it).

**Runners hold the level's id.** A new line, pick or quality is the level's entry (the editor's `purchase`, `accessory`,
`quality` and `pick` ops take the parent id with a rating or level too and store the level's); the line's rating select
and a quality's or power's level stepper move it to the sibling level (`rate`, `quality`, `powerLevel`). A saved runner
naming the parent (with `rating`, or a quality's or pick's `level`) is turned into the level's entry once on load
(`src/sr6/runner-builder/domain/career/migrate.ts`, recorded in `<migrated>`; a level the family lacks: left as it is, so Review still flags
it; a career level-up saved before levels were entries, with no `target`: the level it reached, on the line it raised)
and until then still reads at its rating or level. In career play a quality or power of a family the runner has is an upgrade (the lower level
replaced, the Karma the difference × `advance.qualityFactor`; the advance's `target` names the line replaced) and the
`upgrade` spend replaces a bought item with a higher level of its family at the new level's full price (the core
rulebook prints no trade-in rule). The export writes the level's entry (`attrs.family`, `attrs.level`; a line still
naming the parent goes out as the level it is at). cl6check is unchanged: it measures the printed files, whose values
it already compares at every rating.
