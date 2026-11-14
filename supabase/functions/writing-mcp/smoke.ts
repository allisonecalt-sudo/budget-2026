// Local end-to-end smoke: serves the handler on a local port and calls it over
// real HTTP (streamable HTTP, JSON responses). Read-only. Needs env:
// WRITING_MCP_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { handler } from './index.ts';

const secret = Deno.env.get('WRITING_MCP_SECRET') ?? '';
if (secret.length < 32) throw new Error('set WRITING_MCP_SECRET (32+ chars) for the smoke');
const srv = Deno.serve({ port: 8799, onListen() {} }, handler);
const base = 'http://127.0.0.1:8799';
let n = 0;

interface RpcBody {
  result: { tools: { name: string }[]; isError?: boolean; content: { text: string }[] };
}
interface Item { id: string; kind: string | null; title: string }
interface SearchOut { total_matches: number; results: Item[] }
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
const url = `${base}/writing-mcp/mcp`;

await rpc(url, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } }, bearer);
const list = await rpc(url, 'tools/list', {}, bearer);
const names = must(list.body).tools.map((t) => t.name).sort();
check('tools/list (bearer) = 3 read tools', JSON.stringify(names) === JSON.stringify(['writing_get', 'writing_list', 'writing_search']), names.join(','));

const call = (u: string, name: string, args: unknown, h: Record<string, string>) =>
  rpc(u, 'tools/call', { name, arguments: args }, h);
const txt = (r: { body: RpcBody | null }) => must(r.body).content[0].text;

let r = await call(url, 'writing_list', { limit: 5 }, bearer);
const l1 = JSON.parse(txt(r)) as Item[];
check('writing_list limit 5', !must(r.body).isError && l1.length === 5, `n=${l1.length}`);
r = await call(url, 'writing_list', { limit: 999 }, bearer);
const l2 = JSON.parse(txt(r)) as Item[];
check('writing_list limit capped at 100', l2.length <= 100, `n=${l2.length}`);
r = await call(url, 'writing_list', { kind: 'musing', limit: 3 }, bearer);
const l3 = JSON.parse(txt(r)) as Item[];
check('writing_list kind=musing', l3.length > 0 && l3.every((x) => x.kind === 'musing'), `n=${l3.length}`);
r = await call(url, 'writing_list', { kind: 'diary' }, bearer);
check('writing_list kind=diary refused', must(r.body).isError === true, txt(r));
r = await call(url, 'writing_list', { limit: 100 }, bearer);
const l4 = JSON.parse(txt(r)) as Item[];
check('no excluded kinds in list', l4.every((x) => !['diary', 'steps', 'letter'].includes(x.kind ?? '')));
{
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const q = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/writing_pieces?select=drive_id,kind&kind=in.(diary,steps,letter)&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const ex = (await q.json()) as { drive_id: string }[];
  r = await call(url, 'writing_get', { id: ex[0].drive_id }, bearer);
  check('writing_get of excluded piece = not found', txt(r).includes('"found": false') && !txt(r).includes('text'));
}
r = await call(url, 'writing_list', { kind: 'poem&select=*' }, bearer);
check('writing_list rejects bad kind', must(r.body).isError === true, txt(r));
r = await call(url, 'writing_get', { id: l1[0].id }, bearer);
const g = JSON.parse(txt(r)) as { id: string; text: string };
check('writing_get by id', g.id === l1[0].id && typeof g.text === 'string', `chars=${g.text.length}`);
r = await call(url, 'writing_get', { id: 'x&select=*' }, bearer);
check('writing_get rejects bad id', must(r.body).isError === true, txt(r));
r = await call(url, 'writing_get', { id: 'zzzzzzzzzzzzzzzzzzzz' }, bearer);
check('writing_get unknown id -> found:false', txt(r).includes('"found": false'));
r = await call(url, 'writing_search', { query: 'the' }, bearer);
const s1 = JSON.parse(txt(r)) as SearchOut;
check('writing_search English', !must(r.body).isError && s1.total_matches > 0, `matches=${s1.total_matches}`);
r = await call(url, 'writing_search', { query: 'אור' }, bearer);
const s2 = JSON.parse(txt(r)) as SearchOut;
check('writing_search Hebrew', !must(r.body).isError, `matches=${s2.total_matches}`);
r = await call(url, 'writing_search', { query: '' }, bearer);
check('validation error is passed through', txt(r).startsWith('query must be'), txt(r));

const pathUrl = `${base}/writing-mcp/${secret}/mcp`;
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
const bad2 = await rpc(`${base}/writing-mcp/wrong/mcp`, 'tools/list', {}, {});
check('wrong path secret -> 401', bad2.status === 401);
const bad3 = await rpc(url, 'tools/list', {}, {});
check('no secret -> 401', bad3.status === 401);

await srv.shutdown();
