// src/components/FadeRoute.tsx
// ============================================================================
// STEP 14.3 — FadeRoute
// Simple route transition wrapper (no libraries)
// ============================================================================

import { useEffect, useState } from "react";

export default function FadeRoute({ children }: { children: React.ReactNode }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setOn(true), 10);
    return () => window.clearTimeout(t);
  }, []);

  return <div className={`ddx-route ${on ? "ddx-routeOn" : ""}`}>{children}</div>;
}
