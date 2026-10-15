from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, List, Tuple

from app.core.config import settings

MAX_BYTES = 1024 * 1024 * 2
MAX_LISTING = 2000

EXCLUDE_DIRS = {
    ".git",
    ".env",
    ".venv",
    "node_modules",
    "dist",
    ".secrets",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".svelte-kit",
    ".vite",
    "coverage",
    ".idea",
    ".vscode",
}
EXCLUDE_FILES = {".env", ".envrc"}
ALLOW_HIDDEN = {".run"}
EXCLUDE_EXTS = {".key", ".pem", ".p12", ".pfx", ".der"}


def _root() -> Path:
    raw = (settings.gulfchain_root or "").strip()
    if not raw:
        raw = os.environ.get("GULFCHAIN_ROOT", "").strip()
    if not raw:
        raw = str(Path(__file__).resolve().parents[4])
    return Path(raw).expanduser().resolve()


def _is_excluded(path: Path) -> bool:
    name = path.name
    if name in EXCLUDE_FILES:
        return True
    if name.startswith(".") and name not in {".", ".."} and name not in ALLOW_HIDDEN:
        return True
    if path.suffix.lower() in EXCLUDE_EXTS:
        return True
    for part in path.parts:
        if part in EXCLUDE_DIRS:
            return True
    return False


def _resolve(rel: str) -> Tuple[Path, Path]:
    root = _root()
    rel = (rel or "").strip()
    target = (root / rel).resolve()
    if not str(target).startswith(str(root)):
        raise ValueError("invalid path")
    if _is_excluded(target):
        raise ValueError("path is excluded")
    return root, target


def list_dir(rel: str) -> Dict[str, object]:
    root, target = _resolve(rel)
    if not target.exists():
        raise FileNotFoundError("path not found")
    if not target.is_dir():
        raise ValueError("path is not a directory")

    items: List[Dict[str, object]] = []
    count = 0
    for child in sorted(target.iterdir(), key=lambda p: p.name.lower()):
        if _is_excluded(child):
            continue
        try:
            stat = child.stat()
        except Exception:
            continue
        items.append(
            {
                "name": child.name,
                "path": str(child.relative_to(root)),
                "type": "dir" if child.is_dir() else "file",
                "size": int(stat.st_size),
                "mtime": int(stat.st_mtime),
            }
        )
        count += 1
        if count >= MAX_LISTING:
            break
    return {
        "root": str(root),
        "path": str(target.relative_to(root)),
        "items": items,
        "truncated": count >= MAX_LISTING,
    }


def read_file(rel: str) -> Dict[str, object]:
    root, target = _resolve(rel)
    if not target.exists():
        raise FileNotFoundError("path not found")
    if not target.is_file():
        raise ValueError("path is not a file")
    size = target.stat().st_size
    if size > MAX_BYTES:
        raise ValueError("file too large to preview")
    try:
        content = target.read_text(encoding="utf-8")
    except Exception:
        content = target.read_text(encoding="utf-8", errors="ignore")
    return {
        "root": str(root),
        "path": str(target.relative_to(root)),
        "size": int(size),
        "content": content,
    }


def root_path() -> str:
    return str(_root())
