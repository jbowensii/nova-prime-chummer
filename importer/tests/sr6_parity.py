"""Invented sample runners for the parity of the importer's pricing (importer/sr6/fit.py and the costs archetypes.py
adds up for it) with the app's (src/sr6/runner-builder/domain/creation/budgets.ts, values.ts). Each runner is built from a made-up stat block
against the made-up fixture catalog (tests/fixtures/sr6/custom, its Stonefolk renamed a troll-sized `Stone Troll`) and
an invented book (MUP), with the fixture's creation settings. `python -m importer.tests.sr6_parity` prints JSON
{patch, files, runners}: tests/sr6/book-import/fit-parity.test.ts loads the runner files in the engine and compares its Karma and
nuyen with fit's (`py`: nuyen the gear costs, karma and nuyen left, karma turned into nuyen). All names and numbers are
made up."""
import json
import os
import shutil
import sys
import tempfile
from unittest import mock

from importer.sr6 import archetypes, catalog, fit
from importer.sr6.regroup import Block

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FIXTURE = os.path.join(ROOT, "tests", "fixtures", "sr6", "custom")
PATCH = ("Stonefolk", "Stone Troll")  # (a troll-sized metatype for the size pricing, in every fixture file)
NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'


def _file(kind, rows):
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n<sr6:data {NS} kind="{kind}" version="1">\n'
            + "".join(f"  {r}\n" for r in rows) + "</sr6:data>\n")


# the invented book: a unit price (`each`), a <formula> price, a squared rating, a graded implant, armor (a dwarf- or
# troll-sized runner pays more for it)
FILES = {
    "gear.xml": _file("gear", [
        '<gear id="mup.glow-stick" source="MUP" page="3" category="survival gear" avail="1" cost="15 each"><name>Glow Stick</name><text/></gear>',
        '<gear id="mup.zap-net" source="MUP" page="3" category="tools" rating="1–6" avail="2" cost="Rating × 75">'
        '<name>Zap Net</name><formula field="cost">R*R*20+100</formula><text/></gear>',
        '<gear id="mup.hum-box" source="MUP" page="4" category="tools" rating="1–4" avail="2" cost="Rating^2 × 60"><name>Hum Box</name><text/></gear>',
    ]),
    "augmentations.xml": _file("augmentations", [
        '<augmentation id="mup.buzz-wires" source="MUP" page="5" type="cyberware" category="bodyware" rating="1–3" '
        'essence="Rating × 0.2" avail="4" cost="Rating × 4000"><name>Buzz Wires</name><text/></augmentation>',
    ]),
    "armor.xml": _file("armor", [
        '<armor id="mup.puff-coat" source="MUP" page="6" category="armor" defense="+3" capacity="4" avail="3" cost="900"><name>Puff Coat</name><text/></armor>',
    ]),
}

STATS = {"B": "4", "A": "3", "R": "3", "S": "4", "W": "3", "L": "2", "I": "3", "C": "2", "EDG": "2", "ESS": "6"}


def block(name, meta, stats=None, **labels):
    return Block("item", name, "archetypes", name, f"metatype: {meta}", 10, stats=[{**STATS, **(stats or {})}],
                 labels={k.replace("_", " ").title(): v for k, v in labels.items()})


