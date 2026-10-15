// Budget — service worker
// Strategy:
//   - App shell (this scope's HTML/CSS/JS/icons/manifest): network-first, cache
//     fallback. Online users always get the freshest build; a broken/stale cached
//     shell can never permanently strand the app (was cache-first → hung spinner).
//   - Supabase REST GET: network-first, fall back to cache, fall back to empty array.
//   - Supabase REST POST/PATCH/DELETE: when offline, enqueue in IndexedDB and return
//     a synthetic 200 OK so Supabase JS reports success. Drain the queue on next
//     successful network call or 'online'-style replay tick.
//   - Each queued write gets a UUID 'op_id' to guard against double-flush.

const VERSION = 'budget-v69';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const SHELL_ASSETS = [
  './',
  './index.html',
  './dist/app.js',
  './dist/lib/analyze.js',
  './dist/lib/budget-math.js',
  './dist/lib/history-format.js',
  './dist/lib/money.js',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];

// External assets — cache opportunistically; do not require for install.
const EXTERNAL_OPPORTUNISTIC = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0'];

// IndexedDB — write queue.
const IDB_NAME = 'budget-2026-sw';
const IDB_VERSION = 1;
const IDB_STORE_QUEUE = 'write_queue';

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE_QUEUE)) {
        const store = db.createObjectStore(IDB_STORE_QUEUE, { keyPath: 'op_id' });
        store.createIndex('queued_at', 'queued_at');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbAdd(item) {
  return idbOpen().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE_QUEUE, 'readwrite');
        const req = tx.objectStore(IDB_STORE_QUEUE).put(item);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbAll() {
  return idbOpen().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE_QUEUE, 'readonly');
        const req = tx.objectStore(IDB_STORE_QUEUE).index('queued_at').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbDelete(opId) {
  return idbOpen().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE_QUEUE, 'readwrite');
        const req = tx.objectStore(IDB_STORE_QUEUE).delete(opId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
}

function uuidv4() {
  // Simple v4 — adequate for client-side dedup keys.
  if (self.crypto && typeof self.crypto.randomUUID === 'function') {
    return self.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function broadcastQueueUpdate() {
  // count = writes still waiting to go out; stuck = writes the server refused
  // (shown to her with a "try again" button, never silently dropped).
  const items = await idbAll().catch(() => []);
  const stuck = items.filter((i) => i.stuck).length;
  const count = items.length - stuck;
  const all = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  all.forEach((c) => c.postMessage({ type: 'queue-update', count, stuck, ts: Date.now() }));
}

// The login token saved with a queued write is long dead by the time it is
// replayed (tokens last about an hour). At replay time we ask an open app
// window for its CURRENT token instead (the page refreshes it if needed).
// Resolves to null when no window answers; the queue then simply waits.
async function getFreshToken() {
  const wins = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const win of wins) {
    const token = await new Promise((resolve) => {
      const ch = new MessageChannel();
      const timer = setTimeout(() => resolve(null), 4000);
      ch.port1.onmessage = (ev) => {
        clearTimeout(timer);
        ch.port1.close();
        resolve((ev.data && ev.data.token) || null);
      };
      win.postMessage({ type: 'need-token' }, [ch.port2]);
    });
    if (token) return token;
  }
  return null;
}

async function retryStuck() {
  const items = await idbAll();
  for (const item of items) {
    if (item.stuck) {
      delete item.stuck;
      delete item.stuck_status;
      await idbAdd(item);
    }
  }
  await drainQueue();
}

// ── Install / activate ────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // addAll fails atomically if any 404; use individual adds so a missing
      // optional asset doesn't block installation.
      Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Failed to cache shell asset', url, err);
          }),
        ),
      ),
    ),
  );
  // Activate immediately — old caches are version-suffixed so this is safe.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
      // Try a queue drain on activation in case we came back online.
      drainQueue().catch(() => {});
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'drain-now') {
    event.waitUntil(drainQueue());
  } else if (event.data.type === 'retry-stuck') {
    event.waitUntil(retryStuck());
  } else if (event.data.type === 'queue-count') {
    event.waitUntil(broadcastQueueUpdate());
  }
});

// ── Fetch routing ─────────────────────────────────────────────────────────

const SUPABASE_REST_HOST_HINT = '/rest/v1/';

function isShellRequest(url) {
  if (url.origin !== self.location.origin) return false;
  // Match anything inside the SW's scope (the GitHub Pages subpath).
  return url.pathname.startsWith(self.registration.scope.replace(self.location.origin, ''));
}

function isSupabaseRest(url) {
  return url.pathname.includes(SUPABASE_REST_HOST_HINT);
}

