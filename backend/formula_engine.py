"""Production-ready Formula / Calculation engine for FormForge.

Supports Excel-like syntax inside form field expressions:

  Arithmetic: + - * / % ^
  Logical:   IF, IFS, AND, OR, NOT
  Math:      SUM, AVG/AVERAGE, MIN, MAX, COUNT, ROUND, ROUNDUP, ROUNDDOWN,
             ABS, SQRT, POWER
  Date:      TODAY, NOW, DATEDIFF, YEAR, MONTH, DAY, HOUR, MINUTE, SECOND
  Text:      CONCAT/CONCATENATE, TEXT, LEFT, RIGHT, MID, LEN, LOWER, UPPER,
             TRIM, REPLACE, SUBSTITUTE
  Search:    LOOKUP, VLOOKUP, XLOOKUP, INDEX, MATCH,
             ISBLANK, ISNUMBER, ISTEXT

Field references use double-curly braces:  {{field_id}}
Tables used by LOOKUP/VLOOKUP/XLOOKUP/MATCH/INDEX are passed in as a dict
of  {table_name: [ {col: val}, ... ] }.
"""
from __future__ import annotations

import math
import re
from datetime import date, datetime, timezone
from typing import Any, Callable, Dict, List


class FormulaError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(f"#{code}: {message}")


# --------------------------- Tokenizer ---------------------------

_TOKEN_RE = re.compile(
    r"""
    \s*(?:
        (?P<FIELD>\{\{[A-Za-z_][\w]*\}\})
        |(?P<NUMBER>\d+(?:\.\d+)?)
        |(?P<STRING>"(?:[^"\\]|\\.)*")
        |(?P<IDENT>[A-Za-z_][A-Za-z0-9_]*)
        |(?P<OP><=|>=|<>|!=|==|=|<|>|\+|\-|\*|/|%|\^|\(|\)|,)
    )
    """,
    re.VERBOSE,
)


def _tokenize(expr: str):
    pos, out = 0, []
    while pos < len(expr):
        m = _TOKEN_RE.match(expr, pos)
        if not m or m.end() == pos:
            if expr[pos:].strip() == "":
                break
            raise FormulaError("INVALID_FORMULA", f"Unexpected char near {expr[pos:pos+10]!r}")
        pos = m.end()
        for n in ("FIELD", "NUMBER", "STRING", "IDENT", "OP"):
            v = m.group(n)
            if v is not None:
                out.append((n, v))
                break
    out.append(("END", ""))
    return out


# ----------------------------- Parser -----------------------------


