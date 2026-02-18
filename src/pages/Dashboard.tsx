// src/pages/Dashboard.tsx
// ============================================================================
// DollarDex — Dashboard page (MOBILE POLISHED)
// - DOES NOT render NavBar (AppLayout does)
// - Layout: Deposit RIGHT of Live Contract Stats (desktop), stacks on mobile
// - Mobile fixes: no overflow, grids stack, buttons/inputs full width on phone
// - Gold per-second accrual ring (TOTAL: Capital + Auto Tier ROI)
// - Wallet auto-sync (eth_accounts + chainId + listeners)
// ============================================================================

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sendTxProtected } from "../wallet/tx";
import { useLocation } from "react-router-dom";
import { BrowserProvider, Contract, JsonRpcProvider, Interface, formatUnits, parseUnits } from "ethers";

/** ========= Config ========= */
const RPC_URLS = (
  (import.meta as any).env?.VITE_BSC_RPC_URLS?.toString?.() ||
  (import.meta as any).env?.VITE_BSC_RPC?.toString?.() ||
  [
    "https://bsc-rpc.publicnode.com",
    "https://bsc-dataseed1.bnbchain.org",
    "https://bsc-dataseed2.bnbchain.org",
    "https://bsc-dataseed3.bnbchain.org",
    "https://bsc-dataseed4.bnbchain.org"
  ].join(",")
)
  .split(",")
  .map((s: string) => s.trim())
  .filter(Boolean);

const CONTRACT_ADDRESS = "0xd583327F81fA70d0f30A775dd7E0390B26E324cb";
const BSCSCAN_CONTRACT = `https://bscscan.com/address/${CONTRACT_ADDRESS}`;
const TELEGRAM_CHANNEL = "https://t.me/DollarDex_Community";
const TELEGRAM_COMMUNITY = "https://t.me/dollardex_public";

const BSCSCAN_TX = (tx: string) => `https://bscscan.com/tx/${tx}`;

const BSC_CHAIN_ID_DEC = 56;
const BSC_NETWORK = { name: "bsc", chainId: BSC_CHAIN_ID_DEC } as const;

// Lazy RPC with fallback (prevents “failed to detect network” + rate-limit crashes)
let _rpc: JsonRpcProvider | null = null;
let _rpcUrl: string | null = null;
async function getRpc(): Promise<JsonRpcProvider> {
  if (_rpc) return _rpc;

  let lastErr: any = null;

  for (const url of RPC_URLS) {
    try {
      const rpc = new JsonRpcProvider(url, BSC_NETWORK, {
        batchMaxCount: 1,
        batchStallTime: 0
      });

      // force a real call (and avoid auto-detect flakiness)
      const cid = await rpc.send("eth_chainId", []);
      const dec = typeof cid === "string" ? parseInt(cid, 16) : Number(cid);

      if (dec !== BSC_CHAIN_ID_DEC) {
        lastErr = new Error(`RPC ${url} returned chainId ${dec} (expected ${BSC_CHAIN_ID_DEC})`);
        continue;
      }

      _rpc = rpc;
      _rpcUrl = url;
      return _rpc;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }

  throw lastErr || new Error("No working BSC RPC endpoint available.");
}

function resetRpc() {
  _rpc = null;
  _rpcUrl = null;
}

// Serialize eth_getLogs (prevents provider overload / -32005 / BAD_DATA)
let _logsLock: Promise<any> = Promise.resolve();
function runLogsExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = _logsLock.then(fn, fn);
  _logsLock = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

/** ========= Utilities ========= */
function getEthereum(): any {
  return (window as any).ethereum;
}

function hasWallet() {
  return typeof (window as any).ethereum !== "undefined";
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

function timeAgo(tsSec: number) {
  const now = Math.floor(Date.now() / 1000);
  const d = Math.max(0, now - tsSec);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function shortAddr(a: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function fmtCountdown(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return "00:00:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function pctFromBps(bps: bigint, divider: bigint) {
  if (divider === 0n) return 0;
  return Number((bps * 10_000n) / divider) / 100;
}

function safePct(numer: bigint, denom: bigint) {
  if (denom <= 0n) return 0;
  const p = (numer * 10_000n) / denom;
  return Number(p) / 100;
}

function formatFixed(value: bigint, decimals: number, dp: number) {
  const s = formatUnits(value, decimals); // string
  const [i, f = ""] = s.split(".");
  const frac = (f + "0".repeat(dp)).slice(0, dp);
  const intWithSep = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dp > 0 ? `${intWithSep}.${frac}` : intWithSep;
}

const fmt2 = (v: bigint, dec: number) => formatFixed(v, dec, 2);
const fmt4 = (v: bigint, dec: number) => formatFixed(v, dec, 4);

function fmtPct1(num: bigint, den: bigint) {
  if (den <= 0n) return "0.0%";
  const x10 = (num * 1000n) / den; // 100.0% => 1000
  const whole = x10 / 10n;
  const frac = x10 % 10n;
  return `${whole.toString()}.${frac.toString()}%`;
}

/** ========= ABIs ========= */
const YF_ABI = [
  "function USDT() view returns(address)",
  "function launchDate() view returns(uint256)",
  "function totalRegisteredUsers() view returns(uint256)",
  "function totalActiveUsers() view returns(uint256)",
  "function totalDeposited() view returns(uint256)",
  "function totalWithdrawn() view returns(uint256)",

  "function CYCLE_DURATION() view returns(uint256)",
  "function MINIMUM_DEPOSIT() view returns(uint256)",
  "function MINIMUM_WITHDRAW() view returns(uint256)",
  "function ADMIN_FEE_PCT() view returns(uint256)",
  "function CAPITAL_DAILY_PCT() view returns(uint256)",
  "function PERCENTS_DIVIDER() view returns(uint256)",
  "function TIME_STEP() view returns(uint256)",
  "function MAX_POSITIONS() view returns(uint16)",
  "function ROI_DAILY_PCT(uint256) view returns(uint256)",
  "function ROI_THRESHOLDS(uint256) view returns(uint256)",

  "function usersExtra(address) view returns(uint256,uint256,uint256,uint256,uint256,uint256,uint32,uint32,uint32,uint8)",
  "function users(address) view returns(address,bool,uint256,uint256,uint256,uint256,uint256)",

  "function getDailyRewards(address) view returns(uint256,uint256)",
  "function getNetworkRewards(address) view returns(uint256,uint256)",
  "function getPositionCount(address) view returns(uint256)",
  "function getPosition(address,uint256) view returns(uint256,uint256,uint256,uint256,uint256,uint256,uint8,bool)",

  "function register(address)",
  "function deposit(uint256)",
  "function claimDailyReward(uint256)",
  "function compoundDailyReward(uint256)",
  "function claimNetworkReward(uint256)",
  "function compoundNetworkReward(uint256)"
];

const ERC20_ABI = [
  "function symbol() view returns(string)",
  "function decimals() view returns(uint8)",
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)"
];

/** ========= Types ========= */
type Toast = { type: "success" | "error" | "info"; title: string; msg?: string };
type DepositFeedRow = { user: string; amount: bigint; ts: number; tx: string; blockNumber: number };
type PositionRow = {
  index: number;
  amount: bigint;
  startTime: number;
  lastCheckpoint: number;
  endTime: number;
  earned: bigint;
  expected: bigint;
  source: number;
  active: boolean;
};

/** ========= UI Primitives ========= */
function SoftTooltip({ text }: { text: string }) {
  return (
    <span
      style={{
        marginLeft: 10,
        fontSize: 12,
        color: "rgba(255,255,255,.62)",
        border: "1px solid rgba(255,255,255,.10)",
        background: "rgba(255,255,255,.035)",
        padding: "7px 11px",
        borderRadius: 999,
        backdropFilter: "blur(10px)"
      }}
    >
      {text}
    </span>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  disabledReason,
  primary
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  disabledReason: string;
  primary?: boolean;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", width: "100%" }}>
      <button className={`btn ${primary ? "primary" : ""}`} onClick={onClick} disabled={disabled} type="button">
        {label}
      </button>
      {disabled ? <SoftTooltip text={disabledReason} /> : null}
    </div>
  );
}

/** Premium pink ring timer */
function CountdownRing({ label, remainingSec, totalSec }: { label: string; remainingSec: number; totalSec: number }) {
  const size = 58;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const progress = totalSec > 0 ? clamp01(1 - remainingSec / totalSec) : 1;
  const dash = c * progress;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(255,88,198,.95)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            style={{
              filter: "drop-shadow(0 0 14px rgba(255,88,198,.28))",
              transition: "stroke-dasharray .6s ease"
            }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            fontSize: 11,
            color: "rgba(255,255,255,.74)",
            userSelect: "none"
          }}
        >
          {Math.round(progress * 100)}%
        </div>
      </div>

      <div>
        <div className="small">{label}</div>
        <div style={{ fontWeight: 900, letterSpacing: ".3px" }}>{fmtCountdown(remainingSec)}</div>
      </div>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ minWidth: 160 }}>
      <div
        style={{
          height: 10,
          borderRadius: 999,
          background: "rgba(255,255,255,.08)",
          border: "1px solid rgba(255,255,255,.07)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            width: `${p}%`,
            height: "100%",
            borderRadius: 999,
            background: "linear-gradient(135deg, rgba(255,88,198,.95), rgba(255,140,225,.80), rgba(142,133,255,.75))",
            boxShadow: "0 0 22px rgba(255,88,198,.18)",
            transition: "width .6s ease"
          }}
        />
      </div>
      <div className="small" style={{ marginTop: 6 }}>
        {p.toFixed(1)}%
      </div>
    </div>
  );
}

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
      <div style={{ fontWeight: 900 }}>{value}</div>
    </div>
  );
}

