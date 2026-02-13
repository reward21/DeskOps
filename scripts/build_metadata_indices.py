#!/usr/bin/env python3
import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path


DOC_EXTENSIONS = {".md", ".txt"}


def isoformat(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def normalize_rel(path: Path, root: Path) -> str:
    rel = path.relative_to(root).as_posix()
    return rel.lstrip("/")


def slugify(value: str) -> str:
    out = []
    for ch in value.lower():
        if ch.isalnum():
            out.append(ch)
        elif ch in {"/", "_", "-", " "}:
            out.append("-")
    slug = "".join(out)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-")


def extract_title_summary(path: Path) -> tuple[str, str]:
    title = path.stem
    summary = ""
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        return title, summary
    lines = [line.strip() for line in text.splitlines()]
    for line in lines:
        if line.startswith("#"):
            title = line.lstrip("#").strip() or title
            break
    for line in lines:
        if not line:
            continue
        if line.startswith("#"):
            continue
        summary = line
        break
    summary = summary[:200]
    return title, summary


def discover_files(base: Path) -> list[Path]:
    files = []
    if not base.exists():
        return files
    for root, _, filenames in os.walk(base):
        root_path = Path(root)
        for name in filenames:
            ext = Path(name).suffix.lower()
            if ext in DOC_EXTENSIONS:
                files.append(root_path / name)
    return sorted(files)


def load_existing(index_path: Path) -> dict:
    if not index_path.exists():
        return {
            "page": "docs",
            "version": 1,
            "generated_at": "",
            "items": [],
            "schema": {
                "base_fields": [
                    "id",
                    "title",
                    "summary",
                    "tags",
                    "source_path",
                    "source_repo",
                    "type",
                    "created_at",
                    "updated_at",
                    "status",
                    "visibility",
                    "owner",
                    "meta",
                ],
                "meta_fields": ["doc_kind", "audience", "section"],
            },
        }
    try:
        return json.loads(index_path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def infer_repo(rel_path: str) -> str:
    if rel_path.startswith("multigate-backtest/"):
        return "multigate-backtest"
    if rel_path.startswith("gulf-sync/"):
        return "gulf-sync"
    return "gulfchain"


def infer_type(rel_path: str) -> str:
    if "runs/artifacts/reports" in rel_path:
        return "report"
    return "doc"


def build_docs_index(root: Path, index_path: Path, dry_run: bool) -> dict:
    sources = [
        root / "docs",
        root / "multigate-backtest" / "docs",
        root / "multigate-backtest" / "runs" / "artifacts" / "reports",
    ]
    existing = load_existing(index_path)
    existing_items = {item.get("source_path"): item for item in existing.get("items", []) if item.get("source_path")}

    items = []
    for source in sources:
        for path in discover_files(source):
            rel_path = normalize_rel(path, root)
            title, summary = extract_title_summary(path)
            stat = path.stat()
            created_at = isoformat(getattr(stat, "st_birthtime", stat.st_ctime))
            updated_at = isoformat(stat.st_mtime)
            item = {
                "id": slugify(rel_path),
                "title": title,
                "summary": summary,
                "tags": [],
                "source_path": rel_path,
                "source_repo": infer_repo(rel_path),
                "type": infer_type(rel_path),
                "created_at": created_at,
                "updated_at": updated_at,
                "status": "active",
                "visibility": "internal",
                "owner": "cole",
                "meta": {},
            }
            existing_item = existing_items.get(rel_path)
            if existing_item:
                merged = {**item, **existing_item}
                merged["updated_at"] = updated_at
                merged["created_at"] = existing_item.get("created_at", created_at)
                item = merged
            items.append(item)

    items.sort(key=lambda entry: entry.get("source_path", ""))
    output = existing if isinstance(existing, dict) else {}
    output["page"] = "docs"
    output["version"] = output.get("version", 1)
    output["generated_at"] = datetime.now(tz=timezone.utc).isoformat()
    output["items"] = items
    if "schema" not in output:
        output["schema"] = {
            "base_fields": [
                "id",
                "title",
                "summary",
                "tags",
                "source_path",
                "source_repo",
                "type",
                "created_at",
                "updated_at",
                "status",
                "visibility",
                "owner",
                "meta",
            ],
            "meta_fields": ["doc_kind", "audience", "section"],
        }

    if not dry_run:
        index_path.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description="Build DeskOps metadata indices.")
    parser.add_argument("--dry-run", action="store_true", help="Do not write files.")
    parser.add_argument("--root", help="Override GULFCHAIN_ROOT.")
    args = parser.parse_args()

    gulfchain_root = args.root or os.environ.get("GULFCHAIN_ROOT")
    if not gulfchain_root:
        gulfchain_root = Path(__file__).resolve().parents[2]
    gulfchain_root = str(gulfchain_root)
    if not gulfchain_root:
        print("GULFCHAIN_ROOT is not set and could not be inferred.")
        return 1

    root = Path(gulfchain_root)
    index_path = root / "DeskOps" / "apps" / "metadata_indices" / "docs_index.json"
    output = build_docs_index(root, index_path, args.dry_run)
    print(f"Docs index items: {len(output.get('items', []))}")
    if args.dry_run:
        print("Dry run: no files written.")
    else:
        print(f"Wrote: {index_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
