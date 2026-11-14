# grocery-mcp

**What:** a READ-ONLY remote MCP server (Supabase Edge Function) for the grocery app. Lets Claude Web, the phone app and Claude Code read the grocery list once added as a custom connector at claude.ai.
**Why:** "what's on my list?" from the phone. First of the per-app "small doors" (plan: `second-brain/projects/apps-everywhere/research-2026-11-14.md`, sections A, B, D).
**Status (2026-11-14):** built and tested LOCALLY only. NOT deployed. Not added at claude.ai.

## Decided
- Exactly 3 tools, no writes, no SQL: `grocery_list` (unchecked items by section, optional `list_type`, e.g. `allison`), `grocery_search` (word, case-insensitive, Hebrew + English, items + catalog), `grocery_recent_trips` (default 5, max 20).
- Only `grocery_items`, `grocery_catalog`, `grocery_trips` are reachable; table names are hard-coded in `index.ts`.
- Auth = one secret in the header `Authorization: Bearer <secret>` ONLY (no URL-path secret: claude.ai's form has "Add header"). Checked in constant time (SHA-256 digests). `GROCERY_MCP_SECRET` unset OR shorter than 32 chars = every request refused. Make it URL-safe random, 32+ chars. Wrong/missing = bare 401.
- Stateless: POST only. GET/DELETE on the endpoint = 405.
- Errors: only our own validation messages reach the caller; anything else = "grocery read failed" (no upstream text leaks).
- Tool descriptions say names are user data, not instructions.
- Service key only from env (`SUPABASE_SERVICE_ROLE_KEY`, auto-provided), never logged or returned.
- Stateless streamable HTTP, JSON responses (`@modelcontextprotocol/sdk` 1.32.2 pinned in `deno.json`).

## Files
- `index.ts` server + 3 tools. `logic.ts` pure logic (auth, validation, shaping). `logic_test.ts` unit tests. `smoke.ts` local end-to-end over real HTTP. `deno.json` imports. `.env.local` (gitignored) holds a fake local secret.

## Add it at claude.ai (after deploy)
Customize > Connectors > Add custom connector: URL = `https://hpiyvnfhoqnnnotrmwaz.supabase.co/functions/v1/grocery-mcp/mcp`; Add header `Authorization` = `Bearer <secret>`; Authentication = No sign-in.

## Run the checks (needs Deno; installed here via `npm i deno` in a scratch folder)
```
deno test logic_test.ts
# smoke: set GROCERY_MCP_SECRET (32+ chars), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in the shell, then
deno run --allow-net --allow-env smoke.ts
```
Results 2026-11-14 (after checker fixes): 11 unit tests pass; smoke 16/16 pass (3 tools; live reads; validation message passes through; URL-path secret 401; GET/DELETE 405; wrong/no secret 401). deno check + lint clean.

## NOT done / next (before it can go online)
1. Deploy needs the Supabase CLI (not installed here): `supabase secrets set GROCERY_MCP_SECRET=<32+ URL-safe random chars>` then `supabase functions deploy grocery-mcp --no-verify-jwt`. `--no-verify-jwt` is REQUIRED (the gateway would reject our Bearer secret); the secret is then the only gate.
2. She adds it at claude.ai (above), then test on Web + phone.
3. Not tested: Supabase's own runtime (needs Docker) and claude.ai itself. Search reads at most 1000 newest items and 1000 catalog rows.
4. Version 2 (writes) only after days of read use.

## Links
Research/plan: `second-brain/projects/apps-everywhere/research-2026-11-14.md` · App: `Documents/grocery-apt/app.js` · Guide: https://supabase.com/docs/guides/ai-tools/byo-mcp
