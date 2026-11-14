// Local end-to-end smoke: serves the handler on a local port and calls it over
// real HTTP (streamable HTTP, JSON responses). Read-only. Needs env:
// BUDGET_MCP_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { handler } from './index.ts';

const secret = Deno.env.get('BUDGET_MCP_SECRET') ?? '';
if (secret.length < 32) throw new Error('set BUDGET_MCP_SECRET (32+ chars) for the smoke');
const srv = Deno.serve({ port: 8798, onListen() {} }, handler);
const base = 'http://127.0.0.1:8798';
let n = 0;

interface RpcBody {
  result: { tools: { name: string }[]; isError?: boolean; content: { text: string }[] };
}
interface MonthOut {
  month: string;
  found?: boolean;
  income: { total: number };
  categories: { key: string; planned: number; spent: number }[];
  savings: { bank: number; invested: number };
  budgeted_total: number;
  left_to_budget: number;
  left_to_budget_shown: number;
  month_rule: string;
  income_caveat: string;
}
interface Recent { currency: string; spending: unknown[]; income: unknown[] }
const must = (b: RpcBody | null): RpcBody['result'] => {
  if (!b) throw new Error('empty response');
  return b.result;
};

async function rpc(url: string, method: string, params: unknown, headers: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params }),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as RpcBody | null };
}
function check(name: string, ok: boolean, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);
  if (!ok) Deno.exitCode = 1;
}
const bearer = { authorization: `Bearer ${secret}` };
const url = `${base}/budget-mcp/mcp`;
const call = (name: string, args: unknown) => rpc(url, 'tools/call', { name, arguments: args }, bearer);
const txt = (r: { body: RpcBody | null }) => must(r.body).content[0].text;

await rpc(url, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } }, bearer);
const list = await rpc(url, 'tools/list', {}, bearer);
const names = must(list.body).tools.map((t) => t.name).sort();
check('tools/list = 3 read tools', JSON.stringify(names) === JSON.stringify(['budget_categories', 'budget_month', 'budget_recent_items']), names.join(','));

let r = await call('budget_categories', {});
check('budget_categories', (JSON.parse(txt(r)) as unknown[]).length === 16);

r = await call('budget_month', {});
let m = JSON.parse(txt(r)) as MonthOut;
check('budget_month default (current pay month)', !must(r.body).isError && typeof m.month === 'string', `month=${m.month} found=${m.found ?? true} left=${m.left_to_budget}`);

check('month_rule, income_caveat, left_to_budget_shown present', !!m.month_rule && !!m.income_caveat && m.left_to_budget_shown === Math.round(m.left_to_budget), m.month_rule);

// Independent cross-check: recompute Left to Budget straight from live rows with plain code.
const sbUrl = Deno.env.get('SUPABASE_URL')!;
const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const get = async (path: string) =>
  (await (await fetch(`${sbUrl}/rest/v1/${path}`, { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } })).json()) as Record<string, unknown>[];
const [yy, mm] = m.month.split('-').map(Number);
const mo = (await get(`months?year=eq.${yy}&month_num=eq.${mm}&select=*`))[0];
const id = mo.id as string;
const inc = (await get(`income_items?month_id=eq.${id}&select=amount`)).reduce((s, x) => s + Number(x.amount), 0);
const income = Number(mo.income_petachya || 0) + Number(mo.income_clalit || 0) + Number(mo.income_private || 0) + Number(mo.income_other || 0) + inc;
const bud = await get(`budgets?month_id=eq.${id}&select=category,amount`);
const items = await get(`budget_items?month_id=eq.${id}&select=category,amount`);
const cats = ['groceries','takeout','eatingout','entertainment','retail','transport','health','therapy','housing','household','recurring','charity','travel','admin','gifts','holiday'];
let budgeted = 0;
for (const c of cats) {
  const its = items.filter((x) => x.category === c);
  let b = its.length ? its.reduce((s, x) => s + Number(x.amount), 0) : Number(bud.find((x) => x.category === c)?.amount || 0);
  if (c === 'charity' && !its.length && Number(mo.charity_pct) && income) b = Math.round((income * Number(mo.charity_pct)) / 100);
  budgeted += b;
}
budgeted += Number(bud.find((x) => x.category === 'savings_bank')?.amount || 0) + Number(bud.find((x) => x.category === 'savings_invested')?.amount || 0);
const expect = Math.round((income - budgeted) * 100) / 100;
check('left_to_budget matches independent recompute', Math.abs(expect - m.left_to_budget) < 0.011, `server=${m.left_to_budget} independent=${expect}`);

r = await call('budget_month', { month: '2026-10' });
m = JSON.parse(txt(r)) as MonthOut;
check('budget_month 2026-10', !must(r.body).isError && m.month === '2026-10', `income=${m.income?.total} budgeted=${m.budgeted_total} left=${m.left_to_budget}`);
r = await call('budget_month', { month: '2005-01' });
check('budget_month unknown month -> found:false', (JSON.parse(txt(r)) as MonthOut).found === false);
r = await call('budget_month', { month: '2026-11&select=*' });
check('budget_month rejects bad month', must(r.body).isError === true, txt(r));

r = await call('budget_recent_items', {});
let rc = JSON.parse(txt(r)) as Recent;
check('budget_recent_items default 20', rc.spending.length <= 20 && rc.income.length <= 20 && rc.currency === 'ILS', `spending=${rc.spending.length} income=${rc.income.length}`);
r = await call('budget_recent_items', { limit: 999 });
rc = JSON.parse(txt(r)) as Recent;
check('budget_recent_items limit capped at 100', rc.spending.length <= 100, `spending=${rc.spending.length}`);
r = await call('budget_recent_items', { limit: -1 });
check('validation error passes through', txt(r).startsWith('limit must be'), txt(r));

const pl = await rpc(`${base}/budget-mcp/${secret}/mcp`, 'tools/list', {}, {});
check('secret in URL path -> 401', pl.status === 401);
for (const method of ['GET', 'DELETE']) {
  const res = await fetch(url, { method, headers: bearer });
  await res.body?.cancel();
  check(`${method} with right secret -> 405`, res.status === 405, String(res.status));
}
const g401 = await fetch(url, { method: 'GET' });
await g401.body?.cancel();
check('GET without secret -> 401', g401.status === 401);
check('wrong bearer -> 401', (await rpc(url, 'tools/list', {}, { authorization: 'Bearer wrong' })).status === 401);
check('no secret -> 401', (await rpc(url, 'tools/list', {}, {})).status === 401);

await srv.shutdown();
