// src/App.tsx
// ============================================================================
// DollarDex — App page (Dashboard only)
// - This file MUST NOT render the top NavBar.
// - NavBar is rendered by routes.tsx layout (AppLayout).
// - /app should auto-scroll to the dashboard section.
// ============================================================================

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { BrowserProvider, Contract, JsonRpcProvider, Interface, formatUnits, parseUnits } from "ethers";

import "./lido-luxury.css";
import "./luxury.css";
import "./luxury-themes.css";
import "./dollardex-blackgold-overrides.css";

/** ========= Config ========= */
const RPC_URL =
  (import.meta as any).env?.VITE_BSC_RPC?.toString?.() || "https://bsc-dataseed.binance.org/";

const CONTRACT_ADDRESS = "0xd583327F81fA70d0f30A775dd7E0390B26E324cb";
const BSCSCAN_CONTRACT = `https://bscscan.com/address/${CONTRACT_ADDRESS}`;
const BSCSCAN_TX = (tx: string) => `https://bscscan.com/tx/${tx}`;

const rpc = new JsonRpcProvider(RPC_URL);

/** ========= Utilities ========= */
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

function hasWallet() {
  return typeof (window as any).ethereum !== "undefined";
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

  "function usersExtra(address) view returns(uint256 rewardsReferral,uint256 rewardsOnboarding,uint256 rewardsRank,uint256 reserveDailyCapital,uint256 reserveDailyROI,uint256 reserveNetwork,uint32 teamCount,uint32 directsCount,uint32 directsQuali,uint8 rank)",
  "function users(address) view returns(address referrer,bool registered,uint256 totalActiveDeposit,uint256 teamActiveDeposit,uint256 teamTotalDeposit,uint256 totalDeposited,uint256 totalWithdrawn)",

  "function getDailyRewards(address userAddr) view returns(uint256 availableReward,uint256 reserve)",
  "function getNetworkRewards(address userAddr) view returns(uint256 availableReward,uint256 reserve)",
  "function getPositionCount(address userAddr) view returns(uint256)",
  "function getPosition(address userAddr,uint256 index) view returns(uint256 amount,uint256 startTime,uint256 lastCheckpoint,uint256 endTime,uint256 earned,uint256 expectedTotalEarn,uint8 source,bool active)",

  "function register(address referrer)",
  "function deposit(uint256 amount)",
  "function claimDailyReward(uint256 amount)",
  "function compoundDailyReward(uint256 amount)",
  "function claimNetworkReward(uint256 amount)",
  "function compoundNetworkReward(uint256 amount)"
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
    <div style={{ display: "inline-flex", alignItems: "center" }}>
      <button className={`btn ${primary ? "primary" : ""}`} onClick={onClick} disabled={disabled} type="button">
        {label}
      </button>
      {disabled ? <SoftTooltip text={disabledReason} /> : null}
    </div>
  );
}

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

