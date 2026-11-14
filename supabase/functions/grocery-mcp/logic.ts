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

export const MIN_SECRET_LENGTH = 32;

/** Bearer token from the Authorization header, or null. */
export function bearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1] : null;
}

/** Only `/mcp` or `/grocery-mcp/mcp` is a valid endpoint path. */
export function isMcpPath(pathname: string): boolean {
  let segs = pathname.split('/').filter((s) => s.length > 0);
  if (segs[0] === FUNCTION_NAME) segs = segs.slice(1);
  return segs.length === 1 && segs[0] === 'mcp';
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

/** Fail closed: unset or shorter-than-32 secret refuses everything. Header only. */
export async function isAuthorized(
  expected: string | undefined | null,
  pathname: string,
  authHeader: string | null,
): Promise<boolean> {
  if (!expected || expected.length < MIN_SECRET_LENGTH) return false;
  if (!isMcpPath(pathname)) return false;
  const token = bearerToken(authHeader);
  if (token === null) return false;
  return await secretsMatch(token, expected);
}

// ---------- errors ----------

/** Only messages from this class are ever shown to callers. */
export class ValidationError extends Error {}

export const GENERIC_ERROR = 'grocery read failed';

export function safeErrorMessage(e: unknown): string {
  return e instanceof ValidationError ? e.message : GENERIC_ERROR;
}

// ---------- input validation ----------

const LIST_TYPE_RE = /^[A-Za-z0-9_-]{1,40}$/;

export function validateListType(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !LIST_TYPE_RE.test(v)) {
    throw new ValidationError('list_type must be 1-40 letters, digits, _ or -');
  }
  return v;
}

export function validateSearchTerm(v: unknown): string {
  if (typeof v !== 'string') throw new ValidationError('query must be text');
  const t = v.trim();
  if (t.length < 1 || t.length > 100) throw new ValidationError('query must be 1-100 characters');
  return t;
}

export function validateLimit(v: unknown, def = 5, max = 20): number {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new ValidationError('limit must be a whole number, 1 or more');
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
