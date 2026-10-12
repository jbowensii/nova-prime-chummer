"""SR6 value formulas and issues (docs/sr6-data-format.md, "Formulas and issues").

A printed value stays as printed in its attribute. When it is a formula (a rating, a count, a band table, another
item's price), the importer also writes `<formula field="cost">EXPR</formula>`, the rule in one small grammar the app
evaluates; when the book prints nothing for a field it needs, or prints something no rule reads, it writes
`<issue field="avail" code="missing|unreadable|ambiguous" page="N">short note</issue>` instead, for the user to settle
in an edits file.

The grammar:
    EXPR   := term (('+' | '-') term)*
    term   := factor (('*' | '/') factor)*
    factor := number | R | Q | M | B | H | opt.<id> | '(' EXPR ')' | '-' factor | call
    call   := tier(EXPR; lo-hi: EXPR; …; lo+: EXPR) | ref(kind:id, field[, EXPR])
            | ceil(EXPR) | floor(EXPR) | min(EXPR, EXPR) | max(EXPR, EXPR)
R is the rating (Force, Level, Size, Grade alike), Q the count bought (the formula's unit names it), M the character's
Magic, B the field's own printed value (the app's), H the same field of the item an add-on is fitted to (its host:
the ammunition a material multiplies), opt.<id> 1 when that option is chosen. `/` rounds up unless the
formula says round="down"; the open last band of a tier is `lo+:`. The readers below use B for the base item a price is
worked out from (the commlink a hack goes in, the instrument a link doubles): no catalog id names it, so _formula()
writes such a rule as an `ambiguous` issue stating it (`base + R*100`), never as a formula.

Readers here are general: the books' value styles (`Rating x 2,000¥`, `300¥ per CF`, `2,000¥ (+500¥ per additional
dart)`, `x2`, `Commlink cost plus rating x 100`, `[4,000¥ x Size]`, `Magic*100¥`, a seat count `2/6`, rows of rating
bands), never an item's name."""
import math
import re

from importer.sr6 import vocab

ROUND_UP, ROUND_DOWN = "up", "down"
NUMERIC = ("cost", "avail", "essence", "capacity", "karma", "rating", "dv", "seats", "ammo", "slots")
_VAR_WORDS = r"rating|force|level|size|grade|capacity"
_TIME = re.compile(r"^(?:month|year|week|day|hour|minute|night)s?\b", re.I)
_NUM = r"\d[\d,]*(?:\.\d+)?|\.\d+"


# --- parsing and evaluating -----------------------------------------------------------------------------------------

_TOKEN = re.compile(r"\s*(?:(?P<num>\d+(?:\.\d+)?|\.\d+)|(?P<opt>opt\.[a-z0-9][a-z0-9-]*)"
                    r"|(?P<ref>[a-z]+:[a-z0-9][a-z0-9.\-]*)|(?P<name>[A-Za-z_]+)|(?P<op>[-+*/(),;:]))")


class FormulaError(ValueError):
    pass


def tokens(expr):
    out, i = [], 0
    while i < len(expr):
        if expr[i:].strip() == "":
            break
        m = _TOKEN.match(expr, i)
        if not m or m.end() == i:
            raise FormulaError(f"bad token at {expr[i:i + 12]!r}")
        out.append((m.lastgroup, m.group(m.lastgroup)))
        i = m.end()
    return out


def parse(expr):
    """The expression's tree: ('num', v) | ('var', 'R'|'Q'|'M'|'B') | ('opt', id) | ('neg', x) | (op, a, b) |
    ('call', name, [args]) | ('tier', sel, [(lo, hi or None, x)]) | ('ref', 'kind:id', field, x or None).
    FormulaError when it isn't one."""
    ts, pos = tokens(expr), [0]

    def peek(v=None):
        t = ts[pos[0]] if pos[0] < len(ts) else (None, None)
        return t if v is None else t[1] == v

    def take(v=None):
        t = peek()
        if t[0] is None or v is not None and t[1] != v:
            raise FormulaError(f"expected {v or 'more'} in {expr!r}")
        pos[0] += 1
        return t

    def number():
        k, v = take()
        if k != "num":
            raise FormulaError(f"expected a number in {expr!r}")
        return float(v)

    def factor():
        k, v = take()
        if k == "num":
            return ("num", float(v))
        if k == "opt":
            return ("opt", v[4:])
        if v == "(":
            x = sum_()
            take(")")
            return x
        if v == "-":
            return ("neg", factor())
        if k == "name" and v in ("R", "Q", "M", "B", "H"):
            return ("var", v)
        if k == "name" and v == "tier":
            take("(")
            sel, bands = sum_(), []
            while peek(";"):
                take(";")
                lo = number()
                hi = lo
                if peek("+"):  # an open last band: `7+:`
                    take("+")
                    hi = None
                elif peek("-"):
                    take("-")
                    hi = None if peek(":") else number()
                take(":")
                bands.append((lo, hi, sum_()))
            take(")")
            if not bands:
                raise FormulaError("tier() needs a band")
            return ("tier", sel, bands)
        if k == "name" and v == "ref":
            take("(")
            kr, target = take()
            if kr != "ref":
                raise FormulaError("ref() needs kind:id")
            take(",")
            kf, fld = take()
            if kf != "name":
                raise FormulaError("ref() needs a field")
            at = None
            if peek(","):
                take(",")
                at = sum_()
            take(")")
            return ("ref", target, fld, at)
        if k == "name" and v in ("ceil", "floor", "min", "max"):
            take("(")
            args = [sum_()]
            while peek(","):
                take(",")
                args.append(sum_())
            take(")")
            if len(args) != (1 if v in ("ceil", "floor") else 2):
                raise FormulaError(f"{v}() takes {1 if v in ('ceil', 'floor') else 2} argument(s)")
            return ("call", v, args)
        raise FormulaError(f"unexpected {v!r} in {expr!r}")

    def term():
        x = factor()
        while peek("*") or peek("/"):
            op = take()[1]
            x = (op, x, factor())
        return x

    def sum_():
        x = term()
        while peek("+") or peek("-"):
            op = take()[1]
            x = (op, x, term())
        return x

    tree = sum_()
    if pos[0] != len(ts):
        raise FormulaError(f"trailing {ts[pos[0]][1]!r} in {expr!r}")
    return tree


