// src/wallet/wallet.ts
// ============================================================================
// DollarDex — Wallet Utilities (HARDENED: SAFE UI)
// - Safe wallet detection + connect
// - NEVER returns raw provider/RPC error text
// - Normalized chainId handling
// - Silent state read won't explode UI
// - requireSigner throws only SAFE message
// ============================================================================

import { BrowserProvider, JsonRpcSigner } from "ethers";
import { getReadProvider } from "./network";

export type WalletErrorCode =
  | "NO_WALLET"
  | "NOT_CONNECTED"
  | "USER_REJECTED"
  | "WRONG_NETWORK"
  | "RPC_ERROR"
  | "SIGNER_ERROR"
  | "UNKNOWN";

export type WalletState = {
  ok: boolean;
  address: string;
  chainId: number | null;
  signer: JsonRpcSigner | null;
  provider: BrowserProvider | null;
  error?: string; // SAFE, user-friendly
  errorCode?: WalletErrorCode;
};

const getEthereum = (): any => (window as any)?.ethereum;

export const normalizeChainId = (cid: any): number | null => {
  if (cid == null) return null;

  try {
    if (typeof cid === "number") return Number.isFinite(cid) ? cid : null;
    if (typeof cid === "bigint") return Number(cid);

    if (typeof cid === "string") {
      const s = cid.trim();
      if (!s) return null;
      return s.startsWith("0x") || s.startsWith("0X") ? parseInt(s, 16) : parseInt(s, 10);
    }

    if (typeof cid === "object" && cid) return normalizeChainId((cid as any).chainId);
  } catch {
    // fall through
  }

  return null;
};

export const hasWallet = (): boolean => {
  const eth = getEthereum();
  return !!eth?.request;
};

function safeError(e: any, fallback: string): { code: WalletErrorCode; message: string } {
  const codeRaw = String(e?.code ?? e?.error?.code ?? "");
  const msg = String(e?.shortMessage ?? e?.message ?? e ?? "").toLowerCase();

  // User rejected
  if (codeRaw === "4001" || msg.includes("user rejected") || msg.includes("rejected the request")) {
    return { code: "USER_REJECTED", message: "Request cancelled." };
  }

  // Missing provider / wallet
  if (msg.includes("ethereum is not defined") || msg.includes("no ethereum provider") || msg.includes("provider not found")) {
    return { code: "NO_WALLET", message: "Wallet not detected. Please install or open your wallet app." };
  }

  // RPC / network issues
  if (
    msg.includes("failed to fetch") ||
    msg.includes("network error") ||
    msg.includes("timeout") ||
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("rpc")
  ) {
    return { code: "RPC_ERROR", message: "Network is busy. Please try again in a moment." };
  }

  // Signer issues (some wallets)
  if (msg.includes("unknown account") || msg.includes("unauthorized") || msg.includes("signer")) {
    return { code: "SIGNER_ERROR", message: "Wallet is not ready. Please reconnect and try again." };
  }

  return { code: "UNKNOWN", message: fallback };
}

const fail = (code: WalletErrorCode, message: string): WalletState => ({
  ok: false,
  address: "",
  chainId: null,
  signer: null,
  provider: null,
  errorCode: code,
  error: message,
});

export const connectWallet = async (): Promise<WalletState> => {
  const eth = getEthereum();
  if (!eth?.request) {
    return fail("NO_WALLET", "Wallet not detected. Please install MetaMask.");
  }

  try {
    // Request accounts (this can throw with 4001 etc.)
    await eth.request({ method: "eth_requestAccounts" });

    const provider = new BrowserProvider(eth);

    // These can also throw; keep inside try
    const signer = await provider.getSigner();
    const address = await signer.getAddress();

    // Prefer eth_chainId (cheap + consistent)
    const rawCid = await eth.request({ method: "eth_chainId" });
    const chainId = normalizeChainId(rawCid);

    return { ok: true, address, chainId, signer, provider };
  } catch (e: any) {
    if (import.meta.env.DEV) console.warn("connectWallet failed:", e);
    const se = safeError(e, "Could not connect wallet. Please try again.");
    return fail(se.code, se.message);
  }
};

export const getWalletStateSilently = async (): Promise<WalletState> => {
  const eth = getEthereum();
  if (!eth?.request) {
    return fail("NO_WALLET", "Wallet not detected.");
  }

  try {
    // Silent accounts check (never triggers wallet popup)
    const accounts: string[] = await eth.request({ method: "eth_accounts" });
    if (!accounts?.length) {
      return fail("NOT_CONNECTED", "Wallet not connected.");
    }

    const address = String(accounts[0] || "");

    // Read chain id without touching signer
    const rawCid = await eth.request({ method: "eth_chainId" });
    const chainId = normalizeChainId(rawCid);

    // Only create provider/signer when needed by callers.
    // But some parts of your app expect signer/provider from this fn,
    // so we will provide them safely:
    const provider = new BrowserProvider(eth);

    let signer: JsonRpcSigner | null = null;
    try {
      signer = await provider.getSigner();
    } catch (e) {
      // Don't fail whole state if signer acquisition is flaky;
      // reads can still work and UI should stay calm.
      signer = null;
      if (import.meta.env.DEV) console.warn("getSigner failed (silent):", e);
    }

    return { ok: true, address, chainId, signer, provider };
  } catch (e: any) {
    if (import.meta.env.DEV) console.warn("getWalletStateSilently failed:", e);
    const se = safeError(e, "Unable to read wallet state.");
    return fail(se.code, se.message);
  }
};

/**
 * Use this when you *must* have a signer for write txs.
 * Throws ONLY a SAFE message (never raw RPC/provider text).
 */
export const requireSigner = async (): Promise<{ signer: JsonRpcSigner; address: string; chainId: number | null }> => {
  const st = await connectWallet();
  if (!st.ok || !st.signer) {
    // st.error is already SAFE
    throw new Error(st.error || "Wallet not available.");
  }
  return { signer: st.signer, address: st.address, chainId: st.chainId };
};

/**
 * Read fallback (never depends on wallet)
 */
export const getReadOnlyProvider = () => getReadProvider();
