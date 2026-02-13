// src/components/NavBar.tsx
// ============================================================================
// DollarDex — NavBar (NON-sticky / NON-fixed) + Mobile <details> dropdown
// - Desktop: chip navigation + theme chips
// - Mobile: native dropdown (no overlays)
// - Navbar scrolls away naturally (CSS .nav is static)
// - Closes menu on route change
// ============================================================================

import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";

type ThemeMode = "dim" | "dark" | "light";

function getInitialTheme(): ThemeMode {
  const saved = (localStorage.getItem("ddx-theme") || "").toLowerCase();
  if (saved === "dim" || saved === "dark" || saved === "light") return saved as ThemeMode;
  return "dark";
}

function applyTheme(theme: ThemeMode) {
  try {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ddx-theme", theme);
  } catch {}
}

function useIsMobile(maxWidth = 560) {
  const [m, setM] = useState(() => (typeof window !== "undefined" ? window.innerWidth <= maxWidth : false));
  useEffect(() => {
    const onResize = () => setM(window.innerWidth <= maxWidth);
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, [maxWidth]);
  return m;
}

export default function NavBar() {
  const loc = useLocation();
  const isMobile = useIsMobile(560);

  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  useEffect(() => applyTheme(theme), [theme]);

  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  // Close dropdown on route change
  useEffect(() => {
    if (detailsRef.current) detailsRef.current.open = false;
  }, [loc.pathname]);

  const chipClass = useMemo(() => {
  return ({ isActive }: { isActive: boolean }) => (isActive ? "chip ddx-chipActive" : "chip");
}, []);

const themeChip = (t: ThemeMode) => (theme === t ? "chip ddx-chipActive" : "chip");

  const Links = (
    <>
      <NavLink to="/" className="chip ddx-brandChip" aria-label="DollarDex Home">
        <span style={{ fontWeight: 1000, letterSpacing: "-0.2px" }}>DollarDex</span>
      </NavLink>

      <NavLink to="/" end className={chipClass}>
        Home
      </NavLink>
      <NavLink to="/app" end className={chipClass}>
        Dashboard
      </NavLink>
      <NavLink to="/app/referral" className={chipClass}>
        Referral
      </NavLink>
      <NavLink to="/app/network" className={chipClass}>
        Network
      </NavLink>
      <NavLink to="/app/contract" className={chipClass}>
        Contract
      </NavLink>
      <NavLink to="/app/about" className={chipClass}>
        About
      </NavLink>
    </>
  );

  const ThemeButtons = (
    <>
      <button className={themeChip("dim")} onClick={() => setTheme("dim")} type="button" aria-pressed={theme === "dim"}>
        <span className="dot" /> Dim
      </button>
      <button className={themeChip("dark")} onClick={() => setTheme("dark")} type="button" aria-pressed={theme === "dark"}>
        <span className="dot" /> Dark
      </button>
      <button
        className={themeChip("light")}
        onClick={() => setTheme("light")}
        type="button"
        aria-pressed={theme === "light"}
      >
        <span className="dot" /> Light
      </button>
    </>
  );

  return (
    <header className="nav">
      <div className="wrap nav-inner">
        {/* Desktop */}
        {!isMobile ? (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>{Links}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
              {ThemeButtons}
            </div>
          </>
        ) : (
          /* Mobile: native dropdown */
          <>
            <style>{`
              /* Make <summary> look like a chip */
              .ddx-summary {
                list-style: none;
                cursor: pointer;
                user-select: none;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
              }
              details > summary::-webkit-details-marker { display: none; }
              summary::marker { content: ""; }

              .ddx-menuPanel {
                margin-top: 10px;
                border-radius: 18px;
                border: 1px solid rgba(255,255,255,.10);
                background:
                  radial-gradient(circle at 25% 10%, rgba(255,90,210,.14), rgba(0,0,0,0) 55%),
                  radial-gradient(circle at 85% 0%, rgba(90,120,255,.12), rgba(0,0,0,0) 55%),
                  rgba(18,18,18,.78);
                backdrop-filter: blur(14px);
                padding: 12px;
              }

              /* Ensure menu is scrollable if long */
              .ddx-menuScroll {
                max-height: 65vh;
                overflow: auto;
                -webkit-overflow-scrolling: touch;
                display: grid;
                gap: 10px;
              }

              /* Make chips full width in dropdown so taps always hit */
              .ddx-menuPanel .chip {
                width: 100%;
                text-decoration: none;
                display: inline-flex;
                justify-content: flex-start;
              }

              .ddx-sep {
                height: 1px;
                background: rgba(255,255,255,.08);
                margin: 6px 0;
              }
            `}</style>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <span className="chip ddx-brandChip">DollarDex</span>

              <details ref={detailsRef} style={{ width: "min(70vw, 360px)" }}>
                <summary className="chip ddx-summary">
                  Menu <span style={{ opacity: 0.8 }}>▾</span>
                </summary>

                <div className="ddx-menuPanel">
                  <div className="ddx-menuScroll">
                    {Links}
                    <div className="ddx-sep" />
                    {ThemeButtons}
                  </div>
                </div>
              </details>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
