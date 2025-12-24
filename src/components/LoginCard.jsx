// src/components/LoginCard.jsx
import React, { useState } from "react";
import eclLogo from "../assets/logo.png";
import angaara from "../assets/hero.gif";

export default function LoginCard({ onLogin, users }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("nodal");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!username.trim()) return setError("Please enter username.");
    if (!password) return setError("Please enter password.");

    const u = users?.[username.trim()];
    if (!u || u.password !== password) {
      return setError("Invalid username/password. (Use demo credentials below)");
    }
    if (role !== u.role) {
      return setError(
        `Role mismatch: user '${username.trim()}' is '${u.role}'. Please select correct role.`
      );
    }

    onLogin({ name: u.name, role: u.role, username: username.trim() });
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* OUTER CARD */}
      <div className="rounded-3xl shadow-2xl border bg-white overflow-hidden">

        {/* HEADER */}
        <div className="flex flex-col items-center justify-center px-6 py-6 bg-gradient-to-b from-blue-50 to-white border-b">
          <img
            src={eclLogo}
            alt="ECL Logo"
            className="h-14 mb-3"
          />

          <h1 className="text-xl font-bold text-gray-800">
            ECL Safety Portal
          </h1>

          <p className="text-sm text-gray-600 mt-1 text-center">
            Reporting & Monitoring of Unsafe Acts / Practices / Near Miss Incidents
          </p>
        </div>

        {/* ANGAARA SECTION */}
        <div className="flex justify-center bg-white pt-4">
          <img
            src={angaara}
            alt="Angaara Safety Mascot"
            className="h-28"
          />
        </div>

        {/* LOGIN FORM */}
        <div className="px-8 py-6">
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. nodal1"
                className="w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Login As
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="nodal">Nodal Officer (Admin)</option>
                <option value="safety">Safety Dept (Super Admin)</option>
                <option value="oversight">CMD / Functional Directors</option>
              </select>
            </div>

            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full mt-2 py-3 rounded-md bg-blue-700 hover:bg-blue-800 text-white font-semibold transition"
            >
              Login
            </button>
          </form>

          {/* FOOTER INFO */}
          <div className="mt-6 text-xs text-gray-500 text-center">
            <div className="font-semibold mb-1">Demo Credentials (Local Testing)</div>
            <div>nodal1 / nodalpass</div>
            <div>safety1 / safetypass</div>
            <div>cmd1 / cmdpass</div>

            <div className="mt-3 text-[11px]">
              © Eastern Coalfields Limited (ECL)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
