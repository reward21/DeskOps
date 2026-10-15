from __future__ import annotations

import ipaddress
import os
import re
from typing import Dict, List
from urllib.parse import urlparse

import httpx


MAX_BYTES = 1024 * 512
TIMEOUT_S = 15


def _is_private_host(host: str) -> bool:
    allow_private = os.environ.get("NET_ALLOW_PRIVATE", "").strip().lower() in {"1", "true", "yes", "on"}
    if allow_private:
        return False
    if not host:
        return True
    if host in {"localhost", "127.0.0.1", "0.0.0.0"}:
        return True
    try:
        ip = ipaddress.ip_address(host)
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except ValueError:
        return False


def _validate_url(raw: str) -> str:
    url = (raw or "").strip()
    if not url:
        raise ValueError("missing url")
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("only http/https allowed")
    if _is_private_host(parsed.hostname or ""):
        raise ValueError("private or local addresses are blocked")
    return url


def fetch_url(raw: str) -> Dict[str, object]:
    url = _validate_url(raw)
    headers = {"User-Agent": "DeskOps-LLM/1.0"}
    with httpx.Client(timeout=httpx.Timeout(timeout=TIMEOUT_S), headers=headers, follow_redirects=True) as client:
        resp = client.get(url)
    content_type = resp.headers.get("content-type", "")
    body = resp.text or ""
    truncated = False
    if len(body) > MAX_BYTES:
        body = body[:MAX_BYTES]
        truncated = True
    return {
        "url": url,
        "status": resp.status_code,
        "content_type": content_type,
        "body": body,
        "truncated": truncated,
    }


def extract_urls(text: str, *, limit: int = 3) -> List[str]:
    raw = str(text or "")
    if not raw:
        return []
    # Basic http/https URL extractor; trims common trailing punctuation.
    candidates = re.findall(r"https?://\\S+", raw)
    urls: List[str] = []
    for cand in candidates:
        cleaned = cand.rstrip(").,;:!?\"'")
        if cleaned and cleaned not in urls:
            urls.append(cleaned)
        if len(urls) >= max(1, limit):
            break
    return urls
