from __future__ import annotations

import hashlib
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings


def _ollama_base_url() -> str:
    raw = (settings.ollama_base_url or "").strip().rstrip("/")
    if not raw:
        raw = os.environ.get("OLLAMA_BASE_URL", "").strip().rstrip("/")
    if not raw:
        raw = os.environ.get("OLLAMA_URL", "").strip().rstrip("/")
    # Normalize common variants like /api or /api/generate.
    if raw.endswith("/api/generate"):
        raw = raw[: -len("/api/generate")]
    if raw.endswith("/api"):
        raw = raw[: -len("/api")]
    if "/api/" in raw:
        raw = raw.split("/api/", 1)[0]
    return raw or "http://127.0.0.1:11434"


def get_ollama_base_url() -> str:
    return _ollama_base_url()


def _default_model() -> str:
    return (settings.ollama_model or os.environ.get("OLLAMA_MODEL", "") or "llama3.2:1b").strip()


def _http_timeout(total_s: int) -> httpx.Timeout:
    return httpx.Timeout(timeout=total_s)


def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%fZ")


def connect_memory_db() -> sqlite3.Connection:
    db_path = Path(settings.llm_memory_db_path).expanduser()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path.resolve()))
    ensure_llm_memory_schema(conn)
    tune_llm_memory_db(conn)
    return conn


def memory_db_path() -> str:
    return str(Path(settings.llm_memory_db_path).expanduser())


def ensure_llm_memory_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS llm_memory (
          memory_id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          run_id TEXT NOT NULL,
          analysis_mode TEXT NOT NULL,
          model TEXT NOT NULL,
          user_prompt TEXT NOT NULL DEFAULT '',
          query_sql TEXT NOT NULL DEFAULT '',
          query_limit INTEGER NOT NULL DEFAULT 0,
          query_row_count INTEGER NOT NULL DEFAULT 0,
          include_report INTEGER NOT NULL DEFAULT 0,
          context_truncated INTEGER NOT NULL DEFAULT 0,
          context_chars INTEGER NOT NULL DEFAULT 0,
          context_hash TEXT NOT NULL DEFAULT '',
          response_markdown TEXT NOT NULL DEFAULT '',
          error_text TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_llm_memory_run_id_created
          ON llm_memory(run_id, created_at_utc DESC, memory_id DESC);
        CREATE INDEX IF NOT EXISTS idx_llm_memory_created
          ON llm_memory(created_at_utc DESC, memory_id DESC);
        CREATE INDEX IF NOT EXISTS idx_llm_memory_run_mode_created
          ON llm_memory(run_id, analysis_mode, created_at_utc DESC, memory_id DESC);
        """
    )
    conn.commit()


def tune_llm_memory_db(conn: sqlite3.Connection) -> None:
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
    except Exception:
        pass
    try:
        conn.execute("PRAGMA synchronous=NORMAL;")
    except Exception:
        pass
    try:
        conn.execute("PRAGMA temp_store=MEMORY;")
    except Exception:
        pass
    try:
        conn.execute("PRAGMA cache_size=-8000;")
    except Exception:
        pass


def save_llm_memory_entry(
    conn: sqlite3.Connection,
    *,
    run_id: str,
    analysis_mode: str,
    model: str,
    user_prompt: str,
    response_markdown: str,
    context_hash: str,
    error_text: str = "",
) -> int:
    cur = conn.execute(
        """
        INSERT INTO llm_memory (
          run_id, analysis_mode, model, user_prompt, response_markdown, context_hash, error_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(run_id or "").strip(),
            str(analysis_mode or "chat").strip(),
            str(model or "").strip(),
            str(user_prompt or ""),
            str(response_markdown or ""),
            str(context_hash or ""),
            str(error_text or ""),
        ),
    )
    conn.commit()
    return int(cur.lastrowid)


def list_llm_memory_entries(conn: sqlite3.Connection, *, run_id: str = "", limit: int = 20) -> List[Dict[str, Any]]:
    n = max(1, min(int(limit), 200))
    rid = str(run_id or "").strip()
    if rid:
        cur = conn.execute(
            """
            SELECT
              memory_id, created_at_utc, run_id, analysis_mode, model, user_prompt,
              response_markdown, error_text
            FROM llm_memory
            WHERE run_id = ?
            ORDER BY created_at_utc DESC, memory_id DESC
            LIMIT ?
            """,
            (rid, n),
        )
    else:
        cur = conn.execute(
            """
            SELECT
              memory_id, created_at_utc, run_id, analysis_mode, model, user_prompt,
              response_markdown, error_text
            FROM llm_memory
            ORDER BY created_at_utc DESC, memory_id DESC
            LIMIT ?
            """,
            (n,),
        )
    cols = [d[0] for d in (cur.description or [])]
    rows = cur.fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        out.append({cols[i]: row[i] for i in range(len(cols))})
    return out


def ollama_list_models() -> List[str]:
    base = _ollama_base_url()
    try:
        with httpx.Client(timeout=_http_timeout(10)) as client:
            resp = client.get(f"{base}/api/tags")
        resp.raise_for_status()
        payload = resp.json()
        models: List[str] = []
        for item in payload.get("models", []):
            name = str(item.get("name") or "").strip()
            if name:
                models.append(name)
        return models
    except Exception:
        return []


