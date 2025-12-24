// src/App.jsx
import React, { useState, useEffect } from "react";

// assets
import bg from "./assets/bg.webp";
import logo from "./assets/logo.png";
import angaara from "./assets/hero.gif";

// shared components
import LoginCard from "./components/LoginCard";
import Topbar from "./components/Topbar";
import Sidebar from "./components/Sidebar";
import ActionModal from "./components/ActionModal";

// role-based dashboards
import NodalDashboard from "./dashboards/NodalDashboard";
import SafetyDashboard from "./dashboards/SafetyDashboard";
import OversightDashboard from "./dashboards/OversightDashboard";

/* ---------------- Demo users (replace with backend auth later) ---------------- */
const USERS = {
  nodal1: { password: "nodalpass", role: "nodal", name: "Nodal Officer (Nodal1)" },
  safety1: { password: "safetypass", role: "safety", name: "Safety Officer A" },
  cmd1: { password: "cmdpass", role: "oversight", name: "CMD - Director" },
};

/* ---------------- Mock data (replace with API data later) ---------------- */
const initialResponses = [
  {
    id: "R-001",
    title: "Unsafe stacking at Site A",
    submittedBy: "Field User 1",
    date: "2025-12-16",
    description: "Observed heavy material stacked near a walkway. Risk of collapse.",
    actionTaken: null,
    completion: null,
  },
  {
    id: "R-002",
    title: "Faulty PPE at Unit 3",
    submittedBy: "Field User 2",
    date: "2025-12-15",
    description: "Several workers without proper helmets and gloves.",
    actionTaken: {
      text: "Issued immediate PPE replacement and retraining scheduled.",
      by: "Safety Officer A",
      date: "2025-12-16",
    },
    completion: "Yes",
  },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [responses, setResponses] = useState(initialResponses);

  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [activeResponse, setActiveResponse] = useState(null);

  /* ---------- restore login from localStorage ---------- */
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

  function handleNotifySafety(responseId) {
    alert(`Notification sent to Safety Department for ${responseId}`);
    // TODO: API call
  }

  function handleOpenActionModal(response) {
    setActiveResponse(response);
    setActionModalOpen(true);
  }

  function handleSaveAction(id, text, completion) {
    const today = new Date().toISOString().slice(0, 10);
    setResponses((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              actionTaken: { text, by: "Safety Dept", date: today },
              completion,
            }
          : r
      )
    );
    setActionModalOpen(false);
    setActiveResponse(null);
  }

  /* ================= LOGIN PAGE ================= */
  if (!user) {
    return (
      <div
        className="min-h-screen relative flex items-center justify-center"
        style={{
          backgroundImage: `url(${bg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />

        <div className="relative z-10 max-w-5xl w-full px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center py-20">

            {/* LEFT BRANDING */}
            <div className="hidden md:flex flex-col text-white">
              <div className="flex items-center gap-4 mb-6">
                <img src={logo} className="w-40 object-contain" />
                
              </div>

              <h1 className="text-3xl font-bold">ECL Safety Monitoring Portal</h1>
              <p className="mt-4 text-lg text-gray-200">
                Centralized platform for safety reporting, action tracking and executive oversight.
              </p>
            </div>

            {/* LOGIN CARD */}
            <div className="flex justify-center">
              <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl p-6">
                <LoginCard onLogin={handleLogin} users={USERS} />
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  /* ================= DASHBOARD LAYOUT ================= */
  return (
    <div className="min-h-screen bg-gray-100">
      <Topbar user={user} onLogout={handleLogout} />

      <div className="flex">
        <Sidebar role={user.role} />

        <main className="flex-1 p-6">
          {user.role === "nodal" && (
            <NodalDashboard
              responses={responses}
              onNotifySafety={handleNotifySafety}
            />
          )}

          {user.role === "safety" && (
            <SafetyDashboard
              responses={responses}
              onOpenActionModal={handleOpenActionModal}
            />
          )}

          {user.role === "oversight" && (
            <OversightDashboard responses={responses} />
          )}
        </main>
      </div>

      <ActionModal
        open={actionModalOpen}
        response={activeResponse}
        onClose={() => setActionModalOpen(false)}
        onSave={handleSaveAction}
      />
    </div>
  );
}
