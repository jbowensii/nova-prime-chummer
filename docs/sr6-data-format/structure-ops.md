# Structure ops in the per-book tables, and the extra classes (Shadowrun 6 data format)

Part of the [Shadowrun 6 data format](../sr6-data-format.md).

Beside `ours`, `add` and the `class` id rows, a table (`importer/sr6/overrides/<recipe id>.json`) takes six ops on entries
by their unscoped id, applied in this order: remove, split and merge, the class rows, then rename and move_kind. An entry a row
names that isn't there is reported once on stderr and nothing is guessed; each is idempotent, and none may name a
description field.

- `{"kind","id","remove":true}`: the entry goes, its aliases with it and its text from the texts file (a heading artifact,
  a duplicate of an NPC).
- `{"kind","merge":{"into","from","from_kind"}}`: the attributes `into` lacks (skill, spec, type, dv, ar, ammo, modes …,
  never id, source, page, class or group) are copied from `from`, the stat table's copy of it, which then goes.
- `{"kind","id","split":[{"id","name","set"?,"note"?}]}`: a row the book prints once for several things becomes one entry per
  part (Swindler Stick: one per certified credstick grade; Manadyne XX-10/XX-100: MB/PB; Rolling Blades: skateboard hardened/bladed,
  roller skates bladed). Each part is a copy of the entry with its own id and name, its `set` values (cost, avail …; the
  entry's formula/issue for those fields go) and an optional `note` `{"field","text"}` keeping the printed rule the value comes
  from (`250 + Certified Credstick Cost`, as a `<note field="cost">`). The entry's other names go; the book's text for it is
  given to every part (`texts()`), never written by hand. Runs with remove and merge; rows for the new ids (class, family,
  errata) come after it. The old id reaches the first part through moved.py's name tiers (a re-import).
- `{"kind","id","rename":"<name>"}`: a new name, names only; the old printed name stays as an `<alias>` unless
  `"alias": false` (a name the import damaged).
- `{"kind","id","notext":true}`: no description, the book printing none for the entry: a text the import gave it from
  elsewhere goes (the Companion's `Armor (per point)` optional power, which effects.py's rule-text fallback gave the
  `Armor PACKs` section's text).
- `{"move_kind":{"id","from":"gear","to":"weapons"}}`: the entry is re-filed in weapons.xml as a close-combat weapon
  (skill Close Combat, spec from its class subtype: Blades, Clubs, Unarmed), keeping page, avail and cost; attributes the
  weapons schema lacks (capacity, karma, per, slots, energy) are dropped. An id the target file has already is left.

Classes that are not Commlink6's (`importer/sr6/classes/extra_classes.json`, each with a reason): `CRITTERWARE/*`
(critter-only; the app keeps any entry of such a class out of the player's pickers and refuses to buy it), the space drones
and vehicles, and the laser weapons (`WEAPON_LASER/PISTOLS_LIGHT` …, Commlink6's firearms naming). `python -m
tools.cl6check` accepts an entry of such a class and reports "deliberate extra classes: N". A source's whole section can
take one (`classes/section_prefix.json`: Body Shop's critter chapter, all `CRITTERWARE/AUGMENTATION`, whatever the entry had;
the Companion's Infected optional powers, `INFECTED/OPTIONAL_POWER`, an extra; its Infected qualities, `INFECTED`, a rule
marked `"commlink6": true` since Commlink6 has that type; Wild Life's Purchasing a Critter rows, p. 180,
`CRITTERWARE/PURCHASE`: gear of category `Critter purchase` (Pet (Mundane), Pet (Exotic), Pet (Wild), Awakened, Emerged:
avail and cost as printed, `Body x 100 nuyen`) and `Critter purchase option` (the qualities' and training's effects, `+1`,
`+500 nuyen`), and its Critter Companion Qualities, pp. 184-186, `CRITTERWARE/QUALITY`: a critter's, never a runner's.
The book's limit of six qualities on a purchased critter, p. 184, is a game rule, not data).
