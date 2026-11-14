// Local end-to-end smoke: serves the handler on a local port and calls it over
// real HTTP (streamable HTTP, JSON responses). Read-only. Needs env:
// TASKS_MCP_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { handler } from './index.ts';

const secret = Deno.env.get('TASKS_MCP_SECRET') ?? '';
if (secret.length < 32) throw new Error('set TASKS_MCP_SECRET (32+ chars) for the smoke');
const srv = Deno.serve({ port: 8798, onListen() {} }, handler);
const base = 'http://127.0.0.1:8798';
let n = 0;

interface RpcBody {
  result: { tools: { name: string }[]; isError?: boolean; content: { text: string }[] };
}
interface ActiveOut { count: number; tasks: { id: string; state?: string }[] }
interface DueOut { today: string; count: number; tasks: { kind: string; state: string }[] }
interface HistOut { task: { id: string }; events: unknown[] }
interface Keys { task: Record<string, unknown> }
interface QOut { count: number; questions: unknown[] }
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
  if (!ok) { Deno.exitCode = 1; }
}
const bearer = { authorization: `Bearer ${secret}` };
const url = `${base}/tasks-mcp/mcp`;

await rpc(url, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } }, bearer);
const list = await rpc(url, 'tools/list', {}, bearer);
const names = must(list.body).tools.map((t) => t.name).sort();
check('tools/list (bearer) = 4 read tools', JSON.stringify(names) === JSON.stringify(['open_questions_list', 'task_history', 'tasks_active', 'tasks_due']), names.join(','));

const call = (u: string, name: string, args: unknown, h: Record<string, string>) =>
  rpc(u, 'tools/call', { name, arguments: args }, h);
const txt = (r: { body: RpcBody | null }) => must(r.body).content[0].text;

let r = await call(url, 'tasks_active', {}, bearer);
const a = JSON.parse(txt(r)) as ActiveOut;
check('tasks_active', !must(r.body).isError && a.count === a.tasks.length, `count=${a.count}`);
r = await call(url, 'tasks_active', { limit: 2 }, bearer);
check('tasks_active limit=2', (JSON.parse(txt(r)) as ActiveOut).count <= 2);
r = await call(url, 'tasks_active', { limit: 0 }, bearer);
check('tasks_active rejects limit 0', must(r.body).isError === true, txt(r));
r = await call(url, 'tasks_due', {}, bearer);
const d = JSON.parse(txt(r)) as DueOut;
check('tasks_due default 7', !must(r.body).isError && d.tasks.every((t) => t.state !== 'closed'), `today=${d.today} count=${d.count}`);
r = await call(url, 'tasks_due', { days_ahead: 999 }, bearer);
check('tasks_due days_ahead capped at 60', !must(r.body).isError, `count=${(JSON.parse(txt(r)) as DueOut).count}`);
r = await call(url, 'tasks_due', { days_ahead: -3 }, bearer);
check('tasks_due rejects negative', must(r.body).isError === true, txt(r));

const firstId = a.tasks[0]?.id;
if (firstId) {
  r = await call(url, 'task_history', { task_id: firstId }, bearer);
  const h = JSON.parse(txt(r)) as HistOut;
  check('task_history real id', h.task.id === firstId, `events=${h.events.length}`);
  const k = Object.keys((JSON.parse(txt(r)) as Keys).task);
  check('task_history has no closed_reason/blocked_on', !k.includes('closed_reason') && !k.includes('blocked_on'), k.length + ' fields');
}
r = await call(url, 'task_history', { task_id: '123e4567-e89b-12d3-a456-426614174000' }, bearer);
check('task_history unknown uuid -> clean error', must(r.body).isError === true && txt(r) === 'task not found, or it is closed', txt(r));
const closedRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/todo_tasks?select=id&state=eq.closed&limit=1`, {
  headers: { apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}` },
});
const closedId = ((await closedRes.json()) as { id: string }[])[0]?.id ?? '';
r = await call(url, 'task_history', { task_id: closedId }, bearer);
check('task_history closed id -> not found or closed', must(r.body).isError === true && txt(r) === 'task not found, or it is closed', txt(r));
r = await call(url, 'task_history', { task_id: `${firstId}&select=*` }, bearer);
check('task_history rejects injected id', must(r.body).isError === true && txt(r).startsWith('task_id must be'), txt(r));
r = await call(url, 'open_questions_list', {}, bearer);
const q = JSON.parse(txt(r)) as QOut;
check('open_questions_list default 20', !must(r.body).isError && q.questions.length <= 20, `count=${q.count}`);
r = await call(url, 'open_questions_list', { limit: 3 }, bearer);
check('open_questions_list limit=3', (JSON.parse(txt(r)) as QOut).count <= 3);

const pathUrl = `${base}/tasks-mcp/${secret}/mcp`;
const pl = await rpc(pathUrl, 'tools/list', {}, {});
check('secret in URL path not accepted -> 401', pl.status === 401);
for (const method of ['GET', 'DELETE']) {
  const res = await fetch(url, { method, headers: bearer });
  await res.body?.cancel();
  check(`${method} with right secret -> 405`, res.status === 405, String(res.status));
}
const g401 = await fetch(url, { method: 'GET' });
await g401.body?.cancel();
check('GET without secret -> 401', g401.status === 401);
const bad1 = await rpc(url, 'tools/list', {}, { authorization: 'Bearer wrong' });
check('wrong bearer -> 401', bad1.status === 401);
const bad3 = await rpc(url, 'tools/list', {}, {});
check('no secret -> 401', bad3.status === 401);

await srv.shutdown();
