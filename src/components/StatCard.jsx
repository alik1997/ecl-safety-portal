// src/components/StatCard.jsx
import React from "react";

export default function StatCard({ title, value, subtitle }) {
  return (
    <div className="bg-white shadow rounded-lg p-4">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-bold mt-2">{value}</div>
      {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
    </div>
  );
}
