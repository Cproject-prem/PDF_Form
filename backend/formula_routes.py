"""Formula API routes for FormForge.

Exposes `/api/formula/validate` and `/api/formula/evaluate` so the front-end
visual formula builder can validate expressions and live-preview results,
plus `/api/formula/functions` to power the function browser.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from formula_engine import (
    FormulaError, evaluate as eval_formula, extract_dependencies, validate as validate_formula,
)


class FormulaValidateIn(BaseModel):
    expression: str


class FormulaEvalIn(BaseModel):
    expression: str
    values: Dict[str, Any] = {}
    tables: Optional[Dict[str, List[dict]]] = None
    auto_load_tables: Optional[List[str]] = None  # e.g. ["SiteMaster"]


def build_formula_router(db, get_current_user):
    r = APIRouter(prefix="/formula", tags=["formula"])

    @r.get("/functions")
    async def functions():
        return {
            "categories": {
                "Logical": ["IF", "IFS", "AND", "OR", "NOT"],
                "Math":    ["SUM", "AVG", "MIN", "MAX", "COUNT", "ROUND", "ROUNDUP",
                            "ROUNDDOWN", "ABS", "SQRT", "POWER"],
                "Date":    ["TODAY", "NOW", "DATEDIFF", "YEAR", "MONTH", "DAY",
                            "HOUR", "MINUTE", "SECOND"],
                "Text":    ["CONCAT", "TEXT", "LEFT", "RIGHT", "MID", "LEN",
                            "LOWER", "UPPER", "TRIM", "REPLACE", "SUBSTITUTE"],
                "Search":  ["LOOKUP", "VLOOKUP", "XLOOKUP", "INDEX", "MATCH",
                            "ISBLANK", "ISNUMBER", "ISTEXT"],
            }
        }

    @r.post("/validate")
    async def validate(body: FormulaValidateIn):
        return validate_formula(body.expression)

    @r.post("/evaluate")
    async def evaluate(body: FormulaEvalIn):
        tables = dict(body.tables or {})
        # Auto-load well-known master tables on demand
        for name in (body.auto_load_tables or []):
            if name in ("SiteMaster", "Sites", "sites"):
                rows = await db.sites.find({}, {"_id": 0, "password_hash": 0}).to_list(100000)
                tables[name] = rows
            elif name in ("Vendors", "vendors"):
                rows = await db.vendors.find({}, {"_id": 0}).to_list(10000)
                tables[name] = rows
            elif name.startswith("master:"):
                table = name.split(":", 1)[1]
                rows = await db.master_data.find({"table": table}, {"_id": 0}).to_list(50000)
                tables[name] = [r.get("data", {}) for r in rows]
                tables[table] = tables[name]
        try:
            val = eval_formula(body.expression, body.values, tables)
            return {"ok": True, "value": val,
                    "dependencies": extract_dependencies(body.expression)}
        except FormulaError as e:
            return {"ok": False, "value": None, "error": str(e), "code": e.code}

    return r