def valid(expr):
    try:
        parse(expr)
        return True
    except FormulaError:
        return False


def evaluate(expr, R=None, Q=None, M=None, B=None, opt=None, ref=None, round=ROUND_UP, H=None):
    """The value of a formula, or None when it needs something not given (a variable, a ref the `ref(target, field,
    rating)` callback can't resolve, a rating outside every band). `/` rounds up, or down with round='down'."""
    env = {"R": R, "Q": Q, "M": M, "B": B, "H": H}
    opts = opt or {}

    def ev(n):
        t = n[0]
        if t == "num":
            return n[1]
        if t == "var":
            return env[n[1]]
        if t == "opt":
            return 1.0 if opts.get(n[1]) else 0.0
        if t == "neg":
            v = ev(n[1])
            return None if v is None else -v
        if t in "+-*/":
            a, b = ev(n[1]), ev(n[2])
            if a is None or b is None:
                return None
            if t == "+":
                return a + b
            if t == "-":
                return a - b
            if t == "*":
                return a * b
            if b == 0:
                return None
            q = a / b
            return float(math.floor(q + 1e-9) if round == ROUND_DOWN else math.ceil(q - 1e-9))
        if t == "call":
            args = [ev(a) for a in n[2]]
            if any(a is None for a in args):
                return None
            return float({"ceil": math.ceil, "floor": math.floor, "min": min, "max": max}[n[1]](*args))
        if t == "tier":
            s = ev(n[1])
            if s is None:
                return None
            for lo, hi, x in n[2]:
                if lo <= s and (hi is None or s <= hi):
                    return ev(x)
            return None
        if t == "ref":
            at = ev(n[3]) if n[3] is not None else None
            return ref(n[1], n[2], at) if ref else None
        raise FormulaError(t)

    return ev(parse(expr))


def variables(expr):
    """The variables a formula uses ({'R', 'Q', …}, 'opt.<id>' for options, 'ref' when it cites another item)."""
    out = set()

    def walk(n):
        if n[0] == "var":
            out.add(n[1])
        elif n[0] == "opt":
            out.add("opt." + n[1])
        elif n[0] == "ref":
            out.add("ref")
            if n[3] is not None:
                walk(n[3])
        elif n[0] == "neg":
            walk(n[1])
        elif n[0] in "+-*/":
            walk(n[1])
            walk(n[2])
        elif n[0] == "call":
            for a in n[2]:
                walk(a)
        elif n[0] == "tier":
            walk(n[1])
            for _, _, x in n[2]:
                walk(x)
    walk(parse(expr))
    return out


def fmt(v):
    """A number as a formula writes it: 2000, 0.5."""
    v = float(v)
    return str(int(v)) if v.is_integer() else f"{v:g}"


# --- reading a printed value ----------------------------------------------------------------------------------------

def _clean(text):
    t = (text or "").replace("¥", "").replace("×", "x").replace("–", "-").replace("—", "-").replace("−", "-")
    t = t.replace("’", "'").replace("‘", "'")
    t = re.sub(r"(?<=\d),(?=\d{3}\b)", "", t)
    return " ".join(t.split())


