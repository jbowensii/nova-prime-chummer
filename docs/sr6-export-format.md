# SR6 export format (Chummer SR6 export v1)

One JSON file of Shadowrun 6 runners, NPCs or book data, read by the Foundry VTT importer module
`jbowensii/chummer-sr6-foundry` (module id `chummer-sr6-importer`, system `shadowrun6-eden`). It is separate from the SR6
runner file (`docs/sr6-character-format.md`), which stays the format the app stores, and from Anarchy's export
(`docs/export-format.md`): each Foundry module refuses the other game's file. The schema is
`public/data/schema/sr6-export.schema.json` (JSON Schema draft 2020-12, `$id` `urn:chummer-sr6:export:1`); the module ships
the same file. The producer is `src/sr6/engine/export.ts`.

Two kinds, told apart by `kind`:

- `runners`: one or more runners or NPCs as they stand (a finalized runner with its career spends replayed).
- `books`: the ticked books' entries of every kind (`SR6_KINDS`: the implant grades and the kinds only listed as printed
  included, so the compendiums hold everything), as the app sees them (catalog edits applied), or one GM compendium.

Files are named `runners-YYYY-MM-DD.sr6foundry.json`, `books-YYYY-MM-DD.sr6foundry.json` and
`compendium-<SOURCE>-YYYY-MM-DD.sr6foundry.json` (the local date of the export). The importer goes by `format` and `kind`,
never the name.

