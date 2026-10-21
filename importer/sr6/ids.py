"""SR6 catalog ids: the slug of a printed name. Frozen at what the Anarchy recipe's dhsa.slug gave when SR6 began using it,
so no SR6 id moves; SR6 code takes it from here and never from an Anarchy recipe (importer/tests/test_sr6_ids.py pins the output).
"""

import re


def slug(s):
    s = (
        s.lower()
        .replace("’", "")
        .replace("'", "")
        .replace("™", "")
        .replace("é", "e")
        .replace("è", "e")
        .replace("à", "a")
    )
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60]
