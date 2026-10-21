# Compendiums (`characters/sr6/.compendiums/<owner>/`) (Shadowrun 6 data format)

Part of the [Shadowrun 6 data format](../sr6-data-format.md).

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
  life modules and rules; `COMP_KINDS` in `src/sr6/formats/domain/compendium.ts`) under their usual tags, with only that kind's
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
