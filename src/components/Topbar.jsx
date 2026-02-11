// src/components/Topbar.jsx
import React from "react";
import logo from "../assets/logo.png";
import angaara from "../assets/hero.gif";

function getDisplayName(user) {
  if (!user) return "User";

  const name = user.name || "";

  // If name looks like an email → convert it
  if (name.includes("@")) {
    return name.split("@")[0];
  }

  return name || "User";
}

export default function Topbar({ user, onLogout }) {
  const displayName = getDisplayName(user);
  const displayRole = user?.mappedRole || user?.role || "";

  return (
    <header className="bg-gradient-to-r from-indigo-600 to-indigo-500 text-white">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
        
        {/* Left */}
        <div className="flex items-center gap-4">
          <img
            src={logo}
            alt="ECL logo"
            className="w-16 h-auto bg-white rounded p-1 object-contain"
          />
          <div>
            <div className="font-semibold text-lg">ECL Safety Portal</div>
            <div className="text-xs opacity-90">
              Monitoring & Action Tracking
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-3 bg-white/10 px-3 py-1 rounded">
            <div className="text-xs opacity-90">Signed in as</div>
            <div className="text-sm font-medium capitalize">
              {displayName}
            </div>
            {displayRole && (
              <div className="text-xs bg-white/20 px-2 py-0.5 rounded">
                {displayRole}
              </div>
            )}
          </div>

          <img
            src={angaara}
            alt="Angaara mascot"
            className="w-10 h-10 rounded-full bg-white/10 p-1 object-contain"
          />

          {/* Logout button removed as requested */}
        </div>
      </div>
    </header>
  );
}