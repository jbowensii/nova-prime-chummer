"""Fitting a sample runner's priorities (importer/sr6/fit.py) on invented priority rows, settings and builds: the letter
assignment that overspends least, adjustment points to Magic and Edge first, the cheapest ranks to karma, nuyen past the
resources bought with karma. Every number is made up."""

import unittest

from importer.sr6 import fit

CS = {
    "startingKarma": 30.0,
    "karmaAttrPerRank": 4.0,
    "karmaSkillPerRank": 3.0,
    "karmaSpec": 6.0,
    "skillPointsSpec": 1.0,
    "freeSpellsPerMagic": 1.0,
    "freeFormsPerResonance": 1.0,
    "karmaSpell": 2.0,
    "karmaForm": 2.0,
    "karmaToNuyenRate": 100.0,
    "karmaToNuyenRateInDebt": 300.0,
}
ROWS = {
    "A": {"metas": {"gnoll": 7}, "attributes": 9, "skills": 9, "magic": {"full": 3}, "nuyen": 900},
    "B": {"metas": {"gnoll": 5, "pixie": 5}, "attributes": 7, "skills": 7, "magic": {"full": 2}, "nuyen": 700},
    "C": {"metas": {"gnoll": 3, "pixie": 3}, "attributes": 5, "skills": 5, "magic": {"full": 1}, "nuyen": 500},
    "D": {"metas": {"pixie": 2}, "attributes": 3, "skills": 3, "magic": {}, "nuyen": 300},
    "E": {"metas": {"pixie": 1}, "attributes": 1, "skills": 1, "magic": {}, "nuyen": 100},
}


def need(**kw):
    base = {
        "meta": "Pixie",
        "raised": set(),
        "magic": "mundane",
        "attrs": {k: 1 for k in fit.CORE} | {"edg": 1},
        "skills": [],
        "karma": 0,
        "neg": 0,
        "spells": 0,
        "forms": 0,
        "pp": 0,
        "nuyen": 0,
        "debt": False,
        "left": None,
    }
    return base | kw