class _Parser:
    def __init__(self, toks):
        self.t = toks
        self.i = 0

    def peek(self):
        return self.t[self.i]

    def eat(self):
        t = self.t[self.i]
        self.i += 1
        return t

    def parse(self):
        node = self.cmp()
        if self.peek()[0] != "END":
            raise FormulaError("INVALID_FORMULA", f"Unexpected token {self.peek()}")
        return node

    def cmp(self):
        left = self.add()
        while self.peek()[0] == "OP" and self.peek()[1] in ("<", ">", "<=", ">=", "=", "==", "<>", "!="):
            op = self.eat()[1]
            left = ("cmp", op, left, self.add())
        return left

    def add(self):
        left = self.mul()
        while self.peek()[0] == "OP" and self.peek()[1] in ("+", "-"):
            op = self.eat()[1]
            left = ("bin", op, left, self.mul())
        return left

    def mul(self):
        left = self.pow()
        while self.peek()[0] == "OP" and self.peek()[1] in ("*", "/", "%"):
            op = self.eat()[1]
            left = ("bin", op, left, self.pow())
        return left

    def pow(self):
        left = self.un()
        if self.peek()[0] == "OP" and self.peek()[1] == "^":
            self.eat()
            left = ("bin", "^", left, self.pow())
        return left

    def un(self):
        if self.peek()[0] == "OP" and self.peek()[1] == "-":
            self.eat()
            return ("neg", self.un())
        if self.peek()[0] == "OP" and self.peek()[1] == "+":
            self.eat()
            return self.un()
        return self.atom()

    def atom(self):
        k, v = self.peek()
        if k == "NUMBER":
            self.eat()
            return ("num", float(v))
        if k == "STRING":
            self.eat()
            return ("str", v[1:-1].replace('\\"', '"').replace("\\\\", "\\"))
        if k == "FIELD":
            self.eat()
            return ("field", v[2:-2])
        if k == "IDENT":
            name = self.eat()[1]
            if self.peek()[0] == "OP" and self.peek()[1] == "(":
                self.eat()
                args = []
                if not (self.peek()[0] == "OP" and self.peek()[1] == ")"):
                    args.append(self.cmp())
                    while self.peek()[0] == "OP" and self.peek()[1] == ",":
                        self.eat()
                        args.append(self.cmp())
                if not (self.peek()[0] == "OP" and self.peek()[1] == ")"):
                    raise FormulaError("INVALID_FORMULA", "Expected ')'")
                self.eat()
                return ("call", name.upper(), args)
            up = name.upper()
            if up == "TRUE":
                return ("bool", True)
            if up == "FALSE":
                return ("bool", False)
            if up == "NULL":
                return ("null",)
            return ("field", name)
        if k == "OP" and v == "(":
            self.eat()
            node = self.cmp()
            if not (self.peek()[0] == "OP" and self.peek()[1] == ")"):
                raise FormulaError("INVALID_FORMULA", "Expected ')'")
            self.eat()
            return node
        raise FormulaError("INVALID_FORMULA", f"Unexpected {k}:{v}")


# ---------------------------- Coercions ----------------------------


def _num(v):
    if v is None or v == "":
        return 0.0
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v)
        except ValueError as e:
            raise FormulaError("INVALID_VALUE", f"Cannot convert {v!r} to number") from e
    raise FormulaError("INVALID_VALUE", f"Cannot convert {v!r} to number")


