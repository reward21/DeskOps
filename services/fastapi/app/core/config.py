import os
from pathlib import Path
from typing import Dict

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[4]


def _parse_envrc_line(line: str) -> Dict[str, str]:
    raw = line.strip()
    if not raw or raw.startswith("#"):
        return {}
    if not raw.startswith("export "):
        return {}
    try:
        body = raw[len("export ") :].strip()
        key, val = body.split("=", 1)
        key = key.strip()
        val = val.strip()
        if (val.startswith("'") and val.endswith("'")) or (val.startswith('"') and val.endswith('"')):
            val = val[1:-1]
        val = os.path.expandvars(val)
        if key:
            return {key: val}
    except Exception:
        return {}
    return {}


def _load_envrc(path: Path) -> None:
    if not path.exists():
        return
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            parsed = _parse_envrc_line(line)
            for key, val in parsed.items():
                os.environ.setdefault(key, val)
    except Exception:
        return


# Load envrc from repo root and DeskOps root if present.
_load_envrc(BASE_DIR.parent / ".envrc")
_load_envrc(BASE_DIR / ".envrc")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "DeskOps-FastAPI"
    fastapi_port: int = 8090
    database_url: str = "postgres://postgres@127.0.0.1:5432/deskops?sslmode=disable"
    backtest_sqlite_path: str = "/data/backtests.sqlite"
    api_base_url: str = "http://127.0.0.1:9090"
    backtest_api_base: str = ""
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.2:1b"
    ollama_timeout_s: int = 300
    ollama_context_max_chars: int = 90000
    ollama_report_max_chars: int = 8000
    llm_memory_db_path: str = str(BASE_DIR / "db" / "llm_memory.sqlite")
    multigate_root: str = ""
    gulfchain_root: str = str(BASE_DIR.parent)


settings = Settings()
