import { assert, assertEquals, assertThrows } from '@std/assert';
import {
  GENERIC_ERROR,
  ValidationError,
  addDays,
  dueKind,
  isAuthorized,
  safeErrorMessage,
  shapeActive,
  shapeDue,
  shapeHistory,
  shapeQuestions,
  todayIso,
  validateDaysAhead,
  validateLimit,
  validateUuid,
  type TaskRow,
} from './logic.ts';

const S = 'Zk3-correct_horse_battery_staple-0123456789';
const task = (o: Partial<TaskRow>): TaskRow => ({
  id: '123e4567-e89b-12d3-a456-426614174000', title: 't', state: 'active', energy: null,
  next_step: null, due_date: null, resurface_at: null, place: null, project: null, ...o,
});

Deno.test('auth: unset or short secret fails closed', async () => {
  assertEquals(await isAuthorized(undefined, '/tasks-mcp/mcp', `Bearer ${S}`), false);
  assertEquals(await isAuthorized('', '/tasks-mcp/mcp', 'Bearer '), false);
  const short = 'a'.repeat(31);
  assertEquals(await isAuthorized(short, '/tasks-mcp/mcp', `Bearer ${short}`), false);
  const ok32 = 'a'.repeat(32);
  assert(await isAuthorized(ok32, '/tasks-mcp/mcp', `Bearer ${ok32}`));
});
Deno.test('auth: bearer header works', async () => {
  assert(await isAuthorized(S, '/tasks-mcp/mcp', `Bearer ${S}`));
  assert(await isAuthorized(S, '/mcp', `bearer ${S}`));
});
Deno.test('auth: secret in URL path is NOT accepted', async () => {
  assertEquals(await isAuthorized(S, `/tasks-mcp/${S}/mcp`, null), false);
  assertEquals(await isAuthorized(S, `/${S}/mcp`, null), false);
});
Deno.test('auth: wrong or missing refused', async () => {
  assertEquals(await isAuthorized(S, '/tasks-mcp/mcp', null), false);
  assertEquals(await isAuthorized(S, '/tasks-mcp/mcp', 'Bearer nope'), false);
  assertEquals(await isAuthorized(S, '/tasks-mcp/mcp', S), false);
});
Deno.test('auth: right secret on a wrong path is refused', async () => {
  assertEquals(await isAuthorized(S, '/tasks-mcp/admin', `Bearer ${S}`), false);
  assertEquals(await isAuthorized(S, '/tasks-mcp/a/mcp', `Bearer ${S}`), false);
});

Deno.test('errors: only validation messages pass through', () => {
  assertEquals(safeErrorMessage(new ValidationError('limit must be x')), 'limit must be x');
  assertEquals(safeErrorMessage(new Error('<html>502</html> key=abc')), GENERIC_ERROR);
  assertEquals(safeErrorMessage('boom'), GENERIC_ERROR);
  assertEquals(safeErrorMessage(new TypeError('fetch failed https://x.supabase.co')), GENERIC_ERROR);
});

Deno.test('validate uuid strictly', () => {
  assertEquals(validateUuid('123E4567-E89B-12D3-A456-426614174000'), '123e4567-e89b-12d3-a456-426614174000');
  for (const bad of ['', 'abc', '123e4567-e89b-12d3-a456-42661417400', '123e4567-e89b-12d3-a456-4266141740000',
    'x=1&select=*', '123e4567-e89b-12d3-a456-426614174000&limit=1', '123e4567-e89b-12d3-a456-426614174000\n', 5, null, undefined]) {
    assertThrows(() => validateUuid(bad), ValidationError);
  }
});
Deno.test('validate limit and days_ahead', () => {
  assertEquals(validateLimit(undefined), 30);
  assertEquals(validateLimit(500), 100);
  assertEquals(validateLimit(undefined, 20, 100), 20);
  assertThrows(() => validateLimit(0));
  assertThrows(() => validateLimit(1.5));
  assertThrows(() => validateLimit('3'));
  assertEquals(validateDaysAhead(undefined), 7);
  assertEquals(validateDaysAhead(0), 0);
  assertEquals(validateDaysAhead(999), 60);
  assertThrows(() => validateDaysAhead(-1));
  assertThrows(() => validateDaysAhead('7'));
});

Deno.test('dates', () => {
  assertEquals(addDays('2026-11-30', 1), '2026-12-01');
  assertEquals(addDays('2026-02-27', 2), '2026-03-01');
  assertEquals(addDays('2026-11-14', 0), '2026-11-14');
  // 22:30 UTC on Nov 14 is already Nov 15 in Jerusalem (UTC+2)
  assertEquals(todayIso(new Date('2026-11-14T22:30:00Z')), '2026-11-15');
  assertEquals(todayIso(new Date('2026-11-14T10:00:00Z')), '2026-11-14');
});

Deno.test('shapeActive keeps only the listed fields', () => {
  const r = shapeActive([task({ title: 'a', notes: 'secret notes', next_step: 'do it', energy: 'low' })]);
  assertEquals(r.count, 1);
  assertEquals(Object.keys(r.tasks[0]).sort(), ['due_date', 'energy', 'id', 'next_step', 'place', 'project', 'title']);
});

Deno.test('dueKind and shapeDue: overdue, due, resurfaces, outside, closed', () => {
  const today = '2026-11-14', end = '2026-11-21';
  assertEquals(dueKind(task({ due_date: '2026-11-10' }), today, end), 'overdue');
  assertEquals(dueKind(task({ due_date: '2026-11-14' }), today, end), 'due');
  assertEquals(dueKind(task({ due_date: '2026-11-21' }), today, end), 'due');
  assertEquals(dueKind(task({ due_date: '2026-11-22' }), today, end), null);
  assertEquals(dueKind(task({ resurface_at: '2026-11-18' }), today, end), 'resurfaces');
  assertEquals(dueKind(task({ resurface_at: '2026-11-18T08:00:00+00:00' }), today, end), 'resurfaces');
  assertEquals(dueKind(task({ resurface_at: '2026-12-18' }), today, end), null);
  const r = shapeDue([
    task({ id: 'c', title: 'resurf', state: 'later', resurface_at: '2026-11-18' }),
    task({ id: 'b', title: 'soon', due_date: '2026-11-15' }),
    task({ id: 'a', title: 'late', due_date: '2026-11-01' }),
    task({ id: 'x', title: 'closed', state: 'closed', due_date: '2026-11-01' }),
    task({ id: 'y', title: 'far', due_date: '2027-01-01' }),
  ], today, end);
  assertEquals(r.tasks.map((t) => t.title), ['late', 'soon', 'resurf']);
  assertEquals(r.count, 3);
});

Deno.test('shapeHistory: row + trail; missing task is a validation error', () => {
  const r = shapeHistory(task({}), [
    { event_type: 'created', from_value: null, to_value: 'active', note: null, occurred_at: '2026-05-13T00:00:00Z' },
  ]);
  assertEquals(r.events.length, 1);
  assertEquals(r.events[0].type, 'created');
  assertThrows(() => shapeHistory(undefined, []), ValidationError, 'closed');
});

Deno.test('shapeQuestions', () => {
  const r = shapeQuestions([{ id: '1', question: 'q?', context: null, source: 's', suggestion: 'yes', created_at: 'x' }]);
  assertEquals(r.count, 1);
  assertEquals(r.questions[0].question, 'q?');
});
