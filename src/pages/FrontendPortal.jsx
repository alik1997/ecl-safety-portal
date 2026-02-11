// src/pages/FrontendPortal.jsx
import { useState, useEffect } from "react";
import LoginCard from "../components/LoginCard";
import Topbar from "../components/Topbar";
import Sidebar from "../components/Sidebar";

import NodalDashboard from "../dashboards/NodalDashboard";
import SafetyDashboard from "../dashboards/SafetyDashboard";
import CmdDashboard from "../dashboards/OversightDashboard";

export default function FrontendPortal() {
  const [user, setUser] = useState(null);

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

  // 🔹 NOT LOGGED IN → SHOW LOGIN
  if (!user) {
    return <LoginCard onLogin={handleLogin} />;
  }

  // 🔹 LOGGED IN → SHOW DASHBOARD LAYOUT
  return (
    <div className="min-h-screen bg-gray-100">
      <Topbar user={user} onLogout={handleLogout} />

      <div className="flex">
        <Sidebar role={user.role} />

        <main className="flex-1 p-6">
          {user.role === "nodal" && <NodalDashboard />}
          {user.role === "safety" && <SafetyDashboard />}
          {user.role === "oversight" && <CmdDashboard />}
        </main>
      </div>
    </div>
  );
}