def _arith(t):
    """A printed arithmetic value in the grammar (`Rating x 2000` -> `R*2000`, `[4000 x Size]`, `Magic*100`,
    `(Rating/3)`), or None."""
    e = re.sub(r"\[|\]", lambda m: "(" if m.group() == "[" else ")", t)
    e = re.sub(rf"\b(?:{_VAR_WORDS})\b", " R ", e, flags=re.I)
    e = re.sub(r"\bmagic\b", " M ", e, flags=re.I)
    e = re.sub(r"(?<![a-z])x(?![a-z])|\*", " * ", e, flags=re.I)
    e = re.sub(r"\s*\(\s*[LIRF]\s*\)\s*$|(?<=\d)\s*[LIRF]$|(?<=R)\s*[LIRF]$|(?<=\))\s*[LIRF]$", "",
               e.strip())  # a legality suffix (`(Force +3) L`: after the bracket)
    e = " ".join(e.split())
    if not e or re.search(r"[A-Za-z]", re.sub(r"\b[RM]\b", "", e)):
        return None
    if not valid(e):
        return None
    return re.sub(r"\s*([-+*/()])\s*", r"\1", e).replace("+", " + ").replace("-", " - ").strip().lstrip("+ ").strip()


_UNIT = r"[a-z][a-z ]*?"
_WORDS = r"[a-z][a-z' ]*?"


def plain(text, field="cost"):
    """The number a plain printed value is (`2,500¥`, `4(L)`, `500 each`, `6*`, `500,000+`, `[2]` capacity used,
    `(I) 6`), else None."""
    t = re.sub(r"[*†‡]+$", "", _clean(text)).strip()
    t = re.sub(r"\s+each$", "", t, flags=re.I)
    t = re.sub(r"^\(\s*[LIRF]\s*\)\s*", "", t)
    if field == "capacity" and (m := re.fullmatch(r"\[\s*(.+?)\s*\]", t)):
        t = m.group(1)  # capacity used, in brackets
    if m := re.fullmatch(rf"\+?({_NUM})\s*\+?\s*(?:\(?[LIRFlirf]\)?)?", t):
        return _n(m.group(1))
    return None


