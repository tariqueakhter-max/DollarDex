// src/AppLayout.tsx
import { Outlet } from "react-router-dom";
import NavBar from "./components/NavBar";
import NetworkGuard from "./components/NetworkGuard";
import Footer from "./components/Footer";

export default function AppLayout() {
  return (
    <div className="ddx-app">
      <NavBar />
      <NetworkGuard>
        <Outlet />
      </NetworkGuard>
      <Footer />
    </div>
  );
}
