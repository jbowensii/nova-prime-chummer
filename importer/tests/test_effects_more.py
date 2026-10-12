"""More of Anarchy's effects reader (importer/effects.py): a text param taken from the sentence that states the effect,
a bare disadvantage, the same vision twice. Made-up sentences in the books' phrasing."""
import unittest

from importer import effects as fx
from importer.tests.test_effects import kinds


class PieceTest(unittest.TestCase):
    def test_the_text_param_is_the_sentence_that_matches(self):
        self.assertEqual(fx._piece("Alpha beta. Ignores the glare Disadvantage.", fx._NO_DIS), "Ignores the glare Disadvantage")
        self.assertEqual(kinds("It is fine. Ignores the glare Disadvantage.")[0][:2], ("no-disadvantage", "Ignores the glare Disadvantage"))
        self.assertEqual(kinds("Fine thing. Recover 1 Edge point.")[0][:2], ("edge-gain", "Recover 1 Edge point"))

    def test_a_match_across_the_split_keeps_the_whole_clause(self):
        # (the clause is split at ": " and "; ", the match spans the colon: no part holds it, so the clause is the param)
        self.assertEqual(fx._piece("Ignore: the Disadvantage", fx._NO_DIS), "Ignore: the Disadvantage")
        self.assertEqual(kinds("Ignore: the Disadvantage.")[0][:2], ("no-disadvantage", "Ignore: the Disadvantage"))
        self.assertEqual(fx._piece("nothing here", fx._NO_DIS), "nothing here")


class BareAndRepeatedTest(unittest.TestCase):
    def test_a_disadvantage_with_no_test_named(self):
        self.assertEqual(kinds("The user suffers a Disadvantage."), [("disadvantage", "", None, {})])

    def test_the_same_vision_twice_is_one_effect(self):
        self.assertEqual(kinds("Grants Low-Light Vision and low-light vision."), [("no-disadvantage", "Low-light vision", None, {})])


if __name__ == "__main__":
    unittest.main()