def read(text, field="cost"):
    """(EXPR, extra) for a printed value that is a formula, extra holding the formula's unit and the options it reads
    ([(id, name)]); None for a plain number, a dash, a word, a cell printing several values or anything no style below
    takes (the caller decides whether that is an issue). The styles, in order:
      `2/6`, `2+2` seats (front and back)                     -> 2 + 6
      `2,000¥ (+500¥ per additional dart)`                    -> 2000 + 500*(Q - 1), unit dart
      `75¥ (per individual blade)`                           -> Q*75, unit individual blade
      `additional 100¥` (an add-on's price on its item's)     -> B + 100
      `300¥ per CF`, `250¥/pair`, `Rating x 200¥ per dose`    -> Q*300, Q*(R*200), unit CF / pair / dose
      `CF x 500`, `500 x CF`                                  -> Q*500, unit CF
      `… cost x the number of occupants`                      -> B*Q, unit occupant
      `x2`, `(Camera) x 2`, `Focus cost x 0.25`               -> B*2, B*0.25; avail `As focus` -> B
      `+100%`, `Armor cost increased 5%`, `20% vehicle price`  -> B*2, B*1.05, B*0.2
      `Commlink cost plus rating x 100`, `As Rocket + R x 50`  -> B + R*100
      `250¥ + Certified Credstick Cost`, `2,000¥ + Commlink`  -> 250 + B
      `500¥ + 2 doses toxin`, `+150¥ + (cost of compound x 4)` -> 500 + 2*B
      `500¥ (+100¥ for thermal smoke)`                        -> 500 + 100*opt.thermal-smoke, an option
      `Rating x 2,000¥`, `12,000¥ + [4,000¥ x Size]`, `Magic*100¥`, `(Rating/3)`, `Rating x 50¥ (10 uses)`,
      `Rating x 1,000¥ /month`, `6(I) + Size`                 -> R*2000, 12000 + (4000*R), M*100, (R/3), R*50 …"""
    t = re.sub(r"[*†‡]+$", "", _clean(text)).strip()
    if not t or re.fullmatch(r"-+|n/a", t, re.I) or two_values(text) or plain(text, field) is not None:
        return None
    if field == "capacity" and (m := re.fullmatch(r"\[\s*(.+?)\s*\]", t)):
        t = m.group(1)  # capacity used, in brackets
    if re.fullmatch(rf"(?:{_NUM})\s*-\s*(?:{_NUM})", t):
        return None  # `1–6`: a range (the rating or capacity it comes in), not a subtraction
    t = re.sub(r"(?<=\d)\s*\(\s*[LIRF]\s*\)(?=\s*[-+*x])", "", t)  # `6(I) + Size`: the legality is the printed avail's
    if m := re.fullmatch(rf"adds\s+({_NUM})\s+per\s+(?:level|rating)", t, re.I):
        return f"R*{fmt(_n(m.group(1)))}", {}
    if field == "seats" and (m := re.fullmatch(r"(\d+)\s*[/+]\s*(\d+)", t)):
        return f"{m.group(1)} + {m.group(2)}", {}
    if m := re.fullmatch(rf"({_NUM})\s*\(\+\s*({_NUM})\s+per\s+additional\s+({_UNIT})\)", t, re.I):
        return f"{fmt(_n(m.group(1)))} + {fmt(_n(m.group(2)))}*(Q - 1)", {"unit": _unit(m.group(3))}
    if m := re.fullmatch(rf"({_NUM})\s*\(\+\s*({_NUM})\s+for\s+({_WORDS})\)", t, re.I):
        oid = _slug(m.group(3))
        return f"{fmt(_n(m.group(1)))} + {fmt(_n(m.group(2)))}*opt.{oid}", {"options": [(oid, m.group(3).strip())]}
    if m := re.fullmatch(rf"({_NUM})\s*¥?\s*\(\s*per\s+({_WORDS})\s*\)\s*\]?", t, re.I):  # `75¥ (per individual blade)`
        return f"Q*{fmt(_n(m.group(1)))}", {"unit": _unit(m.group(2)), "each": True}
    if m := re.fullmatch(rf"(?:an?\s+)?additional\s+({_NUM})\s*¥?", t, re.I):  # `additional 100¥`: added to its item's
        return f"B + {fmt(_n(m.group(1)))}", {}
    if (m := re.fullmatch(rf"(.+?)\s*(?:\bper\b|/)\s*({_UNIT})", t, re.I)) and not _TIME.match(m.group(2)) \
            and not re.match(r"\d", m.group(2)) and (e := _arith(m.group(1))):
        if re.match(rf"(?:{_VAR_WORDS})\b", m.group(2), re.I):  # `1 per Rating point`, `2 per level`: by the rating
            return (f"R*{e}" if re.fullmatch(_NUM, e) else f"R*({e})"), {}
        return (f"Q*{e}" if re.fullmatch(_NUM, e) else f"Q*({e})"), {"unit": _unit(m.group(2))}
    if m := re.fullmatch(rf"(?:CF\s*x\s*({_NUM})|({_NUM})\s*x\s*CF)", t, re.I):
        return f"Q*{fmt(_n(m.group(1) or m.group(2)))}", {"unit": "CF"}
    if m := re.fullmatch(r"(?:\d+\s+months?\s+of\s+)?[a-z][a-z ]*?\s+cost\s+x\s+the\s+number\s+of\s+([a-z]+)", t, re.I):
        return "B*Q", {"unit": _unit(m.group(1))}
    if field == "avail" and re.fullmatch(r"as\s+(?:the\s+)?[a-z][a-z ]*", t, re.I):
        return "B", {}  # `As focus`: the availability of the item it is made for
    if m := re.fullmatch(rf"\(\s*(?:{_VAR_WORDS})\s*\)\s*[x*]\s*({_NUM})", t, re.I):
        return f"R*{fmt(_n(m.group(1)))}", {}  # (`(Rating) x 500`: the rating in brackets, not another item)
    # (`Focus cost x 0.25`: a share of the price of the item it is made for)
    if m := re.fullmatch(rf"(?:\([^()]+\)\s*|[a-z][a-z ]*?\s+cost\s+)?[x*]\s*({_NUM})", t, re.I):
        return f"B*{fmt(_n(m.group(1)))}", {}
    if m := re.fullmatch(rf"(?:\+\s*({_NUM})\s*%(?:\s+[a-z' ]+)?|[a-z ]+?\bincreased\s+({_NUM})\s*%)", t, re.I):
        return f"B*{fmt(1 + _n(m.group(1) or m.group(2)) / 100)}", {}
    if m := re.fullmatch(rf"({_NUM})\s*%\s+(?:of\s+)?(?:the\s+)?[a-z ]+?\bprice", t, re.I):
        return f"B*{fmt(_n(m.group(1)) / 100)}", {}
    if m := re.fullmatch(r"(?:as\s+)?([A-Za-z][A-Za-z' ]*?)(?:\s+cost)?\s+(?:plus|\+)\s+(.+)", t, re.I):
        rest = _arith(m.group(2))
        if rest and not re.fullmatch(_NUM, m.group(1).strip()):
            return f"B + {rest}", {}
    if m := re.fullmatch(rf"\+?\s*({_NUM})\s*(?:plus|\+)\s*\(?\s*(?:({_NUM})\s+(?:doses?\s+(?:of\s+)?)?)?"
                         rf"(?:cost\s+of\s+)?({_WORDS})(?:\s+(?:dose\s+)?cost)?(?:\s*x\s*({_NUM}))?\s*\)?", t, re.I):
        k = m.group(2) or m.group(4)
        if not re.search(r"\b(?:up to|or)\b", m.group(3)) and not re.fullmatch(rf"(?:{_VAR_WORDS}|magic)", m.group(3), re.I):
            return f"{fmt(_n(m.group(1)))} + {fmt(_n(k)) + '*' if k else ''}B", {}
    t2 = re.sub(r"\s*\((?![^()]*\b(?:rating|force|level|size)\b)[^()]*\)\s*$", "", t, flags=re.I)  # a note: (10 uses)
    t2 = re.sub(r"\s*/\s*(?:month|year|week|day)s?$", "", t2, flags=re.I)  # a price a period: the period is `per`
    e = _arith(t2)
    if e is None or not re.search(r"[RM]|[-+*/]", e):
        return None
    return e, {}


