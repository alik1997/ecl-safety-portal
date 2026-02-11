// src/dashboards/UserList.jsx
import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

const USERS_API = "/api/hq/users";

function getAuthToken() {
  return localStorage.getItem("ecl_token") || localStorage.getItem("auth_token") || null;
}

function formatDate(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * UserList
 * Props:
 *  - areas: [{ id, label }] (optional) - used for AREA_NODAL area select and for mapping area labels
 */
export default function UserList({ areas = [] }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [nextPageUrl, setNextPageUrl] = useState(null);
  const [prevPageUrl, setPrevPageUrl] = useState(null);

  // edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "AREA_NODAL", area_id: "" });
  const [saving, setSaving] = useState(false);

  // password reset modal
  const [pwOpen, setPwOpen] = useState(false);
  const [pwUser, setPwUser] = useState(null);
  const [pwValue, setPwValue] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // delete confirm
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // filtering / quick search
  const [q, setQ] = useState("");

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchUsers(url = USERS_API) {
    setLoading(true);
    setPageLoading(true);
    try {
      const token = getAuthToken();
      if (!token) {
        toast.error("Not authenticated — please login.");
        setLoading(false);
        setPageLoading(false);
        return;
      }
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Failed to fetch users: ${res.status} ${txt}`);
      }
      const json = await res.json();
      const list = Array.isArray(json.data) ? json.data : [];
      setUsers(list.map(u => ({ ...u })));
      setCurrentPage(json?.current_page ?? 1);
      setLastPage(json?.last_page ?? 1);
      setTotal(json?.total ?? list.length);
      setNextPageUrl(json?.next_page_url ?? null);
      setPrevPageUrl(json?.prev_page_url ?? null);
    } catch (err) {
      console.error("fetchUsers error", err);
      toast.error("Could not load users — see console.");
    } finally {
      setLoading(false);
      setPageLoading(false);
    }
  }

  function handleNext() {
    if (nextPageUrl) fetchUsers(nextPageUrl);
  }
  function handlePrev() {
    if (prevPageUrl) fetchUsers(prevPageUrl);
  }

  // computed lookup for areas (from prop)
  const areaLookup = useMemo(() => {
    const m = new Map();
    if (Array.isArray(areas)) {
      areas.forEach(a => {
        if (a && a.id != null) m.set(String(a.id), a.label ?? a.name ?? a.title ?? String(a.id));
      });
    }
    return m;
  }, [areas]);

  // create computedUsers that add a friendly area_label for display
  const computedUsers = useMemo(() => {
    return users.map(u => {
      // possible fields from API: areaid, area_id, area (object), area_name, unit_name
      const areaCandidates = [
        u.areaid,
        u.area_id,
        (u.area && (u.area.id ?? u.areaId)) ?? null,
      ];
      const aid = areaCandidates.find(v => v !== undefined && v !== null && v !== "") ?? null;
      const aidStr = aid != null ? String(aid) : null;

      const labelFromProp = aidStr ? areaLookup.get(aidStr) : null;
      const fallbackLabel = u.area_name || u.unit_name || u.area || (aidStr ? `Area ${aidStr}` : "-");
      const area_label = labelFromProp || fallbackLabel;

      return { ...u, area_label, resolved_area_id: aidStr };
    });
  }, [users, areaLookup]);

  function openEdit(user) {
    // user may be raw from API; use resolved_area_id/area_label if present
    const areaIdFromUser = user.resolved_area_id ?? user.areaid ?? user.area_id ?? "";
    setEditingUser(user);
    setEditForm({
      name: user.name || "",
      email: user.email || "",
      role: user.role || "AREA_NODAL",
      area_id: areaIdFromUser ?? "",
    });
    setEditOpen(true);
  }
  function closeEdit() {
    setEditOpen(false);
    setEditingUser(null);
    setEditForm({ name: "", email: "", role: "AREA_NODAL", area_id: "" });
  }

  function openResetPassword(user) {
    setPwUser(user);
    setPwValue("");
    setShowPassword(false);
    setPwOpen(true);
  }
  function closePw() {
    setPwOpen(false);
    setPwUser(null);
    setPwValue("");
    setShowPassword(false);
  }

  function openDelete(user) {
    setDeleteUser(user);
    setDeleteOpen(true);
  }
  function closeDelete() {
    setDeleteOpen(false);
    setDeleteUser(null);
  }

  async function submitEdit() {
    if (!editingUser) return;
    setSaving(true);
    try {
      const token = getAuthToken();
      if (!token) {
        toast.error("Not authenticated — please login.");
        setSaving(false);
        return;
      }

      const payload = {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        // area_id expected by backend for AREA_NODAL, null otherwise
        area_id: editForm.role === "AREA_NODAL" ? (editForm.area_id ? Number(editForm.area_id) : null) : null,
      };

      const res = await fetch(`${USERS_API}/${editingUser.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Update failed: ${res.status} ${txt}`);
      }

      toast.success("User updated.");
      closeEdit();
      // refresh
      await fetchUsers(`${USERS_API}?page=${currentPage}`);
    } catch (err) {
      console.error("update user error", err);
      toast.error("Update failed — check console.");
    } finally {
      setSaving(false);
    }
  }

  async function submitResetPassword() {
    if (!pwUser) return;
    if (!pwValue || pwValue.length < 6) {
      toast.error("Provide a password with at least 6 characters.");
      return;
    }
    setPwSaving(true);
    try {
      const token = getAuthToken();
      if (!token) {
        toast.error("Not authenticated — please login.");
        setPwSaving(false);
        return;
      }

      const payload = { password: pwValue };
      const res = await fetch(`${USERS_API}/${pwUser.id}/password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Password reset failed: ${res.status} ${txt}`);
      }

      toast.success("Password reset successful.");
      closePw();
    } catch (err) {
      console.error("password reset error", err);
      toast.error("Password reset failed — check console.");
    } finally {
      setPwSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteUser) return;
    setDeleting(true);
    try {
      const token = getAuthToken();
      if (!token) {
        toast.error("Not authenticated — please login.");
        setDeleting(false);
        return;
      }
      const res = await fetch(`${USERS_API}/${deleteUser.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Delete failed: ${res.status} ${txt}`);
      }
      toast.success("User deleted.");
      closeDelete();
      // refresh current page
      await fetchUsers(`${USERS_API}?page=${currentPage}`);
    } catch (err) {
      console.error("delete user error", err);
      toast.error("Delete failed — see console.");
    } finally {
      setDeleting(false);
    }
  }

  const filtered = useMemo(() => {
    if (!q) return computedUsers;
    const qq = q.toLowerCase();
    return computedUsers.filter(u =>
      (u.name || "").toLowerCase().includes(qq) ||
      (u.email || "").toLowerCase().includes(qq) ||
      String(u.id).includes(qq) ||
      (u.area_label || "").toLowerCase().includes(qq)
    );
  }, [computedUsers, q]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Manage Users (HQ / Area nodals)</h3>
          <div className="text-sm text-gray-500">List, edit, reset password, or delete HQ/area nodal users.</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-600">Total: <strong>{total}</strong></div>
          <div className="flex items-center gap-2">
            <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search name / email / id" className="px-3 py-2 border rounded w-64 text-sm" />
            <button onClick={() => fetchUsers()} className="px-3 py-2 bg-indigo-600 text-white rounded text-sm">Refresh</button>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-gray-500">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Area</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>

            <tbody>
              {pageLoading && users.length === 0 ? (
                <tr><td colSpan="7" className="px-3 py-6 text-center text-gray-500">Loading users…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="7" className="px-3 py-6 text-center text-gray-500">No users found.</td></tr>
              ) : filtered.map((u) => (
                <tr key={u.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-3 align-middle font-medium">{u.id}</td>
                  <td className="px-3 py-3">{u.name}</td>
                  <td className="px-3 py-3 text-gray-700">{u.email}</td>
                  <td className="px-3 py-3">{u.role}</td>
                  <td className="px-3 py-3">{u.area_label ?? "-"}</td>
                  <td className="px-3 py-3 text-sm text-gray-500">{formatDate(u.created_at)}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(u)} title="Edit user" className="px-2 py-1 border rounded text-xs flex items-center gap-2 hover:bg-gray-50">
                        {/* edit icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 010 2.828L8.121 14.707a1 1 0 01-.464.263l-4 1a1 1 0 01-1.213-1.213l1-4a1 1 0 01.263-.464L14.586 2.586a2 2 0 012.828 0z"/></svg>
                        <span>Edit</span>
                      </button>

                      <button onClick={() => openResetPassword(u)} title="Reset user password" className="px-2 py-1 border rounded text-xs flex items-center gap-2 hover:bg-gray-50">
                        {/* lock icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 8V6a5 5 0 0110 0v2h1a1 1 0 011 1v7a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1h1zm2-2a3 3 0 116 0v2H7V6z" clipRule="evenodd"/></svg>
                        <span>Reset Password</span>
                      </button>

                      <button onClick={() => openDelete(u)} title="Delete user" className="px-2 py-1 bg-red-600 text-white rounded text-xs flex items-center gap-2 hover:opacity-90">
                        {/* trash icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M6 2a1 1 0 00-1 1v1H3a1 1 0 000 2h14a1 1 0 100-2h-2V3a1 1 0 00-1-1H6zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z"/></svg>
                        <span>Delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-2 items-center">
            <button onClick={handlePrev} disabled={!prevPageUrl || loading} className={`px-3 py-1 rounded border ${!prevPageUrl || loading ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"}`}>← Previous</button>
            <button onClick={handleNext} disabled={!nextPageUrl || loading} className={`px-3 py-1 rounded border ${!nextPageUrl || loading ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"}`}>Next →</button>
          </div>
          <div className="text-sm text-gray-600">Page {currentPage} of {lastPage} • Showing {filtered.length} users (filtered)</div>
        </div>
      </div>

      {/* Edit modal */}
      {editOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeEdit} />
          <div className="relative bg-white rounded-lg shadow-lg p-6 z-50 w-full max-w-xl">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">Edit user — {editingUser.email}</h4>
              <button onClick={closeEdit} className="text-gray-500">Close</button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Full name</label>
                <input value={editForm.name} onChange={(e)=>setEditForm(s => ({ ...s, name: e.target.value }))} className="mt-1 w-full border rounded px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600">Email</label>
                <input value={editForm.email} onChange={(e)=>setEditForm(s => ({ ...s, email: e.target.value }))} className="mt-1 w-full border rounded px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600">Role</label>
                <select value={editForm.role} onChange={(e)=>setEditForm(s => ({ ...s, role: e.target.value }))} className="mt-1 w-full border rounded px-3 py-2 text-sm">
                  <option value="SUPERADMIN">SUPERADMIN</option>
                  <option value="HQ_NODAL">HQ_NODAL</option>
                  <option value="AREA_NODAL">AREA_NODAL</option>
                </select>
              </div>

              {editForm.role === "AREA_NODAL" && (
                <div>
                  <label className="text-xs font-medium text-gray-600">Area</label>
                  <select value={editForm.area_id ?? ""} onChange={(e)=>setEditForm(s => ({ ...s, area_id: e.target.value }))} className="mt-1 w-full border rounded px-3 py-2 text-sm">
                    <option value="">-- Select area --</option>
                    {areas.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3">
                <button onClick={closeEdit} className="px-4 py-2 border rounded">Cancel</button>
                <button onClick={submitEdit} disabled={saving} className={`px-4 py-2 rounded bg-indigo-600 text-white ${saving ? "opacity-70 cursor-not-allowed" : ""}`}>{saving ? "Saving…" : "Save changes"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {pwOpen && pwUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closePw} />
          <div className="relative bg-white rounded-lg shadow-lg p-6 z-50 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">Reset password — {pwUser.email}</h4>
              <button onClick={closePw} className="text-gray-500">Close</button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">New password</label>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={pwValue}
                    onChange={(e)=>setPwValue(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm pr-10"
                    placeholder="At least 6 characters"
                    aria-label="New password"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    title={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                    aria-pressed={showPassword}
                  >
                    {showPassword ? (
                      // eye-off icon
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0112 20c-5.5 0-10-4.5-10-8s4.5-8 10-8c2.31 0 4.42.75 6.06 2.06"/><path d="M1 1l22 22"/></svg>
                    ) : (
                      // eye icon
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
                <div className="text-xs text-gray-500 mt-1">Make sure to give a memorable secure password. Minimum 6 characters.</div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button onClick={closePw} className="px-4 py-2 border rounded">Cancel</button>
                <button onClick={submitResetPassword} disabled={pwSaving} className={`px-4 py-2 rounded bg-indigo-600 text-white ${pwSaving ? "opacity-70 cursor-not-allowed" : ""}`}>{pwSaving ? "Saving…" : "Reset Password"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteOpen && deleteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeDelete} />
          <div className="relative bg-white rounded-lg shadow-lg p-6 z-50 w-full max-w-md">
            <div className="mb-3">
              <h4 className="text-lg font-semibold">Delete user</h4>
              <div className="text-sm text-gray-600">Are you sure you want to permanently delete <strong>{deleteUser.name} ({deleteUser.email})</strong>? This action cannot be undone.</div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={closeDelete} className="px-4 py-2 border rounded">Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} className={`px-4 py-2 bg-red-600 text-white rounded ${deleting ? "opacity-70 cursor-not-allowed" : ""}`}>{deleting ? "Deleting…" : "Delete user"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
