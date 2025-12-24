// src/components/ActionModal.jsx
import React, { useEffect, useState } from "react";

function wordCount(text = "") {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

export default function ActionModal({ open, onClose, response, onSave }) {
  const [text, setText] = useState(response?.actionTaken?.text || "");
  const [completion, setCompletion] = useState(response?.completion || "No");

  useEffect(() => {
    setText(response?.actionTaken?.text || "");
    setCompletion(response?.completion || "No");
  }, [response, open]);

  if (!open || !response) return null;

  const maxWords = 5000;
  const wc = wordCount(text);

  function handleSave() {
    if (wc > maxWords) {
      alert(`Action exceeds word limit (${wc}/${maxWords}). Please shorten.`);
      return;
    }
    onSave(response.id, text, completion);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-3xl rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Action Taken - {response.id}</h3>
          <button onClick={onClose} className="text-gray-500">Close</button>
        </div>

        <div className="mt-4">
          <label className="block text-sm text-gray-600">Enter Action (max {maxWords} words)</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="w-full border rounded mt-2 p-3 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            placeholder="Describe action taken..."
          />
          <div className="text-xs text-gray-500 mt-1">Words: {wc} / {maxWords}</div>

          <div className="mt-4 flex items-center gap-4">
            <label className="text-sm text-gray-600">Completion</label>
            <select value={completion} onChange={(e) => setCompletion(e.target.value)} className="border px-2 py-1 rounded">
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 border rounded">Cancel</button>
            <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
