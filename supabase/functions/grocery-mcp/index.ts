// grocery-mcp: READ-ONLY remote MCP server for the grocery app.
// See README.md. Reads only grocery_items, grocery_catalog, grocery_trips.
// Deploy with --no-verify-jwt (our own secret is the gate, see README).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import {
  type CatalogRow,
  type ItemRow,
  type TripRow,
  groupBySection,
  isAuthorized,
  searchRows,
  shapeTrips,
  validateLimit,
  validateListType,
  validateSearchTerm,
} from './logic.ts';

// Hard-coded: the only tables this function can ever touch.
const T_ITEMS = 'grocery_items';
const T_CATALOG = 'grocery_catalog';
const T_TRIPS = 'grocery_trips';

async function restGet<T>(table: string, query: string): Promise<T[]> {
  const base = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !key) throw new Error('server is not configured');
  const res = await fetch(`${base}/rest/v1/${table}?${query}`, {
    method: 'GET',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`database read failed (${res.status})`);
  return (await res.json()) as T[];
}

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 1) }] };
}

function errorResult(e: unknown) {
  const msg = e instanceof Error ? e.message : 'something went wrong';
  return { isError: true, content: [{ type: 'text' as const, text: msg }] };
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

function buildServer(): McpServer {
  const server = new McpServer({ name: 'grocery', version: '1.0.0' });

  server.registerTool(
    'grocery_list',
    {
      description:
        'Show what is still on the grocery list (items not checked off), grouped by store section. Optionally only one list, e.g. list_type "allison".',
      inputSchema: { list_type: z.string().optional() },
      annotations: READ_ONLY,
    },
    async ({ list_type }: { list_type?: string }) => {
      try {
        const lt = validateListType(list_type);
        let q = 'select=item_name,section,checked,quantity,list_type&checked=eq.false&order=created_at.asc&limit=1000';
        if (lt) q += `&list_type=eq.${encodeURIComponent(lt)}`;
        const rows = await restGet<ItemRow>(T_ITEMS, q);
        return textResult(groupBySection(rows));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    'grocery_search',
    {
      description:
        'Find grocery items and saved catalog entries by a word. Not case-sensitive; works in Hebrew and English. Includes checked-off items.',
      inputSchema: { query: z.string() },
      annotations: READ_ONLY,
    },
    async ({ query }: { query: string }) => {
      try {
        const term = validateSearchTerm(query);
        const [items, catalog] = await Promise.all([
          restGet<ItemRow>(
            T_ITEMS,
            'select=item_name,section,checked,quantity,list_type&order=created_at.desc&limit=1000',
          ),
          restGet<CatalogRow>(T_CATALOG, 'select=name,section&order=name.asc&limit=1000'),
        ]);
        return textResult(searchRows(term, items, catalog));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.registerTool(
    'grocery_recent_trips',
    {
      description: 'Show the most recent shopping trips and what was bought. Default 5 trips, at most 20.',
      inputSchema: { limit: z.number().optional() },
      annotations: READ_ONLY,
    },
    async ({ limit }: { limit?: number }) => {
      try {
        const n = validateLimit(limit);
        const rows = await restGet<TripRow>(
          T_TRIPS,
          `select=trip_date,shopper,trip_name,items&order=trip_date.desc,created_at.desc&limit=${n}`,
        );
        return textResult(shapeTrips(rows));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  return server;
}

export async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const ok = await isAuthorized(
    Deno.env.get('GROCERY_MCP_SECRET'),
    url.pathname,
    req.headers.get('authorization'),
  );
  if (!ok) return new Response(null, { status: 401 });

  // Stateless: a fresh server + transport per request.
  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } catch {
    return new Response(null, { status: 500 });
  }
}

if (import.meta.main) Deno.serve(handler);
