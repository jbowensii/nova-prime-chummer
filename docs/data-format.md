# Chummer Anarchy 2.0 data format

All game data is XML. The app ships only `public/data/sources.xml` (the books
a recipe supports) and the schemas. The **core files** (levels, metatypes,
attributes, skills, pricing, amp types and effects, packages, lifestyles, and
the generic weapons, armor and vehicles) come from the core rulebook: its
import writes them to `custom/imported/core/` (see "Core files" below), or the
admin uploads a data pack. Book content (amps, spells, complex forms, gear,
rules, sample runners, descriptions) comes from the PDFs the user uploads:
the importer writes it to `custom/imported/` (see "Imported books" below).
Any application can read or write these files. The schemas in
`public/data/schema/` are the contract, and `npm run validate:data` checks
the files against the schemas and checks that every cross-reference resolves
(`node tools/validate-data.mjs <custom dir>` checks a custom folder too).

## Common rules

Every file has the same root:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="skills" version="1">
  ...entries...
</ca2:data>
```

- `kind` names the catalog and picks the schema. `version` is the schema
  version, currently `1`. Child elements are unqualified, with no prefix.
- Every entry has:
  - `id`: lowercase kebab-case, pattern `[a-z0-9][a-z0-9.-]*`, unique within
    its kind. References always use ids, never names. Imported entries are
    scoped by their book: `crb.jazz`, `dhsa.jazz`.
  - `source`: a source id from `sources.xml` (below). `CRB` is the
    Anarchy 2.0 core rulebook v1.8 and `CG` the CGL Conversion Guide v1.1,
    both canon. `DHSA` (Daegann's Holostreets Shadow Amps Expanded List
    v3.4b), `PREGENS` (the SRA2 pregen booklet) and `QREF` (the quick
    reference sheets) are published but not canon. Your own content can use
    any other code; a source not listed in `sources.xml` counts as not
    canon.
  - `page`: the printed page number.
- **Derived numbers are never stored.** An amp lists its type and effects,
  and the engine computes its rating, cost and Essence. `printedRating` on
  amps exists only so the book's number can be audited against the computed
  one.
- Book-derived descriptions (amp narratives, spell, complex-form and gear
  text) are **not** in these files. They live in a private `texts` file
  (below), so the repository carries names and numbers only.

## Kinds

| kind | file | entry | schema |
|---|---|---|---|
| levels | levels.xml | `<level>` | levels.xsd |
| metatypes | metatypes.xml | `<metatype>` | metatypes.xsd |
| attributes | attributes.xml | `<attribute>` | attributes.xsd |
| skills | skills.xml | `<skill>` | skills.xsd |
| pricing | pricing.xml | `<pricing>` | pricing.xsd |
| amptypes | amptypes.xml | `<amptype>` | amptypes.xsd |
| ampeffects | ampeffects.xml | `<effect>` | ampeffects.xsd |
| packages | packages.xml | `<package>` | packages.xsd |
| vehicles | vehicles.xml | `<vehicle>` | vehicles.xsd |
| weapons / armor | weapons.xml, armor.xml | `<item>` | items.xsd |
| gear / spells / complexforms | imported only | `<item>` | items.xsd |
| amps | imported only | `<amp>` | amps.xsd |
| lifestyles | lifestyles.xml | `<lifestyle>` | lifestyles.xsd |
| sources | sources.xml | `<source>` | sources.xsd |
| rules | imported only | `<rule>` | rules.xsd |
| texts | `custom/texts/<source>.xml` | `<text>` | texts.xsd |
| samples | `custom/imported/samples.xml` | `<sample>` | samples.xsd |
| npcs | `custom/imported/npcs.xml` | `<npc>` | npcs.xsd |

The importer's own records (`library/<book>/import.xml`, `review.xml`,
`library/.config/ai-providers.xml`, `ai-keys.xml`) have schemas too:
`import.xsd`, `review.xsd`, `aiproviders.xsd`, `aikeys.xsd`.
The server's account files in `library/.config/` use `users.xsd` (`users.xml`, `sessions.xml`, `device-key.xml`,
`reset.xml`, `ask-counts.xml`: each account's answered Ask the rules questions today, UTC; a `<user>`'s optional
`dailyQuestions` is its limit) and `auth.xsd` (`auth.xml`: the Authelia issuer, client ID and on/off; `auth-secret.xml`: its client secret; `oidc-key.xml`: the
sign-in state cookie's key, never backed up). An Authelia account's `<user>` carries `oidcIss`/`oidcSub` once linked.

### levels

`<level id nuyen attrAtMax skillCap rrAttr rrSkill rrSpec source page><name/></level>`

- `nuyen` is the creation budget.
- `attrAtMax` is how many attributes may sit at their metatype max.
- `skillCap` is the highest skill rating allowed.
- `rr*` are the Risk Reduction caps per attribute, skill and specialization.

All caps apply during creation only.

### metatypes

`<metatype id edge><name/><racialQuality/><effect/>*<range attr min max/> ×5</metatype>`.
`attr` is one of `str agi wil log cha`. An `<effect>` says what the racial quality does (Low-light vision:
`no-disadvantage`), read by the importer; it is the runner's.

### attributes

`<attribute id abbr><name/></attribute>`. The ids are fixed: `str agi wil log cha`.

### skills

`<skill id attr alt? requires?><name/><spec id attr>Display name</spec>*</skill>`

- `attr` is the default linked attribute, and `alt` the other listed option.
- `requires` is `awakened`, `cyberdeck` or `emerged` (Tasking, which the Conversion Guide's import adds).
- Spec ids are `<skill>.<spec>`, for example `stealth.physical-sneaking`.
- A spec from another book than its skill carries its own `source` and
  `page`. An imported book adds specs with a `<skill>` of the base skill's
  id holding only its new specs (DHSA's `influence.seduction`): the loader
  appends them to that skill, once per spec id. A house-rule `<skill>`
  still replaces the whole skill. The core skills.xml has the core
  rulebook's specs only.
- An amp effect may name a custom spec, `param="custom:Defense against
  throwing weapons"`, for a condition that isn't a named specialization.

