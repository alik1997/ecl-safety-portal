// src/dashboards/NodalDashboard.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import ResponsesTable from "../components/ResponsesTable";
import StatCard from "../components/StatCard";
import toast from "react-hot-toast";

/**
 * NodalDashboard (modified)
 *
 * - Adds Profile menu (shows user details stored in localStorage ecl_user or from prop user).
 * - Profile menu allows copying email and logout (clears tokens and reloads).
 * - Existing nodal features preserved: fetch responses, Notify Safety modal, multipart submit.
 */

const HQ_COMPLAINTS_API = "/api/area/complaints";
const RESOLUTION_SUFFIX = "submit-resolution"; // POST to /api/area/complaints/{id}/submit-resolution

function getAuthToken() {
  return localStorage.getItem("ecl_token") || localStorage.getItem("auth_token") || null;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file

export default function NodalDashboard({ responses: initialResponses = [], user: userProp = {}, onRefresh }) {
  // local copy for optimistic updates
  const [responses, setResponses] = useState(initialResponses || []);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);

  // debug / error info
  const [errorMsg, setErrorMsg] = useState(null);
  const [rawErrorBody, setRawErrorBody] = useState(null);
  const [showRawError, setShowRawError] = useState(false);

  // files state for upload in modal
  const [files, setFiles] = useState([]);

  // Profile menu state
  const [user, setUser] = useState(userProp || null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    // keep local responses in sync if parent passes updated list
    setResponses(initialResponses || []);
  }, [initialResponses]);

  // Keep user in sync with prop and localStorage
  function loadUserFromStorage() {
    try {
      const raw = localStorage.getItem("ecl_user");
      if (!raw) {
        setUser(userProp || null);
        return;
      }
      const parsed = JSON.parse(raw);
      setUser(parsed);
    } catch (e) {
      console.warn("Failed to parse user from storage", e);
      setUser(userProp || null);
    }
  }

  useEffect(() => {
    // prefer prop user if provided, otherwise load from storage
    if (userProp && Object.keys(userProp).length) {
      setUser(userProp);
    } else {
      loadUserFromStorage();
    }

    const onStorage = () => loadUserFromStorage();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProp]);

  // click outside to close profile menu
  useEffect(() => {
    function onDocClick(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) {
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }
  }, [profileOpen]);

  // fetch complaints assigned to this area (uses authorization)
  const fetchResponses = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setRawErrorBody(null);
    try {
      const token = getAuthToken();
      if (!token) {
        setLoading(false);
        setErrorMsg("Not authenticated — please login.");
        toast.error("Not authenticated — please login to fetch area complaints.");
        return;
      }

      console.debug("Fetching area complaints from", HQ_COMPLAINTS_API);
      const res = await fetch(HQ_COMPLAINTS_API, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Authorization: `Bearer ${token}`,
        },
      });

      console.debug("Fetch /api/area/complaints status:", res.status, res.statusText);

      const bodyText = await res.text().catch(() => null);

      // If server returned HTML (login page or exception), show as error
      if (bodyText && typeof bodyText === "string" && bodyText.trim().startsWith("<")) {
        console.warn("Server returned HTML (likely login or error page).", bodyText.slice(0, 400));
        setErrorMsg(`Server returned HTML (status ${res.status}). Possibly authentication / route error.`);
        setRawErrorBody(bodyText);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        console.error("Failed to fetch area complaints:", res.status, bodyText);
        setErrorMsg(`Failed to load complaints: ${res.status} ${res.statusText}`);
        setRawErrorBody(bodyText || null);
        toast.error(`Failed to load complaints: ${res.status}`);
        setLoading(false);
        return;
      }

      // parse JSON (we already read text above -> parse)
      let json = null;
      try {
        json = bodyText ? JSON.parse(bodyText) : null;
      } catch (e) {
        json = null;
      }

      // handle responses returned either as { data: [...] } or as an array
      const list = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
      setResponses(list || []);
    } catch (err) {
      console.error("Fetch area complaints error:", err);
      setErrorMsg("Error fetching complaints — see console.");
      setRawErrorBody(String(err));
      toast.error("Error fetching complaints — see console.");
    } finally {
      setLoading(false);
    }
  }, []);

  // fetch on mount and when onRefresh changes (parent can toggle to force refresh)
  useEffect(() => {
    fetchResponses();
  }, [fetchResponses, onRefresh]);

  const totalResponses = responses.length;
  const totalActioned = responses.filter((r) => r.actionTaken || (r.raw && Array.isArray(r.raw?.nodal_actions) && r.raw.nodal_actions.length > 0)).length;
  const pending = totalResponses - totalActioned;

  function openNotifyModal(response) {
    setSelectedResponse(response);
    setRemarks("");
    setFiles([]);
    setNotifyOpen(true);
  }

  function closeNotifyModal() {
    setSelectedResponse(null);
    setRemarks("");
    setFiles([]);
    setNotifyOpen(false);
  }

  function handleFileChange(e) {
    const chosen = Array.from(e.target.files || []);
    const valid = [];
    for (const f of chosen) {
      if (f.size > MAX_FILE_SIZE_BYTES) {
        toast.error(`${f.name} is too large (max 10 MB).`);
        continue;
      }
      const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "application/pdf", "image/webp"];
      if (!allowedTypes.includes(f.type)) {
        toast.error(`${f.name} is not supported (only images & PDFs).`);
        continue;
      }
      valid.push(f);
    }
    setFiles((prev) => {
      const existingKeys = new Set(prev.map(p => `${p.name}_${p.size}`));
      const merged = prev.slice();
      valid.forEach(f => {
        const key = `${f.name}_${f.size}`;
        if (!existingKeys.has(key)) {
          merged.push(f);
          existingKeys.add(key);
        }
      });
      return merged;
    });
    e.target.value = "";
  }

  function removeFileAt(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function submitNotify() {
    if (!selectedResponse) return;
    if (!remarks || remarks.trim().length < 3) {
      toast.error("Please provide remarks (3+ characters).");
      return;
    }

    setSubmitting(true);
    try {
      const token = getAuthToken();
      if (!token) {
        toast.error("Not authenticated — please login.");
        setSubmitting(false);
        return;
      }

      // Use complaint id in URL: POST /api/area/complaints/{complaint}/submit-resolution
      const url = `${HQ_COMPLAINTS_API}/${selectedResponse.id}/${RESOLUTION_SUFFIX}`;
      let res = null;
      let json = null;

      // Always send multipart/form-data for this endpoint (server expects resolution_text + proofs[])
      const fd = new FormData();
      fd.append("resolution_text", remarks.trim()); // API field name as specified
      // optionally append nodal_user_id if backend accepts it
      if (user?.id) fd.append("nodal_user_id", String(user.id));
      (files || []).forEach((f) => fd.append("proofs[]", f, f.name));

      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`, // don't set Content-Type; browser will set boundary
        },
        body: fd,
      });

      const bodyText = await res.text().catch(() => null);

      if (!res.ok) {
        console.error("Submit-resolution failed:", res.status, bodyText);
        // if 401 / 403 provide clearer message
        if (res.status === 401 || res.status === 403) {
          toast.error("Unauthorized / forbidden. Please login with an account that has permission to submit resolution.");
        } else {
          toast.error(`Submit failed: ${res.status}`);
        }
        setSubmitting(false);
        return;
      }

      try {
        json = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        json = null;
      }

      // collect attachments returned by server (best-effort)
      const attachmentsFromServer = (() => {
        const arr = [];
        if (!json) return arr;
        const src = Array.isArray(json.attachments) ? json.attachments : (Array.isArray(json.data?.attachments) ? json.data.attachments : null);
        if (Array.isArray(src)) {
          src.forEach((a) => {
            if (typeof a === "string") arr.push({ filename: a.split("/").pop() || a, url: a });
            else if (a && typeof a === "object") arr.push({ filename: a.filename || a.name || "", url: a.url || a.path || null });
          });
          return arr;
        }
        const urls = Array.isArray(json.attachment_urls) ? json.attachment_urls : (Array.isArray(json.urls) ? json.urls : (Array.isArray(json.data?.attachment_urls) ? json.data.attachment_urls : null));
        if (Array.isArray(urls)) {
          urls.forEach((u) => arr.push({ filename: u.split("/").pop() || u, url: u }));
          return arr;
        }
        return arr;
      })();

      const localAttachments = (files || []).map((f) => ({ filename: f.name, url: null }));
      const finalAttachments = attachmentsFromServer.length ? attachmentsFromServer : localAttachments;

      // optimistic update: insert new nodal action/resolution at top of raw.nodal_actions
      setResponses((prev) =>
        prev.map((r) => {
          if (r.id !== selectedResponse.id) return r;

          const raw = { ...(r.raw || {}) };
          const nodalActions = Array.isArray(raw.nodal_actions) ? raw.nodal_actions.slice() : [];

          const actionObj = {
            nodal_user_id: user?.id ?? null,
            nodal_user_name: user?.username || user?.name || null,
            remarks: remarks.trim(),
            resolution_text: remarks.trim(),
            created_at: new Date().toISOString(),
            attachments: finalAttachments,
            ...(json && (json.id || json.data?.id) ? { id: json.id ?? json.data?.id } : {}),
          };

          nodalActions.unshift(actionObj);
          raw.nodal_actions = nodalActions;

          return {
            ...r,
            raw,
            actionTaken: true,
            assignedTo: r.assignedTo || (user?.username || user?.name || `Nodal ${user?.id ?? ""}`),
          };
        })
      );

      toast.success("Submitted resolution to HQ (action recorded).");
      closeNotifyModal();

      if (typeof onRefresh === "function") onRefresh();
    } catch (err) {
      console.error("Submit notify error:", err);
      toast.error("Failed to submit resolution — see console.");
    } finally {
      setSubmitting(false);
    }
  }

  // Helper to compute initials for avatar
  function userInitials(u) {
    if (!u) return "?";
    if (u.name) {
      const parts = u.name.trim().split(/\s+/);
      return (parts[0][0] || "").toUpperCase() + (parts[1] ? (parts[1][0] || "").toUpperCase() : "");
    }
    if (u.email) return (u.email[0] || "?").toUpperCase();
    return "?";
  }

  function handleLogout() {
    try {
      localStorage.removeItem("ecl_token");
      localStorage.removeItem("auth_token");
      localStorage.removeItem("ecl_user");
    } catch (e) {
      console.warn("logout clear failed", e);
    }
    // reload to ensure app re-evaluates auth state (or redirect as you prefer)
    window.location.reload();
  }

  return (
    <div className="space-y-8">
      {/* Debug banner */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
          <div className="flex items-center justify-between">
            <div>{errorMsg}</div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setShowRawError((s) => !s); }} className="px-2 py-1 border rounded text-xs">Details</button>
              <button onClick={() => { setErrorMsg(null); setRawErrorBody(null); }} className="px-2 py-1 border rounded text-xs">Dismiss</button>
            </div>
          </div>
          {showRawError && rawErrorBody && (
            <pre className="mt-2 p-2 bg-white rounded text-xs overflow-auto" style={{ maxHeight: 240 }}>
              {rawErrorBody}
            </pre>
          )}
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">
            Nodal Officer Dashboard
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Logged in as: <span className="font-semibold text-gray-700">{user?.username || user?.name || "Nodal"}</span>
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600 bg-blue-50 border border-blue-100 px-4 py-2 rounded-md">
            Responsible for initial monitoring & notification to Safety Dept
          </div>

          {/* Profile menu */}
          <div ref={profileRef} className="relative">
            {user ? (
              <>
                <button
                  onClick={() => setProfileOpen((s) => !s)}
                  aria-haspopup="true"
                  aria-expanded={profileOpen}
                  className="flex items-center gap-2 px-3 py-1 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-semibold">
                    {userInitials(user)}
                  </div>
                  <div className="hidden sm:block text-left">
                    <div className="text-sm font-medium">{user.name || user.email}</div>
                    <div className="text-xs text-gray-500">{(user.mappedRole || user.role || "").toString()}</div>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.293l3.71-4.062a.75.75 0 011.138.976l-4.25 4.656a.75.75 0 01-1.102 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </button>

                {profileOpen && (
                  <div role="menu" aria-label="User menu" className="absolute right-0 mt-2 w-64 bg-white border rounded-md shadow-lg z-50">
                    <div className="p-4 border-b">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-semibold">{userInitials(user)}</div>
                        <div>
                          <div className="text-sm font-semibold">{user.name || user.email}</div>
                          <div className="text-xs text-gray-500">{user.email}</div>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 text-sm text-gray-700">
                      <div className="mb-2"><span className="text-xs text-gray-500">Role:</span> <strong className="ml-1">{user.mappedRole || user.role || "—"}</strong></div>
                      <div className="mb-2"><span className="text-xs text-gray-500">ID:</span> <span className="ml-1 text-xs">{user.id ?? "—"}</span></div>
                      {/* token (masked) */}
                      <div className="mb-3"><span className="text-xs text-gray-500">Token:</span> <code className="ml-1 text-xs">{(localStorage.getItem("ecl_token") || "").slice(0, 8) + (localStorage.getItem("ecl_token") ? "… (masked)" : "")}</code></div>

                      <div className="flex gap-2">
                        <button onClick={() => { navigator.clipboard?.writeText(user.email || ""); toast.success("Email copied"); }} className="flex-1 px-3 py-2 border rounded text-sm">Copy Email</button>
                        <button onClick={handleLogout} className="flex-1 px-3 py-2 bg-red-600 text-white rounded text-sm">Logout</button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-gray-500">
                <em>Not signed in</em>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <StatCard title="Total Responses" value={totalResponses} color="blue" />
        <StatCard title="Action Taken" value={totalActioned} color="green" />
        <StatCard title="Pending" value={pending} color="red" />
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl shadow border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Submitted Responses</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">Click “Notify Safety” after verification</span>
            <button
              onClick={() => fetchResponses()}
              className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* ResponsesTable expected to call onNotifySafety(row) when nodal clicks the action
            IMPORTANT: pass assignApiBase so the internal View button fetches area detail endpoint */}
        <ResponsesTable
          responses={responses}
          onNotifySafety={(row) => openNotifyModal(row)}
          role="nodal"
          assignApiBase={HQ_COMPLAINTS_API}
        />
      </div>

      {/* NOTIFY / SUBMIT RESOLUTION MODAL */}
      {notifyOpen && selectedResponse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          

          <div className="bg-white rounded-lg shadow-lg p-6 z-60 w-full max-w-2xl">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-semibold">Notify Safety / Submit Resolution</h3>
              <button onClick={closeNotifyModal} className="text-gray-500">Close</button>
            </div>

            <div className="text-sm text-gray-700 mb-3">
              <div><strong>ID:</strong> {selectedResponse.id}</div>
              <div><strong>Title:</strong> {selectedResponse.title}</div>
              <div><strong>Area:</strong> {selectedResponse.raw?.unit_name ?? selectedResponse.raw?.area_id ?? "—"}</div>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium">Remarks / Resolution (short)</label>
              <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={5} className="mt-2 w-full border rounded p-2" placeholder="Enter action details, remarks, or resolution text to send to HQ." />
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium">Proofs (images or PDFs, max 10 MB each)</label>
              <input type="file" accept="image/*,application/pdf" multiple onChange={handleFileChange} className="mt-2" />
              {files.length > 0 && (
                <div className="mt-2 space-y-2">
                  {files.map((f, i) => (
                    <div key={`${f.name}_${f.size}`} className="flex items-center justify-between gap-3 border rounded px-2 py-1">
                      <div className="flex items-center gap-3">
                        {f.type.startsWith("image/") ? (
                          <img src={URL.createObjectURL(f)} alt={f.name} className="w-12 h-12 object-cover rounded" />
                        ) : (
                          <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded text-xs">PDF</div>
                        )}
                        <div className="text-sm">
                          <div className="font-medium truncate max-w-[300px]">{f.name}</div>
                          <div className="text-xs text-gray-500">{(f.size / 1024).toFixed(1)} KB</div>
                        </div>
                      </div>
                      <div>
                        <button onClick={() => removeFileAt(i)} className="text-xs px-2 py-1 border rounded">Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={closeNotifyModal} className="px-4 py-2 border rounded">Cancel</button>
              <button onClick={submitNotify} disabled={submitting} className={`px-4 py-2 rounded bg-green-600 text-white ${submitting ? "opacity-70 cursor-not-allowed" : ""}`}>
                {submitting ? "Sending…" : "Notify / Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
