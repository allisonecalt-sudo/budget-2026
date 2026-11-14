// Pure logic for workout-mcp: auth, input validation, row shaping.
// No network, no Deno globals, so it is unit-testable.

export const FUNCTION_NAME = 'workout-mcp';

/** One workout_sessions row, only the columns this server ever selects. */
export interface SessionRow {
  date: string; // timestamptz string
  workout_type: string; // A | B | C | D | R (rest day)
  duration_seconds: number | null;
  cardio_lane: string | null;
  cardio_minutes: number | null;
  elliptical_level: number | null;
  elliptical_km: number | string | null; // numeric: may arrive as a string
  elliptical_kcal: number | string | null;
  elliptical_time_sec: number | null;
  mood_before: number | null;
  mood_after: number | null;
  back_pain_before: number | null;
  pain_back_0_10: number | null; // the AFTER reading
  wrist_pain_before: number | null;
  wrist_pain_0_10: number | null; // the AFTER reading
  session_note: string | null;
  capacity_before_1_10: number | null;
  capacity_after_1_10: number | null;
  pain_left_wrist_0_10: number | null; // older readings, left/right
  pain_right_wrist_0_10: number | null;
}

/** The exact column list requested from the database. */
export const SESSION_COLUMNS: (keyof SessionRow)[] = [
  'date',
  'workout_type',
  'duration_seconds',
  'cardio_lane',
  'cardio_minutes',
  'elliptical_level',
  'elliptical_km',
  'elliptical_kcal',
  'elliptical_time_sec',
  'mood_before',
  'mood_after',
  'back_pain_before',
  'pain_back_0_10',
  'wrist_pain_before',
  'wrist_pain_0_10',
  'session_note',
  'capacity_before_1_10',
  'capacity_after_1_10',
  'pain_left_wrist_0_10',
  'pain_right_wrist_0_10',
];

// ---------- auth ----------

export const MIN_SECRET_LENGTH = 32;

/** Bearer token from the Authorization header, or null. */
export function bearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1] : null;
}

/** Only `/mcp` or `/workout-mcp/mcp` is a valid endpoint path. */
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

export const GENERIC_ERROR = 'workout read failed';

export function safeErrorMessage(e: unknown): string {
  return e instanceof ValidationError ? e.message : GENERIC_ERROR;
}

// ---------- input validation ----------

function validateCount(v: unknown, name: string, def: number, max: number): number {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new ValidationError(`${name} must be a whole number, 1 or more`);
  }
  return Math.min(v, max);
}

export const validateLimit = (v: unknown): number => validateCount(v, 'limit', 10, 50);
export const validateWeeksBack = (v: unknown): number => validateCount(v, 'weeks_back', 4, 12);
export const validateDays = (v: unknown): number => validateCount(v, 'days', 30, 180);

// ---------- dates (Israel time; the app's weeks run Saturday to Friday) ----------

const TZ = 'Asia/Jerusalem';
const DAY_MS = 86_400_000;

