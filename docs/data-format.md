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

The importer's own records (`library/<book>/import.xml`, `review.xml`,
`library/.config/ai-providers.xml`, `ai-keys.xml`) have schemas too:
`import.xsd`, `review.xsd`, `aiproviders.xsd`, `aikeys.xsd`.
The server's account files in `library/.config/` use `users.xsd` (`users.xml`, `sessions.xml`, `device-key.xml`,
`reset.xml`) and `auth.xsd` (`auth.xml`: the Authelia issuer, client ID and on/off; `auth-secret.xml`: its client secret; `oidc-key.xml`: the
sign-in state cookie's key, never backed up). An Authelia account's `<user>` carries `oidcIss`/`oidcSub` once linked.

### levels

`<level id nuyen attrAtMax skillCap rrAttr rrSkill rrSpec source page><name/></level>`

- `nuyen` is the creation budget.
- `attrAtMax` is how many attributes may sit at their metatype max.
- `skillCap` is the highest skill rating allowed.
- `rr*` are the Risk Reduction caps per attribute, skill and specialization.

All caps apply during creation only.

### metatypes

`<metatype id edge><name/><racialQuality/><range attr min max/> ×5</metatype>`.
`attr` is one of `str agi wil log cha`.

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
| refundEffectRemoval | `true` refunds rating lost when an amp effect is removed |

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

### packages

`<package id level archetype attrPoints attrAtMax skillPoints skillsAtSix ampPoints armor standardWeapons specialistWeapons equipment spells><name/></package>`

These are the book's guide allocations. Each one must total exactly its
level's `nuyen`.

### vehicles

`<vehicle id pilot body handling speed flyingSpeed? armor mount><name/></vehicle>`.
These are the base chassis for vehicle amps.

### items (gear, weapons, armor, spells, complex forms)

`<item id kind specialist? armor? dv? ranges? category?><name/><text/></item>`

- `kind` is `gear|weapon|armor|spell|complex-form`.
- `dv` may be Strength-based (`STR+2`); the app works out the number.
- `specialist="true"` marks sniper rifles, grenade launchers, machine guns
  and heavier weapons (priced at `weaponSpecialist`).
- `armor` is the armor rating (priced per point).

### amps

`<amp id type printedRating? vehicle? mod?><name/><item kind specialist? armor? dv? ranges?/>?<effect ref param? value? note?/>*<narrative/></amp>`

- `<item>` (equipment amps only) is the base item bought with the amp, priced
  from `pricing.xml`. Book price = item price + rating × `ampPoint`.
- An effect without `param` is an open pick: the player chooses it in the Amp
  Builder (mentor spirits' "choose two RR").
- `note="balances printed rating"` / `note="book drawback"` mark effects added
  to reconcile with the book's printed rating (see `docs/book-discrepancies.md`).

- `type` is an amptype id.
- Each `effect ref` is an ampeffect id, and `param` fills its parameter (a
  skill id, spec id, attribute id, realm, or free text).
- `vehicle` names the chassis for vehicle amps.
- `mod="true"` marks an add-on (ammo, accessory, vehicle or deck mod,
  implant grade). It has no base rating: the Amp Builder appends its
  effects to an existing amp of the same `type`.

### lifestyles

`<lifestyle id perRun><name/><text/></lifestyle>`. Lifestyle is a Keyword,
not a purchase (CRB p.165). `perRun` is added to each run's earnings.

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

The optional rules a GM (admin or editor) plays with, switched on and off on the Rules page, plus house rules the GM
writes. Written by the server (`PUT /api/table-rules`, admin and editors; atomic), schema `tablerules.xsd`, namespace
`urn:chummer-anarchy2:config:1`; every signed-in user reads it at `/custom/table-rules.xml`, and players see the rules
switched on under Table rules. It lives in `custom/`, so backups carry it.

```xml
<ca2:tablerules xmlns:ca2="urn:chummer-anarchy2:config:1" version="1">
  <rule id="crb.optional-extended-social-tests" on="true"/>          <!-- a book's optional rule, by its id -->
  <rule id="house-3f2a9c01b2d4" on="true"><name>…</name><text>…</text></rule>   <!-- a house rule -->
</ca2:tablerules>
```

A book's rule not listed is off. A listed book rule whose book is gone keeps its switch for when the book comes back.
At most 200 rules; a house rule's name is 120 characters at most, its description 4,000.

## Imported sample runners

A recipe that reads stat blocks (`pregens`; `crb` for the rulebook's 12 pregens
and its character creation example) writes each runner as a character
file (`character.xsd`, `origin` = the source) to
`custom/imported/<source>/samples/<source>.<name>.xml`, and lists it in the
generated `custom/imported/samples.xml` (`<sample source href name role page/>`,
`href` relative to `custom/imported/`; schema `samples.xsd`). "Load sample
characters" reads that list; before any import there are none. It matches samples by source and name, not by id
(`sampleKey`, docs/character-format.md).
The numbers the book prints for each runner are report rows in
`library/<book>/import.xml` (`kind` pool, threshold, essence or amp, with a
`status`).

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
  names mount to in Docker; `library/.backups/` (the safety backups below)
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
