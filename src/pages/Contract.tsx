// src/pages/ContractPage.tsx
// ============================================================================
// DollarDex — Contract page
// - Premium layout using existing CSS: wrap, card, chip, dot, btn, small, mono
// - Shows contract address + BscScan link
// - Safe in DEV + preview
// ============================================================================

import { useMemo, useState } from "react";

const CONTRACT_ADDRESS = "0xd583327F81fA70d0f30A775dd7E0390B26E324cb";
const BSCSCAN_CONTRACT = `https://bscscan.com/address/${CONTRACT_ADDRESS}`;

function shortAddr(a: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function ContractPage() {
  const [copied, setCopied] = useState(false);

  const addr = useMemo(() => CONTRACT_ADDRESS, []);
  const scan = useMemo(() => BSCSCAN_CONTRACT, []);

  async function copy(text: string) {
    const cb = (navigator as any)?.clipboard;
    try {
      if (cb?.writeText) {
        await cb.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "true");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        (document as any).execCommand?.("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  return (
    <div className="yf-luxe">
      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 18 }}>
        {/* Header */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div className="small" style={{ letterSpacing: ".22em", textTransform: "uppercase" }}>
                Contract
              </div>
              <h1 style={{ marginTop: 10, marginBottom: 6 }}>Immutable contract. Transparent data.</h1>
              <div className="small">
                All core stats are read directly from the smart contract. Verify transactions and balances via BscScan.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <a className="chip" href={scan} target="_blank" rel="noreferrer" style={{ textDecoration: "none", fontWeight: 900 }}>
                <span className="dot" /> Open on BscScan
              </a>
              <span className="chip">
                <span className="dot" /> BSC Mainnet
              </span>
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: 14,
            alignItems: "start"
          }}
        >
          {/* Address card */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Contract address</h3>
            <div className="small" style={{ marginTop: 6 }}>
              Use this address to verify the contract in your wallet or on explorers.
            </div>

            <div style={{ height: 12 }} />

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 14,
                background: "rgba(255,255,255,.035)",
                padding: "12px 12px",
                overflow: "hidden"
              }}
            >
              <div className="small" style={{ marginBottom: 6 }}>
                Address
              </div>
              <div className="mono" style={{ fontWeight: 1000, wordBreak: "break-all" }}>
                {addr}
              </div>
            </div>

            <div style={{ height: 12 }} />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn primary" type="button" onClick={() => copy(addr)}>
                {copied ? "✅ Copied" : `Copy ${shortAddr(addr)}`}
              </button>

              <a className="btn" href={scan} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                View on BscScan
              </a>
            </div>

            <div className="small" style={{ marginTop: 12 }}>
              Tip: Always verify you are on <b style={{ color: "var(--text)" as any }}>BSC Mainnet</b> before interacting.
            </div>
          </div>

          {/* Notes */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>What you can verify</h3>

            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              <span className="chip">
                <span className="dot" /> Total deposited / withdrawn
              </span>
              <span className="chip">
                <span className="dot" /> Contract USDT balance
              </span>
              <span className="chip">
                <span className="dot" /> Your deposits and position creation txs
              </span>
              <span className="chip">
                <span className="dot" /> Reward claim / compound transactions
              </span>
            </div>

            <div style={{ height: 14 }} />
            <div className="small">
              Next (optional): we can add a “Read-only contract viewer” here that pulls the same stats as Dashboard.
            </div>
          </div>

          {/* Safety */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Safety reminders</h3>
            <div className="small" style={{ marginTop: 8 }}>
              DollarDex will never ask for seed phrases or private keys. Always verify contract address before approving tokens.
            </div>

            <div style={{ height: 14 }} />

            <div style={{ display: "grid", gap: 10 }}>
              <span className="chip">
                <span className="dot" /> Never share seed phrase
              </span>
              <span className="chip">
                <span className="dot" /> Check address matches exactly
              </span>
              <span className="chip">
                <span className="dot" /> Verify approvals on explorer
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