# (name, stat block, settings changed): one runner a priced thing, then a few at once
RUNNERS = [
    ("rated", block("Rated", "Glimmerkin", gear="Buzz Box (rating 4), Tangle Rope 3, Hum Box 3")),
    ("formula", block("Formula", "Glimmerkin", gear="Zap Net (rating 4), 2 x Zap Net 2")),
    ("graded", block("Graded", "Glimmerkin", augmentations="Buzz Wires 2 (alpha), Glow Eyes 3")),
    ("each", block("Each", "Glimmerkin", gear="10 x Glow Stick, 3 x Zap Pellets")),
    ("troll", block("Troll", "Stone Troll", {"B": "6", "S": "6"}, gear="Puff Coat, Padded Vest, Buzz Box 2"), {"metatypeSizePricing": "true"}),
    ("mixed", block("Spender", "Glimmerkin", gear="Pocketdeck, Fizz Rifle 70, Puff Coat, Buzz Box 6",
                             skills="Tinkering 4, Gab 3", qualities="Lucky Streak 2, Butterfingers")),
    ("in-debt", block("Debtor", "Glimmerkin", gear="Pocketdeck, Putt-Putt", qualities="Deep Pockets Debt")),
    ("in-debt-uncapped", block("Debtor", "Glimmerkin", gear="Pocketdeck, Putt-Putt", qualities="Deep Pockets Debt"),
     {"karmaToNuyenCap": "false"}),
    # a mystic adept (Magic 1: the lowest row's): the power point its power takes is bought out of its Magic, which
    # leaves no free spells (magic.ts freeSpellSlots), so its spells and ritual are bought with karma
    ("mystic", block("Mystic", "Glimmerkin", {"M": "1"}, spells="Glow Ward, Mend Glow", rituals="Moon Circle",
                     adept_powers="Quick Step 2")),
    # a magician whose implant took a point of Magic (the fixture's Essence 5, 4.6 printed): no free spells left (CRB
    # Hong Kong p.66)
    ("essence-loss", block("Wired Mage", "Glimmerkin", {"M": "1", "ESS": "4.6"}, spells="Glow Ward, Mend Glow",
                           rituals="Moon Circle", augmentations="Buzz Wires 2")),
    # past the starting Karma: built as a prime runner (its rules say so, assumed)
    ("prime", block("Prime", "Glimmerkin", {k: "6" for k in ("B", "A", "R", "S", "W", "L", "I", "C")},
                    skills="Tinkering 6, Gab 6", qualities="Knack, Lucky Streak 3")),
    # a level of play (the Sixth World Companion's street-level: its letters, B C C D E, and sum-to-ten target in place of
    # the table's) and a nested rule on (Twenty Questions' karma), another whose parent is off (sum-to-thirteen, Elite's)
    ("street-level", block("Streeter", "Glimmerkin", gear="Puff Coat, Buzz Box 2", skills="Tinkering 3, Gab 2",
                           qualities="Lucky Streak 2"),
     {"levelSwcStreet": "true", "swcStreet.letters": "BCCDE", "swcStreet.sumToTen": "8", "twentyQuestions": "true",
      "twentyQuestionsKarma": "6", "eliteSumToThirteen": "true"}),
]


def _json(v):
    """A setting's value as the app holds it: true/false, a number, else the text."""
    return {"true": True, "false": False}.get(v, v) if isinstance(v, str) else int(v) if v == int(v) else v


def runners():
    tmp = tempfile.mkdtemp()
    try:
        shutil.copytree(os.path.join(FIXTURE, "imported", "crb"), os.path.join(tmp, "imported", "crb"))
        for f in os.listdir(os.path.join(tmp, "imported", "crb")):
            p = os.path.join(tmp, "imported", "crb", f)
            with open(p, encoding="utf8") as fh:
                text = fh.read().replace(*PATCH)
            with open(p, "w", encoding="utf8") as fh:
                fh.write(text)
        os.makedirs(os.path.join(tmp, "imported", "mup"))
        for f, xml in FILES.items():
            with open(os.path.join(tmp, "imported", "mup", f), "w", encoding="utf8") as fh:
                fh.write(xml)
        core = catalog._core({"custom_dir": tmp}, "mup-own")
        base = fit.settings(os.path.join(FIXTURE, "creation.xml"))
        out = []
        for name, b, *more in RUNNERS:
            over = more[0] if more else {}
            cs = {**base, **{k: float(v) if v.replace(".", "").isdigit() else v for k, v in over.items()}}
            seen = []
            real = fit.fit
            with mock.patch.object(fit, "fit", side_effect=lambda need, rows, s: seen.append((need, r := real(need, rows, s))) or r):
                _, xml, report = archetypes.build("MUP", b.name, b, 10, {}, "2026-10-12T00:00:00.000Z", core, cs)
            need, got = seen[-1]
            out.append({"name": name, "settings": over, "xml": xml, "unmatched": [r["value"] for r in report],
                        "py": {"nuyen": need["nuyen"], "karmaLeft": got["karmaLeft"], "nuyenLeft": got["nuyenLeft"],
                               "karmaToNuyen": got["karmaToNuyen"]} if got else None,
                        "resolved": {k: _json(v) for k, v in fit.resolve(cs).items()}})
        return out
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    json.dump({"patch": PATCH, "files": [{"file": f"custom/sr6/imported/mup/{f}", "xml": x} for f, x in FILES.items()],
               "runners": runners(), "deps": {"requires": fit.REQUIRES, "levelKeys": fit.LEVEL_KEYS, "levels": fit.LEVELS,
                                              "sets": fit.SETS}}, sys.stdout)
