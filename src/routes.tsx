import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./AppLayout";

import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Referral from "./pages/Referral";
import NetworkDashboard from "./pages/NetworkDashboard";
import ContractPage from "./pages/ContractPage";
import AboutPage from "./pages/AboutPage";

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
      <Route element={<AppLayout />}>
        {/* Landing */}
        <Route path="/" element={<Landing />} />

        {/* App group */}
        <Route path="/app">
          <Route index element={<Dashboard />} />
          <Route path="referral" element={<Referral />} />
          <Route path="network" element={<NetworkDashboard />} />
          <Route path="contract" element={<ContractPage />} />
          <Route path="about" element={<AboutPage />} />

          {/* Safety redirect */}
          <Route path="dashboard" element={<Navigate to="/app" replace />} />
        </Route>

        {/* Global 404 */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