def _slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "option"


def _n(s):
    return float(s.replace(",", ""))


def _unit(s):
    """A unit as a formula names it: singular, lower case, an abbreviation in capitals (CF, NV)."""
    s = " ".join(s.split())
    if re.fullmatch(r"[A-Z]{1,4}s?", s):
        return s.rstrip("s") if len(s) > 2 and s.endswith("s") else s
    s = s.lower()
    return {"cf": "CF", "cfs": "CF"}.get(s, s[:-1] if s.endswith("s") and not s.endswith("ss") and len(s) > 3 else s)


def tier(bands):
    """A formula from rating bands [(lo, hi or None, EXPR)] (rows `1–3 | Rating x 1,000¥`, `10+ | …`)."""
    bands = sorted(bands, key=lambda b: b[0])
    if len({e for _, _, e in bands}) == 1:
        return bands[0][2]
    parts = [f"{lo}+: {e}" if hi is None else f"{lo}-{hi}: {e}" if hi != lo else f"{lo}: {e}" for lo, hi, e in bands]
    return "tier(R; " + "; ".join(parts) + ")"


def band(rating):
    """(lo, hi or None) of a printed rating band: `1–3`, `9`, `10+`; None for anything else."""
    t = _clean(rating)
    if m := re.fullmatch(r"(\d+)\s*-\s*(\d+)", t):
        return int(m.group(1)), int(m.group(2))
    if m := re.fullmatch(r"(\d+)\s*\+", t):
        return int(m.group(1)), None
    if re.fullmatch(r"\d+", t):
        return int(t), int(t)
    return None


def two_values(text):
    """True when a cell prints two prices or counts side by side (`Rating x 2,500¥/4,000¥`, `300/350`): two values
    for two variants, not one formula."""
    t = (text or "").replace("¥", "¥ ")
    if re.search(r"¥\s*/\s*\d", text or "") or re.search(r"(?<![\d.])\d[\d,]{2,}\s*/\s*\d[\d,]{2,}(?![\d.])", t) \
            and not re.search(r"(?i)\b(?:rating|force|level|size)\b\s*/", t):
        return True
    # `400¥ (MZM); 450¥ (MZM+)`, `500 or 2 CF`, `+100 / +250`, `5,000¥ for cyberdeck/7,000¥ for cyberhack`
    parts = re.split(r"\s*;\s*|\s+or\s+|(?<=[a-z%)])\s*/\s*(?=[+\d])|\s*/\s*(?=\+)", t.strip(), flags=re.I)
    return len(parts) > 1 and any(re.search(r"\d", p) for p in parts) and (
        len([p for p in parts if re.search(r"\d", p)]) > 1 or re.search(r"\s+or\s+", t, re.I) is not None)


# --- the children an entry gets ----------------------------------------------------------------------------------

PRICED = ("weapons", "armor", "augmentations", "electronics", "gear", "vehicles", "programs")  # ordered: catalog.derived's first base
# the fields a formula may stand in, by kind (the rest are words, or ranges: rating)
FORMULA_FIELDS = {"weapons": ("cost", "avail"), "armor": ("cost", "avail", "capacity", "defense"),
                  "augmentations": ("cost", "avail", "essence", "capacity"),
                  "electronics": ("cost", "avail", "capacity"), "gear": ("cost", "avail", "capacity", "karma", "slots"),
                  "vehicles": ("cost", "avail", "seats"), "programs": ("cost", "avail"), "lifestyles": ("cost",)}
# the fields an entry of a kind needs: none printed is an issue
NEEDED = {k: ("avail", "cost") for k in PRICED} | {"lifestyles": ("cost",), "qualities": ("karma",)}
VEHICLE_STATS = {"handling": "handling", "accel": "acceleration", "interval": "speed interval", "topSpeed": "top speed",
                 "body": "body", "armor": "armor", "pilot": "pilot", "sensor": "sensor", "seats": "seats"}
_NOTE = {"avail": "no availability printed", "cost": "no price printed", "karma": "no Karma cost printed",
         "rating": "no rating range printed", "essence": "no Essence printed"}
_DASH = re.compile(r"\s*(?:[—–-]+|n/a)[*†]?\s*", re.I)


