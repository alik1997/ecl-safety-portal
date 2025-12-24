// src/components/Sidebar.jsx
import React from "react";

export default function Sidebar({ role }) {
  return (
    <aside className="w-72 bg-white border-r p-4 min-h-screen">
      <h3 className="font-semibold text-gray-700 mb-4">Menu</h3>
      <nav className="space-y-2 text-sm text-gray-600">
        <div className="p-2 rounded hover:bg-gray-50">Dashboard</div>
        <div className="p-2 rounded hover:bg-gray-50">Responses</div>
        {role === "safety" && <div className="p-2 rounded hover:bg-gray-50">Action Reports</div>}
        {role === "oversight" && <div className="p-2 rounded hover:bg-gray-50">Oversight View</div>}
      </nav>

      <div className="mt-8 text-xs text-gray-500">
        Concurrent uploads supported: <strong>6</strong> (enforced server-side)
      </div>
    </aside>
  );
}
