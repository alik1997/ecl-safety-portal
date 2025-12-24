// src/components/Topbar.jsx
import React from "react";
import logo from "../assets/logo.png";
import angaara from "../assets/hero.gif";

export default function Topbar({ user, onLogout }) {
  return (
    <header className="bg-gradient-to-r from-indigo-600 to-indigo-500 text-white">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4">
          <img src={logo} alt="ECL logo" className="w-16 h-auto bg-white rounded p-1 object-contain" />
          <div>
            <div className="font-semibold text-lg">ECL Safety Portal</div>
            <div className="text-xs opacity-90">Monitoring & Action Tracking</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-3 bg-white/10 px-3 py-1 rounded">
            <div className="text-xs opacity-90">Signed in as</div>
            <div className="text-sm font-medium">{user?.name}</div>
            <div className="text-xs bg-white/20 px-2 py-0.5 rounded">{user?.role}</div>
          </div>

          <img src={angaara} alt="loader" className="w-10 h-10 rounded-full bg-white/10 p-1 object-contain" />

          <button onClick={onLogout} className="ml-2 text-sm bg-white/10 px-3 py-1 rounded hover:bg-white/20">
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
