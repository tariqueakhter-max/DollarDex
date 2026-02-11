// src/components/NetworkGuard.tsx
// ============================================================================
// DollarDex — NetworkGuard (HARDENED: STEP 13.6)
// - Never blocks read-only UI
// - Shows soft warnings for: no wallet, not connected, wrong network
// - Provides Switch Network button (BSC Mainnet)
// - Safe listeners + cleanup
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { connectWallet, getWalletStateSilently, normalizeChainId, hasWallet } from "../wallet/wallet";

const BSC_CHAIN_ID = 56;

// minimal params for wallet_addEthereumChain / wallet_switchEthereumChain
const BSC_PARAMS = {
  chainId: "0x38",
  chainName: "BNB Smart Chain Mainnet",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: ["https://bsc-dataseed.binance.org/"],
  blockExplorerUrls: ["https://bscscan.com/"],
};

type Props = {
  children: React.ReactNode;
};

/** Soft guard: never blocks rendering children */
export default function NetworkGuard({ children }: Props) {
  const [addr, setAddr] = useState<string>("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [note, setNote] = useState<string>("");

  const walletPresent = useMemo(() => hasWallet(), []);

  const refresh = async () => {
    setNote("");
    const st = await getWalletStateSilently();
    if (!st.ok) {
      setAddr("");
      setChainId(st.chainId ?? null);
      // Only show note if wallet exists; if not, we show a different banner
      if (walletPresent && st.error) setNote(st.error);
      return;
    }
    setAddr(st.address);
    setChainId(st.chainId ?? null);
  };

  useEffect(() => {
    refresh();

    const eth = (window as any)?.ethereum;
    if (!eth?.on) return;

    let dead = false;

    const onChainChanged = (cid: any) => {
      if (dead) return;
      setChainId(normalizeChainId(cid));
      refresh();
    };

    const onAccountsChanged = (accs: any) => {
      if (dead) return;
      if (Array.isArray(accs) && accs.length) setAddr(String(accs[0] || ""));
      else setAddr("");
      refresh();
    };

    eth.on("chainChanged", onChainChanged);
    eth.on("accountsChanged", onAccountsChanged);

    return () => {
      dead = true;
      try {
        eth.removeListener?.("chainChanged", onChainChanged);
        eth.removeListener?.("accountsChanged", onAccountsChanged);
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wrongNetwork = chainId != null && chainId !== BSC_CHAIN_ID;

  const switchToBSC = async () => {
    setNote("");
    const eth = (window as any)?.ethereum;
    if (!eth?.request) {
      setNote("No wallet detected. Install MetaMask to switch networks.");
      return;
    }

    try {
      // try switch
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BSC_PARAMS.chainId }],
      });
      await refresh();
    } catch (e: any) {
      // if chain not added, add it
      const code = e?.code;
      if (code === 4902 || /unrecognized|unknown chain/i.test(String(e?.message || ""))) {
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [BSC_PARAMS],
          });
          await refresh();
          return;
        } catch (e2: any) {
          setNote(e2?.message || "Failed to add BSC network.");
          return;
        }
      }

      if (code === 4001) {
        setNote("Network switch rejected by user.");
        return;
      }

      setNote(e?.message || "Failed to switch network.");
    }
  };

  const connect = async () => {
    setNote("");
    const st = await connectWallet();
    if (!st.ok) {
      setNote(st.error || "Wallet connect failed.");
      return;
    }
    setAddr(st.address);
    setChainId(st.chainId ?? null);
  };

  return (
    <>
      {/* Soft banner area */}
      <div className="ddx-guardWrap">
        {!walletPresent ? (
          <div className="ddx-guard ddx-guardWarn">
            <div className="ddx-guardTitle">Wallet not detected</div>
            <div className="ddx-guardText">
              Read-only mode is active. Install MetaMask to register, deposit, claim, and compound.
            </div>
          </div>
        ) : wrongNetwork ? (
          <div className="ddx-guard ddx-guardBad">
            <div className="ddx-guardTitle">Wrong network</div>
            <div className="ddx-guardText">
              Please switch to <b>BSC Mainnet</b> to use wallet actions. (Reads will still work.)
            </div>
            <div className="ddx-guardActions">
              <button className="ddx-btn ddx-btnPrimary" onClick={switchToBSC}>
                Switch to BSC
              </button>
              {!addr ? (
                <button className="ddx-btn ddx-btnGhost" onClick={connect}>
                  Connect Wallet
                </button>
              ) : null}
            </div>
          </div>
        ) : !addr ? (
          <div className="ddx-guard ddx-guardInfo">
            <div className="ddx-guardTitle">Wallet not connected</div>
            <div className="ddx-guardText">
              Connect your wallet to use actions. Dashboard reads continue in the background.
            </div>
            <div className="ddx-guardActions">
              <button className="ddx-btn ddx-btnPrimary" onClick={connect}>
                Connect Wallet
              </button>
            </div>
          </div>
        ) : (
          <div className="ddx-guard ddx-guardOk">
            <div className="ddx-guardTitle">Wallet connected</div>
            <div className="ddx-guardText">
              {addr.slice(0, 6)}…{addr.slice(-4)} on BSC
            </div>
          </div>
        )}

        {note ? <div className="ddx-guardNote">{note}</div> : null}
      </div>

      {children}
    </>
  );
}
