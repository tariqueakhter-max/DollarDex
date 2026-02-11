// src/pages/NetworkDashboard.tsx
// ============================================================================
// DollarDex — Network Dashboard (STEP 11.2)
// - Premium layout using existing CSS tokens/classes: wrap, card, chip, dot, btn, small
// - OPTION A (event exists) — LOCKED event signature for maximum speed:
//      event Register(address indexed user, address indexed referrer)
// - Builds direct referrals + expandable tree from event logs
// - Caching:
//    - Stores adjacency lists (childrenOf, parentOf), scan window, and last scanned block in localStorage
//    - Next load is instant
// - Resume scan:
//    - Scans only NEW blocks since last scanned block
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserProvider, Contract, Interface, JsonRpcProvider, formatUnits } from "ethers";
import "../lido-luxury.css";
import "../luxury.css";
import "../luxury-themes.css";
import "../dollardex-blackgold-overrides.css";

/** ========= Config ========= */
const RPC_URL =
  (import.meta as any).env?.VITE_BSC_RPC?.toString?.() || "https://bsc-dataseed.binance.org/";

const CONTRACT_ADDRESS = "0xd583327F81fA70d0f30A775dd7E0390B26E324cb";
const BSCSCAN_CONTRACT = `https://bscscan.com/address/${CONTRACT_ADDRESS}`;
const BSCSCAN_ADDR = (a: string) => `https://bscscan.com/address/${a}`;

const BSC_CHAIN_ID_DEC = 56;
const rpc = new JsonRpcProvider(RPC_URL);

/** ========= ABIs ========= */
const YF_ABI = [
  "function USDT() view returns(address)",
  "function users(address) view returns(address,bool,uint256,uint256,uint256,uint256,uint256)",
  "function usersExtra(address) view returns(uint256,uint256,uint256,uint256,uint256,uint256,uint32,uint32,uint32,uint8)",
  "function getNetworkRewards(address) view returns(uint256,uint256)"
];

const ERC20_ABI = ["function symbol() view returns(string)", "function decimals() view returns(uint8)"];

// ✅ LOCKED referral event (as you said: "Register")
const REF_EVENT_ABI = "event Register(address indexed user, address indexed referrer)";

/** ========= Cache ========= */
const CACHE_VERSION = "v1";
const LS_KEY = (rootAddrLower: string) => `ddx_net_cache_${CACHE_VERSION}_${CONTRACT_ADDRESS.toLowerCase()}_${rootAddrLower}`;

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
function shortAddr(a: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
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

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
      <div className="small">{label}</div>
      <div style={{ fontWeight: 1000 }}>{value}</div>
    </div>
  );
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

type TreeNode = { addr: string; level: number; parent?: string; children: string[] };

type CachePayload = {
  contract: string;
  root: string;
  scanSpan: number;
  fromBlock: number;
  toBlock: number;
  lastScannedBlock: number;
  // adjacency lists as plain objects for JSON
  parentOf: Record<string, string>;
  childrenOf: Record<string, string[]>;
};

