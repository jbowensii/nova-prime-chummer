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
| qualities | quality | kind* positive\|negative, karma int (the lowest printed), karmaMax int (the highest, when it prints several), karmaSteps (the prices a line lists as its choices, `7 or 12 Karma`: `7 12`, bought at one of them and never between; a range, `2 to 20 Karma`, has none), perLevel true, maxLevel int, category (the list it is printed in: `Returned Soldier power`; a quality path's bare step: the path), group (a bare step's path: shown `Gestalt: Step 2`), granted true (never bought on its own: granted by another quality's choice, Karma 0) | effect (target*, op*, value*, switch, confidence `low`, when, spec, affects: see Effects)×n, link (rel* grants\|as, name*, kind, ref, level, when)×n, test (skill*, attr*, threshold int)×n, choice (see Choices; kind quality: category*, count* int, max int)×n: see Qualities granted and chosen |
| weapons | weapon | category*, rating (a rated weapon or mount's range: its SIZE or LEVEL column), dv, modes, ar, ammo, type, mount, blast, avail, cost | — |
| armor | armor | category*, rating, defense, social (its SOCIAL column as printed: `+2`, `–4`, `—`; what it adds to the wearer's Social Rating), capacity, avail, cost | — |
| augmentations | augmentation | type* cyberware\|bioware\|geneware\|nanoware\|symbionts\|transgenics (only cyberware and bioware take a grade), category*, rating, essence, capacity, avail, cost | — |
| grades | grade | essence, cost (multipliers), avail (modifier): decimals (`1.1`, `-1`); types (the augmentation types it is for, absent: cyberware and bioware) | — |
| electronics | device | category*, rating, array, programs, capacity, avail, cost | — |
| programs | program | type* (basic, hacking, autosoft, … as printed), rating, avail, cost (where the book prints them: the core rulebook's per type, its `Autosoft` row's rating formula for the autosofts) | — |
| gear | gear | category*, rating, capacity, karma, avail, cost, per, slots, energy (a weapon power supply's Energy) | — |
| vehicles | vehicle | category*, handling, accel, interval, topSpeed, body, armor, pilot, sensor, seats, avail, cost | — |
| spells | spell | category* combat\|detection\|health\|illusion\|manipulation, tags, range, type, duration, dv, damage, opposed true (its test is opposed), essence true (its test counts the target's Essence, in its threshold or its resistance): see Flags | — |
| rituals | ritual | keywords, threshold | — |
| adeptpowers | adeptpower | cost, costCombat (the price for a combat skill, the power's `Combat skill: 1.0 PP per level; other skills 0.5 PP per level`: cost then the other skills'), perLevel true, maxLevel int, activation | — |
| complexforms | complexform | duration, fade | — |
| metamagics | metamagic | user adept\|magician (absent: any initiate), perLevel true (taken again), maxLevel int: see Flags | — |
| echoes | echo | — | — |
| martialarts | martialart | categories (Grappling, Weapon, … as printed), signature (its signature technique) | — |
| martialtechniques | martialtechnique | category (as printed; a restriction after it goes to the text) | `<requires kind>` (adeptpower, technique, quality, augmentation, other: its prerequisites, below) |
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
| vehicledesign | design | category (chassis, powertrain, console, …: its table), bp, dp (its cost in Design Points as printed, `2 x Armor Rating`: a cost, not an effect), rating, slots, avail, cost (as printed) | — |
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
only, never an item's name. Each effect is `<effect target op value [switch] [confidence] [when] [spec] [affects]>`:

- **Targets**: `attr:<abbr>` (bod … cha, edg, mag, res, ess); `attr-max:<abbr>` an attribute's maximum
  (`attr-max:choice`: the one the player picks); `skill:<id>` a skill's pool (a specialization it is limited to in
  `spec`; `skill:choice` a chosen skill); `test:<type>` a test type, shown on every pool it covers: `social` (Con,
  Influence: the tests that influence or con someone, CRB p. 97), `matrix` (Cracking, Electronics), `magic`,
  `resonance`, `combat`, `vehicle`, `physical` and `mental` (the skills linked to those attributes), `attr-<abbr>` (the
  tests using that attribute), `damage-resistance`, `drain-resistance`, `toxin-resistance`, `magic-resistance`,
  `defense`, `surprise`, `crash`, `addiction`, `spell-<category>`, `all`, and `other` (tests whose words name no
  skill, test type or activity: its words in `when`). A test the book names by activity (`tests involving grappling,
  escaping bonds`) is that activity's skill (owner decision 2026-10-10; `effects.ACTIVITIES`, from the core rulebook's
  skill descriptions: grappling Close Combat, escaping Athletics, haggling Influence …), its specialization in `spec`
  when the activity is one, else the activity's words in `when`; `derived:<name>` Defense Rating (`defense`, `defense-astral`, `social`),
  initiative (`initiative`, `initiative-dice`, `matrix-initiative`, `matrix-initiative-dice`), condition monitor boxes
  (`physical-monitor`, `stun-monitor`, `matrix-monitor`, `overflow`), `composure`, `judge-intentions`, `memory`, `lift`, `movement`,
  `minor-actions`, `major-actions`, `hardened-armor`, `damage-reduction`, `power-points`, the unarmed attack's `unarmed-ar`,
  `unarmed-dv` (`add`, or `set` from a table's `3P`: the bone lacing table, CRB Hong Kong p. 286) and `unarmed-damage`
  (`set` `P`: `unarmed combat damage becomes Physical`); `matrix:<name>` a Matrix attribute
  (`attack`, `sleaze`, `data-processing`, `firewall`, `choice`) or `matrix:overwatch`; `item:<field>` the item's own
  stat, or on an add-on (accessory, ammunition, vehicle mod) the stat of the item it fits (`ar`, a value a range band
  `0,1,1,0,0`; `dv`, `concealability`, `handling`, `acceleration`, `speed-interval`, `top-speed`, `body`, `armor`,
  `pilot`, `sensor`, `seats`, `size`, `ammo` an ammunition belt's or magazine's capacity); `action:<name>` an Edge or
  Matrix action (`the Snoop action`, `Called Shot—Disarm`, a list after `action:`); `complex-form:<name>` a complex
  form named as what the bonus is on; `lifestyle:<name>` lifestyle points; `resource:<name>` a creation resource;
  `skill-max:<id>` a skill's maximum (`skill-max:choice`: Aptitude's 10, Genetic Optimization's +1); `sense:<name>`
  a sense the entry is named for or grants (`low-light-vision`, `thermographic-vision`, `ultrasound`, `wide-band-hearing`
  …: `effects.SENSES`, a rule of its own, shown); `action-max:<name>` the cap on an action's bonus (`increases the
  maximum dice pool bonus for Take Aim by its rating`, a raised maximum, shown; owner decision 2026-10-11);
  `pool:chase` the chase pool's Edge (Double Clutch p. 175);
  `pricemod:<what>` a price in percent (`armor` for armor and clothing, `lifestyle`, `gear`, `everything`: `0.1` is
  +10%); `derived:monthly-cost` nuyen a month (`R*500`). A Matrix attribute, attribute or skill the entry leaves to the
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
  `wild-die`, `hits` (N extra hits), `threshold` (the tests' threshold moves by N: a toxin extractor's `-R`). An extra
  Minor or Major Action, Hardened Armor N and Overwatch -N are `add`s on their targets; `set` also gives a rating
  (`the Magic attribute at 3`, an artificial skill at the hardwire's rating).
- **Values**: a number; `R`, `-R`, `R*N` (x the line's rating or level: `adds its rating`, `per level`, `each point
  of this mod`, `each point of X rating`); `R-1`, `R*N-N` (so much per level after the first: `each level after the
  first grants a +1 dice pool modifier for such tests`, Nimble Fingers; counted as rating − 1, never below 0; owner
  decision 2026-10-11); `R[1,1,2,2]` (the book's own value per rating, a per-rating table: rating 3 gives the third,
  beyond the table the last; owner decision 2026-10-11, for the owner's overrides of table-driven items); a range
  band `x` in an `item:ar` list (`2,1,-2,0,x`: the band removed, `removes the longest-range Attack Rating`, shown `—`;
  owner decision 2026-10-11); a formula with the book's rounding (`edg/2 RD`: half Edge rounded down, `RU` when the
  book is silent; `nanite-volume/2 RU`: +1 for every two points of nanite volume; owner decision 13, 2026-10-11:
  shown with the formula, never applied); `hits` (a spell's or complex form's, per net hit: `net hits are added to the
  subject's Defense Rating`, `each hit increases the target's Overwatch Score by 1`); `N` a native language; `20%` a
  percent of the base value; `R/-R` a vehicle's on-road and off-road Handling; or a formula over attributes (`edg`,
  `edg/2`: a drake's Armor by its Edge). `hits`, percents and formulas are shown, never applied.
- **How it is turned on** (`switch`): none (always on: in the total shown first), `wireless`, `activated` (at will,
  an action, overdrive, a drug while it acts, a data structure for the action after its Minor Action), `sustained`
  (a spell, ritual or complex form while it lasts),
  `conditional` (some tests or situations: `when` holds the condition's words, `while in the Matrix`, or a mentor
  spirit's role `magician`/`adept`). A switchable or conditional effect counts in the bracketed total, `Con 6 (9)`, as
  a book's stat block prints it (owner decision 2026-10-10). `confidence="low"` (a condition the importer found no
  words for, a formula per point of something) is shown, never applied.
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
a list of Edge actions), initiative dice (`+1D6 Initiative`, `an additional Initiative Die`, `in VR` for Matrix),
condition monitor boxes (`adds one box to the Physical Condition Monitor`, `two extra boxes of Overflow`, `1 less Stun
Box`), maxima (`maximum (but not current) rank increases by 1`, `physical attribute maximums are reduced by 1`,
`racial limit`), Attack Rating bands (`+2/–/–1/–2/–3`), movement (`10/40/+3`), wild dice, extra hits, Minor
Actions (`an additional two Minor Actions`, `use the Move and Avoid Incoming Minor Actions an additional time`),
Hardened Armor, Overwatch, incoming damage, lifestyle points, an Attack Rating modifier limited to fire modes
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
metatype in `when`), a signed modifier (`AR +2`, `DV –1`: an ammo type's), a bonus column (`MATRIX INIT BONUS`). An
armor's Defense Rating column is its defense field, not an effect.

**Links** (`<link rel="grants"|"as" name kind ref level when>`): an entry that grants another (`gain the Built Tough
quality`, `1 free level of Rapid Healing`) or works as another (`the same result as a Personalized Grip`) names it;
`ref` its id when the book tells (its own entry, or the book a citation names: `p. 70, SR6` -> `crb.`). The app uses
the linked entry's effects (`effects.ts linkedEntries`, by id, else by name), so a correction there follows. A
variant priced from its base item (`essence="fifty percent more Essence than the base item"`: `Transgenic gills`)
works as that item (the same kind's entry named as the rest of its name, the bioware one when two share it; owner
decision 2026-10-10).

**What the app does with them** (`src/sr6/engine/effects.ts`): an `add` on an attribute, Defense Rating,
initiative dice, Physical, Stun or Overflow boxes, a skill's pool, or a test type's pools is a bonus (lineBonuses: a
player's own bonuses still override, D3). The total shown first holds the always-on ones; the bracketed total
(`derive.ts` on) adds the switchable and conditional ones, shown `6 (9)` on every sheet, Review and the Skills tab
(shared rule: `src/engine/effects.ts` counts, both games). `attr-max` effects of a quality set or raise the
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
  the runner's Social Rating (derived values, Review, the sheet); the export's `values.social` is the number.

### Levels: one item per level

Owner decision 2026-10-11: every item with levels is one catalog item per level, otherwise duplicates, positive and
negative levels alike. The files stay as printed (one rated or leveled entry); the app expands them when the catalog
loads (`src/sr6/engine/levels.ts`, the last step of `buildSr6Catalog`, after the edits layer), so nothing is
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
(`src/sr6/engine/migrate.ts`, recorded in `<migrated>`; a level it lacks: the lowest) and until then still reads at
its rating or level. In career play a quality or power of a family the runner has is an upgrade (the lower level
replaced, the Karma the difference × `advance.qualityFactor`; the advance's `target` names the line replaced) and the
`upgrade` spend replaces a bought item with a higher level of its family at the new level's full price (the core
rulebook prints no trade-in rule). The export writes the level's entry (`attrs.family`, `attrs.level`; a line still
naming the parent goes out as the level it is at). cl6check is unchanged: it measures the printed files, whose values
it already compares at every rating.

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
sources of one date that disagree leave the issue), `errata` (an errata PDF's statement on its own book, applied
when the errata is newer than the printing; the text keeps the value it replaced), or `printing` (an older printing of
the same book, `importer/sr6/run.py` `older_printings`: field by field the latest printing wins, and a field it leaves
out or prints as no SR6 value takes the newest older printing's valid value; the text names that printing). `source` and `page` say where it is
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

The app (`src/sr6/engine/categories.ts`): an accessory belongs on a host of a category its record `fits`; the accessory
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

**Sample corrections.** The edits layer also holds `<samplefix id="<sample id>" source page>` entries (kind
`samplefixes`, `samplefixes.xsd`): a book sample runner's printed line corrected, the owner's way to set right a value the
book misprints without touching the importer. Each `<correct item field from to note?>` sets `rating`, `qty` or `grade`
of the runner's line buying catalog item `item`, while that line still prints `from`. The runner file keeps the book's
value; the app reads the corrected one everywhere (editor, Your runners, the export: `src/sr6/engine/samplefix.ts`) and
Review notes "Earbuds: the book prints rating 4; corrected to 3 by an override" in place of the error. `source` and `page`
must be the sample's printed ones. Export my edits and Import edits carry them like any edit.

## Creation rules

The creation rules are the numbers the books print only in their text: starting karma, caps, exchange rates,
point-buy prices, lifepath counts, augmentation grades. A creation rules file (`<sr6:creation
xmlns:sr6="urn:chummer-sr6:config:1" version="1">`, `creation.xsd`) holds them as `<setting key value source? page?/>`
(500 at most, each key once).

**Layers.** A runner is built and checked with the server's settings (Table setup), or its campaign's own, with the
runner's own choices of the optional rules over them (its Creation method tab; `Sr6Character.rules`, `creation.ts
RUNNER_RULE_KEYS` and `runnerRules`): the prime runner's Karma, the expanded contacts, the Availability cap and its
illegal-only reading, the Karma and nuyen kept, an expertise's skill points, the quality count. A campaign's GM (or the
admin) can lock any of them on the campaign's page (`campaigns.xml <lock key by/>`): its runners then keep the table's
value, shown as locked with who locked it, and Review notes a choice set aside. Every place reads a runner's rules through
`runnerRules` (the editor, the budgets, Review, the sheets, career play, the Foundry export, which lists the rules that
aren't the server's in `rules`). A runner without its own choices has the table's, as before.

**The standard settings ship with the app**: `public/data/sr6/creation-defaults.xml` holds the core rulebook's numbers
as its latest printing prints them (source `CRB-HK`, the Hong Kong City Edition's pages; every value checked against
it) and the Sixth World Companion's for sum-to-ten, point buy and lifepath (source `SWC`), each with its
printed page; numbers only, no book text. A new server can build runners with every method a book prints right away.
The core rulebook's rules ship as the latest printing (the Hong Kong City Edition, source `CRB-HK`) prints them; the
books' optional rules ship off (`false`, with their book and page), for a table to turn on. The owner's house rules and
options (2026-10-11) ship off too, each a true/false toggle with the values a GM sets nested under it: no book prints
`karmaToNuyenMax` (under `karmaToNuyenCap`), `advance.powerPoint` (under `buyPowerPoints`), `positiveQualityFactor`
(under `positiveQualityMultiplier`), the carry-over, data structure and grade caps, or the karma build (`karmaBuild.*`,
`magicKarma:*` under `karmaBuildMethod`: no SR6 book describes one, so Karma build can't be picked until the table turns
it on and enters its own). `skillPointsExpertise` ships on (1: as a specialization's one rank; CRB Hong Kong p. 65 says
no expertise with skill points at creation while p. 68 prices one, so its hover text names both). `metatypeKarma:` is set to 0 for the core rulebook's five metatypes and to the Companion's karma for the 25
metavariants and metasapients its import writes (`swc.<id>`); a metatype from another book needs its own.

`custom/sr6/creation.xml` holds only what the admin changed (`PUT /api/sr6/creation`, on the Table setup page, `#/sr6/table`):
the server's settings are the standard ones with those keys replaced (`loadCreation` in `src/sr6/engine/creation.ts`).
The Table setup page (and a campaign's own settings, a runner's Creation rules panel) lays the settings out in nine foldable
sections (Budgets & priorities; Attributes & skills; Qualities; Magic & Resonance; Gear & augmentations; Contacts & lifestyle;
Levels of play; Optional rules (book); House rules; `src/sr6/ui/creationLayout.ts`), a closed section drawing no rows, with a
search box by name. Every on/off rule is a switch; a number that needs one sits indented under it, greyed with "needs …"
while it is off. A value at the standard is grey; a changed one stands out and shows the standard and its page beside it, with
**Reset** per value, **Reset section** and **Reset all to standard**; saving sends only the values that differ from the standard. An empty field means
the standard value. An older full `creation.xml` works the same (rows equal to the standard simply match it). **Load
settings file** fills the form from a creation rules file, the standard values filling the rest. A GM may give a
campaign they run its own copy on its page; it is kept in `custom/sr6/campaigns.xml` as the campaign's `<creation>` with the
same `<setting/>` rows (`campaigns.xsd`, `PUT /api/sr6/campaigns/<id> { creation }`, its GMs and the admin; its players
read it), and that campaign's runners are built, checked and priced with it. A campaign's own settings are a full copy,
started from the server's settings. Keys, types and
the methods that need them: `CREATION_KEYS` and `expandKeys` in `src/sr6/engine/creation.ts` (per metatype:
`metatypeKarma:<id>`; per awakened or emerged magic kind: `pointBuy.startRating:<kind>`, `magicKarma:<kind>`,
`lifepath.startRating:<kind>`). A creation method whose settings are unset can't be picked.

**Hover text.** Every setting's row on Table setup, and on a runner's Creation rules, has hover text (`aboutOf` in
`creation.ts`): what it does in plain words, then where a book prints it (book and page), else `house rule` or
`option`. No label or hover text names another app (`tests/sr6/settings-about.test.ts`).

Every key, in the order Table setup shows them. *Needed by*: the methods that can't be picked while it is unset (`all`:
every method); `optional`: unset, the rule that reads it is skipped (Advancement: the spend that needs it is refused,
a cap isn't applied, an exchange isn't offered; Derived values: the value shows empty; a grade: it can't be
chosen while its Essence factor is unset). `karmaToNuyenMax` isn't printed in the core rulebook (`maxKarmaLeft` is, from the
City Editions on: 5, Hong Kong p. 66, shipped):
unset, there is no limit (a table that uses one enters it from the book or house rule that gives it). A number may be a decimal; `true/false` is the word; a quality id names a catalog quality (`crb.<slug>`).

*Needs*, *not with* and *in place of* are the nested optional rules (`RULE_DEPS` in `creation.ts`; the books' pages in
the owner's notes): a setting that needs another applies only while that one is on (a true/false one `true`, any other
set); while it is off the setting keeps its stored value but is left out (`applyDeps`, inside `runnerRules`, so the
engine never sees it), and Table setup and a runner's Creation rules show it under its parent, greyed and disabled with
"needs …". Two settings *not with* each other can't both be on: the second is disabled there and says why; rules that
come on together anyway (a hand-edited file, the table's and a runner's own) keep one, the campaign-locked one, else the
runner's own, else the one listed first, and Review notes a runner's choice set aside (`rules.setAside`). *In place of*:
the settings a rule stands in for while on (its own code does it). Every rule stays off by default.

| group | key | type | needed by | needs | not with | in place of | what it is |
|---|---|---|---|---|---|---|---|
| General | `startingKarma` | number | all |  |  |  | Starting karma |
| General | `qualityNetBonusCap` | number | all |  |  |  | Most net karma from qualities |
| General | `qualityMaxCount` | number | all |  |  |  | Most paid qualities |
| General | `oneAttributeAtMax` | true/false | all |  |  |  | Only one attribute at its maximum |
| General | `attributeBaseMax` | number | optional |  |  |  | Adjustment points go on attributes whose metatype maximum is above |
| General | `skillCap` | number | all |  |  |  | Highest skill rank |
| General | `skillCapAptitude` | number | all |  |  |  | Highest skill rank with the aptitude quality |
| General | `aptitudeQuality` | quality id | all |  |  |  | Aptitude quality: `skillCapAptitude` (and, in career, `advance.skillMax` + the same step) for the skill its note names only (CRB Hong Kong p. 70: "for the selected skill"); one naming no skill lets any one skill go higher, and Review's `quality.choice` asks for the skill |
| General | `skillPointsSpec` | number | all |  |  |  | Skill points for a specialization |
| General | `skillPointsExpertise` | number | optional |  |  |  | Skill points for an expertise (shipped 1; unset: bought with karma at `advance.expertise`). A book discrepancy: CRB Hong Kong p. 65 (none with skill points at creation) against p. 68 (its price) |
| General | `magicMax` | number | all |  |  |  | Highest Magic or Resonance |
| General | `essence` | number | all |  |  |  | Starting Essence |
| General | `contactPointsPerCha` | number | all |  |  |  | Contact points per Charisma (the augmented Charisma, as Logic's knowledge skills the augmented Logic: owner, 2026-10-09) |
| General | `knowledgePerLog` | number | all |  |  |  | Free knowledge skills per Logic |
| General | `maxAvailability` | number | all |  |  |  | Highest Availability |
| General | `maxNuyenLeft` | number | all |  |  |  | Most nuyen kept after creation (CRB Hong Kong p. 68: 5,000); more is Review's `leftover.nuyen`, an error a GM can approve |
| General | `freeSpellsPerMagic` | number | all |  |  |  | Free spells per Magic |
| General | `freeFormsPerResonance` | number | all |  |  |  | Free complex forms per Resonance |
| General | `maxKarmaLeft` | number | optional |  |  |  | Most karma kept after creation (CRB Hong Kong p. 66: 5; more is `leftover.karma`, an error a GM can approve; unset: no limit) |
| General | `ownCarryOver` | true/false | optional |  |  | `maxKarmaLeft`, `maxNuyenLeft` | House rule, off: the GM's own carry-over limits `carryOver.karma` and `carryOver.nuyen` (nested, unset) replace the book's while on |
| General | `carryOver.karma`, `carryOver.nuyen` | number | optional | `ownCarryOver` |  |  | The GM's own most Karma and nuyen kept after creation |
| General | `mentorSpiritQuality` | quality id | optional |  |  |  | The Mentor Spirit quality (CRB Hong Kong p. 73): choosing a mentor spirit on the Magic tab adds it with its Karma; removing it removes the mentor spirit |
| General | `expandedContacts` | true/false | optional |  |  |  | The Sixth World Companion's Expanded Rules for Contacts at Character Creation (SWC p. 161), optional: off (each rating up to Charisma, no karma). The importer assumes it for a book sample whose printed contacts need it |
| General | `contactKarma` | number | optional | `expandedContacts` |  |  | With `expandedContacts`: karma per contact point past the points or past a contact's pair cap (SWC p. 161: 1) |
| General | `contactPairPerCha` | number | optional | `expandedContacts` |  |  | A contact's connection + loyalty up to Charisma times (with `contactKarma`) |
| General | `contactRatingMax` | number | optional | `expandedContacts` |  |  | Highest contact rating (with `contactKarma`; unset: Charisma) |
| General | `manyTalentsQuality` | quality id | optional |  |  |  | Many Talents: two attributes at their maximum (SWC p. 134) |
| General | `manySkillsQuality` | quality id | optional |  |  |  | Many Skills: two skills at the highest rank (SWC p. 134) |
| General | `availabilityCapIllegalOnly` | bool | optional |  |  |  | The Availability cap holds only illegal gear (the 2019 printing's p. 66; the later printings cap every item, so it ships `false`, CRB Hong Kong p. 66) |
| General | `exceptionalQuality` | quality id | optional |  |  |  | Exceptional (Attribute): +1 to the maximum of the attribute its note names (CRB Hong Kong p. 71), once per attribute (Review's `quality.choiceTwice`). When the quality carries its own `attr-max:choice` effect, that effect is what counts (never twice) |
| General | `incompetentQuality` | quality id | optional |  |  |  | Incompetent (Skill) (CRB Hong Kong pp. 76–77): no ranks in the skill its note names, not a Magic skill without Magic nor Tasking without Resonance (`skill.incompetent`), that skill once (`quality.choiceTwice`) |
| General | `sensitiveSystemQuality` | quality id | optional |  |  |  | Sensitive System (CRB Hong Kong p. 78): an error with a Magic or Resonance rating (`quality.sensitiveSystem`); cyberware, bioware and nanoware Essence times `sensitiveSystemEssence` (2) |
| General | `sensitiveSystemEssence` | number | optional |  |  |  | Sensitive System's Essence factor (CRB Hong Kong p. 78: doubled) |
| General | `languageMax` | number | optional |  |  |  | Highest level any language reaches (owner, 2026-10-11: 4; the Native one counts as this level, the stepper and the Foundry export use it); one Native language only (CRB Hong Kong p. 67): Review's `knowledge.languages` (unset: no cap) |
| General | `fociForcePerMagic` | number | optional |  |  |  | The foci's Force together at most Magic times this (CRB Hong Kong p. 154: 5); with no more foci than Magic and none of Force above it, and none for a runner neither awakened (`magic.foci`) |
| General | `fociBondKarma` | true/false | optional |  |  |  | A focus costs its bonding Karma (its catalog `karma`, `Force x 3`, at the line's rating) out of the customization Karma (CRB Hong Kong pp. 154, 168: a focus is used only once bonded; true) |
| General | `improvedAbilityPower` | quality id | optional |  |  |  | The Improved Ability adept power (an adept power's id; CRB Hong Kong p. 157): it needs a rank in the skill its note names, and the boosted skill is at most `improvedAbilityFactor` times the rank, rounded up, or the rank + `skillAugmentMax`, whichever is lower (`adept.improvedAbility`) |
| General | `improvedAbilityFactor` | number | optional |  |  |  | Improved Ability's most: 1.5 times the original rank (CRB Hong Kong p. 157) |
| General | `attributeMaxFloor` | number | optional |  |  |  | The lowest a quality's effect lowers an attribute's maximum to (Impaired: "to a minimum of 2", CRB Hong Kong p. 76; unset: no floor) |
| Levels of play | `priorityLetters` | letters | optional |  |  |  | The five priority letters the columns take, one each (CRB Hong Kong p. 63: `ABCDE`); sum to ten takes only letters among them. A level of play sets its own |
| Levels of play | `levelStreet` | true/false | optional |  | `levelPrime`, `levelSwcStreet`, `levelSwcElite` |  | Street level (CRB Hong Kong p. 63, off): each priority gives the values of the row below (E stays E): points, nuyen, metatypes and magic kinds |
| Levels of play | `levelPrime` | true/false | optional |  | `levelStreet`, `levelSwcStreet`, `levelSwcElite` |  | Prime runner (CRB Hong Kong p. 63, off): twice `startingKarma` |
| Levels of play | `levelSwcStreet` | true/false | optional |  | `levelStreet`, `levelPrime`, `levelSwcElite` | `sumToTenTarget`, `pointBuy.total`, `lifepath.moduleCount`, `priorityLetters` | The Sixth World Companion's street-level (SWC pp. 14–15, off): while on, `swcStreet.letters` (B C C D E), `.sumToTen` (8), `.pointBuy` (80) and `.modules` (6) replace `priorityLetters`, `sumToTenTarget`, `pointBuy.total` and `lifepath.moduleCount` (`levelRules`, through `runnerRules`), and an illegal item but a cyberdeck is an error (`gear.illegal`) |
| Levels of play | `levelSwcElite` | true/false | optional |  | `levelStreet`, `levelPrime`, `levelSwcStreet` | `sumToTenTarget`, `pointBuy.total`, `lifepath.moduleCount`, `priorityLetters`, `maxAvailability` | The Sixth World Companion's elite (SWC p. 15, off): `swcElite.letters` (A B B C D), `.sumToTen` (12), `.pointBuy` (120), `.modules` (10) likewise, and no Availability cap. The book's letters add up to 13 while it says sum-to-twelve: both ship as printed |
| Levels of play | `swcStreet.*`, `swcElite.*` | number, letters | optional | `levelSwcStreet`, `levelSwcElite` |  |  | The two levels' own values (above) |
| Karma prices | `karmaAttrPerRank` | number | all |  |  |  | Attribute: karma per rank, times the new rating |
| Karma prices | `karmaSkillPerRank` | number | all |  |  |  | Skill: karma per rank, times the new rank |
| Karma prices | `karmaSpec` | number | all |  |  |  | Specialization |
| Karma prices | `karmaKnowledge` | number | all |  |  |  | Knowledge or language rank |
| Karma prices | `karmaSpell` | number | all |  |  |  | Extra spell or ritual |
| Karma prices | `karmaForm` | number | all |  |  |  | Extra complex form |
| Karma prices | `karmaInitiationBase` | number | all |  |  |  | Initiation or submersion: base |
| Karma prices | `karmaInitiationPerGrade` | number | all |  |  |  | Initiation or submersion: per grade |
| Karma prices | `positiveQualityMultiplier` | true/false | optional |  |  |  | Option, off: positive qualities cost their karma times `positiveQualityFactor` |
| Karma prices | `positiveQualityFactor` | number | optional | `positiveQualityMultiplier` |  |  | Positive qualities cost their karma times (shipped 1; unset or the option off: 1) |
| Karma prices | `karmaMartialArt` | number | optional |  |  |  | Martial arts style (it comes with its signature technique; unset: counts 0, Review warns, not bought after creation) |
| Karma prices | `karmaTechnique` | number | optional |  |  |  | Martial arts technique (a style’s signature one is free; unset: as `karmaMartialArt`) |
| Advancement | `advance.expertise` | number | optional |  |  |  | Expertise after creation |
| Advancement | `advance.expertiseRank` | number | optional |  |  |  | Lowest skill rank for an expertise (unset: none; Review's `skill.expertiseRank`) |
| Advancement | `advance.qualityFactor` | number | optional |  |  |  | A positive quality after creation costs its karma times |
| Advancement | `advance.buyOffFactor` | number | optional |  |  |  | Buying off a negative quality costs its karma times |
| Advancement | `advance.skillMax` | number | optional |  |  |  | Highest skill rank after creation (unset: no cap) |
| Advancement | `buyPowerPoints` | true/false | optional |  |  |  | House rule, off: a mystic adept buys power points after creation for `advance.powerPoint` (the book: a power point in place of a metamagic at initiation, CRB Hong Kong p. 168) |
| Advancement | `advance.powerPoint` | number | optional | `buyPowerPoints` |  |  | Karma per power point (mystic adepts; unset) |
| Advancement | `advance.karmaToNuyenRate` | number | optional | `workingForTheMan` |  |  | Nuyen per karma after creation, with `workingForTheMan` on (the Sixth World Companion's Working for the Man, p. 153: 2,000) |
| Advancement | `advance.nuyenToKarmaRate` | number | optional | `workingForThePeople` |  |  | Nuyen per karma, nuyen to karma, with `workingForThePeople` on (Working for the People, SWC p. 153: 2,000) |
| Nuyen | `karmaToNuyenRate` | number | all |  |  |  | Nuyen per karma |
| Nuyen | `karmaToNuyenRateInDebt` | number | all |  |  |  | Nuyen per karma with the in-debt quality |
| Nuyen | `inDebtQuality` | quality id | all |  |  |  | In-debt quality |
| Nuyen | `karmaToNuyenCap` | true/false | optional |  |  |  | House rule, off (no limit: CRB Hong Kong p. 66 prints none): the Karma turned into nuyen at creation up to `karmaToNuyenMax` |
| Nuyen | `karmaToNuyenMax` | number | optional | `karmaToNuyenCap` |  |  | Most karma turned into nuyen (unset: no limit) |
| Nuyen | `dataStructureNuyen` | number | optional |  |  |  | Nuyen per level of a data structure bought (Hack & Slash p. 72: 5,000); its Karma, the level, is paid to integrate it (p. 71) |
| Nuyen | `fakeSinPerRating` | number | all |  |  |  | Fake SIN: nuyen per rating |
| Nuyen | `licencePerRating` | number | all |  |  |  | Fake licence: nuyen per rating |
| Sum to ten | `sumToTenTarget` | number | sum to ten |  |  |  | The letters’ values add up to at most |
| Sum to ten | `letterValue:A` | number | sum to ten |  |  |  | Value of priority A |
| Sum to ten | `letterValue:B` | number | sum to ten |  |  |  | Value of priority B |
| Sum to ten | `letterValue:C` | number | sum to ten |  |  |  | Value of priority C |
| Sum to ten | `letterValue:D` | number | sum to ten |  |  |  | Value of priority D |
| Sum to ten | `letterValue:E` | number | sum to ten |  |  |  | Value of priority E |
| Point buy | `pointBuy.total` | number | point buy |  |  |  | Character points |
| Point buy | `pointBuy.awakened` | number | point buy |  |  |  | Character points to be awakened or emerged |
| Point buy | `pointBuy.free.attribute` | number | point buy |  |  |  | Free attribute points |
| Point buy | `pointBuy.max.attribute` | number | point buy |  |  |  | Most attribute points |
| Point buy | `pointBuy.free.skill` | number | point buy |  |  |  | Free skill points |
| Point buy | `pointBuy.max.skill` | number | point buy |  |  |  | Most skill points |
| Point buy | `pointBuy.free.adjustment` | number | point buy |  |  |  | Free adjustment points |
| Point buy | `pointBuy.max.adjustment` | number | point buy |  |  |  | Most adjustment points |
| Point buy | `pointBuy.free.nuyen` | number | point buy |  |  |  | Free nuyen |
| Point buy | `pointBuy.max.nuyen` | number | point buy |  |  |  | Most nuyen |
| Point buy | `pointBuy.cost.attribute` | number | point buy |  |  |  | Character points per attribute point |
| Point buy | `pointBuy.cost.skill` | number | point buy |  |  |  | Character points per skill point |
| Point buy | `pointBuy.cost.adjustment` | number | point buy |  |  |  | Character points per adjustment point |
| Point buy | `pointBuy.cost.powerPoint` | number | point buy |  |  |  | Character points per power point |
| Point buy | `pointBuy.cost.mysticPowerPoint` | number | point buy |  |  |  | Character points per power point (mystic adept) |
| Point buy | `pointBuy.cost.spell` | number | point buy |  |  |  | Character points per spell |
| Point buy | `pointBuy.cost.complexForm` | number | point buy |  |  |  | Character points per complex form |
| Point buy | `pointBuy.nuyenPerCp` | number | point buy |  |  |  | Nuyen per character point |
| Point buy | `pointBuy.oneSpecialization` | true/false | point buy |  |  |  | Only one specialization |
| Karma build | `karmaBuildMethod` | true/false | optional |  |  |  | Option, off: the Karma build can be picked (no SR6 book describes one) |
| Karma build | `karmaBuild.start` | number | karma | `karmaBuildMethod` |  |  | Starting karma (karma build) |
| Karma build | `karmaBuild.startRating` | number | karma | `karmaBuildMethod` |  |  | Starting Magic or Resonance (karma build) |
| Lifepath | `lifepath.moduleCount` | number | lifepath |  |  |  | Adult life modules to take |
| Lifepath | `lifepath.contactRatingCap` | number | lifepath |  |  |  | Highest contact rating |
| Lifepath | `lifepath.bestAttributeBonus` | number | optional |  |  |  | The best attribute rises by this, up to its metatype maximum; the rest goes on a second attribute (unset: no raise) |
| Lifepath | `lifepath.repeatModules` | number | optional |  |  |  | Adult modules that may be taken twice (unset: none) |
| Lifepath | `lifepath.contactKarma` | number | optional |  |  |  | Karma per contact rating the contact points don't cover (each module's points go only to contacts of its types; unset: not offered, the ratings overspend the points). Karma never raises a contact's connection or loyalty above Charisma: the points must pay for what is above it (SWC p. 31) |
| Lifepath | `lifepath.raisedAttributeStart` | number | optional |  |  |  | Attributes whose metatype maximum is above `attributeBaseMax` start at (Born This Way; unset: 1) |
| Lifepath | `lifepath.mundaneEdge` | number | optional |  |  |  | Edge a runner neither awakened nor emerged gains (Born This Way; unset: none) |
| Augmentation grades | `grade:standard:essence` | number | optional |  |  |  | Standard: Essence times |
| Augmentation grades | `grade:standard:cost` | number | optional |  |  |  | Standard: cost times |
| Augmentation grades | `grade:standard:avail` | number | optional |  |  |  | Standard: Availability plus |
| Augmentation grades | `grade:alpha:essence` | number | optional |  |  |  | Alpha: Essence times |
| Augmentation grades | `grade:alpha:cost` | number | optional |  |  |  | Alpha: cost times |
| Augmentation grades | `grade:alpha:avail` | number | optional |  |  |  | Alpha: Availability plus |
| Augmentation grades | `grade:beta:essence` | number | optional |  |  |  | Beta: Essence times |
| Augmentation grades | `grade:beta:cost` | number | optional |  |  |  | Beta: cost times |
| Augmentation grades | `grade:beta:avail` | number | optional |  |  |  | Beta: Availability plus |
| Augmentation grades | `grade:delta:essence` | number | optional |  |  |  | Delta: Essence times |
| Augmentation grades | `grade:delta:cost` | number | optional |  |  |  | Delta: cost times |
| Augmentation grades | `grade:delta:avail` | number | optional |  |  |  | Delta: Availability plus |
| Augmentation grades | `grade:used:essence` | number | optional |  |  |  | Used: Essence times |
| Augmentation grades | `grade:used:cost` | number | optional |  |  |  | Used: cost times |
| Augmentation grades | `grade:used:avail` | number | optional |  |  |  | Used: Availability plus |
| Derived values | `monitorBase` | number | optional |  |  |  | Condition monitor: boxes before the attribute |
| Derived values | `monitorDivisor` | number | optional |  |  |  | Condition monitor: the attribute divided by (rounded up) |
| Derived values | `initiativeDice` | number | optional |  |  |  | Initiative dice |
| Derived values | `initiativeDiceMax` | number | optional |  |  |  | Most initiative dice, after bonuses, astral and Matrix too (CRB Hong Kong p. 39: 5; unset: no cap) |
| Derived values | `astralInitiativeDice` | number | optional |  |  |  | Astral initiative dice |
| Derived values | `specDice` | number | optional |  |  |  | Dice for a specialization |
| Derived values | `expertiseDice` | number | optional |  |  |  | Dice for an expertise |
| Derived values | `untrainedPenalty` | number | optional |  |  |  | Dice off the attribute for an untrained skill |
| Derived values | `overflowPerBody` | number | optional |  |  |  | Damage Overflow boxes per point of Body (CRB Hong Kong p. 121: dead at Body × 2; 2), plus what adds to them (Will to Live); unset: Body counts none |
| Derived values | `attributeAugmentMax` | number | optional |  |  |  | Most an attribute's augmented value is above its natural one (CRB Hong Kong p. 37: 4); the always-on and the bracketed totals alike, a penalty never; the attribute card and Review say what was left out (unset: no cap) |
| Derived values | `skillAugmentMax` | number | optional |  |  |  | Most a skill's dice pool is raised by bonuses, a specialization's bonus within it (CRB Hong Kong p. 39: 4; unset: no cap) |
| Derived values | `monitorMinimum` | number | optional |  |  |  | Fewest boxes a condition monitor is lowered to (Glass Jaw, CRB Hong Kong p. 76: 2; unset: no floor) |
| Derived values | `matrixColdDice`, `matrixHotDice` | number | optional |  |  |  | VR initiative dice on top of the usual `initiativeDice` (CRB Hong Kong p. 179: 1 cold sim, 2 hot sim, within the 5D6); with what adds Matrix initiative dice. Matrix initiative is shown when the runner has a commlink (its D/F array's Data Processing) or is a technomancer (Logic, p. 189); AR initiative is the physical one |
| Derived values | `moveWalk`, `moveSprint`, `moveSprintPerHit` | number | optional |  |  |  | Metres for a Move (CRB Hong Kong p. 42: 10), a Sprint (p. 44: 15) and a Sprint's metres more a hit (1), plus what adds to movement |
| Derived values | `unarmedDV` | number | optional |  |  |  | Unarmed Damage Value (CRB Hong Kong p. 94: 2S). Physical with the `dermalDepositsQuality` (p. 71) or an effect `derived:unarmed-damage` (bone lacing, bone density: pp. 286, 291); an effect `derived:unarmed-dv` `set` (the bone lacing table's `3P`) raises it to that value, `add` adds (unset: none shown) |
| Derived values | `arDrEdgeGap` | number | optional |  |  |  | The lead of an Attack Rating over a Defense Rating, or the other way, that gains a point of Edge (CRB Hong Kong p. 45: 4): the Gear tab's target Defense Rating shows it at each range band |
| Derived values | `meleeArStrength` | true/false | optional |  |  |  | Strength adds to a melee weapon's Attack Rating (CRB Hong Kong p. 39: true; a whip, whose AR note says so, Reaction: p. 250). A melee weapon: an Attack Rating at Close only, no modes or ammo |
| Optional rules | `stackingAdvantage` | true/false | optional | `arDrEdgeGap` |  |  | The Sixth World Companion's Stacking Advantage (SWC p. 144, off): a lead of twice `arDrEdgeGap` gains 2 Edge, never more |
| Optional rules | `strengthInCloseCombat` | true/false | optional |  |  | `meleeArStrength` | Rolling Strength instead of Agility in Close Combat (SWC p. 150, off): Close Combat's pool uses Strength, and Agility goes into the melee and unarmed Attack Ratings in Strength's place |
| Optional rules | `highStrengthDamage` | true/false | optional |  |  |  | High Strength Adds to Damage (SWC p. 150, off): +1 to the unarmed and melee Damage Values from Strength `strengthDamageStep1` (7), +2 from `strengthDamageStep2` (10) |
| Optional rules | `alternateMysticAdept` | true/false | optional |  |  |  | Alternate Mystic Adept (SWC p. 148, off): half a power point for each point of Magic given to powers and for each point of Magic raised past the priority's, at creation and after; Conjuring and Enchanting are errors |
| Optional rules | `twentyQuestions`, `twentyQuestionsKarma` | true/false, number | optional |  |  |  | Twenty Questions (SWC p. 25, off): the karma (3) added to the starting karma |
| Optional rules | `workingForTheMan`, `workingForThePeople` | true/false | optional |  |  |  | Working for the Man / for the People (SWC p. 153, off): karma to nuyen, nuyen to karma after creation, at the Advancement rates |
| Optional rules | `expandedSpecializations` | true/false | optional |  |  |  | Expanded Specializations (SWC p. 153, off): any number of specializations a skill (`<skill specs>`), still one expertise; off, only Exotic Weapons takes several (CRB Hong Kong p. 95), and Review's `skill.oneSpec` flags the others |
| Optional rules | `unrestrictedSkillRanks` | true/false | optional |  |  | `advance.skillMax` | Unrestricted Skill Ranks (SWC p. 153, off): no `advance.skillMax` after creation |
| Optional rules | `suprathyroidStacks` | true/false | optional |  |  |  | Suprathyroid Bonuses Stack (SWC p. 149, off): the suprathyroid gland is exempt from the other augmentations' attribute and initiative incompatibilities (`gear.incompatible`); the +4 cap still holds |
| Optional rules | `strengthDamageStep1`, `strengthDamageStep2` | number | optional | `highStrengthDamage` |  |  | The Strength for each step of High Strength Adds to Damage (SWC p. 150: 7 and 10) |
| Optional rules | `exoticFirstSpecFree` | true/false | optional |  |  |  | House rule, off: the first Exotic Weapons specialization costs no skill points or Karma |
| Optional rules | `mentorBothAdvantages` | true/false | optional |  |  |  | House rule, off: a mystic adept gets both its mentor spirit's magician and adept advantages; off, it picks one for good (CRB Hong Kong pp. 162–163; Review's `magic.mentorAdvantage` until picked) |
| Optional rules | `dataStructureCaps` | true/false | optional |  |  |  | House rule, off: a technomancer's data structures past `dataStructure.maxCount` or above `dataStructure.maxRating` are Review's `magic.dataStructureCaps`, errors a GM can approve |
| Optional rules | `dataStructure.maxCount`, `dataStructure.maxRating` | number | optional | `dataStructureCaps` |  |  | The GM's caps (unset) |
| Optional rules | `noUsedCulturedBioware` | true/false | optional |  |  |  | House rule, off: cultured bioware takes no used grade (nor Body Shop's omega, which replaces it); the books print no exclusion (CRB Hong Kong p. 282) |
| Optional rules | `gradeCapAtCreation` | true/false | optional |  |  |  | House rule, off: an initiation or submersion grade at creation above `gradeCap.initiation` or `gradeCap.submersion` is Review's `magic.gradeCapCreation`, an error a GM can approve (a grade above Magic or Resonance stays `magic.gradeCap`) |
| Optional rules | `gradeCap.initiation`, `gradeCap.submersion` | number | optional | `gradeCapAtCreation` |  |  | The GM's caps (unset) |
| Optional rules | `adjustOnLoweredMax` | true/false | optional |  |  |  | House rule, off: adjustment points also on an attribute whose metatype maximum is below `attributeBaseMax` |
| Optional rules | `pointBuyErrataNuyen` | true/false | optional |  |  | `pointBuy.max.nuyen` | House rule, off: point buy's most nuyen is 450,000, the errata version (as printed: 440,000, SWC p. 29) |
| Optional rules | `knowledgeLogicIntuition` | true/false | optional |  |  |  | House rule, off: free knowledge points from Logic + Intuition (as printed: Logic, CRB Hong Kong p. 67) |
| Optional rules | `magicAboveSixByGrade` | true/false | optional |  |  |  | Option, off (CRB Hong Kong p. 167): Magic or Resonance at creation up to `magicMax` plus the initiation or submersion grade (as printed: `magicMax`, p. 65) |
| Optional rules | `eliteSumToThirteen` | true/false | optional | `levelSwcElite` |  | `sumToTenTarget` | House rule, off: with Elite, sum-to-thirteen (the book prints sum-to-twelve) |
| Optional rules | `availabilitySeven` | true/false | optional |  |  | `maxAvailability` | House rule, off: gear of Availability 7 at creation (as printed: 6, CRB Hong Kong p. 66) |
| Optional rules | `cargoWithoutSeats` | true/false | optional |  |  |  | Option, off (Double Clutch p. 126): a vehicle line's seats removed (`<purchase seatsRemoved>`) add cargo; its Cargo Factor 150 percent of Seating (125 on a bike), 4 more on a truck, shown on the Vehicles tab |
| Optional rules | `metatypeSizePricing` | true/false | optional |  |  |  | House rule, on: a troll-sized runner (troll, cyclops, fomori, giant, minotaur: budgets.ts `metatypeSize`, by the metatype's name) pays 10% more for everything bought, a dwarf-sized one (dwarf, gnome, hanuman, koborokuru, menehune) 10% more for armor, as one `sizePricing` line of the nuyen budget (no SR6 book prints a general rule) |
| Derived values | `charismaticDefenseQuality` | quality id | optional |  |  |  | Charismatic Defense: the Defense Rating from Charisma, not Body (Power Plays p. 85) |
| Metatypes | `metatypeKarma:<metatype id>` | number | point buy, karma, lifepath |  |  |  | the metatype's karma (one per catalog metatype) |
| Point buy | `pointBuy.startRating:<kind>` | number | point buy |  |  |  | starting Magic or Resonance per awakened or emerged kind |
| Karma build | `magicKarma:<kind>` | number | karma |  |  |  | karma to be that kind |
| Lifepath | `lifepath.startRating:<kind>` | number | lifepath |  |  |  | starting Magic or Resonance per kind |

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

### Prerequisites (0.11.1)

A prerequisite the runner lacks never stops a pick (owner, 2026-10-09). The editor and the Ledger take it, the pickers
list it (marked, never hidden or disabled), and Review raises an error cited to the page that prints the rule; a GM's
approval (`overrides`, `{code, path}`) clears it. Career Review (`validateCareer`) shows these errors too.

| Code | Path | What the runner lacks | Cited |
| --- | --- | --- | --- |
| `martial.requires` | `martial.<style>.<technique>` | a technique's adept power, technique or quality | FS p. 97 |
| `martial.augmentation` | `martial.<style>.<technique>` | a technique's augmentation | FS p. 97 |
| `martial.category` | `martial.<style>.<technique>` | a style that teaches the technique's category | FS p. 97 |
| `magic.metamagicUser` | `magic.<uid>` | the magic kind a metamagic is for | the metamagic's page |
| `magic.spellsAllowed` | `magic.<uid>` | a magic kind that learns the spell, ritual, complex form or echo | CRB p. 67 |
| `adept.ppBudget` | `magic` | an adept kind, for adept powers (and power points left) | CRB p. 67 |
| `skill.specUntrained` | `skills.<id>` | a rank in the skill a specialization or expertise is on | CRB p. 93 |
| `skill.expertiseSpec` | `skills.<id>` | a specialization before an expertise | CRB p. 68 |
| `skill.expertiseRank` | `skills.<id>` | the skill rank an expertise needs (`advance.expertiseRank`) | the setting's page (CRB p. 68) |

An expertise at creation is no error by itself (owner, 2026-10-09): CRB p. 65's "you cannot acquire an expertise" is about the
priority skill points; step four (CRB p. 66) spends the customization karma on advancement at p. 68's prices, so an expertise
costs `advance.expertise` karma (5) at creation too, unless `skillPointsExpertise` gives it skill points. Its prerequisites
are the two errors above.
| `gear.grade` | `<tab>.<line uid>` | an augmentation type the grade comes in | CRB p. 283, or the catalog grade's page |
| `catalog.accessoryHost` | `<tab>.<host uid>` | a host the accessory's category fits | the accessory's page |
| `lifepath.requires` | `method.<module id>` | the magic kind an adult life module is for | the module's page |
| `quality.granted` | `qualities.<uid>` | a quality offering a granted-only quality's list | the quality's page |

Still refused, as structural: a grade on anything but an augmentation or a custom line (`no-grade`), a grade whose
factors aren't set (`unknown-grade`), a life module that isn't an adult one (`not-available`), power points bought by
any kind but a mystic adept and initiation or submersion by a runner with no Magic or Resonance (`cannot-learn`,
`mundane-cannot-initiate`, `not-awakened`, `not-emerged`), and raising Magic or Resonance a runner doesn't have
(`unknown-attribute`). An adept power in career still needs the power points to pay for it (`no-power-points`).
