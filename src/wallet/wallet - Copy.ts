// src/wallet/wallet.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserProvider } from "ethers";

export const BSC_MAINNET = {
  chainIdDec: 56,
  chainIdHex: "0x38",
  chainName: "BNB Smart Chain (BSC)",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: ["https://bsc-dataseed.binance.org/", "https://rpc.ankr.com/bsc"],
  blockExplorerUrls: ["https://bscscan.com"]
};

export type Eip1193Provider = {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
  // wallet flags (optional)
  isMetaMask?: boolean;
  isTokenPocket?: boolean;
};

function normalizeChainId(raw: any): number | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    return s.startsWith("0x") || s.startsWith("0X") ? parseInt(s, 16) : parseInt(s, 10);
  }
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "bigint") return Number(raw);
  return null;
}

function getEthereum(): any {
  return (window as any).ethereum;
}

/**
 * Pick correct injected provider when multiple wallets exist.
 * Priority: TokenPocket -> MetaMask -> first provider -> window.ethereum
 */
export function pickInjectedProvider(): Eip1193Provider | undefined {
  const eth = getEthereum() as any;
  if (!eth) return undefined;

  if (Array.isArray(eth.providers) && eth.providers.length) {
    const tp = eth.providers.find((p: any) => p?.isTokenPocket);
    if (tp) return tp as Eip1193Provider;

    const mm = eth.providers.find((p: any) => p?.isMetaMask);
    if (mm) return mm as Eip1193Provider;

    return eth.providers[0] as Eip1193Provider;
  }

  return eth as Eip1193Provider;
}

export async function switchToBscMainnet(eth: Eip1193Provider) {
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BSC_MAINNET.chainIdHex }]
    });
    return true;
  } catch (err: any) {
    if (err?.code === 4001) return false; // user rejected

    const msg = String(err?.message || "").toLowerCase();
    const unrecognized =
      err?.code === 4902 ||
      msg.includes("unrecognized chain") ||
      msg.includes("unknown chain") ||
      msg.includes("not added");

    if (!unrecognized) throw err;

    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: BSC_MAINNET.chainIdHex,
          chainName: BSC_MAINNET.chainName,
          nativeCurrency: BSC_MAINNET.nativeCurrency,
          rpcUrls: BSC_MAINNET.rpcUrls,
          blockExplorerUrls: BSC_MAINNET.blockExplorerUrls
        }
      ]
    });

    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BSC_MAINNET.chainIdHex }]
    });

    return true;
  }
}

/**
 * Safe wallet hook:
 * - locks onto the injected provider used in connect() (TokenPocket fix)
 * - reads chainId via events + polling fallback
 */
export function useWallet() {
  const injectedRef = useRef<Eip1193Provider | null>(null);

  const [addr, setAddr] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);

  const getProvider = useCallback((): Eip1193Provider | null => {
    return injectedRef.current ?? pickInjectedProvider() ?? null;
  }, []);

  const wrongNetwork = useMemo(
    () => Boolean(addr && chainId != null && chainId !== BSC_MAINNET.chainIdDec),
    [addr, chainId]
  );

  const chainOk = useMemo(
    () => !addr || chainId == null || chainId === BSC_MAINNET.chainIdDec,
    [addr, chainId]
  );

  const refreshChain = useCallback(async () => {
    const eth = getProvider();
    if (!eth?.request) {
      setChainId(null);
      return;
    }
    try {
      const raw = await eth.request({ method: "eth_chainId" });
      setChainId(normalizeChainId(raw));
    } catch {
      setChainId(null);
    }
  }, [getProvider]);

  const connect = useCallback(async () => {
    const injected = pickInjectedProvider();
    if (!injected?.request) throw new Error("No wallet detected");

    injectedRef.current = injected; // 🔒 lock to same provider
    const bp = new BrowserProvider(injectedRef.current as any);

    await bp.send("eth_requestAccounts", []);
    const signer = await bp.getSigner();
    const a = await signer.getAddress();
    setAddr(a);

    const raw = await injectedRef.current.request({ method: "eth_chainId" });
    setChainId(normalizeChainId(raw));

    return a;
  }, []);

  const disconnect = useCallback(() => {
    setAddr("");
    setChainId(null);
    injectedRef.current = null;
  }, []);

  const switchToBSC = useCallback(async () => {
    const eth = getProvider();
    if (!eth?.request) throw new Error("No wallet detected");
    const ok = await switchToBscMainnet(eth);
    await refreshChain();
    return ok;
  }, [getProvider, refreshChain]);

  // subscribe + polling fallback (TokenPocket sometimes misses events)
  useEffect(() => {
    const eth = getProvider();
    if (!eth?.request) return;

    let dead = false;

    const onChainChanged = (cid: any) => {
      if (dead) return;
      setChainId(normalizeChainId(cid));
      setTimeout(() => {
        if (!dead) refreshChain();
      }, 350);
    };

    const onAccountsChanged = async (accounts: string[]) => {
      if (dead) return;
      setAddr(accounts?.[0] || "");
      await refreshChain();
    };

    eth.on?.("chainChanged", onChainChanged);
    eth.on?.("accountsChanged", onAccountsChanged);

    refreshChain();
    const t = setInterval(refreshChain, 1500);

    return () => {
      dead = true;
      clearInterval(t);
      eth.removeListener?.("chainChanged", onChainChanged);
      eth.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, [addr, getProvider, refreshChain]);

  return {
    addr,
    chainId,
    chainOk,
    wrongNetwork,
    connect,
    disconnect,
    switchToBSC,
    /** gives the *locked* EIP-1193 provider for writes */
    getEip1193: getProvider
  };
}
