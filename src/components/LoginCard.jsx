// src/components/LoginCard.jsx
import React, { useState } from "react";
import eclLogo from "../assets/logo.png";
import angaara from "../assets/hero.gif";

const LOGIN_API = "/api/login"; // change if needed

// map server role strings to your app's roles
function mapServerRole(serverRole) {
  if (!serverRole) return "unknown";
  const s = String(serverRole).toUpperCase();
  if (s === "AREA_NODAL") return "nodal";
  if (s === "SUPERADMIN") return "safety";
  if (s === "HQ_NODAL") return "oversight";
  // fallback: use lowercase version (useful for other roles)
  return s.toLowerCase();
}

export default function LoginCard({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter email.");
      return;
    }
    if (!password) {
      setError("Please enter password.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(LOGIN_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!res.ok) {
        // try to parse server message for friendlier error
        let msg = `Login failed (${res.status})`;
        try {
          const txt = await res.text();
          if (txt) msg = txt;
        } catch (e) {}
        throw new Error(msg);
      }

      const json = await res.json();

      // Expecting:
      // { token: "...", user: { id, email, role, name? } }
      if (!json?.token || !json?.user) {
        throw new Error("Invalid login response from server");
      }

      const mappedRole = mapServerRole(json.user.role);

      // persist token + user for subsequent API calls
      try {
        localStorage.setItem("ecl_token", json.token);
        localStorage.setItem(
          "ecl_user",
          JSON.stringify({ ...json.user, mappedRole })
        );
      } catch (err) {
        console.warn("localStorage write failed", err);
      }

      // call parent with normalized user object
      onLogin({
        id: json.user.id ?? null,
        name: json.user.name ?? json.user.email,
        email: json.user.email,
        role: mappedRole,
        rawRole: json.user.role,
        token: json.token,
      });
    } catch (err) {
      console.error("Login error:", err);
      // friendly error message
      setError(
        err && err.message && !err.message.startsWith("{")
          ? err.message
          : "Invalid email or password."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="rounded-3xl shadow-2xl border bg-white overflow-hidden">
        {/* HEADER */}
        <div className="flex flex-col items-center px-6 py-6 bg-gradient-to-b from-blue-50 to-white border-b">
          <img src={eclLogo} alt="ECL Logo" className="h-14 mb-3" />

          <h1 className="text-xl font-bold text-gray-800">ECL Safety Portal</h1>

          <p className="text-sm text-gray-600 mt-1 text-center">
            Reporting & Monitoring of Unsafe Acts / Practices / Near Miss
            Incidents
          </p>
        </div>

        {/* ANGAARA */}
        <div className="flex justify-center bg-white pt-4">
          <img src={angaara} alt="Angaara Safety Mascot" className="h-28" />
        </div>

        {/* LOGIN FORM */}
        <div className="px-8 py-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="safety@example.com"
                className="w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                autoComplete="username"
              />
            </div>

            {/* Fixed password block: input + button are inside a relative container so the eye is vertically centered to the input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 pr-10"
                  autoComplete="current-password"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="
                    absolute 
                    right-3 
                    top-1/2 
                    -translate-y-1/2 
                    flex items-center justify-center
                    text-gray-500 hover:text-gray-700
                    p-1 rounded
                    focus:outline-none focus:ring-2 focus:ring-blue-500
                  "
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    // eye-off icon (SVG)
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M1 1l22 22" />
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3-11-8 1.02-2.6 2.8-4.74 4.9-6.05" />
                      <path d="M9.88 9.88A3 3 0 0 0 14.12 14.12" />
                    </svg>
                  ) : (
                    // eye icon (SVG)
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 rounded-md bg-blue-700 hover:bg-blue-800 text-white font-semibold transition disabled:opacity-60"
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>

          {/* FOOTER INFO */}
          <div className="mt-6 text-xs text-gray-500 text-center">
            <div className="mt-3 text-[11px]">© Eastern Coalfields Limited (ECL)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
