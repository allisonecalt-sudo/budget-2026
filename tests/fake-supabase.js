// A tiny in-memory stand-in for the Supabase project, used by every Playwright
// spec so the tests never touch her real database or log in as her.
//
// WHAT THIS IS: a PostgREST-shaped fake. Playwright intercepts every request the
// app makes to *.supabase.co (REST, auth, edge functions) and answers it from a
// per-test in-memory copy of fake data (tests/fake-seed.js). Writes land in that
// copy and vanish when the test ends.
//
// WHY: the old suite logged in as her and wrote to the live tables (the charity
// auto-save, the 5 write tests). Nothing here can reach production: every
// Supabase request is fulfilled locally, and anything unknown is recorded in
// db.unhandled so the fixture fails the test loudly.
//
// WHAT IT SUPPORTS (only what app.ts uses): select with column lists and
// `rel!inner(cols)` embeds, eq/neq/gt/gte/lt/lte/like/ilike/is/in/not filters,
// order, limit, single()/maybeSingle() (object Accept header), insert, upsert
// (on_conflict), PATCH and DELETE by filter, Prefer: return=representation.

const crypto = require('crypto');

const UNIQUE_KEYS = {
  budgets: ['month_id', 'category'],
  spend_floors: ['year', 'category'],
  admin_allocations: ['year', 'month_num'],
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-expose-headers': 'content-range',
};

function cmpVal(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last (Postgres default for asc)
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== '' && String(b).trim() !== '')
    return na - nb;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

// One filter value like "eq.abc", "in.(a,b)", "not.is.null", "ilike.*x*".
function matcher(spec) {
  let negate = false;
  let rest = spec;
  if (rest.startsWith('not.')) {
    negate = true;
    rest = rest.slice(4);
  }
  const dot = rest.indexOf('.');
  const op = rest.slice(0, dot);
  const arg = rest.slice(dot + 1);
  const eqLoose = (v, a) => v != null && String(v) === a;
  let fn;
  switch (op) {
    case 'eq':
      fn = (v) => eqLoose(v, arg);
      break;
    case 'neq':
      fn = (v) => !eqLoose(v, arg);
      break;
    case 'gt':
      fn = (v) => v != null && cmpVal(v, arg) > 0;
      break;
    case 'gte':
      fn = (v) => v != null && cmpVal(v, arg) >= 0;
      break;
    case 'lt':
      fn = (v) => v != null && cmpVal(v, arg) < 0;
      break;
    case 'lte':
      fn = (v) => v != null && cmpVal(v, arg) <= 0;
      break;
    case 'is':
      fn = (v) =>
        arg === 'null'
          ? v == null
          : arg === 'true'
            ? v === true
            : arg === 'false'
              ? v === false
              : false;
      break;
    case 'in': {
      const list = arg
        .replace(/^\(|\)$/g, '')
        .split(',')
        .map((x) => x.replace(/^"|"$/g, ''));
      fn = (v) => v != null && list.includes(String(v));
      break;
    }
    case 'like':
    case 'ilike': {
      const re = new RegExp(
        '^' +
          arg
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/%/g, '.*') +
          '$',
        op === 'ilike' ? 'i' : '',
      );
      fn = (v) => v != null && re.test(String(v));
      break;
    }
    default:
      throw new Error('fake-supabase: unsupported filter op ' + op);
  }
  return negate ? (v) => !fn(v) : fn;
}

class FakeDb {
  constructor(seed) {
    this.tables = {};
    for (const [name, rows] of Object.entries(seed)) {
      this.tables[name] = rows.map((r) => ({ ...r }));
    }
    this.writes = []; // every non-GET REST call: {method, table, body}
    this.unhandled = []; // requests the fake could not answer
    this.authCalls = [];
  }

  table(name) {
    if (!this.tables[name]) this.tables[name] = [];
    return this.tables[name];
  }

  rowsOf(name) {
    return this.table(name).map((r) => ({ ...r }));
  }

  applyFilters(rows, params) {
    const reserved = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
    let out = rows;
    for (const [key, value] of params) {
      if (reserved.has(key)) continue;
      if (key === 'or') {
        // or=(a.eq.1,b.eq.2)
        const parts = value.replace(/^\(|\)$/g, '').split(',');
        const ms = parts.map((p) => {
          const i = p.indexOf('.');
          return { col: p.slice(0, i), m: matcher(p.slice(i + 1)) };
        });
        out = out.filter((r) => ms.some((x) => x.m(r[x.col])));
        continue;
      }
      const m = matcher(value);
      out = out.filter((r) => m(r[key]));
    }
    return out;
  }

