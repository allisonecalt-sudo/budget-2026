// Local end-to-end smoke: serves the handler on a local port and calls it over
// real HTTP (streamable HTTP, JSON responses). Read-only. Needs env:
// NOTES_MCP_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { handler } from './index.ts';

const secret = Deno.env.get('NOTES_MCP_SECRET') ?? '';
if (secret.length < 32) throw new Error('set NOTES_MCP_SECRET (32+ chars) for the smoke');
const srv = Deno.serve({ port: 8798, onListen() {} }, handler);
const base = 'http://127.0.0.1:8798';
let n = 0;

interface RpcBody {
  result: { tools: { name: string }[]; isError?: boolean; content: { text: string }[] };
}
interface NoteOut { time: string; utc: string; source: string; text: string }
interface Out { count: number; notes: NoteOut[] }
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
const url = `${base}/notes-mcp/mcp`;
const call = (name: string, args: unknown) => rpc(url, 'tools/call', { name, arguments: args }, bearer);
const txt = (r: { body: RpcBody | null }) => must(r.body).content[0].text;

await rpc(url, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } }, bearer);
const list = await rpc(url, 'tools/list', {}, bearer);
const names = must(list.body).tools.map((t) => t.name).sort();
check('tools/list (bearer) = 3 read tools', JSON.stringify(names) === JSON.stringify(['notes_by_day', 'notes_recent', 'notes_search']), names.join(','));

let r = await call('notes_recent', {});
let j = JSON.parse(txt(r)) as Out;
check('notes_recent default', !must(r.body).isError && j.count <= 20 && j.count > 0, `count=${j.count}`);
const sorted = j.notes.every((x, i) => i === 0 || new Date(j.notes[i - 1].utc) >= new Date(x.utc));
check('notes_recent newest first', sorted);
r = await call('notes_recent', { limit: 500, include_archived: true });
j = JSON.parse(txt(r)) as Out;
check('notes_recent limit capped at 100', j.count <= 100, `count=${j.count}`);
r = await call('notes_recent', { limit: 0 });
check('validation error passes through', txt(r).startsWith('limit must be'), txt(r));

const probe = j.notes.find((x) => /[A-Za-z]{5,}/.test(x.text));
const word = probe ? (/[A-Za-z]{5,}/.exec(probe.text) as RegExpExecArray)[0] : 'the';
r = await call('notes_search', { word: word.toUpperCase() });
const s1 = JSON.parse(txt(r)) as Out;
check('notes_search uppercase finds', !must(r.body).isError && s1.count > 0, `word=${word} count=${s1.count}`);
r = await call('notes_search', { word: 'רופא' });
const s2 = JSON.parse(txt(r)) as Out;
check('notes_search Hebrew runs', !must(r.body).isError, `count=${s2.count}`);
r = await call('notes_search', { word: "x' or 1=1 --&select=*" });
check('notes_search odd characters are harmless', !must(r.body).isError, txt(r).slice(0, 40));

const day = probe ? probe.time.slice(0, 10) : '2026-11-04';
r = await call('notes_by_day', { date: day });
const d1 = JSON.parse(txt(r)) as Out;
check('notes_by_day returns that Jerusalem day', !must(r.body).isError && d1.notes.every((x) => x.time.startsWith(day)), `day=${day} count=${d1.count}`);
r = await call('notes_by_day', { date: '2026-11-04&select=*' });
check('notes_by_day rejects bad date', must(r.body).isError === true, txt(r));

const pl = await rpc(`${base}/notes-mcp/${secret}/mcp`, 'tools/list', {}, {});
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