/** Calendar date (YYYY-MM-DD) of an instant, in Israel time. */
export function israelDate(ts: string | Date): string {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function dateToUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function msToDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(ymd: string, n: number): string {
  return msToDate(dateToUtcMs(ymd) + n * DAY_MS);
}

/** The Saturday on or before this date (start of the app's week). */
export function weekStartSaturday(ymd: string): string {
  const dow = new Date(dateToUtcMs(ymd)).getUTCDay(); // 0 Sun .. 6 Sat
  return addDays(ymd, -((dow + 1) % 7));
}

// ---------- shaping ----------

const num = (v: number | string | null): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Ride (elliptical) minutes of one session, or null if no ride was logged. */
export function rideMinutes(r: SessionRow): number | null {
  if (r.cardio_lane !== 'elliptical') return null;
  if (r.elliptical_time_sec != null) return round1(r.elliptical_time_sec / 60);
  return r.cardio_minutes ?? null;
}

export function shapeSession(r: SessionRow) {
  const ride = rideMinutes(r);
  return {
    date: israelDate(r.date),
    workout_type: r.workout_type,
    duration_minutes: r.duration_seconds == null ? null : Math.round(r.duration_seconds / 60),
    ride:
      ride === null && r.elliptical_level == null
        ? null
        : {
            minutes: ride,
            level: r.elliptical_level,
            km: num(r.elliptical_km),
            kcal: num(r.elliptical_kcal),
          },
    mood_before: r.mood_before,
    mood_after: r.mood_after,
    capacity_before: r.capacity_before_1_10,
    capacity_after: r.capacity_after_1_10,
    back_pain_before: r.back_pain_before,
    back_pain_after: r.pain_back_0_10,
    wrist_pain_before: r.wrist_pain_before,
    wrist_pain_after: r.wrist_pain_0_10,
    wrist_left: r.pain_left_wrist_0_10,
    wrist_right: r.pain_right_wrist_0_10,
    note: r.session_note,
  };
}

/** Real sessions only: rest days (type R) are not sessions. */
export const isSession = (r: SessionRow): boolean => r.workout_type !== 'R';

export function recentSessions(rows: SessionRow[], limit: number) {
  const sessions = rows.filter(isSession).sort((a, b) => b.date.localeCompare(a.date));
  return sessions.slice(0, limit).map(shapeSession);
}

/** Earliest date (Israel time) a week-summary query must cover. */
export function weekSummaryFromDate(today: string, weeksBack: number): string {
  return addDays(weekStartSaturday(today), -7 * (weeksBack - 1));
}

export function weekSummary(rows: SessionRow[], weeksBack: number, today: string) {
  const thisWeek = weekStartSaturday(today);
  const weeks = [];
  for (let i = 0; i < weeksBack; i++) {
    const start = addDays(thisWeek, -7 * i);
    const end = addDays(start, 6);
    const inWeek = rows.filter((r) => {
      if (!isSession(r)) return false;
      const d = israelDate(r.date);
      return d >= start && d <= end;
    });
    const types: Record<string, number> = {};
    let ride = 0;
    for (const r of inWeek) {
      types[r.workout_type] = (types[r.workout_type] ?? 0) + 1;
      ride += rideMinutes(r) ?? 0;
    }
    weeks.push({
      week_starts_saturday: start,
      week_ends_friday: end,
      sessions: inWeek.length,
      types_done: Object.keys(types).sort(),
      count_by_type: types,
      total_ride_minutes: round1(ride),
    });
  }
  return weeks;
}

export function painFromDate(today: string, days: number): string {
  return addDays(today, -days);
}

export function painTrend(rows: SessionRow[], days: number, today: string) {
  const from = painFromDate(today, days);
  return rows
    .filter(isSession)
    .map((r) => ({ r, d: israelDate(r.date) }))
    .filter(({ d }) => d >= from && d <= today)
    .sort((a, b) => a.d.localeCompare(b.d))
    .filter(({ r }) =>
      [
        r.back_pain_before,
        r.pain_back_0_10,
        r.wrist_pain_before,
        r.wrist_pain_0_10,
        r.pain_left_wrist_0_10,
        r.pain_right_wrist_0_10,
      ].some(
        (v) => v !== null && v !== undefined,
      )
    )
    .map(({ r, d }) => ({
      date: d,
      workout_type: r.workout_type,
      back_before: r.back_pain_before,
      back_after: r.pain_back_0_10,
      wrist_before: r.wrist_pain_before,
      wrist_after: r.wrist_pain_0_10,
      ...(r.pain_left_wrist_0_10 != null ? { wrist_left: r.pain_left_wrist_0_10 } : {}),
      ...(r.pain_right_wrist_0_10 != null ? { wrist_right: r.pain_right_wrist_0_10 } : {}),
    }));
}
