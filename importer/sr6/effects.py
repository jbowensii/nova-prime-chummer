"""Effects an entry's prose states (gap plan 1.1, the phase 6 grammar's first phrase templates): ordered rules over the
sentences, each giving a path from the character to a part of it and on to its target, an operator and a value.
Vocabulary only (the game's attribute, skill and derived-value words), never an item's name.

- `boost(s) X by N`, `increase(s) X by N` -> <effect target op="add" value="N">
- `+N to X`, `X +N` -> <effect target op="add" value="N">
- `reduce the cost of Edge boosts/actions by N … on tests using <Skill>` -> <effect target="skill:<id>" op="edge-cost"
  value="-N">
- `<Skill> + <Attribute> (N) test` -> <test skill attr threshold>: a test the entry calls for, not a modifier

An effect read from a sentence that sets a condition (`when`, `while`, `if`, `at will`, `with a Minor Action` …) is
`confidence="low"`: shown, never applied (owner decision D3). A target the vocabulary doesn't know is no effect."""
import re

ATTRIBUTES = {"body": "bod", "agility": "agi", "reaction": "rea", "strength": "str", "willpower": "wil", "logic": "log",
              "intuition": "int", "charisma": "cha", "edge": "edg", "magic": "mag", "resonance": "res"}
DERIVED = {"defense rating": "defense", "initiative": "initiative", "composure": "composure",
           "judge intentions": "judge-intentions", "memory": "memory", "social rating": "social"}
SKILLS = ("astral", "athletics", "biotech", "close combat", "con", "conjuring", "cracking", "electronics", "enchanting",
          "engineering", "exotic weapons", "firearms", "influence", "outdoors", "perception", "piloting", "sorcery",
          "stealth", "tasking")
_CONDITION = re.compile(r"\b(?:when|whenever|while|if|unless|at will|only|as long as|(?:minor|major) action)\b", re.I)
_POSS = r"(?:(?:their|your|its|his|her|the(?:\s+character['’]s)?)\s+)?"
_NUM = r"(\d+)"


def _target(words):
    """The vocabulary target a phrase names (`Defense Rating`, `Strength`, `Athletics`), else None."""
    w = " ".join(words.lower().split())
    if w in DERIVED:
        return f"derived:{DERIVED[w]}"
    if w in ATTRIBUTES:
        return f"attr:{ATTRIBUTES[w]}"
    if w in SKILLS:
        return f"skill:{w.replace(' ', '-')}"
    return None


_TERMS = "|".join(sorted([*DERIVED, *ATTRIBUTES, *SKILLS], key=len, reverse=True))
RULES = [
    ("add", re.compile(rf"\b(?:boost|increase|raise)(?:s|d|ing)?\s+{_POSS}({_TERMS})\s+by\s+{_NUM}\b", re.I)),
    ("add", re.compile(rf"\+\s*{_NUM}\s+(?:to\s+)?{_POSS}({_TERMS})\b", re.I)),
    ("add", re.compile(rf"\b({_TERMS})\s+\+\s*{_NUM}\b", re.I)),
    ("edge-cost", re.compile(rf"\breduce\s+the\s+cost\s+of\s+edge\s+(?:boosts?|actions?)(?:\s+and\s+(?:boosts?|actions?))?\s+by\s+"
                             rf"{_NUM}\b[^.]*?\bon\s+tests\s+using\s+({_TERMS})\b", re.I)),
]
_TEST = re.compile(rf"\b({'|'.join(s.title() for s in SKILLS)})\s*\+\s*({'|'.join(a.title() for a in ATTRIBUTES)})"
                   rf"\s*\((\d+)\)\s+test\b")


def sentences(text):
    one = re.sub(r"(?<=[a-z])-\s+(?=[a-z])", "", " ".join((text or "").split()))  # (`De- fense`)
    return [s for s in re.split(r"(?<=[.!?])\s+(?=[A-Z(])", one) if s]


def read(text):
    """[(tag, attrs, None)]: the effects and tests the text states, in the order printed, each once."""
    out = []
    for s in sentences(text):
        low = bool(_CONDITION.search(s))
        for op, rx in RULES:
            for m in rx.finditer(s):
                a, b = m.groups()
                n, words = (a, b) if a.isdigit() else (b, a)
                t = _target(words)
                if t == "attr:edg" and rx is not RULES[0][1]:
                    continue  # `+1 Edge on … tests`: a bonus Edge point on those tests, not the Edge attribute
                if t:
                    value = f"-{n}" if op == "edge-cost" else n
                    out.append(("effect", {"target": t, "op": op, "value": value,
                                           **({"confidence": "low"} if low else {})}, None))
        for m in _TEST.finditer(s):
            out.append(("test", {"skill": _target(m.group(1)), "attr": _target(m.group(2)), "threshold": m.group(3)}, None))
    seen, uniq = set(), []
    for x in out:
        k = (x[0], tuple(sorted(x[1].items())))
        if k not in seen:
            seen.add(k)
            uniq.append(x)
    return uniq


_BANDS = ("close", "near", "medium", "far", "extreme")
_AR = re.compile(r"\b(?:increase|raise|boost|improve)s?\s+(?:the\s+)?((?:(?:close|near|medium|far|extreme)(?:,\s*|\s+and\s+|\s+))+)"
                 r"attack\s+ratings?\s+by\s+(\d+)\b", re.I)


def accessory(text, thing):
    """[(tag, attrs, None)]: what a sentence of `text` naming the accessory (its last word: `arm-brace`) says it does to
    the item it fits: `increases the Near and Medium Attack Ratings by 1` -> <effect target="item:ar" op="add"
    value="0,1,1,0,0">, one value a range band; low confidence when the sentence sets a condition."""
    word = (thing.split() or [""])[-1].lower()
    out = []
    for s in sentences(text):
        if not word or word not in s.lower():
            continue
        for m in _AR.finditer(s):
            named = {b for b in _BANDS if re.search(rf"\b{b}\b", m.group(1), re.I)}
            value = ",".join(m.group(2) if b in named else "0" for b in _BANDS)
            x = ("effect", {"target": "item:ar", "op": "add", "value": value,
                            **({"confidence": "low"} if _CONDITION.search(s) else {})}, None)
            if x not in out:  # (a note printed twice: in the text and as a label)
                out.append(x)
    return out
