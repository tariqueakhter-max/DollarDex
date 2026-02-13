// src/pages/networkdashboard.tsx
// ============================================================================
// DollarDex — Network Dashboard (SAFE + No Scary Errors + No Build Button)
// - Contract-matching ABI (from your pasted ABI)
// - Uses correct event: Registration(address user, address referrer, uint256 timestamp)
// - NO raw error messages shown to users (sanitized UX)
// - NO "Build Network" button (auto-scan silently + cache)
// - Tree/direct list only appears when cache exists; otherwise calm placeholder.
// - Handles eth_getLogs rate limits with chunking + retry + backoff.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserProvider, Contract, Interface, JsonRpcProvider, formatUnits } from "ethers";

/** ========= Config ========= */
const RPC_URL = (import.meta as any).env?.VITE_BSC_RPC?.toString?.() || "https://bsc-dataseed.binance.org/";
const CONTRACT_ADDRESS = "0xd583327F81fA70d0f30A775dd7E0390B26E324cb";
const BSCSCAN_CONTRACT = `https://bscscan.com/address/${CONTRACT_ADDRESS}`;
const BSCSCAN_ADDR = (a: string) => `https://bscscan.com/address/${a}`;

const BSC_CHAIN_ID_DEC = 56;
const rpc = new JsonRpcProvider(RPC_URL);

/** ========= ABIs (from your pasted ABI) ========= */
const YF_ABI = [
  "function USDT() view returns(address)",
  "function users(address) view returns(address referrer,bool registered,uint256 totalActiveDeposit,uint256 teamActiveDeposit,uint256 teamTotalDeposit,uint256 totalDeposited,uint256 totalWithdrawn)",
  "function usersExtra(address) view returns(uint256 rewardsReferral,uint256 rewardsOnboarding,uint256 rewardsRank,uint256 reserveDailyCapital,uint256 reserveDailyROI,uint256 reserveNetwork,uint32 teamCount,uint32 directsCount,uint32 directsQuali,uint8 rank)",
  "function getNetworkRewards(address userAddr) view returns(uint256 availableReward,uint256 reserve)",
];

const ERC20_ABI = ["function symbol() view returns(string)", "function decimals() view returns(uint8)"];

// ✅ Correct event
const REG_EVENT_ABI = "event Registration(address indexed user, address indexed referrer, uint256 timestamp)";

/** ========= Cache ========= */
const CACHE_VERSION = "v3"; // bump whenever cache format/behavior changes
const LS_KEY = (rootAddrLower: string) =>
  `ddx_net_cache_${CACHE_VERSION}_${CONTRACT_ADDRESS.toLowerCase()}_${rootAddrLower}`;

type CachePayload = {
  contract: string;
  root: string;
  fromBlock: number;
  toBlock: number;
  lastScannedBlock: number;
  parentOf: Record<string, string>;
  childrenOf: Record<string, string[]>;
  updatedAt?: number;
};

/** ========= Utils ========= */
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

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Very important: NEVER show raw provider errors to user.
// We only return a gentle boolean.
function isRateLimitErr(e: any) {
  const msg = String(e?.message || "");
  // BSC / RPC typical signals:
  return msg.includes("-32005") || msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("too many");
}

function safeConsoleWarn(e: any) {
  // Keep console short (optional), NEVER show payloads in UI.
  try {
    const msg = String(e?.message || e || "unknown");
    console.warn("[NetworkDashboard] RPC issue:", msg.slice(0, 180));
  } catch {}
}

function GlowCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>{title}</h3>
          {subtitle ? <div className="small">{subtitle}</div> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>

      <div style={{ marginTop: 12 }}>{children}</div>

      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: "-140px -160px auto auto",
          width: 340,
          height: 340,
          background:
            "radial-gradient(circle at 30% 30%, rgba(255,90,210,.16), rgba(0,0,0,0) 62%), radial-gradient(circle at 70% 70%, rgba(90,120,255,.14), rgba(0,0,0,0) 64%)",
          pointerEvents: "none",
          opacity: 0.9,
        }}
      />
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
      <div className="small">{label}</div>
      <div style={{ fontWeight: 1000, fontVariantNumeric: "tabular-nums" as any }}>{value}</div>
    </div>
  );
}

