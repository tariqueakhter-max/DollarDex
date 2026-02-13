/**
 * scripts/indexer.mjs  (BscScan-powered indexer)
 * ============================================================================
 * DollarDex Log Indexer -> SQLite (better-sqlite3)
 * - Uses BscScan API to avoid RPC eth_getLogs rate limits
 * - Decodes events via ABI using ethers Interface
 * - Stores decoded args as JSON (BigInt -> string)
 *
 * REQUIRED ENV:
 *   CONTRACT_ADDRESS=0x...
 *   BSCSCAN_API_KEY=your_key_here
 *
 * OPTIONAL ENV:
 *   BSCSCAN_BASE=https://api.bscscan.com/api
 *   ABI_PATH=scripts/abi/DollarDex.json
 *   START_BLOCK=78838465 (contract creation block)
 *   CHUNK=2000           (block window to request logs)
 *   MIN_CHUNK=200        (adaptive min)
 *   OVERLAP=5
 *
 * Commands:
 *   node scripts/indexer.mjs --once
 *   node scripts/indexer.mjs --watch
 *   node scripts/indexer.mjs --export-json indexed_logs.json
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";
import { Interface, getAddress } from "ethers";

/* ---------------- args ---------------- */
const args = new Set(process.argv.slice(2));
const getArgValue = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
};

const ONCE = args.has("--once");
const WATCH = args.has("--watch");
const EXPORT_JSON = args.has("--export-json");
const EXPORT_PATH = getArgValue("--export-json") || "indexed_logs.json";

/* ---------------- config ---------------- */
const CONTRACT_ADDRESS_RAW = process.env.CONTRACT_ADDRESS?.trim();
if (!CONTRACT_ADDRESS_RAW) {
  console.error("❌ Missing env CONTRACT_ADDRESS");
  process.exit(1);
}
const CONTRACT_ADDRESS = getAddress(CONTRACT_ADDRESS_RAW);

const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY?.trim();
if (!BSCSCAN_API_KEY) {
  console.error("❌ Missing env BSCSCAN_API_KEY");
  console.error("   Create a BscScan API key and set it in your terminal.");
  process.exit(1);
}

const BSCSCAN_BASE = (process.env.BSCSCAN_BASE || "https://api.etherscan.io/v2/api").trim();

const ABI_PATH = process.env.ABI_PATH?.trim() || path.join("scripts", "abi", "DollarDex.json");
const abiJson = JSON.parse(fs.readFileSync(ABI_PATH, "utf8"));
const iface = new Interface(abiJson);

const START_BLOCK = Number(process.env.START_BLOCK || "0");
const CHUNK_MAX = Math.max(50, Number(process.env.CHUNK || "2000"));
const MIN_CHUNK = Math.max(10, Number(process.env.MIN_CHUNK || "200"));
const OVERLAP = Math.max(0, Number(process.env.OVERLAP || "5"));

const WATCH_INTERVAL = Math.max(8000, Number(process.env.WATCH_INTERVAL || "20000"));

