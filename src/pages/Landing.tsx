// src/pages/Landing.tsx
// ============================================================================
// DollarDex — Landing (V3 + BROWSER RPC FIX + USDT CONTRACT BALANCE)
// - Uses CORS-friendly BSC RPCs (PublicNode / dRPC / BlockPI)
// - Reads USDT contract balance via ERC20.balanceOf(CONTRACT_ADDRESS)
// - Keeps ROI tier table + 50-day cycle cards + premium footer CTA strip
// ============================================================================

import { useCountUp } from "../components/useCountUP";
import { useEffect, useRef, useState } from "react";
import { Contract, JsonRpcProvider, formatUnits } from "ethers";
import "../lido-luxury.css";
import "../luxury.css";
import "../luxury-themes.css";
import "../dollardex-blackgold-overrides.css";
import "../dollardex-blackgold-blue.css";

/** ========= Config ========= */
const CONTRACT_ADDRESS =
  (import.meta as any).env?.VITE_CONTRACT_ADDRESS?.toString?.() ||
  "0xd583327F81fA70d0f30A775dd7E0390B26E324cb";

const USDT_ADDRESS =
  (import.meta as any).env?.VITE_DEPOSIT_TOKEN?.toString?.() ||
  "0x55d398326f99059fF775485246999027B3197955";

const BSCSCAN_CONTRACT = `https://bscscan.com/address/${CONTRACT_ADDRESS}`;

// Browser-friendly public RPCs (CORS tends to work reliably here)
const RPCS: string[] = [
  (import.meta as any).env?.VITE_BSC_RPC?.toString?.() || "",
  "https://bsc-rpc.publicnode.com",
  "https://bsc.drpc.org",
  "https://bsc.blockpi.network/v1/rpc/public",
].filter(Boolean);

/** Minimal ABI for landing stats (MUST exist on your contract) */
const LANDING_ABI = [
  "function totalRegisteredUsers() view returns(uint256)",
  "function totalActiveUsers() view returns(uint256)",
  "function totalDeposited() view returns(uint256)",
];

/** ERC20 ABI for USDT balance */
const USDT_ABI = [
  "function balanceOf(address) view returns(uint256)",
  "function decimals() view returns(uint8)",
  "function symbol() view returns(string)",
];

type LandingStats = {
  registered: string;
  active: string;
  deposited: string;

  usdtBal: string;
  usdtSym: string;
  usdtDec: number;

  lastUpdated: string;
  status: "idle" | "ok" | "degraded" | "error";
  note: string;
  firstOk: boolean;
  rpcUsed: string;
  debug: string;
};

const fmtInt = (v: any) => {
  try {
    return BigInt(v ?? 0).toString();
  } catch {
    return "0";
  }
};

const fmtToken = (v: any, decimals = 18) => {
  try {
    return formatUnits(v ?? 0n, decimals);
  } catch {
    return "0.0";
  }
};

