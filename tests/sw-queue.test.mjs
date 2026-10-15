// What this is: unit tests for the offline write queue in sw.js (no browser, no
//   network). sw.js is loaded into a Node vm with a tiny fake IndexedDB, a fake
//   fetch and a fake "app window" that answers the service worker's token request.
// Why it exists: the queue used to replay writes with the login token saved at
//   queue time (dead after about an hour) and stopped at the first failure, so one
//   stale write blocked every write behind it, for good. QA gap, 2026-10-12.
// What's decided: a replay uses a FRESH token from an open window; a refused write
//   (401/4xx) is marked stuck and skipped while the rest drain; "retry" un-sticks;
//   a network failure stops the drain and keeps everything queued.
// Links: sw.js, app.ts (retryStuckWrites, need-token reply).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const swSource = fs.readFileSync(path.join(here, '..', 'sw.js'), 'utf8');

// Minimal IndexedDB: one store, keyPath op_id, index 'queued_at' sorted by that field.
function makeIndexedDb() {
  const rows = new Map();
  const request = (compute) => {
    const req = {};
    setTimeout(() => {
      try {
        req.result = compute();
        if (req.onsuccess) req.onsuccess();
      } catch (e) {
        req.error = e;
        if (req.onerror) req.onerror();
      }
    }, 0);
    return req;
  };
  const store = {
    put: (item) => request(() => (rows.set(item.op_id, structuredClone(item)), item.op_id)),
    delete: (id) => request(() => void rows.delete(id)),
    count: () => request(() => rows.size),
    index: () => ({
      getAll: () =>
        request(() =>
          [...rows.values()]
            .sort((a, b) => a.queued_at - b.queued_at)
            .map((r) => structuredClone(r)),
        ),
    }),
    createIndex: () => {},
  };
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => store,
    transaction: () => ({ objectStore: () => store }),
  };
  return {
    rows,
    indexedDB: {
      open: () => {
        const req = {};
        setTimeout(() => {
          req.result = db;
          if (req.onsuccess) req.onsuccess();
        }, 0);
        return req;
      },
    },
  };
}

function loadSw({ token, respond }) {
  const idb = makeIndexedDb();
  const sent = []; // every fetch the worker made
  const broadcasts = [];
  const win = {
    postMessage(msg, ports) {
      if (msg.type === 'need-token') ports[0].postMessage({ token });
      else broadcasts.push(msg);
    },
  };
  const selfObj = {
    registration: { scope: 'https://x.test/' },
    location: { origin: 'https://x.test' },
    addEventListener() {},
    skipWaiting() {},
    crypto: { randomUUID: () => 'op-' + Math.random().toString(16).slice(2) },
    clients: {
      matchAll: async () => [win],
      claim: async () => {},
    },
  };
  const context = {
    self: selfObj,
    indexedDB: idb.indexedDB,
    caches: {},
    console,
    setTimeout,
    clearTimeout,
    MessageChannel,
    Promise,
    URL,
    Response: class {},
    Request: class {},
    fetch: async (url, init) => {
      sent.push({ url, init });
      return respond(url, init);
    },
  };
  vm.createContext(context);
  vm.runInContext(swSource, context);
  return { ctx: context, idb, sent, broadcasts };
}

const item = (n, extra = {}) => ({
  op_id: 'op-' + n,
  url: 'https://p.supabase.co/rest/v1/transactions?id=eq.' + n,
  method: 'PATCH',
  headers: { authorization: 'Bearer OLD-EXPIRED', apikey: 'anon' },
  body: '{"amount":' + n + '}',
  queued_at: n,
  ...extra,
});

async function seed(env, items) {
  for (const i of items) env.idb.rows.set(i.op_id, i);
}

test('replay uses the fresh login token, not the one saved at queue time', async () => {
  const env = loadSw({ token: 'FRESH', respond: () => ({ ok: true, status: 200 }) });
  await seed(env, [item(1), item(2)]);
  await env.ctx.drainQueue();
  assert.equal(env.sent.length, 2);
  for (const s of env.sent) {
    assert.equal(s.init.headers.Authorization, 'Bearer FRESH');
    assert.equal(s.init.headers.authorization, undefined);
    assert.equal(s.init.headers.apikey, 'anon');
  }
  assert.equal(env.idb.rows.size, 0);
});