def ollama_generate(prompt: str, model: str = "", timeout_s: Optional[int] = None) -> Dict[str, Any]:
    model_name = (model or _default_model()).strip()
    if not model_name:
        model_name = "llama3.2:1b"
    effective_timeout_s = int(timeout_s or settings.ollama_timeout_s or 300)

    base = _ollama_base_url()
    url = f"{base}/api/generate"
    payload = {"model": model_name, "prompt": prompt, "stream": False}

    try:
        with httpx.Client(timeout=_http_timeout(effective_timeout_s)) as client:
            resp = client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
    except httpx.TimeoutException:
        raise TimeoutError(f"Ollama request timed out after {effective_timeout_s}s.")
    except httpx.HTTPStatusError as ex:
        body = ex.response.text[:500] if ex.response.text else ""
        msg = f"Ollama HTTP {ex.response.status_code}"
        if body:
            msg += f": {body}"
        raise RuntimeError(msg)
    except httpx.RequestError as ex:
        raise RuntimeError(f"Ollama connection error: {ex}")

    answer = str(data.get("response") or "").strip()
    return {"model": model_name, "answer": answer, "timeout_s": effective_timeout_s}


def _build_chat_prompt(user_prompt: str, memory_rows: List[Dict[str, Any]], model: str) -> str:
    system = (
        "You are TechGPT-Agent, running LOCALLY on this computer via Ollama.\n"
        f"Current model: {model}.\n"
        "Rules:\n"
        "- A backtest context block may be provided below; use it to answer questions about runs, trades, gates, and metrics.\n"
        "- If the question references a specific run but no context is present, ask the user to select a run_id.\n"
        "- You can fetch URL content when the user provides a link.\n"
        "- If fetched content is included below under 'Fetched URL content', use it.\n"
        "- If a fetch fails, say so and ask for another link.\n"
        "- You have read-only filesystem access via chat commands: /root, /ls <path>, /cat <path>.\n"
        "- Suggest /root /ls /cat when the user asks to inspect files or logs.\n"
        "- If asked about your model/version, state the model name exactly.\n"
        "- Memory is persisted in SQLite at DeskOps/db/llm_memory.sqlite.\n"
        "- Be helpful, concise, and practical.\n"
    )
    lines: List[str] = [system, "Conversation history:"]
    for row in memory_rows:
        up = str(row.get("user_prompt") or "").strip()
        ans = str(row.get("response_markdown") or "").strip()
        if up:
            lines.append(f"User: {up}")
        if ans:
            lines.append(f"Assistant: {ans}")
    lines.append(f"User: {user_prompt}")
    lines.append("Assistant:")
    return "\n".join(lines)


def _ensure_bootstrap_memory(conn: sqlite3.Connection, run_id: str, model: str) -> None:
    cur = conn.execute("SELECT 1 FROM llm_memory WHERE run_id = ? LIMIT 1", (run_id,))
    if cur.fetchone():
        return
    info = (
        "System memory bootstrap:\n"
        "- Memory DB: DeskOps/db/llm_memory.sqlite\n"
        "- Read-only FS access via chat commands: /root, /ls <path>, /cat <path>\n"
        "- envrc files (if needed): /gulfchain/.envrc and /gulfchain/DeskOps/.envrc\n"
        "- This chat uses stored memory rows as context.\n"
    )
    context_hash = hashlib.sha256(info.encode("utf-8")).hexdigest()
    save_llm_memory_entry(
        conn,
        run_id=run_id,
        analysis_mode="system",
        model=model,
        user_prompt="bootstrap",
        response_markdown=info,
        context_hash=context_hash,
        error_text="",
    )


def ollama_chat(
    *,
    prompt: str,
    model: str,
    run_id: str,
    include_memory: bool,
    memory_limit: int,
    timeout_s: Optional[int] = None,
) -> Dict[str, Any]:
    prompt = str(prompt or "").strip()
    if not prompt:
        raise ValueError("prompt is required")
    rid = str(run_id or "chat").strip() or "chat"

    memory_rows: List[Dict[str, Any]] = []
    if include_memory:
        conn = connect_memory_db()
        try:
            model_name = (model or _default_model()).strip() or "llama3.2:1b"
            _ensure_bootstrap_memory(conn, rid, model_name)
            rows = list_llm_memory_entries(conn, run_id=rid, limit=memory_limit)
            memory_rows = list(reversed(rows))
        finally:
            conn.close()

    full_prompt = _build_chat_prompt(prompt, memory_rows, model_name)
    context_hash = hashlib.sha256(full_prompt.encode("utf-8")).hexdigest()
    generated = ollama_generate(full_prompt, model=model_name, timeout_s=timeout_s)

    conn = connect_memory_db()
    try:
        memory_id = save_llm_memory_entry(
            conn,
            run_id=rid,
            analysis_mode="chat",
            model=generated["model"],
            user_prompt=prompt,
            response_markdown=generated["answer"],
            context_hash=context_hash,
            error_text="",
        )
    finally:
        conn.close()

    return {
        "model": generated["model"],
        "answer": generated["answer"],
        "timeout_s": generated["timeout_s"],
        "memory_id": memory_id,
        "run_id": rid,
    }
