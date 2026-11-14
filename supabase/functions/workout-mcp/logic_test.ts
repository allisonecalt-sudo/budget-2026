import { assert, assertEquals, assertThrows } from '@std/assert';
import {
  GENERIC_ERROR,
  ValidationError,
  addDays,
  israelDate,
  isAuthorized,
  painTrend,
  recentSessions,
  safeErrorMessage,
  validateDays,
  validateLimit,
  validateWeeksBack,
  weekStartSaturday,
  weekSummary,
  type SessionRow,
} from './logic.ts';

const S = 'Zk3-correct_horse_battery_staple-0123456789';
const row = (o: Partial<SessionRow>): SessionRow => ({
  date: '2026-11-09T13:30:05.213+00:00',
  workout_type: 'B',
  duration_seconds: 1932,
  cardio_lane: 'elliptical',
  cardio_minutes: 10,
  elliptical_level: 3,
  elliptical_km: '0.80',
  elliptical_kcal: '67.9',
  elliptical_time_sec: 600,
  mood_before: 9,
  mood_after: null,
  back_pain_before: null,
  pain_back_0_10: null,
  wrist_pain_before: null,
  wrist_pain_0_10: null,
  session_note: null,
  capacity_before_1_10: null,
  capacity_after_1_10: null,
  pain_left_wrist_0_10: null,
  pain_right_wrist_0_10: null,
  ...o,
});

Deno.test('auth: unset or short secret fails closed', async () => {
  assertEquals(await isAuthorized(undefined, '/workout-mcp/mcp', `Bearer ${S}`), false);
  assertEquals(await isAuthorized('', '/workout-mcp/mcp', 'Bearer '), false);
  const short = 'a'.repeat(31);
  assertEquals(await isAuthorized(short, '/workout-mcp/mcp', `Bearer ${short}`), false);
  const ok32 = 'a'.repeat(32);
  assert(await isAuthorized(ok32, '/workout-mcp/mcp', `Bearer ${ok32}`));
});
Deno.test('auth: bearer header works; URL-path secret, wrong, missing refused', async () => {
  assert(await isAuthorized(S, '/workout-mcp/mcp', `Bearer ${S}`));
  assert(await isAuthorized(S, '/mcp', `bearer ${S}`));
  assertEquals(await isAuthorized(S, `/workout-mcp/${S}/mcp`, null), false);
  assertEquals(await isAuthorized(S, '/workout-mcp/mcp', null), false);
  assertEquals(await isAuthorized(S, '/workout-mcp/mcp', 'Bearer nope'), false);
  assertEquals(await isAuthorized(S, '/workout-mcp/mcp', S), false);
  assertEquals(await isAuthorized(S, '/workout-mcp/admin', `Bearer ${S}`), false);
});

Deno.test('errors: only validation messages pass through', () => {
  assertEquals(safeErrorMessage(new ValidationError('limit must be x')), 'limit must be x');
  assertEquals(safeErrorMessage(new Error('upstream key=abc')), GENERIC_ERROR);
  assertEquals(safeErrorMessage('boom'), GENERIC_ERROR);
});

Deno.test('validate limit / weeks_back / days: defaults, caps, rejects', () => {
  assertEquals(validateLimit(undefined), 10);
  assertEquals(validateLimit(500), 50);
  assertEquals(validateWeeksBack(undefined), 4);
  assertEquals(validateWeeksBack(99), 12);
  assertEquals(validateDays(undefined), 30);
  assertEquals(validateDays(999), 180);
  assertThrows(() => validateLimit(0), ValidationError);
  assertThrows(() => validateLimit(1.5), ValidationError);
  assertThrows(() => validateDays('3'), ValidationError);
  assertThrows(() => validateWeeksBack(-2), ValidationError);
});

Deno.test('weeks run Saturday to Friday', () => {
  assertEquals(weekStartSaturday('2026-11-14'), '2026-11-14'); // Saturday
  assertEquals(weekStartSaturday('2026-11-13'), '2026-11-07'); // Friday
  assertEquals(weekStartSaturday('2026-11-09'), '2026-11-07'); // Monday
  assertEquals(addDays('2026-11-14', -7), '2026-11-07');
});

