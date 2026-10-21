"""The Shadowrun 6 (SR6) importer: its data namespace, schemas and catalog kinds. See docs/sr6-data-format.md."""
import os

from importer import DATA_DIR

NS = "urn:chummer-sr6:data:1"
ROOT = ("sr6", NS)  # its data root (importer/xmlio.py: the texts and sources files, id scoping)
# public/data/sr6/schema in the repo, $CA2_DATA_DIR/sr6/schema in the image
SCHEMA_DIR = os.path.join(DATA_DIR, "sr6", "schema")
# catalog kind (its file, custom/sr6/imported/<source>/<kind>.xml) -> entry tag, in the catalog's order. The same map is
# SR6_KINDS in server/games.mjs and src/sr6/formats/domain/types.ts.
KINDS = {
    "priorities": "priority",
    "metatypes": "metatype",
    "attributes": "attribute",
    "skills": "skill",
    "qualities": "quality",
    "weapons": "weapon",
    "armor": "armor",
    "augmentations": "augmentation",
    "grades": "grade",
    "electronics": "device",
    "programs": "program",
    "gear": "gear",
    "vehicles": "vehicle",
    "spells": "spell",
    "rituals": "ritual",
    "adeptpowers": "adeptpower",
    "complexforms": "complexform",
    "metamagics": "metamagic",
    "echoes": "echo",
    "martialarts": "martialart",
    "martialtechniques": "martialtechnique",
    "traditions": "tradition",
    "critterpowers": "critterpower",
    "critters": "critter",
    "spirits": "spirit",
    "npcs": "npc",
    "sprites": "sprite",
    "lifestyles": "lifestyle",
    "contacts": "contact",
    "lifemodules": "lifemodule",
    "actions": "action",
    "packs": "pack",
    "vehicledesign": "design",
    "ammotypes": "ammotype",
    "mentorspirits": "mentorspirit",
    "datastructures": "datastructure",
    "qualitypaths": "qualitypath",
    "spellfeatures": "spellfeature",
    "contacttypes": "contacttype",
    "qualitysets": "qualityset",
    "licencetypes": "licencetype",
    "magictypes": "magictype",
    "ruleoptions": "ruleoption",
    "senses": "sense",
    "trueelements": "trueelement",
    "categories": "category",
    "rules": "rule",
}
# the kinds read from the books' own sections and tables (importer/sr6/sections.py), listed as printed: DISPLAY_KINDS in
# src/sr6/formats/domain/types.ts
SECTION_KINDS = ("actions", "packs", "vehicledesign", "ammotypes", "mentorspirits", "datastructures", "qualitypaths",
                 "spellfeatures", "contacttypes", "qualitysets", "licencetypes", "magictypes", "ruleoptions", "senses",
                 "trueelements")
