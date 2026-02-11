// src/components/TxButton.tsx
// ============================================================================
// DollarDex — TxButton (HARDENED: STEP 13.7)
// - Wrap any async tx action with safe UX states
// - Never throws into React
// ============================================================================

import { useState } from "react";

type Props = {
  className?: string;
  label: string;
  onAction: () => Promise<string | void>; // return tx hash optional
};

export default function TxButton({ className, label, onAction }: Props) {
  const [state, setState] = useState<"idle" | "signing" | "pending" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string>("");

  const run = async () => {
    setMsg("");
    setState("signing");

    try {
      const out = await onAction();
      // If action returns a tx hash, treat as pending->done pattern (caller may wait())
      if (typeof out === "string" && out.length > 10) {
        setState("pending");
        setMsg(`Tx: ${out.slice(0, 10)}…`);
      }
      // Caller may have awaited confirmations already; either way mark done.
      setState("done");
      setTimeout(() => setState("idle"), 2500);
    } catch (e: any) {
      const m = e?.shortMessage || e?.message || "Transaction failed.";
      setState("error");
      setMsg(m);
      setTimeout(() => setState("idle"), 3500);
    }
  };

  const text =
    state === "idle" ? label : state === "signing" ? "Confirm in wallet…" : state === "pending" ? "Pending…" : state === "done" ? "Success ✓" : "Failed";

  const disabled = state !== "idle";

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button className={className} onClick={run} disabled={disabled}>
        {text}
      </button>
      {msg ? <div className="ddx-muted">{msg}</div> : null}
    </div>
  );
}
