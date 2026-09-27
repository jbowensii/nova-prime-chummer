# Chummer Anarchy 2.0 data format

All game data lives in XML files under `public/data/`, and the web app serves
them unchanged at `/data/`. Any application can read or write them. The
schemas in `public/data/schema/` are the contract, and
`npm run validate:data` checks the files against the schemas and checks that
every cross-reference resolves.

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
    its kind. References always use ids, never names.
  - `source`: a book code. `CRB` is the Anarchy 2.0 core rulebook v1.8,
    `CG` is the CGL Conversion Guide v1.1 (technomancers), `DHSA` is
    Daegann's Holostreets Shadow Amps Expanded List v3.4b, and `CUSTOM` is
    your own content.
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
| gear / weapons / armor / spells / complexforms | gear.xml … | `<item>` | items.xsd |
| amps | amps.xml | `<amp>` | amps.xsd |
| lifestyles | lifestyles.xml | `<lifestyle>` | lifestyles.xsd |

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
- `requires` is `awakened`, `cyberdeck` or `emerged` (Tasking).
- Spec ids are `<skill>.<spec>`, for example `stealth.physical-sneaking`.

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

## Private descriptions (`custom/texts.xml`)

`<text of="amps|items" id="…">description</text>` entries, kind `texts`
(schema `texts.xsd`). When `custom/texts.xml` exists, the app merges each
text into the amp's narrative or the item's text with the same id. It is
generated by `tools/dhsa_to_xml.py` into `.extract/private/texts.xml` and is
never committed. On tower04 it lives at
`/mnt/user/appdata/chummer-anarchy2/custom/texts.xml`. For local
development, copy it to `public/custom/texts.xml` (gitignored).

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
Overlays load after the base files, in the order listed:

- An entry whose `id` matches a base entry **replaces** it completely.
- `<remove id="…"/>` **deletes** the base entry with that id.
- An entry with a new `id` is **added**.

A file that fails to parse or fails its schema is skipped and reported on the
app's Data screen. The app keeps running on the base data.

### Example: a higher-powered campaign

```xml
<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="levels" version="1">
  <level id="runner" nuyen="400000" attrAtMax="1" skillCap="5" rrAttr="1" rrSkill="1" rrSpec="2" source="CUSTOM" page="1"><name>Runner (house)</name></level>
  <remove id="ganger"/>
  <level id="legend" nuyen="600000" attrAtMax="3" skillCap="7" rrAttr="2" rrSkill="2" rrSpec="3" source="CUSTOM" page="1"><name>Street Legend</name></level>
</ca2:data>
```
