import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./AppLayout";

/** ✅ Keep Landing eager if you want fastest homepage */
import Landing from "./pages/Landing";

/** ✅ Lazy-load heavy pages (splits bundle into separate chunks) */
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Referral = lazy(() => import("./pages/Referral"));
const NetworkDashboard = lazy(() => import("./pages/NetworkDashboard"));
const ContractPage = lazy(() => import("./pages/ContractPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));

function PageLoader() {
  return (
    <div className="yf-luxe">
      <div className="wrap" style={{ paddingTop: 32 }}>
        <div className="card">
          <h2 style={{ margin: 0 }}>Loading…</h2>
          <div className="small" style={{ marginTop: 8 }}>
            Preparing your dashboard…
          </div>
        </div>
      </div>
    </div>
  );
}

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
    <Suspense fallback={<PageLoader />}>
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
    </Suspense>
  );
}
