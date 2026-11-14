// Local end-to-end smoke: serves the handler on a local port and calls it over
// real HTTP (streamable HTTP, JSON responses). Read-only. Needs env:
// GROCERY_MCP_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { handler } from './index.ts';

const secret = Deno.env.get('GROCERY_MCP_SECRET')!;
const srv = Deno.serve({ port: 8799, onListen() {} }, handler);
const base = 'http://127.0.0.1:8799';
let n = 0;

async function rpc(url: string, method: string, params: unknown, headers: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params }),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
function check(name: string, ok: boolean, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);
  if (!ok) { Deno.exitCode = 1; }
}
const bearer = { authorization: `Bearer ${secret}` };
const url = `${base}/grocery-mcp/mcp`;

await rpc(url, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } }, bearer);
const list = await rpc(url, 'tools/list', {}, bearer);
const names = (list.body.result.tools as { name: string }[]).map((t) => t.name).sort();
check('tools/list (bearer) = 3 read tools', JSON.stringify(names) === JSON.stringify(['grocery_list', 'grocery_recent_trips', 'grocery_search']), names.join(','));

const call = (u: string, name: string, args: unknown, h: Record<string, string>) =>
  rpc(u, 'tools/call', { name, arguments: args }, h);
const txt = (r: { body: { result: { isError?: boolean; content: { text: string }[] } } }) => r.body.result.content[0].text;

let r = await call(url, 'grocery_list', {}, bearer);
let j = JSON.parse(txt(r));
check('grocery_list', !r.body.result.isError && typeof j.count === 'number', `count=${j.count} sections=${j.sections.length}`);
r = await call(url, 'grocery_list', { list_type: 'allison' }, bearer);
j = JSON.parse(txt(r));
check('grocery_list list_type=allison', typeof j.count === 'number', `count=${j.count}`);
r = await call(url, 'grocery_list', { list_type: 'a&select=*' }, bearer);
check('grocery_list rejects bad list_type', r.body.result.isError === true, txt(r));
r = await call(url, 'grocery_search', { query: 'MILK' }, bearer);
j = JSON.parse(txt(r));
check('grocery_search MILK', !r.body.result.isError, `items=${j.items.length} catalog=${j.catalog.length}`);
r = await call(url, 'grocery_search', { query: 'חלב' }, bearer);
j = JSON.parse(txt(r));
check('grocery_search Hebrew', !r.body.result.isError, `items=${j.items.length} catalog=${j.catalog.length}`);
r = await call(url, 'grocery_recent_trips', {}, bearer);
j = JSON.parse(txt(r));
check('grocery_recent_trips default 5', Array.isArray(j) && j.length <= 5, `trips=${j.length}`);
r = await call(url, 'grocery_recent_trips', { limit: 99 }, bearer);
j = JSON.parse(txt(r));
check('grocery_recent_trips limit capped at 20', j.length <= 20, `trips=${j.length}`);

const pathUrl = `${base}/grocery-mcp/${secret}/mcp`;
const pl = await rpc(pathUrl, 'tools/list', {}, {});
check('tools/list (secret in URL path)', pl.status === 200 && pl.body.result.tools.length === 3);

const bad1 = await rpc(url, 'tools/list', {}, { authorization: 'Bearer wrong' });
check('wrong bearer -> 401', bad1.status === 401);
const bad2 = await rpc(`${base}/grocery-mcp/wrong/mcp`, 'tools/list', {}, {});
check('wrong path secret -> 401', bad2.status === 401);
const bad3 = await rpc(url, 'tools/list', {}, {});
check('no secret -> 401', bad3.status === 401);

await srv.shutdown();
