"""The SR6 effects reader (importer/sr6/effects.py): general phrasings over made-up text, a table's modifier columns, the
import's pass over every entry, and the description fixes it relies on (regroup's part headings and page-break
continuations). All invented."""
import re
import unittest

from importer.sr6 import effects, regroup


def fx(text, kind=None):
    """[(target, op, value, switch, when)] of the effects read from `text`."""
    return [(a["target"], a["op"], a["value"], a.get("switch"), a.get("when")) for t, a, _ in effects.read(text, kind) if t == "effect"]


class ReadTest(unittest.TestCase):
    def test_attributes_lists_and_levels(self):
        self.assertEqual(fx("You get a +1 to your Agility, Body, and Strength."),
                         [("attr:agi", "add", "1", None, None), ("attr:bod", "add", "1", None, None), ("attr:str", "add", "1", None, None)])
        self.assertEqual(fx("The zapgland increases both your Strength and Logic attributes by its rating."),
                         [("attr:str", "add", "R", None, None), ("attr:log", "add", "R", None, None)])
        self.assertEqual(fx("For each level of this power, add an Initiative Die and increase your Reaction by 1."),
                         [("derived:initiative-dice", "add", "R", None, None), ("attr:rea", "add", "R", None, None)])
        self.assertEqual(fx("Effect: -1 Reaction, +2 Logic", "gear"),  # a drug's effect line: while it acts
                         [("attr:rea", "add", "-1", "activated", None), ("attr:log", "add", "2", "activated", None)])

    def test_what_an_entry_cant_be_combined_with(self):
        inc = lambda text, name="Zap Lacing (Tin)": [(t, a) for t, a, _ in effects.incompatibilities(text, name)]
        self.assertEqual(inc("Zap lacing comes in two types—you can only have one installed at a time. Zap lacing is incompatible "
                             "with other augmentations that alter your bones (such as glow density augmentation)."),
                         [("incompatible", {"family": "Zap Lacing"}), ("incompatible", {"names": "glow density augmentation"})])
        self.assertEqual(inc("Zip enhancers are incompatible with all other enhancements to Reaction, including zap reflexes."),
                         [("incompatible", {"targets": "attr:rea", "names": "zap reflexes"})])
        self.assertEqual(inc("Zap reflexes are incompatible with augmentations that affect Reaction or Initiative."),
                         [("incompatible", {"targets": "attr:rea derived:initiative-dice"})])
        self.assertEqual(inc("It cannot be combined with other augmentations to the muscles, including glow augmentation or glow toner bioware."),
                         [("incompatible", {"names": "glow augmentation; glow toner"})])
        self.assertEqual(inc("This bioware is incompatible with augmentations that increase Strength, including the zap replacement cyberware."),
                         [("incompatible", {"targets": "attr:str", "names": "zap replacement"})])
        self.assertEqual(inc("Wireless bonus: Zip enhancers are compatible with a wireless zap reflexes system."),
                         [("compatible", {"name": "zap reflexes", "switch": "wireless"})])
        self.assertEqual(inc("Incompatible with Glow Eye."), [("incompatible", {"names": "Glow Eye"})])
        self.assertEqual(inc("It is incompatible with anything else that provides an edge to the Athletics skill."), [])
        self.assertEqual(inc("It is compatible with other zappers."), [])  # (only a wireless exception)

    def test_a_powers_two_prices(self):
        self.assertEqual(effects.split_cost("Combat skill: 0.75 PP per level; other skills 0.25 PP per level"),
                         {"cost": "0.25", "costCombat": "0.75"})
        self.assertEqual(effects.split_cost("0.5 PP per level"), {})

    def test_unarmed_damage_made_physical(self):
        for text in ("It changes your unarmed combat damage to Physical.", "Your unarmed combat damage becomes Physical.",
                     "Your Unarmed Melee attacks inflict Physical damage."):
            self.assertIn(("derived:unarmed-damage", "set", "P", None, None), fx(text), text)
        self.assertEqual(fx("Your unarmed attacks do not inflict Physical damage."), [])

    def test_defense_monitors_actions(self):
        self.assertEqual(fx("It grants +3 Defense Rating."), [("derived:defense", "add", "3", None, None)])
        self.assertEqual(fx("You gain 1 level of natural Armor."), [("derived:defense", "add", "1", None, None)])
        self.assertEqual(fx("Each zaplimb adds one box to the character's Physical Condition Monitor."),
                         [("derived:physical-monitor", "add", "1", None, None)])
        self.assertEqual(fx("You have 1 less Stun Box for each level of this quality."), [("derived:stun-monitor", "add", "-R", None, None)])
        self.assertEqual(fx("You gain two additional Damage Overflow boxes."), [("derived:overflow", "add", "2", None, None)])
        self.assertEqual(fx("It grants an additional Minor Action."), [("derived:minor-actions", "add", "1", None, None)])
        self.assertEqual(fx("Crew served: 2 additional Major Actions required to reload this zapper."), [])  # a cost
        self.assertEqual(fx("It grants the Hardened Armor ability at rating 2."), [("derived:hardened-armor", "add", "2", None, None)])
        self.assertEqual(fx("Light zapsuits reduce incoming DV by 1."), [("derived:damage-reduction", "add", "1", None, None)])

    def test_test_types_and_specializations(self):
        self.assertEqual(fx("You gain a point of Edge on all Social tests."), [("test:social", "edge", "1", None, None)])
        self.assertEqual(fx("You cannot spend Edge on any test using Charisma."), [("test:attr-cha", "no-edge", "1", None, None)])
        self.assertEqual(fx("The user gains a +2 dice pool bonus to all climbing tests."), [("skill:athletics", "add", "2", None, None)])
        self.assertEqual(effects.read("The user gains a +2 dice pool bonus to all climbing tests.")[0][1]["spec"], "Climbing")
        self.assertEqual(fx("You gain a bonus Edge on all tests involving juggling.")[0][:3], ("test:other", "edge", "1"))
        self.assertEqual(fx("Gain +1 Edge on Toxin Resistance tests."), [("test:toxin-resistance", "edge", "1", None, None)])

    def test_edge_costs_and_roles(self):
        self.assertEqual(fx("**Magician:** Edge Boosts cost 1 less for Illusion spells"),
                         [("test:spell-illusion", "edge-cost", "-1", "conditional", "magician")])
        self.assertEqual(fx("**All:** Edge Boosts cost 1 less for tests to resist damage (not including drain)"),
                         [("test:damage-resistance", "edge-cost", "-1", None, None)])
        self.assertEqual(fx("Reduce the Edge cost of the Glow Kick Edge Action by 1."), [("action:glow-kick", "edge-cost", "-1", None, None)])
        self.assertEqual(fx("Swap in a wild die on any roll made for Firearms."), [("skill:firearms", "wild-die", "1", None, None)])

    def test_matrix_items_and_bands(self):
        self.assertEqual(fx("This module provides a Sleaze attribute equal to its rating.", "gear"), [("matrix:sleaze", "add", "R", None, None)])
        self.assertEqual(fx("When hacking, reduce OS by 1 for every illegal action.")[0][:3], ("matrix:overwatch", "add", "-1"))
        self.assertEqual(fx("Note: This mod alters the AR as follows: +2/–/–1/–2/–3.", "weapons"),
                         [("item:ar", "add", "2,0,-1,-2,-3", None, None)])
        self.assertEqual(fx("Increase Acceleration by 3, and Top Speed by 50.", "vehicledesign"),
                         [("item:acceleration", "add", "3", None, None), ("item:top-speed", "add", "50", None, None)])
        self.assertEqual(fx("Each rating of this mod adds a point to the vehicle's Body.", "gear"), [("item:body", "add", "R", None, None)])

    def test_maxima(self):
        self.assertEqual(fx("That attribute's maximum (but not current) rank increases by 1."), [("attr-max:choice", "add", "1", None, None)])
        # (the maximum, never the attribute too)
        self.assertEqual(fx("The zapper's attribute maximum (but not current rank) for the chosen attribute increases by 1."),
                         [("attr-max:choice", "add", "1", None, None)])
        self.assertEqual(fx("Their physical attribute maximums are reduced by 1."),
                         [(f"attr-max:{a}", "add", "-1", None, None) for a in ("bod", "agi", "rea", "str")])

    def test_what_is_no_effect_of_the_entry(self):
        self.assertEqual([a.get("affects") for t, a, _ in effects.read("Those looking for you have -2 dice on their Perception tests.") if t == "effect"], ["others"])  # others' (owner decision 16)
        self.assertEqual([a.get("affects") for t, a, _ in effects.read("Additionally, other individuals get a +2 dice pool bonus on Memory tests.") if t == "effect"], ["others"])
        self.assertEqual(fx("For every hit, increase the noise around your physical body by one."), [])  # no attribute
        self.assertEqual(fx("Their Glow is boosted by 2."), [])  # no vocabulary target

    def test_links(self):
        ln = lambda t: [a for _, a, _ in effects.links(t)]
        self.assertEqual(ln("Both forms gain the Tough Hide quality. See p. 70, SR6."),
                         [{"rel": "grants", "name": "Tough Hide", "kind": "qualities", "book": "crb"}])
        self.assertEqual(ln("**Adept:** 1 free level of Glow Step"),
                         [{"rel": "grants", "name": "Glow Step", "kind": "adeptpowers", "level": "1", "when": "adept"}])
        self.assertEqual(ln("It achieves the same result as a Comfy Grip."), [{"rel": "as", "name": "Comfy Grip"}])


