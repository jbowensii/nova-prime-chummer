"""The Shadowrun 6 (SR6) importer: its data namespace, schemas and catalog kinds. See docs/sr6-data-format.md."""
import os

from importer import DATA_DIR

NS = "urn:chummer-sr6:data:1"
# public/data/sr6/schema in the repo, $CA2_DATA_DIR/sr6/schema in the image
SCHEMA_DIR = os.path.join(DATA_DIR, "sr6", "schema")
# catalog kind (its file, custom/sr6/imported/<source>/<kind>.xml) -> entry tag, in the catalog's order. The same map is
# SR6_KINDS in server/games.mjs and src/sr6/model/types.ts.
KINDS = {
    "priorities": "priority",
    "metatypes": "metatype",
    "attributes": "attribute",
    "skills": "skill",
    "qualities": "quality",
    "weapons": "weapon",
    "armor": "armor",
    "augmentations": "augmentation",
    "electronics": "device",
    "gear": "gear",
    "vehicles": "vehicle",
    "spells": "spell",
    "rituals": "ritual",
    "adeptpowers": "adeptpower",
    "complexforms": "complexform",
    "metamagics": "metamagic",
    "echoes": "echo",
    "critterpowers": "critterpower",
    "critters": "critter",
    "spirits": "spirit",
    "npcs": "npc",
    "sprites": "sprite",
    "lifestyles": "lifestyle",
    "contacts": "contact",
    "lifemodules": "lifemodule",
    "rules": "rule",
}
