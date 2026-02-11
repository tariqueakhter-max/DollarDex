// src/routes.tsx
// ============================================================================
// DollarDex — Routes (FINAL CORRECT STRUCTURE)
// - NavBar visible on "/" and "/app/*"
// - App pages nested properly
// ============================================================================

import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./AppLayout";

import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Referral from "./pages/Referral";
import NetworkDashboard from "./pages/NetworkDashboard";
import ContractPage from "./pages/ContractPage";
import AboutPage from "./pages/AboutPage";

/* ========= 404 ========= */
function NotFound() {
  return (
    <div className="yf-luxe">
      <div className="wrap" style={{ paddingTop: 32 }}>
        <div className="card">
          <h2>Page not found</h2>
          <div className="small">The page you’re looking for doesn’t exist.</div>
        </div>
      </div>
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* Layout wraps EVERYTHING */}
      <Route element={<AppLayout />}>

        {/* Landing now has NavBar */}
        <Route path="/" element={<Landing />} />

        {/* App main */}
        <Route path="/app" element={<Dashboard />} />

        {/* App sub-pages */}
        <Route path="/app/referral" element={<Referral />} />
        <Route path="/app/network" element={<NetworkDashboard />} />
        <Route path="/app/contract" element={<ContractPage />} />
        <Route path="/app/about" element={<AboutPage />} />

        {/* Safety redirect */}
        <Route path="/app/dashboard" element={<Navigate to="/app" replace />} />

        {/* Global 404 */}
        <Route path="*" element={<NotFound />} />

      </Route>
    </Routes>
  );
}
