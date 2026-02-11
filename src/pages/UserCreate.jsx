// src/pages/UserCreate.jsx
import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";

/**
 * UserCreate
 *
 * - Accepts optional `areas` prop: [{ id, label }] — useful for wiring from parent.
 * - If `areas` not provided it will fetch public areas and normalize them.
 * - Caches successful fetch in localStorage to avoid flakiness.
 *
 * Usage:
 *  <UserCreate areas={areas} />
 *
 * Endpoint:
 *  POST /api/hq/users
 */

const USERS_API = "/api/hq/users";
// Primary area endpoint the user specified
const AREAS_API_PRIMARY = "http://127.0.0.1:8000/api/public/areas";
// Secondary fallback (same as older code)
const AREAS_API_FALLBACK = "/api/public/areas";

function getAuthToken() {
  return localStorage.getItem("ecl_token") || localStorage.getItem("auth_token") || null;
}

function normalizeAreaItem(a) {
  // Accept common shapes returned by your backend
  const idRaw = a?.id ?? a?.area_id ?? a?.areaid ?? a?.areaId ?? null;
  const labelRaw = a?.name ?? a?.unit_name ?? a?.unit ?? a?.label ?? a?.area_name ?? null;
  const id = idRaw !== null && idRaw !== undefined ? String(idRaw) : "";
  const label = labelRaw ?? `Area ${id}`;
  return { id, label };
}

