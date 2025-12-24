import React from "react";

export default function ProgressBar({ step }) {
  const progress = step === 1 ? 33 : step === 2 ? 66 : 100;

  return (
    <div className="mb-8">
      <div className="flex justify-between mb-1">
        <span className="text-sm font-medium text-blue-700 uppercase tracking-wide">
          Progress
        </span>
        <span className="text-sm font-semibold text-blue-700">
          {progress}%
        </span>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-2.5 shadow-inner">
        <div
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
    </div>
  );
}
