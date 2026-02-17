// src/components/NetworkGuard.tsx
// ============================================================================
// DollarDex — NetworkGuard (HARDENED + CLEAN UI)
// - Never blocks children
// - No "Wallet connected" banner
// - No "Switch network" button
// - Friendly, non-technical messages only
// - Quiet in production (no scary logs)
// - Compact on mobile + dismissible notes
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { connectWallet, getWalletStateSilently, normalizeChainId, hasWallet } from "../wallet/wallet";

const BSC_CHAIN_ID = 56;

type Props = { children: React.ReactNode };

type SafeNote = { text: string; kind: "info" | "warn" | "bad" } | null;

function toSafeNote(err: any, fallback: string): SafeNote {
  const code = String(err?.code ?? err?.error?.code ?? "");
  const msg = String(err?.shortMessage ?? err?.message ?? err ?? "").toLowerCase();

  // User cancelled / rejected
  if (code === "4001" || msg.includes("user rejected") || msg.includes("rejected the request")) {
    return { text: "Request cancelled.", kind: "info" };
  }

  // Wallet missing / provider missing
  if (msg.includes("ethereum is not defined") || msg.includes("no ethereum provider") || msg.includes("provider not found")) {
    return { text: "Wallet not detected. Please install or open your wallet app.", kind: "warn" };
  }

  // RPC/network flakiness
  if (
    msg.includes("failed to fetch") ||
    msg.includes("network error") ||
    msg.includes("timeout") ||
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("rpc")
  ) {
    return { text: "Network is busy. Please try again in a moment.", kind: "warn" };
  }

  // Wrong chain / unsupported
  if (msg.includes("chain") && (msg.includes("wrong") || msg.includes("unsupported"))) {
    return { text: "Wrong network. Please switch to BSC Mainnet.", kind: "bad" };
  }

  // Default
  return { text: fallback, kind: "warn" };
}

/** Soft guard: never blocks rendering children */
export default function NetworkGuard({ children }: Props) {
  const [addr, setAddr] = useState<string>("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [note, setNote] = useState<SafeNote>(null);

  const walletPresent = useMemo(() => hasWallet(), []);
  const lastNoteRef = useRef<string>("");

  const setSafeNote = (n: SafeNote) => {
    const key = n?.text || "";
    if (key && key === lastNoteRef.current) return; // prevent flicker/repeat
    lastNoteRef.current = key;
    setNote(n);
  };

  const refresh = async () => {
    try {
      const st = await getWalletStateSilently();
      if (!st.ok) {
        setAddr("");
        setChainId(st.chainId ?? null);
        // Do not surface st.error (raw)
        return;
      }
      setAddr(st.address);
      setChainId(st.chainId ?? null);
    } catch (e) {
      // Quiet in prod; log only in dev
      if (import.meta.env.DEV) console.warn("refresh wallet state failed:", e);
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
    setSafeNote(null);
    try {
      const st = await connectWallet();
      if (!st.ok) {
        setSafeNote(toSafeNote(st, "Could not connect wallet. Please try again."));
        return;
      }
      setAddr(st.address);
      setChainId(st.chainId ?? null);
    } catch (e) {
      if (import.meta.env.DEV) console.warn("connect wallet failed:", e);
      setSafeNote(toSafeNote(e, "Could not connect wallet. Please try again."));
    }
  };

  // Compact banners: only show when needed.
  const showWalletMissing = !walletPresent;
  const showWrongNetwork = walletPresent && wrongNetwork;
  const showNotConnected = walletPresent && !wrongNetwork && !addr;

  return (
    <>
      {/* Soft banner area (compact, non-blocking) */}
      {(showWalletMissing || showWrongNetwork || showNotConnected || note) && (
        <div className="ddx-guardWrap">
          <div className="wrap">
            {showWalletMissing ? (
              <div className="ddx-guard ddx-guardWarn">
                <div className="ddx-guardTitle">Wallet not detected</div>
                <div className="ddx-guardText">
                  Read-only mode is active. Install MetaMask to register, deposit, claim, and compound.
                </div>
              </div>
            ) : showWrongNetwork ? (
              <div className="ddx-guard ddx-guardBad">
                <div className="ddx-guardTitle">Wrong network</div>
                <div className="ddx-guardText">
                  Please switch your wallet to <b>BSC Mainnet</b> to use actions.
                </div>
                <div className="ddx-guardActions">
                  <button className="ddx-btn ddx-btnPrimary" onClick={connect} type="button">
                    Connect Wallet
                  </button>
                </div>
              </div>
            ) : showNotConnected ? (
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

            {note ? (
              <button
                type="button"
                className={`ddx-guardNote ddx-guardNote-${note.kind}`}
                onClick={() => setSafeNote(null)}
                aria-label="Dismiss message"
              >
                {note.text}
                <span className="ddx-guardNoteX">×</span>
              </button>
            ) : null}
          </div>
        </div>
      )}

      {children}
    </>
  );
}