  // Project columns / embeds from a `select=` string.
  project(rows, selectStr) {
    const sel = selectStr || '*';
    // Split top-level commas (embeds contain commas inside parens).
    const parts = [];
    let depth = 0;
    let cur = '';
    for (const ch of sel) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    const embeds = [];
    const cols = [];
    for (const p of parts) {
      const em = p.match(/^([a-z_]+)(!inner)?\(([^)]*)\)$/);
      if (em)
        embeds.push({
          rel: em[1],
          inner: !!em[2],
          cols: em[3]
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean),
        });
      else cols.push(p);
    }
    const star = cols.includes('*') || cols.length === 0;
    let out = rows;
    for (const e of embeds) {
      const fk = e.rel.replace(/s$/, '') + '_id';
      const relRows = this.table(e.rel);
      out = out
        .map((r) => {
          const parent = relRows.find((x) => x.id === r[fk]);
          if (!parent) return e.inner ? null : { ...r, [e.rel]: null };
          const sub = {};
          (e.cols.includes('*') ? Object.keys(parent) : e.cols).forEach(
            (c) => (sub[c] = parent[c]),
          );
          return { ...r, [e.rel]: sub };
        })
        .filter(Boolean);
    }
    if (!star) {
      out = out.map((r) => {
        const o = {};
        cols.forEach((c) => (o[c] = r[c]));
        embeds.forEach((e) => (o[e.rel] = r[e.rel]));
        return o;
      });
    }
    return out;
  }

  order(rows, orderStr) {
    if (!orderStr) return rows;
    const keys = orderStr.split(',').map((k) => {
      const [col, ...mods] = k.split('.');
      return { col, desc: mods.includes('desc') };
    });
    return [...rows].sort((a, b) => {
      for (const k of keys) {
        const c = cmpVal(a[k.col], b[k.col]);
        if (c !== 0) return k.desc ? -c : c;
      }
      return 0;
    });
  }

  newId() {
    return crypto.randomUUID();
  }

  insertRows(name, bodyRows, { upsert, onConflict }) {
    const t = this.table(name);
    const result = [];
    for (const raw of bodyRows) {
      const keys = onConflict ? onConflict.split(',') : UNIQUE_KEYS[name] || ['id'];
      let existing = null;
      if (upsert) {
        existing = t.find((r) => keys.every((k) => raw[k] !== undefined && r[k] === raw[k]));
        if (!existing && !onConflict && UNIQUE_KEYS[name]) {
          existing = t.find((r) => UNIQUE_KEYS[name].every((k) => r[k] === raw[k]));
        }
      }
      if (existing) {
        Object.assign(existing, raw);
        result.push({ ...existing });
      } else {
        const row = { id: this.newId(), created_at: new Date().toISOString(), ...raw };
        t.push(row);
        result.push({ ...row });
      }
    }
    return result;
  }

  // Handle one REST request. Returns {status, body, headers}.
  rest(method, table, params, headers, bodyText) {
    const wantObject = /vnd\.pgrst\.object/.test(headers['accept'] || '');
    const prefer = headers['prefer'] || '';
    const wantRep = /return=representation/.test(prefer);
    const body = bodyText ? JSON.parse(bodyText) : null;
    const jsonHeaders = { 'content-type': 'application/json', ...CORS };
    const respondRows = (rows, status = 200) => {
      if (wantObject) {
        if (rows.length !== 1) {
          return {
            status: 406,
            headers: jsonHeaders,
            body: JSON.stringify({
              code: 'PGRST116',
              details: `The result contains ${rows.length} rows`,
              hint: null,
              message: 'JSON object requested, multiple (or no) rows returned',
            }),
          };
        }
        return { status, headers: jsonHeaders, body: JSON.stringify(rows[0]) };
      }
      return { status, headers: jsonHeaders, body: JSON.stringify(rows) };
    };

    if (method === 'GET') {
      let rows = this.applyFilters(this.rowsOf(table), params);
      rows = this.order(rows, params.get('order'));
      rows = this.project(rows, params.get('select'));
      if (params.get('limit')) rows = rows.slice(0, Number(params.get('limit')));
      return respondRows(rows);
    }

    this.writes.push({ method, table, body, url: [...params].map((p) => p.join('=')).join('&') });

    if (method === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      const upsert = /resolution=merge-duplicates/.test(prefer);
      const out = this.insertRows(table, list, { upsert, onConflict: params.get('on_conflict') });
      if (!wantRep) return { status: 201, headers: CORS, body: '' };
      return respondRows(this.project(out, params.get('select')), 201);
    }
    if (method === 'PATCH') {
      const targets = this.applyFilters(this.table(table), params);
      targets.forEach((r) => Object.assign(r, body));
      if (!wantRep) return { status: 204, headers: CORS, body: '' };
      return respondRows(
        this.project(
          targets.map((r) => ({ ...r })),
          params.get('select'),
        ),
      );
    }
    if (method === 'DELETE') {
      const targets = new Set(this.applyFilters(this.table(table), params));
      const removed = this.table(table).filter((r) => targets.has(r));
      this.tables[table] = this.table(table).filter((r) => !targets.has(r));
      if (!wantRep) return { status: 204, headers: CORS, body: '' };
      return respondRows(removed.map((r) => ({ ...r })));
    }
    throw new Error('fake-supabase: unsupported method ' + method);
  }
}

// Wire a context so every Supabase request is answered by `db`.
async function installFakeSupabase(context, db, { ptSessions } = {}) {
  await context.route(/\.supabase\.co\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    try {
      if (method === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: CORS });
      }
      if (url.pathname.startsWith('/rest/v1/')) {
        const table = url.pathname.replace('/rest/v1/', '');
        const out = db.rest(method, table, url.searchParams, req.headers(), req.postData());
        return route.fulfill(out);
      }
      if (url.pathname.startsWith('/auth/v1/')) {
        db.authCalls.push(method + ' ' + url.pathname);
        return route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json', ...CORS },
          body: JSON.stringify({}),
        });
      }
      if (url.pathname.startsWith('/functions/v1/pt-sessions')) {
        return route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json', ...CORS },
          body: JSON.stringify(ptSessions || { clients: [], sessions: [] }),
        });
      }
      db.unhandled.push(method + ' ' + req.url());
      return route.fulfill({ status: 500, headers: CORS, body: 'fake-supabase: unhandled' });
    } catch (err) {
      db.unhandled.push(method + ' ' + req.url() + ' -> ' + err.message);
      return route.fulfill({ status: 500, headers: CORS, body: String(err.message) });
    }
  });
}

module.exports = { FakeDb, installFakeSupabase };
