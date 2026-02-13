// src/pages/Referral.tsx
// ============================================================================
// DollarDex — Referral (Premium Luxury) — NO QR
// - Wallet auto-sync (eth_accounts + chainId + listeners)
// - Wrong network guard (BSC Mainnet)
// - Contract-truth referral stats (usersExtra + getNetworkRewards)
// - Premium copy + share (Telegram / X)
// - v2.2 FIX: usersExtra indexes corrected (teamCount/directsCount)
// - v2.2 FIX: No scary raw RPC errors shown (sanitized user-facing error)
// - v2.2 FIX: Live pill readable in Light theme (uses CSS variables)
// ============================================================================

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BrowserProvider, Contract, JsonRpcProvider, formatUnits } from "ethers";
import { useLocation } from "react-router-dom";

/** ========= Config ========= */
const RPC_URL =
  (import.meta as any).env?.VITE_BSC_RPC?.toString?.() || "https://bsc-dataseed.binance.org/";

const CONTRACT_ADDRESS = "0xd583327F81fA70d0f30A775dd7E0390B26E324cb";
const BSC_CHAIN_ID_DEC = 56;

const TELEGRAM_CHANNEL = "https://t.me/DollarDex_Community";
const TELEGRAM_COMMUNITY = "https://t.me/dollardex_public";

const rpc = new JsonRpcProvider(RPC_URL);

/** ========= ABIs ========= */
const YF_ABI = [
  "function USDT() view returns(address)",
  "function users(address) view returns(address,bool,uint256,uint256,uint256,uint256,uint256)",
  // usersExtra outputs (per your ABI):
  // rewardsReferral, rewardsOnboarding, rewardsRank,
  // reserveDailyCapital, reserveDailyROI, reserveNetwork,
  // teamCount, directsCount, directsQuali, rank
  "function usersExtra(address) view returns(uint256,uint256,uint256,uint256,uint256,uint256,uint32,uint32,uint32,uint8)",
  "function getNetworkRewards(address) view returns(uint256,uint256)"
];

const ERC20_ABI = ["function symbol() view returns(string)", "function decimals() view returns(uint8)"];

/** ========= Utilities ========= */
type Toast = { type: "success" | "error" | "info"; title: string; msg?: string };

function getEthereum(): any {
  return (window as any).ethereum;
}
function normalizeChainId(cid: any): number | null {
  if (cid == null) return null;
  if (typeof cid === "string") {
    const s = cid.trim();
    if (!s) return null;
    return s.startsWith("0x") || s.startsWith("0X") ? parseInt(s, 16) : parseInt(s, 10);
  }
  if (typeof cid === "number") return Number.isFinite(cid) ? cid : null;
  if (typeof cid === "bigint") return Number(cid);
  if (typeof cid === "object" && cid) return normalizeChainId((cid as any).chainId);
  return null;
}
function shortAddr(a: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

/** No-scary error message mapper */
function friendlyError(e: any): string {
  const raw = String(e?.shortMessage || e?.message || e || "").toLowerCase();

  if (!raw) return "Could not load referral data. Please try again.";
  if (raw.includes("rate limit") || raw.includes("-32005") || raw.includes("too many requests")) {
    return "Network is busy right now (RPC rate limit). Please wait a moment and try again.";
  }
  if (raw.includes("failed to fetch") || raw.includes("networkerror") || raw.includes("timeout")) {
    return "Network connection issue. Please try again.";
  }
  if (raw.includes("bad_data") || raw.includes("missing response")) {
    return "RPC provider returned an invalid response. Please retry in a moment.";
  }
  if (raw.includes("user rejected") || raw.includes("rejected")) {
    return "Request was rejected in your wallet.";
  }
  return "Could not load referral data. Please try again.";
}

/** ========= Smooth counters ========= */
function useAnimatedNumber(target: number, enabled: boolean, duration = 650) {
  const [v, setV] = useState<number>(target);

  useEffect(() => {
    if (!enabled) {
      setV(target);
      return;
    }
    if (!Number.isFinite(target)) {
      setV(target);
      return;
    }

    const from = v;
    const to = target;
    if (from === to) return;

    const start = performance.now();
    let raf = 0;

    const tick = (t: number) => {
      const p = clamp01((t - start) / duration);
      const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setV(from + (to - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, enabled]);

  return v;
}

function bigintToSafeNumberOrNull(x: bigint) {
  const MAX = BigInt(Number.MAX_SAFE_INTEGER);
  if (x > MAX) return null;
  return Number(x);
}

function fmtCompact(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return Math.round(n).toString();
}

/** ========= UI bits ========= */
function StatRow({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "baseline" }}>
      <div className="small" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span>{label}</span>
        {hint ? (
          <span className="chip" style={{ padding: "6px 10px" }}>
            {hint}
          </span>
        ) : null}
      </div>
      <div style={{ fontWeight: 950 }}>{value}</div>
    </div>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const set = () => setReduced(Boolean(mq.matches));
    set();
    mq.addEventListener?.("change", set);
    return () => mq.removeEventListener?.("change", set);
  }, []);
  return reduced;
}

function LivePill({ active, label = "LIVE" }: { active: boolean; label?: string }) {
  const reduced = usePrefersReducedMotion();
  const pulseAnim = reduced ? undefined : { animation: "yfPulse 1.9s ease-in-out infinite" };

  // Uses theme tokens (works in Light theme too)
  const baseBg = active ? "rgba(255,88,198,.10)" : "rgba(0,0,0,.04)";
  const baseBorder = active ? "rgba(255,88,198,.22)" : "var(--border)";
  const dot = active ? "rgba(255,88,198,.95)" : "rgba(120,120,120,.55)";

  return (
    <>
      <style>
        {`
          @keyframes yfPulse {
            0%   { box-shadow: 0 0 0px rgba(255,88,198,.00), 0 0 0px rgba(142,133,255,.00); transform: translateY(0); }
            40%  { box-shadow: 0 0 18px rgba(255,88,198,.16), 0 0 34px rgba(142,133,255,.10); transform: translateY(-1px); }
            100% { box-shadow: 0 0 0px rgba(255,88,198,.00), 0 0 0px rgba(142,133,255,.00); transform: translateY(0); }
          }
        `}
      </style>

      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 10px",
          borderRadius: 999,
          border: `1px solid ${baseBorder}`,
          background: baseBg,
          color: "var(--text)" as any,
          fontSize: 12,
          fontWeight: 950,
          letterSpacing: ".28px",
          backdropFilter: "blur(10px)",
          ...(active ? pulseAnim : {})
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: dot,
            boxShadow: active ? "0 0 14px rgba(255,88,198,.28)" : "none"
          }}
        />
        {label}
      </span>
    </>
  );
}