test('a refused write is marked stuck and the rest of the queue still drains', async () => {
  const env = loadSw({
    token: 'FRESH',
    respond: (url) => (url.endsWith('.2') ? { ok: false, status: 401 } : { ok: true, status: 200 }),
  });
  await seed(env, [item(1), item(2), item(3)]);
  await env.ctx.drainQueue();
  assert.equal(env.sent.length, 3, 'item 3 was still sent after item 2 was refused');
  assert.deepEqual([...env.idb.rows.keys()], ['op-2']);
  assert.equal(env.idb.rows.get('op-2').stuck, true);
  assert.equal(env.idb.rows.get('op-2').stuck_status, 401);
  const last = env.broadcasts.at(-1);
  assert.equal(last.stuck, 1);
  assert.equal(last.count, 0);
  // A later drain leaves the stuck item alone.
  env.sent.length = 0;
  await env.ctx.drainQueue();
  assert.equal(env.sent.length, 0);
});

test('retry puts stuck items back in line and sends them again', async () => {
  let ok = false;
  const env = loadSw({
    token: 'FRESH',
    respond: () => (ok ? { ok: true, status: 200 } : { ok: false, status: 401 }),
  });
  await seed(env, [item(1)]);
  await env.ctx.drainQueue();
  assert.equal(env.idb.rows.get('op-1').stuck, true);
  ok = true;
  await env.ctx.retryStuck();
  assert.equal(env.idb.rows.size, 0);
});

test('a network failure stops the drain and keeps every item queued', async () => {
  const env = loadSw({
    token: 'FRESH',
    respond: () => {
      throw new Error('offline');
    },
  });
  await seed(env, [item(1), item(2)]);
  await env.ctx.drainQueue();
  assert.equal(env.sent.length, 1);
  assert.equal(env.idb.rows.size, 2);
  assert.ok(![...env.idb.rows.values()].some((r) => r.stuck));
});

test('with no signed-in window the queue waits instead of sending a dead token', async () => {
  const env = loadSw({ token: null, respond: () => ({ ok: true, status: 200 }) });
  await seed(env, [item(1)]);
  await env.ctx.drainQueue();
  assert.equal(env.sent.length, 0);
  assert.equal(env.idb.rows.size, 1);
});

test('a server hiccup (503) stops the drain so a later edit cannot jump ahead of its add', async () => {
  const env = loadSw({
    token: 'FRESH',
    respond: (url) => (url.endsWith('.1') ? { ok: false, status: 503 } : { ok: true, status: 200 }),
  });
  // item 1 = an add, item 2 = a later edit of the row item 1 creates.
  await seed(env, [item(1), item(2)]);
  await env.ctx.drainQueue();
  assert.equal(env.sent.length, 1, 'the edit must not be sent before its add');
  assert.deepEqual([...env.idb.rows.keys()].sort(), ['op-1', 'op-2']);
  assert.equal(env.idb.rows.get('op-1').stuck, undefined);
  // Later the server is back: both go out, in order.
  env.sent.length = 0;
  env.ctx.fetch = async (url, init) => (env.sent.push({ url, init }), { ok: true, status: 200 });
  await env.ctx.drainQueue();
  assert.deepEqual(
    env.sent.map((s) => s.url.slice(-2)),
    ['.1', '.2'],
  );
  assert.equal(env.idb.rows.size, 0);
});

test('a permanently refused write (422) is flagged stuck, the badge count shows it, and later items wait', async () => {
  const env = loadSw({
    token: 'FRESH',
    respond: (url) => (url.endsWith('.1') ? { ok: false, status: 422 } : { ok: true, status: 200 }),
  });
  await seed(env, [item(1), item(2)]);
  await env.ctx.drainQueue();
  assert.equal(env.sent.length, 1, 'item 2 waits behind the refused item 1');
  assert.equal(env.idb.rows.get('op-1').stuck, true);
  assert.equal(env.idb.rows.get('op-1').stuck_status, 422);
  const last = env.broadcasts.at(-1);
  assert.equal(last.stuck, 1);
  assert.equal(last.count, 1);
  // A later drain still holds item 2 back.
  env.sent.length = 0;
  await env.ctx.drainQueue();
  assert.equal(env.sent.length, 0);
  assert.ok(env.idb.rows.has('op-2'));
});