### pricing

One `<pricing>` element. All values are in nuyen.

| attribute | meaning |
|---|---|
| attrPoint / attrLastPoint | cost per attribute point; the point that reaches the metatype max costs `attrLastPoint` |
| skillLow / skillLowMax / skillHigh | skill points up to `skillLowMax` cost `skillLow`, higher points cost `skillHigh` |
| spec, knowledge | per specialization and per knowledge skill |
| ampPoint | cost per Shadow Amp rating point |
| equipment, weaponStandard, weaponSpecialist, armorPoint, spell, complexForm | item prices |
| refundEffectRemoval | only for ledgers from before 0.5.5 (`amp-modify` events): `true` refunded rating lost when an amp effect was removed. Since 0.5.5 removing an effect is priced as replacing it with nothing (CRB p.84: a replacement costs the difference): its cost comes back, at creation and after Finalize alike |

A book can carry a partial pricing overlay: `imported/<source>/pricing.xml` with one `<prices id source page …/>`
holding only the attributes it sets (the Conversion Guide's import writes `complexForm`, read from its page). The
loader writes those attributes over the pricing loaded so far, in load order: the core `<pricing>`, then each
imported book's `<prices>` in `imported/index.xml` order (the last loaded wins), then the house rules, where a full
`<pricing>` replaces every price and a `<prices>` sets only its own. A `<prices>` with no `<pricing>` before it is
reported and ignored; within a file the entries apply in order, and a `<prices>` attribute that isn't a price or a
number is ignored. A house rule that changes one price should use `<prices>`: a full `<pricing>` without `complexForm`
prices complex forms at its `spell` price, dropping the Conversion Guide's.

### amptypes

`<amptype id base baseAfterFirst? essence requires?><name/></amptype>`

- `base` is the starting rating. `baseAfterFirst` applies to the 2nd and
  later amps of the type (Qualities: 0 for the first, then 3).
- `essence` is the Essence lost per amp.
- `requires` is an ampeffect id the character must have (the adept type
  requires `awk-adept`).

### ampeffects

`<effect id category rating types max? requires? excludes? param? gmApproval? essence?><name/></effect>`

- `rating` is added to the amp's rating (it can be negative).
- `types` is a space-separated list of the amptype ids that may take the
  effect.
- `max` is how many times the effect may appear in one amp.
- `requires` / `excludes` name other effect ids in the same amp.
- `param` says what the character fills in: `skill`, `spec`, `attribute`,
  `realm`, `text`, or `value`. For the `negative` effect, `value` (1–5) is
  subtracted.
- `gmApproval="true"` means using the effect always needs a GM override.
- `essence` changes the amp's Essence cost (implant grades: delta −0.5,
  omega +0.5, cultivated bioware −0.25).

#### The narrative effect kinds