function DollarDexLogoMini({ size = 26 }: { size?: number }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        aria-label="DollarDex"
        role="img"
        style={{
          filter:
            "drop-shadow(0 0 14px rgba(246,208,122,.18)) drop-shadow(0 0 26px rgba(255,88,198,.10))"
        }}
      >
        <defs>
          <linearGradient id="ddxGold2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,241,187,1)" />
            <stop offset="38%" stopColor="rgba(246,208,122,1)" />
            <stop offset="72%" stopColor="rgba(255,88,198,.88)" />
            <stop offset="100%" stopColor="rgba(142,133,255,.85)" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="26" fill="url(#ddxGold2)" opacity="0.98" />
        <circle cx="32" cy="32" r="20" fill="rgba(0,0,0,.22)" />
        <path
          d="M26 21h9.2c7.2 0 12.8 5.6 12.8 11s-5.6 11-12.8 11H26V21zm6.4 6v16h2.8c4.1 0 7.2-3.6 7.2-8s-3.1-8-7.2-8h-2.8z"
          fill="rgba(0,0,0,.80)"
          opacity="0.92"
        />
      </svg>

      <div style={{ lineHeight: 1 }}>
        <div
          style={{
            fontSize: 18,
            fontWeight: 1000,
            letterSpacing: "-0.03em",
            background:
              "linear-gradient(90deg, rgba(255,241,187,1), rgba(246,208,122,1), rgba(255,88,198,.92), rgba(142,133,255,.85))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent"
          }}
        >
          Referral
        </div>
        <div className="small" style={{ opacity: 0.72, marginTop: 2 }}>
          Grow your network
        </div>
      </div>
    </div>
  );
}