function isExternalOpportunistic(url) {
  return EXTERNAL_OPPORTUNISTIC.some((u) => url.href.startsWith(u));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only handle GET/POST/PATCH/DELETE we care about.
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  // 1) Same-origin shell requests — cache-first
  if (method === 'GET' && isShellRequest(url)) {
    event.respondWith(handleShell(request));
    return;
  }

  // 2) Supabase REST
  if (isSupabaseRest(url)) {
    if (method === 'GET') {
      event.respondWith(handleSupabaseGet(request));
      return;
    }
    if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
      event.respondWith(handleSupabaseWrite(request));
      return;
    }
    // OPTIONS (preflight) etc — let through
    return;
  }

  // 3) External opportunistic shell assets — cache-first
  if (method === 'GET' && isExternalOpportunistic(url)) {
    event.respondWith(handleExternal(request));
    return;
  }

  // Anything else: passthrough (default browser behavior).
});

async function handleShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    // Network-first: always prefer the freshest shell when online, and refresh
    // the cache so the offline fallback stays current.
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    // Offline (or fetch failed): serve the cached shell.
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached) return cached;
    // Final fallback for navigations: serve cached index.
    if (request.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function handleExternal(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    fetch(request)
      .then((res) => {
        if (res && res.ok) cache.put(request, res.clone());
      })
      .catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    return Response.error();
  }
}

async function handleSupabaseGet(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      // Cache a clone for offline fallback. Vary on full URL (search params).
      cache.put(request, res.clone()).catch(() => {});
      // Opportunistically drain queue when we know we're online.
      drainQueue().catch(() => {});
    }
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Last-resort: synthetic empty list so the UI doesn't crash.
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function handleSupabaseWrite(request) {
  // Try the network first. If it succeeds, drain the queue (we're online).
  try {
    const res = await fetch(request.clone());
    if (res.ok) {
      drainQueue().catch(() => {});
    }
    return res;
  } catch (err) {
    // Offline. Enqueue and return a synthetic success.
    return enqueueAndAck(request);
  }
}

async function enqueueAndAck(request) {
  const op_id = uuidv4();
  const body = await request.clone().text();
  const headers = {};
  request.headers.forEach((v, k) => {
    headers[k] = v;
  });
  // Strip auth headers we can't safely persist? — keep them; this is an
  // anon-key client and the keys are public (already shipped in app.js).
  const item = {
    op_id,
    url: request.url,
    method: request.method,
    headers,
    body,
    queued_at: Date.now(),
  };
  await idbAdd(item);
  await broadcastQueueUpdate();

  // Synthetic response shape: Supabase JS expects either a JSON array or
  // single object back. Mirror what `Prefer: return=representation` would
  // return — for inserts: try to echo the body as a one-element array.
  // For PATCH/DELETE: return empty array. The app will refresh on reconnect.
  let respBody = '[]';
  const prefer = headers['prefer'] || headers['Prefer'] || '';
  if (request.method === 'POST' && prefer.includes('return=representation')) {
    try {
      const parsed = JSON.parse(body);
      // Ensure id field present for downstream code that expects it
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      respBody = JSON.stringify(arr);
    } catch (e) {
      respBody = '[]';
    }
  }
  return new Response(respBody, {
    status: 200,
    statusText: 'OK (queued offline)',
    headers: {
      'Content-Type': 'application/json',
      'X-Budget-Queued': op_id,
    },
  });
}

let _draining = false;
async function drainQueue() {
  if (_draining) return;
  _draining = true;
  try {
    const all = await idbAll();
    const items = all.filter((i) => !i.stuck);
    if (!items.length) {
      await broadcastQueueUpdate();
      return;
    }
    const token = await getFreshToken();
    if (!token) {
      // No signed-in window to borrow a token from. Leave everything queued.
      await broadcastQueueUpdate();
      return;
    }
    for (const item of all) {
      // A stuck item that is not an auth refusal (401/403) holds the line: later
      // writes may depend on it, so they wait until she taps Try again.
      if (item.stuck) {
        if (item.stuck_status === 401 || item.stuck_status === 403) continue;
        break;
      }
      try {
        const headers = Object.assign({}, item.headers);
        // Replace whatever token was saved at queue time with the fresh one.
        delete headers['authorization'];
        headers['Authorization'] = 'Bearer ' + token;
        const res = await fetch(item.url, {
          method: item.method,
          headers,
          body: item.method === 'GET' ? undefined : item.body,
        });
        if (res.ok || res.status === 409 /* idempotent retry */) {
          await idbDelete(item.op_id);
        } else if (res.status === 401 || res.status === 403) {
          // Refused with a fresh login: park it as stuck (visible in the app, with a
          // retry button) and carry on with the rest.
          item.stuck = true;
          item.stuck_status = res.status;
          await idbAdd(item);
        } else if (
          res.status >= 400 &&
          res.status < 500 &&
          res.status !== 408 &&
          res.status !== 429
        ) {
          // Permanently refused (422-style): flag it so she sees "didn't save", and
          // stop here to keep order.
          item.stuck = true;
          item.stuck_status = res.status;
          await idbAdd(item);
          break;
        } else {
          // Server hiccup (408/429/5xx): STOP and retry later.
          // Later writes may depend on this one (an edit to a row this add creates),
          // so they must not jump ahead and silently hit zero rows.
          break;
        }
      } catch (err) {
        // Network is down again: abort the drain, try on the next online tick.
        break;
      }
    }
    await broadcastQueueUpdate();
  } finally {
    _draining = false;
  }
}
