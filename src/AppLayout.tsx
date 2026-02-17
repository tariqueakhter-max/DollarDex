// src/AppLayout.tsx
import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import NavBar from "./components/NavBar";
import NetworkGuard from "./components/NetworkGuard";
import Footer from "./components/Footer";

export default function AppLayout() {
  const location = useLocation();
  const [pageKey, setPageKey] = useState(location.pathname);

  // Smooth scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [location.pathname]);

  // Trigger animation on route change
  useEffect(() => {
    setPageKey(location.pathname);
  }, [location.pathname]);

  return (
    <div className="ddx-app">
      <NavBar />

      <NetworkGuard>
        <div
          key={pageKey}
          className="ddx-page-wrapper"
        >
          <Outlet />
        </div>
      </NetworkGuard>

      <Footer />

      {/* Page animation styles */}
      <style>
        {`
          .ddx-page-wrapper {
            animation: ddxPageFade .22s ease-out;
          }

          @keyframes ddxPageFade {
            from {
              opacity: 0;
              transform: translateY(6px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}
      </style>
    </div>
  );
}
