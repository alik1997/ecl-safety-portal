// src/dashboards/NodalDashboard.jsx
import React from "react";
import ResponsesTable from "../components/ResponsesTable";
import StatCard from "../components/StatCard";

export default function NodalDashboard({ responses, onNotifySafety, user }) {
  const totalResponses = responses.length;
  const totalActioned = responses.filter((r) => r.actionTaken).length;
  const pending = totalResponses - totalActioned;

  return (
    <div className="space-y-8">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">
            Nodal Officer Dashboard
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Logged in as: <span className="font-semibold text-gray-700">{user?.username}</span>
          </p>
        </div>

        <div className="text-sm text-gray-600 bg-blue-50 border border-blue-100 px-4 py-2 rounded-md">
          Responsible for initial monitoring & notification to Safety Dept
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <StatCard
          title="Total Responses"
          value={totalResponses}
          color="blue"
        />
        <StatCard
          title="Action Taken"
          value={totalActioned}
          color="green"
        />
        <StatCard
          title="Pending"
          value={pending}
          color="red"
        />
      </div>

      {/* TABLE SECTION */}
      <div className="bg-white rounded-xl shadow border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">
            Submitted Responses
          </h3>
          <span className="text-xs text-gray-500">
            Click “Notify Safety” after verification
          </span>
        </div>

        <ResponsesTable
          responses={responses}
          onNotifySafety={onNotifySafety}
          role="nodal"
        />
      </div>
    </div>
  );
}