/** ========= Smooth on-chain display ========= */
function useOnchainSmoothNumber(onchain: bigint, enabled: boolean) {
  const [display, setDisplay] = useState(onchain);
  const displayRef = useRef(onchain);

  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  useEffect(() => {
    if (!enabled) {
      setDisplay(onchain);
      displayRef.current = onchain;
      return;
    }
    const from = displayRef.current;
    const to = onchain;
    if (from === to) return;

    const start = performance.now();
    const dur = 550;
    const raf = { id: 0 };

    const tick = (t: number) => {
      const p = clamp01((t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      const diff = to - from;

      const step = BigInt(Math.round(Number(diff) * e));
      setDisplay(from + step);

      if (p < 1) raf.id = requestAnimationFrame(tick);
    };

    raf.id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.id);
  }, [onchain, enabled]);

  return display;
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

function LivePill({ active }: { active: boolean }) {
  const reduced = usePrefersReducedMotion();
  const pulseAnim = reduced ? undefined : { animation: "yfPulse 1.9s ease-in-out infinite" };
  const baseBg = active ? "rgba(255,88,198,.10)" : "rgba(255,255,255,.05)";
  const baseBorder = active ? "rgba(255,88,198,.22)" : "rgba(255,255,255,.09)";
  const dot = active ? "rgba(255,88,198,.95)" : "rgba(255,255,255,.35)";

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
          color: "rgba(255,255,255,.80)",
          fontSize: 12,
          fontWeight: 900,
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
        LIVE
      </span>
    </>
  );
}

/** Gold per-second accrual ring (precise) */
function GoldAccrualRing({
  label,
  nowSec,
  dailyAmount,
  decimals,
  symbol,
  size = 66,
  stroke = 7
}: {
  label: string;
  nowSec: number;
  dailyAmount: bigint;
  decimals: number;
  symbol: string;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const d = new Date(nowSec * 1000);
  const secondsToday = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  const pct = Math.max(0, Math.min(1, secondsToday / 86400));
  const dash = c * pct;

  const bps = BigInt(Math.round(pct * 10_000));
  const accruedToday = (dailyAmount * bps) / 10_000n;
  const prettyAccrued = `${formatUnits(accruedToday, decimals)} ${symbol}`;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(246,208,122,.95)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            style={{
              filter: "drop-shadow(0 0 18px rgba(246,208,122,.22))",
              transition: "stroke-dasharray .35s linear"
            }}
          />
        </svg>

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            fontSize: Math.max(10, Math.round(size * 0.16)),
            fontWeight: 900,
            color: "rgba(255,255,255,.78)",
            userSelect: "none"
          }}
        >
          {Math.round(pct * 100)}%
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <div className="small">{label}</div>
        <div style={{ fontWeight: 1000, letterSpacing: ".2px", wordBreak: "break-word" }}>{prettyAccrued}</div>
      </div>
    </div>
  );
}

function DollarDexLogo({ size = 28 }: { size?: number }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        aria-label="DollarDex"
        role="img"
        style={{
          filter: "drop-shadow(0 0 14px rgba(246,208,122,.18)) drop-shadow(0 0 26px rgba(255,88,198,.10))"
        }}
      >
        <defs>
          <linearGradient id="ddxGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,241,187,1)" />
            <stop offset="35%" stopColor="rgba(246,208,122,1)" />
            <stop offset="70%" stopColor="rgba(255,180,230,0.95)" />
            <stop offset="100%" stopColor="rgba(142,133,255,0.85)" />
          </linearGradient>

          <radialGradient id="ddxGlass" cx="30%" cy="22%" r="80%">
            <stop offset="0%" stopColor="rgba(255,255,255,.45)" />
            <stop offset="35%" stopColor="rgba(255,255,255,.12)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>

        <circle cx="32" cy="32" r="28" fill="rgba(255,255,255,.04)" />
        <circle cx="32" cy="32" r="26" fill="url(#ddxGold)" opacity="0.95" />
        <circle cx="32" cy="32" r="26" fill="url(#ddxGlass)" />

        <circle cx="32" cy="32" r="20" fill="rgba(0,0,0,.25)" />
        <circle cx="32" cy="32" r="19" fill="rgba(255,255,255,.05)" />

        <path
          d="M26 21h9.2c7.2 0 12.8 5.6 12.8 11s-5.6 11-12.8 11H26V21zm6.4 6v16h2.8c4.1 0 7.2-3.6 7.2-8s-3.1-8-7.2-8h-2.8z"
          fill="rgba(0,0,0,.78)"
          opacity="0.88"
        />
        <path d="M18.8 27.2l4.1-4.1 22.3 22.3-4.1 4.1L18.8 27.2z" fill="rgba(0,0,0,.65)" opacity="0.7" />
        <path d="M41.1 23.1l4.1 4.1-22.3 22.3-4.1-4.1 22.3-22.3z" fill="rgba(0,0,0,.65)" opacity="0.7" />
      </svg>

      <div style={{ lineHeight: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 18,
            fontWeight: 1000,
            letterSpacing: "-0.03em",
            background:
              "linear-gradient(90deg, rgba(255,241,187,1), rgba(246,208,122,1), rgba(255,88,198,.9), rgba(142,133,255,.85))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: "drop-shadow(0 0 18px rgba(246,208,122,.10))"
          }}
        >
          DollarDex
        </div>
        <div className="small" style={{ opacity: 0.72, marginTop: 2 }}>
          Premium DeFi
        </div>
      </div>
    </div>
  );
}