def _str(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def _bool(v):
    if isinstance(v, bool):
        return v
    if v is None or v == "":
        return False
    if isinstance(v, (int, float)):
        return v != 0
    if isinstance(v, str):
        return v.upper() not in ("", "FALSE", "0", "NO")
    return bool(v)


def _binop(op, a, b):
    if op == "+":
        try:
            return _num(a) + _num(b)
        except FormulaError:
            return _str(a) + _str(b)
    if op == "-":
        return _num(a) - _num(b)
    if op == "*":
        return _num(a) * _num(b)
    if op == "/":
        nb = _num(b)
        if nb == 0:
            raise FormulaError("DIV_ZERO", "Division by zero")
        return _num(a) / nb
    if op == "%":
        nb = _num(b)
        if nb == 0:
            raise FormulaError("DIV_ZERO", "Modulo by zero")
        return _num(a) % nb
    if op == "^":
        return _num(a) ** _num(b)
    raise FormulaError("INVALID_FORMULA", f"Bad op {op}")


def _cmp(op, a, b):
    if op in ("=", "=="):
        if isinstance(a, str) or isinstance(b, str):
            return _str(a) == _str(b)
        return _num(a) == _num(b)
    if op in ("<>", "!="):
        return not _cmp("=", a, b)
    if op == "<":
        return _num(a) < _num(b)
    if op == ">":
        return _num(a) > _num(b)
    if op == "<=":
        return _num(a) <= _num(b)
    if op == ">=":
        return _num(a) >= _num(b)
    raise FormulaError("INVALID_FORMULA", f"Bad cmp {op}")


# ---------------------------- Functions ----------------------------


def _f_if(a, c, ev):
    if len(a) < 2:
        raise FormulaError("INVALID_FORMULA", "IF needs (cond, then[, else])")
    return ev(a[1]) if _bool(ev(a[0])) else (ev(a[2]) if len(a) > 2 else False)


def _f_ifs(a, c, ev):
    if len(a) % 2:
        raise FormulaError("INVALID_FORMULA", "IFS needs pairs")
    for i in range(0, len(a), 2):
        if _bool(ev(a[i])):
            return ev(a[i + 1])
    return None


def _f_and(a, c, ev): return all(_bool(ev(x)) for x in a)
def _f_or(a, c, ev):  return any(_bool(ev(x)) for x in a)
def _f_not(a, c, ev): return not _bool(ev(a[0]))


def _flat_nums(a, ev):
    out = []
    for x in a:
        v = ev(x)
        if isinstance(v, list):
            out += [_num(z) for z in v if z is not None and z != ""]
        elif v is not None and v != "":
            out.append(_num(v))
    return out


def _f_sum(a, c, ev): return sum(_flat_nums(a, ev))
def _f_avg(a, c, ev):
    n = _flat_nums(a, ev)
    return sum(n) / len(n) if n else 0
def _f_min(a, c, ev):
    n = _flat_nums(a, ev); return min(n) if n else 0
def _f_max(a, c, ev):
    n = _flat_nums(a, ev); return max(n) if n else 0
def _f_count(a, c, ev):
    cnt = 0
    for x in a:
        v = ev(x)
        if isinstance(v, list):
            cnt += sum(1 for z in v if z is not None and z != "")
        elif v is not None and v != "":
            cnt += 1
    return cnt


def _f_round(a, c, ev):
    n = _num(ev(a[0])); d = int(_num(ev(a[1]))) if len(a) > 1 else 0
    return round(n, d)
def _f_roundup(a, c, ev):
    n = _num(ev(a[0])); d = int(_num(ev(a[1]))) if len(a) > 1 else 0
    f = 10 ** d; return math.ceil(n * f) / f
def _f_rounddn(a, c, ev):
    n = _num(ev(a[0])); d = int(_num(ev(a[1]))) if len(a) > 1 else 0
    f = 10 ** d; return math.floor(n * f) / f
def _f_abs(a, c, ev):   return abs(_num(ev(a[0])))
def _f_sqrt(a, c, ev):
    n = _num(ev(a[0]))
    if n < 0: raise FormulaError("INVALID_VALUE", "SQRT of negative")
    return math.sqrt(n)
def _f_power(a, c, ev): return _num(ev(a[0])) ** _num(ev(a[1]))


def _f_today(a, c, ev): return date.today().isoformat()
def _f_now(a, c, ev):   return datetime.now(timezone.utc).isoformat()


def _parse_date(v):
    if v in (None, ""): return None
    if isinstance(v, (datetime, date)): return v
    s = str(v)
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try: return datetime.strptime(s.replace("Z", "+0000"), fmt)
        except (ValueError, TypeError): continue
    try: return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError: raise FormulaError("INVALID_VALUE", f"Cannot parse date {s!r}")


def _f_datediff(a, c, ev):
    if len(a) < 2: raise FormulaError("INVALID_FORMULA", "DATEDIFF(start, end[, unit])")
    x = _parse_date(ev(a[0])); y = _parse_date(ev(a[1]))
    unit = _str(ev(a[2])).upper() if len(a) > 2 else "D"
    if x is None or y is None: return 0
    if isinstance(x, date) and not isinstance(x, datetime): x = datetime(x.year, x.month, x.day)
    if isinstance(y, date) and not isinstance(y, datetime): y = datetime(y.year, y.month, y.day)
    d = y - x
    if unit == "D": return d.days
    if unit == "H": return d.total_seconds() / 3600
    if unit == "M": return (y.year - x.year) * 12 + (y.month - x.month)
    if unit == "Y": return y.year - x.year
    return d.days


def _f_year(a, c, ev):  d = _parse_date(ev(a[0])); return d.year if d else 0
def _f_month(a, c, ev): d = _parse_date(ev(a[0])); return d.month if d else 0
def _f_day(a, c, ev):   d = _parse_date(ev(a[0])); return d.day if d else 0
def _f_hour(a, c, ev):  d = _parse_date(ev(a[0])); return d.hour if isinstance(d, datetime) else 0
def _f_min_(a, c, ev):  d = _parse_date(ev(a[0])); return d.minute if isinstance(d, datetime) else 0
def _f_sec(a, c, ev):   d = _parse_date(ev(a[0])); return d.second if isinstance(d, datetime) else 0


def _f_concat(a, c, ev): return "".join(_str(ev(x)) for x in a)
def _f_text(a, c, ev):   return _str(ev(a[0]))
def _f_left(a, c, ev):
    s = _str(ev(a[0])); n = int(_num(ev(a[1]))) if len(a) > 1 else 1; return s[:n]
def _f_right(a, c, ev):
    s = _str(ev(a[0])); n = int(_num(ev(a[1]))) if len(a) > 1 else 1
    return s[-n:] if n > 0 else ""
def _f_mid(a, c, ev):
    s = _str(ev(a[0])); st = int(_num(ev(a[1]))) - 1; ln = int(_num(ev(a[2])))
    return s[max(0, st):max(0, st) + ln]
def _f_len(a, c, ev):    return len(_str(ev(a[0])))
def _f_lower(a, c, ev):  return _str(ev(a[0])).lower()
def _f_upper(a, c, ev):  return _str(ev(a[0])).upper()
def _f_trim(a, c, ev):   return _str(ev(a[0])).strip()
def _f_replace(a, c, ev):
    s = _str(ev(a[0])); st = int(_num(ev(a[1]))) - 1
    ln = int(_num(ev(a[2]))); new = _str(ev(a[3]))
    return s[:st] + new + s[st + ln:]
def _f_subst(a, c, ev):
    return _str(ev(a[0])).replace(_str(ev(a[1])), _str(ev(a[2])))


# Lookup-style ---------------------------------------------------------------

def _f_lookup(a, c, ev):
    """LOOKUP(value, table_name, key_col, return_col)"""
    if len(a) < 4: raise FormulaError("INVALID_FORMULA", "LOOKUP(value, table, key, return)")
    val = ev(a[0]); tbl = _str(ev(a[1])); kcol = _str(ev(a[2])); rcol = _str(ev(a[3]))
    rows = (c.get("tables") or {}).get(tbl) or []
    for r in rows:
        if _str(r.get(kcol)) == _str(val):
            return r.get(rcol)
    return None


def _f_vlookup(a, c, ev): return _f_lookup(a[:4], c, ev)
def _f_xlookup(a, c, ev):
    r = _f_lookup(a[:4], c, ev)
    if r is None and len(a) >= 5: return ev(a[4])
    return r


def _f_match(a, c, ev):
    val = ev(a[0]); tbl = _str(ev(a[1])); kcol = _str(ev(a[2]))
    rows = (c.get("tables") or {}).get(tbl) or []
    for i, r in enumerate(rows):
        if _str(r.get(kcol)) == _str(val):
            return i + 1
    raise FormulaError("LOOKUP_NOT_FOUND", f"MATCH: {val!r} not found")


def _f_index(a, c, ev):
    tbl = _str(ev(a[0])); idx = int(_num(ev(a[1]))) - 1; col = _str(ev(a[2]))
    rows = (c.get("tables") or {}).get(tbl) or []
    if 0 <= idx < len(rows): return rows[idx].get(col)
    raise FormulaError("LOOKUP_NOT_FOUND", "INDEX out of range")


def _f_isblank(a, c, ev):
    v = ev(a[0]); return v is None or v == ""
def _f_isnumber(a, c, ev):
    v = ev(a[0])
    if isinstance(v, bool): return False
    if isinstance(v, (int, float)): return True
    if isinstance(v, str):
        try: float(v); return True
        except ValueError: return False
    return False
def _f_istext(a, c, ev):
    return isinstance(ev(a[0]), str)


FUNCS: Dict[str, Callable] = {
    "IF": _f_if, "IFS": _f_ifs, "AND": _f_and, "OR": _f_or, "NOT": _f_not,
    "SUM": _f_sum, "AVG": _f_avg, "AVERAGE": _f_avg, "MIN": _f_min, "MAX": _f_max,
    "COUNT": _f_count, "ROUND": _f_round, "ROUNDUP": _f_roundup, "ROUNDDOWN": _f_rounddn,
    "ABS": _f_abs, "SQRT": _f_sqrt, "POWER": _f_power,
    "TODAY": _f_today, "NOW": _f_now, "DATEDIFF": _f_datediff,
    "YEAR": _f_year, "MONTH": _f_month, "DAY": _f_day,
    "HOUR": _f_hour, "MINUTE": _f_min_, "SECOND": _f_sec,
    "CONCAT": _f_concat, "CONCATENATE": _f_concat, "TEXT": _f_text,
    "LEFT": _f_left, "RIGHT": _f_right, "MID": _f_mid, "LEN": _f_len,
    "LOWER": _f_lower, "UPPER": _f_upper, "TRIM": _f_trim,
    "REPLACE": _f_replace, "SUBSTITUTE": _f_subst,
    "LOOKUP": _f_lookup, "VLOOKUP": _f_vlookup, "XLOOKUP": _f_xlookup,
    "INDEX": _f_index, "MATCH": _f_match,
    "ISBLANK": _f_isblank, "ISNUMBER": _f_isnumber, "ISTEXT": _f_istext,
}


# ----------------------------- Public ------------------------------


def evaluate(expr: str, values: Dict[str, Any], tables: Dict[str, List[dict]] | None = None):
    if not expr or not expr.strip(): return None
    src = expr.strip().lstrip("=")
    ast = _Parser(_tokenize(src)).parse()
    ctx = {"values": values or {}, "tables": tables or {}}

    def ev(n):
        if n is None: return None
        k = n[0]
        if k == "num": return n[1]
        if k == "str": return n[1]
        if k == "bool": return n[1]
        if k == "null": return None
        if k == "field": return ctx["values"].get(n[1])
        if k == "bin": return _binop(n[1], ev(n[2]), ev(n[3]))
        if k == "cmp": return _cmp(n[1], ev(n[2]), ev(n[3]))
        if k == "neg": return -_num(ev(n[1]))
        if k == "call":
            fn = FUNCS.get(n[1])
            if not fn: raise FormulaError("INVALID_FORMULA", f"Unknown function {n[1]}")
            return fn(n[2], ctx, ev)
        raise FormulaError("INVALID_FORMULA", f"Bad node {k}")

    return ev(ast)


def extract_dependencies(expr: str) -> List[str]:
    if not expr: return []
    out, seen = [], set()
    src = expr.strip().lstrip("=")
    try:
        toks = _tokenize(src)
    except FormulaError:
        for m in re.finditer(r"\{\{([A-Za-z_][\w]*)\}\}", src):
            if m.group(1) not in seen:
                out.append(m.group(1)); seen.add(m.group(1))
        return out
    fnames = set(FUNCS.keys()) | {"TRUE", "FALSE", "NULL"}
    for i, (t, v) in enumerate(toks):
        if t == "FIELD":
            fid = v[2:-2]
            if fid not in seen: out.append(fid); seen.add(fid)
        elif t == "IDENT":
            if v.upper() in fnames: continue
            nxt = toks[i + 1] if i + 1 < len(toks) else ("END", "")
            if not (nxt[0] == "OP" and nxt[1] == "("):
                if v not in seen: out.append(v); seen.add(v)
    return out


def validate(expr: str) -> dict:
    if not expr or not expr.strip(): return {"valid": True, "dependencies": []}
    try:
        _Parser(_tokenize(expr.strip().lstrip("="))).parse()
        return {"valid": True, "dependencies": extract_dependencies(expr)}
    except FormulaError as e:
        return {"valid": False, "error": str(e), "code": e.code}
