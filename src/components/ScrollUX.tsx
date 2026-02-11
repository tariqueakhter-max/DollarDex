// src/components/ScrollUX.tsx
// ============================================================================
// STEP 14.6 — ScrollUX
// - Top progress glow bar
// - Floating back-to-top button
// ============================================================================

import { useEffect, useState } from "react";

export default function ScrollUX() {
  const [p, setP] = useState(0); // 0..1
  const [show, setShow] = useState(false);

  useEffect(() => {
    let raf: number | null = null;

    const calc = () => {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - doc.clientHeight);
      const y = Math.max(0, Math.min(max, window.scrollY || 0));
      const v = y / max;

      setP(v);
      setShow(y > 420);
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        calc();
      });
    };

    calc();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll as any);
      window.removeEventListener("resize", onScroll as any);
    };
  }, []);

  const top = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <>
      {/* Progress bar */}
      <div className="ddx-progressWrap" aria-hidden="true">
        <div className="ddx-progressBar" style={{ transform: `scaleX(${p})` }} />
      </div>

      {/* Back to top */}
      <button
        className={`ddx-topBtn ${show ? "isOn" : ""}`}
        onClick={top}
        aria-label="Back to top"
        title="Back to top"
      >
        ↑
      </button>
    </>
  );
}
