"""deploy_mcp.py - put Allison's read-only MCP connectors online (Supabase Edge Functions).

WHAT THIS IS: one command that deploys one or more of the `*-mcp` functions in
supabase/functions/ through the Supabase Management API (no CLI / Docker needed),
sets each one's secret, and smoke-tests it (right secret -> 200, no secret -> 401).

WHY IT EXISTS: her ask Sat Nov 14 2026 20:07, "build al mcps" / "why wait for me".
Going online puts her private data on the internet, so it runs ONLY with --go,
after her yes for that connector (project home: second-brain/projects/apps-everywhere/README.md).

DECIDED: Bearer-header secret per function (32+ URL-safe chars), verify_jwt=false
(the function checks its own secret; Supabase's JWT gate would reject our Bearer).
Secrets live ONLY in Supabase secrets + a private OneDrive file, never in git, never printed.

USAGE:
  python supabase/deploy_mcp.py grocery            # dry run: shows files + plan, changes nothing
  python supabase/deploy_mcp.py grocery --go       # deploys (needs her yes)
  python supabase/deploy_mcp.py --list             # read-only: what is deployed now
"""

from __future__ import annotations

import argparse
import json
import secrets
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

PROJECT_REF = "hpiyvnfhoqnnnotrmwaz"
API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}"
FUNCTIONS_URL = f"https://{PROJECT_REF}.supabase.co/functions/v1"
HERE = Path(__file__).resolve().parent
FUNCS = HERE / "functions"
PAT_FILE = Path.home() / ".supabase-mgmt-pat"
SECRETS_FILE = Path.home() / "OneDrive/Backups/second-brain-private/claude-web/mcp-secrets.json"
SHIP = {".ts", ".json"}
SKIP_NAMES = {"smoke.ts", "deno.lock"}


def pat() -> str:
    return PAT_FILE.read_text(encoding="utf-8").strip()


def api(method: str, url: str, body: bytes | None = None, ctype: str | None = None) -> tuple[int, str]:
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"Bearer {pat()}")
    if ctype:
        req.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def files_for(name: str) -> list[Path]:
    folder = FUNCS / f"{name}-mcp"
    if not (folder / "index.ts").exists():
        sys.exit(f"no function folder with index.ts: {folder}")
    out = [p for p in folder.iterdir() if p.is_file() and p.suffix in SHIP
           and p.name not in SKIP_NAMES and not p.name.endswith("_test.ts")]
    return sorted(out)


def load_secrets() -> dict[str, str]:
    if SECRETS_FILE.exists():
        return json.loads(SECRETS_FILE.read_text(encoding="utf-8"))
    return {}


def secret_for(name: str, store: dict[str, str]) -> tuple[str, bool]:
    key = f"{name.upper()}_MCP_SECRET"
    if key in store:
        return store[key], False
    return secrets.token_urlsafe(33), True  # 44 chars, URL-safe


def multipart(slug: str, paths: list[Path]) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    meta = {"name": slug, "entrypoint_path": "index.ts", "verify_jwt": False}
    if any(p.name == "deno.json" for p in paths):
        meta["import_map_path"] = "deno.json"
    parts: list[bytes] = []
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n'
        f"Content-Type: application/json\r\n\r\n{json.dumps(meta)}\r\n".encode()
    )
    for p in paths:
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{p.name}"\r\n'
            f"Content-Type: application/octet-stream\r\n\r\n".encode()
            + p.read_bytes()
            + b"\r\n"
        )
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def smoke(slug: str, secret: str) -> str:
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}).encode()
    results = []
    for label, auth in (("right secret", f"Bearer {secret}"), ("no secret", None)):
        req = urllib.request.Request(f"{FUNCTIONS_URL}/{slug}/mcp", data=body, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json, text/event-stream")
        if auth:
            req.add_header("Authorization", auth)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                results.append(f"{label} -> {r.status}")
        except urllib.error.HTTPError as e:
            results.append(f"{label} -> {e.code}")
    return " · ".join(results)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="*", help="grocery workout notes tasks budget writing")
    ap.add_argument("--go", action="store_true", help="really deploy (her yes first)")
    ap.add_argument("--list", action="store_true", help="read-only: list deployed functions")
    a = ap.parse_args()

    if a.list or not a.names:
        code, txt = api("GET", f"{API}/functions")
        print(code, [(f.get("slug"), f.get("status"), f.get("verify_jwt")) for f in json.loads(txt)] if code == 200 else txt[:300])
        return

    store = load_secrets()
    for name in a.names:
        slug = f"{name}-mcp"
        paths = files_for(name)
        secret, is_new = secret_for(name, store)
        print(f"\n== {slug}: {len(paths)} files -> {[p.name for p in paths]}")
        print(f"   secret: {'NEW (44 chars)' if is_new else 'existing'} · env {name.upper()}_MCP_SECRET · verify_jwt=false")
        if not a.go:
            print("   DRY RUN: nothing sent. Add --go after her yes.")
            continue
        code, txt = api("POST", f"{API}/secrets", json.dumps([{"name": f"{name.upper()}_MCP_SECRET", "value": secret}]).encode(), "application/json")
        print(f"   set secret -> {code}")
        if code >= 300:
            print("   STOP:", txt[:300])
            continue
        if is_new:
            store[f"{name.upper()}_MCP_SECRET"] = secret
            SECRETS_FILE.parent.mkdir(parents=True, exist_ok=True)
            SECRETS_FILE.write_text(json.dumps(store, indent=2), encoding="utf-8")
        body, ctype = multipart(slug, paths)
        code, txt = api("POST", f"{API}/functions/deploy?slug={slug}", body, ctype)
        print(f"   deploy -> {code} {txt[:200] if code >= 300 else ''}")
        if code < 300:
            print(f"   smoke: {smoke(slug, secret)}")
            print(f"   URL for claude.ai: {FUNCTIONS_URL}/{slug}/mcp  (header: Authorization: Bearer <secret from the private file>)")


if __name__ == "__main__":
    main()
