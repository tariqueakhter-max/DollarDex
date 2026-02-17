// src/pages/Landing.tsx
// ============================================================================
// DollarDex — Landing (V4.4 INSTITUTIONAL BLUE • SINGLE FILE • FULL SECTIONS)
// - Keeps EVERYTHING from your V4.2: Stats + ROI Tier System + 50 Days + CTA + Debug
// - Institutional-grade blue hero (no warm tones)
// - Blue neon edge ring (CSS-only, subtle)
// - Ultra-premium depth background (CSS-only)
// - RPC failover unchanged (PublicNode / dRPC / BlockPI)
// - Firefox-safe gradient text (ROI + Title)
// ============================================================================

import { useCountUp } from "../components/useCountUP";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Contract, JsonRpcProvider, formatUnits } from "ethers";

/** ========= Config ========= */
const CONTRACT_ADDRESS =
  (import.meta as any).env?.VITE_CONTRACT_ADDRESS?.toString?.() ||
  "0xd583327F81fA70d0f30A775dd7E0390B26E324cb";

const USDT_ADDRESS =
  (import.meta as any).env?.VITE_DEPOSIT_TOKEN?.toString?.() ||
  "0x55d398326f99059fF775485246999027B3197955";

const BSCSCAN_CONTRACT = `https://bscscan.com/address/${CONTRACT_ADDRESS}`;

const RPCS: string[] = [
  (import.meta as any).env?.VITE_BSC_RPC?.toString?.() || "",
  "https://bsc-rpc.publicnode.com",
  "https://bsc.drpc.org",
  "https://bsc.blockpi.network/v1/rpc/public"
].filter(Boolean);

/** Minimal ABI for landing stats (MUST exist on your contract) */
const LANDING_ABI = [
  "function totalRegisteredUsers() view returns(uint256)",
  "function totalActiveUsers() view returns(uint256)",
  "function totalDeposited() view returns(uint256)"
];

/** ERC20 ABI for USDT balance */
const USDT_ABI = [
  "function balanceOf(address) view returns(uint256)",
  "function decimals() view returns(uint8)",
  "function symbol() view returns(string)"
];

type LandingStats = {
  registered: string;
  active: string;
  deposited: string;

  usdtBal: string;
  usdtSym: string;
  usdtDec: number;

  lastUpdated: string;
  status: "idle" | "ok" | "error";
  note: string;
  firstOk: boolean;
  rpcUsed: string;
  debug: string;
};

const ROI_TIERS = [
  { range: "$1 – $499", roi: "0.50%" },
  { range: "$500 – $999", roi: "0.55%" },
  { range: "$1000 – $2499", roi: "0.60%" },
  { range: "$2500 – $4999", roi: "0.65%" },
  { range: "$5000+", roi: "0.70%" }
];

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

const nowLabel = () => new Date().toLocaleTimeString();

