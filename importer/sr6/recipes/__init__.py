"""SR6 recipe registry. A recipe module has ID, NAME, PUBLISHER, CANON, ALIASES, NAME_HEADERS, match(meta, md_head) -> 0..1
and extract(regrouped, ctx=None) -> importer.recipes.Result (files: <kind>.xml -> XML, ids unscoped; texts). identify()
picks the best match at or above THRESHOLD; a book none matches fails, unless skipped() knows it has nothing to import."""
import re

from importer.recipes import Result  # noqa: F401  (the SR6 recipes return Anarchy's Result)
from importer.sr6.recipes import aw, bn, bs, crb, da, dc, ed, fs, general, hs, ia, jd, kk, ll, nf, so, sw, swc, ts, wl

THRESHOLD = 0.6
RECIPES = [crb, swc, fs, da, hs, sw, ll, jd, ia, bs, dc, kk, nf, ts, aw, wl, bn, so, ed]
RECIPES += general.RECIPES  # the books with no recipe of their own: one each, last (a dedicated recipe wins a tie)


def identify(meta, md_head):
    best, score = max(((m, m.match(meta, md_head)) for m in RECIPES), key=lambda x: x[1])
    return (best, score) if score >= THRESHOLD else (None, score)


def printing(sha):
    """(rank, label) of a known printing of a book, or None: the later rank is the printing that wins. The rank is
    (1 if the recipe's CURRENT printing else 0, published YYYY-MM): the owner's rule, the book's Current Printing is the
    newest whatever a later City Edition or reprint is dated; the others rank by month."""
    for r in RECIPES:
        if sha in getattr(r, "PRINTINGS", {}):
            month, label = r.PRINTINGS[sha]
            return (int(sha in getattr(r, "CURRENT", ())), month), label
    return None


def published(sha):
    """The month (YYYY-MM) a known printing was published, or None (printing()'s rank leaves it out for a CURRENT one)."""
    p = printing(sha)
    return p[0][1] if p else None


# the SR6 PDFs with nothing to import: (why, their fingerprints, a pattern their PDF title or file name matches)
SKIP = [
    ("a card deck (reprints of the books' entries)",
     {"b7502c799dd86b8ece94d0e33b912a94662ce8df710c1ab71853494b5a8a9098",  # Gun Rack
      "85d93bc64f4b62009f78a96f2406cfebed8f3536c601b6b2cd563e1bc6d24ef2"},  # Rides
     r"\bgun\s+rack\b|\b(?:weapon|vehicle)\s+cards\b"),
    ("a map", {"ab0aab3359619a5f98752846c7123472ce69f8caedcc43555caca363b7c9c066"}, r"\bmetroplex\s+map\b"),
    ("fiction", {"86ea992542f37fba6926be5d22c5ab637bb1ef80d1b1088c27f17150f6afffbe"}, r"\benhanced\s+fiction\b"),
    ("images only", {"7ff79db98dbb0fc03cb012f8d2a5648ecb3c5732f02ccd9c29faad78c5b166ea"},
     r"\bgame\s*master.?s\s+screen\b|\bgm\s+screen\b"),
    ("errata (applied with its book)",
     {"2fc32494383828d2fc61ebef4ce937c78d24fa5324c57b6384008f362ae18693",  # Firing Squad
      "3abee49d736ac3f337e6e0ffdb47b5a360eb32e7ef16237237a788c731b5a6a5",  # No Future
      "84a488965df544eb5661def7188baeef2a8d38d1fb006f00b5537e1850b6b5db",  # core rulebook, Aug 2019
      "990d5ebadb4bca1ea7acc7fcb181b8475805800771ee9864c40faa511a6581cc"},  # core rulebook, Feb 2020
     r"\berrata\b"),
    ("a character sheet", {"3305040657acf500bda65988ea3701c2b27eec01e96d3d62c8c3d91ba6580b2f"},
     r"\bcharacter[\s_-]+sheet\b|\brecord\s+sheet\b"),
    # the Beginner Box's handouts (its Battle Royale adventure is a book the general recipe reads)
    ("Beginner Box material (quick-start rules, dossiers, cards, map)",
     {"7fa4b5ffb4dd95dccedf71f4c46b22212102fc20068ea82834e62fe15d6392bc",  # Dossier Frostburn
      "50fe3d016e173e11f175e8d2e2071c190977c0e79fdaeac5bf0cdca67710d2c1",  # Dossier Rude
      "00ca28269211f20e967f0d55f2abf98fbbdafec812ceff2d9dd54ed8bb67344a",  # Dossier Yu
      "08c61c617c34e09ff3b1b0bd4efa186f1d0c248a40c785836e048e70232b3e2c",  # Dossier Zipfile
      "def5459b7d34f18151222ea94cc804fa4b2286e17793b31e62bbd94d736302fe",  # Instant Guide
      "c9b5d153a6bd9a1f0bccaf792b948bee63971662b3d419431b6295c2fd65be4b",  # Poster Map
      "b50c2a9d2be0c1a82d1c17dfbf37bb5824b9a7714e6d6b8fba22e179b57b4d0f",  # Quick Start Rules
      "35556b554a4909b8cb48a7373db749f37b39478b095c252c5aade95920629b17"},  # Reference Cards
     r"\bbeginner\s+box\b.*\b(?:dossier|instant\s+guide|poster\s+map|quick[\s-]*start|reference\s+cards)\b"
     r"|\b(?:dossier|instant\s+guide|poster\s+map|quick[\s-]*start\s+rules|reference\s+cards)\b.*\bbeginner\s+box\b"),
]


def skipped(meta, file_name=None):
    """Why a known PDF has nothing to import (SKIP), or None."""
    hay = f"{meta.get('title') or ''}\n{file_name or ''}"
    return next((why for why, shas, pat in SKIP if meta.get("sha256") in shas or re.search(pat, hay, re.I)), None)