def _short(v, n=40):
    v = " ".join(str(v).split())
    return v if len(v) <= n else v[:n - 1] + "…"


def printed(attrs, f):
    """A field's printed value as read for a formula: the cost with its `per` unit put back (`300` per `CF`)."""
    v = attrs.get(f)
    if v is None:
        return None
    v = str(v)
    per = attrs.get("per")
    if f == "cost" and per and not re.match(r"\d", per) and not _TIME.match(per):
        v = f"{v} per {per}"
    return v


_SECTION_OPTION = re.compile(r"\b([a-z]+)(?:\s+construction)?\s+versions?\b[^.]{0,40}?\b(?:are|is)\s+available\s+"
                             r"(?:at|for)\s+(half|twice|double|\d+\s*%)\s+(?:of\s+)?the\s+(?:listed\s+|normal\s+)?"
                             r"(?:cost|price)", re.I)


def section_options(text):
    """[(id, name, factor)]: the cheaper or dearer versions a section's text offers for its items (`open construction
    versions of both are available at half the listed cost` -> ('open', 'open', 0.5))."""
    out = []
    for m in _SECTION_OPTION.finditer(" ".join((text or "").split())):
        w = m.group(2).lower()
        f = {"half": 0.5, "twice": 2.0, "double": 2.0}.get(w) or float(re.sub(r"\D", "", w)) / 100
        out.append((_slug(m.group(1)), m.group(1).lower(), f))
    return out


_LENGTH = {"mm": 0.1, "millimeter": 0.1, "cm": 1, "centimeter": 1, "m": 100, "meter": 100, "metre": 100}
_WORD_NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "ten": 10, "twenty": 20, "hundred": 100}
_TEXT_UNIT = re.compile(r"\bcost\s+is\s+(?:based\s+on\s+[a-z]+\s+)?per\s+(?:(\d+|[a-z]+)\s+)?([a-z]+?)s?\b"
                        r"(?:\s*\(\s*minimum\s+([\d.]+)\s*([a-z]+?)s?\s*,\s*maximum\s+([\d.]+)\s*([a-z]+?)s?\s*\))?", re.I)


def text_unit(text):
    """(unit, qty or None) of a price its description gives per unit (`cost is … per ten centimeters (minimum 10 cm,
    maximum 1 meter)` -> ('10 cm', '1-10')), else None."""
    m = _TEXT_UNIT.search(" ".join((text or "").split()))
    if not m:
        return None
    n = m.group(1)
    size = float(n) if n and n.isdigit() else _WORD_NUM.get((n or "one").lower())
    word = m.group(2).lower()
    if size is None:
        return None
    base = _LENGTH.get(word)
    unit = f"{fmt(size)} {'cm' if base == 1 else 'm' if base == 100 else word}" if size != 1 else _unit(word)
    qty = None
    if m.group(3) and base and _LENGTH.get(m.group(4).lower()) and _LENGTH.get(m.group(6).lower()):
        lo = float(m.group(3)) * _LENGTH[m.group(4).lower()] / (size * base)
        hi = float(m.group(5)) * _LENGTH[m.group(6).lower()] / (size * base)
        if lo.is_integer() and hi.is_integer():
            qty = f"{int(lo)}-{int(hi)}"
    return unit, qty


_TEXT_OPTION = re.compile(r"\bthe\s+([a-z][a-z' -]{2,30}?)\s*\(\s*costs?\s+([\d,]+)\s*¥\s*\)", re.I)
_HALF = re.compile(r"\bone\s+half\s+(?:of\s+)?the\s+((?:essence|nuyen\s+cost|cost|price|capacity|availability)"
                   r"(?:\s*(?:,|and)\s*(?:the\s+)?(?:essence|nuyen\s+cost|cost|price|capacity|availability))*)", re.I)


def text_options(text):
    """[(id, name, price)]: parts the description prices beside the item (`powered by the mini-outboard (costs
    500¥)`), each an option added to its cost."""
    return [(_slug(m.group(1)), m.group(1).strip(), _n(m.group(2))) for m in _TEXT_OPTION.finditer(" ".join((text or "").split()))]


def half_of(text):
    """The fields the description says are half another item's (`one half the Essence and nuyen cost`, `one half the
    capacity`): {'essence', 'cost', 'capacity', 'avail'}."""
    out = set()
    for m in _HALF.finditer(" ".join((text or "").split())):
        w = m.group(1).lower()
        out |= {f for f, k in (("essence", "essence"), ("cost", "cost"), ("cost", "price"), ("capacity", "capacity"),
                               ("avail", "availability")) if k in w}
    return out


_ENERGY_USE = re.compile(r"\buses\s+([\d.]+)\s+energy\s+per\s+(?:individual\s+)?(?:shot|projectile)", re.I)
_SUPPLY = re.compile(r"\b(?:includes|come\s+with|uses\s+an?)\s+((?:[a-z]+\s+){0,2}?power\s+[a-z]+?)s?\b", re.I)


