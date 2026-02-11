// src/wallet/network.ts
// ============================================================================
// DollarDex — Network / RPC hardening (STEP 13.1)
// - RPC failover (tries multiple endpoints)
// - Safe retry wrapper for reads (timeouts + backoff)
// - Zero UI changes; just shared helpers for pages
// ============================================================================

import { JsonRpcProvider } from "ethers";

/** ===== Chain ===== */
export const BSC_CHAIN_ID = 56;

/** ===== RPC endpoints (ordered: fastest/most reliable first) =====
 * You can add/remove endpoints anytime.
 * Keep at least 2-3 to avoid downtime.
 */
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
function withTimeout<T>(p: Promise<T>, ms: number, label = "timeout"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(label)), ms);
    p.then((v) => {
      window.clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      window.clearTimeout(t);
      reject(e);
    });
  });
}

/** Small backoff */
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** ===== Create provider by probing endpoints ===== */
export async function getReadProvider(opts?: {
  probeTimeoutMs?: number;
  forceRefresh?: boolean;
}): Promise<{ provider: JsonRpcProvider; rpcUrl: string }> {
  const probeTimeoutMs = opts?.probeTimeoutMs ?? 3500;

  // If we have a cached provider that worked recently, reuse it
  if (!opts?.forceRefresh && cachedProvider && Date.now() - lastGoodAt < 60_000) {
    return { provider: cachedProvider, rpcUrl: cachedRpcUrl };
  }

  // Probe all RPCs sequentially (more reliable than blasting)
  for (const url of BSC_RPCS) {
    try {
      const p = new JsonRpcProvider(url);
      // lightweight probe
      await withTimeout(p.getBlockNumber(), probeTimeoutMs, "RPC probe timeout");
      cachedProvider = p;
      cachedRpcUrl = url;
      lastGoodAt = Date.now();
      return { provider: p, rpcUrl: url };
    } catch {
      // try next
    }
  }

  // If all fail, still return the first as a last resort
  const fallbackUrl = BSC_RPCS[0] || "https://bsc-dataseed.binance.org/";
  const fallback = new JsonRpcProvider(fallbackUrl);
  cachedProvider = fallback;
  cachedRpcUrl = fallbackUrl;
  return { provider: fallback, rpcUrl: fallbackUrl };
}

/** ===== Read retry wrapper =====
 * Use this for contract reads that might fail intermittently.
 */
export async function rpcRead<T>(
  fn: (p: JsonRpcProvider) => Promise<T>,
  opts?: { attempts?: number; timeoutMs?: number }
): Promise<T> {
  const attempts = Math.max(1, opts?.attempts ?? 3);
  const timeoutMs = Math.max(500, opts?.timeoutMs ?? 6500);

  let lastErr: any = null;

  for (let i = 0; i < attempts; i++) {
    const forceRefresh = i > 0; // on retry, refresh provider
    const { provider } = await getReadProvider({ forceRefresh });

    try {
      const res = await withTimeout(fn(provider), timeoutMs, "RPC read timeout");
      lastGoodAt = Date.now();
      return res;
    } catch (e: any) {
      lastErr = e;
      // small exponential backoff
      await sleep(250 * (i + 1) * (i + 1));
    }
  }

  throw lastErr || new Error("RPC read failed");
}
