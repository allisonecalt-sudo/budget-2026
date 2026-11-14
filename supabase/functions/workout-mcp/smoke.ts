// Local end-to-end smoke: serves the handler on a local port and calls it over
// real HTTP (streamable HTTP, JSON responses). Read-only. Needs env:
// WORKOUT_MCP_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { handler } from './index.ts';

const secret = Deno.env.get('WORKOUT_MCP_SECRET') ?? '';
if (secret.length < 32) throw new Error('set WORKOUT_MCP_SECRET (32+ chars) for the smoke');
const srv = Deno.serve({ port: 8799, onListen() {} }, handler);
const base = 'http://127.0.0.1:8799';
let n = 0;

interface RpcBody {
  result: { tools: { name: string }[]; isError?: boolean; content: { text: string }[] };
}
type Rows = unknown[];
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
const url = `${base}/workout-mcp/mcp`;

await rpc(url, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } }, bearer);
const list = await rpc(url, 'tools/list', {}, bearer);
const names = must(list.body).tools.map((t) => t.name).sort();
check('tools/list (bearer) = 3 read tools', JSON.stringify(names) === JSON.stringify(['workout_pain_trend', 'workout_recent_sessions', 'workout_week_summary']), names.join(','));

const call = (u: string, name: string, args: unknown, h: Record<string, string>) =>
  rpc(u, 'tools/call', { name, arguments: args }, h);
const txt = (r: { body: RpcBody | null }) => must(r.body).content[0].text;

let r = await call(url, 'workout_recent_sessions', {}, bearer);
let j = JSON.parse(txt(r)) as Rows;
check('recent_sessions default 10', !must(r.body).isError && j.length >= 1 && j.length <= 10, `n=${j.length}`);
r = await call(url, 'workout_recent_sessions', { limit: 500 }, bearer);
j = JSON.parse(txt(r)) as Rows;
check('recent_sessions limit capped at 50', j.length <= 50, `n=${j.length}`);
r = await call(url, 'workout_recent_sessions', { limit: -1 }, bearer);
check('validation error is passed through', txt(r).startsWith('limit must be'), txt(r));
r = await call(url, 'workout_week_summary', {}, bearer);
j = JSON.parse(txt(r)) as Rows;
check('week_summary default 4 weeks', !must(r.body).isError && j.length === 4, `weeks=${j.length}`);
r = await call(url, 'workout_week_summary', { weeks_back: 99 }, bearer);
j = JSON.parse(txt(r)) as Rows;
check('week_summary capped at 12', j.length === 12, `weeks=${j.length}`);
r = await call(url, 'workout_pain_trend', {}, bearer);
j = JSON.parse(txt(r)) as Rows;
check('pain_trend default 30 days', !must(r.body).isError && Array.isArray(j), `readings=${j.length}`);
r = await call(url, 'workout_pain_trend', { days: 'x&select=*' }, bearer);
check('pain_trend rejects bad days', must(r.body).isError === true, txt(r));

const pathUrl = `${base}/workout-mcp/${secret}/mcp`;
const pl = await rpc(pathUrl, 'tools/list', {}, {});
check('secret in URL path no longer accepted -> 401', pl.status === 401);
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
const bad2 = await rpc(`${base}/workout-mcp/wrong/mcp`, 'tools/list', {}, {});
check('wrong path secret -> 401', bad2.status === 401);
const bad3 = await rpc(url, 'tools/list', {}, {});
check('no secret -> 401', bad3.status === 401);

await srv.shutdown();
