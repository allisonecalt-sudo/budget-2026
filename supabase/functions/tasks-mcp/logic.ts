// Pure logic for tasks-mcp: auth, input validation, row shaping.
// No network, no Deno globals, so it is unit-testable.

export const FUNCTION_NAME = 'tasks-mcp';

export interface TaskRow {
  id: string;
  title: string;
  notes?: string | null;
  state: string;
  open_subtype?: string | null;
  energy: string | null;
  next_step: string | null;
  due_date: string | null;
  resurface_at: string | null;
  place: string | null;
  project: string | null;
  topics?: string[] | null;
  gtask_id?: string | null;
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
}

export interface EventRow {
  event_type: string;
  from_value: string | null;
  to_value: string | null;
  note: string | null;
  occurred_at: string;
}

export interface QuestionRow {
  id: string;
  question: string;
  context: string | null;
  source: string | null;
  suggestion: string | null;
  created_at: string;
}

// ---------- auth ----------

export const MIN_SECRET_LENGTH = 32;

/** Bearer token from the Authorization header, or null. */
export function bearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1] : null;
}

/** Only `/mcp` or `/tasks-mcp/mcp` is a valid endpoint path. */
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

export const GENERIC_ERROR = 'tasks read failed';

export function safeErrorMessage(e: unknown): string {
  return e instanceof ValidationError ? e.message : GENERIC_ERROR;
}

// ---------- input validation ----------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUuid(v: unknown): string {
  if (typeof v !== 'string' || !UUID_RE.test(v)) {
    throw new ValidationError('task_id must be a UUID like 123e4567-e89b-12d3-a456-426614174000');
  }
  return v.toLowerCase();
}

function validateWholeNumber(v: unknown, name: string, def: number, min: number, max: number): number {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min) {
    throw new ValidationError(`${name} must be a whole number, ${min} or more`);
  }
  return Math.min(v, max);
}

export const validateLimit = (v: unknown, def = 30, max = 100): number =>
  validateWholeNumber(v, 'limit', def, 1, max);

export const validateDaysAhead = (v: unknown, def = 7, max = 60): number =>
  validateWholeNumber(v, 'days_ahead', def, 0, max);

// ---------- dates ----------

/** Calendar date (YYYY-MM-DD) of `now` in the given timezone. */
export function todayIso(now: Date, timeZone = 'Asia/Jerusalem'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return parts; // en-CA gives YYYY-MM-DD
}

/** Add whole days to a YYYY-MM-DD date (UTC arithmetic, no DST issues). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

// ---------- shaping ----------

export function shapeActive(rows: TaskRow[]) {
  return {
    count: rows.length,
    tasks: rows.map((r) => ({
      id: r.id,
      title: r.title,
      next_step: r.next_step,
      due_date: r.due_date,
      energy: r.energy,
      project: r.project,
      place: r.place,
    })),
  };
}

export type DueKind = 'overdue' | 'due' | 'resurfaces';

/** Classify a not-closed row against today and the window end (both YYYY-MM-DD). */
export function dueKind(r: TaskRow, today: string, end: string): DueKind | null {
  if (r.due_date && r.due_date < today) return 'overdue';
  if (r.due_date && r.due_date <= end) return 'due';
  if (r.resurface_at && r.resurface_at.slice(0, 10) <= end) return 'resurfaces';
  return null;
}

export function shapeDue(rows: TaskRow[], today: string, end: string) {
  const out = rows
    .filter((r) => r.state !== 'closed')
    .map((r) => ({ r, kind: dueKind(r, today, end) }))
    .filter((x): x is { r: TaskRow; kind: DueKind } => x.kind !== null)
    .map(({ r, kind }) => ({
      kind,
      id: r.id,
      title: r.title,
      state: r.state,
      next_step: r.next_step,
      due_date: r.due_date,
      resurface_at: r.resurface_at,
      energy: r.energy,
      project: r.project,
      place: r.place,
    }));
  const order: Record<DueKind, number> = { overdue: 0, due: 1, resurfaces: 2 };
  out.sort((a, b) =>
    order[a.kind] - order[b.kind] ||
    (a.due_date ?? a.resurface_at ?? '').localeCompare(b.due_date ?? b.resurface_at ?? '')
  );
  return { today, window_end: end, count: out.length, tasks: out };
}

export function shapeHistory(task: TaskRow | undefined, events: EventRow[]) {
  if (!task) throw new ValidationError('task not found, or it is closed');
  return {
    task,
    events: events.map((e) => ({
      at: e.occurred_at,
      type: e.event_type,
      from: e.from_value,
      to: e.to_value,
      note: e.note,
    })),
  };
}

export function shapeQuestions(rows: QuestionRow[]) {
  return {
    count: rows.length,
    questions: rows.map((q) => ({
      id: q.id,
      question: q.question,
      context: q.context,
      source: q.source,
      suggestion: q.suggestion,
      created_at: q.created_at,
    })),
  };
}