class TableTest(unittest.TestCase):
    def test_maxima_and_modifier_columns(self):
        head = ["TYPE", "BASE", "BOD", "AGI", "REA", "STR", "WIL", "LOG", "INT", "CHA"]
        self.assertEqual([(a["target"], a["op"], a["value"]) for _, a, _ in effects.table(head, ["Glowghoul", "Human", "9", "6", "8", "7", "7", "5", "7", "4"], "qualities")][:2],
                         [("attr-max:bod", "set", "9"), ("attr-max:agi", "set", "6")])
        self.assertEqual([(a["target"], a["value"]) for _, a, _ in effects.table(["TYPES", "AR", "DV"], ["Fizz", "+2", "–1"], "ammotypes")],
                         [("item:ar", "2,2,2,2,2"), ("item:dv", "-1")])
        self.assertEqual([(a["target"], a["value"]) for _, a, _ in effects.table(["JACK", "MATRIX INIT BONUS"], ["Rating 1", "+1"], "augmentations")],
                         [("derived:matrix-initiative", "1")])
        self.assertEqual(effects.table(["WEAPON", "DV", "AR"], ["Zapper", "3P", "9/7/—/—/—"], "weapons"), [])  # its own stats
        # (a later printing's renamed header: read by its words)
        self.assertEqual([(a["target"], a["value"]) for _, a, _ in effects.table(["JACK", "VR MATRIX INIT DICE BONUS"], ["Rating 1", "+1"], "augmentations")],
                         [("derived:matrix-initiative-dice", "1")])
        self.assertEqual(effects.table(["JACK", "INIT NOTES"], ["Rating 1", "+1"], "augmentations"), [])

        # a table of unarmed values (a made-up lacing): its BODY is Body when resisting physical damage, its DV set or added
        lacing = ["LACING", "BODY", "DEFENSE RATING", "UNARMED DV", "UNARMED AR"]
        self.assertEqual([(a["target"], a["op"], a["value"], a.get("when")) for _, a, _ in effects.table(lacing, ["Tin", "+2", "+1", "5P", "+3"], "augmentations")],
                         [("test:damage-resistance", "add", "2", "when resisting physical damage"), ("derived:defense", "add", "1", None),
                          ("derived:unarmed-dv", "set", "5", None), ("derived:unarmed-ar", "add", "3", None)])
        self.assertEqual([(a["target"], a["op"], a["value"]) for _, a, _ in effects.table(lacing, ["Tin", "+2", "+1", "+1", "+3"], "augmentations")][2],
                         ("derived:unarmed-dv", "add", "1"))
        self.assertEqual(effects.table(["DRONE", "BODY", "ARMOR"], ["Buzzer", "+2", "3"], "vehicles"), [])  # a vehicle's Body


