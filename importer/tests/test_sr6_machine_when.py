"""An attribute threshold the book states in words is written as a machine condition the app decides; prose stays."""

import unittest

from importer.sr6.effects.emit import machine_when


class MachineWhenTest(unittest.TestCase):
    def test_threshold(self):
        self.assertEqual(machine_when("if the character's strength is 6 or greater"), "attr:str>=6")
        self.assertEqual(machine_when("Strength 7 or greater"), "attr:str>=7")
        self.assertEqual(machine_when("Magic 3 or less"), "attr:mag<=3")

    def test_prose_unchanged(self):
        self.assertEqual(machine_when("when not in your preferred form"), "when not in your preferred form")
        self.assertEqual(machine_when("strength 6 or greater while sprinting"), "strength 6 or greater while sprinting")


if __name__ == "__main__":
    unittest.main()
