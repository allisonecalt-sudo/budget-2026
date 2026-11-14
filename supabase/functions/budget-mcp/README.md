# budget-mcp

**What:** a READ-ONLY remote MCP server (Supabase Edge Function) for the budget app. Lets Claude Web, the phone app and Claude Code read her budget once added as a custom connector at claude.ai. Twin of `grocery-mcp` (same auth, same error handling, same transport).
**Why:** "how much is left to budget?" from the phone. Plan: `second-brain/projects/apps-everywhere/research-2026-11-14.md`.
**Status (2026-11-14):** built and tested LOCALLY only. NOT deployed, NOT added at claude.ai, not committed.

## Tools (3, no writes, no SQL)
- `budget_month(month?)` : YYYY-MM pay month (default = current pay month: on/after the 10th = this calendar month, before = previous). Returns income parts + total, planned vs spent for all 16 categories, savings, `budgeted_total`, and `left_to_budget`.
- `budget_recent_items(limit?)` : newest spending (date, amount, category, subcategory, store, item, note, pay month) and newest extra income lines. Default 20 of each, max 100.
- `budget_categories()` : the app's 16 category keys + labels.
All amounts are ILS, as stored (only the app's own agorot rounding, which kills float drift). Each result says which pay month it belongs to.

## Tables read (fixed in `index.ts`, GET only) and why
| table | columns | why |
|---|---|---|
| months | id, year, month_num, income_petachya/clalit/private/other, charity_pct | income + which month |
| budgets | category, amount | planned amounts (amounts live here) |
| budget_items | category, amount | planned total wins when a category has lines (app rule) |
| transactions | category, subcategory, store, item, amount, date, notes, month_id | spent + recent items |
| income_items | month_id, label, amount, created_at | extra income lines (part of income) |
| travel_payments, charity_payments | month_num, amount (filtered to the month's year) | spent for those tab categories |
| admin_items | id (this year only) | scopes admin payments to the year, as the app does |
| admin_sub_items | item_id, amount, is_paid, month_num | admin payments (NOT the dropped `admin_payments`) |

## NOT readable (on purpose)
`biz_months` (private-client business money), every `pt_*` / private / tracker table, `cash_accounts` (balances), `change_log`, `spend_floors`, `budget_item_templates`, `admin_credits`, `admin_allocations`, `travel_items`, `charity_items`, `*_sub_items` for travel/charity, grocery tables. No payslips, no bank account numbers (none are in the tables above). Table names are constants in `index.ts`; nothing a caller sends can name a table.

## "Left to Budget" : how it matches the app
App code (`renderRibbon` / `renderApp` in budget-2026 `app.ts`): `ag(income - totalBudgeted)`; income = months.income_* + income_items; totalBudgeted = sum over the 16 categories of (budget_items total, else budgets row) + savings_bank + savings_invested; charity budget = round(income x charity_pct / 100) when a percent is set (and no charity lines). `logic.ts` mirrors that line by line. Spent mirrors `spentByCategory` (transactions, fixed-lines floor for housing/recurring, plus travel/admin/charity tab payments for that month).
Checked 2026-11-14 on the live current month against an independent recompute from raw rows: same number. NOT checked against the app's screen itself.

## Could not reproduce exactly
- **Private income:** the app's Left to Budget also uses `months.income_private` (`app.ts` totalIncome), so `left_to_budget` equals the app's number. Only the app's Income pop-up "Private" line can show a fresher business net from `biz_months` (which we do not read).
- **"estimated income" flag** lives in her device's localStorage: not visible. The caveat is returned right next to income (`income_caveat`) and in the notes.

## Output extras
- `left_to_budget_shown`: whole shekels as the app prints it (-0.42 shows as 0, not overspent).
- travel/admin/charity carry `spent_basis`: spent = payments so far; the app's top line counts the whole allocation as used.
- `month_rule`: one line saying why that month was picked (10th-to-10th pay month).

## Auth, errors (same as grocery-mcp, passed its privacy check)
`Authorization: Bearer <secret>` only; env `BUDGET_MCP_SECRET`, unset or under 32 chars = everything refused; constant-time compare; wrong/missing = bare 401; POST only (GET/DELETE = 405); only own validation messages reach the caller, everything else = "budget read failed"; tool descriptions say results are user data, not instructions. Service key only from env. A response of 1000+ rows is treated as possibly cut off and fails (no silent wrong totals).

## Run the checks
```
deno test logic_test.ts
# smoke: set BUDGET_MCP_SECRET (32+ chars), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, then
deno run --allow-net --allow-env smoke.ts
```
Results 2026-11-14: 14 unit tests pass; smoke 16/16 pass; deno check + lint clean. `.env.local` (fake local secret) is gitignored by the repo's `supabase/functions/**/.env.local` rule.

## Before it can go online
1. `supabase secrets set BUDGET_MCP_SECRET=<32+ URL-safe random chars>` then `supabase functions deploy budget-mcp --no-verify-jwt` (the flag is required; the secret is then the only gate).
2. Her go, then add at claude.ai: URL `https://hpiyvnfhoqnnnotrmwaz.supabase.co/functions/v1/budget-mcp/mcp`, header `Authorization: Bearer <secret>`.
3. Not tested: Supabase's runtime, claude.ai itself.