class ApplyTest(unittest.TestCase):
    def test_every_entry_from_its_text_tables_and_parent(self):
        files = {"qualities.xml": '<sr6:data kind="qualities">\n  <quality id="glow-skin" source="X" page="1"><name>Glow Skin</name></quality>\n'
                                  '  <quality id="glowghoul" source="X" page="2"><name>Glowghoul</name></quality>\n</sr6:data>\n',
                 "augmentations.xml": '<sr6:data kind="augmentations">\n  <augmentation id="gene-boost-zip" source="X" page="3"><name>Gene Boost (Zip)</name></augmentation>\n</sr6:data>\n',
                 "ammotypes.xml": '<sr6:data kind="ammotypes">\n  <ammotype id="fizz" source="X" page="4" ar="+1" dv="–1"><name>Fizz</name></ammotype>\n</sr6:data>\n',
                 "rules.xml": '<sr6:data kind="rules">\n  <rule id="r" source="X" page="1"><name>R</name></rule>\n</sr6:data>\n'}
        texts = ('<sr6:data kind="texts">\n  <text of="qualities" id="glow-skin">It grants +2 Defense Rating.</text>\n'
                 '  <text of="augmentations" id="gene-boost-zip">**Treatment time:** 1 month</text>\n'
                 '  <text of="rules" id="r">It grants +9 Defense Rating.</text>\n</sr6:data>\n')
        regrouped = ('<!-- section {"name": "Gene Boost"} -->\n**Zip:** This boost provides a +1 increase to Reaction.\n\n<!-- end -->\n'
                     '| TYPE | BASE | BOD | AGI | REA | STR | WIL | LOG | INT | CHA |\n|---|---|---|---|---|---|---|---|---|---|\n'
                     '| Glowghoul | Human | 9 | 6 | 8 | 7 | 7 | 5 | 7 | 4 |\n')
        out, txt = effects.apply(files, texts, regrouped)
        self.assertIn('<effect target="derived:defense" op="add" value="2"/></quality>', out["qualities.xml"])
        self.assertIn('<effect target="attr-max:bod" op="set" value="9"/>', out["qualities.xml"])
        self.assertIn('<effect target="attr:rea" op="add" value="1"/>', out["augmentations.xml"])  # its run-in paragraph
        self.assertIn("This boost provides a +1 increase to Reaction.", txt)
        self.assertIn('<effect target="item:ar" op="add" value="1,1,1,1,1"/><effect target="item:dv" op="add" value="-1"/>', out["ammotypes.xml"])
        self.assertEqual(out["rules.xml"], files["rules.xml"])  # rules hold no effects

    def test_one_row_a_rating_carries_its_rating_when_it_counts_per_rating(self):
        row = '  <augmentation id="{i}" source="X" page="1"{a}><name>{n}</name></augmentation>\n'
        rows = [("zap-wires-1", "", "Zap Wires 1"), ("zap-wires-3", "", "Zap Wires 3"), ("zap-jack-2", "", "Zap Jack (Rating 2)"),
                ("zap-lone-5", "", "Zap Lone 5"), ("zap-ranged-2", ' rating="1-4"', "Zap Ranged 2"), ("fizz-70", "", "Fizz 70"),
                ("fizz-75", "", "Fizz 75")]
        files = {"augmentations.xml": '<sr6:data kind="augmentations">\n' + "".join(row.format(i=i, a=a, n=n) for i, a, n in rows)
                 + "</sr6:data>\n"}
        per = "Each rating point gives +1 Reaction."
        texts = '<sr6:data kind="texts">\n' + "".join(f'  <text of="augmentations" id="{i}">{per if not i.startswith("fizz") else "Shiny."}</text>\n'
                                                      for i, _, _ in rows) + "</sr6:data>\n"
        out = {m.group(1): m.group(0) for m in re.finditer(r'<augmentation id="([^"]+)"[^>]*>', effects.apply(files, texts, "")[0]["augmentations.xml"])}
        self.assertIn(' rating="1"', out["zap-wires-1"])
        self.assertIn(' rating="3"', out["zap-wires-3"])  # (R is this row's 3, not 1)
        self.assertIn(' rating="2"', out["zap-jack-2"])
        self.assertNotIn("rating=", out["zap-lone-5"])  # (a bare number with no sibling: a model number, not a rating)
        self.assertIn(' rating="1-4"', out["zap-ranged-2"])  # (its own range stays)
        self.assertNotIn("rating=", out["fizz-70"])  # (siblings, but nothing counts per rating)

    def test_rated_add_ons_a_choice_of_attributes_a_threshold_and_a_stat_by_name(self):
        self.assertEqual(fx("Zaplimbs can be used to add to either Agility, Armor, or Strength of the user."),
                         [("attr:choice", "add", "R", None, "agility or strength")])
        got = [a for t, a, _ in effects.read("When making jumping tests (Athletics + Strength) subtract the zap springs rating "
                                             "from the threshold, with a minimum modified threshold of 1.", "augmentations") if t == "effect"]
        self.assertEqual([(a["target"], a["op"], a["value"], a.get("spec")) for a in got], [("skill:athletics", "threshold", "-R", "Jumping")])
        rated = '<formula field="cost">R*5000</formula>'
        rows = [("armor", "Zaplimb accessory", "Armor", rated), ("strength", "Zaplimb accessory", "Strength", rated),
                ("plain-armor", "Zaplimb accessory", "Armor", ""), ("gear-armor", "Gear", "Armor", rated)]
        files = {"augmentations.xml": '<sr6:data kind="augmentations">\n' + "".join(
            f'  <augmentation id="{i}" source="X" page="1" category="{c}"><name>{n}</name>{k}</augmentation>\n' for i, c, n, k in rows)
            + "</sr6:data>\n"}
        out = {m.group(1): m.group(0) for m in re.finditer(r'<augmentation id="([^"]+)".*', effects.apply(files, "", "")[0]["augmentations.xml"])}
        self.assertIn('<effect target="derived:defense" op="add" value="R"/>', out["armor"])  # (a cyberlimb's Armor: Defense Rating)
        self.assertIn('<effect target="attr:str" op="add" value="R"/>', out["strength"])
        self.assertNotIn("<effect", out["plain-armor"])  # (not rated)
        self.assertNotIn("<effect", out["gear-armor"])  # (not an add-on)
    def test_a_variants_row_in_its_familys_table(self):
        # `Glitter Lacing (Tin)`: its own row prices it; its effects are the row `Tin` of the family's table (invented)
        files = {"augmentations.xml": '<sr6:data kind="augmentations">\n  <augmentation id="gl-tin" source="X" page="3"><name>Glitter Lacing (Tin)</name></augmentation>\n</sr6:data>\n'}
        regrouped = ('| BODYWARE | ESSENCE | COST |\n|---|---|---|\n| Glitter Lacing (Tin) | 0.5 | 100 |\n\n'
                     '| LACING | BODY | DEFENSE RATING | UNARMED DV | UNARMED AR |\n|---|---|---|---|---|\n| Tin | +1 | +1 | 3P | +1 |\n')
        out, _ = effects.apply(files, "", regrouped)
        self.assertIn('<effect target="derived:defense" op="add" value="1"/><effect target="derived:unarmed-dv" op="set" value="3"/>', out["augmentations.xml"])

    def test_a_shared_description_is_split_by_name(self):
        t = ("Turbo engines go fast. Increase Acceleration by 3. Economy engines save money. Decrease Acceleration by 2.")
        self.assertEqual(effects._own_part(t, "Economy Engines", ["Turbo", "Economy Engines"]), "Economy engines save money. Decrease Acceleration by 2.")
        self.assertEqual(effects._own_part(t, "Other", ["Turbo", "Economy Engines"]), t)