/** ========= Page ========= */
export default function NetworkDashboard() {
  const yfRead = useMemo(() => new Contract(CONTRACT_ADDRESS, YF_ABI, rpc), []);

  const regIface = useMemo(() => new Interface([REG_EVENT_ABI]), []);
  const regTopic0 = useMemo(() => {
    try {
      const ev = regIface.getEvent("Registration");
      return ev?.topicHash ?? "";
    } catch {
      return "";
    }
  }, [regIface]);

  // Wallet
  const [addr, setAddr] = useState("");
  const [chainOk, setChainOk] = useState(true);

  // Token meta
  const [sym, setSym] = useState("USDT");
  const [dec, setDec] = useState(18);

  // On-chain user stats
  const [registered, setRegistered] = useState(false);
  const [referrer, setReferrer] = useState("");
  const [teamCount, setTeamCount] = useState<number>(0);
  const [directsCount, setDirectsCount] = useState<number>(0);
  const [directsQuali, setDirectsQuali] = useState<number>(0);
  const [rank, setRank] = useState<number>(0);

  const [netAvail, setNetAvail] = useState<bigint>(0n);
  const [netReserve, setNetReserve] = useState<bigint>(0n);

  // Graph cache + UI
  const parentOfRef = useRef<Map<string, string>>(new Map());
  const childrenOfRef = useRef<Map<string, string[]>>(new Map());
  const [directRefs, setDirectRefs] = useState<string[]>([]);
  const [levels, setLevels] = useState<Record<number, number>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [cacheInfo, setCacheInfo] = useState<{ hasCache: boolean; updatedAt?: number }>({ hasCache: false });

  // Gentle status text only (never scary)
  const [softStatus, setSoftStatus] = useState<string>("");

  // Copy
  const [copied, setCopied] = useState(false);

  const origin = useMemo(() => {
    try {
      return window.location.origin;
    } catch {
      return "";
    }
  }, []);

  const referralUrl = useMemo(() => {
    if (!origin) return "";
    return `${origin}/?ref=${addr || ""}`;
  }, [origin, addr]);

  /** ========= Wallet sync ========= */
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
      if (!eth?.request) {
        setSoftStatus("Wallet not detected. Install MetaMask to connect.");
        return;
      }
      const bp = new BrowserProvider(eth);
      await bp.send("eth_requestAccounts", []);
      await syncWalletSilent();
      setSoftStatus("");
    } catch {
      // Do NOT show raw message
      setSoftStatus("Could not connect. Please try again.");
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
      } catch {}
    };
  }, []);

  /** ========= Load on-chain summaries (light calls) ========= */
  async function refreshOnChain() {
    try {
      // token meta
      const usdt = await yfRead.USDT();
      try {
        const erc = new Contract(usdt, ERC20_ABI, rpc);
        const [d, s] = await Promise.all([erc.decimals(), erc.symbol()]);
        setDec(Number(d));
        setSym(String(s));
      } catch {
        setDec(18);
        setSym("USDT");
      }

      if (!addr) {
        setRegistered(false);
        setReferrer("");
        setTeamCount(0);
        setDirectsCount(0);
        setDirectsQuali(0);
        setRank(0);
        setNetAvail(0n);
        setNetReserve(0n);
        return;
      }

      const u = await yfRead.users(addr);
      setReferrer(String(u.referrer ?? u[0]));
      setRegistered(Boolean(u.registered ?? u[1]));

      try {
        const ex = await yfRead.usersExtra(addr);
        setTeamCount(Number(ex.teamCount ?? ex[6] ?? 0));
        setDirectsCount(Number(ex.directsCount ?? ex[7] ?? 0));
        setDirectsQuali(Number(ex.directsQuali ?? ex[8] ?? 0));
        setRank(Number(ex.rank ?? ex[9] ?? 0));
      } catch {
        setTeamCount(0);
        setDirectsCount(0);
        setDirectsQuali(0);
        setRank(0);
      }

      try {
        const nR = await yfRead.getNetworkRewards(addr);
        setNetAvail(BigInt(nR.availableReward ?? nR[0] ?? 0));
        setNetReserve(BigInt(nR.reserve ?? nR[1] ?? 0));
      } catch {
        setNetAvail(0n);
        setNetReserve(0n);
      }
    } catch (e: any) {
      safeConsoleWarn(e);
      // Calm message only; no raw error.
      setSoftStatus((s) => s || "Network info is loading…");
    }
  }

  useEffect(() => {
    refreshOnChain();
    const t = window.setInterval(refreshOnChain, 12_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr]);

  /** ========= Cache helpers ========= */
  function saveCache(rootLower: string, payload: CachePayload) {
    try {
      localStorage.setItem(LS_KEY(rootLower), JSON.stringify(payload));
    } catch {}
  }

  function loadCache(rootLower: string): CachePayload | null {
    try {
      const raw = localStorage.getItem(LS_KEY(rootLower));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachePayload;
      if (!parsed?.contract || !parsed?.root) return null;
      if (String(parsed.contract).toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) return null;
      if (String(parsed.root).toLowerCase() !== rootLower) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function hydrateMapsFromCache(payload: CachePayload) {
    const pMap = new Map<string, string>();
    const cMap = new Map<string, string[]>();

    for (const [child, parent] of Object.entries(payload.parentOf || {})) {
      if (child && parent) pMap.set(child.toLowerCase(), parent.toLowerCase());
    }
    for (const [parent, kids] of Object.entries(payload.childrenOf || {})) {
      cMap.set(parent.toLowerCase(), (kids || []).map((k) => String(k).toLowerCase()));
    }

    parentOfRef.current = pMap;
    childrenOfRef.current = cMap;

    setCacheInfo({ hasCache: true, updatedAt: payload.updatedAt });
  }

  /** ========= Graph building ========= */
  function addEdge(parent: string, child: string) {
    const p = parent.toLowerCase();
    const c = child.toLowerCase();
    if (!p || !c) return;
    if (p === "0x0000000000000000000000000000000000000000") return;
    if (c === "0x0000000000000000000000000000000000000000") return;
    if (p === c) return;

    if (!parentOfRef.current.has(c)) parentOfRef.current.set(c, p);

    const prev = childrenOfRef.current.get(p) || [];
    if (!prev.includes(c)) childrenOfRef.current.set(p, [...prev, c]);
  }

  function parseRegistrationLog(log: any): { user: string; ref: string } | null {
    try {
      const parsed = regIface.parseLog(log);
      const args: any = (parsed as any).args;
      const user = args.user ?? args[0];
      const ref = args.referrer ?? args[1];
      const u = typeof user === "string" ? user : String(user);
      const r = typeof ref === "string" ? ref : String(ref);
      if (u && u.startsWith("0x") && r && r.startsWith("0x")) return { user: u, ref: r };
    } catch {}
    return null;
  }

  // Throttled + retry getLogs to avoid rate-limit panic
  async function getLogsSafe(params: { address: string; fromBlock: number; toBlock: number; topics: string[] }) {
    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await rpc.getLogs(params as any);
      } catch (e: any) {
        safeConsoleWarn(e);
        if (isRateLimitErr(e)) {
          // exponential-ish backoff
          const wait = 450 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
          await sleep(Math.min(wait, 4500));
          continue;
        }
        // Non-rate-limit error: stop (silent)
        return null;
      }
    }
    return null;
  }

  async function scanLogsWindow(fromBlock: number, toBlock: number) {
    if (!regTopic0) return false;

    // smaller chunks = fewer rate-limits
    const CHUNK = 8_000;

    for (let start = fromBlock; start <= toBlock; start += CHUNK + 1) {
      const end = Math.min(toBlock, start + CHUNK);

      const logs = await getLogsSafe({
        address: CONTRACT_ADDRESS,
        fromBlock: start,
        toBlock: end,
        topics: [regTopic0],
      });

      if (!logs) {
        // quiet stop (keep UI calm)
        return false;
      }

      for (const lg of logs) {
        const pr = parseRegistrationLog(lg);
        if (!pr) continue;
        addEdge(pr.ref, pr.user);
      }

      // tiny throttle between chunks
      await sleep(120);
    }

    return true;
  }

  function recomputeDisplay() {
    if (!addr) {
      setDirectRefs([]);
      setLevels({});
      return;
    }
    const rootL = addr.toLowerCase();
    const direct = childrenOfRef.current.get(rootL) || [];
    setDirectRefs(uniq(direct));

    // Build simple level summary (depth-limited)
    const maxDepth = 6;
    const q: { a: string; level: number }[] = direct.map((d) => ({ a: d.toLowerCase(), level: 1 }));
    const seen = new Set<string>([rootL, ...direct.map((d) => d.toLowerCase())]);
    const levelCount: Record<number, number> = {};

    while (q.length) {
      const cur = q.shift()!;
      levelCount[cur.level] = (levelCount[cur.level] || 0) + 1;
      if (cur.level >= maxDepth) continue;

      const kids = childrenOfRef.current.get(cur.a) || [];
      for (const k of kids) {
        const kl = k.toLowerCase();
        if (seen.has(kl)) continue;
        seen.add(kl);
        q.push({ a: kl, level: cur.level + 1 });
      }
    }

    setLevels(levelCount);
  }

  /** ========= Auto-load cache + silent background refresh ========= */
  const scanningRef = useRef(false);

  useEffect(() => {
    setExpanded({}); // reset expands on wallet change
    if (!addr) {
      setCacheInfo({ hasCache: false });
      setDirectRefs([]);
      setLevels({});
      return;
    }

    const rootLower = addr.toLowerCase();
    const cached = loadCache(rootLower);
    if (cached) {
      hydrateMapsFromCache(cached);
      recomputeDisplay();
    } else {
      setCacheInfo({ hasCache: false });
      setDirectRefs([]);
      setLevels({});
    }

    // Silent scan (no button) — only when:
    // - wallet connected
    // - correct chain
    // - and not already scanning
    // - and page is visible
    const run = async () => {
      if (!chainOk) return;
      if (scanningRef.current) return;
      if (document.visibilityState !== "visible") return;

      scanningRef.current = true;

      try {
        const latest = await rpc.getBlockNumber();

        // If cache exists: only scan NEW blocks (small, safe).
        // If no cache: scan a SMALL window (to avoid rate limits) — and if it fails, stay calm.
        const cached2 = loadCache(rootLower);
        const from = cached2?.lastScannedBlock ? Math.max(0, cached2.lastScannedBlock + 1) : Math.max(0, latest - 90_000);
        const to = latest;

        // Hard cap per session to stay safe
        const MAX_SESSION_SPAN = 120_000;
        const effectiveFrom = Math.max(0, to - MAX_SESSION_SPAN, from);

        // If nothing to scan, just exit
        if (to <= effectiveFrom) return;

        // start from cached maps if present
        if (cached2) hydrateMapsFromCache(cached2);
        else {
          parentOfRef.current = new Map();
          childrenOfRef.current = new Map();
        }

        setSoftStatus((s) => (s ? s : "Updating network view…"));

        const ok = await scanLogsWindow(effectiveFrom, to);

        // If rate-limited or failed, keep UI calm, keep old cache if any
        if (!ok) {
          setSoftStatus(""); // silence
          return;
        }

        // Save updated cache
        const parentObj: Record<string, string> = {};
        parentOfRef.current.forEach((v, k) => (parentObj[k] = v));
        const childObj: Record<string, string[]> = {};
        childrenOfRef.current.forEach((v, k) => (childObj[k] = v));

        saveCache(rootLower, {
          contract: CONTRACT_ADDRESS,
          root: rootLower,
          fromBlock: cached2?.fromBlock ?? effectiveFrom,
          toBlock: to,
          lastScannedBlock: to,
          parentOf: parentObj,
          childrenOf: childObj,
          updatedAt: Date.now(),
        });

        setCacheInfo({ hasCache: true, updatedAt: Date.now() });
        recomputeDisplay();
      } catch (e: any) {
        safeConsoleWarn(e);
        // No scary UI errors
      } finally {
        scanningRef.current = false;
        setSoftStatus("");
      }
    };

    // slight delay after route mount
    const t = window.setTimeout(run, 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr, chainOk]);

  /** ========= Tree UI ========= */
  function toggleExpand(a: string) {
    const k = a.toLowerCase();
    setExpanded((p) => ({ ...p, [k]: !p[k] }));
  }

  function renderNodeRow(nodeAddr: string, level: number): React.ReactNode {
    const kids = childrenOfRef.current.get(nodeAddr) || [];
    const isOpen = Boolean(expanded[nodeAddr]);
    const pad = 10 + level * 14;

    return (
      <div
        key={`${nodeAddr}-${level}`}
        style={{
          border: "1px solid rgba(255,255,255,.10)",
          borderRadius: 16,
          padding: "10px 12px",
          background:
            "radial-gradient(circle at 18% 10%, rgba(255,90,210,.08), rgba(0,0,0,0) 52%), radial-gradient(circle at 85% 0%, rgba(90,120,255,.08), rgba(0,0,0,0) 55%), rgba(255,255,255,.02)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ paddingLeft: pad, display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <button
                className="chip"
                type="button"
                onClick={() => (kids.length ? toggleExpand(nodeAddr) : null)}
                style={{
                  padding: "6px 10px",
                  opacity: kids.length ? 1 : 0.55,
                  cursor: kids.length ? "pointer" : "default",
                }}
                title={kids.length ? "Expand/Collapse" : "No children"}
              >
                <span className="dot" />
                L{level}
                <span className="small" style={{ marginLeft: 8 }}>
                  {kids.length ? `${kids.length} child` + (kids.length === 1 ? "" : "ren") : "leaf"}
                </span>
              </button>

              <a
                className="mono"
                href={BSCSCAN_ADDR(nodeAddr)}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: "underline", fontWeight: 1000, whiteSpace: "nowrap" }}
              >
                {shortAddr(nodeAddr)}
              </a>
            </div>
          </div>

          {kids.length ? (
            <span className="chip" style={{ padding: "6px 10px" }}>
              {isOpen ? "Hide" : "Show"}
            </span>
          ) : (
            <span className="chip" style={{ padding: "6px 10px", opacity: 0.7 }}>
              —
            </span>
          )}
        </div>

        {kids.length && isOpen ? (
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {kids.slice(0, 35).map((k) => renderNodeRow(k, level + 1))}
            {kids.length > 35 ? (
              <div className="small" style={{ opacity: 0.8 }}>
                Showing first 35 children (performance).
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  const levelSummary = useMemo(() => {
    const keys = Object.keys(levels)
      .map((k) => Number(k))
      .sort((a, b) => a - b);
    return keys.map((k) => ({ level: k, count: levels[k] || 0 }));
  }, [levels]);

  const updatedText = useMemo(() => {
    if (!cacheInfo.updatedAt) return "—";
    try {
      return new Date(cacheInfo.updatedAt).toLocaleString();
    } catch {
      return "—";
    }
  }, [cacheInfo.updatedAt]);

  return (
    <div className="yf-luxe">
      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 18 }}>
        {/* HERO */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div className="small" style={{ letterSpacing: ".22em", textTransform: "uppercase" }}>
                Network Dashboard
              </div>
              <h1 style={{ marginTop: 10, marginBottom: 6 }}>Your network. Calm, clean, real.</h1>
              <div className="small">
                Contract:
                <a className="chip" href={BSCSCAN_CONTRACT} target="_blank" rel="noreferrer" style={{ marginLeft: 10, textDecoration: "none", fontWeight: 900, padding: "6px 10px" }}>
                  <span className="dot" /> BscScan
                </a>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span className="chip">
                <span className="dot" />
                <span className="mono">{addr ? shortAddr(addr) : "Not connected"}</span>
              </span>

              {!addr ? (
                <button className="btn primary" type="button" onClick={connect}>
                  Connect Wallet
                </button>
              ) : null}
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

          {softStatus ? (
            <div className="small" style={{ marginTop: 12 }}>
              {softStatus}
            </div>
          ) : null}
        </div>

        {/* TOP CARDS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 14 }}>
          <GlowCard
            title="Network Rewards"
            subtitle={`Available + reserve • ${sym}`}
            right={
              registered ? (
                <span className="chip" style={{ padding: "6px 10px" }}>
                  Reserve: <span className="mono" style={{ marginLeft: 8 }}>{formatUnits(netReserve, dec)}</span>
                </span>
              ) : (
                <span className="chip" style={{ padding: "6px 10px", opacity: 0.75 }}>Register first</span>
              )
            }
          >
            <div style={{ fontSize: 28, fontWeight: 1000, letterSpacing: "-0.02em" }}>
              {addr && registered ? formatUnits(netAvail, dec) : "—"} <span className="small">{sym}</span>
            </div>
          </GlowCard>

          <GlowCard title="Team Snapshot" subtitle="From usersExtra (on-chain)">
            <div style={{ display: "grid", gap: 10 }}>
              <StatPill label="Team count" value={addr ? teamCount.toLocaleString() : "—"} />
              <StatPill label="Directs" value={addr ? directsCount.toLocaleString() : "—"} />
              <StatPill label="Qualified directs" value={addr ? directsQuali.toLocaleString() : "—"} />
              <StatPill label="Rank" value={addr ? String(rank || 0) : "—"} />
            </div>
          </GlowCard>

          <GlowCard
            title="Your Referral Link"
            subtitle="Copy & share"
            right={
              <button
                className="btn primary"
                type="button"
                onClick={async () => {
                  const ok = await copyText(addr ? referralUrl : `${origin}/?ref=`);
                  if (ok) {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1400);
                  }
                }}
                disabled={!origin}
              >
                {copied ? "✅ Copied" : "Copy"}
              </button>
            }
          >
            <div style={{ border: "1px solid rgba(255,255,255,.10)", borderRadius: 16, background: "rgba(255,255,255,.02)", padding: "12px 12px" }}>
              <div className="mono" style={{ fontWeight: 1000, wordBreak: "break-all" }}>
                {addr ? referralUrl : `${origin}/?ref=`}
              </div>
            </div>
          </GlowCard>
        </div>

        {/* DIRECTS + TREE (no buttons, no scary errors) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, alignItems: "start" }}>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Direct referrals</h3>
            <div className="small" style={{ marginTop: 8 }}>Built quietly from cached Registration logs.</div>

            <div style={{ height: 14 }} />

            {!addr ? (
              <div className="small">Connect wallet to view.</div>
            ) : !cacheInfo.hasCache ? (
              <div className="small" style={{ opacity: 0.85 }}>
                Your network view will appear automatically once the cache is ready.
              </div>
            ) : directRefs.length === 0 ? (
              <div className="small" style={{ opacity: 0.85 }}>
                No direct referrals found in the cached window.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {directRefs.slice(0, 80).map((d) => (
                  <div
                    key={d}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                      border: "1px solid rgba(255,255,255,.10)",
                      borderRadius: 16,
                      padding: "10px 12px",
                      background: "rgba(255,255,255,.02)",
                    }}
                  >
                    <a className="mono" href={BSCSCAN_ADDR(d)} target="_blank" rel="noreferrer" style={{ textDecoration: "underline", fontWeight: 1000 }}>
                      {shortAddr(d)}
                    </a>
                    <span className="chip" style={{ padding: "6px 10px" }}>
                      <span className="dot" /> Direct
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <h3 style={{ marginTop: 0, marginBottom: 6 }}>Network tree</h3>
                <div className="small">Tap a node to expand. Depth limited to 6.</div>
              </div>

              {cacheInfo.hasCache && levelSummary.length ? (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {levelSummary.slice(0, 6).map((x) => (
                    <span key={x.level} className="chip" style={{ padding: "6px 10px" }}>
                      L{x.level}: <span className="mono" style={{ marginLeft: 8 }}>{x.count}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div style={{ height: 14 }} />

            {!addr ? (
              <div className="small">Connect wallet to view.</div>
            ) : !cacheInfo.hasCache ? (
              <div className="small" style={{ opacity: 0.85 }}>
                Tree will appear automatically when ready.
                <div className="small" style={{ marginTop: 8, opacity: 0.75 }}>
                  Last cache update: <span className="mono">{updatedText}</span>
                </div>
              </div>
            ) : directRefs.length === 0 ? (
              <div className="small" style={{ opacity: 0.85 }}>
                No tree available for current cache.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {directRefs.slice(0, 30).map((d) => renderNodeRow(d.toLowerCase(), 1))}
                {directRefs.length > 30 ? (
                  <div className="small" style={{ opacity: 0.85 }}>
                    Showing first 30 directs.
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
