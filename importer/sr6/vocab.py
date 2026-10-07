"""The SR6 vocabulary of a field whose values are the game's own words: a value printed outside it is no SR6 value (an
SR5 leftover: `Complex` for an action, `12R` for an availability). A vocabulary, the same in every book, never an
item's name or value. The importer marks such a value with an issue (formula.children); the Commlink6 check's lineage
passes over it when it picks the value published last (tools/cl6check/lineage.py)."""
import re

# field -> (what SR6 prints, the pattern of a value outside it)
_SR5 = {
    # a critter power's action: Major, Minor, Auto, Special (SR5's Complex, Simple and Free actions are gone)
    "action": ("Major, Minor, Auto or Special", re.compile(r"^\s*(complex|simple|free)\b", re.I)),
    # an adept power's activation: Major Action, Minor Action, Passive
    "activation": ("Major Action, Minor Action or Passive", re.compile(r"^\s*(complex|simple|free)(?:\s+action)?\b", re.I)),
    # an availability's legality letter: (L) licensed, (I) illegal (SR5's R restricted and F forbidden are gone)
    "avail": ("a legality of L or I", re.compile(r"\d\s*\(?\s*([RF])\s*\)?\s*$")),
}


def invalid(field, value):
    """Why `value` is no SR6 value of `field` (`SR5's "Complex": SR6 prints Major, Minor, Auto or Special`), else
    None (a field with no vocabulary, an empty value)."""
    rule = _SR5.get(field)
    if not rule or not isinstance(value, str) or not value.strip():
        return None
    m = rule[1].search(value)
    return f'SR5\'s "{m.group(1)}": SR6 prints {rule[0]}' if m else None
