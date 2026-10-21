"""Effects an entry's prose and tables state (the phase 6 effects grammar): general rules over the sentences, each giving
a target (a path from the character, or the item, to the thing it changes), an operation and a value, how it is
switched on and how sure the reading is. Vocabulary only (the game's words for attributes, skills, test types, derived
values, Matrix attributes and item stats), never an item's name. docs/sr6-data-format.md, "Effects", lists them.

Targets:
- `attr:<abbr>` an attribute (bod … cha, edg, mag, res, ess); `attr-max:<abbr>` its maximum (`attr-max:choice`: the one
  the player picks);
- `skill:<id>` a skill's dice pool (a specialization the effect is limited to: `when`);
- `test:<type>` a test type, shown on every pool it covers (TEST_TYPES: the book's own lists of which skills belong
  to each; `attr-<abbr>` the tests using that attribute; resistance and defense tests);
- `derived:<name>` Defense Rating (`defense`, `defense-astral`, `social`), initiative (`initiative`, `initiative-dice`,
  `matrix-initiative`, `matrix-initiative-dice`), condition monitor boxes (`physical-monitor`, `stun-monitor`,
  `matrix-monitor`, `overflow`), `composure`, `judge-intentions`, `memory`, `lift`, `movement`, `minor-actions`,
  `major-actions`, `hardened-armor`, `damage-reduction`;
- `matrix:<name>` a Matrix attribute (`attack`, `sleaze`, `data-processing`, `firewall`, `choice`) or the Overwatch
  Score (`overwatch`);
- `item:<field>` the item's own stat, or, on an add-on (an accessory, an ammo type, a vehicle mod), the stat of the
  item it fits: `ar` (one value per range band), `dv`, `concealability`, `handling`, `acceleration`,
  `speed-interval`, `top-speed`, `body`, `armor`, `pilot`, `sensor`, `seats`, `size`, `ammo`, `damage-type`;
- `action:<name>` an Edge or Matrix action; `action-max:<name>` the cap on an action's bonus;
- `complex-form:<name>` a complex form named as what the bonus is on; `lifestyle:<name>` lifestyle points;
- `resource:<name>` a creation resource (`contact-points`); `skill-max:<id>` a skill's maximum;
- `sense:<name>` a sense the entry is named for or grants; `pool:chase` the chase pool's Edge; `pricemod:<what>` a
  price in percent; and the derived `monthly-cost`, `essence-hole`, `unarmed-damage`, `power-points` and the rule changes `adept-drain-attribute`,
`wound-penalty`, `wound-threshold` and `drain-value` (shown, never applied), with `item:damage-type` (`set` S or P).
docs/sr6-data-format.md, "Effects", is the full grammar (every target family, operation and value).

Operations: `add` (+N, or -N), `set` (the value replaces it: an infected type's attribute maximum), `edge` (N bonus
Edge on those tests), `edge-cost` (Edge boosts and actions on them cost N more, -N less), `edge-cost-set` (an Edge
action's new cost), `no-edge` (no Edge may be spent on them), `no-edge-gain` (no Edge may be gained on them),
`wild-die` (a die of the pool is a wild die), `hits` (N extra hits), `threshold` (the test's threshold changes by N), `threshold-set` (its new threshold).

Values: a number; `R` (× the line's rating, level or Force: `adds its rating`, `per level`), `R*N`; or a formula over
attributes (`edg/2`: half your Edge, rounded down), which is shown, never applied.

How it is turned on (`switch`): none (always on), `wireless`, `activated` (at will, an action, overdrive), `sustained`,
`conditional` (some tests or situations only). An effect read from a sentence that sets a condition is
`confidence="low"`: shown, never applied (owner decision D3); `when` holds the condition's words (`magician`,
`smell-based`, `in VR`).

Links (owner decision 2026-10-10): an entry that grants another (`gain the Built Tough quality`, `1 free level of Rapid
Healing`) or works as another (`the same result as a Personalized Grip`) holds <link rel="grants|as" kind name>; after
every book is read, copy_links() also copies the linked entry's effects into it (owner direction 2026-10-17: every entry
holds the effects of its whole object), each `from` the linked id, the link marked `copied`: the app and the Foundry
module then read the copies, not the link.

The package, by the reader's stages (each imports only the ones above it): words (the vocabulary, sentence splitting),
values (targets, values, conditions), rules (_rules, the phrasing rules), reader (read), citations (links, See X,
incompatibilities), tables (a table's modifier columns, accessory), entries (a section's entries, rating tables, variants,
section_effects), emit (apply, copy_links). This module re-exports the names the importer, its tests and tools/cl6effects
use (tools/cl6effects/rebuild.py imports `importer.sr6.effects` by name, from older trees too)."""

from .words import sentences
from .values import _activity, _armor_performance, _rated, _sw, split_cost, targets
from .reader import _road_pairs, read
from .citations import addon_links, incompatibilities, links, see_links, tire_links
from .tables import accessory, less_accessory, table
from .entries import (
    ENTRY,
    _block_text,
    _own_part,
    _resolve_variant,
    _runins,
    _sections,
    _variant_part,
    _variant_sentences,
    rating_table,
    section_effects,
    split_entries,
)
from .emit import _at_level, _tag, apply, copy_links