Deno.test('israelDate: late-evening UTC is next day in Israel', () => {
  assertEquals(israelDate('2026-11-13T23:30:00Z'), '2026-11-14');
  assertEquals(israelDate('2026-11-13T13:25:16.298+00:00'), '2026-11-13');
});

Deno.test('recentSessions: newest first, limit, skips rest days, plain fields', () => {
  const out = recentSessions(
    [
      row({ date: '2026-11-02T10:00:00Z', workout_type: 'A', session_note: 'ok' }),
      row({ date: '2026-11-09T10:00:00Z' }),
      row({ date: '2026-11-10T10:00:00Z', workout_type: 'R' }),
    ],
    2,
  );
  assertEquals(out.length, 2);
  assertEquals(out[0].date, '2026-11-09');
  assertEquals(out[0].duration_minutes, 32);
  assertEquals(out[0].ride, { minutes: 10, level: 3, km: 0.8, kcal: 67.9 });
  assertEquals(out[1].note, 'ok');
});

Deno.test('weekSummary: Sat-Fri buckets, types, ride minutes', () => {
  const rows = [
    row({ date: '2026-11-13T10:00:00Z', workout_type: 'C', cardio_lane: null, elliptical_level: null, elliptical_time_sec: null }), // Fri -> week of Nov 7
    row({ date: '2026-11-09T10:00:00Z', workout_type: 'B' }), // Mon -> week of Nov 7
    row({ date: '2026-11-08T10:00:00Z', workout_type: 'A', elliptical_time_sec: 900 }), // Sun -> week of Nov 7
    row({ date: '2026-11-06T10:00:00Z', workout_type: 'A' }), // Fri -> week of Oct 31
    row({ date: '2026-11-14T08:00:00Z', workout_type: 'R' }), // rest day ignored
  ];
  const w = weekSummary(rows, 2, '2026-11-14');
  assertEquals(w[0].week_starts_saturday, '2026-11-14');
  assertEquals(w[0].sessions, 0);
  assertEquals(w.length, 2);
  const w3 = weekSummary(rows, 3, '2026-11-14');
  assertEquals(w3[1].week_starts_saturday, '2026-11-07');
  assertEquals(w3[1].week_ends_friday, '2026-11-13');
  assertEquals(w3[1].sessions, 3);
  assertEquals(w3[1].types_done, ['A', 'B', 'C']);
  assertEquals(w3[1].total_ride_minutes, 25);
  assertEquals(w3[2].sessions, 1);
});

Deno.test('painTrend: window, oldest first, only rows with a reading', () => {
  const rows = [
    row({ date: '2026-11-09T10:00:00Z', pain_back_0_10: 3, back_pain_before: 2 }),
    row({ date: '2026-11-02T10:00:00Z', wrist_pain_0_10: 1 }),
    row({ date: '2026-11-05T10:00:00Z' }), // no pain readings
    row({ date: '2026-09-01T10:00:00Z', pain_back_0_10: 9 }), // outside window
  ];
  const t = painTrend(rows, 30, '2026-11-14');
  assertEquals(t.map((x) => x.date), ['2026-11-02', '2026-11-09']);
  assertEquals(t[1], { date: '2026-11-09', workout_type: 'B', back_before: 2, back_after: 3, wrist_before: null, wrist_after: null });
});

Deno.test('older readings: left/right wrist and capacity are returned', () => {
  const rows = [row({ date: '2026-05-10T10:00:00Z', pain_left_wrist_0_10: 2, pain_right_wrist_0_10: 4, capacity_before_1_10: 7, capacity_after_1_10: 6, mood_before: null })];
  const t = painTrend(rows, 365, '2026-05-20');
  assertEquals(t.length, 1);
  assertEquals([t[0].wrist_left, t[0].wrist_right], [2, 4]);
  const s = recentSessions(rows, 5)[0];
  assertEquals([s.capacity_before, s.capacity_after, s.wrist_left, s.wrist_right], [7, 6, 2, 4]);
});
