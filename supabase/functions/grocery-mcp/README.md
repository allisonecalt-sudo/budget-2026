# grocery-mcp

**What:** a READ-ONLY remote MCP server (Supabase Edge Function) for the grocery app. Lets Claude Web, the phone app and Claude Code read the grocery list once added as a custom connector at claude.ai.
**Why:** "what's on my list?" from the phone. First of the per-app "small doors" (plan: `second-brain/projects/apps-everywhere/research-2026-11-14.md`, sections A, B, D).
**Status (2026-11-14):** built and tested LOCALLY only. NOT deployed. Not added at claude.ai.

## Decided
- Exactly 3 tools, no writes, no SQL: `grocery_list` (unchecked items by section, optional `list_type`, e.g. `allison`), `grocery_search` (word, case-insensitive, Hebrew + English, items + catalog), `grocery_recent_trips` (default 5, max 20).
- Only `grocery_items`, `grocery_catalog`, `grocery_trips` are reachable; table names are hard-coded in `index.ts`.
- Auth = one secret, checked in constant time (SHA-256 digests compared). Accepted as header `Authorization: Bearer <secret>` OR URL `/grocery-mcp/<secret>/mcp`. `GROCERY_MCP_SECRET` unset = every request refused. Wrong/missing = bare 401.
- Service key only from env (`SUPABASE_SERVICE_ROLE_KEY`, auto-provided), never logged or returned.
- Stateless streamable HTTP, JSON responses (`@modelcontextprotocol/sdk` 1.32.2 pinned in `deno.json`).

## Files
- `index.ts` server + 3 tools. `logic.ts` pure logic (auth, validation, shaping). `logic_test.ts` unit tests. `smoke.ts` local end-to-end over real HTTP. `deno.json` imports. `.env.local` (gitignored) holds a fake local secret.

## Run the checks (needs Deno; installed here via `npm i deno` in a scratch folder)
```
deno test logic_test.ts
# smoke: set GROCERY_MCP_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in the shell, then
deno run --allow-net --allow-env smoke.ts
```
Results 2026-11-14: 11 unit tests pass; smoke 12/12 pass (3 tools listed, each tool against live data, URL-path secret works, wrong bearer / wrong path secret / no secret all 401). Type check clean.

## NOT done / next (before it can go online)
1. Her pick: sign-in style. This build is the "simple secret" style. Check the claude.ai connector form really offers a header or accepts a URL (path form is the fallback).
2. Deploy needs the Supabase CLI (not installed here): `supabase secrets set GROCERY_MCP_SECRET=<long random>` then `supabase functions deploy grocery-mcp --no-verify-jwt`. `--no-verify-jwt` is REQUIRED, otherwise Supabase's gateway rejects our Bearer secret. The secret is then the only gate, so make it long (32+ random chars). If the URL form is used, the secret appears in the URL (logs, history): prefer the header.
3. Blind checker review (plan step 5), then she adds it at claude.ai, then test Web + phone.
4. Not tested: Supabase's own runtime (local `supabase functions serve` needs Docker, absent) and claude.ai itself. Search reads at most 1000 newest items and 1000 catalog rows (fine today; revisit if the tables grow).
5. Version 2 (writes) only after days of read use.

## Links
Research/plan: `second-brain/projects/apps-everywhere/research-2026-11-14.md` · App: `Documents/grocery-apt/app.js` · Guide: https://supabase.com/docs/guides/ai-tools/byo-mcp