Every catalog also has the narrative effect kinds (CRB p.59, `src/engine/rule-effects.json`; the loader adds each one a
data file doesn't define itself): what a narrative effect does, machine-readable, at rating 0. The book prices narrative
effects with the amp's base rating and its "Additional narrative effect"s, which stay; a kind only says what one does.
`tools/validate-data.mjs` knows them too.

| id | param | what it does |
|---|---|---|
| `advantage` | Test | Advantage on that Test |
| `edge-advantage` | Test | Advantage on that Test for 1 Edge |
| `disadvantage` | Test | Disadvantage on that Test (a drawback) |
| `no-disadvantage` | text | negates a Disadvantage (a vision: "Low-light vision") |
| `inflict-disadvantage` | text | imposes a Disadvantage on someone else |
| `edge-effect` | text | an automatic effect for 1 Edge |
| `edge-gain` | text | gains 1 Edge (and when) |
| `allow-test` | text | allows a Test otherwise impossible |
| `ignore-wounds` | text | ignores wound modifiers (`light`, `serious`, or none: all) |
| `social-armor` | value | social armor: Willpower + it is the social damage threshold (CRB p.139) |
| `matrix-armor` | value | Matrix armor: added to the Matrix threshold |
| `min-risk-dice` | value | that many risk dice at least on attack Tests |
| `forced-risk` | | must take a High or Extreme Risk |
| `sustain-form` | | one more sustained complex form |
| `essence-implant` | | the last Essence point counts double (one more implant before death) |
| `essence-magic` | | magic ignores the first point of Essence lost |
| `self-wound` | text | causes the character a wound (`light`, `serious`) |
| `immunity` | text | immune to what it names |

A Test param is a skill, spec or attribute id, `custom:<words>`, or none (every Test). The Test kinds mark a dice pool,
never its dice (CRB p.63: no circumstance changes the pool).

#### How an effect is turned on

Every `<effect>` (amps, items, metatypes, a runner's amps and items) may say how it is turned on and whether it counts
(`src/engine/effects.ts`, shared with Shadowrun 6): `switch` (`wireless`, `activated`, `sustained`, `conditional`; absent:
always on), `when` (it holds only then: in darkness, while in the Matrix), `confidence="low"` (read from a sentence the
importer isn't sure of, a value that depends on hits: shown, not counted) and `from` (the catalog id of the entry it is
given by: "like an elf", "acts the same way as a mana bolt"). A switchable one (wireless, activated, sustained) and a
conditional one (`when`) count only in the bracketed total: a total is printed as the books print it, without them and in
brackets with them, `RR 1 (2)`, and each has a note naming its switch or condition on the hover card, in Review's "What
its effects do" and on the printed sheet (owner, 2026-10-10, both games). `affects` (`caster` or `target`) says whom a
spell's or complex form's effect is on, with the note `affects the caster` or `affects target(s)`: the caster counts its
own while sustained (in brackets), a target's stays on the spell. A sentence that names neither is about the caster; one
opening with a pronoun is about whom the one before was (owner, 2026-10-10). `unpriced="true"` marks an effect the book states but its
printed rating doesn't pay for: it applies, at rating 0 (the import report lists each, `kind="effect-unpriced"`).

A bonus limited to a specialization is added to that specialization's pool when the runner has it, else its Risk
Reduction counts in the skill's bracketed total, with a note naming the specialization (an Advantage or Disadvantage on
it is noted on the skill). A Test named by what it does ("Tests involving speed", "social Tests", "climb a metal structure") is every
skill it uses (`importer/recipes/dhsa.py` ACTIVITIES).

### packages

`<package id level archetype attrPoints attrAtMax skillPoints skillsAtSix ampPoints armor standardWeapons specialistWeapons equipment spells><name/></package>`

These are the book's guide allocations. Each one must total exactly its
level's `nuyen`.

### vehicles

`<vehicle id pilot body handling speed flyingSpeed? armor mount><name/></vehicle>`.
These are the base chassis for vehicle amps.

### items (gear, weapons, armor, spells, complex forms)

`<item id kind specialist? armor? dv? ranges? category?><name/><effect/>*<text/></item>`

- `kind` is `gear|weapon|armor|spell|complex-form`.
- `dv` may be Strength-based (`STR+2`); the app works out the number.
- `specialist="true"` marks sniper rifles, grenade launchers, machine guns
  and heavier weapons (priced at `weaponSpecialist`).
- `armor` is the armor rating (priced per point).
- Optional `<formula>` and `<issue>` children, before `<text>` (Formulas and issues, below).
- `<effect ref param? value? note? unpriced? switch? when? confidence? from? affects?/>`: what it does, read from its text
  by the importer (a drug's Disadvantage, a spell's Advantage, gear's vision). A runner's item may carry its own (they
  replace these). A spell's or complex form's say whom they affect (`affects`, read from the sentence: the caster, else
  its subject or targets).

### amps

`<amp id type printedRating? vehicle? mod? family? level?><name/><item kind specialist? armor? dv? ranges?/>?<effect ref param? value? note? unpriced? switch? when? confidence? from? affects?/>*<formula/>*<issue/>*<narrative/></amp>`

- `<item>` (equipment amps only) is the base item bought with the amp, priced
  from `pricing.xml`. Book price = item price + rating × `ampPoint`.
- An effect without `param` is an open pick: the player chooses it in the Amp
  Builder (mentor spirits' "choose two RR").
- `note="balances printed rating"` / `note="book drawback"` mark effects added to a catalog amp to reconcile with
  the book's printed rating (see `docs/book-discrepancies.md`). Never on a sample runner's amp (0.5.6).

- `type` is an amptype id.
- Each `effect ref` is an ampeffect id (or a narrative effect kind), and `param` fills its parameter (a
  skill id, spec id, attribute id, realm, Test, or free text).
- The importer reads an amp's clauses as general rules (`importer/recipes/dhsa.py` Mapper, `importer/effects.py`): a
  clause a rated effect reads becomes that effect, with its `switch` (a dose's `Duration:` makes it `activated`) and, for
  a bonus without a param of its own, its `when`; a rated reading that would push the amp past its printed rating (or
  take a drawback the plain reading doesn't) is added `unpriced` and the amp priced as read without it (the printed
  rating is canon); every other clause stays narrative and adds the narrative effect kinds it states. A misprinted
  doubled parenthesis is read as one, and a parenthesis that names a skill (`RR 1 Resonance (tasking)`) as that skill;
  misprints with no clean reading are suggested for the edits layer instead.
- `vehicle` names the chassis for vehicle amps.
- `mod="true"` marks an add-on (ammo, accessory, vehicle or deck mod,
  implant grade). It has no base rating: the Amp Builder appends its
  effects to an existing amp of the same `type`.
- `family` and `level` (both or neither) mark one level of an entry the book prints with several (Levels, below).

#### Levels

Owner's rule (2026-10-11): an entry the book prints with several levels is one entry per level, otherwise duplicates of
one another, each with its own rating and effects (positive or negative levels alike). The importer writes them
(`importer/recipes/dhsa.py` `level_range`), reading the three ways Daegann's list prints a range:

| the book prints | levels | each level |
|---|---|---|
| an add-on "Amp +1 … max +N" ("Max improvement +6"; "Max 3 identical drones": the core table's max for its one effect) | +1 … +N | the add-on taken that many times: its effects ×N, rating ×N; named "Attack +3" |
| "can be taken up to level N" (Freefall) | printed rating … N | that rating; what it adds over the printed one is "Additional narrative effect"s; named "Freefall 2" |
| a rating that "can be increased by 1 (max +N) for an additional Amp point" (Secret Room's threshold and maglock: they add up) | printed … printed + ΣN | as above; gear printed so (Secure safe) keeps its item and gets Equipment amps for levels 1 … ΣN |

- `id` is `<family>-level-<n>` (`-level-minus-<n>` below 0); `family` is the id the entry had before it was split
  (scoped like one, `dhsa.freefall`); no entry has it any more. `level` is the level (an add-on's: how many times it is
  taken, negative for a drawback add-on). The levels follow each other in the file, lowest first, each with the
  description.
- A range with no top level stays one entry, as printed, and the import report lists it (`kind="levels-open"`): a rating
  "3+" with "each additional rating" (Enhanced Perception), an add-on's "max +Body" (Additional plates).
- The app: pickers list a family's levels together, each with "Level 2 (1–3)"; the Amp Builder has a Level select for a
  book amp printed with levels (after Finalize the change is priced and logged as any edit); a runner whose `catalogId`
  is a family gets the level its effects rate as, else the lowest (`src/engine/levels.ts`, `rescope.ts`); the Foundry
  export carries `family`, `level` and, on the lowest level, the family id as an alias.
- `npm run validate:data` checks that `family` and `level` come together, that no two entries are the same level of a
  family, and that no amp has a family's id.
- The Amp Builder's own effect table is not split: its "levels" (Firewall +1 up to 5, the Negative effect −1 to −5, an
  RCC's drones) are how a player builds their own amp, one amp with its rating computed, not book entries to pick.

### lifestyles

`<lifestyle id perRun><name/><text/></lifestyle>`. Lifestyle is a Keyword,
not a purchase (CRB p.166). `perRun` is added to each run's earnings.

### sources

`<source id publisher canon texts? file? sha256? imported?><name/></source>`.
Every `source="…"` in the data names one of these (`npm run validate:data`
checks it). `canon` is true only for the game's official rules; everything
else gets a **Non-canon** badge in the app, and a runner set to canon only
(Concept tab) gets a Review warning for each non-canon amp, item or spec.
`texts` names that source's private description file in `custom/`.

Sources merge by id across three files, in this order: the shipped
`public/data/sources.xml` (every book a recipe supports, so the Books page
can list them before anything is uploaded), the generated
`custom/imported/sources.xml` (one per imported book, adding `file` = the
uploaded file name, `sha256` and `imported` = the date; several uploads of
one source, like the four quick-reference sheets, are `; `- and
space-separated), and the user's own `custom/sources.xml` for house rules,
which wins for every attribute it sets. The app shows the source's title
wherever it shows an entry; hovering shows the publisher and file name.

### rules

`<rule id sheet section effects? source page><title/><text/></rule>`: the
Rules page. `sheet` is `base`, `magic`, `matrix` or `vehicles` for the
quick-reference sheets; other sheets (the Conversion Guide's
`technomancers`) are listed after them. `effects`
lists amp effect ids the rule explains (hover help in the Amp Builder and
on the sheet). Written by the importer's `qref` recipe (one
`custom/imported/qref/rules-<sheet>.xml` per uploaded sheet, ids scoped
`qref.<sheet>-<title>`); `<text>` stays empty, the text is private.
Sheet `optional` holds a book's optional rules, the seeds of the table rules below: the core rulebook's import writes
`custom/imported/crb/rules-optional.xml` (extended social tests p.139, vehicle and drone damage for characters,
critters and devices p.68, planning pool or personal Edge p.80: names and pages only; the descriptions go to
`texts/crb.xml` as `of="rules"`).

## Table rules (`custom/table-rules.xml`)

The optional rules a GM (admin or editor) plays with, switched on and off on the Table setup page (`#/table`), plus house rules the GM
writes. Written by the server (`PUT /api/table-rules`, admin and editors; atomic), schema `tablerules.xsd`, namespace
`urn:chummer-anarchy2:config:1`; every signed-in user reads it at `/custom/table-rules.xml`, and players see the rules
switched on there, read only. It lives in `custom/`, so backups carry it. A book's rule may carry `locked="true"`: the
GM's switch then binds every runner (the Review tab's own switch for it is disabled); otherwise a runner may set its own
(`<optionalRule>` in the character file).

```xml
<ca2:tablerules xmlns:ca2="urn:chummer-anarchy2:config:1" version="1">
  <rule id="crb.optional-extended-social-tests" on="true" locked="true"/>   <!-- a book's optional rule, by its id; locked: the GM's choice binds every runner -->
  <rule id="house-3f2a9c01b2d4" on="true"><name>…</name><text>…</text></rule>   <!-- a house rule -->
</ca2:tablerules>
```

A book's rule not listed is off. A listed book rule whose book is gone keeps its switch for when the book comes back.
At most 200 rules; a house rule's name is 120 characters at most, its description 4,000.


## Campaigns (`custom/campaigns.xml`)

A GM's table: its GMs (the admin or editors; the one who made it, plus co-GMs the admin adds), its players, and a note.
Written by the server (`server/campaigns.mjs`, `/api/campaigns`; atomic, under the runners' write lock), schema
`campaigns.xsd`, namespace `urn:chummer-anarchy2:config:1`. It is never served as a file (who plays where is for the
campaign's own people); it lives in `custom/`, so backups carry it. A runner joins with `campaign="<id>"` on its own file
(character-format.md), one campaign at a time. A username change renames it here; a deleted account leaves every
campaign, and one left without a GM gets an admin.

```xml
<ca2:campaigns xmlns:ca2="urn:chummer-anarchy2:config:1" version="1">
  <campaign id="3f2a9c01b2d4" name="…" created="2026-09-29T12:00:00Z" archived="true">   <!-- archived: optional -->
    <note>…</note>
    <gm user="eve"/>          <!-- one or more -->
    <member user="pat"/>      <!-- any number -->
  </campaign>
</ca2:campaigns>
```

## Background art (`library/backgrounds/`)

The admin's uploaded images (Settings → Background art): `library/backgrounds/<id>.<png|jpg|webp>` and
`library/backgrounds/backgrounds.xml`, written by the server (`server/backgrounds.mjs`, `/api/backgrounds`; atomic),
schema `backgrounds.xsd`, namespace `urn:chummer-anarchy2:config:1`. An image's type comes from its first bytes (PNG, JPEG
or WebP; anything else, SVG included, is refused), 10 MB at most, 50 images at most. The Library is never served as files:
signed-in browsers get the enabled images through `GET /api/backgrounds/<id>`. Backups carry the folder with the rest of
`library/`; data packs don't.

Shadowrun 6 has its own set, the same files and rules in `library/sr6/backgrounds/` at `/api/sr6/backgrounds` (Settings →
Background art (Shadowrun 6), opened from an SR6 page). SR6 pages and the SR6 print sheet show only that set; Anarchy's
pages and sheets only Anarchy's. SR6's set starts with one image of ours, "Circuit board (default)"
(`server/defaults/sr6-circuit.webp`), added once, enabled, after any images already there; the root's `seeded="true"`
records that, so once the admin hides or deletes it, it stays that way. Anarchy's has no default.

```xml
<ca2:backgrounds xmlns:ca2="urn:chummer-anarchy2:config:1" version="1">
  <background id="0a1b2c3d4e5f" type="png" name="alley.png" enabled="true" uploaded="2026-09-29T12:00:00Z" size="482133"/>
</ca2:backgrounds>
```

## Imported sample runners

A recipe that reads stat blocks (`pregens`; `crb` for the rulebook's 12 pregens
and its character creation example) writes each runner as a character
file (`character.xsd`, `origin` = the source) to
`custom/imported/<source>/samples/<source>.<name>.xml`, and lists it in the
generated `custom/imported/samples.xml` (`<sample source href name role page/>`,
`href` relative to `custom/imported/`; schema `samples.xsd`). "Load example
characters" reads that list and the example sets below; before any import the books bring none.
The `crb` recipe also reads the rulebook's NPC chapter (pp.244-265, from the PDF's layout) into
`custom/imported/crb/npcs/crb.npc-<name>.xml` (a spirit once per Force: `… (Minor)`, `(Regular)`, `(Major)`), listed in
`custom/imported/npcs.xml` (`<npc source href name kind tier page/>`, schema `npcs.xsd`); "Load book NPCs" on the NPCs page
copies them, and the book data export carries them as the book's `npcs`.
The numbers the book prints for each runner are report rows in
`library/<book>/import.xml` (`kind` pool, threshold, essence or amp, with a
`status`).

How a stat page becomes a runner (0.5.6): as printed (the owner's rule). Each amp keeps its printed type, the effects
its lines read (an effect its type can't take too: Review flags it, unless the books' catalog amp of that name and type
prints it, like a sample's Jazz; a line no effect reads stays the amp's text) and its printed rating on its snapshot;
nothing is added, dropped or retyped to meet that rating. Two printed types are read by the book's rules instead: a
"(Quality)" with a deck's Firewall – Attack is a Cyberdeck (CRB p.62), and a "(Quality)" the equipment list also prints
is an Equipment amp on that item (CRB p.60). What the page prints is read by the book's rules too: a printed
limitation ("only", "first interaction", a drug's comedown) where the rules price the amp 1 to 5 above its printed
rating is that Negative effect (CRB p.61), noted with the printed line. Review accepts it with no GM approval while the
amp rates as its book prints it (owner, 2026-10-11), or when the books' catalog amp of that name prints the same
drawback; a player's own negative effect, or one on a sample amp changed since, still needs the GM (p.61); a vehicle's or drone's own
front-facing mount takes its first weapon (CRB p.60, p.241; a storage rail is an Enhanced weapon mount); a shamanic
mask is the Awakened amp's -1 (CRB p.169, the core's `awk-shamanic-mask`). Every printed item is bought as printed
(the app makes a plain "Commlink" and "Fake SIN" its free starting gear when it loads the runner), except: a branded
commlink where the list prints no plain one is the runner's free commlink (`starting="commlink"`, CRB p.85), gear an
implant prints as "Integrated …" is part of that implant, and an armor row "(+1)" or "(2+1)" after the armor of 2 is
an add-on worn over it, bought for its own points (`over`; DHSA p.14 prices a ballistic mask +1). An Equipment amp is linked to the
printed item of its name (or the one with most words in common); with none printed, the amp brings its own, a gear
item of its name, as the book's Equipment Amps cost the item and the upgrades (CRB p.144) and a catalog amp brings its
item in the app. A book that adds a skill, an amp type or effect (or the core) has the other books' runners read again,
so they don't depend on the import order. A spec rolled
with two attributes is bought once; a weapon's astral row isn't a second weapon. With the book's PDF, the core
rulebook's dispositions and cues are read from the page layout (an item that wraps stays one). The file holds no
override and nothing that approves: what the book prints against the rules shows on Review.

## Example sets (`custom/samples/<set>/`)

Example characters that don't come from an import: one folder per set, each holding character files (`character.xsd`).
The admin manages the folder on disk; the app only reads it (`GET /api/samples`, any signed-in account; no route
writes it), and backups carry it with the rest of `custom/`. An optional `set.xml` names the set and says whether its
runners are canon (schema `sampleset.xsd`):

```xml
<ca2:sampleset xmlns:ca2="urn:chummer-anarchy2:config:1" version="1" name="Built-in samples (first release)" canon="true"/>
```

Without `set.xml` a set is named after its folder and isn't canon, except `builtin` (the first release's runners,
built from the core rulebook only): "Built-in samples (first release)", canon. `npm run validate:data` checks both
kinds of file.

**One copy per character.** A character is its name (street name, else name). "Load example characters" picks at most
one canon version of each (a canon book's over a set's; of several canon books, the newest import) and one non-canon
version (a book's over a set's), and adds to the signed-in account's library each one whose key
(`<name slug>|canon` or `<name slug>|noncanon`, saved as the copy's `sampleKey`, docs/character-format.md) it doesn't
hold yet. A book sample's canon-ness is its source's `canon`; a set's runner's is the set's.

## Private descriptions (`custom/texts/`)

`<text of="amps|items|rules|lifestyles" id="…">description</text>` entries, kind
`texts` (schema `texts.xsd`), one file per source: the file each source's
`texts` attribute names (`texts/crb.xml`, `texts/dhsa.xml`, `texts/qref.xml`), plus the older
single `custom/texts.xml`. Each is loaded when present and merged into the
amp's narrative, item's, rule's or lifestyle's text with the same id. They're
never committed:

| file | written by |
|---|---|
| `texts/crb.xml` | `python -m importer run <library/book-id> --custom <custom dir>` (recipe `crb`) |
| `texts/dhsa.xml` | `python -m importer run <library/book-id> --custom <custom dir>` (recipe `dhsa`) |
| `texts/qref.xml` | `python -m importer run <library/book-id> --custom <custom dir>` (one run per sheet; entries merged by id) |

On tower04 they live in `/mnt/user/appdata/chummer-anarchy2/custom/texts/`.
For local development without the server, copy them to `public/custom/texts/`
(gitignored).

## Core files (`custom/imported/core/`)

The twelve core files above (`ampeffects`, `amptypes`, `armor`, `attributes`,
`levels`, `lifestyles`, `metatypes`, `packages`, `pricing`, `skills`,
`vehicles`, `weapons`), written by the core rulebook's import (recipe `crb`,
`importer/recipes/crb_core.py`) with the same schemas as before, ids **not**
scoped, every entry `source="CRB"` and its page. Their descriptions (weapon
examples, armor, lifestyle rules) go to `texts/crb.xml`. Values the book
doesn't print are app defaults kept in the recipe (`DEFAULTS`,
`EFFECTS`). A table the recipe can't read is left out and the import report
says so (`kind="core-unread"`, with the book.md pages it should be on).

Any of the twelve can then be read by AI (Books → **Read the tables with AI**,
`python -m importer propose <library/book-id> --library <dir> --core`): only
the chunks holding those pages are sent, and the model fills one JSON list per
table in the shape of its schema (`importer/ai/schema.py` `CORE`; weapons and
armor as `items`). Each proposed row is checked against its table's schema, its
own id where the engine names it (attributes, amp effects), and the ids it names
that no schema checks (a skill's or metatype range's attribute, a package's
level, an effect's amp types and required or excluded effects, an amp type's
required effect: against the tables in place and this review's rows), plus
what nested rows can get wrong (a range's minimum above its maximum, a
specialization id used twice in a skill), and waits in `review.xml`
(`core="true"`, proposal kinds `level`, `metatype`, `attribute`, `skill`,
`pricing`, `amptype`, `effect`, `package`, `vehicle`, `lifestyle`, `weapon`,
`armor`). Accepting (`apply-review --core`) writes the accepted rows as the
core files, rechecked the same way (a table being replaced counts only its
accepted rows); a row that fails is left out and reported. The import
report then lists each such table as `kind="core-ai"` (read by AI, with its
row count: check it against the book) instead of `core-unread`, and the Books
page says which tables came from AI. The review screen edits a core row's own
attributes, a metatype's range per attribute and a skill's specializations
(add, rename, remove; a new one's id is `<skill id>.<name in kebab-case>`).
A data pack that later replaces such a table drops its `core-ai` rows from
every book's report, and a re-import writes the report afresh, so the note
goes once the table no longer comes from AI.

Load order: `public/data/` (in development also the owner's local copies of
the core files, gitignored), then `imported/core/`, then the imported books,
the edits layer and the house rules. With a core file in neither place the
app opens on a setup screen. A book adds to the core data like any overlay:
the Conversion Guide's import adds the Tasking skill and the Emerged amp type,
DHSA's its implant grades (`imported/cg/skills.xml`, `amptypes.xml`,
`imported/dhsa/ampeffects.xml`; skill, amp type and effect ids stay unscoped). A book can
add amp types and effects but never replace a core one (the importer drops it, report `kind="core-override"`).
Prices are the exception: a book's `<prices>` (the Conversion Guide's complex-form price, `imported/cg/pricing.xml`)
sets the prices it prints over the core's (see pricing above).
Without attributes, metatypes, levels, packages, pricing or skills the app opens on its setup screen; another
missing table shows a banner.
A server started without `imported/core/` whose Library holds the core
rulebook re-imports it (then the Conversion Guide and DHSA).
It tries once per CRB file and app version (`library/<id>/core-rebuild.xml`). The
markers are keyed on the file's sha256, not its folder: the same PDF uploaded
again to a new folder is the same CRB file, and every folder's marker for it counts.
After a [data pack](#data-pack) is loaded, the marker records `pack=` and the
pack's files (`files=`); while all of those files are there, that CRB file isn't
re-imported at start-up, whatever the version: the core came from the pack. Once
one of them is gone the mark no longer counts and the usual rule applies; a
**Re-import** of that CRB, or uploading the same PDF again, drops it (in every
folder). A
different CRB file (a new upload) is re-imported regardless, and any
import of the core rulebook (upload, **Re-import**) writes the core files over
the pack's as usual.

## Imported books (`custom/imported/`)

Everything here is generated by the importer (the Books page, or
`python -m importer run <library/book-id> --custom <custom dir>`); don't edit
it by hand, re-import instead.

| file | what |
|---|---|
| `imported/index.xml` | the overlay files below, in load order (same `<overlays><file href/>` format as `custom/index.xml`) |
| `imported/sources.xml` | one `<source>` per imported book (see sources above) |
| `imported/<source>/*.xml` | the book's data: `amps.xml`, `spells.xml`, `gear.xml`, `complexforms.xml`, `skills.xml` (spec additions), `rules-<sheet>.xml`, `pricing.xml` (a partial `<prices>`) |
| `imported/<source>/samples/` | its sample runners, listed in `imported/samples.xml` |
| `imported/<source>/npcs/` | its NPCs, critters and spirits (character files with an `<npc>` block), listed in `imported/npcs.xml` |
| `texts/<source>.xml` | its private descriptions |

Load order: `public/data/`, `imported/core/`, then `imported/index.xml`, then the
edits layer (`custom/edits/`, below), then the house rules in
`custom/index.xml`, so house rules still win.

**Scoped ids.** The importer writes every entry's id as `<source>.<id>` in
lower case (`crb.jazz`, `dhsa.jazz`), and every reference inside the book to
match; the loader never rewrites ids. So two books can both define Jazz.
Runners saved before the importer carry unscoped ids (`jazz`): on load each
is mapped to the scoped entry whose source matches the runner's stored
snapshot, and the snapshot keeps the runner working either way.

**Duplicates are kept.** Two entries are duplicates when they have the same
type (amp type, item kind, or rule) and the same name once case, punctuation
and a "(Type)" suffix are ignored. Both stay and pickers list them together:
when one is canon and one isn't, the **Non-canon** badge tells them apart;
when both have the same status, each gets a label with its source id (full
title on hover). A book's report on the Books page lists the groups it is in,
with each book's rating.

**AI imports** go through `library/<book>/review.xml` first; accepting
writes the same files a recipe would, under the source id, title and canon
status chosen on the review screen. A source id that a recipe, the shipped
data or the user's `custom/sources.xml` owns can't be taken.

## Formulas and issues

As in Shadowrun 6 (`docs/sr6-data-format.md`, Formulas and issues; the parser is shared), an amp or item may carry
`<formula field round? unit? qty?>EXPR</formula>` and `<issue field code page?>note</issue>` children, in any order,
just before its description (`<text>`, an amp's `<narrative>`):

```xml
<item id="test.flash-pack" kind="gear" source="TEST" page="11"><name>Flash Pack</name><formula field="cost">B * 3</formula><text></text></item>
<item id="test.odd-blade" kind="weapon" source="TEST" page="12"><name>Odd Blade</name><issue field="dv" code="missing" page="12">no damage printed</issue><text></text></item>
```

- An item's `cost` formula prices it in the builder, the ledger and the exports; `B` is the standard price for its
  kind from `pricing.xml` (a GM's price still wins). Anarchy items have no rating: a formula using `R` counts it as 1,
  and Review notes it. A formula that can't be worked out leaves the standard price, and Review says why.
- Other fields (an amp's `rating`) show in Game data with their formula.
- An issue (`code`: `missing`, `unreadable`, `ambiguous`) shows as a warning badge in Game data and the pickers, Game
  data's Needs attention filter lists those entries, and a runner that has one gets a cited Review note. An edit that
  sets the field clears it; the edit dialog still lists what the book has. The importer doesn't write Anarchy issues
  yet; the app reads them now.
- The edits layer stores neither: an edit keeps the book's formulas and issues (less the fields it sets).

**Override files.** Game data's Export my edits… and Import edits… (editors and the admin) save the edits layer, all
of it or one book's, as an edits file (`edits.xsd`, each edit's description in its `<text>` or `<narrative>`), and load
one back with a preview (new entries, changes to a book's entry, conflicts with your edits: keep mine or take theirs).
Each chosen entry is saved as an edit made in the app (`PUT /api/edits/<kind>/<id>`), so the same checks apply; a new
entry needs its house-rule source here first.

## Edits layer (`custom/edits/`)

Written by `python -m importer edit set|remove|add-source` (the app's Edit
and Add entry buttons), never by hand:

| file | what |
|---|---|
| `edits/edits.xml` | edited or added entries, full entries in the data format (`<amp>`, `<item>`, `<rule>`), each with `by="<username>"` (who saved it last) |
| `edits/texts.xml` | edited descriptions, same shape as `custom/texts/` |
| `edits/sources.xml` | house-rule sources the user created (`canon="false"`) |

An edited entry keeps its scoped id (`crb.jazz`); the edits file's entry
replaces the imported one with that id at load time. A new entry gets an id
`<houserule source lower>.<slug>` and needs a house-rule source (from
`edits/sources.xml`) that exists.

Load order: `public/data/` → `imported/core/` → `imported/index.xml` → **`custom/edits/`**
→ `custom/index.xml` house rules, so house rules still win over edits, and
edits win over the book. The loader marks an edits-layer entry `edited: true`
and keeps the entry it replaced (`original`) so the app can show "Edited"
and offer "Restore book version".

## Compendiums (`characters/.compendiums/<owner>/`)

A GM's own collection of entries, one file per compendium, kept by the
server (behind `/api/compendiums`, never under the public `/custom/` path):

```xml
<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="compendium" version="1"
  id="0123456789ab" name="Street Gear" source="STREET" sharing="campaign" campaign="abcdef012345"
  rev="3" updatedAt="2026-10-02T00:00:00.000Z">
  <amp id="street.zap-glove" type="cyberware" source="STREET" page="1"><name>Zap Glove</name><effect ref="init-1"/><narrative>The GM's own words.</narrative></amp>
  <item id="street.pipe" kind="weapon" dv="STR+1" ranges="OK/-/-/-" source="STREET" page="1"><name>Lead Pipe</name><text>…</text></item>
  <vehicle id="street.scooter" pilot="1" body="4" handling="3" speed="2" armor="0" mount="none" source="STREET" page="1"><name>Scooter</name></vehicle>
  <ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="…" …><npc kind="critter" tier="regular"/>…</ca2:character>
</ca2:data>
```

- The root names the compendium: `id` (12 hex), `name`, its own `source`
  id (`[A-Z][A-Z0-9-]{0,19}`, chosen when it's made, fixed afterwards, and
  unique among every compendium and every sources file), `sharing`
  (`private`, `campaign`: the GMs of `campaign`, or `table`), and the
  server's `rev` and `updatedAt`. The owner is the folder, never the file.
- Children, in any order: `<amp>`, `<item>` (any item kind) and `<vehicle>`
  entries in the data format, every one citing the compendium's `source`,
  with the GM's own text in `<narrative>`/`<text>` (never a book's); and
  NPCs as `<ca2:character>` elements exactly as a character file's root
  (`docs/character-format.md`), each with its `<npc>` block.
- Players read the `table` ones and those shared with a campaign they play
  in (while the owner GMs it) through `GET /api/compendiums/shared`, never
  private ones and never the NPCs (the server takes them out); a runner sees
  the table's and its own campaign's. A runner keeps a copy of each
  compendium entry it uses (`docs/character-format.md`).
- In the app the compendiums a GM can read load as overlays after the edits
  layer and before the `custom/index.xml` house rules. Their entries join
  the catalog under the compendium's source, `canon="false"`, origin user
  ("House"), published by the owner; its NPCs are not catalog entries. A
  file that cites another source, or holds an NPC without `<npc>`, is
  skipped and reported.

## Overlays (`custom/`)

House rules and extra content go in `custom/` (served at `/custom/`; in
Docker, that's the mounted appdata folder). List the overlay files in
`custom/index.xml`:

```xml
<overlays>
  <file href="house-levels.xml"/>
  <file href="my-gear.xml"/>
</overlays>
```

Each overlay file uses the same root and schema as the kind it changes.
House-rule overlays load after the base files and the imported books, in
the order listed. Unlike imports they keep "same id replaces" (that is their
purpose), and their ids aren't scoped:

- An entry whose `id` matches an existing entry **replaces** it completely
  (use the scoped id, `crb.jazz`, to replace an imported one).
- `<remove id="…"/>` **deletes** the entry with that id.
- Every entry must cite a source listed in one of the sources files; one
  that isn't is reported on the Game data page and treated as not canon.
- An entry with a new `id` is **added**.

A file that fails to parse or fails its schema is skipped and reported on the
app's Data screen. The app keeps running on the base data.

### Example: a higher-powered campaign

```xml
<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="levels" version="1">
  <level id="runner" nuyen="400000" attrAtMax="2" skillCap="6" rrAttr="2" rrSkill="2" rrSpec="3" source="CUSTOM" page="1"><name>Runner (house)</name></level>
  <remove id="ganger"/>
  <level id="legend" nuyen="600000" attrAtMax="3" skillCap="7" rrAttr="2" rrSkill="2" rrSpec="3" source="CUSTOM" page="1"><name>Street Legend</name></level>
</ca2:data>
```

## Data pack

`python -m importer datapack export --custom <dir> --out <zip>` (Books →
**Core data** → "Download data pack") writes the core files of
`custom/imported/core/` as one zip:

```
datapack.xml
core/<name>.xml   (each of the twelve core files present)
```

- `datapack.xml`, schema `datapack.xsd`: the app version, the date, and one
  `<file name bytes sha256>` per core file in the zip.
- Only the core files: never descriptions (`texts/`), PDFs or keys.

"Upload data pack" (50 MB at most) is two steps, like a restore: the server runs
`datapack check <zip>` and shows what the pack holds (its date, app version,
tables, and which of them replace the server’s), then **Load data pack** runs
`datapack import <zip> --custom <dir>`, which checks it all again (`datapack check`): nothing but `datapack.xml` and
`core/<core file>.xml`, no link, device, encrypted or oversized entry, a
manifest that lists exactly the zip's files with matching sizes and hashes
(these catch damage, not tampering: anyone can recompute them), and every file
UTF-8 with no DOCTYPE, valid against its schema (`items.xsd` for weapons and
armor), with the kind its name says. Then the pack's files replace those in
`custom/imported/core/` in one swap (all or none); core files the pack
doesn't hold are kept. The files it replaces wait in `core/.restore-old-*`
until the new ones are in; if the import is killed meanwhile, the next import,
export or server start (`datapack recover`) puts them back.

## Trash (`characters/<username>/.trash/`)

Deleting a runner moves its file to its owner's `.trash/` as
`<file name>-<milliseconds since 1970>.xml`, unchanged otherwise; that
suffix is when it was deleted (files without one use their modified time).
The Trash page (server only; a browser's own storage deletes for good) lists
them and restores one to `characters/<username>/` under its old file name
(or the next free one; `runner.xml` when the name was only the time). When a runner with the same `id` is already in any
account's library, the restore is a copy: a new `id`, `rev="1"` and
"(restored copy)" after its street name. Delete forever and Empty trash
remove the files for good. Only regular `*.xml` files there count (not links or folders); the server refuses
any other name, and anything with a separator or a leading dot.

## Backup zip

`python -m importer backup` (Settings → **Backup** → "Download backup")
writes a zip of the three volumes plus a manifest, root entries:

```
backup.xml
characters/…
custom/…
library/…
```

- `characters/`, `custom/` and `library/` are copies of the folders those
  names mount to in Docker (each account's trash, `characters/<username>/.trash/`,
  comes along); `library/.backups/` (the safety backups below)
  is skipped so a backup never nests old backups.
- `library/.config/ai-keys.xml` is included only when the download was made
  with "Include my API keys" ticked (`?keys=1`); otherwise it's left out and
  a restore keeps the target server's own keys, except that a provider whose
  base URL the restored `ai-providers.xml` changes loses its key (a key only
  goes to the address it was entered for, as when settings are saved).
- `library/.config/users.xml` and `auth.xml` (the accounts and sign-in settings)
  are always included; `auth-secret.xml` (the Authelia client secret) only with
  keys. Without it a restore keeps the server's own secret when the restored
  `auth.xml` names the issuer the secret was given for, and drops it otherwise.
  `sessions.xml`, `reset.xml`, `device-key.xml` and `oidc-key.xml` are never
  included; a restore ends every session and keeps the server's own cookie keys.
  After a restore the server clears Authelia links to any issuer other than the
  restored `auth.xml`'s. No `users.xml` (a backup from before accounts): setup
  mode, and the first admin gets the top-level runners.
- `backup.xml`, schema `backup.xsd`: the app version (baked into the image
  as `/app/VERSION` at build time, from `package.json`), the date it was
  made, a file count and byte count per folder, and whether keys are
  included, the number of accounts (`users`) and whether the Authelia secret is
  inside (`authSecret`; `restore --check` sets both from the zip itself). `restore --check` reads this to show the preview in the UI
  before anyone confirms.

`restore --apply` refuses a zip whose entries fall outside
`characters/`, `custom/` or `library/`, or that carries an absolute path,
`..`, a symlink or a device entry, or whose total uncompressed size is over
20 GB. Before replacing anything it writes the server's current state as an
automatic safety backup to `library/.backups/<timestamp>.zip`, keeping only
the newest 3, then swaps each folder's contents in from the restored zip.
