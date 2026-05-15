// pt-sessions — Edge Function
//
// Why this exists:
// The Private Client Tracker (PT) Supabase project has RLS enabled and the
// anon key returns 0 rows. The budget app can't read PT directly from the
// browser. This function uses the PT service key (server-side, never exposed)
// to fetch summarized session data the Biz tab needs:
//   - "Sessions Happened" + "Scheduled" widgets (per-prev-month, biz tab)
//   - "Owed to You" widget (Cash tab — sum of happened-but-unpaid sessions)
//
// Privacy contract: we DO NOT return full client names. Each client gets a
// short "initial" derived from the first letter of name. This is enough for
// the Biz tab UI ("M × 2") without leaking the client list to anyone who
// happens to read the Function's responses.
//
// Inputs (query string or JSON body):
//   - start_date (YYYY-MM-DD, inclusive)
//   - end_date   (YYYY-MM-DD, exclusive)
// Either both, or neither (no filter — returns everything, used by Cash Owed).
//
// Output:
// {
//   sessions: [{ id, client_id, date, status, paid, amount }],
//   clients:  [{ id, initial, rate }],
//   owed_total: number  // sum of amount for status=happened AND paid=false
// }

// @ts-ignore — Deno-hosted edge function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://allisonecalt-sudo.github.io',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080',
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && ALLOWED_ORIGINS.includes(origin)
      ? origin
      : 'https://allisonecalt-sudo.github.io';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
  };
}

function initialOf(name: string | null | undefined): string {
  if (!name) return '?';
  return name.trim().charAt(0).toUpperCase() || '?';
}

// @ts-ignore — Deno global
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    // Read params from query string OR JSON body
    const url = new URL(req.url);
    let startDate = url.searchParams.get('start_date');
    let endDate = url.searchParams.get('end_date');

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.start_date) startDate = body.start_date;
        if (body.end_date) endDate = body.end_date;
      } catch {
        // No body or invalid JSON — ignore, use query params
      }
    }

    // @ts-ignore — Deno global
    const PT_URL = Deno.env.get('PT_URL');
    // @ts-ignore — Deno global
    const PT_SERVICE_KEY = Deno.env.get('PT_SERVICE_KEY');

    if (!PT_URL || !PT_SERVICE_KEY) {
      return new Response(
        JSON.stringify({ error: 'Server misconfigured: PT credentials missing' }),
        {
          status: 500,
          headers: { ...cors, 'Content-Type': 'application/json' },
        },
      );
    }

    const pt = createClient(PT_URL, PT_SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Fetch clients (always — needed to enrich sessions with rate + initial)
    const { data: clientRows, error: clientErr } = await pt
      .from('clients')
      .select('id,name,rate');
    if (clientErr) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch clients', detail: clientErr.message }),
        {
          status: 500,
          headers: { ...cors, 'Content-Type': 'application/json' },
        },
      );
    }

    const clientById: Record<string, { rate: number; initial: string }> = {};
    const clientsOut = (clientRows || []).map((c: { id: string; name: string; rate: number }) => {
      const initial = initialOf(c.name);
      clientById[c.id] = { rate: Number(c.rate) || 0, initial };
      return { id: c.id, initial, rate: Number(c.rate) || 0 };
    });

    // Fetch sessions — date-filtered if both bounds given, else all
    let sessionsQuery = pt.from('sessions').select('id,client_id,date,paid,status');
    if (startDate && endDate) {
      sessionsQuery = sessionsQuery.gte('date', startDate).lt('date', endDate);
    }
    const { data: sessionRows, error: sessErr } = await sessionsQuery;
    if (sessErr) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch sessions', detail: sessErr.message }),
        {
          status: 500,
          headers: { ...cors, 'Content-Type': 'application/json' },
        },
      );
    }

    const sessionsOut = (sessionRows || []).map(
      (s: {
        id: string;
        client_id: string;
        date: string;
        paid: boolean;
        status: string;
      }) => {
        const c = clientById[s.client_id];
        const rate = c ? c.rate : 0;
        return {
          id: s.id,
          client_id: s.client_id,
          date: s.date,
          status: s.status,
          paid: s.paid,
          amount: Math.round(rate * 0.85 * 100) / 100,
        };
      },
    );

    // owed_total = sum of amount for happened AND not paid (regardless of date filter)
    // For correctness, query unfiltered for this calc when date bounds are set.
    let owedSessions = sessionsOut;
    if (startDate && endDate) {
      const { data: allSessions } = await pt
        .from('sessions')
        .select('id,client_id,paid,status');
      owedSessions = (allSessions || [])
        .filter(
          (s: { paid: boolean; status: string }) =>
            s.status === 'happened' && s.paid === false,
        )
        .map((s: { id: string; client_id: string; paid: boolean; status: string }) => {
          const c = clientById[s.client_id];
          const rate = c ? c.rate : 0;
          return {
            id: s.id,
            client_id: s.client_id,
            date: '',
            status: s.status,
            paid: s.paid,
            amount: Math.round(rate * 0.85 * 100) / 100,
          };
        });
    } else {
      owedSessions = sessionsOut.filter(
        (s) => s.status === 'happened' && s.paid === false,
      );
    }
    const owedTotal = owedSessions.reduce((sum, s) => sum + s.amount, 0);

    return new Response(
      JSON.stringify({
        sessions: sessionsOut,
        clients: clientsOut,
        owed_total: Math.round(owedTotal * 100) / 100,
      }),
      {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Unexpected error',
        detail: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      },
    );
  }
});