/** ========= Main ========= */
export default function Referral() {
  const location = useLocation();

  /** ===== Toasts ===== */
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = (type: Toast["type"], title: string, msg?: string) => {
    setToasts((t) => [...t, { type, title, msg }]);
    window.setTimeout(() => setToasts((t) => t.slice(1)), 3200);
  };

  /** ===== Wallet / chain ===== */
  const [addr, setAddr] = useState("");
  const [chainOk, setChainOk] = useState(true);

  async function syncWalletSilent() {
    const eth = getEthereum();
    if (!eth?.request) {
      setAddr("");
      setChainOk(true);
      return;
    }
    try {
      const accs: string[] = await eth.request({ method: "eth_accounts" });
      const a = Array.isArray(accs) && accs.length ? String(accs[0]) : "";
      setAddr(a);

      const raw = await eth.request({ method: "eth_chainId" });
      const cid = normalizeChainId(raw);
      setChainOk(cid === BSC_CHAIN_ID_DEC);
    } catch {
      setAddr("");
      setChainOk(true);
    }
  }

  async function connect() {
    try {
      const eth = getEthereum();
      if (!eth?.request) return toast("error", "Wallet not found", "Install MetaMask (or a Web3 wallet).");

      const bp = new BrowserProvider(eth);
      await bp.send("eth_requestAccounts", []);
      await syncWalletSilent();
      toast("success", "Wallet connected");
    } catch (e: any) {
      toast("error", "Connect failed", friendlyError(e));
    }
  }

  useEffect(() => {
    const eth = getEthereum();
    syncWalletSilent();

    if (!eth?.on) return;

    const onAcc = () => syncWalletSilent();
    const onChain = () => syncWalletSilent();

    eth.on("accountsChanged", onAcc);
    eth.on("chainChanged", onChain);

    return () => {
      try {
        eth.removeListener?.("accountsChanged", onAcc);
        eth.removeListener?.("chainChanged", onChain);
      } catch {
        // ignore
      }
    };
  }, [location.pathname]);

  /** ===== On-chain state ===== */
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string>("");

  const [registered, setRegistered] = useState(false);
  const [referrer, setReferrer] = useState("");

  const [directCount, setDirectCount] = useState(0n);
  const [teamCount, setTeamCount] = useState(0n);

  const [netAvail, setNetAvail] = useState(0n);
  const [netReserve, setNetReserve] = useState(0n);

  const [dec, setDec] = useState(18);
  const [sym, setSym] = useState("USDT");

  const yfRead = useMemo(() => new Contract(CONTRACT_ADDRESS, YF_ABI, rpc), []);

  async function refresh() {
    if (!addr) {
      setRegistered(false);
      setReferrer("");
      setDirectCount(0n);
      setTeamCount(0n);
      setNetAvail(0n);
      setNetReserve(0n);
      setLoadErr("");
      return;
    }

    setLoading(true);
    setLoadErr("");

    try {
      const [u, extra, netR, usdtAddr] = await Promise.all([
        yfRead.users(addr),
        yfRead.usersExtra(addr),
        yfRead.getNetworkRewards(addr),
        yfRead.USDT()
      ]);

      setReferrer(String(u[0]));
      setRegistered(Boolean(u[1]));

      // ✅ FIX: usersExtra index mapping (per your ABI)
      // teamCount = extra[6], directsCount = extra[7]
      const team = BigInt((extra as any)[6] ?? 0);
      const directs = BigInt((extra as any)[7] ?? 0);
      setTeamCount(team);
      setDirectCount(directs);

      setNetAvail(BigInt((netR as any)[0] ?? 0));
      setNetReserve(BigInt((netR as any)[1] ?? 0));

      const erc = new Contract(usdtAddr, ERC20_ABI, rpc);
      const [d, s] = await Promise.all([erc.decimals(), erc.symbol()]);
      setDec(Number(d));
      setSym(String(s));
    } catch (e: any) {
      // Do NOT print scary stuff to UI
      setLoadErr(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr]);

  /** ===== Referral Link ===== */
  const referralLink = useMemo(() => {
    if (!addr) return "";
    const origin = window.location.origin;
    return `${origin}/?ref=${addr}`;
  }, [addr]);

  const tgShare = useMemo(() => {
    if (!referralLink) return "";
    const text = `Join DollarDex using my referral:\n${referralLink}`;
    return `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(text)}`;
  }, [referralLink]);

  const xShare = useMemo(() => {
    if (!referralLink) return "";
    const text = `Join DollarDex using my referral link: ${referralLink}`;
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  }, [referralLink]);

  async function copyLink() {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      toast("success", "Copied", "Referral link copied to clipboard.");
    } catch {
      toast("error", "Copy failed", "Your browser blocked clipboard access.");
    }
  }

  const liveActive = Boolean(addr && registered && chainOk);

  /** ===== Animated numbers ===== */
  const directSafe = bigintToSafeNumberOrNull(directCount);
  const teamSafe = bigintToSafeNumberOrNull(teamCount);

  const netAvailFloat = useMemo(() => {
    try {
      return parseFloat(formatUnits(netAvail, dec));
    } catch {
      return 0;
    }
  }, [netAvail, dec]);

  const netReserveFloat = useMemo(() => {
    try {
      return parseFloat(formatUnits(netReserve, dec));
    } catch {
      return 0;
    }
  }, [netReserve, dec]);

  const animatedDirect = useAnimatedNumber(directSafe ?? 0, Boolean(addr && chainOk));
  const animatedTeam = useAnimatedNumber(teamSafe ?? 0, Boolean(addr && chainOk));
  const animatedNetAvail = useAnimatedNumber(netAvailFloat, Boolean(addr && registered && chainOk), 750);
  const animatedNetReserve = useAnimatedNumber(netReserveFloat, Boolean(addr && registered && chainOk), 750);

  const prettyNetAvail = useMemo(() => {
    if (!addr) return `0 ${sym}`;
    return `${animatedNetAvail.toFixed(2)} ${sym}`;
  }, [addr, animatedNetAvail, sym]);

  const prettyNetReserve = useMemo(() => {
    if (!addr) return `0 ${sym}`;
    return `${animatedNetReserve.toFixed(2)} ${sym}`;
  }, [addr, animatedNetReserve, sym]);

  return (
    <div className="yf-luxe">
      {/* Toast stack */}
      <div
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 999,
          width: "min(380px, calc(100vw - 36px))",
          display: "flex",
          flexDirection: "column",
          gap: 10
        }}
      >
        {toasts.map((t, i) => (
          <div key={i} className="card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 900 }}>
              {t.type === "success" ? "✅ " : t.type === "error" ? "⚠️ " : "ℹ️ "}
              {t.title}
            </div>
            {t.msg ? (
              <div className="small" style={{ marginTop: 6 }}>
                {t.msg}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 28 }}>
        {/* Header card */}
        <div className="card" style={{ position: "relative", overflow: "hidden" }}>
          <style>
            {`
              @keyframes ddxSheen2 {
                0% { background-position: 0% 50%; }
                100% { background-position: 100% 50%; }
              }
              .refHeroGlow {
                position:absolute; inset:-2px;
                background:
                  radial-gradient(circle at 18% 10%, rgba(255,88,198,.16), rgba(0,0,0,0) 48%),
                  radial-gradient(circle at 86% 0%, rgba(142,133,255,.14), rgba(0,0,0,0) 52%),
                  radial-gradient(circle at 55% 120%, rgba(246,208,122,.10), rgba(0,0,0,0) 48%);
                pointer-events:none;
              }
              .refTitle {
                font-size: 28px;
                font-weight: 1000;
                letter-spacing: -0.03em;
                background: linear-gradient(90deg, rgba(255,241,187,1), rgba(246,208,122,1), rgba(255,88,198,.92), rgba(142,133,255,.85));
                background-size: 200% 200%;
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
                animation: ddxSheen2 4.2s ease-in-out infinite alternate;
              }
              .refKpiRow {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 10px;
                margin-top: 14px;
              }
              .refKpi {
                border: 1px solid var(--border);
                background: rgba(255,255,255,.03);
                border-radius: 16px;
                padding: 12px 12px;
                backdrop-filter: blur(12px);
              }
              html[data-theme="light"] .refKpi {
                background: rgba(0,0,0,.02);
              }
              .refKpiLabel {
                font-size: 11px;
                letter-spacing: .22em;
                text-transform: uppercase;
                color: var(--muted);
              }
              .refKpiValue {
                margin-top: 8px;
                font-size: 24px;
                font-weight: 1000;
                letter-spacing: -0.02em;
                color: var(--text);
              }
              .refKpiHint {
                margin-top: 6px;
                font-size: 12px;
                color: var(--muted);
              }
            `}
          </style>

          <div className="refHeroGlow" />

          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <DollarDexLogoMini />

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
                <a className="btn" href={TELEGRAM_COMMUNITY} target="_blank" rel="noreferrer" style={{ fontWeight: 900 }}>
                  Community
                </a>
                <a className="btn" href={TELEGRAM_CHANNEL} target="_blank" rel="noreferrer" style={{ fontWeight: 900 }}>
                  Official
                </a>

                {!addr ? (
                  <button
                    className="btn primary"
                    onClick={connect}
                    type="button"
                    style={{ padding: "13px 18px", fontSize: 15, fontWeight: 950 }}
                  >
                    ✨ Connect Wallet
                  </button>
                ) : (
                  <span className="chip">
                    <span className="dot" />
                    <span className="mono">{chainOk ? "BSC" : "Wrong Net"}</span>
                    <span className="mono">{shortAddr(addr)}</span>
                  </span>
                )}

                <LivePill active={liveActive} label={loading ? "LOADING" : "LIVE"} />
              </div>
            </div>

            <div style={{ height: 10 }} />
            <div className="refTitle">Invite. Expand. Earn.</div>
            <div className="small" style={{ marginTop: 8 }}>
              Your referral link is unique to your wallet. All stats are read directly from the contract.
            </div>

            <div className="refKpiRow">
              <div className="refKpi">
                <div className="refKpiLabel">Direct referrals</div>
                <div className="refKpiValue">
                  {directSafe == null ? directCount.toString() : fmtCompact(animatedDirect)}
                </div>
                <div className="refKpiHint">Level 1 joins</div>
              </div>

              <div className="refKpi">
                <div className="refKpiLabel">Team size</div>
                <div className="refKpiValue">
                  {teamSafe == null ? teamCount.toString() : fmtCompact(animatedTeam)}
                </div>
                <div className="refKpiHint">Total downline</div>
              </div>

              <div className="refKpi">
                <div className="refKpiLabel">Network rewards</div>
                <div className="refKpiValue">{addr ? prettyNetAvail : "—"}</div>
                <div className="refKpiHint">Available now</div>
              </div>
            </div>

            {!chainOk && addr ? (
              <div className="card" style={{ marginTop: 14 }}>
                <b>Wrong network</b>
                <div className="small" style={{ marginTop: 6 }}>
                  Please switch your wallet to <b>BSC Mainnet</b> (chainId 56).
                </div>
              </div>
            ) : null}

            {loadErr ? (
              <div className="card" style={{ marginTop: 14 }}>
                <b>Could not load referral data</b>
                <div className="small" style={{ marginTop: 6 }}>
                  {loadErr}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 12,
            alignItems: "start"
          }}
        >
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Your Referral Link</h3>
              <span className="chip" style={{ fontWeight: 900 }}>
                {addr ? "Active" : "Connect wallet"}
              </span>
            </div>

            <div style={{ height: 10 }} />
            {!addr ? (
              <>
                <div className="small">Connect your wallet to generate your referral link.</div>
                <div style={{ height: 10 }} />
                <button className="btn primary" onClick={connect} type="button" style={{ fontWeight: 950 }}>
                  ✨ Connect Wallet
                </button>
              </>
            ) : (
              <>
                <div className="small" style={{ marginBottom: 8 }}>
                  Your wallet: <span className="mono">{shortAddr(addr)}</span>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <input value={referralLink} readOnly style={{ flex: "1 1 260px" }} />
                  <button className="btn primary" onClick={copyLink} type="button" style={{ fontWeight: 950 }}>
                    Copy
                  </button>
                </div>

                <div className="small" style={{ marginTop: 10 }}>
                  Referrer (your upline):{" "}
                  <b style={{ color: "var(--text)" as any }}>
                    {referrer && referrer !== "0x0000000000000000000000000000000000000000" ? shortAddr(referrer) : "—"}
                  </b>
                </div>

                <div style={{ height: 12 }} />
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <a className="btn" href={tgShare} target="_blank" rel="noreferrer" style={{ fontWeight: 950 }}>
                    Share Telegram
                  </a>
                  <a className="btn" href={xShare} target="_blank" rel="noreferrer" style={{ fontWeight: 950 }}>
                    Share X
                  </a>
                </div>
              </>
            )}
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Referral Stats</h3>
              <LivePill active={liveActive} label={loading ? "LOADING" : "LIVE"} />
            </div>

            <div style={{ height: 12 }} />
            {!addr ? (
              <div className="small">Connect wallet to view your referral performance.</div>
            ) : !registered ? (
              <div className="small">You’re not registered yet. Register a referrer on the Dashboard to activate referrals.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <StatRow
                  label="Direct referrals"
                  value={directSafe == null ? directCount.toString() : Math.round(animatedDirect).toString()}
                  hint="Level 1"
                />
                <StatRow
                  label="Team size"
                  value={teamSafe == null ? teamCount.toString() : Math.round(animatedTeam).toString()}
                  hint="Total downline"
                />
                <div style={{ height: 2 }} />
                <StatRow label="Network rewards available" value={prettyNetAvail} hint={sym} />
                <StatRow label="Network reserve" value={prettyNetReserve} hint="included" />
              </div>
            )}
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 950, letterSpacing: ".2px" }}>Luxury + Honest</div>
              <div className="small" style={{ marginTop: 6 }}>
                All numbers displayed here are read from the contract through RPC. No backend.
              </div>
            </div>

            <button className="btn" onClick={refresh} disabled={!addr || loading} type="button" style={{ fontWeight: 950 }}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
