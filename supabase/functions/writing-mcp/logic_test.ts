import { assert, assertEquals, assertThrows } from '@std/assert';
import {
  GENERIC_ERROR,
  ValidationError,
  isAuthorized,
  pieceTitle,
  safeErrorMessage,
  searchPieces,
  shapeList,
  shapePiece,
  EXCLUDED_KINDS,
  KIND_EXCLUDE_FILTER,
  isVisible,
  validateId,
  validateKind,
  validateLimit,
  validateSearchTerm,
  validateTopOnly,
  type PieceRow,
} from './logic.ts';

const S = 'Zk3-correct_horse_battery_staple-0123456789';
const piece = (o: Partial<PieceRow>): PieceRow => ({
  drive_id: 'abcdefghij1234567890', title: 'Morning', first_line: 'first', kind: 'poem', year: 2024,
  written: '2024-03-01', drive_created: '2026-10-19T18:30:09Z', is_top: false, words: 12, folder: 'poems/2024',
  body: 'The light came in slowly', link: 'https://docs.google.com/x', note: null, ...o,
});

Deno.test('auth: unset or short secret fails closed', async () => {
  assertEquals(await isAuthorized(undefined, '/writing-mcp/mcp', `Bearer ${S}`), false);
  assertEquals(await isAuthorized('', '/writing-mcp/mcp', 'Bearer '), false);
  const short = 'a'.repeat(31);
  assertEquals(await isAuthorized(short, '/writing-mcp/mcp', `Bearer ${short}`), false);
  const ok32 = 'a'.repeat(32);
  assert(await isAuthorized(ok32, '/writing-mcp/mcp', `Bearer ${ok32}`));
});
Deno.test('auth: bearer header works', async () => {
  assert(await isAuthorized(S, '/writing-mcp/mcp', `Bearer ${S}`));
  assert(await isAuthorized(S, '/mcp', `bearer ${S}`));
});
Deno.test('auth: secret in URL path is NOT accepted', async () => {
  assertEquals(await isAuthorized(S, `/writing-mcp/${S}/mcp`, null), false);
});
Deno.test('auth: wrong or missing refused; wrong path refused', async () => {
  assertEquals(await isAuthorized(S, '/writing-mcp/mcp', null), false);
  assertEquals(await isAuthorized(S, '/writing-mcp/mcp', 'Bearer nope'), false);
  assertEquals(await isAuthorized(S, '/writing-mcp/mcp', S), false);
  assertEquals(await isAuthorized(S, '/writing-mcp/admin', `Bearer ${S}`), false);
  assertEquals(await isAuthorized(S, '/grocery-mcp/mcp', `Bearer ${S}`), false);
});

Deno.test('errors: only validation messages pass through', () => {
  assertEquals(safeErrorMessage(new ValidationError('query must be text')), 'query must be text');
  assertEquals(safeErrorMessage(new Error('<html>502</html> key=abc')), GENERIC_ERROR);
  assertEquals(safeErrorMessage('boom'), GENERIC_ERROR);
});

Deno.test('validate id / kind / limit / top_only / query', () => {
  assertEquals(validateId('abcdefghij1234567890'), 'abcdefghij1234567890');
  assertThrows(() => validateId('short'));
  assertThrows(() => validateId('abcdefghij&select=*'));
  assertThrows(() => validateId(5));
  assertEquals(validateKind(undefined), null);
  assertEquals(validateKind('musing'), 'musing');
  for (const k of ['diary', 'steps', 'letter']) assertThrows(() => validateKind(k));
  assertThrows(() => validateKind('poem&x=1'));
  assertEquals(validateLimit(undefined), 30);
  assertEquals(validateLimit(500), 100);
  assertThrows(() => validateLimit(0));
  assertThrows(() => validateLimit('3'));
  assertEquals(validateTopOnly(undefined), false);
  assertEquals(validateTopOnly(true), true);
  assertThrows(() => validateTopOnly('yes'));
  assertEquals(validateSearchTerm('  אור '), 'אור');
  assertThrows(() => validateSearchTerm('  '));
  assertThrows(() => validateSearchTerm('x'.repeat(101)));
});

Deno.test('shaping: title fallback, date fallback, list has no text', () => {
  assertEquals(pieceTitle(piece({ title: null, first_line: ' Hello ' })), 'Hello');
  assertEquals(pieceTitle(piece({ title: '', first_line: null })), '(untitled)');
  const l = shapeList([piece({ written: null }), piece({ is_top: true })]);
  assertEquals(l[0].date, '2026-10-19');
  assertEquals(l[1].top, true);
  assert(!('text' in l[0]));
  assertEquals(shapePiece(piece({ body: null })).text, '');
});

Deno.test('search: case-insensitive, Hebrew, title or text, snippet, cap', () => {
  const r = searchPieces('LIGHT', [piece({}), piece({ drive_id: 'b'.repeat(12), body: 'nothing', title: 'x' })]);
  assertEquals(r.total_matches, 1);
  assert(r.results[0].snippet.includes('light'));
  const h = searchPieces('אור', [piece({ title: 'אור בבוקר', body: null })]);
  assertEquals(h.total_matches, 1);
  const many = Array.from({ length: 40 }, (_, i) => piece({ drive_id: `id${String(i).padStart(10, '0')}` }));
  const c = searchPieces('light', many);
  assertEquals(c.total_matches, 40);
  assertEquals(c.results.length, 30);
});

Deno.test('privacy: diary, steps, letter excluded', () => {
  assertEquals([...EXCLUDED_KINDS], ['diary', 'steps', 'letter']);
  assertEquals(KIND_EXCLUDE_FILTER, 'kind=not.in.(diary,steps,letter)');
  assertEquals(isVisible({ kind: 'poem' }), true);
  assertEquals(isVisible({ kind: 'diary' }), false);
  assertEquals(isVisible({ kind: 'steps' }), false);
  assertEquals(isVisible({ kind: 'letter' }), false);
});
