"""The general table reader (owner, 2026-10-06): every table a book prints is read the same way, by its columns and its
title, whatever the book. A table is an **item table** when its columns include item stats (Avail or Cost, or the stat
set of a kind); every other table (modifiers, thresholds, skill lists) is a rules table and is never catalogued. An item
table's kind comes from its column signature, then its category's words:

| columns | kind |
|---|---|
| HANDLING / ACCEL / SPEED / PILOT / BODY (two or more) | vehicles |
| ESSENCE | augmentations (cyberware, bioware… from the title's words: crb.ware_type) |
| DV with ATTACK RATING, MODE or AMMO | weapons |
| DEFENSE RATING (or DR with CAPACITY) | armor |
| DEVICE RATING, ATTRIBUTE ARRAY or PROGRAMS | electronics |
| COST MULTIPLIER | ammotypes |
| AVAIL or COST otherwise | gear, or a kind its category names (`weapon accessories`: the core rulebook's weapons) |

The recipes keep their own maps where they measure better (each book's .md says why); the reader reads the tables they
leave unread (`kind_of`), and the measurement compares the two everywhere else."""

from importer.sr6.categories import KIND_ONLY, category_name, hosts, key

VEHICLE = {"HANDLING", "HAND", "ACCEL", "SPEED INTERVAL", "SPEED", "TOP SPEED", "PILOT", "BODY", "SEATS", "SENSOR"}
WEAPON = {"ATTACK RATING", "ATTACK RATINGS", "AR", "MODE", "MODES", "AMMO"}
DEVICE = {"DEVICE RATING", "ATTRIBUTE ARRAY", "PROGRAMS", "DATA PROCESSING", "FIREWALL"}
PRICE = {"AVAIL", "AVAILABILITY", "COST", "PRICE"}


def columns(header):
    return {" ".join(h.upper().rstrip("*†").split()) for h in header if h}


def is_item_table(header):
    """True when the header carries item stats: a price column, or the stat set of a kind."""
    c = columns(header)
    return bool(c & PRICE or len(c & VEHICLE) >= 2 or "ESSENCE" in c or "DV" in c and c & WEAPON or "DEFENSE RATING" in c)


def kind_of(header, title="", section=""):
    """The kind of an item table's rows from its columns, then its category's words; None for a rules table."""
    if not is_item_table(header):
        return None
    c = columns(header)
    if len(c & VEHICLE) >= 2:
        return "vehicles"
    if "ESSENCE" in c:
        return "augmentations"
    if "DV" in c and c & WEAPON:
        return "weapons"
    if "DEFENSE RATING" in c or "DR" in c and "CAPACITY" in c:
        return "armor"
    if c & DEVICE:
        return "electronics"
    if "COST MULTIPLIER" in c or "MULTIPLIER" in c:
        return "ammotypes"
    for t in (title, section):  # a category naming a kind by its own word (`armor jackets`), an accessory's host aside
        n = category_name(t) or ""
        if hosts(n) is not None:
            continue
        for w in key(n).split():
            if w in KIND_ONLY and KIND_ONLY[w] != "programs":
                return KIND_ONLY[w]
    return "gear"
