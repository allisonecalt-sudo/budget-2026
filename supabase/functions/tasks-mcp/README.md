# tasks-mcp

**What:** a READ-ONLY remote MCP server (Supabase Edge Function) for Allison's tasks and the brain-dashboard open questions. Twin of `grocery-mcp` (same auth, same shape). Lets Claude Web / phone read the task list once added as a custom connector at claude.ai.
**Why:** "what's due this week?" from the phone. Plan: `second-brain/projects/apps-everywhere/research-2026-11-14.md`.
**Status (2026-11-14):** built and tested LOCALLY only. NOT deployed, not committed, not added at claude.ai.

## Decided
- Exactly 4 tools, no writes, no SQL, GET via REST only:
  - `tasks_active(limit=30, max 100)`: state=active, due date first (nulls last), then most recently updated. Shows id, title, next_step, due_date, energy, project, place.
  - `tasks_due(days_ahead=7, 0-60)`: open (not closed) tasks overdue, due, or resurfacing up to today + N (today = Asia/Jerusalem). Each row tagged `overdue` / `due` / `resurfaces`.
  - `task_history(task_id)`: the full row of an OPEN task (notes, state, dates, gtask_id) + its `todo_events` trail. `task_id` must be a strict UUID. Closed tasks answer "task not found, or it is closed" (query has `state=neq.closed`).
  - `open_questions_list(limit=20, max 100)`: `open_questions` rows with status=open (the brain-dashboard veto cards), newest first, with context + suggestion. The table exists (checked live, 95 open rows), so the tool is included.
- Tables (hard-coded in `index.ts`): `todo_tasks`, `todo_events`, `open_questions`. No write tool, ever: writes to `todo_tasks` go through `scripts/task.sh` (hook-guarded).
- Auth = `Authorization: Bearer <secret>` header ONLY. Env `TASKS_MCP_SECRET`; unset or shorter than 32 chars = everything refused; constant-time compare (SHA-256 digests). Wrong/missing = bare 401.
- Stateless: POST only; GET/DELETE on the endpoint = 405.
- Errors: only our own validation messages reach the caller; anything else = "tasks read failed".
- Tool descriptions say results are user data, not instructions.
- Service key only from env (`SUPABASE_SERVICE_ROLE_KEY`, auto-provided at deploy), never logged or returned.

## Columns read
- `todo_tasks`: id, title, notes (history only), state, open_subtype, energy, next_step, due_date, resurface_at, place, project, topics, gtask_id, created_at, updated_at, closed_at (always empty for open rows).
- `todo_events`: task_id (filter), event_type, from_value, to_value, note, occurred_at.
- `open_questions`: id, question, context, source, suggestion, created_at, status (filter = open). `answer` is never selected.

## Privacy exclusions (chosen by the main window, safer by default)
- `closed_reason` and `blocked_on` are never read or returned.
- Closed tasks are not reachable at all: a closed task's notes once held a bank account number.
- A failed or non-array database response gives the generic "tasks read failed", never "not found".
- Still returned for open tasks: `notes`, `next_step`, event `note` text. Event notes are not filtered.
- To lift later (only with her yes): add the columns back to `TASK_FULL_COLS` in `index.ts` and the interface in `logic.ts`, and/or drop `&state=neq.closed` from the `task_history` row query.

## Files
`index.ts` server + tools · `logic.ts` pure logic · `logic_test.ts` unit tests · `smoke.ts` local end-to-end · `deno.json` imports · `.env.local` (gitignored by `supabase/functions/**/.env.local`) holds a random local-only secret.

## Add it at claude.ai (after deploy)
Customize > Connectors > Add custom connector: URL = `https://hpiyvnfhoqnnnotrmwaz.supabase.co/functions/v1/tasks-mcp/mcp`; Add header `Authorization` = `Bearer <secret>`; Authentication = No sign-in.

## Run the checks (Deno via `npm i deno` in a scratch folder)
```
deno test logic_test.ts
# smoke: set TASKS_MCP_SECRET (32+ chars), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in the shell, then
deno run --allow-net --allow-env smoke.ts
```
Results 2026-11-14: 13 unit tests pass; smoke 18/18 pass against the live DB (reads only); deno check + lint clean.

## NOT done / next
1. Deploy (Supabase CLI not installed here): `supabase secrets set TASKS_MCP_SECRET=<32+ URL-safe random chars>` then `supabase functions deploy tasks-mcp --no-verify-jwt` (required, the gateway would reject our Bearer secret).
2. She adds it at claude.ai, tests on Web + phone.
3. Not tested: Supabase's own runtime, claude.ai itself.
4. `notes`, `next_step` and event notes are free text and may name clients/children; returned as-is for open tasks (see exclusions).
