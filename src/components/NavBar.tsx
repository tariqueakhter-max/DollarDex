// src/components/NavBar.tsx
// ============================================================================
// DollarDex — Desktop NavBar (FINAL FIXED)
// - Home ALWAYS routes to "/"
// - App pages under "/app/*"
// - Theme toggle: dim | dark | light
// - Always visible on ALL pages
// ============================================================================

import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

type ThemeMode = "dim" | "dark" | "light";
const THEME_KEY = "ddx_theme";

/* ========= Theme helpers ========= */
function readTheme(): ThemeMode {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dim" || attr === "dark" || attr === "light") return attr;

  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === "dim" || raw === "dark" || raw === "light") return raw;
  } catch {}

  return "dark";
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {}
}

export default function NavBar() {
  const [theme, setTheme] = useState<ThemeMode>(() => readTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const chipClass = ({ isActive }: { isActive: boolean }) =>
    "chip" + (isActive ? " is-active" : "");

  const themeChip = (mode: ThemeMode) =>
    "chip" + (theme === mode ? " is-active" : "");

  return (
    <header className="nav">
      <div className="wrap nav-inner">

        {/* LEFT: Brand + navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* Brand */}
          <NavLink to="/" className="chip" aria-label="DollarDex Home">
            <span style={{ fontWeight: 1000, letterSpacing: "-0.2px" }}>
              DollarDex
            </span>
          </NavLink>

          {/* Core navigation */}
          <NavLink to="/" end className={chipClass}>
            Home
          </NavLink>

          <NavLink to="/app" end className={chipClass}>
            Dashboard
          </NavLink>

          {/* Always-visible App navigation */}
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
        </div>

        {/* RIGHT: Theme toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className={themeChip("dim")}
            onClick={() => setTheme("dim")}
            aria-pressed={theme === "dim"}
            title="Dim theme"
          >
            <span className="dot" />
            Dim
          </button>

          <button
            type="button"
            className={themeChip("dark")}
            onClick={() => setTheme("dark")}
            aria-pressed={theme === "dark"}
            title="Dark theme"
          >
            <span className="dot" />
            Dark
          </button>

          <button
            type="button"
            className={themeChip("light")}
            onClick={() => setTheme("light")}
            aria-pressed={theme === "light"}
            title="Light theme"
          >
            <span className="dot" />
            Light
          </button>
        </div>

      </div>
    </header>
  );
}