class DecisionsTest(unittest.TestCase):
    """The owner's decisions of 2026-10-10, second round: activities as skills, specializations, condition words,
    whom a spell affects, section-wide statements, a variant's base item, a variant's own paragraph."""

    def test_activities_specializations_and_conditions(self):
        self.assertEqual(fx("You gain a bonus Edge on all tests involving grappling, escaping bonds, or juggling."),
                         [("skill:close-combat", "edge", "1", "conditional", "grappling"), ("skill:athletics", "edge", "1", "conditional", "escaping bonds")])
        r = effects.read("Gain +2 dice on all climbing tests.")[0][1]
        self.assertEqual((r["target"], r.get("spec"), r.get("switch"), r.get("confidence")), ("skill:athletics", "Climbing", None, None))
        r = effects.read("Gain +1 die on Zapping tests while in the Matrix.")
        self.assertEqual(r, [])  # (no vocabulary target: nothing)
        r = effects.read("Gain +1 Perception while in the Matrix.")[0][1]
        self.assertEqual((r["switch"], r["when"], r.get("confidence")), ("conditional", "while in the matrix", None))
        self.assertEqual(fx("They suffer a -2 dice pool penalty to all tests involving one of the four physical attributes."),
                         [("test:physical", "add", "-2", None, None)])

    def test_spells_affect_their_target_or_caster(self):
        a = effects.read("The subject's Agility increases by 1 for each net hit.", "spells")[0][1]
        self.assertEqual((a["target"], a["value"], a["switch"], a["affects"]), ("attr:agi", "hits", "sustained", "target"))
        a = effects.read("You gain +2 Defense Rating.", "spells")[0][1]
        self.assertEqual((a["affects"], a["switch"]), ("caster", "sustained"))
        got = effects.read("Gain +1 Logic. The target gains +2 Charisma. They also gain +1 Willpower.", "spells")
        self.assertEqual([x[1]["affects"] for x in got], ["caster", "target", "target"])  # (no one named: the caster)

    def test_new_phrasings(self):
        self.assertEqual(sorted(fx("Strength and Agility are increased by 2.")), [("attr:agi", "add", "2", None, None), ("attr:str", "add", "2", None, None)])
        self.assertEqual(fx("It subtracts its rating from the threshold of Toxin Resistance tests."),
                         [("test:toxin-resistance", "threshold", "-R", None, None)])
        self.assertEqual(fx("You gain a Power Point."), [("derived:power-points", "add", "1", None, None)])
        self.assertEqual(fx("They receive the Magic attribute at 3."), [("attr:mag", "set", "3", None, None)])
        self.assertEqual(fx("The rating of the artificial skill equals the zapware rating."), [("skill:choice", "set", "R", None, None)])
        self.assertEqual(fx("Its claw gains +1 to its Damage Value and +2 to its Attack Rating.", "weapons"),
                         [("item:dv", "add", "1", None, None), ("item:ar", "add", "2", None, None)])
        self.assertEqual(fx("Reduce the Handling of the vehicle by the system's rating.", "gear"), [("item:handling", "add", "-R", None, None)])
        self.assertEqual({a.get("affects") for t, a, _ in effects.read("Hearing tests to listen for your passage cannot gain or spend Edge.") if t == "effect"}, {"others"})  # (others' tests: kept as theirs)
        self.assertEqual(fx("Edge Boosts cost 1 less in cybercombat.")[0][:3], ("skill:cracking", "edge-cost", "-1"))

    def test_section_statements_base_items_and_variant_paragraphs(self):
        files = {"augmentations.xml": '<sr6:data kind="augmentations">\n'
                 '  <augmentation id="zap-arm" source="X" page="1" type="cyberware"><name>Zap Arm</name></augmentation>\n'
                 '  <augmentation id="zap-foot" source="X" page="1" type="cyberware"><name>Zap Foot</name></augmentation>\n'
                 '  <augmentation id="gills" source="X" page="2" type="bioware"><name>Gills</name></augmentation>\n'
                 '  <augmentation id="tg-gills" source="X" page="3" type="bioware" essence="fifty percent more Essence than the base item"><name>Transgenic gills</name></augmentation>\n'
                 '  <augmentation id="glow-a" source="X" page="4" type="bioware"><name>Glowbugs (Amber)</name></augmentation>\n'
                 '  <augmentation id="glow-b" source="X" page="4" type="bioware"><name>Glowbugs (Blue)</name></augmentation>\n</sr6:data>\n'}
        texts = ('<sr6:data kind="texts">\n  <text of="augmentations" id="gills">You gain +1 Athletics.</text>\n'
                 '  <text of="augmentations" id="zap-foot">This zap foot does not add a box to the Physical Condition Monitor.</text>\n'
                 '  <text of="augmentations" id="glow-a">Glowbugs live in you.\n**Amber:** You gain +1 Charisma.\n**Blue:** You gain +1 Logic.</text>\n</sr6:data>\n')
        regrouped = ('<!-- section {"name": "Zap Limbs", "section": "Zap Limbs"} -->\nEach zap limb adds one box to the character\'s Physical '
                     'Condition Monitor.\n<!-- end -->\n<!-- item {"name": "Zap Arm", "section": "Zap Limbs"} -->\n<!-- end -->\n'
                     '<!-- item {"name": "Zap Foot", "section": "Zap Limbs"} -->\n<!-- end -->\n')
        out, _ = effects.apply(files, texts, regrouped)
        x = out["augmentations.xml"]
        self.assertIn('<name>Zap Arm</name><effect target="derived:physical-monitor" op="add" value="1"/>', x)
        self.assertNotIn('<name>Zap Foot</name><effect', x)  # (its own text excepts it)
        self.assertIn('<name>Transgenic gills</name><link rel="as" kind="augmentations" name="gills" ref="gills"/>', x)
        self.assertIn('<name>Glowbugs (Amber)</name><effect target="attr:cha" op="add" value="1"/></augmentation>', x)

    def test_an_item_described_under_a_rule_named_for_it(self):
        files = {"gear.xml": '<sr6:data kind="gear">\n  <gear id="zaplink" source="X" page="1"><name>Zaplink</name></gear>\n'
                             '  <gear id="tails" source="X" page="2"><name>Zap-by-wire system (Rating 2)</name></gear>\n</sr6:data>\n',
                 "rules.xml": '<sr6:data kind="rules">\n  <rule id="r1" source="X" page="1"><name>Zaplink Upgrade</name></rule>\n'
                              '  <rule id="r2" source="X" page="2"><name>Zap-By-Wire (Rating 1-2)</name></rule>\n</sr6:data>\n'}
        texts = ('<sr6:data kind="texts">\n  <text of="rules" id="r1">The Firewall is increased by the rating.</text>\n'
                 '  <text of="rules" id="r2">Each rating point adds +1 Reaction.</text>\n</sr6:data>\n')
        out, _ = effects.apply(files, texts, "")
        self.assertIn('<name>Zaplink</name><effect target="matrix:firewall" op="add" value="R"/>', out["gear.xml"])
        self.assertIn('<name>Zap-by-wire system (Rating 2)</name><effect target="attr:rea" op="add" value="R"/>', out["gear.xml"])

    def test_an_autosoft_named_for_a_skill_and_a_makers_standard_add_on(self):
        files = {"programs.xml": '<sr6:data kind="programs">\n  <program id="p1" source="X" page="1" type="autosoft"><name>Close Combat</name></program>\n</sr6:data>\n',
                 "weapons.xml": '<sr6:data kind="weapons">\n  <weapon id="w1" source="X" page="2"><name>Zapco proprietary laser sight</name></weapon>\n</sr6:data>\n'}
        out, _ = effects.apply(files, "", "")
        self.assertIn('<effect target="skill:close-combat" op="set" value="R"/>', out["programs.xml"])
        self.assertIn('<link rel="as" kind="weapons" name="Laser sight"/>', out["weapons.xml"])

    def test_tests_linked_to_an_attribute_and_two_bonuses_in_a_sentence(self):
        self.assertEqual(fx("It grants a +1 dice pool modifier to skill tests that are linked to Reaction as well as a +1 dice pool modifier to all Defense tests."),
                         [("test:attr-rea", "add", "1", None, None), ("test:defense", "add", "1", None, None)])

    def test_a_listed_labels_remainder_is_its_own(self):
        regrouped = ('<!-- section {"name": "Zaps"} -->\n**Alpha Zap:** First lines of alpha.\n**Beta Zap:** First lines of beta.\n\n'
                     'The rest of alpha: +1 Logic.\n• **Overdrive:** +1 more.\n**Beta Zap:** First lines of beta, again.\n<!-- end -->\n')
        alpha = max((p for _, p in effects._runins(regrouped)["alpha zap"]), key=len)
        self.assertIn("The rest of alpha: +1 Logic. Overdrive: +1 more.", alpha)

