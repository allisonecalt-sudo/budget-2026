// Pure logic for writing-mcp: auth, input validation, row shaping.
// No network, no Deno globals, so it is unit-testable.

export const FUNCTION_NAME = 'writing-mcp';

/** One row of public.writing_pieces (only the columns this server ever selects). */
export interface PieceRow {
  drive_id: string;
  title: string | null;
  first_line: string | null;
  kind: string | null;
  year: number | null;
  written: string | null;
  drive_created: string | null;
  is_top: boolean | null;
  words: number | null;
  folder: string | null;
  body: string | null;
  link: string | null;
  note: string | null;
}

// ---------- auth ----------

export const MIN_SECRET_LENGTH = 32;

/** Bearer token from the Authorization header, or null. */
export function bearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1] : null;
}

/** Only `/mcp` or `/writing-mcp/mcp` is a valid endpoint path. */
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

export const GENERIC_ERROR = 'writing read failed';

export function safeErrorMessage(e: unknown): string {
  return e instanceof ValidationError ? e.message : GENERIC_ERROR;
}

// ---------- input validation ----------

/** Kinds she keeps private by default: never listed, searched or fetched. Lift only with her yes. */
export const EXCLUDED_KINDS = ['diary', 'steps', 'letter'] as const;
/** PostgREST filter fragment applied to every query. */
export const KIND_EXCLUDE_FILTER = `kind=not.in.(${EXCLUDED_KINDS.join(',')})`;

export const KINDS = [
  'poem', 'draft', 'collection', 'song', 'musing', 'torah', 'story', 'not_writing',
] as const;

const ID_RE = /^[A-Za-z0-9_-]{10,100}$/;

export function validateId(v: unknown): string {
  if (typeof v !== 'string' || !ID_RE.test(v)) {
    throw new ValidationError('id must be a piece id (10-100 letters, digits, _ or -)');
  }
  return v;
}

/** Defense in depth: a row of an excluded kind is never shown even if a query let it through. */
export function isVisible(r: { kind: string | null }): boolean {
  return !(EXCLUDED_KINDS as readonly string[]).includes(r.kind ?? '');
}

export function validateKind(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !(KINDS as readonly string[]).includes(v)) {
    throw new ValidationError(`kind must be one of: ${KINDS.join(', ')}`);
  }
  return v;
}

export function validateSearchTerm(v: unknown): string {
  if (typeof v !== 'string') throw new ValidationError('query must be text');
  const t = v.trim();
  if (t.length < 1 || t.length > 100) throw new ValidationError('query must be 1-100 characters');
  return t;
}

export function validateLimit(v: unknown, def = 30, max = 100): number {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new ValidationError('limit must be a whole number, 1 or more');
  }
  return Math.min(v, max);
}

export function validateTopOnly(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v !== 'boolean') throw new ValidationError('top_only must be true or false');
  return v;
}

// ---------- shaping ----------

export function pieceTitle(r: PieceRow): string {
  const t = r.title && r.title.trim() ? r.title.trim() : (r.first_line ?? '').trim();
  return t || '(untitled)';
}

function pieceDate(r: PieceRow): string | null {
  return r.written ?? (r.drive_created ? r.drive_created.slice(0, 10) : null);
}

export function shapeList(rows: PieceRow[]) {
  return rows.map((r) => ({
    id: r.drive_id,
    title: pieceTitle(r),
    kind: r.kind,
    date: pieceDate(r),
    top: r.is_top === true,
    words: r.words ?? 0,
  }));
}

export function shapePiece(r: PieceRow) {
  return {
    id: r.drive_id,
    title: pieceTitle(r),
    kind: r.kind,
    date: pieceDate(r),
    top: r.is_top === true,
    words: r.words ?? 0,
    folder: r.folder,
    link: r.link,
    note: r.note,
    text: r.body ?? '',
  };
}

export function normalize(s: string): string {
  return s.normalize('NFC').toLocaleLowerCase();
}

function snippet(body: string, q: string, radius = 70): string {
  const flat = body.replace(/\s+/g, ' ');
  const i = normalize(flat).indexOf(q);
  if (i < 0) return flat.slice(0, radius * 2);
  const start = Math.max(0, i - radius);
  const end = Math.min(flat.length, i + q.length + radius);
  return (start > 0 ? '...' : '') + flat.slice(start, end) + (end < flat.length ? '...' : '');
}

export function searchPieces(term: string, rows: PieceRow[], max = 30) {
  const q = normalize(term);
  const hits = rows.filter((r) => {
    const t = normalize(pieceTitle(r));
    const b = normalize(r.body ?? '');
    return t.includes(q) || b.includes(q);
  });
  return {
    total_matches: hits.length,
    shown: Math.min(hits.length, max),
    results: hits.slice(0, max).map((r) => ({
      id: r.drive_id,
      title: pieceTitle(r),
      kind: r.kind,
      date: pieceDate(r),
      snippet: snippet(r.body ?? '', q),
    })),
  };
}
