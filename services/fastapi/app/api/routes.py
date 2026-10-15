from fastapi import APIRouter, Request

from app.core.config import settings
from app.models.schemas import HealthResponse, ImportRequest, ImportResponse
from app.services.sqlite_importer import import_sqlite_to_postgres
from app.services.ollama_backtest import (
    connect_memory_db,
    get_ollama_base_url,
    list_llm_memory_entries,
    memory_db_path,
    ollama_chat,
    ollama_list_models,
)
from app.services.backtest_context import build_backtest_context
from app.services.fs_access import list_dir, read_file, root_path
from app.services.net_access import extract_urls, fetch_url

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service=settings.app_name)


@router.post("/v1/import/backtests", response_model=ImportResponse)
async def import_backtests(req: ImportRequest) -> ImportResponse:
    sqlite_path = req.sqlite_path or settings.backtest_sqlite_path
    imported = import_sqlite_to_postgres(sqlite_path, settings.database_url, limit=req.limit)
    return ImportResponse(ok=True, imported_tables=imported, notes=["SQLite read-only", "Market data untouched"])


@router.get("/v1/ollama/models")
def ollama_models() -> dict:
    models = ollama_list_models()
    default_model = (settings.ollama_model or "").strip() or "llama3.2:1b"
    return {
        "ok": True,
        "models": models,
        "default_model": default_model,
        "base_url": get_ollama_base_url(),
    }


@router.get("/v1/ollama/memory")
def ollama_memory(request: Request) -> dict:
    run_id = request.query_params.get("run_id", "").strip()
    limit_raw = request.query_params.get("limit", "20")
    try:
        limit = int(limit_raw)
    except Exception:
        limit = 20
    conn = connect_memory_db()
    try:
        rows = list_llm_memory_entries(conn, run_id=run_id, limit=limit)
    finally:
        conn.close()
    return {
        "ok": True,
        "memory_db_path": memory_db_path(),
        "run_id": run_id,
        "rows": rows,
        "row_count": len(rows),
    }


@router.post("/v1/ollama/chat")
async def ollama_chat_handler(request: Request) -> dict:
    payload = await request.json()
    prompt = str(payload.get("prompt", "") or "").strip()
    model = str(payload.get("model", "") or "").strip()
    run_id = str(payload.get("run_id", "") or "").strip()
    include_memory = bool(payload.get("include_memory", True))
    include_backtest_context = bool(payload.get("include_backtest_context", True))
    context_limit_raw = payload.get("context_limit", 50)
    memory_limit_raw = payload.get("memory_limit", 8)
    timeout_raw = payload.get("timeout_s", settings.ollama_timeout_s)

    try:
        memory_limit = int(memory_limit_raw)
    except Exception:
        memory_limit = 8
    try:
        context_limit = int(context_limit_raw)
    except Exception:
        context_limit = 50
    try:
        timeout_s = int(timeout_raw)
    except Exception:
        timeout_s = settings.ollama_timeout_s

    try:
        fetched = []
        url_blocks = []
        urls = extract_urls(prompt)
        if not urls and run_id:
            # Look back into recent memory for the latest URL if user refers to "the link I sent".
            conn = connect_memory_db()
            try:
                rows = list_llm_memory_entries(conn, run_id=run_id, limit=20)
            finally:
                conn.close()
            for row in rows:
                urls = extract_urls(row.get("user_prompt", ""))
                if urls:
                    break
        for url in urls:
            try:
                res = fetch_url(url)
                fetched.append({k: res[k] for k in ("url", "status", "content_type", "truncated")})
                snippet = res.get("body", "")
                if len(snippet) > 20000:
                    snippet = snippet[:20000]
                url_blocks.append(
                    f"URL: {res.get('url')}\nstatus: {res.get('status')}\ncontent_type: {res.get('content_type')}\n\n{snippet}"
                )
            except Exception as ex:
                fetched.append({"url": url, "error": str(ex)})
        prompt_with_context = prompt
        if url_blocks:
            prompt_with_context = (
                f"{prompt}\n\nFetched URL content:\n" + "\n\n---\n\n".join(url_blocks)
            )
        if include_backtest_context and run_id:
            ctx_block, ctx_errors = build_backtest_context(run_id, limit=context_limit)
            if ctx_block:
                err_text = ""
                if ctx_errors:
                    err_text = "Context fetch warnings:\\n" + "\\n".join(ctx_errors)
                prompt_with_context = (
                    f"{prompt_with_context}\n\nBacktest context (run_id={run_id}):\n"
                    f"{ctx_block}\n"
                    f"{err_text}"
                )
        data = ollama_chat(
            prompt=prompt_with_context,
            model=model,
            run_id=run_id,
            include_memory=include_memory,
            memory_limit=memory_limit,
            timeout_s=timeout_s,
        )
        data["ok"] = True
        if fetched:
            data["fetched"] = fetched
        return data
    except Exception as ex:
        return {"ok": False, "error": str(ex)}


@router.get("/v1/fs/root")
def fs_root() -> dict:
    return {"ok": True, "root": root_path()}


@router.get("/v1/fs/list")
def fs_list(request: Request) -> dict:
    rel = request.query_params.get("path", "").strip()
    try:
        payload = list_dir(rel)
        payload["ok"] = True
        return payload
    except Exception as ex:
        return {"ok": False, "error": str(ex)}


@router.get("/v1/fs/read")
def fs_read(request: Request) -> dict:
    rel = request.query_params.get("path", "").strip()
    try:
        payload = read_file(rel)
        payload["ok"] = True
        return payload
    except Exception as ex:
        return {"ok": False, "error": str(ex)}


@router.get("/v1/net/fetch")
def net_fetch(request: Request) -> dict:
    url = request.query_params.get("url", "").strip()
    try:
        payload = fetch_url(url)
        payload["ok"] = True
        return payload
    except Exception as ex:
        return {"ok": False, "error": str(ex)}
