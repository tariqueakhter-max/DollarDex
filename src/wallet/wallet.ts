// src/wallet/wallet.ts
// ============================================================================
// DollarDex — Wallet Utilities (HARDENED: STEP 13.5)
// - Safe MetaMask detection + connect
// - Clean error messages (no uncaught throws into UI)
// - Normalized chainId handling
// - Provides read fallback via getReadProvider()
// ============================================================================

import { BrowserProvider, JsonRpcSigner } from "ethers";
import { getReadProvider } from "./network";

export type WalletState = {
  ok: boolean;
  address: string;
  chainId: number | null;
  signer: JsonRpcSigner | null;
  provider: BrowserProvider | null;
  error?: string;
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

export const connectWallet = async (): Promise<WalletState> => {
  const eth = getEthereum();
  if (!eth?.request) {
    return {
      ok: false,
      address: "",
      chainId: null,
      signer: null,
      provider: null,
      error: "No wallet detected. Please install MetaMask.",
    };
  }

  try {
    await eth.request({ method: "eth_requestAccounts" });

    const provider = new BrowserProvider(eth);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    const net = await provider.getNetwork();
    const chainId = normalizeChainId(net?.chainId);

    return { ok: true, address, chainId, signer, provider };
  } catch (e: any) {
    const msg =
      e?.code === 4001
        ? "User rejected the connection request."
        : e?.shortMessage || e?.message || "Wallet connection failed.";
    return { ok: false, address: "", chainId: null, signer: null, provider: null, error: msg };
  }
};

export const getWalletStateSilently = async (): Promise<WalletState> => {
  const eth = getEthereum();
  if (!eth?.request) {
    return { ok: false, address: "", chainId: null, signer: null, provider: null, error: "No wallet detected." };
  }

  try {
    const accounts: string[] = await eth.request({ method: "eth_accounts" });
    if (!accounts?.length) {
      return { ok: false, address: "", chainId: null, signer: null, provider: null, error: "Wallet not connected." };
    }

    const provider = new BrowserProvider(eth);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    const rawCid = await eth.request({ method: "eth_chainId" });
    const chainId = normalizeChainId(rawCid);

    return { ok: true, address, chainId, signer, provider };
  } catch (e: any) {
    const msg = e?.shortMessage || e?.message || "Failed to read wallet state.";
    return { ok: false, address: "", chainId: null, signer: null, provider: null, error: msg };
  }
};

/**
 * Use this when you *must* have a signer for write txs.
 * Returns { signer } or throws a clean Error you can show in UI.
 */
export const requireSigner = async (): Promise<{ signer: JsonRpcSigner; address: string; chainId: number | null }> => {
  const st = await connectWallet();
  if (!st.ok || !st.signer) {
    throw new Error(st.error || "Wallet not available.");
  }
  return { signer: st.signer, address: st.address, chainId: st.chainId };
};

/**
 * Read fallback (never depends on wallet)
 */
export const getReadOnlyProvider = () => getReadProvider();
