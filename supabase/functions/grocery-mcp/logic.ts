// Pure logic for grocery-mcp: auth, input validation, row shaping.
// No network, no Deno globals, so it is unit-testable.

export const FUNCTION_NAME = 'grocery-mcp';

export interface ItemRow {
  id?: string;
  list_type: string;
  item_name: string;
  section: string | null;
  checked: boolean;
  quantity: number | null;
  paid_by: string | null;
}

export interface CatalogRow {
  name: string;
  section: string | null;
}

export interface TripItem {
  item_name?: string;
  section?: string | null;
  quantity?: number | null;
  list_type?: string | null;
  price?: number | null;
}

export interface TripRow {
  id?: string;
  trip_date: string;
  shopper: string | null;
  trip_name: string | null;
  items: TripItem[] | null;
}

// ---------- auth ----------

/**
 * Pull the candidate secret out of a request: Bearer header first, then URL
 * path `/grocery-mcp/<secret>/mcp`. Returns null candidate list members that
 * are absent. Also reports whether the path shape is acceptable at all.
 */
export function extractCandidates(
  pathname: string,
  authHeader: string | null,
): { candidates: string[]; pathOk: boolean } {
  const candidates: string[] = [];
  if (authHeader) {
    const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (m) candidates.push(m[1]);
  }
  let segs = pathname.split('/').filter((s) => s.length > 0);
  if (segs[0] === FUNCTION_NAME) segs = segs.slice(1);
  let pathOk = false;
  if (segs.length === 1 && segs[0] === 'mcp') {
    pathOk = true;
  } else if (segs.length === 2 && segs[1] === 'mcp') {
    pathOk = true;
    try {
      candidates.push(decodeURIComponent(segs[0]));
    } catch {
      // malformed escape: ignore this candidate
    }
  }
  return { candidates, pathOk };
}

async function sha256(s: string): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return new Uint8Array(buf);
}

/** Constant-time equality over SHA-256 digests (hides length too). */
export async function secretsMatch(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

/** Fail closed: unset/empty secret refuses everything. */
export async function isAuthorized(
  expected: string | undefined | null,
  pathname: string,
  authHeader: string | null,
): Promise<boolean> {
  if (!expected) return false;
  const { candidates, pathOk } = extractCandidates(pathname, authHeader);
  if (!pathOk) return false;
  let ok = false;
  for (const c of candidates) {
    // evaluate every candidate; do not short-circuit
    if (await secretsMatch(c, expected)) ok = true;
  }
  return ok;
}

// ---------- input validation ----------

const LIST_TYPE_RE = /^[A-Za-z0-9_-]{1,40}$/;

export function validateListType(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !LIST_TYPE_RE.test(v)) {
    throw new Error('list_type must be 1-40 letters, digits, _ or -');
  }
  return v;
}

export function validateSearchTerm(v: unknown): string {
  if (typeof v !== 'string') throw new Error('query must be text');
  const t = v.trim();
  if (t.length < 1 || t.length > 100) throw new Error('query must be 1-100 characters');
  return t;
}

export function validateLimit(v: unknown, def = 5, max = 20): number {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new Error('limit must be a whole number, 1 or more');
  }
  return Math.min(v, max);
}

// ---------- shaping ----------

const NO_SECTION = 'Other';

export interface ListSection {
  section: string;
  items: { name: string; quantity: number; list_type: string }[];
}

export function groupBySection(rows: ItemRow[]): { count: number; sections: ListSection[] } {
  const open = rows.filter((r) => !r.checked);
  const map = new Map<string, ListSection>();
  for (const r of open) {
    const key = r.section && r.section.trim() ? r.section.trim() : NO_SECTION;
    let s = map.get(key);
    if (!s) {
      s = { section: key, items: [] };
      map.set(key, s);
    }
    s.items.push({ name: r.item_name, quantity: r.quantity ?? 1, list_type: r.list_type });
  }
  const sections = [...map.values()].sort((a, b) => a.section.localeCompare(b.section));
  for (const s of sections) s.items.sort((a, b) => a.name.localeCompare(b.name));
  return { count: open.length, sections };
}

export function normalize(s: string): string {
  return s.normalize('NFC').toLocaleLowerCase();
}

export function searchRows(
  term: string,
  items: ItemRow[],
  catalog: CatalogRow[],
  maxEach = 50,
): {
  items: { name: string; section: string; list_type: string; checked: boolean; quantity: number }[];
  catalog: { name: string; section: string }[];
} {
  const q = normalize(term);
  return {
    items: items
      .filter((r) => normalize(r.item_name).includes(q))
      .slice(0, maxEach)
      .map((r) => ({
        name: r.item_name,
        section: r.section ?? NO_SECTION,
        list_type: r.list_type,
        checked: r.checked,
        quantity: r.quantity ?? 1,
      })),
    catalog: catalog
      .filter((r) => normalize(r.name).includes(q))
      .slice(0, maxEach)
      .map((r) => ({ name: r.name, section: r.section ?? NO_SECTION })),
  };
}

export function shapeTrips(rows: TripRow[]) {
  return rows.map((t) => {
    const items = Array.isArray(t.items) ? t.items : [];
    return {
      date: t.trip_date,
      shopper: t.shopper,
      name: t.trip_name,
      item_count: items.length,
      items: items.map((i) => ({
        name: i.item_name ?? '',
        section: i.section ?? NO_SECTION,
        quantity: i.quantity ?? 1,
        list_type: i.list_type ?? null,
        price: i.price ?? null,
      })),
    };
  });
}
