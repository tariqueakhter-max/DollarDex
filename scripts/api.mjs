/**
 * scripts/api.mjs
 * ============================================================================
 * Local/Hosted API for DollarDex indexed logs (SQLite -> JSON)
 * - Reads from dollardex_index.sqlite created by scripts/indexer.mjs
 * - Endpoints:
 *    GET /api/health
 *    GET /api/deposits?limit=18
 *    GET /api/events?name=Deposit&limit=100
 * - Simple in-memory caching (default 5s) to handle 1000+ clients.
 *
 * ENV:
 *   PORT=8787
 *   DB_PATH=absolute/or/relative/path/to/dollardex_index.sqlite
 *   ALLOW_ORIGIN=*   (or your vercel domain)
 *   CACHE_MS=5000
 */

import http from "node:http";
import url from "node:url";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

const PORT = Number(process.env.PORT || "8787");
const DB_PATH =
  process.env.DB_PATH?.trim() ||
  path.join(process.cwd(), "dollardex_index.sqlite");

const ALLOW_ORIGIN = (process.env.ALLOW_ORIGIN || "*").trim();
const CACHE_MS = Math.max(0, Number(process.env.CACHE_MS || "5000"));

const db = new Database(DB_PATH, { readonly: true });

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function notFound(res) {
  json(res, 404, { ok: false, error: "Not found" });
}

function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/** ---------- tiny cache ---------- */
const cache = new Map(); // key -> {ts, value}
function cached(key, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < CACHE_MS) return hit.value;
  const val = fn();
  cache.set(key, { ts: now, value: val });
  return val;
}

/** ---------- queries ---------- */
const qLatestDeposits = db.prepare(`
  SELECT
    block_number,
    tx_hash,
    log_index,
    timestamp,
    decoded_json
  FROM logs
  WHERE event_name = 'Deposit'
  ORDER BY block_number DESC, log_index DESC
  LIMIT ?
`);

const qEventsByName = db.prepare(`
  SELECT
    event_name,
    block_number,
    tx_hash,
    log_index,
    timestamp,
    decoded_json
  FROM logs
  WHERE event_name = ?
  ORDER BY block_number DESC, log_index DESC
  LIMIT ?
`);

function parseDecoded(decoded_json) {
  if (!decoded_json) return null;
  try { return JSON.parse(decoded_json); } catch { return null; }
}

const server = http.createServer((req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": ALLOW_ORIGIN,
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      });
      return res.end();
    }

    const u = url.parse(req.url, true);
    const pathname = u.pathname || "";

    if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });

    if (pathname === "/api/health") {
      return json(res, 200, { ok: true, db: DB_PATH, cacheMs: CACHE_MS });
    }

    if (pathname === "/api/deposits") {
      const limit = clampInt(u.query.limit, 18, 1, 200);
      const key = `deposits:${limit}`;

      const rows = cached(key, () => {
        const r = qLatestDeposits.all(limit);
        return r.map((x) => {
          const d = parseDecoded(x.decoded_json) || {};
          return {
            event: "Deposit",
            blockNumber: x.block_number,
            tx: x.tx_hash,
            logIndex: x.log_index,
            ts: x.timestamp || 0,
            user: String(d.user || ""),
            amount: String(d.amount || "0"),
            timestamp: Number(d.timestamp || x.timestamp || 0)
          };
        });
      });

      return json(res, 200, { ok: true, rows });
    }

    if (pathname === "/api/events") {
      const name = String(u.query.name || "").trim();
      if (!name) return json(res, 400, { ok: false, error: "Missing ?name=EventName" });

      const limit = clampInt(u.query.limit, 100, 1, 500);
      const key = `events:${name}:${limit}`;

      const rows = cached(key, () => {
        const r = qEventsByName.all(name, limit);
        return r.map((x) => ({
          event: x.event_name,
          blockNumber: x.block_number,
          tx: x.tx_hash,
          logIndex: x.log_index,
          ts: x.timestamp || 0,
          decoded: parseDecoded(x.decoded_json)
        }));
      });

      return json(res, 200, { ok: true, rows });
    }

    return notFound(res);
  } catch (e) {
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
});

server.listen(PORT, () => {
  console.log(`✅ DollarDex API running on http://localhost:${PORT}`);
  console.log(`DB: ${DB_PATH}`);
});