def energy_ammo(text, section_text, supplies):
    """An energy weapon's shots: `Uses N Energy per … shot` in its note, the power supply it comes with (its note's
    `Includes power backpack`, else its section's `come with power clips`) -> `ref(gear:<supply id>, energy)/N`, rounded
    down; supplies: {name (lower): gear id} of the book's power supplies. None when either is missing."""
    use = _ENERGY_USE.search(" ".join((text or "").split()))
    if not use:
        return None
    for t in (text, section_text):
        for m in _SUPPLY.finditer(" ".join((t or "").split())):
            want = _stem(m.group(1).lower().split()[-1])
            sid = next((i for n, i in supplies.items() if _stem(n.split()[-1]) == want and names(m.group(1), n)), None)
            if sid:
                return f"ref(gear:{sid}, energy)/{fmt(float(use.group(1)))}"
    return None


def _stem(w):
    """A word's singular, roughly (boxes -> box, lorries -> lorry, trailers -> trailer)."""
    if w.endswith("ies") and len(w) > 4:
        return w[:-3] + "y"
    if re.search(r"(?:x|ss|ch|sh)es$", w):
        return w[:-2]
    return w[:-1] if w.endswith("s") and not w.endswith("ss") and len(w) > 3 else w


def names(heading, name):
    """True when a heading names an item: a word of the heading (singular) is a word of the item's name."""
    hw = {_stem(w) for w in re.findall(r"[a-z]+", heading.lower()) if len(w) > 3}
    return bool(hw & {_stem(w) for w in re.findall(r"[a-z]+", name.lower())})


def _formula(f, expr, extra, page):
    """A field's <formula>, or, for a rule priced off another item the book leaves to the buyer (B in the readers
    above: the commlink a hack is built from, the instrument a link doubles), an <issue code="ambiguous"> stating that
    rule: the app's B is the field's own printed value, and no catalog id names the base item."""
    if "B" in variables(expr):
        rule = re.sub(r"\bB\b", "base", expr)
        return "issue", {"field": f, "code": "ambiguous", "page": page}, _short(f"priced from another item: {rule}", 60)
    return "formula", {"field": f, **({"unit": extra["unit"]} if extra.get("unit") else {})}, expr


