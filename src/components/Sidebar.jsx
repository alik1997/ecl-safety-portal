// src/components/Sidebar.jsx
import React from "react";

/**
 * Sidebar
 * Props:
 *  - role: string (optional) — explicit role to use (overrides localStorage)
 *  - onNavigate: fn(viewKey)
 *  - active: current view key
 *
 * Behavior:
 *  - If `role` prop is not provided, tries to read "ecl_user" from localStorage
 *    and uses mappedRole/rawRole/role from that object.
 */
export default function Sidebar({ role = "", onNavigate, active = "" }) {
  // safe parse of ecl_user from localStorage
  function loadRoleFromStorage() {
    try {
      const raw = localStorage.getItem("ecl_user");
      if (!raw) return "";
      const parsed = JSON.parse(raw);
      // prefer mappedRole, then rawRole (new), then role
      return (parsed?.mappedRole || parsed?.rawRole || parsed?.role || "").toString();
    } catch {
      return "";
    }
  }

  // decide final role: prop overrides storage
  const finalRole = role && typeof role === "string" && role.trim() !== "" ? role : loadRoleFromStorage();
  const roleNorm = (finalRole || "").toString().trim().toUpperCase();

  // visibility logic: adjust as required
  const isSuperadmin = roleNorm === "SUPERADMIN";
  const isHqNodal = roleNorm === "HQ_NODAL";

  function navClick(key) {
    if (typeof onNavigate === "function") {
      onNavigate(key);
      return;
    }
    // fallback navigation via hash
    window.location.hash = `#${key}`;
  }

  function itemClass(key) {
    const base = "p-2 rounded cursor-pointer flex items-center gap-2";
    return `${base} ${active === key ? "bg-indigo-600 text-white" : "hover:bg-gray-50 text-gray-700"}`;
  }

  // accessible handler for keyboard activation
  function handleKeyActivate(key, e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navClick(key);
    }
  }

  return (
    <aside className="w-72 bg-white border-r p-4 min-h-screen">
      <h3 className="font-semibold text-gray-700 mb-4">Menu</h3>

      <nav className="space-y-2 text-sm" aria-label="Main navigation">
        <div
          role="button"
          tabIndex={0}
          onClick={() => navClick("dashboard")}
          onKeyDown={(e) => handleKeyActivate("dashboard", e)}
          className={itemClass("dashboard")}
          title="Dashboard"
        >
          <span>Dashboard</span>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => navClick("responses")}
          onKeyDown={(e) => handleKeyActivate("responses", e)}
          className={itemClass("responses")}
          title="Responses"
        >
          <span>Responses</span>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => navClick("actionReports")}
          onKeyDown={(e) => handleKeyActivate("actionReports", e)}
          className={itemClass("actionReports")}
          title="Action Reports"
        >
          <span>Action Reports</span>
        </div>

        {isSuperadmin && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => navClick("manageUsers")}
            onKeyDown={(e) => handleKeyActivate("manageUsers", e)}
            className={itemClass("manageUsers")}
            title="Manage Users"
          >
            <span>Manage Users</span>
          </div>
        )}

        <div
          role="button"
          tabIndex={0}
          onClick={() => navClick("oversight")}
          onKeyDown={(e) => handleKeyActivate("oversight", e)}
          className={itemClass("oversight")}
          title="Oversight View"
        >
          <span>Oversight View</span>
        </div>

        {/* Mail Groups / Mail Board — visible to SUPERADMIN and HQ_NODAL by default */}
        {(isSuperadmin || isHqNodal) && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => navClick("mailGroups")}
            onKeyDown={(e) => handleKeyActivate("mailGroups", e)}
            className={itemClass("mailGroups")}
            title="Mail Groups"
          >
            <span>Mail Groups</span>
          </div>
        )}
      </nav>

      <div className="mt-8 text-xs text-gray-500">
        Concurrent uploads supported: <strong>6</strong> (enforced server-side)
      </div>
    </aside>
  );
}
