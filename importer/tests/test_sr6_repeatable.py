"""A quality's own prose that lets it be taken more than once sets multi="true" (catalog._repeatable). Invented text."""

import unittest

from importer.sr6.catalog import _once, _repeatable


class RepeatableTest(unittest.TestCase):
    def test_prose_that_allows_a_second_copy(self):
        for text in (
            "You may take this quality multiple times.",
            "Can purchase this quali-\nty for multiple contacts.",
            "Select a place each time you take this quality.",
            "This quality can only be purchased once per attribute.",
            "(choose at time of selection; quality may be taken twice).",
        ):
            self.assertTrue(_repeatable(text), text)

    def test_prose_that_forbids_or_is_about_something_else(self):
        for text in (
            "You may only choose this quality once.",
            "You may not take this quality more than once.",
            "If the same tenet is broken multiple times, add a day.",
            "Pick up the other quality again or lose this one.",
            "It costs twice its normal cost.",
            "",
        ):
            self.assertFalse(_repeatable(text), text)

    def test_prose_that_says_only_once(self):
        self.assertTrue(_once("You may only choose this quality once."))
        self.assertTrue(_once("This quality can only be purchased once."))
        self.assertFalse(_once("This quality can only be purchased once per attribute."))
        self.assertFalse(_once("You may take this quality multiple times."))


if __name__ == "__main__":
    unittest.main()
