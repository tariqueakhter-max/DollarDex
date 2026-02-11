// src/routes.tsx
// ============================================================================
// DollarDex — Routes (SAFE / COMPILES)
// - Landing at "/"
// - App pages under "/app/*" using AppLayout
// - Missing pages are STUBBED locally (no missing imports)
// ============================================================================

import AboutPage from "./pages/AboutPage";
import ContractPage from "./pages/ContractPage";
import NetworkDashboard from "./pages/NetworkDashboard";
import Referral from "./pages/Referral";
import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./AppLayout";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";


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

/* ========= Routes ========= */
export default function AppRoutes() {
  return (
    <Routes>
      {/* Landing (NO AppLayout / NO NavBar) */}
      <Route path="/" element={<Landing />} />

      {/* App (WITH AppLayout / NavBar) */}
      <Route path="/app" element={<AppLayout />}>
        {/* /app */}
        <Route index element={<Dashboard />} />

        {/* App pages */}
        <Route path="referral" element={<Referral />} />
        <Route path="network" element={<NetworkDashboard />} />
        <Route path="contract" element={<ContractPage />} />
        <Route path="about" element={<AboutPage />} />

        {/* Safety redirects */}
        <Route path="dashboard" element={<Navigate to="/app" replace />} />

        {/* App 404 */}
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Global 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