class RoundThreeTest(unittest.TestCase):
    """The reader's third round (feat/sr6-effects-2): the phrasings Commlink6 had and we missed, read by general rules."""

    def test_chosen_targets_maxima_and_actions(self):
        self.assertEqual(fx("Specify a physical attribute when you select this power. You gain a +1 bonus to this attribute for each level of this power while in animal form."),
                         [("attr:choice", "add", "R", "conditional", "while in animal form")])
        self.assertEqual(fx("The chosen Matrix attribute is increased by the quality's level."), [("matrix:choice", "add", "R", None, None)])
        self.assertEqual(fx("Your skill maximum for the selected skill is 10, instead of 9."), [("skill-max:choice", "set", "10", None, None)])
        self.assertEqual(fx("Either the metatype maximum of one chosen Physical or Mental attribute is raised by one point or the maximum rating that can be obtained in a skill is increased by one point."),
                         [("attr-max:choice", "add", "1", None, None), ("skill-max:choice", "add", "1", None, None)])
        self.assertEqual(fx("It allows the user to use the Move and Avoid Incoming Minor Actions an additional time per combat round per rating point."),
                         [("derived:minor-actions", "add", "R", None, "move and avoid incoming")])
        self.assertEqual(fx("Each point of zap rating grants +2 Reaction and an additional two Minor Actions per round that can only be spent on moving."),
                         [("derived:minor-actions", "add", "R*2", None, None), ("attr:rea", "add", "R*2", None, None)])
        self.assertEqual(fx("When using Called Shot—Disarm, reduce either the Edge cost (if spending Edge) or the dice pool penalty by 1."),
                         [("action:called-shot-disarm", "edge-cost", "-1", None, None)])
        self.assertEqual(fx("Gain bonus dice on a hacking action: Brute Force, Probe, or Backdoor Entry.", "datastructures"),
                         [("action:brute-force", "add", "R", "activated", None), ("action:probe", "add", "R", "activated", None), ("action:backdoor-entry", "add", "R", "activated", None)])
        self.assertEqual(fx("Gain bonus dice on a Snoop action or Static Veil complex form.", "datastructures"),  # (activated with a Minor Action)
                         [("action:snoop", "add", "R", "activated", None), ("complex-form:static-veil", "add", "R", "activated", None)])

    def test_items_modes_costs_and_formulas(self):
        self.assertEqual(fx("It decreases the Semi-Auto and Burst Fire Attack Rating modifiers by 1.", "weapons"), [("item:ar", "add", "1", None, "semi-auto, burst fire")])
        self.assertEqual(fx("Improved zapping subtracts its rating directly from the base Handling stat of the vehicle.", "gear"), [("item:handling", "add", "-R", None, None)])
        self.assertEqual(fx("Each rating point permanently moves one point of the off-road Handling to the on-road Handling number.", "gear"), [("item:handling", "add", "R/-R", None, None)])
        self.assertEqual(fx("Each rating point adds 20 percent to the base Top Speed number.", "gear"), [("item:top-speed", "add", "20%", None, None)])
        self.assertEqual(fx("The pack holds a 1,000-round belt for the gun it feeds.", "weapons"), [("item:ammo", "set", "1000", None, None)])
        self.assertEqual(fx("Characters with this quality pay quality level x 500 nuyen per month in medication."), [("derived:monthly-cost", "add", "R*500", None, None)])
        self.assertEqual(fx("Your lifestyle cost increases by 1,000 nuyen per month."), [("derived:monthly-cost", "add", "1000", None, None)])
        self.assertEqual(fx("It increases the cost of all armor and clothing by ten percent."), [("pricemod:armor", "add", "0.1", None, None)])
        self.assertEqual(fx("You get a 25 percent boost in Lifestyle costs."), [("pricemod:lifestyle", "add", "0.25", None, None)])
        self.assertEqual(fx("Gain Mystic Armor equal to your Edge rating.", "critterpowers"), [("derived:defense-astral", "add", "edg", None, None)])
        self.assertEqual(fx("Increase your dracoform Armor or Mystic Armor by half your Edge score (rounded down).", "critterpowers"),
                         [("derived:defense", "add", "edg/2 RD", None, None), ("derived:defense-astral", "add", "edg/2 RD", None, None)])
        self.assertEqual(fx("With each point of this mod taken, the passenger capacity of the vehicle is increased by one seat.", "gear"), [("item:seats", "add", "R", None, None)])
        self.assertEqual(fx("This codemod increases the reaction speed of the AI. Add +1 initiative and 1 additional initiative dice per point of rating, up to the normal maximum of 5 dice.", "gear"),
                         [("derived:matrix-initiative-dice", "add", "R", None, None), ("derived:matrix-initiative", "add", "R", None, None)])

    def test_edge_wild_dice_skills_and_senses(self):
        self.assertEqual(fx("When performing a Juryrigging test (see p. 95), you gain a point of Edge that must be spent on that test, or it goes away."),
                         [("skill:engineering", "edge", "1", "conditional", "juryrigging")])
        self.assertEqual(fx("You gain a bonus Edge for use on any Magic Resistance test; if you do not use it on that test, that point goes away."),
                         [("test:magic-resistance", "edge", "1", None, None)])
        self.assertEqual(fx("You gain one bonus point of Edge when making Perception tests to recognize people.")[0][3], "conditional")  # (a limit stays)
        self.assertEqual(fx("Users gain Edge when searching for items that glow in black light (body fluids, many kinds of critters).", "augmentations"),
                         [("skill:perception", "edge", "1", "conditional", "searching for items that glow in black light")])
        self.assertEqual(fx("All zapears provide a bonus Edge vs. a target who has something interfering with their hearing.", "augmentations")[0][:2], ("skill:perception", "edge"))
        self.assertEqual(fx("You gain the Kiezspeak (N) language skill at no cost plus a bonus point of Edge on any social test with activists."),
                         [("test:social", "edge", "1", None, None), ("skill:language", "set", "N", None, None)])
        self.assertEqual(fx("You gain the knowledge skill Dragon Lore, which is not normally otherwise available."), [("skill:knowledge", "add", "1", None, None)])
        self.assertEqual(effects.read("You gain the knowledge skill Dragon Lore.")[0][1]["spec"], "Dragon Lore")
        self.assertEqual(fx("You may add your ranks in Con to your dice pool on a Judge Intentions test—if you do, you must replace one of the dice with a Wild Die.")[0][:3],
                         ("derived:judge-intentions", "wild-die", "1"))
        self.assertEqual(fx("Whenever you are affected by noise, reduce the cost of any Edge boosts or actions by 1 (to a minimum of 1)."),
                         [("test:all", "edge-cost", "-1", "conditional", "whenever you are affected by noise")])
        self.assertEqual(effects.read("You may not spend Edge on any Influence (Etiquette or Negotiation) test.")[0][1]["spec"], "Etiquette, Negotiation")
        self.assertEqual(fx("Failure means you cannot earn or spend Edge until you succeed."), [("test:all", "no-edge-gain", "1", "conditional", "until you succeed"), ("test:all", "no-edge", "1", "conditional", "until you succeed")])
        self.assertEqual(fx("It tracks how long until my wife gets home from work. It lowers the cost of Edge boosts by 1 for Cracking tests."), [("skill:cracking", "edge-cost", "-1", None, None)])
        self.assertEqual(fx("When your chase pool (see p. 175) becomes available, it begins with 1 Edge in it."), [("pool:chase", "add", "1", None, None)])
        self.assertEqual(fx("Dwarfs have thermographic vision (p. 73)."), [("sense:thermographic-vision", "add", "1", None, None)])
        self.assertEqual(fx("The light allows persons with low-light vision to see for twenty meters in total darkness."), [])

    def test_per_hit_effects_and_spell_defense(self):
        self.assertEqual(fx("Net hits on the Spellcasting test are added to the subject's Defense Rating and dice pool for Surprise tests as long as the spell is sustained.", "spells"),
                         [("derived:defense", "add", "hits", "sustained", None), ("test:surprise", "add", "hits", "sustained", None)])
        self.assertEqual(fx("Make an Electronics + Resonance test. Each hit increases the target's Overwatch Score by 1.", "complexforms"),
                         [("matrix:overwatch", "add", "hits", "sustained", None)])
        self.assertEqual(fx("Each net hit increases (attribute) by 1 up to twice the target's normal rating.", "complexforms"), [("matrix:choice", "add", "hits", "sustained", None)])
        self.assertEqual(fx("Gain a point of Edge when targeted by spells.", "adeptpowers"), [("test:magic-resistance", "edge", "1", None, None)])

    def test_owner_decisions_of_2026_10_11(self):
        # a level after the first: R-1 on the tests the sentence before named
        self.assertEqual(fx("The first level lowers the cost of Edge Boosts by one on Stealth (Palming) tests. Each level after the first one grants a +1 dice pool modifier for such tests.", "adeptpowers"),
                         [("skill:stealth", "edge-cost", "-1", None, None), ("skill:stealth", "add", "R-1", None, None)])
        self.assertEqual(fx("The zap reducer increases the maximum dice pool bonus for Take Aim (p. 42, SR6) by its rating.", "augmentations"),
                         [("action-max:take-aim", "add", "R", None, None)])
        self.assertEqual(fx("They are more resistant to ingested poisons and toxins, gaining +1 Edge on tests to resist."),
                         [("test:toxin-resistance", "edge", "1", "conditional", "ingested poisons and toxins")])
        self.assertEqual(fx("Note: The short mod removes the longest-range Attack Rating available for the weapon, and alters the AR as follows: +2/+1/–2/–/–.", "weapons"),
                         [("item:ar", "add", "2,1,-2,0,x", None, None)])
        self.assertEqual(fx("Once activated, roll dice. Each hit temporarily boosts the rating of the designated attribute by 1.", "gear"),
                         [("attr:choice", "add", "hits", "activated", None)])

    def test_owner_decisions_8_to_13(self):
        self.assertEqual(fx("Zap commlinks have a device rating 1, Data Processing 1, and Firewall 2. Its Firewall attribute is cumulative with other devices.", "weapons"),
                         [("matrix:firewall", "add", "2", None, None)])
        self.assertEqual(fx("This modification offers a bonus Edge if the opposition doesn't have a vision enhancement to mitigate glare.", "gear"),
                         [("test:other", "edge", "1", "conditional", "if the opposition doesn't have a vision enhancement")])
        self.assertEqual(fx("Increase your dracoform Armor by half your Edge score (rounded down).", "critterpowers"), [("derived:defense", "add", "edg/2 RD", None, None)])
        self.assertEqual(fx("Gain Armor equal to half your Edge.", "critterpowers")[0][2], "edg/2 RU")  # (silent: round up)
        self.assertEqual(fx("Toughskin grants +1 Defense Rating for every two points of nanite volume.", "gear"),
                         [("derived:defense", "add", "nanite-volume/2 RU", "conditional", "per point of nanite volume")])
        intro = "Rockets fly. Missiles are rockets with sensor packages adding their rating to the attack roll. All rockets and missiles have a wireless feature: +1 Attack Rating."
        self.assertEqual([(a["target"], a["value"]) for _, a, _ in effects.section_effects(intro, "", "Missile Variant", "weapons", "Rockets and Missiles")],
                         [("test:combat", "R"), ("item:ar", "1")])
        self.assertEqual([(a["target"], a["value"]) for _, a, _ in effects.section_effects(intro, "", "Gas Rocket", "weapons", "Rockets and Missiles")], [("item:ar", "1")])

    def test_owner_decisions_16_and_17(self):
        # what others get against the entry: kept, affects="others"; an `after …` clause: a condition
        got = [(a["target"], a["op"], a["value"], a.get("affects")) for t, a, _ in effects.read("Users of the drug grant 2 Edge when resisting a Con (Seduction) test.", "gear") if t == "effect"]
        self.assertEqual(got, [("skill:con", "edge", "2", "others")])
        got = [(a["target"], a.get("affects")) for t, a, _ in effects.read("Those looking for you gain a bonus Edge on Perception tests. You gain +1 Stealth.", "qualities") if t == "effect"]
        self.assertEqual(got, [("skill:perception", "others"), ("skill:stealth", None)])
        self.assertEqual(fx("You cannot spend or earn Edge for twenty-four hours after you break a tenet of your code.")[0][3:], ("conditional", "after you break a tenet of your code"))

    def test_rows_under_a_group_header_read_their_own_paragraph_and_a_transgenic_links_to_each(self):
        files = {"augmentations.xml": '<sr6:data kind="augmentations">\n'
                 '  <augmentation id="zz-basic" source="X" page="1" type="bioware" group="Zapsense"><name>Basic</name></augmentation>\n'
                 '  <augmentation id="zz-tactical" source="X" page="1" type="bioware" group="Zapsense" rating="1–3"><name>Tactical</name></augmentation>\n'
                 '  <augmentation id="tg" source="X" page="2" type="bioware" essence="fifty percent more Essence than the base item"><name>Transgenic zapsense</name></augmentation>\n</sr6:data>\n'}
        shared = ('Two versions exist. **Basic:** Gain an Edge before making Surprise tests. **Tactical:** Gain a +1 dice pool bonus per rating on any defensive tests.')
        texts = (f'<sr6:data kind="texts">\n  <text of="augmentations" id="zz-basic">{shared}</text>\n  <text of="augmentations" id="zz-tactical">{shared}</text>\n</sr6:data>\n')
        out, _ = effects.apply(files, texts, "")
        x = out["augmentations.xml"]
        self.assertIn('<name>Basic</name><effect target="test:surprise" op="edge" value="1"/></augmentation>', x)
        self.assertIn('<name>Tactical</name><effect target="test:defense" op="add" value="R"/></augmentation>', x)
        self.assertIn('<name>Transgenic zapsense</name><link rel="as" kind="augmentations" name="Zapsense: Basic" ref="zz-basic"/><link rel="as" kind="augmentations" name="Zapsense: Tactical" ref="zz-tactical"/>', x)

    def test_variant_rows_take_their_parents_sentences_and_resolve_its_choice(self):
        files = {"gear.xml": '<sr6:data kind="gear">\n  <gear id="zb" source="X" page="1"><name>Zapjack Boosters</name></gear>\n'
                             '  <gear id="zb-f1" source="X" page="2" rating="1"><name>Zapjack Boosters (Firewall) (Rating 1)</name></gear>\n'
                             '  <gear id="zb-i1" source="X" page="2" rating="1"><name>Zapjack Boosters (Matrix Initiative) (Rating 1)</name></gear>\n'
                             '  <gear id="ks" source="X" page="3" rating="1–6"><name>Knowsofts</name></gear>\n</sr6:data>\n',
                 "qualities.xml": '<sr6:data kind="qualities">\n  <quality id="llv" source="X" page="4"><name>Low-Light Vision</name></quality>\n'
                                  '  <quality id="es" source="X" page="4"><name>Enhanced Senses (Thermographic)</name></quality>\n</sr6:data>\n',
                 "ammotypes.xml": '<sr6:data kind="ammotypes">\n  <ammotype id="zap" source="X" page="5" ar="+1" dv="–1S(e)"><name>Zap-n-Shock</name></ammotype>\n</sr6:data>\n'}
        texts = ('<sr6:data kind="texts">\n  <text of="gear" id="zb">A Data Processing or Firewall zapjack booster improves that Matrix attribute by its rating. '
                 'A Matrix Initiative booster adds its rating in additional initiative dice when in VR, up to a maximum of five initiative dice.</text>\n</sr6:data>\n')
        out, _ = effects.apply(files, texts, "")
        g = out["gear.xml"]
        self.assertIn('<name>Zapjack Boosters (Firewall) (Rating 1)</name><effect target="matrix:firewall" op="add" value="R"/></gear>', g)
        self.assertIn('<name>Zapjack Boosters (Matrix Initiative) (Rating 1)</name><effect target="derived:matrix-initiative-dice" op="add" value="R" switch="conditional" when="when in vr"/></gear>', g)
        self.assertIn('<name>Knowsofts</name><effect target="skill:knowledge" op="set" value="R"/>', g)
        self.assertIn('<name>Low-Light Vision</name><effect target="sense:low-light-vision" op="add" value="1"/>', out["qualities.xml"])
        self.assertIn('<name>Enhanced Senses (Thermographic)</name><effect target="sense:thermographic-vision" op="add" value="1"/>', out["qualities.xml"])
        self.assertIn('<effect target="item:ar" op="add" value="1,1,1,1,1"/><effect target="item:dv" op="add" value="-1"/>', out["ammotypes.xml"])


