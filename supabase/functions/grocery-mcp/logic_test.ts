import { assert, assertEquals, assertThrows } from '@std/assert';
import {
  extractCandidates,
  groupBySection,
  isAuthorized,
  searchRows,
  shapeTrips,
  validateLimit,
  validateListType,
  validateSearchTerm,
  type ItemRow,
} from './logic.ts';

const S = 'correct-horse-battery';
const item = (o: Partial<ItemRow>): ItemRow => ({
  list_type: 'allison', item_name: 'x', section: 'Dairy', checked: false, quantity: 1, paid_by: null, ...o,
});

Deno.test('auth: unset secret fails closed', async () => {
  assertEquals(await isAuthorized(undefined, '/grocery-mcp/mcp', `Bearer ${S}`), false);
  assertEquals(await isAuthorized('', '/grocery-mcp//mcp', 'Bearer '), false);
});
Deno.test('auth: bearer header works', async () => {
  assert(await isAuthorized(S, '/grocery-mcp/mcp', `Bearer ${S}`));
  assert(await isAuthorized(S, '/mcp', `bearer ${S}`));
});
Deno.test('auth: path segment works', async () => {
  assert(await isAuthorized(S, `/grocery-mcp/${S}/mcp`, null));
  assert(await isAuthorized(S, `/${S}/mcp`, null));
});
Deno.test('auth: wrong or missing refused', async () => {
  assertEquals(await isAuthorized(S, '/grocery-mcp/mcp', null), false);
  assertEquals(await isAuthorized(S, '/grocery-mcp/mcp', 'Bearer nope'), false);
  assertEquals(await isAuthorized(S, '/grocery-mcp/nope/mcp', null), false);
  assertEquals(await isAuthorized(S, '/grocery-mcp/mcp', S), false);
  assertEquals(await isAuthorized(S, `/grocery-mcp/${S}/other`, null), false);
  assertEquals(await isAuthorized(S, `/grocery-mcp/a/b/${S}/mcp`, null), false);
});
Deno.test('auth: right secret on a wrong path shape is refused', async () => {
  assertEquals(await isAuthorized(S, '/grocery-mcp/admin', `Bearer ${S}`), false);
});
Deno.test('auth: malformed escape does not throw', () => {
  assertEquals(extractCandidates('/grocery-mcp/%E0%A4%A/mcp', null).candidates, []);
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