/** ========= Main ========= */
export default function Dashboard() {
  const location = useLocation();

  // /app should scroll to dashboard section
  useEffect(() => {
    if (location.pathname !== "/app") return;
    const t = window.setTimeout(() => scrollToId("yf-compound"), 120);
    return () => window.clearTimeout(t);
  }, [location.pathname]);

  /** ===== Toasts ===== */
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = (type: Toast["type"], title: string, msg?: string) => {
    setToasts((t) => [...t, { type, title, msg }]);
    window.setTimeout(() => setToasts((t) => t.slice(1)), 3200);
  };

  /** ===== Live Deposit Feed ===== */
  const [depositFeed, setDepositFeed] = useState<DepositFeedRow[]>([]);
  const [feedMsg, setFeedMsg] = useState<string>("Loading latest deposits from on-chain events…");
  const [feedLoading, setFeedLoading] = useState(false);
  const lastFeedBlockRef = useRef<number>(0);

  const depositIface = useMemo(() => new Interface(["event Deposit(address indexed user, uint256 amount, uint256 timestamp)"]), []);

  function parseDepositLogs(logs: any[]): DepositFeedRow[] {
    const out: DepositFeedRow[] = [];
    for (const lg of logs) {
      const parsed = depositIface.parseLog(lg);
      if (!parsed) continue;
      out.push({
        user: String((parsed as any).args.user),
        amount: BigInt((parsed as any).args.amount),
        ts: Number((parsed as any).args.timestamp),
        tx: lg.transactionHash,
        blockNumber: lg.blockNumber
      });
    }
    return out.sort((a, b) => b.ts - a.ts);
  }

  async function getDepositLogs(fromBlock: number, toBlock: number) {
    try {
      const ev = depositIface.getEvent("Deposit");
      const topic0 = ev?.topicHash;
      if (!topic0) return [];

      return await runLogsExclusive(async () => {
        const p = await getRpc();
        return await p.getLogs({
          address: CONTRACT_ADDRESS,
          fromBlock,
          toBlock,
          topics: [topic0]
        });
      });
    } catch {
      resetRpc();
      return [];
    }
  }

  async function bootstrapDepositFeed(latest: number) {
    const ranges = [1200, 2500, 5000, 9000, 15000];
    for (const span of ranges) {
      const from = Math.max(0, latest - span);
      const logs = await getDepositLogs(from, latest);
      const rows = parseDepositLogs(logs).slice(0, 18);
      if (rows.length > 0) {
        setDepositFeed(rows);
        setFeedMsg("");
        lastFeedBlockRef.current = latest;
        return;
      }
    }
    setDepositFeed([]);
    setFeedMsg("No data currently available.");
    lastFeedBlockRef.current = latest;
  }

  async function refreshDepositFeed() {
    if (feedLoading) return;
    setFeedLoading(true);
    try {
      const latest = await (await getRpc()).getBlockNumber();

      if (!lastFeedBlockRef.current) {
        await bootstrapDepositFeed(latest);
        return;
      }

      const from = lastFeedBlockRef.current + 1;
      const to = latest;

      if (to <= from) {
        if (depositFeed.length === 0) setFeedMsg("No data currently available.");
        return;
      }

      const MAX_INCREMENT = 2000;
      const safeFrom = Math.max(from, to - MAX_INCREMENT);

      const logs = await getDepositLogs(safeFrom, to);
      const newRows = parseDepositLogs(logs);

      if (newRows.length > 0) {
        setDepositFeed((prev) => {
          const merged = [...newRows, ...prev];
          const seen = new Set<string>();
          const out: DepositFeedRow[] = [];
          for (const r of merged) {
            const k = `${r.tx}-${r.blockNumber}`;
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(r);
            if (out.length >= 18) break;
          }
          return out;
        });
        setFeedMsg("");
      } else {
        if (depositFeed.length === 0) setFeedMsg("No data currently available.");
      }

      lastFeedBlockRef.current = latest;
    } finally {
      setFeedLoading(false);
    }
  }

  useEffect(() => {
    // Launch-safe: load once on page open (no polling to avoid eth_getLogs rate-limits)
    refreshDepositFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ===== Clock ===== */
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const i = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(i);
  }, []);

  /** ===== Wallet / chain (auto-sync) ===== */
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
      toast("error", "Connect failed", e?.message || "Could not connect wallet.");
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
  }, []);

  /** ===== On-chain constants & stats ===== */
  const [usdtAddr, setUsdtAddr] = useState("");
  const [dec, setDec] = useState(18);
  const [sym, setSym] = useState("USDT");

  const [cycleDays, setCycleDays] = useState(50n);
  const [minDeposit, setMinDeposit] = useState(0n);
  const [minWithdraw, setMinWithdraw] = useState(0n);
  const [adminFeePct, setAdminFeePct] = useState(400n);
  const [capitalDailyPct, setCapitalDailyPct] = useState(200n);
  const [divider, setDivider] = useState(10_000n);
  const [timeStep, setTimeStep] = useState(86400n);
  const [maxPositions, setMaxPositions] = useState(100n);
  const [roiDaily, setRoiDaily] = useState<bigint[]>([]);
  const [roiThresholds, setRoiThresholds] = useState<bigint[]>([]);

  const [launchDate, setLaunchDate] = useState(0n);
  const [totalUsers, setTotalUsers] = useState(0n);
  const [activeUsers, setActiveUsers] = useState(0n);
  const [totalDeposited, setTotalDeposited] = useState(0n);
  const [totalWithdrawn, setTotalWithdrawn] = useState(0n);
  const [contractUsdtBal, setContractUsdtBal] = useState(0n);

  // User state
  const [registered, setRegistered] = useState(false);
  const [referrer, setReferrer] = useState("");
  const [myActiveDeposit, setMyActiveDeposit] = useState(0n);
  const [myTotalDeposit, setMyTotalDeposit] = useState(0n);
  const [myTotalWithdrawn, setMyTotalWithdrawn] = useState(0n);

  const [dailyAvail, setDailyAvail] = useState(0n);
  const [dailyReserve, setDailyReserve] = useState(0n);
  const [netAvail, setNetAvail] = useState(0n);
  const [netReserve, setNetReserve] = useState(0n);

  const [positions, setPositions] = useState<PositionRow[]>([]);

  const [refInput, setRefInput] = useState("");
  const [depositInput, setDepositInput] = useState("");
  const [dailyActionAmount, setDailyActionAmount] = useState("");
  const [netActionAmount, setNetActionAmount] = useState("");

  const [yfRead, setYfRead] = useState<Contract | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await getRpc();
        setYfRead(new Contract(CONTRACT_ADDRESS, YF_ABI, p));
      } catch {
        setYfRead(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function yfWrite() {
    if (!hasWallet()) throw new Error("No wallet detected");
    const bp = new BrowserProvider(getEthereum());
    const signer = await bp.getSigner();
    return new Contract(CONTRACT_ADDRESS, YF_ABI, signer);
  }

  async function usdtWrite() {
    if (!hasWallet()) throw new Error("No wallet detected");
    if (!usdtAddr) throw new Error("USDT not loaded yet");
    const bp = new BrowserProvider(getEthereum());
    const signer = await bp.getSigner();
    return new Contract(usdtAddr, ERC20_ABI, signer);
  }

  async function refreshAll() {
    try {
      const c = yfRead;
      if (!c) return;

      const [
        _usdt,
        _launch,
        _totalUsers,
        _activeUsers,
        _totalDep,
        _totalW,
        _cycleDays,
        _minDep,
        _minW,
        _adminFeePct,
        _capitalDailyPct,
        _divider,
        _timeStep,
        _maxPos
      ] = await Promise.all([
        c.USDT(),
        c.launchDate(),
        c.totalRegisteredUsers(),
        c.totalActiveUsers(),
        c.totalDeposited(),
        c.totalWithdrawn(),
        c.CYCLE_DURATION(),
        c.MINIMUM_DEPOSIT(),
        c.MINIMUM_WITHDRAW(),
        c.ADMIN_FEE_PCT(),
        c.CAPITAL_DAILY_PCT(),
        c.PERCENTS_DIVIDER(),
        c.TIME_STEP(),
        c.MAX_POSITIONS()
      ]);

      setUsdtAddr(_usdt);
      setLaunchDate(_launch);
      setTotalUsers(_totalUsers);
      setActiveUsers(_activeUsers);
      setTotalDeposited(_totalDep);
      setTotalWithdrawn(_totalW);
      setCycleDays(_cycleDays);
      setMinDeposit(_minDep);
      setMinWithdraw(_minW);
      setAdminFeePct(_adminFeePct);
      setCapitalDailyPct(_capitalDailyPct);
      setDivider(_divider);
      setTimeStep(_timeStep);
      setMaxPositions(BigInt(_maxPos));

      const erc = new Contract(_usdt, ERC20_ABI, await getRpc());
      const [d, s, cb] = await Promise.all([erc.decimals(), erc.symbol(), erc.balanceOf(CONTRACT_ADDRESS)]);
      setDec(Number(d));
      setSym(String(s));
      setContractUsdtBal(cb);

      try {
        const roi = await Promise.all([0, 1, 2, 3, 4].map((i) => c.ROI_DAILY_PCT(i)));
        setRoiDaily(roi.map((x: any) => BigInt(x)));
      } catch {
        setRoiDaily([]);
      }

      try {
        const th = await Promise.all([0, 1, 2, 3, 4].map((i) => c.ROI_THRESHOLDS(i)));
        setRoiThresholds(th.map((x: any) => BigInt(x)));
      } catch {
        setRoiThresholds([]);
      }

      if (addr) {
        const u = await c.users(addr);
        setReferrer(u[0]);
        setRegistered(Boolean(u[1]));
        setMyActiveDeposit(u[2]);
        setMyTotalDeposit(u[5]);
        setMyTotalWithdrawn(u[6]);

        const [dR, nR, count] = await Promise.all([c.getDailyRewards(addr), c.getNetworkRewards(addr), c.getPositionCount(addr)]);

        setDailyAvail(dR[0]);
        setDailyReserve(dR[1]);
        setNetAvail(nR[0]);
        setNetReserve(nR[1]);

        const countN = Number(count);
        if (countN > 0) {
          const rows = await Promise.all(Array.from({ length: countN }, (_, i) => c.getPosition(addr, i)));
          setPositions(
            rows.map((r: any, i: number) => ({
              index: i,
              amount: BigInt(r[0]),
              startTime: Number(r[1]),
              lastCheckpoint: Number(r[2]),
              endTime: Number(r[3]),
              earned: BigInt(r[4]),
              expected: BigInt(r[5]),
              source: Number(r[6]),
              active: Boolean(r[7])
            }))
          );
        } else {
          setPositions([]);
        }
      } else {
        setRegistered(false);
        setReferrer("");
        setMyActiveDeposit(0n);
        setMyTotalDeposit(0n);
        setMyTotalWithdrawn(0n);
        setDailyAvail(0n);
        setDailyReserve(0n);
        setNetAvail(0n);
        setNetReserve(0n);
        setPositions([]);
      }
    } catch (e: any) {
      console.error(e);
      const msg =
        e?.shortMessage ||
        e?.info?.error?.message ||
        e?.reason ||
        e?.message ||
        "Try again.";

      toast("error", "Failed to load on-chain data", String(msg).slice(0, 140));
    }
  }

  useEffect(() => {
    if (!yfRead) return;
    refreshAll();
    const t = window.setInterval(refreshAll, 30_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr, yfRead]);

  async function runTx(label: string, makeTx: () => Promise<any>) {
    try {
      toast("info", "Transaction sent", label);
      const tx = await makeTx();
      await tx.wait();
      toast("success", "Confirmed", label);
      await refreshAll();
      window.setTimeout(() => refreshDepositFeed(), 1500);
    } catch (e: any) {
      toast("error", "Transaction failed", e?.message || label);
    }
  }

  async function onRegister() {
    if (!addr) return toast("error", "Connect wallet first");
    if (!chainOk) return toast("error", "Wrong network", "Switch to BSC Mainnet.");
    if (!refInput || !refInput.startsWith("0x") || refInput.length !== 42) {
      return toast("error", "Invalid referrer", "Paste a valid 0x… address.");
    }

    const c = await yfWrite();
    await runTx("Register", () =>
      sendTxProtected(c, "register", [refInput], {}, { preflight: true, gasBuffer: 1.2, fallbackGasLimit: 350_000n })
    );
  }

  async function onDeposit() {
    if (!addr) return toast("error", "Connect wallet first");
    if (!chainOk) return toast("error", "Wrong network", "Switch to BSC Mainnet.");
    if (!registered) return toast("error", "Register first", "You must register a referrer before depositing.");
    if (!depositInput) return toast("error", "Enter deposit amount");

    const amount = parseUnits(depositInput, dec);
    if (amount < minDeposit) return toast("error", "Under minimum", `Minimum deposit is ${formatUnits(minDeposit, dec)} ${sym}`);
    if (positions.length >= Number(maxPositions)) {
      return toast("error", "Max positions reached", `Maximum positions: ${maxPositions.toString()}`);
    }

    const ercR = new Contract(usdtAddr, ERC20_ABI, await getRpc());
    const allowance: bigint = await ercR.allowance(addr, CONTRACT_ADDRESS);

    if (allowance < amount) {
      const ercW = await usdtWrite();
      await runTx("Approve USDT", () =>
        sendTxProtected(
          ercW,
          "approve",
          [CONTRACT_ADDRESS, amount],
          {},
          { preflight: true, gasBuffer: 1.15, fallbackGasLimit: 120_000n }
        )
      );
    }

    const c = await yfWrite();
    await runTx("Deposit (new position starts instantly)", () =>
      sendTxProtected(c, "deposit", [amount], {}, { preflight: true, gasBuffer: 1.25, fallbackGasLimit: 900_000n })
    );

    setDepositInput("");
  }

  function parseOptionalAmountOrZero(input: string) {
    const t = (input || "").trim();
    if (!t) return 0n;
    try {
      return parseUnits(t, dec);
    } catch {
      toast("error", "Invalid amount", "Use a plain number like 25 or 25.5");
      return 0n;
    }
  }

  async function onClaimDaily() {
    if (!addr) return toast("error", "Connect wallet first");
    if (!chainOk) return toast("error", "Wrong network", "Switch to BSC Mainnet.");
    if (!registered) return toast("error", "Register first");
    if (dailyAvail <= 0n) return toast("error", "No daily rewards available yet");

    const amt = parseOptionalAmountOrZero(dailyActionAmount);
    if (amt !== 0n && amt < minWithdraw) {
      return toast("error", "Under minimum", `Minimum claim is ${formatUnits(minWithdraw, dec)} ${sym}`);
    }

    const c = await yfWrite();
    await runTx("Claim Daily", () =>
      sendTxProtected(c, "claimDailyReward", [amt], {}, { preflight: true, gasBuffer: 1.2, fallbackGasLimit: 350_000n })
    );

    setDailyActionAmount("");
  }

  async function onCompoundDaily() {
    if (!addr) return toast("error", "Connect wallet first");
    if (!chainOk) return toast("error", "Wrong network", "Switch to BSC Mainnet.");
    if (!registered) return toast("error", "Register first");
    if (dailyAvail <= 0n) return toast("error", "No daily rewards available yet");
    if (positions.length >= Number(maxPositions)) return toast("error", "Max positions reached");

    const amt = parseOptionalAmountOrZero(dailyActionAmount);
    if (amt !== 0n && amt < minDeposit) {
      return toast("error", "Under minimum", `Minimum compound is ${formatUnits(minDeposit, dec)} ${sym}`);
    }

    const c = await yfWrite();
    await runTx("Compound Daily (creates a new position)", () =>
      sendTxProtected(c, "compoundDailyReward", [amt], {}, { preflight: true, gasBuffer: 1.25, fallbackGasLimit: 650_000n })
    );

    setDailyActionAmount("");
  }

  async function onClaimNetwork() {
    if (!addr) return toast("error", "Connect wallet first");
    if (!chainOk) return toast("error", "Wrong network", "Switch to BSC Mainnet.");
    if (!registered) return toast("error", "Register first");
    if (netAvail <= 0n) return toast("error", "No network rewards available yet");

    const amt = parseOptionalAmountOrZero(netActionAmount);
    if (amt !== 0n && amt < minWithdraw) {
      return toast("error", "Under minimum", `Minimum claim is ${formatUnits(minWithdraw, dec)} ${sym}`);
    }

    const c = await yfWrite();
    await runTx("Claim Network", () =>
      sendTxProtected(c, "claimNetworkReward", [amt], {}, { preflight: true, gasBuffer: 1.2, fallbackGasLimit: 350_000n })
    );

    setNetActionAmount("");
  }

  async function onCompoundNetwork() {
    if (!addr) return toast("error", "Connect wallet first");
    if (!chainOk) return toast("error", "Wrong network", "Switch to BSC Mainnet.");
    if (!registered) return toast("error", "Register first");
    if (netAvail <= 0n) return toast("error", "No network rewards available yet");
    if (positions.length >= Number(maxPositions)) return toast("error", "Max positions reached");

    const amt = parseOptionalAmountOrZero(netActionAmount);
    if (amt !== 0n && amt < minDeposit) {
      return toast("error", "Under minimum", `Minimum compound is ${formatUnits(minDeposit, dec)} ${sym}`);
    }

    const c = await yfWrite();
    await runTx("Compound Network (creates a new position)", () =>
      sendTxProtected(c, "compoundNetworkReward", [amt], {}, { preflight: true, gasBuffer: 1.25, fallbackGasLimit: 650_000n })
    );

    setNetActionAmount("");
  }

  /** ===== Next daily unlock timer (pink ring) ===== */
  const nextDailyUnlockSec = useMemo(() => {
    const active = positions.filter((p) => p.active && now < p.endTime);
    if (active.length === 0) return null;

    const step = Number(timeStep || 86400n);
    let best = Infinity;

    for (const p of active) {
      const effectiveNow = Math.min(now, p.endTime);
      const elapsed = Math.max(0, effectiveNow - p.startTime);

      const daysPassed = Math.floor(elapsed / step);
      const windowStart = p.startTime + daysPassed * step;
      const nextUnlock = windowStart + step;

      const rem = Math.max(0, nextUnlock - now);
      if (rem < best) best = rem;
    }

    return Number.isFinite(best) ? best : null;
  }, [positions, now, timeStep]);

  /** ===== Derived values ===== */
  const smoothDaily = useOnchainSmoothNumber(dailyAvail, Boolean(addr && registered && chainOk));
  const smoothNet = useOnchainSmoothNumber(netAvail, Boolean(addr && registered && chainOk));

  const prettyAdminFee = `${pctFromBps(adminFeePct, divider).toFixed(2)}%`;
  const prettyCapitalDaily = `${pctFromBps(capitalDailyPct, divider).toFixed(2)}%`;

  /** ===== AUTO tier ===== */
  const tierIndex = useMemo(() => {
    if (!roiThresholds?.length || !roiDaily?.length) return 0;
    let idx = 0;
    for (let i = 0; i < roiThresholds.length; i++) {
      if (myActiveDeposit >= roiThresholds[i]) idx = i;
    }
    return idx;
  }, [myActiveDeposit, roiThresholds, roiDaily]);

  const tierDailyPct = useMemo(() => roiDaily?.[tierIndex] ?? 0n, [roiDaily, tierIndex]);

  const totalDailyProjection = useMemo(() => {
    const totalPct = capitalDailyPct + tierDailyPct;
    if (divider <= 0n) return 0n;
    return (myActiveDeposit * totalPct) / divider;
  }, [myActiveDeposit, capitalDailyPct, tierDailyPct, divider]);

  const reasonNeedWallet = "Connect wallet";
  const reasonWrongNet = "Switch to BSC Mainnet";
  const reasonNeedRegister = "Register first";
  const reasonNoRewards = "No rewards yet";
  const reasonMinClaim = `Min claim ${minWithdraw ? `${formatUnits(minWithdraw, dec)} ${sym}` : ""}`.trim();
  const reasonMaxPos = "Max positions reached";

  // ✅ FIX 1: dailyDisabledReason existed in UI but missing in code → added
  const dailyDisabledReason =
    !addr
      ? reasonNeedWallet
      : !chainOk
        ? reasonWrongNet
        : !registered
          ? reasonNeedRegister
          : dailyAvail <= 0n
            ? reasonNoRewards
            : (minWithdraw > 0n && dailyAvail < minWithdraw)
              ? reasonMinClaim
              : "";

  const dailyCompoundDisabledReason =
    !addr
      ? reasonNeedWallet
      : !chainOk
        ? reasonWrongNet
        : !registered
          ? reasonNeedRegister
          : dailyAvail <= 0n
            ? reasonNoRewards
            : dailyAvail < minDeposit
              ? `Min compound ${formatUnits(minDeposit, dec)} ${sym}`
              : positions.length >= Number(maxPositions)
                ? reasonMaxPos
                : "";

  // ✅ FIX 2: netDisabledReason used but missing in your pasted file → added
  const netDisabledReason =
    !addr
      ? reasonNeedWallet
      : !chainOk
        ? reasonWrongNet
        : !registered
          ? reasonNeedRegister
          : netAvail <= 0n
            ? reasonNoRewards
            : (minWithdraw > 0n && netAvail < minWithdraw)
              ? reasonMinClaim
              : "";

  // ✅ FIX 3: netCompoundDisabledReason for tooltips + correct minimum deposit logic
  const netCompoundDisabledReason =
    !addr
      ? reasonNeedWallet
      : !chainOk
        ? reasonWrongNet
        : !registered
          ? reasonNeedRegister
          : netAvail <= 0n
            ? reasonNoRewards
            : netAvail < minDeposit
              ? `Min compound ${formatUnits(minDeposit, dec)} ${sym}`
              : positions.length >= Number(maxPositions)
                ? reasonMaxPos
                : "";

  const liveActive = Boolean(addr && registered && chainOk);

  const activePositionsCount = useMemo(() => positions.filter((p) => p.active && now < p.endTime).length, [positions, now]);

  const positionsEarnedSum = useMemo(() => positions.reduce((s, p) => s + p.earned, 0n), [positions]);
  const positionsExpectedSum = useMemo(() => positions.reduce((s, p) => s + p.expected, 0n), [positions]);
  const positionsAmountSum = useMemo(() => positions.reduce((s, p) => s + p.amount, 0n), [positions]);

  const myTotalRewardsAvailable = useMemo(() => dailyAvail + netAvail, [dailyAvail, netAvail]);

  const myProgressPct = useMemo(() => {
    if (positionsExpectedSum <= 0n) return 0;
    return safePct(positionsEarnedSum, positionsExpectedSum);
  }, [positionsEarnedSum, positionsExpectedSum]);

  const slotsUsedPct = useMemo(() => {
    const max = Number(maxPositions || 0n);
    if (!max) return 0;
    return (positions.length / max) * 100;
  }, [positions.length, maxPositions]);

  const protocolPayoutPct = useMemo(() => {
    if (totalDeposited <= 0n) return 0;
    return safePct(totalWithdrawn, totalDeposited);
  }, [totalWithdrawn, totalDeposited]);

  const contractCoveragePct = useMemo(() => {
    if (totalDeposited <= 0n) return 0;
    return safePct(contractUsdtBal, totalDeposited);
  }, [contractUsdtBal, totalDeposited]);

  const mySharePct = useMemo(() => {
    if (totalDeposited <= 0n) return 0;
    return safePct(myActiveDeposit, totalDeposited);
  }, [myActiveDeposit, totalDeposited]);

  const baseDailyProjection = useMemo(() => {
    if (divider <= 0n) return 0n;
    return (myActiveDeposit * capitalDailyPct) / divider;
  }, [myActiveDeposit, capitalDailyPct, divider]);

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

      {/* DASHBOARD */}
      <div id="yf-home" className="wrap" style={{ paddingTop: 24, paddingBottom: 18 }}>
        <style>
          {`
            @keyframes ddxGlowFloat {
              0% { transform: translateY(0); filter: drop-shadow(0 0 0 rgba(255,88,198,0)); }
              45% { transform: translateY(-1px); filter: drop-shadow(0 0 16px rgba(255,88,198,.18)); }
              100% { transform: translateY(0); filter: drop-shadow(0 0 0 rgba(255,88,198,0)); }
            }

            @keyframes ddxSheen {
              0% { background-position: 0% 50%; }
              100% { background-position: 100% 50%; }
            }

            .ddx-topbar {
              display: flex;
              gap: 14px;
              flex-wrap: wrap;
              align-items: center;
              justify-content: space-between;
            }

            .ddx-logo {
              display: inline-flex;
              align-items: center;
              gap: 10px;
              padding: 10px 12px;
              border-radius: 16px;
              border: 1px solid rgba(255,255,255,.10);
              background:
                radial-gradient(circle at 20% 10%, rgba(255,90,210,.18), rgba(0,0,0,0) 55%),
                radial-gradient(circle at 85% 0%, rgba(90,120,255,.16), rgba(0,0,0,0) 55%),
                rgba(255,255,255,.03);
              backdrop-filter: blur(12px);
              animation: ddxGlowFloat 2.4s ease-in-out infinite;
            }

            .ddx-actions {
              display: inline-flex;
              gap: 10px;
              flex-wrap: wrap;
              align-items: center;
              justify-content: flex-end;
            }

            .ddx-tgBtn {
              display: inline-flex;
              align-items: center;
              gap: 10px;
              padding: 11px 14px;
              border-radius: 14px;
              border: 1px solid rgba(255,255,255,.12);
              background: rgba(255,255,255,.04);
              color: rgba(255,255,255,.92);
              text-decoration: none;
              font-weight: 950;
              letter-spacing: .15px;
              backdrop-filter: blur(12px);
              transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
            }
            .ddx-tgBtn:hover {
              transform: translateY(-1px);
              border-color: rgba(246,208,122,.22);
              box-shadow: 0 0 28px rgba(255,88,198,.12);
            }

            .ddx-tgIcon {
              width: 18px;
              height: 18px;
              opacity: .92;
              filter: drop-shadow(0 0 10px rgba(142,133,255,.10));
            }

            .ddx-metaRow {
              display: inline-flex;
              align-items: center;
              gap: 10px;
              flex-wrap: wrap;
              min-width: 0;
            }

            /* ✅ Right side cards (stats + deposit + quick actions) */
            .ddx-rightGrid{
              display:grid;
              gap:12px;
              align-items:start;
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            @media (max-width: 820px){
              .ddx-rightGrid{ grid-template-columns: 1fr; }
            }

            /* ✅ Stack main 3 cards on mobile (Overview / Daily / Network) */
            @media (max-width: 980px){
              .grid.grid-3{ grid-template-columns: 1fr !important; }
            }

            /* ✅ Tables: smooth horizontal scroll */
            .table-wrap{
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
            }

            /* ✅ Mobile: topbar becomes vertical + full width buttons */
            @media (max-width: 640px){
              .ddx-topbar{ flex-direction: column; align-items: stretch; }
              .ddx-actions{ justify-content: flex-start; width: 100%; }
              .ddx-tgBtn{ width: 100%; justify-content: center; }
            }

            /* ✅ Very small phones: inputs & buttons full width */
            @media (max-width: 520px){
              input{ width: 100% !important; }
              .btn{ width: 100%; justify-content: center; }
            }
          `}
        </style>

        <div className="card">
          <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* LEFT */}
            <div style={{ flex: "1 1 560px", minWidth: 0 }}>
              <div className="ddx-topbar">
                <div className="ddx-metaRow">
                  <div className="ddx-logo">
                    <DollarDexLogo size={30} />
                  </div>

                  <span className="chip">Instant position start</span>
                  <span className="chip">Contract-truth rewards</span>
                  <span className="chip">{sym}</span>
                </div>

                <div className="ddx-actions">
                  <a className="ddx-tgBtn" href={TELEGRAM_COMMUNITY} target="_blank" rel="noreferrer">
                    <svg className="ddx-tgIcon" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M9.7 15.6l-.4 5.2c.6 0 .9-.3 1.2-.6l2.9-2.8 6 4.4c1.1.6 1.9.3 2.2-1l3.9-18.2c.4-1.7-.6-2.4-1.7-2L1.5 9.7c-1.6.6-1.6 1.5-.3 1.9l6.1 1.9L19.7 6.2c.7-.4 1.3-.2.8.3"
                      />
                    </svg>
                    Community
                  </a>

                  <a className="ddx-tgBtn" href={TELEGRAM_CHANNEL} target="_blank" rel="noreferrer">
                    <svg className="ddx-tgIcon" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M9.7 15.6l-.4 5.2c.6 0 .9-.3 1.2-.6l2.9-2.8 6 4.4c1.1.6 1.9.3 2.2-1l3.9-18.2c.4-1.7-.6-2.4-1.7-2L1.5 9.7c-1.6.6-1.6 1.5-.3 1.9l6.1 1.9L19.7 6.2c.7-.4 1.3-.2.8.3"
                      />
                    </svg>
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
                </div>
              </div>

              <h1 style={{ marginTop: 14 }}>Earn daily. Grow with confidence.</h1>
              <p style={{ marginTop: 10, color: "var(--muted)" as any }}>
                Every deposit creates a new position instantly. Rewards and progress are loaded from the contract — clean, honest, and real.
              </p>

              <div className="small" style={{ marginTop: 16 }}>
                Min deposit{" "}
                <b style={{ color: "var(--text)" as any }}>{minDeposit ? `${formatUnits(minDeposit, dec)} ${sym}` : "—"}</b> · Min claim{" "}
                <b style={{ color: "var(--text)" as any }}>{minWithdraw ? `${formatUnits(minWithdraw, dec)} ${sym}` : "—"}</b> · Admin fee{" "}
                <b style={{ color: "var(--text)" as any }}>{prettyAdminFee}</b> · Cycle{" "}
                <b style={{ color: "var(--text)" as any }}>{cycleDays.toString()} days</b> · Max positions{" "}
                <b style={{ color: "var(--text)" as any }}>{maxPositions.toString()}</b>
              </div>

              {!chainOk && addr ? (
                <div className="card" style={{ marginTop: 14 }}>
                  <b>Wrong network</b>
                  <div className="small" style={{ marginTop: 6 }}>
                    Please switch your wallet to <b>BSC Mainnet</b> (chainId 56).
                  </div>
                </div>
              ) : null}

              <div className="card" style={{ marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="small" style={{ letterSpacing: ".22em", textTransform: "uppercase" }}>
                      Accrual (Today)
                    </div>
                    <div style={{ marginTop: 8, fontWeight: 1000 }}>
                      Total daily projection: {formatUnits(totalDailyProjection, dec)} {sym}
                    </div>
                    <div className="small" style={{ marginTop: 6 }}>
                      Per-second accurate from midnight → now (Capital + Auto Tier ROI).
                    </div>
                  </div>

                  <GoldAccrualRing label="Accrued today" nowSec={now} dailyAmount={totalDailyProjection} decimals={dec} symbol={sym} />
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <div className="small">Daily structure</div>
                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span className="chip">
                    Base <b style={{ marginLeft: 6, color: "var(--text)" as any }}>{prettyCapitalDaily}</b>
                  </span>
                  {roiDaily.length ? (
                    roiDaily.map((x, i) => (
                      <span key={i} className="chip">
                        Tier {i + 1}: +<b style={{ marginLeft: 4, color: "var(--text)" as any }}>{pctFromBps(x, divider).toFixed(2)}%</b>
                        {roiThresholds[i] !== undefined ? (
                          <span className="small" style={{ marginLeft: 8 }}>
                            (≥ {formatUnits(roiThresholds[i], dec)} {sym})
                          </span>
                        ) : null}
                      </span>
                    ))
                  ) : (
                    <span className="chip">Loading tiers…</span>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT */}
            <div style={{ flex: "1 1 680px", minWidth: 0 }}>
              <div className="ddx-rightGrid">
                {/* Live Contract Stats */}
                <div className="card" style={{ padding: 16 }}>
                  <h3 style={{ marginBottom: 10 }}>Live Contract Stats</h3>

                  <div className="small" style={{ marginTop: 8 }}>
                    Launch:{" "}
                    <b style={{ color: "var(--text)" as any }}>
                      {launchDate > 0n ? new Date(Number(launchDate) * 1000).toLocaleString() : "—"}
                    </b>
                  </div>

                  <div style={{ height: 12 }} />

                  <div style={{ display: "grid", gap: 12 }}>
                    <StatRow label="Registered users" value={totalUsers.toString()} />
                    <StatRow label="Active users" value={activeUsers.toString()} />
                    <div style={{ height: 2 }} />
                    <StatRow label="Total deposited" value={<span>{formatUnits(totalDeposited, dec)} {sym}</span>} />
                    <StatRow label="Total withdrawn" value={<span>{formatUnits(totalWithdrawn, dec)} {sym}</span>} />
                    <div style={{ height: 2 }} />
                    <StatRow
                      label="Contract balance"
                      value={<span>{formatUnits(contractUsdtBal, dec)} {sym}</span>}
                      hint={`${contractCoveragePct.toFixed(2)}% coverage`}
                    />
                  </div>

                  <div style={{ height: 14 }} />

                  <a
                    className="chip"
                    href={BSCSCAN_CONTRACT}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontWeight: 900, textDecoration: "none" }}
                  >
                    <span className="dot" /> View Contract on BscScan
                  </a>
                </div>

                {/* Deposit */}
                <div className="card" style={{ padding: 16 }}>
                  <h3>Deposit</h3>

                  {!addr ? (
                    <>
                      <div className="small">Connect your wallet to register and deposit.</div>
                      <div style={{ height: 10 }} />
                      <ActionButton label="Connect Wallet" onClick={connect} disabled={false} disabledReason="" primary />
                    </>
                  ) : !registered ? (
                    <>
                      <div className="small">Register your referrer first (required).</div>
                      <div style={{ height: 12 }} />
                      <input value={refInput} onChange={(e) => setRefInput(e.target.value)} placeholder="Referrer address (0x...)" />
                      <div style={{ height: 10 }} />
                      <ActionButton label="Register" onClick={onRegister} disabled={!chainOk} disabledReason={reasonWrongNet} primary />
                    </>
                  ) : (
                    <>
                      <div className="small">
                        Referrer: <span className="mono">{referrer ? shortAddr(referrer) : "—"}</span>
                      </div>

                      <div style={{ height: 12 }} />

                      <div className="small">Amount in {sym}</div>
                      <input
                        value={depositInput}
                        onChange={(e) => setDepositInput(e.target.value)}
                        placeholder={`Min ${minDeposit ? formatUnits(minDeposit, dec) : "0"} ${sym}`}
                      />

                      <div style={{ height: 10 }} />

                      <ActionButton
                        label="Approve + Deposit"
                        onClick={onDeposit}
                        disabled={!chainOk || !depositInput}
                        disabledReason={!chainOk ? reasonWrongNet : "Enter amount"}
                        primary
                      />

                      <div className="small" style={{ marginTop: 10 }}>
                        Admin fee: <b style={{ color: "var(--text)" as any }}>{prettyAdminFee}</b> · New position created instantly
                      </div>
                    </>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="card" style={{ padding: 16 }}>
                  <h3 style={{ marginBottom: 8 }}>Quick Actions</h3>
                  <div className="small">Use the cards below to claim/compound. Network Dashboard and Referral pages are available in the menu.</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* MAIN ACTIONS */}
        <div id="yf-compound" style={{ height: 16 }} />

        <div className="grid grid-3">
          {/* OVERVIEW */}
          <div className="card" style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h3 style={{ margin: 0 }}>Your Overview</h3>
              <LivePill active={liveActive} />
            </div>

            {!addr ? (
              <div className="small" style={{ marginTop: 10 }}>
                Connect wallet to view your dashboard stats.
              </div>
            ) : !registered ? (
              <div className="small" style={{ marginTop: 10 }}>
                Register first to activate your on-chain dashboard.
              </div>
            ) : (
              <>
                <div style={{ height: 12 }} />
                <div style={{ display: "grid", gap: 12 }}>
                  <StatRow
                    label="Active deposit"
                    value={<span>{formatUnits(myActiveDeposit, dec)} {sym}</span>}
                    hint={`${mySharePct.toFixed(4)}% share`}
                  />
                  <StatRow label="Total deposited" value={<span>{formatUnits(myTotalDeposit, dec)} {sym}</span>} />
                  <StatRow label="Total withdrawn" value={<span>{formatUnits(myTotalWithdrawn, dec)} {sym}</span>} />
                  <StatRow
                    label="Total rewards available"
                    value={<span>{formatUnits(myTotalRewardsAvailable, dec)} {sym}</span>}
                    hint="Daily + Network"
                  />
                  <StatRow label="Base daily projection" value={<span>{formatUnits(baseDailyProjection, dec)} {sym}</span>} hint="capital only" />
                  <div style={{ height: 2 }} />
                  <StatRow label="Active positions" value={activePositionsCount} hint={`${slotsUsedPct.toFixed(1)}% slots used`} />
                  <div>
                    <div className="small" style={{ marginBottom: 8 }}>
                      Progress (earned / expected)
                    </div>
                    <ProgressBar pct={myProgressPct} />
                    <div className="small" style={{ marginTop: 8 }}>
                      Earned{" "}
                      <b style={{ color: "var(--text)" as any }}>{formatUnits(positionsEarnedSum, dec)} {sym}</b> · Expected{" "}
                      <b style={{ color: "var(--text)" as any }}>{formatUnits(positionsExpectedSum, dec)} {sym}</b>
                    </div>
                  </div>
                  <div style={{ height: 2 }} />
                  <StatRow label="Protocol payout ratio" value={`${protocolPayoutPct.toFixed(2)}%`} hint="withdrawn / deposited" />
                  <StatRow label="Positions total amount" value={<span>{formatUnits(positionsAmountSum, dec)} {sym}</span>} />
                </div>
              </>
            )}
          </div>

          {/* DAILY */}
          <div className="card" style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>Daily Rewards</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {addr && registered && chainOk && myActiveDeposit > 0n ? (
                  <GoldAccrualRing
                    label="Today"
                    nowSec={now}
                    dailyAmount={totalDailyProjection}
                    decimals={dec}
                    symbol={sym}
                    size={44}
                    stroke={6}
                  />
                ) : null}
                <LivePill active={liveActive} />
              </div>
            </div>

            <div className="small" style={{ marginTop: 12 }}>
              Available now
            </div>
            <div style={{ fontSize: 32, fontWeight: 950, marginTop: 6, letterSpacing: "-0.2px", wordBreak: "break-word" }}>
              {formatUnits(smoothDaily, dec)} {sym}
            </div>
            <div className="small" style={{ marginTop: 8 }}>
              Reserve included: <b style={{ color: "var(--text)" as any }}>{formatUnits(dailyReserve, dec)} {sym}</b>
            </div>

            <div style={{ height: 14 }} />

            {positions.some((p) => p.active && now < p.endTime) && nextDailyUnlockSec !== null ? (
              nextDailyUnlockSec > 0 ? (
                <CountdownRing label="Next daily unlock" remainingSec={nextDailyUnlockSec} totalSec={Number(timeStep || 86400n)} />
              ) : (
                <span className="chip">
                  <span className="dot" /> Ready now
                </span>
              )
            ) : (
              <div className="small">No active positions yet.</div>
            )}

            <div style={{ height: 14 }} />

            <div className="small">Amount (optional) — leave empty to use max</div>
            <input value={dailyActionAmount} onChange={(e) => setDailyActionAmount(e.target.value)} placeholder={`e.g. 25 (${sym})`} />

            <div style={{ height: 10 }} />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <ActionButton
                label="Claim Daily"
                onClick={onClaimDaily}
                disabled={!addr || !registered || !chainOk || dailyAvail <= 0n || (minWithdraw > 0n && dailyAvail < minWithdraw)}
                disabledReason={dailyDisabledReason}
              />

              <ActionButton
                label="Compound Daily"
                onClick={onCompoundDaily}
                disabled={
                  !addr ||
                  !registered ||
                  !chainOk ||
                  dailyAvail <= 0n ||
                  dailyAvail < minDeposit || // ✅ compound uses MINIMUM_DEPOSIT
                  positions.length >= Number(maxPositions)
                }
                disabledReason={dailyCompoundDisabledReason}
              />
            </div>
          </div>

          {/* NETWORK */}
          <div className="card" style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h3 style={{ margin: 0 }}>Network Rewards</h3>
              <LivePill active={liveActive} />
            </div>

            <div className="small" style={{ marginTop: 12 }}>
              Available now
            </div>
            <div style={{ fontSize: 32, fontWeight: 950, marginTop: 6, letterSpacing: "-0.2px", wordBreak: "break-word" }}>
              {formatUnits(smoothNet, dec)} {sym}
            </div>
            <div className="small" style={{ marginTop: 8 }}>
              Reserve included: <b style={{ color: "var(--text)" as any }}>{formatUnits(netReserve, dec)} {sym}</b>
            </div>

            <div style={{ height: 14 }} />

            <div className="small">Amount (optional) — leave empty to use max</div>
            <input value={netActionAmount} onChange={(e) => setNetActionAmount(e.target.value)} placeholder={`e.g. 50 (${sym})`} />

            <div style={{ height: 10 }} />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <ActionButton
                label="Claim Network"
                onClick={onClaimNetwork}
                disabled={!addr || !registered || !chainOk || netAvail <= 0n || (minWithdraw > 0n && netAvail < minWithdraw)}
                disabledReason={netDisabledReason}
              />

              {/* ✅ FIX: Compound Network must use MINIMUM_DEPOSIT (not MINIMUM_WITHDRAW) */}
              <ActionButton
                label="Compound Network"
                onClick={onCompoundNetwork}
                disabled={
                  !addr ||
                  !registered ||
                  !chainOk ||
                  netAvail <= 0n ||
                  netAvail < minDeposit ||
                  positions.length >= Number(maxPositions)
                }
                disabledReason={netCompoundDisabledReason}
              />
            </div>
          </div>
        </div>

        <div style={{ height: 16 }} />

        {/* POSITIONS */}
        <div className="card">
          <h3>Your Positions</h3>
          {!addr ? (
            <div className="small">Connect wallet to view positions.</div>
          ) : positions.length === 0 ? (
            <div className="small">No positions yet. Deposit to create your first position.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Amount</th>
                    <th>Started</th>
                    <th>Ends</th>
                    <th>Earned</th>
                    <th>Expected</th>
                    <th>Next Unlock</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => {
                    const stepSec = BigInt(Number(timeStep || 86400n));
                    const stepNum = Number(stepSec);

                    const checkpoint = Number((p.lastCheckpoint ?? (p as any).checkpoint ?? p.startTime) as any);

                    const nowSec = now;
                    const effectiveNow = Math.min(nowSec, p.endTime);

                    const windowStart = checkpoint;
                    const nextUnlock = windowStart + stepNum;

                    const rem = Math.max(0, nextUnlock - nowSec);
                    const active = p.active && nowSec < p.endTime;

                    // 🟣 24h progress %
                    const progressedSeconds = BigInt(active ? Math.max(0, stepNum - rem) : 0);
                    const progressPct = active ? fmtPct1(progressedSeconds, stepSec) : "—";

                    // BigInt-safe live pending accrual
                    const dailyRewardWei = p.expected / 50n;
                    const pendingSeconds = BigInt(active ? Math.max(0, Math.min(effectiveNow, nextUnlock) - windowStart) : 0);
                    const pendingWei = (dailyRewardWei * pendingSeconds) / stepSec;

                    const liveEarnedWei = p.earned + pendingWei;

                    return (
                      <tr key={p.index}>
                        <td><b>#{p.index + 1}</b></td>

                        <td><b>{fmt2(p.amount, dec)} {sym}</b></td>

                        <td>{new Date(p.startTime * 1000).toLocaleString()}</td>
                        <td>{new Date(p.endTime * 1000).toLocaleString()}</td>

                        <td>
                          <b>{fmt4(liveEarnedWei, dec)} {sym}</b>
                          <div className="small" style={{ opacity: 0.7, marginTop: 2 }}>
                            Stored: {fmt2(p.earned, dec)} {sym}
                          </div>
                        </td>

                        <td>{fmt2(p.expected, dec)} {sym}</td>

                        <td>
                          <span className="chip mono">{rem === 0 ? "Ready" : fmtCountdown(rem)}</span>
                          <span
                            className="chip mono"
                            style={{
                              marginLeft: 8,
                              borderColor: "rgba(180,110,255,.35)",
                              background: "linear-gradient(90deg, rgba(180,110,255,.14), rgba(0,0,0,0))"
                            }}
                            title="Progress through current 24h unlock window"
                          >
                            🟣 {progressPct}
                          </span>
                        </td>

                        <td>
                          <span className="chip">
                            <span
                              className="dot"
                              style={{ background: active ? "rgba(255,88,198,.95)" : "rgba(255,107,107,.95)" }}
                            />
                            {active ? "Active" : "Ended"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="small" style={{ marginTop: 12 }}>
            Contract:{" "}
            <a className="mono" href={BSCSCAN_CONTRACT} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
              {CONTRACT_ADDRESS}
            </a>
          </div>
        </div>

        <div style={{ height: 16 }} />

        {/* LATEST DEPOSITS */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0 }}>Latest Deposits</h3>
              <div className="small" style={{ marginTop: 6 }}>
                Live feed of recent deposits from on-chain events.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <LivePill active={true} />
              <button className="btn" onClick={refreshDepositFeed} disabled={feedLoading} type="button" style={{ fontWeight: 950 }}>
                {feedLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          <div style={{ height: 14 }} />

          {depositFeed.length === 0 ? (
            <div className="small">{feedMsg || "No data currently available."}</div>
          ) : (
            <div className="table-wrap">
              <table style={{ minWidth: 820 }}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Amount</th>
                    <th>Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {depositFeed.map((d) => (
                    <tr key={`${d.tx}-${d.blockNumber}`}>
                      <td className="mono">{timeAgo(d.ts)}</td>
                      <td className="mono">{shortAddr(d.user)}</td>
                      <td><b>{formatUnits(d.amount, dec)} {sym}</b></td>
                      <td>
                        <a className="mono" href={BSCSCAN_TX(d.tx)} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                          {d.tx.slice(0, 10)}…
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
