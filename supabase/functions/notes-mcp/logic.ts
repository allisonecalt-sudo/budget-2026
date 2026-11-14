// Pure logic for notes-mcp: auth, input validation, row shaping.
// No network, no Deno globals, so it is unit-testable.

export const FUNCTION_NAME = 'notes-mcp';
export const TIME_ZONE = 'Asia/Jerusalem';

export interface MemoRow {
  content: string | null;
  tag: string | null;
  status: string | null;
  created_at: string;
  done_at?: string | null;
}

export interface VoiceRow {
  transcript: string | null;
  source: string | null;
  archived: boolean | null;
  from_claude?: boolean | null;
  created_at: string;
}

export interface Note {
  time: string; // Jerusalem local, "YYYY-MM-DD HH:mm"
  utc: string; // original timestamp
  source: 'memo' | 'voice';
  text: string;
  truncated?: true;
  tag?: string;
  archived: boolean;
}

// ---------- auth ----------

export const MIN_SECRET_LENGTH = 32;

/** Bearer token from the Authorization header, or null. */
export function bearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1] : null;
}

/** Only `/mcp` or `/notes-mcp/mcp` is a valid endpoint path. */
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

export const GENERIC_ERROR = 'notes read failed';

export function safeErrorMessage(e: unknown): string {
  return e instanceof ValidationError ? e.message : GENERIC_ERROR;
}

// ---------- input validation ----------

export function validateSearchTerm(v: unknown): string {
  if (typeof v !== 'string') throw new ValidationError('word must be text');
  const t = v.trim();
  if (t.length < 1 || t.length > 100) throw new ValidationError('word must be 1-100 characters');
  return t;
}

export function validateLimit(v: unknown, def = 20, max = 100): number {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new ValidationError('limit must be a whole number, 1 or more');
  }
  return Math.min(v, max);
}

export function validateIncludeArchived(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v !== 'boolean') throw new ValidationError('include_archived must be true or false');
  return v;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Real calendar date YYYY-MM-DD, or ValidationError. */
export function validateDate(v: unknown): string {
  if (typeof v !== 'string') throw new ValidationError('date must be YYYY-MM-DD');
  const m = DATE_RE.exec(v.trim());
  if (!m) throw new ValidationError('date must be YYYY-MM-DD');
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw new ValidationError('date must be a real calendar day, YYYY-MM-DD');
  }
  return v.trim();
}

/**
 * UTC window guaranteed to contain the whole Jerusalem day (offset is +2/+3).
 * Rows are then filtered exactly by jerusalemParts. Returns ISO strings built
 * only from a validated date, so they are safe to put in a query.
 */
export function utcWindowForDay(date: string): { from: string; to: string } {
  const [y, mo, d] = date.split('-').map(Number);
  const start = Date.UTC(y, mo - 1, d, 0, 0, 0);
  const from = new Date(start - 24 * 3600 * 1000).toISOString();
  const to = new Date(start + 48 * 3600 * 1000).toISOString();
  return { from, to };
}

// ---------- time ----------

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Jerusalem local date + time of an ISO timestamp, or null if unparsable. */
export function jerusalemParts(iso: string): { date: string; time: string } | null {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(t)) p[part.type] = part.value;
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, time: `${date} ${p.hour}:${p.minute}` };
}

// ---------- shaping ----------

export const MAX_TEXT = 4000;

function clip(text: string): { text: string; truncated?: true } {
  const chars = [...text];
  if (chars.length <= MAX_TEXT) return { text };
  return { text: chars.slice(0, MAX_TEXT).join(''), truncated: true };
}

export function memoToNote(r: MemoRow): Note | null {
  const raw = r.content ?? '';
  if (!raw.trim()) return null;
  const jp = jerusalemParts(r.created_at);
  if (!jp) return null;
  const n: Note = {
    time: jp.time,
    utc: r.created_at,
    source: 'memo',
    ...clip(raw),
    archived: r.status === 'done',
  };
  if (r.tag && r.tag.trim()) n.tag = r.tag;
  return n;
}

export function voiceToNote(r: VoiceRow): Note | null {
  if (r.from_claude === true) return null; // Claude's own notes are not hers
  const raw = r.transcript ?? '';
  if (!raw.trim()) return null;
  const jp = jerusalemParts(r.created_at);
  if (!jp) return null;
  return {
    time: jp.time,
    utc: r.created_at,
    source: 'voice',
    ...clip(raw),
    archived: r.archived === true,
  };
}

/** Merge both sources, newest first. */
export function mergeNotes(memos: MemoRow[], voice: VoiceRow[]): Note[] {
  const all: Note[] = [];
  for (const m of memos) {
    const n = memoToNote(m);
    if (n) all.push(n);
  }
  for (const v of voice) {
    const n = voiceToNote(v);
    if (n) all.push(n);
  }
  return all.sort((a, b) => new Date(b.utc).getTime() - new Date(a.utc).getTime());
}

export function normalize(s: string): string {
  return s.normalize('NFC').toLocaleLowerCase();
}

/** Case-insensitive substring match in memory (Hebrew + English). */
export function searchNotes(term: string, notes: Note[], max = 50): { count: number; notes: Note[] } {
  const q = normalize(term);
  const hits = notes.filter((n) => normalize(n.text).includes(q));
  return { count: hits.length, notes: hits.slice(0, max) };
}

/** Notes whose Jerusalem-local date is exactly `date`, oldest first. */
export function notesForDay(date: string, notes: Note[]): Note[] {
  return notes
    .filter((n) => jerusalemParts(n.utc)?.date === date)
    .sort((a, b) => new Date(a.utc).getTime() - new Date(b.utc).getTime());
}
