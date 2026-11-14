import { assert, assertEquals, assertThrows } from '@std/assert';
import {
  GENERIC_ERROR,
  ValidationError,
  safeErrorMessage,
  groupBySection,
  isAuthorized,
  searchRows,
  shapeTrips,
  validateLimit,
  validateListType,
  validateSearchTerm,
  type ItemRow,
} from './logic.ts';

const S = 'Zk3-correct_horse_battery_staple-0123456789';
const item = (o: Partial<ItemRow>): ItemRow => ({
  list_type: 'allison', item_name: 'x', section: 'Dairy', checked: false, quantity: 1, ...o,
});

Deno.test('auth: unset or short secret fails closed', async () => {
  assertEquals(await isAuthorized(undefined, '/grocery-mcp/mcp', `Bearer ${S}`), false);
  assertEquals(await isAuthorized('', '/grocery-mcp/mcp', 'Bearer '), false);
  const short = 'a'.repeat(31);
  assertEquals(await isAuthorized(short, '/grocery-mcp/mcp', `Bearer ${short}`), false);
  const ok32 = 'a'.repeat(32);
  assert(await isAuthorized(ok32, '/grocery-mcp/mcp', `Bearer ${ok32}`));
});
Deno.test('auth: bearer header works', async () => {
  assert(await isAuthorized(S, '/grocery-mcp/mcp', `Bearer ${S}`));
  assert(await isAuthorized(S, '/mcp', `bearer ${S}`));
});
Deno.test('auth: secret in URL path is NOT accepted', async () => {
  assertEquals(await isAuthorized(S, `/grocery-mcp/${S}/mcp`, null), false);
  assertEquals(await isAuthorized(S, `/${S}/mcp`, null), false);
});
Deno.test('auth: wrong or missing refused', async () => {
  assertEquals(await isAuthorized(S, '/grocery-mcp/mcp', null), false);
  assertEquals(await isAuthorized(S, '/grocery-mcp/mcp', 'Bearer nope'), false);
  assertEquals(await isAuthorized(S, '/grocery-mcp/mcp', S), false);
});
Deno.test('auth: right secret on a wrong path is refused', async () => {
  assertEquals(await isAuthorized(S, '/grocery-mcp/admin', `Bearer ${S}`), false);
  assertEquals(await isAuthorized(S, '/grocery-mcp/a/mcp', `Bearer ${S}`), false);
});

Deno.test('errors: only validation messages pass through', () => {
  assertEquals(safeErrorMessage(new ValidationError('query must be text')), 'query must be text');
  assertEquals(safeErrorMessage(new Error('<html>502 upstream</html> key=abc')), GENERIC_ERROR);
  assertEquals(safeErrorMessage('boom'), GENERIC_ERROR);
  assertEquals(safeErrorMessage(new TypeError('fetch failed https://x.supabase.co')), GENERIC_ERROR);
});

Deno.test('validate list_type', () => {
  assertEquals(validateListType(undefined), null);
  assertEquals(validateListType('allison'), 'allison');
  assertThrows(() => validateListType('a&b=1'));
  assertThrows(() => validateListType(5));
});
Deno.test('validate query and limit', () => {
  assertEquals(validateSearchTerm('  חלב '), 'חלב');
  assertThrows(() => validateSearchTerm('   '));
  assertThrows(() => validateSearchTerm('x'.repeat(101)));
  assertEquals(validateLimit(undefined), 5);
  assertEquals(validateLimit(50), 20);
  assertThrows(() => validateLimit(0));
  assertThrows(() => validateLimit(1.5));
  assertThrows(() => validateLimit('3'));
});

Deno.test('groupBySection drops checked, groups, defaults to Other', () => {
  const r = groupBySection([
    item({ item_name: 'milk', section: 'Dairy' }),
    item({ item_name: 'eggs', section: 'Dairy' }),
    item({ item_name: 'done', section: 'Dairy', checked: true }),
    item({ item_name: 'bag', section: null }),
  ]);
  assertEquals(r.count, 3);
  assertEquals(r.sections.map((s) => s.section), ['Dairy', 'Other']);
  assertEquals(r.sections[0].items.map((i) => i.name), ['eggs', 'milk']);
});

Deno.test('search is case-insensitive and handles Hebrew', () => {
  const r = searchRows(
    'MILK',
    [item({ item_name: 'Almond Milk' }), item({ item_name: 'bread' })],
    [{ name: 'milk', section: 'Dairy' }],
  );
  assertEquals(r.items.length, 1);
  assertEquals(r.catalog.length, 1);
  const h = searchRows('חלב', [item({ item_name: 'חלב 3%' })], []);
  assertEquals(h.items.length, 1);
});

Deno.test('shapeTrips tolerates null items', () => {
  const r = shapeTrips([
    { trip_date: '2026-03-06', shopper: 'A', trip_name: null, items: null },
    { trip_date: '2026-03-07', shopper: 'A', trip_name: null, items: [{ item_name: 'milk', price: 8.5 }] },
  ]);
  assertEquals(r[0].item_count, 0);
  assertEquals(r[1].items[0], { name: 'milk', section: 'Other', quantity: 1, list_type: null, price: 8.5 });
});
