"""Printed formulas: read a value the way a book prints it ('Rating x 2,000¥', '1,000¥ + [500¥ x Size]', '300¥ per CF',
'Magic*100¥', '2,000¥ (+500¥ per additional dart)', '(Rating/3)', a tiered table) into a small expression, evaluate it,
and check whether Commlink6's flattened numbers are that expression at some rating, size or count (step 4).

The expression grammar is the one the storage design proposes (cl6-examples.md, step 4): numbers; the variables
`rating`, `qty` (a count: CF, sensor types, darts, …) and `magic`/`force`; + - * /; `ceil()`, `floor()`, `min()`, `max()`;
`base` (the price of the item it modifies or copies). `read()` returns (expression, variable) or None; `evaluate()`
computes it; `flattened()` returns the binding that reproduces Commlink6's values, or None."""

import ast
import math
import re

VARS = {
    "rating": "rating",
    "level": "rating",
    "force": "rating",
    "size": "rating",
    "cf": "qty",
    "capacity": "qty",
    "magic": "rating",
    "grade": "rating",
}
UNITS = r"cf|sensor types?|additional \w+|dart|darts|dose|doses|meter|meters|m3|unit|units"
NUM = r"\d[\d,]*(?:\.\d+)?"


def _num(s):
    return s.replace(",", "")


def read(text):
    """(expression, variable) of a printed value, or None: the variable the expression needs ('rating' or 'qty', '' for
    a constant). A trailing note in parentheses ('(10 uses)') is set aside."""
    got = _read(text)
    if got is None and re.search(r"\([^)]*[a-z][^)]*\)\s*$", text or "", re.I):
        got = _read(re.sub(r"\s*\([^)]*\)\s*$", "", text))
    return got


def _read(text):
    t = (text or "").strip().replace("×", "x").replace("¥", "").replace("–", "-")
    t = re.sub(r"\s+", " ", t)
    if not t or t in ("-", "—"):
        return None
    m = re.fullmatch(rf"({NUM}) \(\+({NUM}) per additional \w+\)", t)
    if m:  # 2,000 (+500 per additional dart): the first one is in the base price
        return f"{_num(m.group(1))} + {_num(m.group(2))} * (qty - 1)", "qty"
    m = re.fullmatch(rf"({NUM}) (?:per|/) ({UNITS})", t, re.I)
    if m:  # 300 per CF, 250 per sensor type
        return f"{_num(m.group(1))} * qty", "qty"
    e = t.lower()
    e = re.sub(r"\(\s*(rating|force|level)\s*\)", r"\1", e)
    e = re.sub(r"\[|\]", " ", e)
    e = re.sub(r"(?<=\d),(?=\d{3})", "", e)
    e = re.sub(r"\s*\((?:[lirf])\)\s*$|\s+[lirf]$", "", e)  # a legality letter
    e = re.sub(r"\bx\b|\*", " * ", e)
    words = set(re.findall(r"[a-z]+", e))
    if not words <= set(VARS):
        return None
    var = ""
    for w in words:
        var = VARS[w]
        e = re.sub(rf"\b{w}\b", var, e)
    try:
        ast.parse(e, mode="eval")
    except SyntaxError:
        return None
    return re.sub(r"\s+", " ", e).strip(), var


def evaluate(expr, env, div="ceil"):
    """The value of an expression for the variables in env; '/' rounds up (the engine's rated()) or down (div='floor')."""
    tree = ast.parse(expr, mode="eval")

    def ev(n):
        if isinstance(n, ast.Expression):
            return ev(n.body)
        if isinstance(n, ast.Constant):
            return float(n.value)
        if isinstance(n, ast.Name):
            return float(env[n.id])
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.USub):
            return -ev(n.operand)
        if isinstance(n, ast.BinOp):
            a, b = ev(n.left), ev(n.right)
            if isinstance(n.op, ast.Add):
                return a + b
            if isinstance(n.op, ast.Sub):
                return a - b
            if isinstance(n.op, ast.Mult):
                return a * b
            if isinstance(n.op, ast.Div):
                return (math.floor if div == "floor" else math.ceil)(a / b)
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in ("ceil", "floor", "min", "max"):
            args = [ev(x) for x in n.args]
            return {"ceil": math.ceil, "floor": math.floor, "min": min, "max": max}[n.func.id](*args)
        raise ValueError(ast.dump(n))

    return ev(tree)


def tiered(bands, r):
    """The value at rating r of a tiered price: bands [(lo, hi, expression)]."""
    for lo, hi, expr in bands:
        if lo <= r <= hi:
            return evaluate(expr, {"rating": r})
    return None


def _close(a, b):
    return a is not None and b is not None and abs(a - b) <= 1e-6 * max(1.0, abs(a), abs(b))


def flattened(text, cl6, qty=None, base=None):
    """How Commlink6's values cl6 ({rating or None: number}) come from the printed formula text: a short proof string
    ('rating 1..6: 200 * rating (floor /)'), or None. qty: the counts to try for a per-unit price (a printed range
    such as Space 1–9 gives its top); base: {rating or None: the base item's price} for a formula with `base`."""
    got = read(text)
    if got is None:
        return None
    expr, var = got
    vals = {r: v for r, v in cl6.items() if isinstance(v, (int, float))}
    if not vals:
        return None
    for div in ("ceil", "floor"):
        if var == "rating" and all(r is not None for r in vals):
            try:
                if all(_close(evaluate(expr, {"rating": r}, div), v) for r, v in vals.items()):
                    rs = sorted(vals)
                    return f"rating {rs[0]}..{rs[-1]}: {expr}" + (
                        " (/ rounds down)" if div == "floor" and "/" in expr else ""
                    )
            except (ValueError, ZeroDivisionError):
                return None
        if var == "rating" and list(vals) == [None]:
            for r in range(1, 21):  # Commlink6 keeps one value: the formula at one rating
                if _close(evaluate(expr, {"rating": r}, div), vals[None]):
                    return f"{expr} at rating {r}"
        if var == "qty":
            want = sorted(vals.items(), key=lambda x: (x[0] is None, x[0] or 0))
            if all(r is not None for r, _ in want) and all(_close(evaluate(expr, {"qty": r}), v) for r, v in want):
                return f"count = rating {want[0][0]}..{want[-1][0]}: {expr}"
            for q in qty or []:
                if _close(evaluate(expr, {"qty": q}), want[0][1]):
                    return f"{expr} at count {q}"
    return None
