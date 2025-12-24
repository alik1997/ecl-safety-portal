// src/dashboards/OversightDashboard.jsx
import React from "react";
import ChartsPanel from "../components/ChartsPanel";
import StatCard from "../components/StatCard";

export default function OversightDashboard({ responses }) {
  const totalResponses = responses.length;
  const totalActioned = responses.filter((r) => r.actionTaken).length;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">CMD & Functional Directors - Oversight</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard title="Total Responses" value={totalResponses} />
        <StatCard title="Action Taken" value={totalActioned} />
        <StatCard title="Pending" value={totalResponses - totalActioned} />
      </div>

      <div className="bg-white shadow rounded-lg p-4">
        <p className="text-sm text-gray-600">Read-only oversight dashboard. Action Taken entries visible per response.</p>
      </div>

      <ChartsPanel responses={responses} />

      <div>
        <h3 className="font-semibold">Responses & Action Taken (individual)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          {responses.map((r) => (
            <div key={r.id} className="bg-white p-4 rounded shadow">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold">{r.title} <span className="text-xs text-gray-400">({r.id})</span></div>
                  <div className="text-xs text-gray-500">Submitted: {r.submittedBy} — {r.date}</div>
                </div>
                <div className="text-sm">Completion: <strong>{r.completion || "—"}</strong></div>
              </div>

              <div className="mt-3 text-sm text-gray-700">{r.description}</div>

              <div className="mt-3 border-t pt-3">
                <div className="text-sm font-semibold">Action Taken</div>
                {r.actionTaken ? (
                  <div className="text-sm text-gray-700 mt-1">
                    <div>{r.actionTaken.text}</div>
                    <div className="text-xs text-gray-400 mt-2">By: {r.actionTaken.by} — {r.actionTaken.date}</div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400 mt-1">No action submitted yet.</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
