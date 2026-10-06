"""Read the Commlink6 jar: every English record with its English name, page and variant names.

The jar keeps stats in data/<book>/data/<file>.xml and the English text in data/<book>/i18n/<stem>.properties, keyed
<prefix>.<id>[.page|.desc|.wifi|.variant.<vid>]. Ids are unique only within a record type (tradition.shaman,
npc.shaman), so text is keyed by (prefix, id): the SR6-eden-Forge reader dropped the prefix and took the wrong name and
page. A book can have several English files (core_seattle, easycome for sif_new_orleans): the one named like the
record's file wins, then the book's others, then (names only) any English file in the jar. German books, lang="de"
records and records with no English name anywhere are left out and counted."""
import os
import re
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from pathlib import Path

ROOT = "de/rpgframework/shadowrun6/data/"
GERMAN = re.compile(r"^de_")
NON_CONTENT = {"icons", "placeholder", "other_us"}
LANG_FILE = re.compile(r"_[a-z]{2}$")  # core_de, core_fr, core_pt: translations
PREFIX = {"power": ("adeptpower", "power"), "itemenhancement": ("itemmod", "itemenhancement"),
          "magicreson": ("mor", "magicreson"), "feature": ("spellfeature", "ritualfeature", "feature")}
BOOL_ATTRS = {"pos", "multi", "hasLevel", "nodouble", "selectable", "modonly", "reqVariant", "count", "noBase", "add",
              "neg", "negate", "remove", "included", "unlimited", "opposed", "essence", "wild", "human", "ai", "illegal",
              "opt", "spark", "magic", "resonance", "spells", "powers", "paysPowers", "aspected", "restrict", "untr"}
TRUE, FALSE = {"y", "yes", "true", "1"}, {"n", "no", "false", "0"}
KEY = re.compile(r"^([A-Za-z_]+)\.([A-Za-z0-9_-]+)(?:\.(.+?))?\s*[=:]\s*(.*)$")
ENV = "CL6_JAR"


def find_jar(arg=None):
    """The jar: the argument, else $CL6_JAR, else the default Commlink6 install; a directory means its newest
    commlink6-*-complete.jar. None when there is none (CI)."""
    for cand in (arg, os.environ.get(ENV), Path.home() / "CommLink6" / "app" / "stable"):
        if not cand:
            continue
        p = Path(cand)
        if p.is_file():
            return p
        if p.is_dir():
            jars = sorted(p.glob("commlink6-*-complete.jar"))
            if jars:
                return jars[-1]
        if arg and cand == arg:
            return None  # an explicit path that isn't there: no fallback
    return None


def decode(raw):
    """Mostly UTF-8, a few cp1252; \\uXXXX escapes and backslash line continuations as Java reads them."""
    try:
        s = raw.decode("utf-8")
    except UnicodeDecodeError:
        s = raw.decode("cp1252", "replace")
    s = re.sub(r"\\\r?\n[ \t]*", "", s)
    return re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), s)


def properties(text):
    """{(prefix, id lower): {"name"|"page"|"desc"|"wifi"|"variant.<vid>"|…: value}}."""
    out = {}
    for ln in text.splitlines():
        m = KEY.match(ln.strip())
        if m:
            out.setdefault((m.group(1), m.group(2).lower()), {}).setdefault(m.group(3) or "name", m.group(4).strip())
    return out


def normalise(el):
    """Spelling variants, in place: lifemod `val` is `value`; lifemod selmod swaps type and ref (type="perception"
    ref="SKILL"); booleans are y/yes/true/1/FALSE; ref CHOICE in any case."""
    for e in el.iter():
        a = e.attrib
        if "val" in a and "value" not in a:
            a["value"] = a.pop("val")
        if "type" in a and "ref" in a and a["ref"].isupper() and not a["type"].isupper():
            a["type"], a["ref"] = a["ref"], a["type"]
        if a.get("ref", "").upper() == "CHOICE":
            a["ref"] = "CHOICE"
        for k in BOOL_ATTRS & a.keys():
            v = a[k].strip().lower()
            a[k] = "true" if v in TRUE else "false" if v in FALSE else a[k]
    return el


def books(z):
    """The English content books in the jar."""
    out = {m.group(1) for n in z.namelist() if (m := re.match(re.escape(ROOT) + r"([^/]+)/", n))}
    return sorted(b for b in out if not GERMAN.match(b) and b not in NON_CONTENT)


def read(jar):
    """(records, excluded): every English record as {book, file, tag, id, name, page, wifi, variants, attrs, el} in jar
    order, and Counter((book, tag, why)) of the records left out."""
    recs, excluded = [], Counter()
    with zipfile.ZipFile(jar) as z:
        names = z.namelist()
        english = [n for n in names if n.endswith(".properties") and "/i18n/" in n and
                   not LANG_FILE.search(n.rsplit("/", 1)[1][:-11])]
        text = {n: properties(decode(z.read(n))) for n in english}
        anywhere = {}
        for n in english:
            for k, v in text[n].items():
                if "name" in v:
                    anywhere.setdefault(k, v["name"])
        for book in books(z):
            own = sorted(n for n in english if n.startswith(f"{ROOT}{book}/i18n/"))
            suffix = {f: f.rsplit("/", 1)[1][:-11].removeprefix(book).lstrip("_") for f in own}  # core_seattle: seattle
            for n in sorted(x for x in names if x.startswith(f"{ROOT}{book}/data/") and x.endswith(".xml")):
                stem = n.rsplit("/", 1)[1][:-4]
                files = sorted(own, key=lambda f: not (suffix[f] and stem.endswith("_" + suffix[f])))
                try:
                    root = ET.fromstring(z.read(n))
                except ET.ParseError:
                    excluded[(book, stem, "xml parse error")] += 1
                    continue
                for el in root:
                    if not isinstance(el.tag, str) or not el.get("id"):
                        continue
                    if el.get("lang") == "de":
                        excluded[(book, el.tag, "lang=de (German-rules duplicate)")] += 1
                        continue
                    iid = el.get("id")
                    keys = [(p, iid.lower()) for p in PREFIX.get(el.tag, (el.tag,))]
                    t = next((text[f][k] for f in files for k in keys if k in text[f]), {})
                    name = t.get("name") or next((anywhere[k] for k in keys if k in anywhere), "")
                    if not name:
                        excluded[(book, el.tag, "no English name in the jar")] += 1
                        continue
                    variants = {k.split(".", 1)[1]: v for k, v in t.items() if k.startswith("variant.") and "." not in
                                k.split(".", 1)[1]}
                    recs.append({"book": book, "file": stem, "tag": el.tag, "id": iid, "name": name,
                                 "page": t.get("page", "").strip(), "wifi": bool(t.get("wifi")), "variants": variants,
                                 "attrs": dict(normalise(el).attrib), "el": el})
    return recs, excluded