const nowLabel = () => {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

const ROI_TIERS = [
  { range: "$1 – $499", roi: "0.50%" },
  { range: "$500 – $999", roi: "0.55%" },
  { range: "$1000 – $2499", roi: "0.60%" },
  { range: "$2500 – $4999", roi: "0.65%" },
  { range: "$5000+", roi: "0.70%" },
];

// Detect typical browser CORS/fetch issues and ABI issues
const normalizeErr = (e: any) => {
  const msg = e?.shortMessage || e?.message || String(e || "Unknown error");
  if (/Failed to fetch/i.test(msg)) return "Failed to fetch (likely CORS / network block)";
  if (/CORS/i.test(msg)) return "CORS blocked by RPC endpoint";
  if (/missing revert data/i.test(msg)) return "Call reverted / method missing (ABI mismatch?)";
  if (/could not decode/i.test(msg)) return "Decode failed (wrong ABI or wrong chain)";
  if (/unsupported operation/i.test(msg)) return "Unsupported operation (bad provider/runner)";
  return msg;
};

async function callWithFailover<T>(
  fn: (p: JsonRpcProvider) => Promise<T>
): Promise<{ ok: true; v: T; rpc: string } | { ok: false; err: string; tried: string[] }> {
  const tried: string[] = [];
  let lastErr = "Unknown error";

  for (const url of RPCS) {
    tried.push(url);
    try {
      const p = new JsonRpcProvider(url);
      await p.getBlockNumber(); // ping
      const v = await fn(p);
      return { ok: true, v, rpc: url };
    } catch (e: any) {
      lastErr = normalizeErr(e);
      continue;
    }
  }

  return { ok: false, err: lastErr, tried };
}

export default function Landing() {
  const [stats, setStats] = useState<LandingStats>(() => ({
    registered: "0",
    active: "0",
    deposited: "0.0",

    usdtBal: "0.0",
    usdtSym: "USDT",
    usdtDec: 18,

    lastUpdated: "-",
    status: "idle",
    note: "",
    firstOk: false,
    rpcUsed: "",
    debug: "",
  }));

  const aliveRef = useRef(true);
  const pollingRef = useRef<number | null>(null);

  const refresh = async () => {
    // Core contract stats
    const r1 = await callWithFailover(async (p) => {
      const c = new Contract(CONTRACT_ADDRESS, LANDING_ABI, p);
      return c.totalRegisteredUsers();
    });

    const r2 = await callWithFailover(async (p) => {
      const c = new Contract(CONTRACT_ADDRESS, LANDING_ABI, p);
      return c.totalActiveUsers();
    });

    const r3 = await callWithFailover(async (p) => {
      const c = new Contract(CONTRACT_ADDRESS, LANDING_ABI, p);
      return c.totalDeposited();
    });

    // ✅ USDT contract balance (token balanceOf(contract))
    const r4 = await callWithFailover(async (p) => {
      const usdt = new Contract(USDT_ADDRESS, USDT_ABI, p);
      const [rawBal, dec, sym] = await Promise.all([
        usdt.balanceOf(CONTRACT_ADDRESS),
        usdt.decimals(),
        usdt.symbol(),
      ]);
      return { rawBal, dec: Number(dec), sym: String(sym) };
    });

    if (!aliveRef.current) return;

    const oks = [r1, r2, r3, r4].filter((x) => x.ok).length;
    const allFail = oks === 0;

    const rpcUsed =
      (r1.ok && r1.rpc) || (r2.ok && r2.rpc) || (r3.ok && r3.rpc) || (r4.ok && r4.rpc) || "";

    const debug =
      allFail
        ? `Contract: ${CONTRACT_ADDRESS}\nUSDT: ${USDT_ADDRESS}\nRPCS:\n- ${RPCS.join("\n- ")}\n\nLast error: ${
            (r1 as any).err || (r2 as any).err || (r3 as any).err || (r4 as any).err || "Unknown"
          }`
        : `RPC used: ${rpcUsed}`;

    const note =
      allFail
        ? `OFFLINE — ${((r1 as any).err || (r2 as any).err || (r3 as any).err || (r4 as any).err) ?? "Reads failed."}`
        : "";

    setStats((prev) => ({
      ...prev,
      registered: r1.ok ? fmtInt(r1.v) : prev.registered,
      active: r2.ok ? fmtInt(r2.v) : prev.active,
      deposited: r3.ok ? fmtToken(r3.v, 18) : prev.deposited,

      // ✅ set USDT balance
      usdtBal: r4.ok ? fmtToken(r4.v.rawBal, r4.v.dec) : prev.usdtBal,
      usdtSym: r4.ok ? r4.v.sym : prev.usdtSym,
      usdtDec: r4.ok ? r4.v.dec : prev.usdtDec,

      lastUpdated: nowLabel(),
      status: allFail ? "error" : "ok",
      note,
      firstOk: prev.firstOk || !allFail,
      rpcUsed,
      debug,
    }));
  };

  useEffect(() => {
    aliveRef.current = true;
    refresh();
    pollingRef.current = window.setInterval(() => refresh(), 9000);

    return () => {
      aliveRef.current = false;
      if (pollingRef.current) window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusText = stats.status === "ok" ? "LIVE" : stats.status === "error" ? "OFFLINE" : "…";

  const reg = useCountUp(stats.registered, { ms: 520, decimals: 0 });
  const act = useCountUp(stats.active, { ms: 520, decimals: 0 });
  const dep = useCountUp(stats.deposited, { ms: 650, decimals: 2 });
  const usdtBal = useCountUp(stats.usdtBal, { ms: 650, decimals: 2 });

  const Skeleton = ({ h = 30 }: { h?: number }) => (
    <div className="ddx-skeleton" style={{ height: h, borderRadius: 12 }} />
  );

  return (
    <div className="yf-luxe">
      <div className="wrap" style={{ paddingTop: 22, paddingBottom: 54 }}>
        {/* HERO */}
        <div
          className="card"
          style={{
            padding: 22,
            borderRadius: 18,
            background:
              "radial-gradient(circle at 18% 10%, rgba(255,90,210,.16), rgba(0,0,0,0) 52%)," +
              "radial-gradient(circle at 85% 0%, rgba(90,120,255,.16), rgba(0,0,0,0) 50%)," +
              "rgba(255,255,255,.03)",
            border: "1px solid rgba(255,255,255,.10)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div style={{ minWidth: 280, flex: "1 1 520px" }}>
              <div className="small" style={{ letterSpacing: ".14em", textTransform: "uppercase", opacity: 0.82 }}>
                Immutable contract • Built for longevity
              </div>

              <h1 style={{ fontSize: 48, margin: "6px 0 6px", letterSpacing: "-0.03em" }}>
                DollarDex
              </h1>

              <div className="small" style={{ opacity: 0.92, lineHeight: 1.65, maxWidth: 860 }}>
                ROI tiers + 50-day cycle mechanics. Transparent by design — reads come directly from chain.{" "}
                <a href={BSCSCAN_CONTRACT} target="_blank" rel="noreferrer">
                  View Contract
                </a>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <a className="btn primary" href="/app">Launch App</a>
                <a className="btn" href={BSCSCAN_CONTRACT} target="_blank" rel="noreferrer">View Smart Contract</a>
                <a className="btn" href="/app/referral">Referral</a>
              </div>

              <div className="small" style={{ marginTop: 10, opacity: 0.75 }}>
                Live updated: {stats.lastUpdated}
                {stats.rpcUsed ? (
                  <>
                    {" "}
                    <span style={{ opacity: 0.55 }}>•</span>{" "}
                    <span style={{ opacity: 0.75 }}>RPC: {stats.rpcUsed}</span>
                  </>
                ) : null}
              </div>

              {stats.note ? (
                <div className="small" style={{ marginTop: 10, opacity: 0.95 }}>
                  {stats.note}
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div className="chip" style={{ opacity: 0.95 }}>
                {statusText}
              </div>
              <div className="chip">BSC Mainnet</div>
            </div>
          </div>

          {/* DEBUG PANEL (only shows when offline) */}
          {stats.status === "error" ? (
            <pre
              className="card"
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 16,
                whiteSpace: "pre-wrap",
                opacity: 0.9,
              }}
            >
              {stats.debug}
            </pre>
          ) : null}
        </div>

        {/* LIVE STATS */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Live Contract Stats</h2>
            <div className="chip">Live • On-chain</div>
          </div>

          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <div className="card" style={{ padding: 16 }}>
              <div className="small" style={{ opacity: 0.75 }}>Registered Users</div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>
                {stats.firstOk ? reg : <Skeleton />}
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div className="small" style={{ opacity: 0.75 }}>Active Users</div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>
                {stats.firstOk ? act : <Skeleton />}
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div className="small" style={{ opacity: 0.75 }}>Total Deposited</div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>
                {stats.firstOk ? dep : <Skeleton />}
              </div>
              <div className="small" style={{ opacity: 0.7 }}>Token units (18 decimals)</div>
            </div>

            {/* ✅ USDT Contract Balance (ONLY) */}
            <div className="card" style={{ padding: 16 }}>
              <div className="small" style={{ opacity: 0.75 }}>Contract Balance</div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>
                {stats.firstOk ? usdtBal : <Skeleton />}
              </div>
              <div className="small" style={{ opacity: 0.7 }}>USDT</div>
            </div>
          </div>
        </div>

        {/* ROI TIERS TABLE */}
        <div className="card" style={{ marginTop: 16, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>ROI Tier System</h2>
            <div className="chip">Daily ROI</div>
          </div>

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,.10)" }}>
                    Deposit Range
                  </th>
                  <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,.10)" }}>
                    Daily ROI
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROI_TIERS.map((t) => (
                  <tr key={t.range}>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>{t.range}</td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                      <span className="chip">{t.roi}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 50 DAYS CYCLE CARDS */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>50 Days Cycle</h2>
            <div className="chip">Designed for stability</div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
            <div className="card" style={{ padding: 16 }}>
              <div className="chip" style={{ display: "inline-flex" }}>Cycle</div>
              <div style={{ fontSize: 18, fontWeight: 900, marginTop: 10 }}>50 days</div>
              <div className="small" style={{ opacity: 0.86, marginTop: 6, lineHeight: 1.6 }}>
                Structured cycle window to keep operations predictable.
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div className="chip" style={{ display: "inline-flex" }}>Actions</div>
              <div style={{ fontSize: 18, fontWeight: 900, marginTop: 10 }}>Claim / Compound</div>
              <div className="small" style={{ opacity: 0.86, marginTop: 6, lineHeight: 1.6 }}>
                Claim daily rewards or compound (as defined by the contract).
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div className="chip" style={{ display: "inline-flex" }}>Transparency</div>
              <div style={{ fontSize: 18, fontWeight: 900, marginTop: 10 }}>Always auditable</div>
              <div className="small" style={{ opacity: 0.86, marginTop: 6, lineHeight: 1.6 }}>
                Totals and balances are read from chain — no hidden backend.
              </div>
            </div>
          </div>
        </div>

        {/* PREMIUM FOOTER CTA STRIP */}
        <div
          className="card"
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 18,
            background:
              "linear-gradient(90deg, rgba(255,90,210,.12), rgba(0,0,0,0) 35%)," +
              "linear-gradient(270deg, rgba(90,120,255,.12), rgba(0,0,0,0) 35%)," +
              "rgba(255,255,255,.03)",
            border: "1px solid rgba(255,255,255,.10)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>Ready to explore DollarDex?</div>
              <div className="small" style={{ opacity: 0.85, marginTop: 6 }}>
                Open the app to register, deposit, and manage your actions.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a className="btn primary" href="/app">Launch App</a>
              <a className="btn" href="/app/network">Network</a>
              <a className="btn" href="/app/about">About</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
