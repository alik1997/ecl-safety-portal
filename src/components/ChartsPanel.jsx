// src/components/ChartsPanel.jsx
import React, { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#4F46E5", "#06B6D4", "#F59E0B", "#EF4444", "#10B981"];

export default function ChartsPanel({ responses }) {
  const totalResponses = responses.length;
  const totalActioned = responses.filter((r) => r.actionTaken).length;
  const completedYes = responses.filter((r) => r.completion === "Yes").length;
  const completedNo = responses.filter((r) => r.completion === "No").length;

  const barData = useMemo(() => {
    const map = {};
    responses.forEach((r) => {
      const key = r.date;
      if (!map[key]) map[key] = { date: key, responses: 0, actions: 0 };
      map[key].responses += 1;
      if (r.actionTaken) map[key].actions += 1;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [responses]);

  const pieData = [
    { name: "Actioned", value: totalActioned },
    { name: "Pending", value: totalResponses - totalActioned },
  ];

  const completionPie = [
    { name: "Completed", value: completedYes },
    { name: "In Progress / No", value: completedNo },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white shadow rounded-lg p-4 h-72">
        <h5 className="font-semibold mb-2">Responses vs Actions (by date)</h5>
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={barData}>
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="responses" name="Responses" fill={COLORS[0]} />
            <Bar dataKey="actions" name="Actions Taken" fill={COLORS[1]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-col gap-4">
        <div className="bg-white shadow rounded-lg p-4 h-36">
          <h5 className="font-semibold mb-2">Actioned / Pending</h5>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={60} label>
                {pieData.map((entry, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white shadow rounded-lg p-4 h-36">
          <h5 className="font-semibold mb-2">Completion (Yes/No)</h5>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={completionPie} dataKey="value" nameKey="name" outerRadius={60} label>
                {completionPie.map((entry, idx) => (
                  <Cell key={idx} fill={COLORS[(idx + 2) % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