class RegroupTest(unittest.TestCase):
    def test_part_headings_and_page_break_continuations(self):
        md = """<!-- page 10 -->
# MAGIC
## Mentor Spirits
#### Glow Owl
The glow owl watches.
##### Advantages
**All:** Edge Boosts cost 1 less for Perception tests
##### Disadvantages
You hoot.
#### Glow Cat
The glow cat naps.
##### Advantages
**All:** a bonus
##### Disadvantages
You nap.
#### Glow Bat
The glow bat flaps.
##### Advantages
**All:** a bonus
##### Disadvantages
You flap.
# GEAR
## Gizmos
| GIZMO | COST |
|---|---|
| Zap Jack | 100 |
#### Zap Jack
A zap jack boosts your gear, and it is built into a
<!-- page 11 -->
#### Critical Gizmo Parts
| PART | COST |
|---|---|
| Core | 5 |
commlink case. A zap jack adds its rating to your Firewall.
"""
        text, _ = regroup.regroup(md)
        b = {x.name: x for x in regroup.blocks(text)}
        self.assertNotIn("Advantages", b)  # part of the mentor spirit
        self.assertIn("Edge Boosts cost 1 less for Perception tests", b["Glow Owl"].text + str(b["Glow Owl"].labels))
        self.assertIn("You hoot.", b["Glow Owl"].text)
        self.assertIn("A zap jack adds its rating to your Firewall.", b["Zap Jack"].text)
        self.assertNotIn("zap jack adds", b["Critical Gizmo Parts"].text)


if __name__ == "__main__":
    unittest.main()
