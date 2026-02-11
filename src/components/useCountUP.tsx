// src/components/useCountUp.ts
// ============================================================================
// useCountUp — Smooth animated number display (no libs)
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const safeParse = (s: string) => {
  const t = String(s ?? "").trim();
  if (!t) return 0;
  const x = Number.parseFloat(t.replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};

export function useCountUp(value: string, opts?: { ms?: number; decimals?: number }) {
  const ms = opts?.ms ?? 520;
  const decimals = opts?.decimals ?? 0;

  const target = useMemo(() => safeParse(value), [value]);
  const [shown, setShown] = useState<number>(target);

  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const fromRef = useRef<number>(target);
  const toRef = useRef<number>(target);

  useEffect(() => {
    const from = shown;
    const to = target;

    fromRef.current = from;
    toRef.current = to;
    startRef.current = performance.now();

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = (t: number) => {
      const p = clamp((t - startRef.current) / ms, 0, 1);
      const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const v = fromRef.current + (toRef.current - fromRef.current) * e;
      setShown(v);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return shown.toFixed(decimals);
}
