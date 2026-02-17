// src/wallet/network.ts
// ============================================================================
// DollarDex — Network / RPC hardening (SAFE UI VERSION)
// - RPC failover
// - Retry + timeout
// - NEVER throws raw RPC/provider error text
// ============================================================================

import { JsonRpcProvider } from "ethers";

/** ===== Chain ===== */
export const BSC_CHAIN_ID = 56;

/** ===== RPC endpoints ===== */
export const BSC_RPCS: string[] = [
  (import.meta as any).env?.VITE_BSC_RPC?.toString?.() || "https://bsc-dataseed.binance.org/",
  "https://bsc-dataseed1.binance.org/",
  "https://bsc-dataseed2.binance.org/",
  "https://bsc-dataseed3.binance.org/",
  "https://bsc-dataseed4.binance.org/",
  "https://rpc.ankr.com/bsc",
  "https://bsc.publicnode.com"
].filter(Boolean);

/** ===== Internal cache ===== */
let cachedProvider: JsonRpcProvider | null = null;
let cachedRpcUrl = "";
let lastGoodAt = 0;

/** Timeout helper */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => {
      window.clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      window.clearTimeout(t);
      reject(e);
    });
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Convert raw RPC error into SAFE message */
function safeRpcError(e: any): Error {
  const msg = String(e?.message ?? e ?? "").toLowerCase();

  if (
    msg.includes("timeout") ||
    msg.includes("failed to fetch") ||
    msg.includes("network error") ||
    msg.includes("rate limit") ||
    msg.includes("429")
  ) {
    return new Error("Network is busy. Please try again shortly.");
  }

  if (msg.includes("missing revert data") || msg.includes("execution reverted")) {
    return new Error("Read request failed. Please retry.");
  }

  return new Error("Unable to fetch blockchain data. Please try again.");
}

/** ===== Create provider by probing endpoints ===== */
export async function getReadProvider(opts?: {
  probeTimeoutMs?: number;
  forceRefresh?: boolean;
}): Promise<{ provider: JsonRpcProvider; rpcUrl: string }> {
  const probeTimeoutMs = opts?.probeTimeoutMs ?? 3500;

  if (!opts?.forceRefresh && cachedProvider && Date.now() - lastGoodAt < 60_000) {
    return { provider: cachedProvider, rpcUrl: cachedRpcUrl };
  }

  for (const url of BSC_RPCS) {
    try {
      const p = new JsonRpcProvider(url);
      await withTimeout(p.getBlockNumber(), probeTimeoutMs);
      cachedProvider = p;
      cachedRpcUrl = url;
      lastGoodAt = Date.now();
      return { provider: p, rpcUrl: url };
    } catch {
      // try next
    }
  }

  const fallbackUrl = BSC_RPCS[0] || "https://bsc-dataseed.binance.org/";
  const fallback = new JsonRpcProvider(fallbackUrl);
  cachedProvider = fallback;
  cachedRpcUrl = fallbackUrl;
  return { provider: fallback, rpcUrl: fallbackUrl };
}

/** ===== Read retry wrapper ===== */
export async function rpcRead<T>(
  fn: (p: JsonRpcProvider) => Promise<T>,
  opts?: { attempts?: number; timeoutMs?: number }
): Promise<T> {
  const attempts = Math.max(1, opts?.attempts ?? 3);
  const timeoutMs = Math.max(500, opts?.timeoutMs ?? 6500);

  let lastErr: any = null;

  for (let i = 0; i < attempts; i++) {
    const forceRefresh = i > 0;
    const { provider } = await getReadProvider({ forceRefresh });

    try {
      const res = await withTimeout(fn(provider), timeoutMs);
      lastGoodAt = Date.now();
      return res;
    } catch (e: any) {
      lastErr = e;
      await sleep(250 * (i + 1) * (i + 1));
    }
  }

  // 🔒 NEVER throw raw RPC error
  throw safeRpcError(lastErr);
}
