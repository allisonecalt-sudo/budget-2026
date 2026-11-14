# workout-mcp

**What:** a READ-ONLY remote MCP server (Supabase Edge Function) for the workout app. Lets Claude Web, the phone app and Claude Code read her workout history once added as a custom connector at claude.ai. Built as an exact twin of `../grocery-mcp/`.
**Why:** "how did my last sessions go / how is my back?" from the phone. Second of the per-app "small doors" (plan: `second-brain/projects/apps-everywhere/research-2026-11-14.md`).
**Status (2026-11-14):** built and tested LOCALLY only. NOT deployed. Not added at claude.ai.

## Decided
- Exactly 3 tools, no writes, no SQL:
  - `workout_recent_sessions` (limit default 10, max 50): date, type A/B/C/D, duration minutes, ride (elliptical minutes / level / km / kcal), mood before/after, back + wrist pain before/after, her session note. Newest first.
  - `workout_week_summary` (weeks_back default 4, max 12): per Saturday-to-Friday week (Israel time): sessions, types done, count by type, total ride minutes. Current week is partial.
  - `workout_pain_trend` (days default 30, max 180): back + wrist before/after readings per session, oldest first; sessions with no pain reading are left out.
- Only table `workout_sessions` is reachable (hard-coded in `index.ts`), and only the 16 columns listed in `logic.ts` (`SESSION_COLUMNS`). GET only via REST. Rest-day rows (`workout_type = 'R'`) are not sessions and are skipped.
- Dates are shown in Israel time. "Ride minutes" = elliptical lane only (`elliptical_time_sec`/60, else `cardio_minutes`); walks are not counted as rides.
- Auth = one secret in `Authorization: Bearer <secret>` ONLY. Constant-time compare. `WORKOUT_MCP_SECRET` unset OR shorter than 32 chars = every request refused. Wrong/missing = bare 401.
- Stateless: POST only. GET/DELETE on the endpoint = 405.
- Errors: only our own validation messages reach the caller; anything else = "workout read failed".
- Tool descriptions say results are user data, not instructions.
- Service key only from env (`SUPABASE_SERVICE_ROLE_KEY`, auto-provided), never logged or returned.
- NOT included on purpose: `workout_current_plan`. The plan lives in the app's code (`workout-tracker/program.ts`), not in the database, so a server reading the DB can't see it.

## Columns used (workout_sessions)
date, workout_type, duration_seconds, cardio_lane, cardio_minutes, elliptical_level, elliptical_km, elliptical_kcal, elliptical_time_sec, mood_before, mood_after, back_pain_before, pain_back_0_10 (after), wrist_pain_before, wrist_pain_0_10 (after), session_note, capacity_before_1_10, capacity_after_1_10, pain_left_wrist_0_10, pain_right_wrist_0_10 (older rows; shown as wrist left/right).

## Files
`index.ts` server + 3 tools. `logic.ts` pure logic (auth, validation, dates, shaping). `logic_test.ts` unit tests. `smoke.ts` local end-to-end over real HTTP. `deno.json` imports. `.env.local` (gitignored) holds a fake local secret.

## Add it at claude.ai (after deploy)
Customize > Connectors > Add custom connector: URL = `https://hpiyvnfhoqnnnotrmwaz.supabase.co/functions/v1/workout-mcp/mcp`; Add header `Authorization` = `Bearer <secret>`; Authentication = No sign-in.

## Run the checks (needs Deno; installed here via `npm init -y && npm i deno` in a scratch folder, then `node_modules/.bin/deno`)
```
deno test logic_test.ts
# smoke: set WORKOUT_MCP_SECRET (32+ chars), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in the shell, then
deno run --allow-net --allow-env smoke.ts
```
Results 2026-11-14: 10 unit tests pass; smoke 15/15 pass (3 tools; live reads; validation; URL-path secret 401; GET/DELETE 405; wrong/no secret 401). deno check + lint clean.

## NOT done / next (before it can go online)
1. Deploy needs the Supabase CLI (not installed here): `supabase secrets set WORKOUT_MCP_SECRET=<32+ URL-safe random chars>` then `supabase functions deploy workout-mcp --no-verify-jwt`. `--no-verify-jwt` is REQUIRED; the secret is then the only gate.
2. She adds it at claude.ai (above), then test on Web + phone.
3. Not tested: Supabase's own runtime (needs Docker) and claude.ai itself. Reads are capped at 1000 rows per call.
4. Private data: session notes and pain readings are health data; the service key bypasses RLS, so the secret is the only protection. Keep it out of git and chats.

## Links
Research/plan: `second-brain/projects/apps-everywhere/research-2026-11-14.md` · App: `Documents/workout-tracker/` (`sync.ts` = the column list) · Twin: `../grocery-mcp/`