def children(kind, attrs, page, row=None, tiered=None, readable=None, options=(), text=""):
    """[(tag, attrs, text)]: the entry's <formula> and <issue> children. tiered: {field: EXPR} the entry's
    band group gives (tier_groups); row: its printed row (a per-unit price's count range); readable(value): True when
    the app's rated() reads a value as it stands; options: [(id, name, price factor)] its section offers
    (section_options), applied to its cost; text: its description (a price per unit it states: text_unit)."""
    out, tiered, uses_r = [], tiered or {}, False
    adds = text_options(text) if kind in PRICED else []
    halves = half_of(text)
    for f in FORMULA_FIELDS.get(kind, ()):
        v = printed(attrs, f)
        if f in tiered:
            out.append(("formula", {"field": f}, tiered[f]))  # (its band is its rating: no range to ask for)
            continue
        if f == "cost" and (options or adds) and v is not None and (got := read(v, f) or (
                (fmt(p), {}) if (p := plain(v, f)) is not None else None)):
            expr, extra = got
            for oid, name, factor in options:  # a version its section prices apart: a factor
                expr = f"({expr})*(1 {'-' if factor < 1 else '+'} {fmt(abs(factor - 1))}*opt.{oid})"
            for oid, name, price in adds:  # a part its description prices: added when chosen
                expr = f"{expr} + {fmt(price)}*opt.{oid}"
            out.append(_formula(f, expr, extra, page))
            continue
        if v is not None and halves and re.fullmatch(r"\s*[*†‡]\s*", v):
            # a cell printing only a footnote mark, its description pricing the item off another (`one half the
            # Essence and nuyen cost` of the base system): half the base item's value, or the base's own
            out.append(_formula(f, "B*0.5" if f in halves else "B", {}, page))
            continue
        if f == "cost" and v is not None and (p := plain(v, f)) is not None and (tu := text_unit(text)):
            out.append(_formula(f, f"Q*{fmt(p)}", {"unit": tu[0]}, page))  # its description prices it per unit
            continue
        if v is not None and re.search(r"\d,\d", _clean(v)):
            # (a thousands group of other than three digits, `1,00¥`: a misprint, read as its digits but the user's
            # to settle)
            out.append(("issue", {"field": f, "code": "unreadable", "page": page}, f"printed: {_short(v)}"))
            continue
        if v is None or _DASH.fullmatch(v) or plain(v, f) is not None or band(v.strip("[] ")):
            continue  # (a range, `1–6`, is the rating or capacity the item comes in)
        got = read(v, f)
        if got:
            expr, extra = got
            out.append(_formula(f, expr, extra, page))
            uses_r |= "R" in variables(expr)
            if extra.get("each"):  # (bought by the unit, how many at most not printed: the user's to say, no guess)
                out.append(("issue", {"field": "qty", "code": "missing", "page": page},
                            f"the most one buys ({extra['unit']}) isn't printed"))
        elif two_values(v):
            out.append(("issue", {"field": f, "code": "ambiguous", "page": page}, f"two values printed: {_short(v)}"))
        elif not (readable and readable(v)):
            out.append(("issue", {"field": f, "code": "unreadable", "page": page}, f"printed: {_short(v)}"))
    for f in NEEDED.get(kind, ()):
        v = attrs.get(f)
        if v is None or not str(v).strip():
            out.append(("issue", {"field": f, "code": "missing", "page": page}, _NOTE[f]))
    if kind == "augmentations" and not (attrs.get("essence") or "").strip() and not (attrs.get("capacity") or "").strip():
        out.append(("issue", {"field": "essence", "code": "missing", "page": page}, _NOTE["essence"]))
    bands = [b for b in re.split(r"\s*/\s*", re.sub(r"\([^)]*\)", "", attrs.get("ar") or "")) if b.strip()]
    if kind == "weapons" and len([b for b in bands if not _DASH.fullmatch(b)]) > 1 and not re.search(r"(?i)only", attrs.get("ar") or ""):
        for f, note in (("modes", "no firing modes printed"), ("ammo", "no ammo printed")):
            if not (attrs.get(f) or "").strip():  # a ranged weapon (attack ratings past Close) needs both
                out.append(("issue", {"field": f, "code": "missing", "page": page}, note))
    if kind == "vehicles" and sum(1 for f in VEHICLE_STATS if (attrs.get(f) or "").strip()) >= 4:
        for f in VEHICLE_STATS:
            if not (attrs.get(f) or "").strip():  # a stat line read in part: the field it leaves out
                out.append(("issue", {"field": f, "code": "missing", "page": page}, f"no {VEHICLE_STATS[f]} printed"))
    if kind == "weapons" and (m := re.fullmatch(r"\s*\(\s*\d+\s*[–-]\s*\d+\s*\)\s*([PS](?:\([a-z]+\))?)\s*", attrs.get("dv") or "")):
        out.append(("formula", {"field": "dv"}, "R"))  # `(1–10) S`: a DV the rating gives, in its range
    r = attrs.get("rating")
    if uses_r and (r is None or not str(r).strip() or _DASH.fullmatch(str(r))):
        out.append(("issue", {"field": "rating", "code": "missing", "page": page}, _NOTE["rating"]))
    flagged = {a["field"] for t, a, _ in out if t == "issue"}
    for f, v in attrs.items():  # a value outside the field's SR6 vocabulary (an SR5 leftover: vocab.py)
        if f not in flagged and (why := vocab.invalid(f, v)):
            out.append(("issue", {"field": f, "code": "unreadable", "page": page}, _short(f"not SR6: {why}", 80)))
    return sorted(out, key=lambda c: c[0] != "formula")  # (formulas first, then issues: any order is valid)


_BAND_NAME = re.compile(r"\s*\((?:rating\s*|level\s*|version\s*)?(\d+\s*(?:[–-]\s*\d+|\+)?)\)\s*$", re.I)


def tier_groups(entries):
    """{id(entry): {field: tier EXPR}} for the entries printed one row a rating band (`Matrix Relay` 1–3, 4–6, 7–9 and
    `Matrix Relay (Rating 10+)`): same name once the band is set aside, same category and page, each with its band
    (its rating, else the band in its name). Every row of the group gets the whole rule, for each field whose rows
    differ."""
    groups = {}
    for e in entries:
        a = e["attrs"]
        m = _BAND_NAME.search(e["name"])
        name = e["name"][:m.start()] if m else e["name"]
        b = band(str(a.get("rating") or "")) or (band(m.group(1)) if m else None)
        if b:
            groups.setdefault((name.strip().lower(), a.get("category"), e["page"]), []).append((b, e))
    out = {}
    for rows in groups.values():
        if len(rows) < 2 or len({b for b, _ in rows}) < len(rows):
            continue
        for f in ("cost", "avail", "essence", "capacity"):
            bands = []
            for (lo, hi), e in rows:
                v = printed(e["attrs"], f)
                if v is None or _DASH.fullmatch(v):
                    break
                p = plain(v, f)
                got = read(v, f) if p is None else (fmt(p), {})
                if not got or got[1]:
                    break
                bands.append((lo, hi, got[0]))
            else:
                if len({x for _, _, x in bands}) > 1:
                    expr = tier(bands)
                    for _, e in rows:
                        out.setdefault(id(e), {})[f] = expr
    return out