class FitTest(unittest.TestCase):
    def test_value_reads_as_the_app(self):
        self.assertEqual(
            [fit.value(v, 3) for v in ("Rating x 50", ".5", "(Rating/2)", "7(L)", "—", "40/60", "lots")],
            [150, 0.5, 2, 7, None, None, None],
        )
        # values.ts rated(): a unit price's "each" is the price of one; a value past 100 characters isn't read
        self.assertEqual([fit.value("1500 each"), fit.value("5 " * 60)], [1500, None])

    def test_the_letters_that_overspend_least(self):
        """A mundane pixie with 6 attribute ranks, 4 skill ranks and 650 nuyen of things: the karma covers what the rows
        don't (nothing left over), and of the assignments that overspend nothing the one leaving the printed 50 nuyen wins
        (the first in letter order on a tie)."""
        n = need(attrs={**{k: 1 for k in fit.CORE}, "bod": 4, "agi": 4, "edg": 1}, skills=[(4, 0)], nuyen=650, left=50)
        got = fit.fit(n, ROWS, CS)
        self.assertEqual(
            got["letters"], {"metatype": "B", "attributes": "A", "magic": "C", "skills": "D", "resources": "E"}
        )
        self.assertEqual((got["attrs"]["bod"], got["attrs"]["agi"], got["skills"]), ([3, 0, 0], [3, 0, 0], [(3, 1)]))
        self.assertEqual((got["karmaToNuyen"], got["nuyenLeft"]), (6, 50))  # 100 + 6 × 100 − 650
        self.assertEqual(
            fit.fit({**n, "debt": True}, ROWS, CS)["karmaToNuyen"], 2
        )  # In Debt's rate: 100 + 2 × 300 − 650
        self.assertIsNone(fit.fit({**n, "meta": "Wyrm"}, ROWS, CS))  # a metatype no row lists

    def test_magic_and_edge_take_adjustment_points_then_the_raised_maximums(self):
        """A full magician gnoll: Magic above its priority rating and Edge on the 3 adjustment points (C), Magic first;
        what's left over is karma; the raised BOD gets none; a priority Magic above the printed one can't be."""
        n = need(
            meta="Gnoll", magic="full", raised={"bod"}, attrs={**{k: 1 for k in fit.CORE}, "bod": 3, "edg": 3, "mag": 4}
        )
        rows = {c: {**ROWS[L], "letter": L} for c, L in zip(fit.COLUMNS, "CDABE")}
        score, got = fit.spend(n, rows, CS)
        self.assertEqual(
            (got["attrs"]["mag"], got["attrs"]["edg"], got["attrs"]["bod"]), ([0, 1, 0], [0, 2, 0], [2, 0, 0])
        )
        rows["magic"] = {**ROWS["A"], "letter": "A"}  # Magic 3 from A: 1 rank to adjust, then Edge 2
        self.assertIsNone(fit.spend({**n, "attrs": {**n["attrs"], "mag": 2}}, rows, CS))
        self.assertEqual(
            fit.spend({**n, "attrs": {**n["attrs"], "mag": 2}, "loss": 1}, rows, CS)[1]["attrs"]["mag"], [0, 0, 0]
        )

    def test_raised_maximums_of_the_same_value_split_the_same_way_every_run(self):
        """Two raised attributes printed the same: the adjustment points go to the first in the attributes' order,
        whatever order the set gives them in (it changes from run to run)."""
        a = {**{k: 1 for k in fit.CORE}, "bod": 5, "str": 5}
        rows = {c: {**ROWS[L], "letter": L} for c, L in zip(fit.COLUMNS, "CDABE")}
        got = [
            fit.spend(need(meta="Gnoll", raised=r, attrs=a), rows, CS)[1]["attrs"]
            for r in (["str", "bod"], ["bod", "str"])
        ]
        self.assertEqual(got[0], got[1])
        self.assertEqual((got[0]["bod"][1], got[0]["str"][1]), (3, 0))

    def test_past_the_pools_the_cheapest_ranks_are_karma(self):
        """2 attribute points for 4 ranks: the karma goes on the lowest ratings (CHA 2, then LOG 2), each rank its rating
        times the per-rank price; a skill past its points likewise; a specialization takes a skill point left over, else
        karma (never a rank moved to karma to make room: a rank costs at least as much)."""
        n = need(attrs={**{k: 1 for k in fit.CORE}, "bod": 3, "log": 2, "cha": 2}, skills=[(3, 1), (1, 1)])
        rows = {c: {"metas": {"pixie": 1}, "attributes": 2, "skills": 3, "letter": "Z"} for c in fit.COLUMNS}
        score, got = fit.spend(n, rows, CS)
        self.assertEqual(
            (got["attrs"]["bod"], got["attrs"]["log"], got["attrs"]["cha"]), ([2, 0, 0], [0, 0, 1], [0, 0, 1])
        )
        self.assertEqual(got["skills"], [(3, 0), (0, 1)])  # 3 points for 4 ranks: the rank-1 skill to karma, none left
        self.assertEqual(score[1], 1)  # LOG 2×4 + CHA 2×4 + the rank-1 skill 1×3 + both specs 2×6: 31, 1 past 30
        rows["skills"] = {
            **rows["skills"],
            "skills": 5,
        }  # 5 points: both ranks, then the first spec; the second has none
        self.assertEqual(fit.spend(n, rows, CS)[1]["skills"], [(3, 0), (1, 0)])
        self.assertEqual(fit.spend(n, rows, CS)[0][1], 0)  # 16 + one spec 6: 22

    def test_sum_to_ten_when_no_priority_assignment_fits(self):
        """Letters may repeat under Sum-to-Ten (values from the settings, adding up to at most the target): taken only when
        every priority assignment overspends and it overspends less; the build says which method."""
        n = need(attrs={**{k: 1 for k in fit.CORE}, "bod": 5, "agi": 5, "rea": 3}, skills=[(5, 0), (5, 0)])
        s10 = {
            **CS,
            "sumToTenTarget": 10.0,
            **{f"letterValue:{L}": v for L, v in zip("ABCDE", (4.0, 3.0, 2.0, 1.0, 0.0))},
        }
        self.assertEqual(fit.fit(n, ROWS, CS)["method"], "priority")  # no Sum-to-Ten settings: priority only
        got = fit.fit(n, ROWS, s10)
        self.assertEqual(
            (got["method"], got["letters"]["attributes"], got["letters"]["skills"]), ("sumtoten", "A", "A")
        )
        self.assertEqual(
            fit.fit(need(skills=[(1, 0)]), ROWS, s10)["method"], "priority"
        )  # one that fits stays priority

    def test_sum_to_ten_when_the_priorities_leave_karma_past_the_limit(self):
        """(owner, 2026-10-19) A gnoll magician that every priority assignment leaves 22 Karma past spending (5 carry
        over): Sum-to-Ten's C C C for attributes, magic and skills spends all but 4."""
        lim = {**CS, "maxKarmaLeft": 5.0, "maxNuyenLeft": 50.0}
        s10 = {
            **lim,
            "sumToTenTarget": 10.0,
            **{f"letterValue:{L}": v for L, v in zip("ABCDE", (4.0, 3.0, 2.0, 1.0, 0.0))},
        }
        n = need(meta="Gnoll", magic="full", attrs={**{k: 1 for k in fit.CORE}, "mag": 1}, skills=[(6, 0)], nuyen=900)
        self.assertEqual((fit.fit(n, ROWS, lim)["method"], fit.fit(n, ROWS, lim)["karmaLeft"]), ("priority", 22))
        got = fit.fit(n, ROWS, s10)
        self.assertEqual((got["method"], got["karmaLeft"], got["over"]), ("sumtoten", 4, 0))
        self.assertEqual([got["letters"][c] for c in ("attributes", "magic", "skills")], ["C", "C", "C"])

    def test_spells_past_the_free_ones(self):
        """Magic 2 (B) frees 2 spells: 3 printed leaves 1 past them, bought with karma (extraMagic: the importer then
        assumes the optional rule, CRB p.66)."""
        n = need(meta="Gnoll", magic="full", attrs={**{k: 1 for k in fit.CORE}, "mag": 2}, spells=3)
        rows = {c: {**ROWS[L], "letter": L} for c, L in zip(fit.COLUMNS, "CABDE")}
        self.assertEqual(fit.spend(n, rows, CS)[1]["extraMagic"], 1)
        self.assertEqual(fit.spend({**n, "spells": 2}, rows, CS)[1]["extraMagic"], 0)

    def test_a_mystic_adepts_free_spells_are_the_magic_its_power_points_leave(self):
        """Magic 3 (A), powers costing 1.25 points: 2 whole points bought, 1 point of Magic frees 1 spell; 3 printed
        leave 2 past it (magic.ts freeSpellSlots). The runner says what it bought (powerPointsBought)."""
        rows = {c: {**ROWS[L], "letter": L} for c, L in zip(fit.COLUMNS, "CABDE")}
        rows["magic"] = {**rows["magic"], "magic": {"mystic-adept": 3}}
        n = need(meta="Gnoll", magic="mystic-adept", attrs={**{k: 1 for k in fit.CORE}, "mag": 3}, spells=3, pp=1.25)
        got = fit.spend(n, rows, CS)[1]
        self.assertEqual((got["powerPointsBought"], got["extraMagic"]), (2, 2))
        self.assertEqual(
            fit.spend({**n, "magic": "full"}, {**rows, "magic": {**rows["magic"], "magic": {"full": 3}}}, CS)[1][
                "extraMagic"
            ],
            0,
        )  # a magician's powers buy nothing: 3 free

    def test_no_karma_to_nuyen_rate_turns_none(self):
        """A karmaToNuyenRate of 0 (a house rule): no karma becomes nuyen, and nuyen past its carry-over limit is no
        division by zero."""
        rows = {c: {**ROWS[L], "letter": L} for c, L in zip(fit.COLUMNS, "BACDE")}
        got = fit.spend(need(), rows, {**CS, "karmaToNuyenRate": 0.0, "maxNuyenLeft": 50.0})[1]
        self.assertEqual(got["karmaToNuyen"], 0)

    def test_karma_into_nuyen_past_what_the_gear_needs(self):
        """Karma left over turns into nuyen when that clears the Karma carry-over limit with the nuyen within its own;
        otherwise the count that leaves the printed nuyen; never nuyen below 0 by choice."""
        rows = {c: {**ROWS[L], "letter": L} for c, L in zip(fit.COLUMNS, "BACDE")}  # resources E: 100
        n = need(nuyen=250, left=50)  # 2 karma cover it; 28 left
        cs = {**CS, "maxKarmaLeft": 5.0, "maxNuyenLeft": 3000.0}
        self.assertEqual(fit.spend(n, rows, CS)[1]["karmaToNuyen"], 2)  # no limits: the printed 50 left
        score, got = fit.spend(n, rows, cs)
        self.assertEqual((got["karmaToNuyen"], got["nuyenLeft"], got["karmaLeft"]), (25, 2350, 5))  # both within
        self.assertEqual(score[2:], (0, 2300, 0))
        score, got = fit.spend(n, rows, {**cs, "maxNuyenLeft": 500.0})  # 25 would leave 2,350: can't clear the Karma's
        self.assertEqual((got["karmaToNuyen"], score[2], score[4]), (2, 1, 23))  # so the printed 50; 23 past 5
        broke = need(nuyen=100 + 40 * 100)  # needs 40 karma, has 30: all of it short, never nuyen below 0 by choice
        self.assertEqual(fit.spend(broke, rows, cs)[1]["karmaToNuyen"], 40)

    def test_an_expertise_takes_a_skill_point_left_else_karma(self):
        """An expertise takes skillPointsExpertise points still left (budgets.ts skillSpend), else its advancement Karma."""
        cs = {**CS, "skillPointsExpertise": 1.0, "advance.expertise": 5.0}
        rows = {c: {"metas": {"pixie": 1}, "attributes": 0, "skills": 5, "letter": "Z"} for c in fit.COLUMNS}
        n = need(skills=[(3, 1, 1)])
        self.assertEqual(fit.spend(n, rows, cs)[1]["karmaLeft"], 30)  # 3 ranks + spec + expertise: 5 points
        rows["skills"] = {**rows["skills"], "skills": 4}
        self.assertEqual(fit.spend(n, rows, cs)[1]["karmaLeft"], 25)  # no point left for it: 5 Karma

    def test_settings_resolved_as_the_app_does(self):
        """fit.resolve (creation.ts runnerRules): one level of play (a runner's own first), a nested rule whose parent is
        off left out, a level's values in place of the ones it replaces, a house rule's number (made-up values)."""
        cs = {
            "sumToTenTarget": 10.0,
            "levelStreet": "true",
            "levelSwcElite": "true",
            "swcElite.sumToTen": 12.0,
            "eliteSumToThirteen": "true",
            "twentyQuestionsKarma": 5.0,
            "maxKarmaLeft": 7.0,
            "blank": "",
        }
        got = fit.resolve(cs)
        self.assertNotIn("levelSwcElite", got)  # levelStreet is listed first
        self.assertEqual(
            (got["sumToTenTarget"], "eliteSumToThirteen" in got, "twentyQuestionsKarma" in got, "blank" in got),
            (10.0, False, False, False),
        )
        got = fit.resolve(cs, own={"levelSwcElite"})
        self.assertNotIn("levelStreet", got)
        self.assertEqual(got["sumToTenTarget"], 13.0)  # Elite's 12, then sum-to-thirteen
        got = fit.resolve(
            {
                **cs,
                "levelStreet": "false",
                "eliteSumToThirteen": "false",
                "ownCarryOver": "true",
                "carryOver.karma": 2.0,
            }
        )
        self.assertEqual((got["sumToTenTarget"], got["maxKarmaLeft"]), (12.0, 2.0))
