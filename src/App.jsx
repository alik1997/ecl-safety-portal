// src/App.jsx
import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

// assets
import bg from "./assets/bg.webp";
import logo from "./assets/logo.png";
import angaara from "./assets/hero.gif";

// shared components
import LoginCard from "./components/LoginCard";
import Topbar from "./components/Topbar";
import ActionModal from "./components/ActionModal";

// pages
import ComplaintForm from "./pages/ComplaintForm";

// dashboards
import NodalDashboard from "./dashboards/NodalDashboard";
import SafetyDashboard from "./dashboards/SafetyDashboard";
import OversightDashboard from "./dashboards/OversightDashboard";

/* ---------------- Demo users ---------------- */
const USERS = {
  nodal1: { password: "nodalpass", role: "nodal", name: "Nodal Officer (Nodal1)" },
  safety1: { password: "safetypass", role: "safety", name: "Safety Officer A" },
  cmd1: { password: "cmdpass", role: "oversight", name: "CMD - Director" },
};

const initialResponses = [];

export default function App() {
  const [user, setUser] = useState(null);
  const [responses, setResponses] = useState(initialResponses);

  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [activeResponse, setActiveResponse] = useState(null);

  useEffect(() => {
    const raw = localStorage.getItem("ecl_user");
    if (raw) setUser(JSON.parse(raw));
  }, []);

  function handleLogin(userInfo) {
    setUser(userInfo);
    localStorage.setItem("ecl_user", JSON.stringify(userInfo));
  }

  function handleLogout() {
    setUser(null);
    localStorage.removeItem("ecl_user");
  }

  // Helper to open action modal from child dashboards
  function openActionModalFor(response) {
    setActiveResponse(response);
    setActionModalOpen(true);
  }

  /* ================= FRONTEND SCREEN ================= */
  const FrontendScreen = () => {
    if (!user) {
      return (
        <div
          className="min-h-screen flex items-center justify-center"
          style={{
            backgroundImage: `url(${bg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />

          <div className="relative z-10 max-w-5xl w-full px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center py-20">
              <div className="hidden md:flex flex-col text-white">
                <div className="flex items-center gap-4 mb-6">
                  <img src={logo} className="w-40" alt="logo" />
                  <img src={angaara} className="w-12 h-12 rounded-full" alt="hero" />
                </div>
                <h1 className="text-3xl font-bold">ECL Safety Monitoring Portal</h1>
                <p className="mt-4 text-lg text-gray-200">
                  Centralized platform for safety reporting and monitoring.
                </p>
              </div>

              <LoginCard onLogin={handleLogin} users={USERS} />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gray-100">
        <Topbar user={user} onLogout={handleLogout} />

        {/* Removed global Sidebar: main area becomes full-width. */}
        <main className="p-6 max-w-screen-xl mx-auto">
          {user.role === "nodal" && (
            <NodalDashboard
              responses={responses}
              onOpenActionModal={(r) => openActionModalFor(r)}
            />
          )}
          {user.role === "safety" && (
            <SafetyDashboard
              responses={responses}
              onOpenActionModal={(r) => openActionModalFor(r)}
            />
          )}
          {user.role === "oversight" && (
            <OversightDashboard
              responses={responses}
              onOpenActionModal={(r) => openActionModalFor(r)}
            />
          )}
        </main>

        <ActionModal
          open={actionModalOpen}
          response={activeResponse}
          onClose={() => setActionModalOpen(false)}
        />
      </div>
    );
  };

  /* ================= ROUTES ================= */
  return (
    <Routes>
      {/* PUBLIC COMPLAINT FORM */}
      <Route path="/complaintform" element={<ComplaintForm />} />

      {/* LOGIN + DASHBOARD */}
      <Route path="/" element={<FrontendScreen />} />

      {/* FALLBACK */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
