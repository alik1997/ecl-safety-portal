// src/components/ResponsesTable.jsx
import React from "react";

export default function ResponsesTable({ responses, onNotifySafety, onOpenActionModal, role }) {
  return (
    <div className="bg-white shadow rounded-lg p-4">
      <h4 className="font-semibold mb-3">Responses</h4>
      <div className="overflow-x-auto">
        <table className="w-full table-auto text-left text-sm">
          <thead>
            <tr className="text-gray-500">
              <th className="p-2">ID</th>
              <th className="p-2">Title</th>
              <th className="p-2">Submitted By</th>
              <th className="p-2">Date</th>
              <th className="p-2">Action Taken</th>
              <th className="p-2">Completion</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {responses.map((r) => (
              <tr key={r.id} className="border-t hover:bg-gray-50">
                <td className="p-2">{r.id}</td>
                <td className="p-2">{r.title}</td>
                <td className="p-2">{r.submittedBy}</td>
                <td className="p-2">{r.date}</td>
                <td className="p-2">
                  {r.actionTaken ? (
                    <div className="text-sm text-gray-700">
                      {r.actionTaken.text.slice(0, 80)}
                      {r.actionTaken.text.length > 80 ? "..." : ""}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">—</div>
                  )}
                </td>
                <td className="p-2">{r.completion || "—"}</td>
                <td className="p-2">
                  <div className="flex gap-2">
                    {role === "nodal" && (
                      <button className="px-3 py-1 bg-indigo-600 text-white rounded text-xs" onClick={() => onNotifySafety && onNotifySafety(r.id)}>
                        Notify Safety
                      </button>
                    )}

                    {role === "safety" && (
                      <button className="px-3 py-1 bg-green-600 text-white rounded text-xs" onClick={() => onOpenActionModal && onOpenActionModal(r)}>
                        Action Taken
                      </button>
                    )}

                    <button className="px-3 py-1 border rounded text-xs" onClick={() => alert(`View details:\n\n${r.description}`)}>
                      View
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