/* ---------------- DB ---------------- */
const dbPath = path.join(process.cwd(), "dollardex_index.sqlite");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS logs (
  block_number INTEGER NOT NULL,
  block_hash TEXT,
  tx_hash TEXT NOT NULL,
  tx_index INTEGER,
  log_index INTEGER NOT NULL,
  address TEXT NOT NULL,
  event_name TEXT,
  topic0 TEXT,
  topics_json TEXT NOT NULL,
  data TEXT NOT NULL,
  decoded_json TEXT,
  timestamp INTEGER,
  PRIMARY KEY (tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_logs_block ON logs(block_number);
CREATE INDEX IF NOT EXISTS idx_logs_event ON logs(event_name);
CREATE INDEX IF NOT EXISTS idx_logs_time ON logs(timestamp);
`);

const getMeta = (key) => {
  const row = db.prepare("SELECT value FROM meta WHERE key=?").get(key);
  return row ? row.value : null;
};
const setMeta = (key, value) => {
  db.prepare(
    "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).run(key, String(value));
};

if (getMeta("last_block") == null) setMeta("last_block", String(START_BLOCK));

/* ---------------- helpers ---------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isBscScanRateLimitText(s) {
  const t = String(s || "").toLowerCase();
  return t.includes("rate limit") || t.includes("max rate limit") || t.includes("please try again later");
}

async function fetchJson(u, { retries = 8 } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(u, {
        headers: { "accept": "application/json" }
      });

      const text = await res.text();
      let j = null;
      try { j = JSON.parse(text); } catch { /* ignore */ }

      // BscScan sometimes returns 200 with NOTOK
      const status = j?.status;
      const message = j?.message;
      const result = j?.result;

      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      if (status === "0" && isBscScanRateLimitText(result || message)) throw new Error("BSCSCAN_RATE_LIMIT");
      if (status === "0" && String(message || "").toLowerCase().includes("notok") && isBscScanRateLimitText(result)) {
        throw new Error("BSCSCAN_RATE_LIMIT");
      }

      return j;
    } catch (e) {
      attempt++;
      if (attempt > retries) throw e;

      const wait = Math.round(700 * Math.pow(2, attempt - 1) + Math.random() * 400);
      console.warn(`⚠️ BscScan fetch retry ${attempt}/${retries} in ${wait}ms (${e?.message || e})`);
      await sleep(wait);
    }
  }
}

/* ---------------- decode ---------------- */
function decodeLog(log) {
  try {
    const parsed = iface.parseLog({ topics: log.topics, data: log.data });

    const argsObj = {};
    for (const [k, v] of Object.entries(parsed.args)) {
      if (/^\d+$/.test(k)) continue;
      argsObj[k] = typeof v === "bigint" ? v.toString() : v;
    }
    return { eventName: parsed.name, decodedJson: JSON.stringify(argsObj) };
  } catch {
    return { eventName: null, decodedJson: null };
  }
}

/* ---------------- insert ---------------- */
const insertLogStmt = db.prepare(`
INSERT OR IGNORE INTO logs (
  block_number, block_hash, tx_hash, tx_index, log_index, address,
  event_name, topic0, topics_json, data, decoded_json, timestamp
) VALUES (
  @block_number, @block_hash, @tx_hash, @tx_index, @log_index, @address,
  @event_name, @topic0, @topics_json, @data, @decoded_json, @timestamp
)
`);

const insertMany = db.transaction((rows) => {
  for (const r of rows) insertLogStmt.run(r);
});

/* ---------------- BscScan API ---------------- */
function qs(params) {
  const u = new URL(BSCSCAN_BASE);

  // Etherscan API V2 is multichain; BSC = chainid 56
  u.searchParams.set("chainid", "56");

  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u.toString();
}

async function getHeadBlockNumber() {
  const u = qs({
    module: "proxy",
    action: "eth_blockNumber",
    apikey: BSCSCAN_API_KEY
  });
  const j = await fetchJson(u);

  const hex = j?.result;

  // DEBUG: show what BscScan returned when it fails
  if (!hex || typeof hex !== "string" || !hex.startsWith("0x")) {
    console.error("❌ BscScan eth_blockNumber unexpected response:", j);
    throw new Error("BscScan eth_blockNumber missing/invalid result (check API key / rate limit).");
  }

  return parseInt(hex, 16);
}

/**
 * BscScan getLogs:
 * module=logs&action=getLogs&fromBlock&toBlock&address&apikey
 * Note: BscScan may cap results; we handle by adaptive chunk shrinking.
 */
async function getLogsFromBscScan(fromBlock, toBlock) {
  const u = qs({
    module: "logs",
    action: "getLogs",
    fromBlock,
    toBlock,
    address: CONTRACT_ADDRESS,
    apikey: BSCSCAN_API_KEY
  });

  // gentle pacing to avoid 5 req/sec cap
  await sleep(260 + Math.random() * 120);

  const j = await fetchJson(u);

  // status can be "0" with message "No records found"
  if (j?.status === "0") {
    const msg = String(j?.message || "").toLowerCase();
    const res = j?.result;

    if (msg.includes("no records")) return [];
    if (isBscScanRateLimitText(res)) throw new Error("BSCSCAN_RATE_LIMIT");

    // Other NOTOK reasons:
    // If it looks like an error string, throw so adaptive can shrink
    if (typeof res === "string" && res.length) throw new Error(res);
    return [];
  }

  const arr = Array.isArray(j?.result) ? j.result : [];
  return arr;
}

/* ---------------- core indexing ---------------- */
async function indexRange(fromBlock, toBlock) {
  const raw = await getLogsFromBscScan(fromBlock, toBlock);

  if (!raw.length) return 0;

  const rows = [];
  for (const lg of raw) {
    // Normalize fields
    const topics = Array.isArray(lg.topics) ? lg.topics : [];
    const data = String(lg.data || "0x");
    const blockNumber = parseInt(String(lg.blockNumber || "0"), 16) || Number(lg.blockNumber) || 0;
    const logIndex = parseInt(String(lg.logIndex || "0"), 16) || 0;
    const txIndex = parseInt(String(lg.transactionIndex || "0"), 16) || null;
    const txHash = String(lg.transactionHash || "");
    const addr = String(lg.address || CONTRACT_ADDRESS);

    // Some BscScan logs include timeStamp as hex string
    let ts = null;
    if (lg.timeStamp != null) {
      const t = String(lg.timeStamp);
      ts = t.startsWith("0x") ? parseInt(t, 16) : Number(t);
      if (!Number.isFinite(ts)) ts = null;
    }

    const decoded = decodeLog({ topics, data });

    rows.push({
      block_number: blockNumber,
      block_hash: lg.blockHash ? String(lg.blockHash) : null,
      tx_hash: txHash,
      tx_index: txIndex,
      log_index: logIndex,
      address: addr,
      event_name: decoded.eventName,
      topic0: topics?.[0] || null,
      topics_json: JSON.stringify(topics),
      data,
      decoded_json: decoded.decodedJson,
      timestamp: ts
    });
  }

  insertMany(rows);
  return rows.length;
}

/**
 * Adaptive indexing: shrink on any rate-limit or oversized response.
 */
async function indexRangeAdaptive(fromBlock, toBlock) {
  let step = Math.min(CHUNK_MAX, toBlock - fromBlock + 1);
  let start = fromBlock;
  let totalInserted = 0;

  while (start <= toBlock) {
    const end = Math.min(start + step - 1, toBlock);

    try {
      const inserted = await indexRange(start, end);
      totalInserted += inserted;
      start = end + 1;

      // grow slowly when successful
      if (step < CHUNK_MAX) step = Math.min(CHUNK_MAX, Math.floor(step * 1.35));
    } catch (err) {
      const msg = String(err?.message || err);

      // shrink on rate-limit or any bscscan "error-ish" response
      step = Math.max(MIN_CHUNK, Math.floor(step / 2));
      console.warn(`⚠️ BscScan issue (${msg}). Shrinking chunk to ${step} blocks and retrying...`);

      // longer cooldown if already at min chunk
      const extra = step <= MIN_CHUNK ? 2500 : 0;
      await sleep(1000 + extra + Math.random() * 800);
    }
  }

  return totalInserted;
}

/* ---------------- sync loop ---------------- */
async function syncOnce() {
  const head = await getHeadBlockNumber();

  let last = Number(getMeta("last_block") || START_BLOCK);
  const from = Math.max(0, last - OVERLAP);

  if (from > head) {
    console.log(`✅ Up to date. head=${head} last=${last}`);
    return;
  }

  console.log(`🔎 Syncing ${CONTRACT_ADDRESS}`);
  console.log(`BscScan: ${BSCSCAN_BASE}`);
  console.log(`DB:  ${dbPath}`);
  console.log(`From block: ${from}  -> head: ${head}  (maxChunk=${CHUNK_MAX}, minChunk=${MIN_CHUNK})`);

  // Keep windows small so API responses stay manageable
  const windowSize = CHUNK_MAX;

  for (let start = from; start <= head; start += windowSize) {
    const end = Math.min(start + windowSize - 1, head);

    const count = await indexRangeAdaptive(start, end);
    console.log(`  Indexed blocks ${start}-${end}: +${count} logs`);

    setMeta("last_block", String(end + 1));
    await sleep(300); // gentle pacing
  }

  console.log("✅ Sync complete");
}

/* ---------------- export ---------------- */
function exportJson(outPath) {
  const all = db
    .prepare(
      `SELECT block_number, tx_hash, log_index, event_name, decoded_json, timestamp
       FROM logs ORDER BY block_number ASC, tx_hash ASC, log_index ASC`
    )
    .all()
    .map((r) => ({
      block_number: r.block_number,
      tx_hash: r.tx_hash,
      log_index: r.log_index,
      event_name: r.event_name,
      timestamp: r.timestamp,
      decoded: r.decoded_json ? JSON.parse(r.decoded_json) : null
    }));

  fs.writeFileSync(outPath, JSON.stringify(all, null, 2), "utf8");
  console.log(`🧾 Exported ${all.length} rows -> ${outPath}`);
}

/* ---------------- main ---------------- */
(async () => {
  if (!WATCH && !ONCE && !EXPORT_JSON) {
    console.log("Usage:");
    console.log("  node scripts/indexer.mjs --once");
    console.log("  node scripts/indexer.mjs --watch");
    console.log("  node scripts/indexer.mjs --export-json out.json");
    console.log("");
    console.log("Required env: CONTRACT_ADDRESS, BSCSCAN_API_KEY");
    process.exit(0);
  }

  if (ONCE) {
    await syncOnce();
  }

  if (WATCH) {
    console.log(`👀 Watch mode: syncing every ${WATCH_INTERVAL}ms`);
    for (;;) {
      try {
        await syncOnce();
      } catch (e) {
        console.error("❌ Sync error:", e?.message || e);
      }
      await sleep(WATCH_INTERVAL);
    }
  }

  if (EXPORT_JSON) {
    exportJson(EXPORT_PATH);
  }
})();