/** ========= Main App ========= */
export default function App() {
  const location = useLocation();

  // /app should always scroll to dashboard section (no route switching here)
  useEffect(() => {
  if (location.pathname !== "/app") return;

  let cancelled = false;
  const t = window.setTimeout(() => {
    if (!cancelled) scrollToId("yf-compound");
  }, 120);

  return () => {
    cancelled = true;
    window.clearTimeout(t);
  };
}, [location.pathname]);





  /** ===== Theme (kept, because ThemeToggle is used in content below) ===== */
  type ThemeModeLocal = "dim" | "dark" | "light";
  const THEME_KEY = "yf_theme";

  const getInitialTheme = (): ThemeModeLocal => {
    try {
      const saved = localStorage.getItem(THEME_KEY) as ThemeModeLocal | null;
      if (saved === "dim" || saved === "dark" || saved === "light") return saved;
    } catch {}
    const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)")?.matches;
    return prefersLight ? "light" : "dark";
  };

  const [theme, setTheme] = useState<ThemeModeLocal>(() => getInitialTheme());

  useEffect(() => {
    try {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }, [theme]);

  function ThemeToggle() {
    const items: { k: ThemeModeLocal; label: string }[] = [
      { k: "dim", label: "Dim" },
      { k: "dark", label: "Dark" },
      { k: "light", label: "Light" }
    ];

    return (
      <div className="theme-toggle" role="group" aria-label="Theme">
        {items.map((it) => (
          <button
            key={it.k}
            className={`theme-pill ${theme === it.k ? "active" : ""}`}
            onClick={() => setTheme(it.k)}
            type="button"
          >
            {it.label}
          </button>
        ))}
      </div>
    );
  }

  /** ===== Toasts ===== */
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = (type: Toast["type"], title: string, msg?: string) => {
    setToasts((t) => [...t, { type, title, msg }]);
    setTimeout(() => setToasts((t) => t.slice(1)), 3200);
  };

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast("success", "Copied", text.length > 42 ? "Referral link copied" : "Address copied");
    } catch {
      toast("error", "Copy failed", "Your browser blocked clipboard access.");
    }
  }

  /** ===== Live Deposit Feed ===== */
  const [depositFeed, setDepositFeed] = useState<DepositFeedRow[]>([]);
  const [feedMsg, setFeedMsg] = useState<string>("Loading latest deposits from on-chain events…");
  const [feedLoading, setFeedLoading] = useState(false);
  const lastFeedBlockRef = useRef<number>(0);

  const depositIface = useMemo(
    () => new Interface(["event Deposit(address indexed user, uint256 amount, uint256 timestamp)"]),
    []
  );

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
      return await rpc.getLogs({
        address: CONTRACT_ADDRESS,
        fromBlock,
        toBlock,
        topics: [topic0]
      });
    } catch {
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
      const latest = await rpc.getBlockNumber();

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
    refreshDepositFeed();
    const t = setInterval(refreshDepositFeed, 18_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ===== Clock / wallet / chain ===== */
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [addr, setAddr] = useState("");
  const [chainOk, setChainOk] = useState(true);

  useEffect(() => {
    const i = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(i);
  }, []);

  async function connect() {
    try {
      if (!hasWallet()) return toast("error", "Wallet not found", "Install MetaMask (or a Web3 wallet).");
      const bp = new BrowserProvider((window as any).ethereum);
      await bp.send("eth_requestAccounts", []);
      const signer = await bp.getSigner();
      const a = await signer.getAddress();
      setAddr(a);

      try {
        const n = await bp.getNetwork();
        const ok = Number(n.chainId) === 56;
        setChainOk(ok);
        if (!ok) toast("error", "Wrong network", "Please switch to BSC Mainnet.");
      } catch {
        setChainOk(true);
      }

      toast("success", "Wallet connected", shortAddr(a));
    } catch (e: any) {
      toast("error", "Connect failed", e?.message || "Could not connect wallet.");
    }
  }

  function disconnect() {
    setAddr("");
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
    setRefInput("");
    setDepositInput("");
    setDailyActionAmount("");
    setNetActionAmount("");

    setRReferral(0n);
    setROnboarding(0n);
    setRRank(0n);
    setMyTeamCount(0);
    setMyDirectsCount(0);
    setMyDirectsQuali(0);
    setMyRank(0);

    toast("info", "Disconnected");
  }

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

  // Referral states
  const [myTeamCount, setMyTeamCount] = useState(0);
  const [myDirectsCount, setMyDirectsCount] = useState(0);
  const [myDirectsQuali, setMyDirectsQuali] = useState(0);
  const [myRank, setMyRank] = useState(0);

  const [rReferral, setRReferral] = useState(0n);
  const [rOnboarding, setROnboarding] = useState(0n);
  const [rRank, setRRank] = useState(0n);

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

  const yfRead = useMemo(() => new Contract(CONTRACT_ADDRESS, YF_ABI, rpc), []);

  async function yfWrite() {
    if (!hasWallet()) throw new Error("No wallet detected");
    const bp = new BrowserProvider((window as any).ethereum);
    const signer = await bp.getSigner();
    return new Contract(CONTRACT_ADDRESS, YF_ABI, signer);
  }

  async function usdtWrite() {
    if (!hasWallet()) throw new Error("No wallet detected");
    if (!usdtAddr) throw new Error("USDT not loaded yet");
    const bp = new BrowserProvider((window as any).ethereum);
    const signer = await bp.getSigner();
    return new Contract(usdtAddr, ERC20_ABI, signer);
  }

  async function refreshAll() {
    try {
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
        yfRead.USDT(),
        yfRead.launchDate(),
        yfRead.totalRegisteredUsers(),
        yfRead.totalActiveUsers(),
        yfRead.totalDeposited(),
        yfRead.totalWithdrawn(),
        yfRead.CYCLE_DURATION(),
        yfRead.MINIMUM_DEPOSIT(),
        yfRead.MINIMUM_WITHDRAW(),
        yfRead.ADMIN_FEE_PCT(),
        yfRead.CAPITAL_DAILY_PCT(),
        yfRead.PERCENTS_DIVIDER(),
        yfRead.TIME_STEP(),
        yfRead.MAX_POSITIONS()
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

      const erc = new Contract(_usdt, ERC20_ABI, rpc);
      const [d, s, cb] = await Promise.all([erc.decimals(), erc.symbol(), erc.balanceOf(CONTRACT_ADDRESS)]);
      setDec(Number(d));
      setSym(String(s));
      setContractUsdtBal(cb);

      try {
        const roi = await Promise.all([0, 1, 2, 3, 4].map((i) => yfRead.ROI_DAILY_PCT(i)));
        setRoiDaily(roi.map((x: any) => BigInt(x)));
      } catch {
        setRoiDaily([]);
      }
      try {
        const th = await Promise.all([0, 1, 2, 3, 4].map((i) => yfRead.ROI_THRESHOLDS(i)));
        setRoiThresholds(th.map((x: any) => BigInt(x)));
      } catch {
        setRoiThresholds([]);
      }

      if (addr) {
        const u = await yfRead.users(addr);

        try {
          const x = await yfRead.usersExtra(addr);
          setRReferral(BigInt(x[0]));
          setROnboarding(BigInt(x[1]));
          setRRank(BigInt(x[2]));
          setMyTeamCount(Number(x[6]));
          setMyDirectsCount(Number(x[7]));
          setMyDirectsQuali(Number(x[8]));
          setMyRank(Number(x[9]));
        } catch {
          setRReferral(0n);
          setROnboarding(0n);
          setRRank(0n);
          setMyTeamCount(0);
          setMyDirectsCount(0);
          setMyDirectsQuali(0);
          setMyRank(0);
        }

        setReferrer(u[0]);
        setRegistered(Boolean(u[1]));
        setMyActiveDeposit(u[2]);
        setMyTotalDeposit(u[5]);
        setMyTotalWithdrawn(u[6]);

        const [dR, nR, count] = await Promise.all([
          yfRead.getDailyRewards(addr),
          yfRead.getNetworkRewards(addr),
          yfRead.getPositionCount(addr)
        ]);

        setDailyAvail(dR[0]);
        setDailyReserve(dR[1]);
        setNetAvail(nR[0]);
        setNetReserve(nR[1]);

        const c = Number(count);
        if (c > 0) {
          const rows = await Promise.all(Array.from({ length: c }, (_, i) => yfRead.getPosition(addr, i)));
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
        } else setPositions([]);
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

        setRReferral(0n);
        setROnboarding(0n);
        setRRank(0n);
        setMyTeamCount(0);
        setMyDirectsCount(0);
        setMyDirectsQuali(0);
        setMyRank(0);
      }
    } catch (e: any) {
      // keep toast soft; app still renders
      console.error(e);
      toast("error", "Failed to load on-chain data", e?.message || "Try again.");
    }
  }

  useEffect(() => {
    refreshAll();
    const t = setInterval(refreshAll, 12_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr]);

  async function runTx(label: string, txPromise: Promise<any>) {
    try {
      toast("info", "Transaction sent", label);
      const tx = await txPromise;
      await tx.wait();
      toast("success", "Confirmed", label);
      await refreshAll();
      setTimeout(() => refreshDepositFeed(), 1500);
    } catch (e: any) {
      toast("error", "Transaction failed", e?.reason || e?.message || label);
    }
  }

  async function onRegister() {
    if (!addr) return toast("error", "Connect wallet first");
    if (!chainOk) return toast("error", "Wrong network", "Switch to BSC Mainnet.");
    if (!refInput || !refInput.startsWith("0x") || refInput.length !== 42) {
      return toast("error", "Invalid referrer", "Paste a valid 0x… address.");
    }
    const c = await yfWrite();
    await runTx("Register", c.register(refInput));
  }

  async function onDeposit() {
    if (!addr) return toast("error", "Connect wallet first");
    if (!chainOk) return toast("error", "Wrong network", "Switch to BSC Mainnet.");
    if (!registered) return toast("error", "Register first", "You must register a referrer before depositing.");
    if (!depositInput) return toast("error", "Enter deposit amount");

    const amount = parseUnits(depositInput, dec);
    if (amount < minDeposit) return toast("error", "Under minimum", `Minimum deposit is ${formatUnits(minDeposit, dec)} ${sym}`);
    if (positions.length >= Number(maxPositions)) return toast("error", "Max positions reached", `Maximum positions: ${maxPositions.toString()}`);

    const ercR = new Contract(usdtAddr, ERC20_ABI, rpc);
    const allowance: bigint = await ercR.allowance(addr, CONTRACT_ADDRESS);
    if (allowance < amount) {
      const ercW = await usdtWrite();
      await runTx("Approve USDT", ercW.approve(CONTRACT_ADDRESS, amount));
    }

    const c = await yfWrite();
    await runTx("Deposit (new position starts instantly)", c.deposit(amount));
    setDepositInput("");
  }

  function parseOptionalAmountOrZero(input: string) {
    const t = (input || "").trim();
    if (!t) return 0n;
    return parseUnits(t, dec);
  }

  async function onClaimDaily() {
    if (!addr) return toast("error", "Connect wallet first");
    if (!chainOk) return toast("error", "Wrong network", "Switch to BSC Mainnet.");
    if (!registered) return toast("error", "Register first");
    if (dailyAvail <= 0n) return toast("error", "No daily rewards available yet");

    const amt = parseOptionalAmountOrZero(dailyActionAmount);
    if (amt !== 0n && amt < minWithdraw) return toast("error", "Under minimum", `Minimum claim is ${formatUnits(minWithdraw, dec)} ${sym}`);

    const c = await yfWrite();
    await runTx("Claim Daily", c.claimDailyReward(amt));
    setDailyActionAmount("");
  }

  async function onCompoundDaily() {
    if (!addr) return toast("error", "Connect wallet first");
    if (!chainOk) return toast("error", "Wrong network", "Switch to BSC Mainnet.");
    if (!registered) return toast("error", "Register first");
    if (dailyAvail <= 0n) return toast("error", "No daily rewards available yet");
    if (positions.length >= Number(maxPositions)) return toast("error", "Max positions reached");

    const amt = parseOptionalAmountOrZero(dailyActionAmount);
    if (amt !== 0n && amt < minDeposit) return toast("error", "Under minimum", `Minimum compound is ${formatUnits(minDeposit, dec)} ${sym}`);

    const c = await yfWrite();
    await runTx("Compound Daily (creates a new position)", c.compoundDailyReward(amt));
    setDailyActionAmount("");
  }

  async function onClaimNetwork() {
    if (!addr) return toast("error", "Connect wallet first");
    if (!chainOk) return toast("error", "Wrong network", "Switch to BSC Mainnet.");
    if (!registered) return toast("error", "Register first");
    if (netAvail <= 0n) return toast("error", "No network rewards available yet");

    const amt = parseOptionalAmountOrZero(netActionAmount);
    if (amt !== 0n && amt < minWithdraw) return toast("error", "Under minimum", `Minimum claim is ${formatUnits(minWithdraw, dec)} ${sym}`);

    const c = await yfWrite();
    await runTx("Claim Network", c.claimNetworkReward(amt));
    setNetActionAmount("");
  }

  async function onCompoundNetwork() {
    if (!addr) return toast("error", "Connect wallet first");
    if (!chainOk) return toast("error", "Wrong network", "Switch to BSC Mainnet.");
    if (!registered) return toast("error", "Register first");
    if (netAvail <= 0n) return toast("error", "No network rewards available yet");
    if (positions.length >= Number(maxPositions)) return toast("error", "Max positions reached");

    const amt = parseOptionalAmountOrZero(netActionAmount);
    if (amt !== 0n && amt < minDeposit) return toast("error", "Under minimum", `Minimum compound is ${formatUnits(minDeposit, dec)} ${sym}`);

    const c = await yfWrite();
    await runTx("Compound Network (creates a new position)", c.compoundNetworkReward(amt));
    setNetActionAmount("");
  }

  /** ===== Next daily unlock timer ===== */
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

  const roiTiersPretty = useMemo(() => {
    if (!roiDaily.length) return [];
    return roiDaily.map((x) => `${pctFromBps(x, divider).toFixed(2)}%`);
  }, [roiDaily, divider]);

  const reasonNeedWallet = "Connect wallet";
  const reasonWrongNet = "Switch to BSC Mainnet";
  const reasonNeedRegister = "Register first";
  const reasonNoRewards = "No rewards yet";
  const reasonMinClaim = `Min claim ${minWithdraw ? `${formatUnits(minWithdraw, dec)} ${sym}` : ""}`.trim();
  const reasonMaxPos = "Max positions reached";

  const dailyDisabledReason =
    !addr
      ? reasonNeedWallet
      : !chainOk
        ? reasonWrongNet
        : !registered
          ? reasonNeedRegister
          : dailyAvail <= 0n
            ? reasonNoRewards
            : dailyAvail < minWithdraw
              ? reasonMinClaim
              : "";

  const netDisabledReason =
    !addr
      ? reasonNeedWallet
      : !chainOk
        ? reasonWrongNet
        : !registered
          ? reasonNeedRegister
          : netAvail <= 0n
            ? reasonNoRewards
            : netAvail < minWithdraw
              ? reasonMinClaim
              : "";

  const liveActive = Boolean(addr && registered && chainOk);

  const activePositionsCount = useMemo(
    () => positions.filter((p) => p.active && now < p.endTime).length,
    [positions, now]
  );

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

      {/* DASHBOARD (starts here) */}
      <div id="yf-home" className="wrap" style={{ paddingTop: 24, paddingBottom: 18 }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ maxWidth: 780 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span className="chip">Instant position start</span>
                <span className="chip">Contract-truth rewards</span>
                <span className="chip">{sym}</span>
                <span style={{ marginLeft: 6 }}>
                  <ThemeToggle />
                </span>

                {!addr ? (
                  <button
                    className="btn primary"
                    onClick={connect}
                    type="button"
                    style={{ padding: "13px 18px", fontSize: 15, fontWeight: 950, marginLeft: 6 }}
                  >
                    ✨ Connect Wallet
                  </button>
                ) : (
                  <>
                    <span className="chip">
                      <span className="dot" />
                      <span className="mono">BSC</span>
                      <span className="mono">{shortAddr(addr)}</span>
                    </span>
                    <button className="btn" onClick={disconnect} type="button">
                      Disconnect
                    </button>
                  </>
                )}
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

              <div style={{ marginTop: 18 }}>
                <div className="small">Daily structure</div>
                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span className="chip">
                    Base <b style={{ marginLeft: 6, color: "var(--text)" as any }}>{prettyCapitalDaily}</b>
                  </span>
                  {roiTiersPretty.length ? (
                    roiTiersPretty.map((p, i) => (
                      <span key={i} className="chip">
                        Tier {i + 1}: +<b style={{ marginLeft: 4, color: "var(--text)" as any }}>{p}</b>
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

            <div style={{ minWidth: 340, flex: "0 0 auto" }}>
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
              <div className="small" style={{ marginTop: 10 }}>Connect wallet to view your dashboard stats.</div>
            ) : !registered ? (
              <div className="small" style={{ marginTop: 10 }}>Register first to activate your on-chain dashboard.</div>
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
                  <StatRow
                    label="Base daily projection"
                    value={<span>{formatUnits(baseDailyProjection, dec)} {sym}</span>}
                    hint="capital only"
                  />
                  <div style={{ height: 2 }} />
                  <StatRow label="Active positions" value={activePositionsCount} hint={`${slotsUsedPct.toFixed(1)}% slots used`} />
                  <div>
                    <div className="small" style={{ marginBottom: 8 }}>Progress (earned / expected)</div>
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
                  <StatRow label="Time step" value={`${timeStep.toString()}s`} />
                </div>
              </>
            )}
          </div>

          {/* DAILY */}
          <div className="card" style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h3 style={{ margin: 0 }}>Daily Rewards</h3>
              <LivePill active={liveActive} />
            </div>

            <div className="small" style={{ marginTop: 12 }}>Available now</div>
            <div style={{ fontSize: 32, fontWeight: 950, marginTop: 6, letterSpacing: "-0.2px" }}>
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
                <span className="chip"><span className="dot" /> Ready now</span>
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
                disabled={!addr || !registered || !chainOk || dailyAvail <= 0n || (minWithdraw > 0n && dailyAvail < minWithdraw) || positions.length >= Number(maxPositions)}
                disabledReason={positions.length >= Number(maxPositions) ? reasonMaxPos : dailyDisabledReason}
              />
            </div>
          </div>

          {/* NETWORK */}
          <div className="card" style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h3 style={{ margin: 0 }}>Network Rewards</h3>
              <LivePill active={liveActive} />
            </div>

            <div className="small" style={{ marginTop: 12 }}>Available now</div>
            <div style={{ fontSize: 32, fontWeight: 950, marginTop: 6, letterSpacing: "-0.2px" }}>
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
              <ActionButton
                label="Compound Network"
                onClick={onCompoundNetwork}
                disabled={!addr || !registered || !chainOk || netAvail <= 0n || (minWithdraw > 0n && netAvail < minWithdraw) || positions.length >= Number(maxPositions)}
                disabledReason={positions.length >= Number(maxPositions) ? reasonMaxPos : netDisabledReason}
              />
            </div>
          </div>

          {/* DEPOSIT */}
          <div className="card">
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
                <input value={depositInput} onChange={(e) => setDepositInput(e.target.value)} placeholder={`Min ${formatUnits(minDeposit, dec)} ${sym}`} />

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
                    const step = Number(timeStep || 86400n);
                    const effectiveNow = Math.min(now, p.endTime);
                    const elapsed = Math.max(0, effectiveNow - p.startTime);
                    const daysPassed = Math.floor(elapsed / step);
                    const windowStart = p.startTime + daysPassed * step;
                    const nextUnlock = windowStart + step;
                    const rem = Math.max(0, nextUnlock - now);

                    const active = p.active && now < p.endTime;

                    return (
                      <tr key={p.index}>
                        <td><b>#{p.index + 1}</b></td>
                        <td>{formatUnits(p.amount, dec)} {sym}</td>
                        <td>{new Date(p.startTime * 1000).toLocaleString()}</td>
                        <td>{new Date(p.endTime * 1000).toLocaleString()}</td>
                        <td><b>{formatUnits(p.earned, dec)} {sym}</b></td>
                        <td>{formatUnits(p.expected, dec)} {sym}</td>
                        <td><span className="chip mono">{rem === 0 ? "Ready" : fmtCountdown(rem)}</span></td>
                        <td>
                          <span className="chip">
                            <span className="dot" style={{ background: active ? "rgba(255,88,198,.95)" : "rgba(255,107,107,.95)" }} />
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
              <div className="small" style={{ marginTop: 6 }}>Live feed of recent deposits from on-chain events.</div>
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