const normalizeErr = (e: any) => {
  const msg = e?.shortMessage || e?.message || String(e || "Unknown error");
  if (/Failed to fetch/i.test(msg)) return "Failed to fetch (likely CORS / blocked RPC)";
  if (/CORS/i.test(msg)) return "CORS blocked by RPC endpoint";
  if (/missing revert data/i.test(msg)) return "Call reverted / method missing (ABI mismatch?)";
  if (/could not decode/i.test(msg)) return "Decode failed (wrong ABI or wrong chain)";
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
    debug: ""
  }));

  const aliveRef = useRef(true);
  const pollingRef = useRef<number | null>(null);

  const refresh = async () => {
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

    const r4 = await callWithFailover(async (p) => {
      const usdt = new Contract(USDT_ADDRESS, USDT_ABI, p);
      const [rawBal, dec, sym] = await Promise.all([usdt.balanceOf(CONTRACT_ADDRESS), usdt.decimals(), usdt.symbol()]);
      return { rawBal, dec: Number(dec), sym: String(sym) };
    });

    if (!aliveRef.current) return;

    const oks = [r1, r2, r3, r4].filter((x: any) => x.ok).length;
    const allFail = oks === 0;

    const rpcUsed =
      (r1.ok && r1.rpc) || (r2.ok && r2.rpc) || (r3.ok && r3.rpc) || (r4.ok && r4.rpc) || "";

    const debug = allFail
      ? `Contract: ${CONTRACT_ADDRESS}\nUSDT: ${USDT_ADDRESS}\nRPCS:\n- ${RPCS.join("\n- ")}\n\nLast error: ${
          (r1 as any).err || (r2 as any).err || (r3 as any).err || (r4 as any).err || "Unknown"
        }`
      : `RPC used: ${rpcUsed}`;

    const note = allFail
      ? `OFFLINE — ${((r1 as any).err || (r2 as any).err || (r3 as any).err || (r4 as any).err) ?? "Reads failed."}`
      : "";

    setStats((prev) => ({
      ...prev,
      registered: r1.ok ? fmtInt((r1 as any).v) : prev.registered,
      active: r2.ok ? fmtInt((r2 as any).v) : prev.active,
      deposited: r3.ok ? fmtToken((r3 as any).v, 18) : prev.deposited,

      usdtBal: r4.ok ? fmtToken((r4 as any).v.rawBal, (r4 as any).v.dec) : prev.usdtBal,
      usdtSym: r4.ok ? (r4 as any).v.sym : prev.usdtSym,
      usdtDec: r4.ok ? (r4 as any).v.dec : prev.usdtDec,

      lastUpdated: nowLabel(),
      status: allFail ? "error" : "ok",
      note,
      firstOk: prev.firstOk || !allFail,
      rpcUsed,
      debug
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

  // CSS-only particles: fixed list (no runtime random)
  const HERO_PARTICLES: Array<[number, number, number, number, number, number, number]> = [
    [10, 18, 5, 22, -2, 0, 0.35],
    [18, 60, 3, 26, -9, 0, 0.28],
    [26, 36, 2, 30, -14, 0, 0.22],
    [34, 78, 4, 24, -7, 0, 0.30],
    [42, 22, 2, 34, -19, 0, 0.18],
    [50, 58, 6, 28, -12, 0, 0.26],
    [58, 30, 2, 36, -21, 0, 0.18],
    [66, 74, 4, 23, -6, 0, 0.26],
    [74, 16, 5, 29, -11, 0, 0.24],
    [82, 44, 2, 40, -24, 0, 0.16],
    [88, 66, 5, 25, -10, 0, 0.22],
    [90, 26, 2, 38, -18, 0, 0.16]
  ];

  const roiTextStyle: CSSProperties = {
    fontWeight: 1000,
    fontSize: 18,
    display: "inline-block",
    lineHeight: 1,
    background: "linear-gradient(90deg, rgba(200,230,255,1), rgba(90,160,255,1), rgba(0,180,255,.92))",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent"
  };

  return (
    <div className="yf-luxe ddx-institutional">
      <style>
        {`
          /* =======================
             Layout helpers
          ======================= */
          .ddx-grid4{
            margin-top: 14px;
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
          }
          @media (max-width: 980px){ .ddx-grid4{ grid-template-columns: repeat(2, minmax(0, 1fr)); } }
          @media (max-width: 560px){ .ddx-grid4{ grid-template-columns: 1fr; } }

          .ddx-skeleton{
            background: linear-gradient(90deg, rgba(255,255,255,.06), rgba(255,255,255,.02), rgba(255,255,255,.06));
            background-size: 200% 100%;
            animation: ddxSkel 1.1s ease-in-out infinite;
            border: 1px solid rgba(255,255,255,.07);
          }
          @keyframes ddxSkel { 0%{ background-position: 0% 50%; } 100%{ background-position: 200% 50%; } }

          /* =======================
             INSTITUTIONAL BACKDROP (no warm tones)
          ======================= */
          .ddx-institutional{
            background:
              radial-gradient(1200px 600px at 50% -220px, rgba(0,120,255,.10), transparent 60%),
              linear-gradient(180deg, #05070d, #070c17 60%, #05070d);
            background-attachment: fixed;
            background-image:
              linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px),
              radial-gradient(1200px 600px at 50% -220px, rgba(0,120,255,.10), transparent 60%),
              linear-gradient(180deg, #05070d, #070c17 60%, #05070d);
            background-size: 62px 62px, 62px 62px, auto, auto;
            background-position: 0 0, 0 0, center, center;
          }

          /* =======================
             HERO V4.4 Institutional
          ======================= */
          .ddx-heroWrap{
            position: relative;
            overflow: hidden;
            border-radius: 22px;
            border: 1px solid rgba(255,255,255,.08);
          }

          .ddx-heroBg{
            position:absolute;
            inset:-22%;
            pointer-events:none;
            z-index: 0;
            background:
              radial-gradient(820px 420px at 15% 25%, rgba(0,120,255,.10), transparent 55%),
              radial-gradient(720px 420px at 85% 20%, rgba(0,80,255,.08), transparent 55%),
              radial-gradient(820px 520px at 55% 92%, rgba(30,90,255,.06), transparent 60%),
              linear-gradient(135deg, #0b1220 0%, #0f172a 60%, #0b1220 100%);
            transform: translate3d(0,0,0);
            animation: ddxHeroDrift 18s ease-in-out infinite alternate;
          }
          @keyframes ddxHeroDrift{
            0%{ transform: translate3d(-1%, -1%, 0) scale(1.02); }
            100%{ transform: translate3d( 1%,  1%, 0) scale(1.05); }
          }

          /* subtle noise (no image) */
          .ddx-heroWrap::after{
            content:"";
            position:absolute; inset:0;
            pointer-events:none;
            z-index: 1;
            opacity: .07;
            background:
              repeating-radial-gradient(circle at 20% 20%,
                rgba(255,255,255,.08) 0px,
                rgba(255,255,255,.08) 1px,
                transparent 2px,
                transparent 6px
              );
            mix-blend-mode: overlay;
            animation: ddxNoiseShift 12s linear infinite;
          }
          @keyframes ddxNoiseShift{
            0%{ transform: translate3d(0,0,0); }
            100%{ transform: translate3d(-2.5%, 2%, 0); }
          }

          /* hero card */
          .ddx-heroCard{
            position: relative;
            overflow: hidden;
            border-radius: 22px;
            background: linear-gradient(145deg, rgba(255,255,255,.035), rgba(255,255,255,.015));
            border: 1px solid rgba(255,255,255,.07);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            z-index: 2;
          }

          /* blue neon edge (executive, not gamer) */
          .ddx-neonEdge{
            position: relative;
          }
          .ddx-neonEdgeRing{
            position:absolute;
            inset:-3px;
            border-radius:24px;
            padding: 3px;
            pointer-events:none;
            z-index: 2;
            background:
              conic-gradient(
                from 0deg,
                rgba(30,80,255,0),
                rgba(60,130,255,.75),
                rgba(0,140,255,.65),
                rgba(60,130,255,.75),
                rgba(30,80,255,0)
              );
            -webkit-mask:
              linear-gradient(#000 0 0) content-box,
              linear-gradient(#000 0 0);
            -webkit-mask-composite: xor;
                    mask-composite: exclude;
            animation: ddxNeonSpin 14s linear infinite, ddxNeonPulse 5.6s ease-in-out infinite;
            opacity: .72;
          }
          @keyframes ddxNeonSpin{
            0%{ transform: rotate(0deg); }
            100%{ transform: rotate(360deg); }
          }
          @keyframes ddxNeonPulse{
            0%,100%{ opacity:.55; }
            50%{ opacity:.85; }
          }

          /* glass shine sweep (very subtle) */
          .ddx-heroCard.ddx-shine::before{
            content:"";
            position:absolute;
            inset:-40%;
            background: linear-gradient(110deg,
              transparent 38%,
              rgba(255,255,255,.14) 48%,
              rgba(255,255,255,.04) 58%,
              transparent 68%
            );
            transform: translate3d(-42%, 0, 0) rotate(6deg);
            opacity: .55;
            animation: ddxShineSweep 6.2s ease-in-out infinite;
            pointer-events:none;
          }
          @keyframes ddxShineSweep{
            0%   { transform: translate3d(-42%, 0, 0) rotate(6deg); }
            55%  { transform: translate3d( 42%, 0, 0) rotate(6deg); }
            100% { transform: translate3d( 42%, 0, 0) rotate(6deg); }
          }

          /* title (blue institutional) */
          @keyframes ddxTitleSheenBlue {
            0% { background-position: 0% 50%; }
            100% { background-position: 220% 50%; }
          }
          .ddx-heroTitle{
            font-size: 60px;
            font-weight: 1000;
            letter-spacing: -0.05em;
            background: linear-gradient(90deg,
              rgba(200,230,255,1),
              rgba(90,160,255,1),
              rgba(35,110,255,.98),
              rgba(0,180,255,.88),
              rgba(200,230,255,1)
            );
            background-size: 220% 100%;
            animation: ddxTitleSheenBlue 7.8s linear infinite;
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            color: transparent;
            text-shadow: 0 0 26px rgba(0,120,255,.10);
          }
          @media (max-width: 640px){
            .ddx-heroTitle{ font-size: 44px; }
          }

          /* particles */
          .ddx-heroParticles{
            position:absolute; inset:0;
            z-index: 2;
            pointer-events:none;
          }
          .ddx-p{
            position:absolute;
            left: var(--x);
            top: var(--y);
            width: var(--s);
            height: var(--s);
            border-radius: 999px;
            opacity: var(--op);
            filter: blur(var(--b));
            background:
              radial-gradient(circle at 35% 35%,
                rgba(255,255,255,.90),
                rgba(60,130,255,.45) 40%,
                rgba(0,180,255,.22) 70%,
                transparent 72%
              );
            box-shadow:
              0 0 18px rgba(0,120,255,.10),
              0 0 28px rgba(0,180,255,.08);
            transform: translate3d(-50%, -50%, 0);
            animation: ddxFloat var(--dur) ease-in-out infinite;
            animation-delay: var(--del);
          }
          @keyframes ddxFloat{
            0%   { transform: translate3d(-50%, -50%, 0) translate3d(-6px,  8px, 0) scale(1);   opacity: calc(var(--op) * .9); }
            50%  { transform: translate3d(-50%, -50%, 0) translate3d( 8px, -10px, 0) scale(1.10); opacity: var(--op); }
            100% { transform: translate3d(-50%, -50%, 0) translate3d(-6px,  8px, 0) scale(1);   opacity: calc(var(--op) * .9); }
          }

          /* ROI rows: remove warm gradient */
          .ddx-roiRow{
            transition: transform .22s ease, box-shadow .22s ease, background .22s ease, border-color .22s ease;
            background: linear-gradient(90deg, rgba(255,255,255,.02), rgba(255,255,255,.01));
          }
          .ddx-roiRow:hover{
            transform: translateY(-2px);
            background: linear-gradient(90deg, rgba(0,120,255,.08), rgba(0,0,0,0));
            border-color: rgba(0,120,255,.25) !important;
            box-shadow: 0 14px 44px rgba(0,120,255,.10);
          }

          /* Reduced motion safety */
          @media (prefers-reduced-motion: reduce){
            .ddx-heroBg,
            .ddx-heroWrap::after,
            .ddx-neonEdgeRing,
            .ddx-heroCard.ddx-shine::before,
            .ddx-p,
            .ddx-heroTitle{
              animation: none !important;
            }
          }
        `}
      </style>

      <div className="wrap" style={{ paddingTop: 22, paddingBottom: 54 }}>
        {/* ================= INSTITUTIONAL HERO ================= */}
        <div className="ddx-heroWrap">
          <div className="ddx-heroBg" aria-hidden="true" />

          <div className="ddx-heroParticles" aria-hidden="true">
            {HERO_PARTICLES.map(([x, y, s, dur, del, blur, op], i) => (
              <span
                key={i}
                className="ddx-p"
                style={
                  {
                    ["--x" as any]: `${x}%`,
                    ["--y" as any]: `${y}%`,
                    ["--s" as any]: `${s}px`,
                    ["--dur" as any]: `${dur}s`,
                    ["--del" as any]: `${del}s`,
                    ["--b" as any]: `${blur}px`,
                    ["--op" as any]: op
                  } as CSSProperties
                }
              />
            ))}
          </div>

          <div className="ddx-neonEdge" style={{ position: "relative" }}>
            <div className="ddx-neonEdgeRing" aria-hidden="true" />

            <div className="card ddx-heroCard ddx-shine" style={{ padding: 28 }}>
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 18 }}>
                  <div style={{ flex: "1 1 560px", minWidth: 280 }}>
                    <div className="small" style={{ letterSpacing: ".16em", textTransform: "uppercase", opacity: 0.72 }}>
                      Immutable Smart Contract • BSC Mainnet • Built for longevity
                    </div>

                    <div className="ddx-heroTitle" style={{ marginTop: 8 }}>
                      DollarDex
                    </div>

                    <div style={{ fontSize: 18, marginTop: 14, opacity: 0.92, lineHeight: 1.7, maxWidth: 860 }}>
                      Premium structured DeFi with controlled ROI tiers and 50-day cycles. Transparent by design — data is read
                      directly from-chain.
                    </div>

                    <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
                      <a
                        className="btn primary"
                        href="/app"
                        style={{
                          padding: "14px 22px",
                          fontWeight: 950,
                          fontSize: 16,
                          boxShadow: "0 0 30px rgba(0,120,255,.22)"
                        }}
                      >
                        Launch App
                      </a>
                      <a className="btn" href={BSCSCAN_CONTRACT} target="_blank" rel="noreferrer">
                        View Smart Contract
                      </a>
                      <a className="btn" href="/app/referral">
                        Referral
                      </a>
                    </div>

                    <div className="small" style={{ marginTop: 14, opacity: 0.72 }}>
                      Live updated: {stats.lastUpdated}
                      {stats.rpcUsed ? (
                        <>
                          {" "}
                          <span style={{ opacity: 0.55 }}>•</span>{" "}
                          <span style={{ opacity: 0.78 }}>RPC: {stats.rpcUsed}</span>
                        </>
                      ) : null}
                    </div>

                    {stats.note ? (
                      <div className="small" style={{ marginTop: 10, opacity: 0.95 }}>
                        {stats.note}
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div className="chip" style={{ fontWeight: 900 }}>
                      {statusText}
                    </div>
                    <div className="chip">On-chain</div>
                  </div>
                </div>
              </div>
            </div>
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
              opacity: 0.9
            }}
          >
            {stats.debug}
          </pre>
        ) : null}

        {/* LIVE STATS */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Live Contract Stats</h2>
            <div className="chip">Live • On-chain</div>
          </div>

          <div className="ddx-grid4">
            <div className="card" style={{ padding: 16 }}>
              <div className="small" style={{ opacity: 0.75 }}>Registered Users</div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{stats.firstOk ? reg : <Skeleton />}</div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div className="small" style={{ opacity: 0.75 }}>Active Users</div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{stats.firstOk ? act : <Skeleton />}</div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div className="small" style={{ opacity: 0.75 }}>Total Deposited</div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{stats.firstOk ? dep : <Skeleton />}</div>
              <div className="small" style={{ opacity: 0.7 }}>Token units (18 decimals)</div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div className="small" style={{ opacity: 0.75 }}>Contract Balance</div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{stats.firstOk ? usdtBal : <Skeleton />}</div>
              <div className="small" style={{ opacity: 0.7 }}>USDT</div>
            </div>
          </div>
        </div>

        {/* ROI TIERS */}
        <div className="card" style={{ marginTop: 20, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-.02em" }}>ROI Tier System</div>
            <div className="chip">Daily ROI</div>
          </div>

          <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
            {ROI_TIERS.map((t) => (
              <div
                key={t.range}
                className="ddx-roiRow"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 16px",
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,.08)"
                }}
              >
                <div style={{ fontWeight: 800 }}>{t.range}</div>
                <div style={roiTextStyle}>{t.roi}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 50 DAYS */}
        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <h2 style={{ margin: 0 }}>50 Days Cycle</h2>
            <div className="chip">Stability Design</div>
          </div>

          <div
            style={{
              marginTop: 16,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 16
            }}
          >
            <div
              className="card"
              style={{
                padding: 20,
                borderRadius: 20,
                background:
                  "radial-gradient(circle at 20% 20%, rgba(0,120,255,.10), rgba(0,0,0,0) 60%), rgba(255,255,255,.02)"
              }}
            >
              <div style={{ fontSize: 44, fontWeight: 1000, letterSpacing: "-.03em" }}>50</div>
              <div style={{ fontWeight: 900, marginTop: 6 }}>Days Structured Cycle</div>
              <div className="small" style={{ marginTop: 8, lineHeight: 1.6 }}>
                Controlled payout window designed to support long-term sustainability.
              </div>
            </div>

            <div
              className="card"
              style={{
                padding: 20,
                borderRadius: 20,
                background:
                  "radial-gradient(circle at 80% 10%, rgba(0,180,255,.08), rgba(0,0,0,0) 60%), rgba(255,255,255,.02)"
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 1000 }}>Claim or Compound</div>
              <div className="small" style={{ marginTop: 10, lineHeight: 1.6 }}>
                Users may claim daily rewards or compound based on contract mechanics.
              </div>
            </div>

            <div
              className="card"
              style={{
                padding: 20,
                borderRadius: 20,
                background:
                  "radial-gradient(circle at 50% 80%, rgba(35,110,255,.08), rgba(0,0,0,0) 60%), rgba(255,255,255,.02)"
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 1000 }}>Fully Transparent</div>
              <div className="small" style={{ marginTop: 10, lineHeight: 1.6 }}>
                All calculations and totals are verifiable directly on blockchain.
              </div>
            </div>
          </div>
        </div>

        {/* CTA STRIP */}
        <div
          className="card"
          style={{
            marginTop: 18,
            padding: 16,
            borderRadius: 18,
            background:
              "linear-gradient(90deg, rgba(0,120,255,.10), rgba(0,0,0,0) 35%)," +
              "linear-gradient(270deg, rgba(0,180,255,.08), rgba(0,0,0,0) 35%)," +
              "rgba(255,255,255,.03)",
            border: "1px solid rgba(255,255,255,.10)"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 1000 }}>Ready to explore DollarDex?</div>
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