Where it's made: Export for Foundry on the SR6 runner list (a dialog: tick runners or a campaign), in a runner's or NPC's
editor, on NPCs & Critters (the header's dialog and each row), on Game data (GMs: "Export book data for Foundry") and on
a compendium's page. The book panel says: "Include book descriptions — For your own Foundry only. Don’t share this file."
The runners dialog adds: "The file includes the text of the runners’ amps and gear. Share it only with people who own the
books."

Every number is Chummer's own: `deriveSr6` for attributes, Essence, Edge and the derived values, `priced` for a
purchase's cost, Availability and Essence, `rated` for an entry's printed values, `npcValues` and `npcPools` for an NPC
block. Each entry also keeps what the book prints (`attrs`, `parts`), so a reader can show it.

## Envelope

| Field | Meaning |
|---|---|
| `format` | always `"chummer-sr6-export"` |
| `version` | `1` |
| `kind` | `"runners"` or `"books"` |
| `exportedAt` | ISO 8601 time of the export |
| `app` | `{ name, version }`: `"Nova Prime Chummer"` (the app's name, both games) and its version |
| `descriptions` | `true` if description texts are included (see Descriptions) |
| `runners` | kind `runners` (required there, at least one): runners and NPCs |
| `books` | kind `books` (required there, at least one): books |

## Runner

The runner as it stands: a draft's build, or the finalized build with the live career spends replayed. The runner object
is closed (no other keys).

| Field | Meaning |
|---|---|
| `id`, `updatedAt`, `exportedAt` | the runner's id, last change, this export's time |
| `streetName`, `realName` | identity |
| `gender` | optional: the runner's gender as the player wrote it (left out when not set) |
| `finalized` | true once the runner is finalized (career play) |
| `metatype` | `{ id, name }`; an NPC may have none (`""`) |
| `magic` | `{ kind, tradition?, drainAttr?, aspectedSkill?, initiation, submersion }`; `kind` `full`, `aspected`, `mystic-adept`, `adept`, `technomancer` or `mundane` |
| `portrait`, `token` | a data URL (`data:image/png` or `data:image/jpeg`, base64), or `null`; no token: use the portrait |
| `attributes` | `{ bod … cha, edg, mag, res }`, each `{ natural, augmented }`: natural is the rating (Magic or Resonance less the Essence loss), augmented adds the always-on bonuses (entered, else the catalog entry's effects); `switched`: with the switchable and conditional effects on (the bracket, `5 (7)`), only when it differs from `augmented` |
| `essence`, `edge` | Essence left and the augmented Edge |
| `skills` | `[{ id, name, attr, rank, spec?, expertise? }]`: `id` the catalog's (it carries the source, e.g. `crb.firearms`), so a reader matches by `name` |
| `knowledge` | `[{ name, kind, native, rank }]`: `kind` `knowledge` or `language` |
| `qualities` | items (below) plus `{ uid, positive, level, free, note? }`; `free`: a metatype trait |
| `picks` | items plus `{ uid, pick, level?, bonuses }`: spells, rituals, adept powers, complex forms, metamagics, echoes |
| `martialArts` | martial arts styles: items (kind `martialarts`; `attrs.categories`, `attrs.signature` as printed) plus `{ uid, techniques }`; `techniques`: the ones learned under the style (its signature one included), items (kind `martialtechniques`; `attrs.category`) plus `{ uid, requires? }`; `requires`: the technique's printed prerequisites `[{ kind, name, met? }]`, `kind` `adeptpower`, `technique`, `quality`, `augmentation` or `other`, `met` whether the runner has it (absent when it can't be told: `other`, or an augmentation printed as an amount), absent when it prints none (and in older files). Absent in files written before martial arts were added |
| `purchases` | purchases (below): weapons, armor, augmentations, electronics, programs (programs and autosofts), gear, vehicles and drones, critters |
| `contacts` | `[{ uid, name, archetype, connection, loyalty, types? }]`; `types`: the Sixth World Companion's contact types, when set |
| `lifestyle` | **deprecated**, kept for the module's older versions: the first lifestyle of the first SIN that has one, `{ id, name, months, cost? }`, or `null`. Read `sins[].lifestyles` |
| `sins` | `[{ uid, name, kind, rating?, gender?, placeholder?, licences: [{ name, rating }], lifestyles: [{ uid, id, name, months, cost? }] }]`; `kind` `real` or `fake`; `gender`: that identity's own; `placeholder: true` (left out otherwise): an unnamed stand-in (`name` empty, `kind` real, free) holding an older file's lifestyle when the runner had no SIN, shown as Unnamed SIN; `lifestyles`: the ones paid under this SIN (a lifestyle always belongs to a SIN, a SIN may have none); `cost` is the lifestyle's price per month. For Eden: a `sin` item per SIN and a `lifestyle` item per lifestyle with `system.sin` naming its SIN |
| `karma`, `nuyen` | a finalized runner's balances (the ledger); a draft's: what the build budgets leave |
| `derived` | a runner only (an NPC has none): `{ initiative, astralInit?, monitors, monitorBonus, defenseRating, socialRating (Charisma plus the worn armor's Social), composure, judgeIntentions, memory, liftCarry, drain?, adeptDrain? { value, attr } (an adept's or mystic adept's drain: Body + Willpower, CRB Adepts; a Street Wyrd Way's attribute in place of Willpower, p. 77), fading?, pools, unarmedDamage? { dv, physical } (CRB Hong Kong p. 94: 2S; Physical with Dermal Deposits or bone lacing), spellAttackRating? (Magic + the tradition's attribute, p. 132), matrixInit? { ar, cold, hot: { base, dice }, dataProcessing } (p. 179), movement? { walk, sprint, perHit } (pp. 42, 44) }`. For reading, except `monitorBonus` `{ physical, stun }`: the boxes the monitors have beyond base + attribute / divisor (Built Tough's), which the importer writes as the system's monitor modifiers; the system derives the rest itself |
| `derivedOn` | a runner only: the same values with the switchable and conditional effects on (wireless, activated, sustained, some tests only): the bracketed totals a book's stat block prints, `Con 6 (9)` (owner decision 2026-10-10). `derived` holds the always-on ones |
| `background`, `notes` | free text |
| `ledger` | `[{ at, type, summary, karma, nuyen }]`: the live entries with the Ledger tab's label (`Creation finished`, `Earned: <run> (<date>)`, the spend's label, the note); a voided entry and its void are left out |
| `npc` | an NPC only: the NPC block (below) |

`initiative` and `astralInit` are `{ base, dice }` (`dice` `null` when its creation setting isn't set); `monitors`
`{ physical, stun, overflow }`; `pools` `[{ skill, label, rank, attr, dp, spec?, expertise?, specDp?, expertiseDp? }]`.

### Items and purchases

An item is a catalog entry as printed plus Chummer's values. Closed: no other keys.

| Field | Meaning |
|---|---|
| `uid` | the line on the runner (absent on a book entry) |
| `id`, `source`, `page` | the catalog entry; absent on a custom line |
| `kind` | the catalog kind (`weapons`, `spells`, `qualities`, … the 26 of `SR6_KINDS`) |
| `name` | as printed (a custom line: the player's) |
| `label` | how Chummer shows it, when that differs from the printed name: its category first (`Cyberlimb: Arm (synthetic)`). The category itself is `attrs.category` (and `attrs.group` when the name needs it), a product's maker `attrs.maker`. An importer whose item has no category field may use `label` as the item's name |
| `canon` | the source is canon; a custom line or a GM compendium's entry: `false` |
| `attrs` | every attribute of the entry as printed (strings: `"Rating × 500"`, `"5(L)"`, `"9/7/—/—/—"`); an augmentation's `type` is `cyberware` or `bioware` (geneware, symbionts and transgenics go as bioware, nanoware as cyberware, the printed type in `ware`). The flags the builder uses: a spell's `opposed` `"true"` (its test is opposed; every Combat spell) and `essence` `"true"` (its test counts the target's Essence, in its threshold, `5 – Essence`, or its resistance, `Body + Essence`); a metamagic's `user` `"adept"` or `"magician"` (who may take it; absent: any initiate, a mystic adept either), `perLevel` `"true"` (it can be taken again, one initiation's metamagic each time; the pick's `level` counts them) and `maxLevel` (the most times, when printed); an armor's `social`; a level of a family of levels (`docs/sr6-data-format.md` "Levels": a rated or leveled entry is one entry per level, `Wired Reflexes 2`) carries `family` (the printed entry's id) and `level`, its `rating` that level's |
| `parts` | `[{ tag, text }]`: the entry's child lines (a being's skills, powers, …) |
| `values` | Chummer's numbers (below) |
| `description` | the entry's text (see Descriptions), absent when empty |
| `effects` | what the entry's printed text and tables say it does (the catalog's `<effect>`, `docs/sr6-data-format.md` Effects): `[{ target, op, value, low?, switch?, when?, spec?, affects? }]`; `target` `attr:<abbr>`, `attr-max:<abbr>`, `skill:<id>`, `skill-max:<id>`, `test:<type>`, `derived:<name>`, `matrix:<name>`, `item:<field>` (on an add-on: the item it fits; `item:ar` five comma-separated bands, or one value with the fire modes it is limited to in `when`), `action:<name>`, `complex-form:<name>`, `lifestyle:<name>`, `resource:<name>`, `pricemod:<what>` (a price in percent, `0.1`), `pool:chase` or `sense:<name>` (docs/sr6-data-format.md Effects lists them); `op` `add`, `set`, `edge`, `edge-cost`, `edge-cost-set`, `no-edge`, `no-edge-gain`, `wild-die`, `hits` or `threshold`; `value` a number, `R`/`R*N` per rating or level, `R-1`/`R*N-N` (less so much after the rating is counted, never below 0), `R[1,1,2,2]` (the book's value per rating, the last beyond the table), `hits` (per net hit), `N` (a native language), `20%`, `R/-R` (on- and off-road), an `x` band (removed) or a formula; `low` true when read with low confidence (shown, never applied); `switch` how it is turned on (a switchable one counts in `derivedOn`, not `derived`); `when` the condition's words; `spec` the specialization a skill effect is limited to; `affects` `caster` or `target` (a spell's or complex form's; `target` never counted on the caster), or `others` (what others get against the entry, never counted on the runner). A reader applies the always-on `add`s it has a field for, offers the switchable ones as effects the player turns on, and shows the rest. Absent when none |
| `links` | another entry this one grants (`rel` `grants`) or works as (`as`): `[{ rel, name, kind?, id?, level?, when? }]`; a reader uses that entry's effects. Absent when none |
| `tests` | a test the entry's text calls for: `[{ skill, attr, threshold? }]` (`skill:<id>`, `attr:<abbr>`). Absent when none |
| `aliases` | the ids the entry had in earlier imports (the catalog's `<alias id kind>`, `docs/sr6-data-format.md`): `[{ id, kind? }]`, `kind` only when it was another kind. A reader that keyed something by an old id finds it again. Absent when none |

A purchase adds `{ uid, qty, grade?, worn, note?, bonuses, accessories }`. Its `values` are at its rating, and `cost`,
`avail` and `essence` are one unit's, priced with its grade (`priced` on the line with quantity 1 and no accessories).
`bonuses` are the line's bonuses as the engine counts them (the player's entered ones, else its catalog entry's `add`
effects, with the effects of the entries it links to) `[{ target, value, when?, switch?, spec?, affects? }]` (`target` an attribute, `initDice`,
`defense`, the Defense Rating, `physical` or `stun`, condition monitor boxes, or `overflow`, Damage Overflow boxes), or
`{ target: "skill", id, name, value }` for a skill's dice pool (`id` the catalog skill's id, `name` its name, which a reader
keying its skills by name, as Eden does, finds it by; `derived.pools` counts it, or `derivedOn.pools` when it is switchable, conditional or limited to a specialization the runner hasn't), evaluated: × the
rating when per rating, × the quantity (an accessory: its own rating). `accessories` are purchases too; an
accessory's bonuses are its host item's (a cyberlimb's own Strength), never the runner's, so `derived.attributes` leaves
them out.

What a vehicle, drone or critter the runner owns adds (the Foundry module makes each its own Eden Vehicle or Critter
actor, tied to the runner):

| Field | Meaning |
|---|---|
| `mount` | on a weapon fitted to a vehicle or drone: the `uid` of the weapon mount (a sibling accessory) it sits in, or `builtin:<n>` for a mount built in, the vehicle's `vehicle.builtin[n]` |
| `diy` | `true` on a vehicle mod the player installed (half its nuyen price, Double Clutch p. 120) |
| `vehicle` | on a vehicle or drone: `{ drone, builtin, slotShifts?, seatsRemoved?, design? }`. `drone` by its class or category; `builtin` the mods built in as shown (`Zap plating 2`, `3 more chassis mod slots`, a design's own mods), already paid for, with the book's built-in notes; `slotShifts` `[{ from, to }]` in the order made (two `chassis`, `powertrain` or `electronics` slots give one of the other); `seatsRemoved` the seats taken out for cargo (`values.vehicle.seats` is what is left); `design` the Designer design it was bought from (its line's `id` is `design.<id>`, its numbers the design's when bought). Its mods, mounts, weapons and autosofts are its `accessories` |
| `npc` | on a critter: its stat block (the NPC block, below), absent on a custom critter |
| `critter` | on a critter: `{ class, tamed, commands, training, qualities }`; `class` `mundane`, `exotic` or `wild` (the pet class bought) or `awakened`/`emerged` (by its Magic or Resonance); `commands` and `training` its trained commands and special training (Wild Life p. 180), a count (a later file: the named ones); `qualities` its companion qualities `[{ uid, id, level, name?, how?, positive? }]`, `how` `tamed` or `bonded` (the Critter Bond path), absent when specified with the purchase. Its critterware and gear are its `accessories`; its critter powers are innate (0 Karma), in the stat block |

### Values

A key is absent when the book prints nothing or Chummer can't read it: never `NaN`, never `null` (only `ar` holds nulls,
for a dash).

| Key | From |
|---|---|
| `rating` | the line's rating, else the lowest of the entry's `rating` range (`"1-3"` → 1); none for an unrated item |
| `cost` | `cost` at the rating (`rated`); a purchase: `priced`. Not on adept powers |
| `avail`, `legality` | `avail` at the rating, and its letter `L`, `I` or `F` |
| `essence`, `capacity`, `defense`, `threshold`, `karma`, `fade` | the attribute of that name at the rating (`capacity` `"[1]"` reads as 1) |
| `social` | an armor's `social` (its printed Social modifier, `"+2"`, `"–4"`; an en dash is a minus): what it adds to the wearer's Social Rating (Charisma + the worn armor's) |
| `powerCost` | an adept power's `cost` (per level when it's leveled) |
| `drain` | a spell's `dv` |
| `dv`, `stun` | a weapon's `dv`: `"3P"` → 3, false; `"4S(e)"` → 4, true |
| `ar` | `ar` split in five bands, a dash `null`; absent when a band can't be read |
| `modes` | `modes` as `SS`, `SA`, `BF`, `FA` |
| `ammo` | the leading number of `ammo` (`"30(c)"` → 30) |
| `vehicle` | `{ handling, accel, interval, topSpeed, body, armor, pilot, sensor, seats }`; the first three as `[on, off]` (`"4/3"`, one number for both) |

## NPC block

`{ kind, rating?, group?, from?, stats, lines, pools, items }`. `kind` `grunt`, `critter`, `spirit` or `sprite` (a contact, one of
the book's sample contacts, goes out as `grunt` with `group` `Contact` and no rating); `rating` the Professional Rating,
Force or Level; `group` a grunt's; `from` `{ kind, id, name, source, page }`, the catalog entry it was
copied from. `stats` `[{ key, label, printed, value, ok }]` in stat-block order: the printed value and its value at the
rating (`"F+1"` at Force 4 → `"5"`); `ok` false when it can't be read (then `value` is the printed text). `lines`
`[{ part, text }]` (skills, powers, optional powers, weaknesses, attacks, augmentations, gear, weapons). `pools`
`[{ name, rating, attr?, pool?, printed }]`: the skills line resolved against the catalog's skills, pool = rating + the
attribute's value; a skill the catalog doesn't have keeps its printed text only. `items` (npc.ts `npcThings`): each
weapon, attack, piece of gear, augmentation and power the weapons, attacks, gear, augmentations and powers lines print, as
a purchase (`uid`, `qty` 1, `worn`, `bonuses` [], `accessories`) plus `line { part, printed, values, dv? }`, the thing as printed,
the numbers it prints and its DV as printed. An adept power has its `level`. It is its catalog entry where the catalog has one by name (the kinds its part names, the
NPC's own book first; a printed level picks that level's entry), with the printed DV, attack ratings, firing modes, ammo,
rating and Defense over the entry's `values`; else it is built from the line (no `id`): an attack printing a DV or attack
ratings as a weapon (`attrs` `category` and `dv` as printed; `skill` the printed one, else Close Combat with only a close
band, Exotic Weapons past it), gear printing a Defense as armor, other gear as gear, a power as a critter power. Formulas
of Force are worked out at the rating; a band at 0 or less is none. Armor is worn. A Cybercombat attack (a Matrix action)
and an attack printing nothing to roll stay in `lines` only. uids: `line:<part>:<printed>` (`power:<printed>` for a
power, `<host uid>:w/<printed>` for an accessory; a repeat gets `#2`…). The block is GM-only data.

## Book

`{ source, entries, npcs? }`.

| Field | Meaning |
|---|---|
| `source` | `{ id, name, publisher, canon, compendium? }`; `compendium: true` for a GM's compendium (`publisher` its owner's name) |
| `entries` | the book's entries of every kind, in `SR6_KINDS` order, then catalog order: items with `id`, `source` and `page` set, and, for `npcs`, `critters`, `spirits` and `sprites`, an `npc` block (a grunt at its Professional Rating, a sample contact as a grunt of group `Contact`, a spirit or sprite at rating 1) |
| `npcs` | a compendium's own NPCs, each as a runner with its `npc` block |

The file holds every kind; the importer decides what the system uses (priorities, metatypes or life modules make no
compendium there and it says so).

### Compendium

A GM's compendium exports from its page as a books file of one book: `source.compendium` is `true`, its entries carry their
own text always, its NPCs come in `npcs`, and the envelope says `descriptions: true`. The Game data panel lists books
only; compendiums export from their own page.

## Descriptions

With `descriptions: true` a book's entries carry their text (`description`); with `false` it is left out. A runners file
always carries the text of the runner's things (as Anarchy's: the dialog says so), and a compendium its own text. Share
a file with book descriptions only with people who own the books. Description and text fields are plain text, not HTML:
a program that shows them on a web page must escape them first.

## What the importer does with it

The module reads the file, refuses another format (Anarchy's export names the Anarchy module), version or a file with
nothing to import before anything changes, and writes raw inputs only: attribute bases, Edge, skill points, magic, money and
the things as items (an augmentation's bonuses as effects), letting `shadowrun6-eden` derive pools, monitors, initiative and
Essence. Runners become Player actors, NPCs NPC (grunts and contacts), Critter, Spirit or sprite actors with their block in the GM notes, and books
and compendiums world compendiums per book and topic. Re-importing replaces, adds a new version or skips, and keeps art the
user chose.

## What never goes in a file

Passwords, sessions, keys, owner usernames, other users' data beyond the runners exported, campaign membership, PDFs and the
server's paths. A runner's portrait and free text are the player's own and are included.

## Versioning

A breaking change is version 2. The module refuses a `version` it doesn't know. Additions within v1 are optional fields,
except that the runner, items, purchases and values are closed in the schema: a new key there needs the module's schema
updated with it.

## Example

The module's samples (`samples/test-*.json` in `chummer-sr6-foundry`) are written by Chummer's own tests from made-up data:
`WRITE_SR6_SAMPLES=<dir> npx vitest run tests/sr6/export.test.ts` (`tests/sr6/samples.ts`). A made-up purchase:

```json
{
  "uid": "c1", "id": "mus.reflex-booster", "kind": "augmentations", "name": "Made-up Reflex Booster", "source": "MUS", "page": 10,
  "canon": true, "attrs": { "type": "cyberware", "category": "Bodyware", "rating": "1-3", "essence": "Rating × 0.1", "avail": "4(I)", "cost": "Rating × 1000" },
  "parts": [], "values": { "rating": 1, "cost": 1200, "avail": 4, "legality": "I", "essence": 0.12 },
  "qty": 1, "grade": "used", "worn": false,
  "bonuses": [{ "target": "rea", "value": 1 }, { "target": "initDice", "value": 1 }],
  "accessories": [{ "uid": "c1a", "id": "mur.booster-port", "kind": "augmentations", "name": "Booster Port", "source": "MUR", "page": 10, "canon": true,
    "attrs": { "type": "cyberware", "category": "Bodyware", "capacity": "[1]", "cost": "100" }, "parts": [],
    "values": { "cost": 100, "capacity": 1 }, "qty": 1, "worn": false, "bonuses": [], "accessories": [] }]
}
```
