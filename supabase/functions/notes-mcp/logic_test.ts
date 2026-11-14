import { assert, assertEquals, assertThrows } from '@std/assert';
import {
  GENERIC_ERROR,
  MAX_TEXT,
  ValidationError,
  isAuthorized,
  jerusalemParts,
  mergeNotes,
  notesForDay,
  safeErrorMessage,
  searchNotes,
  utcWindowForDay,
  validateDate,
  validateIncludeArchived,
  validateLimit,
  validateSearchTerm,
  type MemoRow,
  type VoiceRow,
} from './logic.ts';

const S = 'Zk3-correct_horse_battery_staple-0123456789';
const memo = (o: Partial<MemoRow>): MemoRow => ({
  content: 'ask doctor', tag: null, status: 'active', created_at: '2026-11-04T10:00:00Z', ...o,
});
const voice = (o: Partial<VoiceRow>): VoiceRow => ({
  transcript: 'hello', source: 'voice', archived: false, from_claude: false, created_at: '2026-11-04T11:00:00Z', ...o,
});

Deno.test('auth: unset or short secret fails closed', async () => {
  assertEquals(await isAuthorized(undefined, '/notes-mcp/mcp', `Bearer ${S}`), false);
  assertEquals(await isAuthorized('', '/notes-mcp/mcp', 'Bearer '), false);
  const short = 'a'.repeat(31);
  assertEquals(await isAuthorized(short, '/notes-mcp/mcp', `Bearer ${short}`), false);
  const ok32 = 'a'.repeat(32);
  assert(await isAuthorized(ok32, '/notes-mcp/mcp', `Bearer ${ok32}`));
});
Deno.test('auth: bearer header works', async () => {
  assert(await isAuthorized(S, '/notes-mcp/mcp', `Bearer ${S}`));
  assert(await isAuthorized(S, '/mcp', `bearer ${S}`));
});
Deno.test('auth: secret in URL path is NOT accepted', async () => {
  assertEquals(await isAuthorized(S, `/notes-mcp/${S}/mcp`, null), false);
});
Deno.test('auth: wrong or missing refused', async () => {
  assertEquals(await isAuthorized(S, '/notes-mcp/mcp', null), false);
  assertEquals(await isAuthorized(S, '/notes-mcp/mcp', 'Bearer nope'), false);
  assertEquals(await isAuthorized(S, '/notes-mcp/mcp', S), false);
  assertEquals(await isAuthorized(S, '/notes-mcp/admin', `Bearer ${S}`), false);
});

Deno.test('errors: only validation messages pass through', () => {
  assertEquals(safeErrorMessage(new ValidationError('date must be YYYY-MM-DD')), 'date must be YYYY-MM-DD');
  assertEquals(safeErrorMessage(new Error('<html>502</html> key=abc')), GENERIC_ERROR);
  assertEquals(safeErrorMessage('boom'), GENERIC_ERROR);
});

Deno.test('validate word, limit, include_archived', () => {
  assertEquals(validateSearchTerm('  רופא '), 'רופא');
  assertThrows(() => validateSearchTerm('  '));
  assertThrows(() => validateSearchTerm(5));
  assertThrows(() => validateSearchTerm('x'.repeat(101)));
  assertEquals(validateLimit(undefined), 20);
  assertEquals(validateLimit(500), 100);
  assertThrows(() => validateLimit(0));
  assertThrows(() => validateLimit(2.5));
  assertThrows(() => validateLimit('3'));
  assertEquals(validateIncludeArchived(undefined), false);
  assertEquals(validateIncludeArchived(true), true);
  assertThrows(() => validateIncludeArchived('yes'));
});

Deno.test('validate date', () => {
  assertEquals(validateDate('2026-11-04'), '2026-11-04');
  assertThrows(() => validateDate('2026-02-30'));
  assertThrows(() => validateDate('2026-1-4'));
  assertThrows(() => validateDate('2026-11-04&select=*'));
  assertThrows(() => validateDate(undefined));
});

Deno.test('Jerusalem time: winter +2, summer +3, and day rollover', () => {
  assertEquals(jerusalemParts('2026-11-04T10:00:00Z')?.time, '2026-11-04 12:00');
  assertEquals(jerusalemParts('2026-07-04T10:00:00Z')?.time, '2026-07-04 13:00');
  assertEquals(jerusalemParts('2026-11-04T22:30:00Z')?.date, '2026-11-05');
  assertEquals(jerusalemParts('not a date'), null);
});

Deno.test('utc window covers the whole Jerusalem day', () => {
  const w = utcWindowForDay('2026-11-04');
  assert(w.from <= '2026-11-03T22:00:00.000Z' && w.to >= '2026-11-04T22:00:00.000Z');
});

Deno.test('mergeNotes: newest first, drops Claude notes and empty text, marks archived', () => {
  const notes = mergeNotes(
    [memo({ tag: 'Dr Wed' }), memo({ content: '  ', created_at: '2026-11-04T12:00:00Z' }), memo({ status: 'done', created_at: '2026-11-04T09:00:00Z' })],
    [voice({}), voice({ from_claude: true, created_at: '2026-11-04T13:00:00Z' }), voice({ transcript: null })],
  );
  assertEquals(notes.map((n) => n.source), ['voice', 'memo', 'memo']);
  assertEquals(notes[1].tag, 'Dr Wed');
  assertEquals(notes[2].archived, true);
  assertEquals(notes[0].archived, false);
});

Deno.test('long text is clipped and flagged', () => {
  const [n] = mergeNotes([], [voice({ transcript: 'א'.repeat(MAX_TEXT + 10) })]);
  assertEquals([...n.text].length, MAX_TEXT);
  assertEquals(n.truncated, true);
});

Deno.test('search: case-insensitive, Hebrew, in memory', () => {
  const notes = mergeNotes(
    [memo({ content: 'Ask about MRI' })],
    [voice({ transcript: 'לקבוע תור לרופא' })],
  );
  assertEquals(searchNotes('mri', notes).count, 1);
  assertEquals(searchNotes('רופא', notes).count, 1);
  assertEquals(searchNotes('zzz', notes).count, 0);
});

Deno.test('notesForDay filters by Jerusalem date, oldest first', () => {
  const notes = mergeNotes(
    [memo({ created_at: '2026-11-04T22:30:00Z' })], // Nov 5 00:30 local
    [voice({ created_at: '2026-11-04T05:00:00Z' }), voice({ created_at: '2026-11-04T20:00:00Z' })],
  );
  const d4 = notesForDay('2026-11-04', notes);
  assertEquals(d4.map((n) => n.source), ['voice', 'voice']);
  assert(new Date(d4[0].utc) < new Date(d4[1].utc));
  assertEquals(notesForDay('2026-11-05', notes).length, 1);
});
