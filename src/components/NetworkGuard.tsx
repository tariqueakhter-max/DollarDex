// src/components/NetworkGuard.tsx
// ============================================================================
// DollarDex — NetworkGuard (HARDENED + CLEAN UI)
// - Never blocks read-only UI
// - NO "Wallet connected" banner (removes the extreme-left text issue)
// - NO "Switch to BSC" button (no scary actions on main pages)
// - Soft, minimal notices only when needed (wallet missing / wrong network / not connected)
// - Never shows raw wallet/provider errors to users (only safe message)
// - Safe listeners + cleanup
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { connectWallet, getWalletStateSilently, normalizeChainId, hasWallet } from "../wallet/wallet";

const BSC_CHAIN_ID = 56;

type Props = {
  children: React.ReactNode;
};

function safeUserMsg(_e: any, fallback: string) {
  // Never show raw provider/RPC error text in UI
  return fallback;
}

/** Soft guard: never blocks rendering children */
export default function NetworkGuard({ children }: Props) {
  const [addr, setAddr] = useState<string>("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [note, setNote] = useState<string>("");

  const walletPresent = useMemo(() => hasWallet(), []);

  const refresh = async () => {
    setNote("");
    try {
      const st = await getWalletStateSilently();
      if (!st.ok) {
        setAddr("");
        setChainId(st.chainId ?? null);
        // Do NOT surface raw st.error (can be scary/technical)
        return;
      }
      setAddr(st.address);
      setChainId(st.chainId ?? null);
    } catch (e) {
      // Keep UI calm; log for dev
      console.error(e);
      setAddr("");
      setChainId(null);
    }
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

  const connect = async () => {
    setNote("");
    try {
      const st = await connectWallet();
      if (!st.ok) {
        setNote(safeUserMsg(st, "Could not connect wallet. Please try again."));
        return;
      }
      setAddr(st.address);
      setChainId(st.chainId ?? null);
    } catch (e) {
      console.error(e);
      setNote(safeUserMsg(e, "Could not connect wallet. Please try again."));
    }
  };

  // IMPORTANT: We intentionally do NOT render a “Wallet connected” banner anymore.
  // That banner is what was appearing at the extreme left in your screenshot.

  return (
    <>
      {/* Soft banner area */}
      <div className="ddx-guardWrap">
        <div className="wrap">
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
                Please switch your wallet to <b>BSC Mainnet</b> to use actions.
              </div>
              <div className="ddx-guardActions">
                {/* No "Switch to BSC" button by design */}
                <button className="ddx-btn ddx-btnPrimary" onClick={connect} type="button">
                  Connect Wallet
                </button>
              </div>
            </div>
          ) : !addr ? (
            <div className="ddx-guard ddx-guardInfo">
              <div className="ddx-guardTitle">Wallet not connected</div>
              <div className="ddx-guardText">Connect your wallet to use actions. Read-only data stays available.</div>
              <div className="ddx-guardActions">
                <button className="ddx-btn ddx-btnPrimary" onClick={connect} type="button">
                  Connect Wallet
                </button>
              </div>
            </div>
          ) : null}

          {note ? <div className="ddx-guardNote">{note}</div> : null}
        </div>
      </div>

      {children}
    </>
  );
}