/** ========= Page ========= */
export default function NetworkDashboard() {
  const yfRead = useMemo(() => new Contract(CONTRACT_ADDRESS, YF_ABI, rpc), []);

  // Locked interface + topic0
  const refIface = useMemo(() => new Interface([REF_EVENT_ABI]), []);
  const refTopic0 = useMemo(() => {
    try {
const ev = refIface.getEvent("Register");
return ev?.topicHash ?? "";

    } catch {
      return "";
    }
  }, [refIface]);

  // Wallet state
  const [addr, setAddr] = useState("");
  const [chainOk, setChainOk] = useState(true);

  // Token meta
  const [sym, setSym] = useState("USDT");
  const [dec, setDec] = useState(18);

  // User core
  const [registered, setRegistered] = useState(false);
  const [referrer, setReferrer] = useState("");
  const [myActiveDeposit, setMyActiveDeposit] = useState<bigint>(0n);
  const [myTotalDeposit, setMyTotalDeposit] = useState<bigint>(0n);
  const [myTotalWithdrawn, setMyTotalWithdrawn] = useState<bigint>(0n);

  // Network rewards
  const [netAvail, setNetAvail] = useState<bigint>(0n);
  const [netReserve, setNetReserve] = useState<bigint>(0n);

  // Extra tuple (raw)
  const [extra, setExtra] = useState<(bigint | number)[] | null>(null);

  // Referral scan config
  const DEFAULT_SPAN = 200_000;
  const STEP_OLDER = 200_000;
  const HARD_MAX_SPAN = 2_000_000;

  const [scanSpan, setScanSpan] = useState<number>(DEFAULT_SPAN);
  const [scanStatus, setScanStatus] = useState<string>("Not scanned yet.");
  const [scanLoading, setScanLoading] = useState(false);
  const [scanFromBlock, setScanFromBlock] = useState<number>(0);
  const [scanToBlock, setScanToBlock] = useState<number>(0);
  const [lastScannedBlock, setLastScannedBlock] = useState<number>(0);

  // Graph maps
  const parentOfRef = useRef<Map<string, string>>(new Map()); // child -> parent
  const childrenOfRef = useRef<Map<string, string[]>>(new Map()); // parent -> children

  // Derived display state
  const [directRefs, setDirectRefs] = useState<string[]>([]);
  const [teamNodes, setTeamNodes] = useState<TreeNode[]>([]);
  const [levels, setLevels] = useState<Record<number, number>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // UX
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<string>("");

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
        setMsg("No wallet detected. Install MetaMask.");
        return;
      }
      const bp = new BrowserProvider(eth);
      await bp.send("eth_requestAccounts", []);
      await syncWalletSilent();
      setMsg("");
    } catch (e: any) {
      setMsg(e?.message || "Connect failed.");
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

  /** ========= User refresh ========= */
  async function refreshUser() {
    try {
      setMsg("");

      const _usdt = await yfRead.USDT();
      try {
        const erc = new Contract(_usdt, ERC20_ABI, rpc);
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
        setMyActiveDeposit(0n);
        setMyTotalDeposit(0n);
        setMyTotalWithdrawn(0n);
        setNetAvail(0n);
        setNetReserve(0n);
        setExtra(null);
        return;
      }

      const u = await yfRead.users(addr);
      setReferrer(String(u[0]));
      setRegistered(Boolean(u[1]));
      setMyActiveDeposit(BigInt(u[2]));
      setMyTotalDeposit(BigInt(u[5]));
      setMyTotalWithdrawn(BigInt(u[6]));

      try {
        const nR = await yfRead.getNetworkRewards(addr);
        setNetAvail(BigInt(nR[0]));
        setNetReserve(BigInt(nR[1]));
      } catch {
        setNetAvail(0n);
        setNetReserve(0n);
      }

      try {
        const ex = await yfRead.usersExtra(addr);
        const arr: (bigint | number)[] = [];
        for (let i = 0; i < 10; i++) {
          const v = ex[i];
          arr.push(typeof v === "bigint" ? v : Number(v));
        }
        setExtra(arr);
      } catch {
        setExtra(null);
      }
    } catch (e: any) {
      setMsg(e?.message || "Failed to load network data.");
    }
  }

  useEffect(() => {
    refreshUser();
    const t = window.setInterval(refreshUser, 12_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr]);

  /** ========= Cache helpers ========= */
  function saveCache(rootLower: string, payload: CachePayload) {
    try {
      localStorage.setItem(LS_KEY(rootLower), JSON.stringify(payload));
    } catch {
      // ignore
    }
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

    setScanSpan(payload.scanSpan || DEFAULT_SPAN);
    setScanFromBlock(payload.fromBlock || 0);
    setScanToBlock(payload.toBlock || 0);
    setLastScannedBlock(payload.lastScannedBlock || payload.toBlock || 0);
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

  function parseRegisterLog(log: any): { user: string; ref: string } | null {
    try {
      const parsed = refIface.parseLog(log);
      const args: any = (parsed as any).args;
      const user = args.user ?? args[0];
      const ref = args.referrer ?? args[1];
      const u = typeof user === "string" ? user : String(user);
      const r = typeof ref === "string" ? ref : String(ref);
      if (u && u.startsWith("0x") && r && r.startsWith("0x")) return { user: u, ref: r };
    } catch {
      // ignore
    }
    return null;
  }

  async function scanLogs(fromBlock: number, toBlock: number) {
    if (!refTopic0) return { totalLogs: 0, parsedEdges: 0 };

    const CHUNK = 30_000;
    let totalLogs = 0;
    let parsedEdges = 0;

    for (let start = fromBlock; start <= toBlock; start += CHUNK + 1) {
      const end = Math.min(toBlock, start + CHUNK);

      const logs = await rpc.getLogs({
        address: CONTRACT_ADDRESS,
        fromBlock: start,
        toBlock: end,
        topics: [refTopic0]
      });

      totalLogs += logs.length;

      for (const lg of logs) {
        const pr = parseRegisterLog(lg);
        if (!pr) continue;
        addEdge(pr.ref, pr.user);
        parsedEdges++;
      }
    }

    return { totalLogs, parsedEdges };
  }

  function buildTreeForRoot(root: string, maxDepth: number) {
    const rootL = root.toLowerCase();
    const q: { addr: string; level: number }[] = [{ addr: rootL, level: 0 }];

    const nodes: TreeNode[] = [];
    const seen = new Set<string>([rootL]);
    const levelCount: Record<number, number> = {};
    const direct = childrenOfRef.current.get(rootL) || [];

    while (q.length) {
      const cur = q.shift()!;
      const kids = childrenOfRef.current.get(cur.addr) || [];
      nodes.push({
        addr: cur.addr,
        level: cur.level,
        parent: parentOfRef.current.get(cur.addr),
        children: kids
      });

      if (cur.level > 0) levelCount[cur.level] = (levelCount[cur.level] || 0) + 1;
      if (cur.level >= maxDepth) continue;

      for (const k of kids) {
        if (seen.has(k)) continue;
        seen.add(k);
        q.push({ addr: k, level: cur.level + 1 });
      }
    }

    return { direct: uniq(direct), nodes, levelCount };
  }

  function recomputeDisplay() {
    if (!addr) {
      setDirectRefs([]);
      setTeamNodes([]);
      setLevels({});
      return;
    }
    const { direct, nodes, levelCount } = buildTreeForRoot(addr, 6);
    setDirectRefs(direct);
    setTeamNodes(nodes.filter((n) => n.level > 0));
    setLevels(levelCount);
  }

  /** ========= Scanning actions ========= */
  async function scanNow(spanOverride?: number) {
    if (!addr) {
      setScanStatus("Connect wallet to scan network.");
      return;
    }
    if (scanLoading) return;

    setScanLoading(true);
    setMsg("");

    try {
      const latest = await rpc.getBlockNumber();

      const span = Math.max(10_000, Math.min(HARD_MAX_SPAN, spanOverride ?? scanSpan));
      const from = Math.max(0, latest - span);
      const to = latest;

      setScanSpan(span);
      setScanFromBlock(from);
      setScanToBlock(to);
      setScanStatus(`Scanning blocks ${from} → ${to}…`);

      // fresh rebuild
      parentOfRef.current = new Map();
      childrenOfRef.current = new Map();

      const { totalLogs, parsedEdges } = await scanLogs(from, to);

      setLastScannedBlock(to);

      recomputeDisplay();

      const rootLower = addr.toLowerCase();
      // Save cache
      const parentObj: Record<string, string> = {};
      parentOfRef.current.forEach((v, k) => (parentObj[k] = v));
      const childObj: Record<string, string[]> = {};
      childrenOfRef.current.forEach((v, k) => (childObj[k] = v));

      saveCache(rootLower, {
        contract: CONTRACT_ADDRESS,
        root: rootLower,
        scanSpan: span,
        fromBlock: from,
        toBlock: to,
        lastScannedBlock: to,
        parentOf: parentObj,
        childrenOf: childObj
      });

      if (parsedEdges === 0) {
        setScanStatus(`No Register events found in this window. Try “Load older” or increase scan span.`);
      } else {
        const teamSize = Math.max(0, buildTreeForRoot(addr, 6).nodes.length - 1);
        setScanStatus(`Scan complete: ${parsedEdges} edges from ${totalLogs} logs. Direct: ${directRefs.length}. Team (window): ${teamSize}.`);
      }
    } catch (e: any) {
      setScanStatus("Scan failed.");
      setMsg(e?.message || "Failed to scan Register events.");
    } finally {
      setScanLoading(false);
    }
  }

  async function resumeScan() {
    if (!addr) {
      setScanStatus("Connect wallet to resume scan.");
      return;
    }
    if (scanLoading) return;

    const rootLower = addr.toLowerCase();
    const cached = loadCache(rootLower);
    if (!cached || !cached.lastScannedBlock) {
      setScanStatus("No cache found. Run Scan Now first.");
      return;
    }

    setScanLoading(true);
    setMsg("");

    try {
      const latest = await rpc.getBlockNumber();
      const from = Math.max(cached.lastScannedBlock + 1, 0);
      const to = latest;

      if (to <= from) {
        setScanStatus(`Up to date. Last scanned block: ${cached.lastScannedBlock.toLocaleString()}.`);
        setScanLoading(false);
        return;
      }

      // Hydrate maps from cache, then scan only new blocks
      hydrateMapsFromCache(cached);

      setScanStatus(`Resuming scan: ${from} → ${to}…`);

      const { totalLogs, parsedEdges } = await scanLogs(from, to);

      setScanFromBlock(cached.fromBlock || Math.max(0, latest - (cached.scanSpan || scanSpan)));
      setScanToBlock(to);
      setLastScannedBlock(to);

      recomputeDisplay();

      // Save updated cache
      const parentObj: Record<string, string> = {};
      parentOfRef.current.forEach((v, k) => (parentObj[k] = v));
      const childObj: Record<string, string[]> = {};
      childrenOfRef.current.forEach((v, k) => (childObj[k] = v));

      saveCache(rootLower, {
        contract: CONTRACT_ADDRESS,
        root: rootLower,
        scanSpan: cached.scanSpan || scanSpan,
        fromBlock: cached.fromBlock || scanFromBlock,
        toBlock: to,
        lastScannedBlock: to,
        parentOf: parentObj,
        childrenOf: childObj
      });

      setScanStatus(`Resume complete: +${parsedEdges} new edges from ${totalLogs} logs. Now up to block ${to.toLocaleString()}.`);
    } catch (e: any) {
      setScanStatus("Resume failed.");
      setMsg(e?.message || "Failed to resume scan.");
    } finally {
      setScanLoading(false);
    }
  }

  async function loadOlder() {
    const next = Math.min(HARD_MAX_SPAN, scanSpan + STEP_OLDER);
    setScanSpan(next);
    await scanNow(next);
  }

  function toggleExpand(a: string) {
    const k = a.toLowerCase();
    setExpanded((p) => ({ ...p, [k]: !p[k] }));
  }

  function renderNodeRow(nodeAddr: string, level: number) {
    const kids = childrenOfRef.current.get(nodeAddr) || [];
    const isOpen = Boolean(expanded[nodeAddr]);
    const pad = 10 + level * 14;

    return (
      <div
        key={`${nodeAddr}-${level}`}
        style={{
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "10px 12px",
          background: "rgba(255,255,255,.03)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ paddingLeft: pad, display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <button
                className="chip"
                type="button"
                onClick={() => (kids.length ? toggleExpand(nodeAddr) : null)}
                style={{ padding: "6px 10px", opacity: kids.length ? 1 : 0.55, cursor: kids.length ? "pointer" : "default" }}
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
              {isOpen ? "Hide" : "Show"} children
            </span>
          ) : (
            <span className="chip" style={{ padding: "6px 10px", opacity: 0.7 }}>
              —
            </span>
          )}
        </div>

        {kids.length && isOpen ? (
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {kids.slice(0, 80).map((k) => renderNodeRow(k, level + 1))}
            {kids.length > 80 ? (
              <div className="small" style={{ opacity: 0.8 }}>
                Showing first 80 children only (safety). Tell me if you want pagination.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  /** ========= Load cache on wallet connect ========= */
  useEffect(() => {
    if (!addr) return;

    const rootLower = addr.toLowerCase();
    const cached = loadCache(rootLower);
    if (!cached) {
      setScanStatus("No cache yet. Run Scan Now.");
      return;
    }

    hydrateMapsFromCache(cached);
    recomputeDisplay();

    setScanStatus(
      `Loaded cache: ${cached.fromBlock.toLocaleString()} → ${cached.toBlock.toLocaleString()} (last scanned: ${cached.lastScannedBlock.toLocaleString()}).`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr]);

  const walletChip = useMemo(() => {
    if (!hasWallet()) return <span className="chip">No wallet detected</span>;
    if (!addr) return <span className="chip">Wallet detected (not connected)</span>;
    return (
      <span className="chip">
        <span className="dot" />
        <span className="mono">{chainOk ? "BSC" : "Wrong Net"}</span>
        <span className="mono">{shortAddr(addr)}</span>
      </span>
    );
  }, [addr, chainOk]);

  const teamSize = useMemo(() => teamNodes.length, [teamNodes]);

  const levelSummary = useMemo(() => {
    const keys = Object.keys(levels)
      .map((k) => Number(k))
      .sort((a, b) => a - b);
    return keys.map((k) => ({ level: k, count: levels[k] || 0 }));
  }, [levels]);

  return (
    <div className="yf-luxe">
      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 18 }}>
        {/* Header */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div className="small" style={{ letterSpacing: ".22em", textTransform: "uppercase" }}>
                Network Dashboard
              </div>
              <h1 style={{ marginTop: 10, marginBottom: 6 }}>Your network. Your rewards.</h1>
              <div className="small">
                Tree is built from locked event: <span className="mono">Register(user, referrer)</span>.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {walletChip}
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

          {msg ? (
            <div className="small" style={{ marginTop: 12 }}>
              {msg}
            </div>
          ) : null}
        </div>

        {/* Main grid */}
        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 14,
            alignItems: "start"
          }}
        >
          {/* Referral link */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Your referral link</h3>
            <div className="small" style={{ marginTop: 8 }}>
              Share this link (landing uses <span className="mono">?ref=</span>).
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
                Link
              </div>
              <div className="mono" style={{ fontWeight: 1000, wordBreak: "break-all" }}>
                {addr ? referralUrl : `${origin}/?ref=`}
              </div>
            </div>

            <div style={{ height: 12 }} />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn primary" type="button" onClick={async () => {
                const ok = await copyText(addr ? referralUrl : `${origin}/?ref=`);
                if (ok) {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1400);
                }
              }} disabled={!origin}>
                {copied ? "✅ Copied" : "Copy Link"}
              </button>

              {addr ? (
                <a
                  className="chip"
                  href={BSCSCAN_ADDR(addr)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: "none", fontWeight: 900 }}
                >
                  <span className="dot" /> View wallet on BscScan
                </a>
              ) : null}
            </div>
          </div>

          {/* On-chain rewards */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Network rewards (on-chain)</h3>

            {!addr ? (
              <div className="small">Connect wallet to load your network rewards.</div>
            ) : !registered ? (
              <div className="small">Not registered yet. Register on Dashboard first.</div>
            ) : (
              <>
                <div className="small" style={{ marginTop: 8 }}>
                  Token: <b style={{ color: "var(--text)" as any }}>{sym}</b>
                </div>

                <div style={{ height: 14 }} />

                <div style={{ display: "grid", gap: 12 }}>
                  <StatRow label="Available now" value={<span>{formatUnits(netAvail, dec)} {sym}</span>} />
                  <StatRow label="Reserve included" value={<span>{formatUnits(netReserve, dec)} {sym}</span>} />
                </div>
              </>
            )}
          </div>

          {/* Identity */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Your network identity</h3>

            {!addr ? (
              <div className="small">Connect wallet to load.</div>
            ) : (
              <>
                <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
                  <StatRow
                    label="Registered"
                    value={
                      <span className="chip" style={{ fontWeight: 900 }}>
                        <span className="dot" />
                        {registered ? "Yes" : "No"}
                      </span>
                    }
                  />
                  <StatRow
                    label="Referrer"
                    value={
                      referrer && referrer !== "0x0000000000000000000000000000000000000000" ? (
                        <a className="mono" href={BSCSCAN_ADDR(referrer)} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                          {shortAddr(referrer)}
                        </a>
                      ) : (
                        <span className="mono">—</span>
                      )
                    }
                  />
                  <div style={{ height: 2 }} />
                  <StatRow label="Active deposit" value={<span>{formatUnits(myActiveDeposit, dec)} {sym}</span>} />
                  <StatRow label="Total deposited" value={<span>{formatUnits(myTotalDeposit, dec)} {sym}</span>} />
                  <StatRow label="Total withdrawn" value={<span>{formatUnits(myTotalWithdrawn, dec)} {sym}</span>} />
                </div>

                <div style={{ height: 14 }} />

                <a className="chip" href={BSCSCAN_CONTRACT} target="_blank" rel="noreferrer" style={{ textDecoration: "none", fontWeight: 900 }}>
                  <span className="dot" /> View contract on BscScan
                </a>
              </>
            )}
          </div>

          {/* Scan controls + summary */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Referral scan (cached + resume)</h3>

            <div className="small" style={{ marginTop: 8 }}>
              Event locked to <span className="mono">Register</span>. Cache makes loads instant.
            </div>

            <div style={{ height: 14 }} />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span className="chip" style={{ padding: "6px 10px" }}>
                Window: <span className="mono">{scanSpan.toLocaleString()}</span> blocks
              </span>
              {scanFromBlock && scanToBlock ? (
                <span className="chip" style={{ padding: "6px 10px" }}>
                  {scanFromBlock.toLocaleString()} → {scanToBlock.toLocaleString()}
                </span>
              ) : null}
              {lastScannedBlock ? (
                <span className="chip" style={{ padding: "6px 10px" }}>
                  Last scanned: <span className="mono">{lastScannedBlock.toLocaleString()}</span>
                </span>
              ) : null}
            </div>

            <div style={{ height: 12 }} />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn primary" type="button" onClick={() => scanNow()} disabled={!addr || scanLoading}>
                {scanLoading ? "Working…" : "Scan Now"}
              </button>

              <button className="btn" type="button" onClick={resumeScan} disabled={!addr || scanLoading}>
                Resume scan (new blocks)
              </button>

              <button className="btn" type="button" onClick={loadOlder} disabled={!addr || scanLoading || scanSpan >= HARD_MAX_SPAN}>
                {scanSpan >= HARD_MAX_SPAN ? "Max window reached" : "Load older (+200k)"}
              </button>

              <button
                className="btn"
                type="button"
                onClick={() => {
                  const v = prompt("Enter scan window (blocks), e.g. 200000", String(scanSpan));
                  if (!v) return;
                  const n = Math.max(10_000, Math.min(HARD_MAX_SPAN, Number(v)));
                  if (!Number.isFinite(n)) return;
                  setScanSpan(n);
                }}
                disabled={scanLoading}
              >
                Set window
              </button>
            </div>

            <div className="small" style={{ marginTop: 12 }}>
              Status: <b style={{ color: "var(--text)" as any }}>{scanStatus}</b>
            </div>

            <div style={{ height: 12 }} />

            <div style={{ display: "grid", gap: 10 }}>
              <StatRow label="Direct referrals (in cache/window)" value={<span className="mono">{directRefs.length}</span>} />
              <StatRow label="Team size (in cache/window)" value={<span className="mono">{teamSize}</span>} />
            </div>

            {levelSummary.length ? (
              <>
                <div style={{ height: 14 }} />
                <div className="small">Levels (in cache/window)</div>
                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {levelSummary.map((x) => (
                    <span key={x.level} className="chip" style={{ padding: "6px 10px" }}>
                      L{x.level}: <span className="mono">{x.count}</span>
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          {/* Direct referrals */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Direct referrals</h3>
            <div className="small" style={{ marginTop: 8 }}>
              Users where <span className="mono">referrer == your wallet</span> (from cached/event logs).
            </div>

            <div style={{ height: 14 }} />

            {!addr ? (
              <div className="small">Connect wallet to scan.</div>
            ) : directRefs.length === 0 ? (
              <div className="small">None found in current cache/window. Try “Load older”.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {directRefs.slice(0, 120).map((d) => (
                  <div
                    key={d}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      padding: "10px 12px",
                      background: "rgba(255,255,255,.03)"
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

          {/* Tree */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Network tree</h3>
            <div className="small" style={{ marginTop: 8 }}>
              Expand nodes to explore. (Depth limited to 6 for performance.)
            </div>

            <div style={{ height: 14 }} />

            {!addr ? (
              <div className="small">Connect wallet to scan.</div>
            ) : directRefs.length === 0 ? (
              <div className="small">No tree in current cache/window. Scan / load older.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {directRefs.slice(0, 40).map((d) => renderNodeRow(d.toLowerCase(), 1))}
              </div>
            )}

            <div style={{ height: 14 }} />

            <div className="small">
              Tip: Use <b>Resume scan</b> daily — it only scans new blocks, so it stays fast.
            </div>
          </div>

          {/* Extra raw */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Extra (raw on-chain)</h3>
            <div className="small" style={{ marginTop: 8 }}>
              Data from <span className="mono">usersExtra(address)</span>.
            </div>

            <div style={{ height: 14 }} />

            {!addr ? (
              <div className="small">Connect wallet to load.</div>
            ) : extra ? (
              <div style={{ display: "grid", gap: 10 }}>
                {extra.map((v, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div className="small">Field [{i}]</div>
                    <div className="mono" style={{ fontWeight: 1000 }}>
                      {typeof v === "bigint" ? v.toString() : String(v)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="small">Not available.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
