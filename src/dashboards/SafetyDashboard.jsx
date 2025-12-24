// src/dashboards/SafetyDashboard.jsx
import React from "react";
import ResponsesTable from "../components/ResponsesTable";
import ChartsPanel from "../components/ChartsPanel";
import StatCard from "../components/StatCard";

export default function SafetyDashboard({ responses, onOpenActionModal }) {
  const totalResponses = responses.length;
  const totalActioned = responses.filter((r) => r.actionTaken).length;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">ECL HQ Safety Department (Superadmin)</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard title="Total Responses" value={totalResponses} />
        <StatCard title="Action Taken" value={totalActioned} />
        <StatCard title="Pending" value={totalResponses - totalActioned} />
      </div>

      <ResponsesTable responses={responses} onOpenActionModal={onOpenActionModal} role="safety" />

      <div>
        <h3 className="font-semibold mb-2">Charts & Summary</h3>
        <ChartsPanel responses={responses} />
      </div>
    </div>
  );
}
