# writing-mcp

**What:** a READ-ONLY remote MCP server (Supabase Edge Function) for the "My Writing" library (poems, musings, diary, step work, songs...). Lets Claude Web, the phone app and Claude Code read her writing once added as a custom connector at claude.ai.
**Why:** "find the poem where I wrote about X" from the phone. Twin of `grocery-mcp` (same auth, same shape). Plan: `second-brain/projects/apps-everywhere/research-2026-11-14.md`.
**Status (2026-11-14):** built and tested LOCALLY only. NOT deployed. Not added at claude.ai. Not committed.

## Where the data lives
Supabase budget-2026, table `writing_pieces` (mirror of Drive `poems/`; Drive stays the master; 1479 pieces on 2026-11-14, 3 kinds hidden). App: https://allisonecalt-sudo.github.io/writing-library/ (repo `Documents/writing-library`). Skill: `second-brain/.claude/skills/writing-inbox`.

## Decided
- Exactly 3 tools, no writes, no SQL: `writing_list` (id, title, kind, date, top flag, words; limit default 30 max 100; optional `kind`, `top_only`), `writing_get` (one piece in full by id), `writing_search` (word in title or text, matched in memory, up to 30 hits with snippets).
- PRIVATE BY DEFAULT: kinds `diary`, `steps` (step work) and `letter` are excluded from ALL three tools (`kind=not.in.(diary,steps,letter)` on every query, plus a row-level check; not allowed as a `kind` filter; `writing_get` of such an id answers `found: false`). Chosen by the main window as the safer default.
- ONLY `writing_pieces` is reachable (hard-coded in `index.ts`). `writing_requests` (her 💬 notes to Claude, taps and her 📝 private notes, action `mine`) is never read: those are hers alone.
- Auth = `Authorization: Bearer <secret>` ONLY. Env `WRITING_MCP_SECRET`; unset or under 32 chars = everything refused; constant-time compare; wrong/missing = bare 401. No secret in the URL.
- Stateless: POST only; GET/DELETE = 405. Errors: only our own validation messages pass; anything else = "writing read failed". Tool descriptions say text is user data, not instructions.
- Service key only from env (`SUPABASE_SERVICE_ROLE_KEY`, auto-provided), never logged or returned.

## Files
`index.ts` server + 3 tools · `logic.ts` pure logic · `logic_test.ts` unit tests · `smoke.ts` local end-to-end over real HTTP · `deno.json` imports (same pinned SDK as grocery) · `.env.local` (gitignored) fake local secret.

## Add it at claude.ai (after deploy)
Customize > Connectors > Add custom connector: URL = `https://hpiyvnfhoqnnnotrmwaz.supabase.co/functions/v1/writing-mcp/mcp`; Add header `Authorization` = `Bearer <secret>`; Authentication = No sign-in.

## Run the checks
```
deno test logic_test.ts
# smoke: set WRITING_MCP_SECRET (32+ chars), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, then
deno run --allow-net --allow-env smoke.ts
```
Results 2026-11-14 (after privacy fix): 9 unit tests pass; smoke see below, all PASS pass (live reads, bad kind/id rejected, URL-path secret 401, GET/DELETE 405, wrong/no secret 401); deno check + lint clean.

## NOT done / next
1. Deploy (Supabase CLI not installed here): `supabase secrets set WRITING_MCP_SECRET=<32+ URL-safe random>` then `supabase functions deploy writing-mcp --no-verify-jwt` (REQUIRED, else the gateway rejects our Bearer).
2. She adds it at claude.ai, then test on Web + phone.
3. Not tested: Supabase's own runtime, claude.ai itself. Search reads at most 5000 pieces (about 1290 now), one page of 1000 at a time.
4. To lift the exclusion later (ONLY with her yes, per kind): edit `EXCLUDED_KINDS` in `logic.ts` and add the kind back to `KINDS`, update the tests, redeploy.
5. A non-array database response throws the generic error (never shown as not found).
