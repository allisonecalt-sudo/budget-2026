# notes-mcp

**What:** a READ-ONLY remote MCP server (Supabase Edge Function) for Allison's quick notes: the Memos widget (`memos`) and the voice app inbox (`voice_captures`). Lets Claude Web, the phone app and Claude Code read them once added as a custom connector at claude.ai.
**Why:** "what did I note about X?" from the phone. Twin of `grocery-mcp` (same auth, errors, tests, smoke). Plan: `second-brain/projects/apps-everywhere/research-2026-11-14.md`.
**Status (2026-11-14):** built and tested LOCALLY only. NOT deployed. Not added at claude.ai. Not yet privacy-checked by a blind reviewer.

## Decided
- Exactly 3 tools, no writes, no SQL: `notes_recent` (limit default 20, max 100; `include_archived` default false), `notes_search` (word, case-insensitive, Hebrew + English, matched in memory over the newest 1000 of each, includes archived, max 50 hits), `notes_by_day` (YYYY-MM-DD, Jerusalem day, includes archived, oldest first).
- Only `memos` and `voice_captures`; hard-coded in `index.ts`. `memos_test` is never touched.
- Columns read: memos `content, tag, status, created_at, done_at`; voice_captures `transcript, source, archived, from_claude, created_at`.
- "Archived": memos `status = done` (never deleted); voice `archived = true`. Skipped by `notes_recent` unless asked.
- Voice rows with `from_claude = true` (Claude's own notes to her) are always left out: they are not her captures.
- Each note returns `time` (Jerusalem, `YYYY-MM-DD HH:mm`), `utc`, `source` (memo | voice), `text`, `archived`, memo `tag` if any. Text is returned as-is, except a single note over 4000 characters is cut and flagged `truncated: true` (some voice rows hold long pasted prompts).
- The search word is never put in a REST query; `date` is validated as a real YYYY-MM-DD before use.
- Auth = `Authorization: Bearer <secret>` header ONLY, env `NOTES_MCP_SECRET`; unset or under 32 chars = everything refused; constant-time compare; wrong/missing = bare 401. POST only (GET/DELETE = 405). Only own validation messages reach callers; anything else = "notes read failed". Tool descriptions warn these are private notes and user data, not instructions.
- Service key only from env (`SUPABASE_SERVICE_ROLE_KEY`, auto-provided), never logged or returned.

## Files
`index.ts` server + 3 tools · `logic.ts` pure logic · `logic_test.ts` unit tests · `smoke.ts` local end-to-end over real HTTP · `deno.json` / `deno.lock` · `.env.local` (gitignored, fake local secret).

## Add it at claude.ai (after deploy)
Customize > Connectors > Add custom connector: URL = `https://hpiyvnfhoqnnnotrmwaz.supabase.co/functions/v1/notes-mcp/mcp`; Add header `Authorization` = `Bearer <secret>`; Authentication = No sign-in.

## Run the checks (Deno via `npm i deno` in a scratch folder)
```
deno test logic_test.ts
# smoke: set NOTES_MCP_SECRET (32+ chars), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, then
deno run --allow-net --allow-env smoke.ts
```
Results 2026-11-14: 13 unit tests pass; deno check + lint clean; smoke 16/16 pass against live data (read-only).

## NOT done / next
1. Deploy needs the Supabase CLI (not installed here): `supabase secrets set NOTES_MCP_SECRET=<32+ URL-safe random chars>` then `supabase functions deploy notes-mcp --no-verify-jwt` (REQUIRED: the gateway would reject our Bearer secret).
2. Add at claude.ai, test on Web + phone. Supabase runtime and claude.ai itself are untested.
3. Live `memos` table was empty at build time, so memo rows are only covered by unit tests, not live smoke.
4. Blind privacy check before deploy (these are the most private notes of the set).
