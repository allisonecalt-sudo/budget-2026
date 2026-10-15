// Shared Playwright `test` for every spec that drives the app.
//
// An auto fixture gives each test its OWN fresh in-memory fake Supabase
// (tests/fake-seed.js) and routes every *.supabase.co request to it, so no test
// can read or write her real tables. If the app ever makes a Supabase request
// the fake cannot answer, the test fails loudly at teardown.
const base = require('@playwright/test');
const { FakeDb, installFakeSupabase } = require('./fake-supabase');
const { makeSeed } = require('./fake-seed');

const test = base.test.extend({
  db: [
    async ({ context }, use) => {
      const db = new FakeDb(makeSeed());
      await installFakeSupabase(context, db, {
        ptSessions: {
          clients: [
            { id: 'client-a', initial: 'A', rate: 200 },
            { id: 'client-b', initial: 'B', rate: 250 },
          ],
          sessions: [
            { id: 's1', client_id: 'client-a', status: 'happened', session_date: '2026-09-02' },
            { id: 's2', client_id: 'client-b', status: 'scheduled', session_date: '2026-10-20' },
          ],
        },
      });
      await use(db);
      if (db.unhandled.length) {
        throw new Error(
          'The app made Supabase requests the fake could not answer:\n  ' +
            db.unhandled.join('\n  '),
        );
      }
    },
    { auto: true },
  ],
});

module.exports = { test, expect: base.expect };
