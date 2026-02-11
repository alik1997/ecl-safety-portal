// src/dashboards/MailGroups.jsx
import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";

const MAIL_GROUPS_API = "/api/hq/mail-groups"; // GET list, POST create
const USERS_API = "/api/hq/users"; // to pick users when adding members

function getAuthToken() {
  return localStorage.getItem("ecl_token") || localStorage.getItem("auth_token") || null;
}

function formatDate(iso) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function MailGroups() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);

  // create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ key: "", name: "" });
  const [creating, setCreating] = useState(false);

  // view modal state
  const [viewOpen, setViewOpen] = useState(false);
  const [viewGroup, setViewGroup] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);

  // users for adding members
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [addMemberSaving, setAddMemberSaving] = useState(false);
  const [selectedUserToAdd, setSelectedUserToAdd] = useState("");

  useEffect(() => {
    fetchGroups();
    // pre-load users for add-member dropdown (simple fetch of first page)
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchGroups() {
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(MAIL_GROUPS_API, {
        method: "GET",
        headers: token
          ? {
              Accept: "application/json",
              "X-Requested-With": "XMLHttpRequest",
              Authorization: `Bearer ${token}`,
            }
          : { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      });
      if (!res.ok) throw new Error(`Failed to fetch groups: ${res.status}`);
      const json = await res.json();
      // API returns array — examples you gave are raw array
      setGroups(Array.isArray(json) ? json : json.data ?? []);
    } catch (err) {
      console.error("fetchGroups error", err);
      toast.error("Could not load mail groups — see console.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchUsers(url = USERS_API) {
    setUsersLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(url, {
        method: "GET",
        headers: token
          ? {
              Accept: "application/json",
              "X-Requested-With": "XMLHttpRequest",
              Authorization: `Bearer ${token}`,
            }
          : { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      });
      if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
      const json = await res.json();
      // users endpoint in your app returns paginated object with data array (as in UserList)
      const list = Array.isArray(json.data) ? json.data : json;
      setUsers(list);
    } catch (err) {
      console.error("fetchUsers error", err);
      toast.error("Could not load users — see console.");
    } finally {
      setUsersLoading(false);
    }
  }

  // Create group
  async function submitCreate(e) {
    e && e.preventDefault();
    if (!createForm.key || !createForm.name) {
      toast.error("Provide both key and name for the group.");
      return;
    }
    setCreating(true);
    try {
      const token = getAuthToken();
      const res = await fetch(MAIL_GROUPS_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : undefined,
        },
        body: JSON.stringify({
          key: createForm.key,
          name: createForm.name,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Create failed: ${res.status} ${txt}`);
      }
      toast.success("Group created.");
      setCreateForm({ key: "", name: "" });
      setCreateOpen(false);
      await fetchGroups();
    } catch (err) {
      console.error("create group error", err);
      toast.error("Failed to create group — see console.");
    } finally {
      setCreating(false);
    }
  }

  // View group with members
  async function openView(groupId) {
    setViewOpen(true);
    setViewLoading(true);
    setViewGroup(null);
    try {
      const token = getAuthToken();
      const res = await fetch(`${MAIL_GROUPS_API}/${groupId}`, {
        method: "GET",
        headers: token
          ? {
              Accept: "application/json",
              "X-Requested-With": "XMLHttpRequest",
              Authorization: `Bearer ${token}`,
            }
          : { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Fetch group failed: ${res.status} ${txt}`);
      }
      const json = await res.json();
      setViewGroup(json);
      // preselect blank
      setSelectedUserToAdd("");
    } catch (err) {
      console.error("openView error", err);
      toast.error("Could not load group details — see console.");
      setViewOpen(false);
    } finally {
      setViewLoading(false);
    }
  }

  async function closeView() {
    setViewOpen(false);
    setViewGroup(null);
    setSelectedUserToAdd("");
  }

  // Add member
  async function addMember(e) {
    e && e.preventDefault();
    if (!viewGroup) return;
    if (!selectedUserToAdd) {
      toast.error("Select a user to add.");
      return;
    }
    setAddMemberSaving(true);
    try {
      const token = getAuthToken();
      const payload = { user_id: Number(selectedUserToAdd) };
      const res = await fetch(`${MAIL_GROUPS_API}/${viewGroup.id}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : undefined,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Add member failed: ${res.status} ${txt}`);
      }
      toast.success("Member added.");
      // refresh viewGroup
      await openView(viewGroup.id);
    } catch (err) {
      console.error("addMember error", err);
      toast.error("Failed to add member — see console.");
    } finally {
      setAddMemberSaving(false);
    }
  }

  // Remove member
  async function removeMember(userId) {
    if (!viewGroup) return;
    if (!window.confirm("Remove this member from group?")) return;
    try {
      const token = getAuthToken();
      const res = await fetch(`${MAIL_GROUPS_API}/${viewGroup.id}/members/${userId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Remove member failed: ${res.status} ${txt}`);
      }
      toast.success("Member removed.");
      await openView(viewGroup.id);
    } catch (err) {
      console.error("removeMember error", err);
      toast.error("Failed to remove member — see console.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Mail Groups</h3>
          <div className="text-sm text-gray-500">Create groups and manage members that will receive complaint emails.</div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => { setCreateOpen(true); }} className="px-3 py-2 bg-indigo-600 text-white rounded text-sm">+ Create group</button>
          <button onClick={fetchGroups} className="px-3 py-2 border rounded text-sm">Refresh</button>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-gray-500">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Key</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Members</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="px-3 py-6 text-center text-gray-500">Loading groups…</td></tr>
              ) : groups.length === 0 ? (
                <tr><td colSpan="6" className="px-3 py-6 text-center text-gray-500">No groups found.</td></tr>
              ) : groups.map(g => (
                <tr key={g.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-3 align-middle font-medium">{g.id}</td>
                  <td className="px-3 py-3">{g.key}</td>
                  <td className="px-3 py-3">{g.name}</td>
                  <td className="px-3 py-3 text-sm text-gray-500">{formatDate(g.created_at)}</td>
                  <td className="px-3 py-3">{g.members ? g.members.length : (g.count_members ?? "-")}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openView(g.id)} className="px-2 py-1 border rounded text-xs hover:bg-gray-50">View</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCreateOpen(false)} />
          <div className="relative bg-white rounded-lg shadow-lg p-6 z-50 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">Create mail group</h4>
              <button onClick={() => setCreateOpen(false)} className="text-gray-500">Close</button>
            </div>

            <form onSubmit={submitCreate} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Key (unique)</label>
                <input value={createForm.key} onChange={(e) => setCreateForm(s => ({ ...s, key: e.target.value }))} className="mt-1 w-full border rounded px-3 py-2 text-sm" placeholder="E.g. COMPLAINT_NEW" />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600">Name</label>
                <input value={createForm.name} onChange={(e) => setCreateForm(s => ({ ...s, name: e.target.value }))} className="mt-1 w-full border rounded px-3 py-2 text-sm" placeholder="E.g. New complaint notifications" />
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 border rounded">Cancel</button>
                <button type="submit" disabled={creating} className={`px-4 py-2 rounded bg-indigo-600 text-white ${creating ? "opacity-70 cursor-not-allowed" : ""}`}>{creating ? "Creating…" : "Create group"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View modal (members + add/remove) */}
      {viewOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
          <div className="absolute inset-0 bg-black/40" onClick={closeView} />
          <div className="relative bg-white rounded-lg shadow-lg p-6 z-50 w-full max-w-3xl max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">Group — {viewGroup ? `${viewGroup.name} (${viewGroup.key})` : "Loading..."}</h4>
              <button onClick={closeView} className="text-gray-500">Close</button>
            </div>

            {viewLoading || !viewGroup ? (
              <div className="text-gray-500">Loading group details…</div>
            ) : (
              <>
                <div className="mb-4 text-sm text-gray-600">Created: {formatDate(viewGroup.created_at)}</div>

                <div className="mb-6">
                  <h5 className="font-medium mb-2">Members ({(viewGroup.members || []).length})</h5>
                  <div className="space-y-2">
                    {viewGroup.members && viewGroup.members.length > 0 ? (
                      viewGroup.members.map(m => (
                        <div key={m.id} className="flex items-center justify-between border rounded p-2">
                          <div>
                            <div className="font-medium">{m.name} <span className="text-xs text-gray-500">({m.role})</span></div>
                            <div className="text-xs text-gray-600">{m.email}</div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => removeMember(m.id)} className="px-2 py-1 text-xs bg-red-600 text-white rounded">Remove</button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-gray-500">No members in this group.</div>
                    )}
                  </div>
                </div>

                <div className="mb-4 border-t pt-4">
                  <h5 className="font-medium mb-2">Add member</h5>
                  <div className="flex gap-2 items-center">
                    <select value={selectedUserToAdd} onChange={(e) => setSelectedUserToAdd(e.target.value)} className="flex-1 border rounded px-3 py-2 text-sm">
                      <option value="">-- Select user to add --</option>
                      {usersLoading ? (
                        <option>Loading users…</option>
                      ) : users.length === 0 ? (
                        <option value="">No users available</option>
                      ) : (
                        users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.email} {u.area_name ? `(${u.area_name})` : ""}</option>)
                      )}
                    </select>
                    <button onClick={addMember} disabled={addMemberSaving} className={`px-3 py-2 bg-indigo-600 text-white rounded text-sm ${addMemberSaving ? "opacity-70 cursor-not-allowed": ""}`}>Add</button>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">Tip: use the Users page to manage/add HQ/area nodal users, then add them here.</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
