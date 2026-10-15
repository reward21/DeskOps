from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Tuple

import httpx

from app.core.config import settings


def _backtest_api_base() -> str:
    raw = (settings.backtest_api_base or "").strip().rstrip("/")
    if not raw:
        raw = os.environ.get("BACKTEST_API_BASE", "").strip().rstrip("/")
    if not raw:
        raw = os.environ.get("BACKTEST_API_URL", "").strip().rstrip("/")
    return raw or "http://127.0.0.1:8765"


def _safe_json_dump(payload: Any, *, max_chars: int = 12000) -> str:
    try:
        text = json.dumps(payload, indent=2, default=str)
    except Exception:
        text = str(payload)
    if len(text) > max_chars:
        return text[:max_chars] + "\n...truncated"
    return text


def _rows_to_objects(columns: List[str], rows: List[List[Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for row in rows:
        obj: Dict[str, Any] = {}
        for idx, col in enumerate(columns):
            obj[col] = row[idx] if idx < len(row) else None
        out.append(obj)
    return out


def _query_sql(client: httpx.Client, base: str, sql: str, limit: int) -> Dict[str, Any]:
    resp = client.post(f"{base}/api/query", json={"sql": sql, "limit": limit})
    resp.raise_for_status()
    data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(data.get("error") or "query failed")
    return data


def _fetch_insights(client: httpx.Client, base: str, run_id: str) -> Dict[str, Any]:
    resp = client.get(f"{base}/api/insights", params={"run_id": run_id})
    resp.raise_for_status()
    data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(data.get("error") or "insights failed")
    # remove large fields
    data.pop("report_markdown", None)
    return data


def build_backtest_context(run_id: str, *, limit: int = 50) -> Tuple[str, List[str]]:
    base = _backtest_api_base()
    errors: List[str] = []
    context: Dict[str, Any] = {"run_id": run_id, "source": base}

    with httpx.Client(timeout=httpx.Timeout(20.0)) as client:
        try:
            context["insights"] = _fetch_insights(client, base, run_id)
        except Exception as ex:
            errors.append(f"insights: {ex}")

        try:
            res = _query_sql(
                client,
                base,
                (
                    "SELECT gate_id, trade_count, win_rate, pf, expectancy, maxdd, ending_equity "
                    "FROM gate_metrics WHERE run_id = '{run_id}' ORDER BY gate_id"
                ).format(run_id=run_id),
                limit,
            )
            context["gate_metrics"] = _rows_to_objects(res.get("columns", []), res.get("rows", []))
        except Exception as ex:
            errors.append(f"gate_metrics: {ex}")

        try:
            res = _query_sql(
                client,
                base,
                (
                    "SELECT signal_id, side, entry_ts, exit_ts, pnl_points, exit_reason "
                    "FROM trades WHERE run_id = '{run_id}' ORDER BY entry_ts DESC"
                ).format(run_id=run_id),
                limit,
            )
            context["recent_trades"] = _rows_to_objects(res.get("columns", []), res.get("rows", []))
        except Exception as ex:
            errors.append(f"trades: {ex}")

        try:
            res = _query_sql(
                client,
                base,
                (
                    "SELECT gate_id, signal_id, entry_ts, exit_ts, pnl_points, exit_reason "
                    "FROM trades_pass WHERE run_id = '{run_id}' ORDER BY entry_ts DESC"
                ).format(run_id=run_id),
                limit,
            )
            context["recent_pass_trades"] = _rows_to_objects(res.get("columns", []), res.get("rows", []))
        except Exception as ex:
            errors.append(f"trades_pass: {ex}")

        try:
            res = _query_sql(
                client,
                base,
                (
                    "SELECT denial_code, COUNT(*) AS n "
                    "FROM gate_decisions WHERE run_id = '{run_id}' AND decision='FAIL' "
                    "GROUP BY denial_code ORDER BY n DESC"
                ).format(run_id=run_id),
                limit,
            )
            context["top_denials"] = _rows_to_objects(res.get("columns", []), res.get("rows", []))
        except Exception as ex:
            errors.append(f"gate_decisions: {ex}")

    return _safe_json_dump(context), errors
