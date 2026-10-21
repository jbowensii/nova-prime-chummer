"""importer/reflow.py on made-up text (no book text)."""

import unittest

from importer.reflow import reflow, vocabulary


class Reflow(unittest.TestCase):
    def test_joins_the_lines_of_a_paragraph_and_keeps_paragraph_breaks(self):
        self.assertEqual(
            reflow("The zap gun hums\nwhen it is\nready.\n\nA second\nparagraph."),
            "The zap gun hums when it is ready.\n\nA second paragraph.",
        )

    def test_a_short_line_that_ends_a_sentence_ends_its_paragraph(self):
        column = (
            "The made-up drone circles twice and then\nlands on the roof of the van.\n"
            "It waits. The rigger counts to ten and the\ndrone rises again over the lot,\nunseen.\n"
        )
        self.assertEqual(
            reflow(column),
            "The made-up drone circles twice and then lands on the roof of the van.\n\n"
            "It waits. The rigger counts to ten and the drone rises again over the lot, unseen.",
        )
        # a full line that happens to end a sentence goes on
        self.assertEqual(
            reflow("The invented fixer pays in cash, always.\nShe never asks twice about it."),
            "The invented fixer pays in cash, always. She never asks twice about it.",
        )

    def test_rejoins_a_word_split_at_the_line_end(self):
        self.assertEqual(reflow("Ask the gamemas-\nter first."), "Ask the gamemaster first.")
        self.assertEqual(reflow("Pure cha-\nos follows."), "Pure chaos follows.")

    def test_keeps_real_hyphens(self):
        self.assertEqual(reflow("A non-\nplayer character."), "A non-player character.")
        self.assertEqual(reflow("A well-\nknown fixer."), "A well-known fixer.")
        self.assertEqual(reflow("A two-\nhanded club."), "A two-handed club.")
        self.assertEqual(reflow("Made by Zapco-\nFizzworks."), "Made by Zapco-Fizzworks.")  # a capital: a name
        self.assertEqual(reflow("A non-player stays non-player."), "A non-player stays non-player.")

    def test_the_book_itself_decides_when_it_prints_the_word(self):
        words = vocabulary(["A fire-team of four.", "The firewall holds."])
        self.assertEqual(reflow("Send the fire-\nteam in.", words), "Send the fire-team in.")
        self.assertEqual(reflow("Past the fire-\nwall now.", words), "Past the firewall now.")

    def test_dashes_and_lone_hyphens_are_not_split_words(self):
        self.assertEqual(reflow("Wait --\nthen go."), "Wait -- then go.")
        self.assertEqual(reflow("Wait -\nthen go."), "Wait - then go.")

    def test_list_items_tables_headings_and_labels_keep_their_lines(self):
        text = (
            "**Cost:** 5\n**Avail:** 2\nThe made-up\nkit.\n- one item\nthat wraps\n- two\n1. first\n"
            "| A | B |\n|---|---|\n| 1 | 2 |\n# Heading\nMore\ntext."
        )
        self.assertEqual(
            reflow(text),
            "**Cost:** 5\n**Avail:** 2\nThe made-up kit.\n- one item that wraps\n- two\n1. first\n"
            "| A | B |\n|---|---|\n| 1 | 2 |\n# Heading\nMore text.",
        )

    def test_same_result_twice(self):
        text = "The gamemas-\nter rolls.\n\n- a\nb\n\n**Bold** and *italic*\nstay."
        self.assertEqual(reflow(reflow(text)), reflow(text))
        self.assertEqual(reflow(text), "The gamemaster rolls.\n\n- a b\n\n**Bold** and *italic* stay.")


if __name__ == "__main__":
    unittest.main()