async function fetchFromUrl(url, token = null) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const err = new Error(`Fetch ${url} failed: ${res.status} ${txt}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json().catch(() => null);
  // normalise to array
  const list = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
  return list;
}

export default function UserCreate({ areas: initialAreas = null, loadingAreas: parentLoadingAreas = false }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("AREA_NODAL");
  const [areaId, setAreaId] = useState("");
  const [loading, setLoading] = useState(false);

  // internal areas state (normalized {id,label})
  const [areas, setAreas] = useState(Array.isArray(initialAreas) && initialAreas.length ? initialAreas.map(normalizeAreaItem) : []);
  const [fetchingAreas, setFetchingAreas] = useState(false);
  const [createdUser, setCreatedUser] = useState(null);
  const [errors, setErrors] = useState({});

  const ROLE_OPTIONS = [
    { value: "AREA_NODAL", label: "Area Nodal (AREA_NODAL)" },
    { value: "HQ_NODAL", label: "HQ Nodal (HQ_NODAL)" },
    { value: "SUPERADMIN", label: "Super Admin (SUPERADMIN)" },
  ];

  // Try to seed from localStorage if available and no initialAreas provided
  useEffect(() => {
    if (Array.isArray(initialAreas) && initialAreas.length) {
      // ensure normalized
      setAreas(initialAreas.map(normalizeAreaItem));
      return;
    }

    try {
      const cached = localStorage.getItem("ecl_public_areas_v1");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length) {
          setAreas(parsed);
          console.debug("[UserCreate] seeded areas from localStorage", parsed.length);
          return;
        }
      }
    } catch (e) {
      // ignore parse errors
    }

    // If parent indicated it's already fetching, don't double fetch here
    if (parentLoadingAreas) return;

    // otherwise fetch now
    fetchAreas().catch((err) => {
      console.warn("Initial fetchAreas failed:", err);
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PUBLIC: call to fetch areas. Exposed as button "Refresh areas".
  async function fetchAreas() {
    setFetchingAreas(true);
    setErrors((prev) => ({ ...prev, fetchAreas: null }));
    const token = getAuthToken();
    try {
      // Try primary (127.0.0.1) first
      let rawList = [];
      try {
        rawList = await fetchFromUrl(AREAS_API_PRIMARY, token);
        console.debug(`[UserCreate] fetched ${rawList.length} areas from primary (${AREAS_API_PRIMARY})`, rawList.slice(0, 6));
      } catch (errPrimary) {
        console.warn("Primary areas fetch failed, trying fallback:", errPrimary?.message || errPrimary);
        // Try fallback
        try {
          rawList = await fetchFromUrl(AREAS_API_FALLBACK, token);
          console.debug(`[UserCreate] fetched ${rawList.length} areas from fallback (${AREAS_API_FALLBACK})`, rawList.slice(0, 6));
        } catch (errFallback) {
          console.error("Both area endpoints failed:", errFallback);
          throw errFallback;
        }
      }

      // Normalize + dedupe by id
      const normalized = rawList.map(normalizeAreaItem).filter((a) => a.id);
      const map = new Map();
      normalized.forEach((a) => {
        // prefer fuller label if duplicate ids encountered
        if (!map.has(a.id) || (a.label && a.label.length > (map.get(a.id)?.label?.length || 0))) {
          map.set(a.id, a);
        }
      });
      const deduped = Array.from(map.values()).sort((x, y) => String(x.label).localeCompare(String(y.label)));

      // Save to state + cache
      setAreas(deduped);
      try {
        localStorage.setItem("ecl_public_areas_v1", JSON.stringify(deduped));
      } catch (e) {
        // ignore storage errors (quota, etc)
      }

      // If previously selected areaId is missing now, keep empty
      if (areaId && !deduped.find((a) => String(a.id) === String(areaId))) {
        setAreaId("");
      }

      return deduped;
    } catch (err) {
      setAreas([]);
      const msg = `Could not load areas: ${err?.message ?? err}`;
      setErrors((prev) => ({ ...prev, fetchAreas: msg }));
      toast.error(msg);
      throw err;
    } finally {
      setFetchingAreas(false);
    }
  }

  function validate() {
    const e = {};
    if (!name.trim()) e.name = "Name is required";
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) e.email = "Valid email required";
    if (!password || password.length < 6) e.password = "Password (min 6 chars)";
    if (!role) e.role = "Select role";
    if ((role === "AREA_NODAL" || role === "HQ_NODAL") && !areaId) e.areaId = "Select area for this role";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!validate()) {
      toast.error("Fix validation errors");
      return;
    }
    setLoading(true);
    setCreatedUser(null);

    try {
      const token = getAuthToken();
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const payload = {
        name: name.trim(),
        email: email.trim(),
        password,
        role,
      };
      if (role === "AREA_NODAL" || role === "HQ_NODAL") payload.area_id = Number(areaId);

      const res = await fetch(USERS_API, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!res.ok) {
        const msg = (json && (json.message || json.error)) || `Server returned ${res.status}`;
        console.error("Create user failed:", text);
        toast.error(`Create failed: ${msg}`);
        if (json?.errors) setErrors(json.errors || {});
        setLoading(false);
        return;
      }

      toast.success("User created successfully");
      const user = (json && (json.user || json.data || json)) || null;
      setCreatedUser(user);
      setName("");
      setEmail("");
      setPassword("");
      setErrors({});
    } catch (err) {
      console.error("Create user error:", err);
      toast.error("Create user failed — see console");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border rounded-lg p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Create HQ User (Superadmin)</h3>
        <div className="text-sm text-gray-500">Secure endpoint: POST /api/hq/users</div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Full name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`mt-1 w-full border rounded px-3 py-2 text-sm ${errors.name ? "border-red-400" : ""}`}
              placeholder="e.g. Area Nodal 1"
            />
            {errors.name && <div className="text-xs text-red-600 mt-1">{errors.name}</div>}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`mt-1 w-full border rounded px-3 py-2 text-sm ${errors.email ? "border-red-400" : ""}`}
              placeholder="area1@example.com"
            />
            {errors.email && <div className="text-xs text-red-600 mt-1">{errors.email}</div>}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`mt-1 w-full border rounded px-3 py-2 text-sm ${errors.password ? "border-red-400" : ""}`}
              placeholder="Min 6 characters"
            />
            {errors.password && <div className="text-xs text-red-600 mt-1">{errors.password}</div>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={`mt-1 w-full border rounded px-3 py-2 text-sm ${errors.role ? "border-red-400" : ""}`}>
              {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {errors.role && <div className="text-xs text-red-600 mt-1">{errors.role}</div>}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Area (required for nodals)</label>
            <div className="flex gap-2">
              <select
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
                disabled={fetchingAreas}
                className={`mt-1 w-full border rounded px-3 py-2 text-sm ${errors.areaId ? "border-red-400" : ""}`}
              >
                <option value="">-- select area --</option>
                {areas && areas.length > 0 ? (
                  areas.map(a => <option key={a.id} value={String(a.id)}>{a.label}</option>)
                ) : (
                  <option value="">No areas available</option>
                )}
              </select>

              <button
                type="button"
                onClick={() => fetchAreas().catch(() => {})}
                className={`mt-1 px-3 py-2 border rounded text-sm ${fetchingAreas ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"}`}
                disabled={fetchingAreas}
                title="Refresh areas from server"
              >
                {fetchingAreas ? "Refreshing…" : "Refresh areas"}
              </button>
            </div>

            {fetchingAreas && <div className="text-xs text-gray-500 mt-1">Loading areas…</div>}
            {errors.areaId && <div className="text-xs text-red-600 mt-1">{errors.areaId}</div>}
            {errors.fetchAreas && <div className="text-xs text-red-600 mt-1">{errors.fetchAreas}</div>}
          </div>
        </div>

        <div className="flex gap-2 items-center">
          <button
            type="submit"
            disabled={loading}
            className={`px-4 py-2 rounded bg-indigo-600 text-white ${loading ? "opacity-70 cursor-not-allowed" : "hover:opacity-90"}`}
          >
            {loading ? "Creating…" : "Create user"}
          </button>

          <button
            type="button"
            onClick={() => { setName(""); setEmail(""); setPassword(""); setErrors({}); setCreatedUser(null); }}
            className="px-4 py-2 border rounded"
          >
            Reset
          </button>

          <div className="text-sm text-gray-500 ml-auto">
            Tip: passwords are sent over your API — ensure HTTPS in production.
          </div>
        </div>
      </form>

      {createdUser && (
        <div className="mt-6 p-4 border rounded bg-green-50">
          <div className="text-sm text-green-800 font-semibold">Created user</div>
          <div className="mt-2 text-sm">
            <div><strong>ID:</strong> {createdUser.id ?? createdUser.user?.id ?? "—"}</div>
            <div><strong>Name:</strong> {createdUser.name ?? createdUser.user?.name}</div>
            <div><strong>Email:</strong> {createdUser.email ?? createdUser.user?.email}</div>
            <div><strong>Role:</strong> {createdUser.role ?? createdUser.user?.role}</div>
            <div className="mt-2">
              <button
                onClick={() => { navigator.clipboard?.writeText(JSON.stringify(createdUser)); toast.success("Copied created user JSON"); }}
                className="px-3 py-1 border rounded text-xs"
              >
                Copy JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}