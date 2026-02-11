// src/dashboards/SafetyDashboard.jsx
import UserCreate from "../pages/UserCreate";
import UserList from "./UserList"; // <-- added
import MailGroups from "./MailGroups";
import React, { useEffect, useMemo, useState, useRef } from "react";
import ResponsesTable from "../components/ResponsesTable";
import StatCard from "../components/StatCard";
import toast from "react-hot-toast";
import ActionReports from "../dashboards/ActionReports";

/**
 * SafetyDashboard
 *
 * - Charts use aggregatedResponses (all pages).
 * - Chart labels sampled and rotated to avoid overlap.
 * - mapComplaintToResponse now exposes isAssigned flag so UI reliably detects assigned state.
 * - After successful assign we re-fetch the current page (authoritative refresh).
 */

const HQ_COMPLAINTS_API = "/api/hq/complaints";
// use the new HQ users "options" endpoint for AREA_NODAL users
const NODAL_OFFICERS_API = "/api/hq/users/options?role=AREA_NODAL";

// NEW: HQ users API (full users list) - used to resolve id -> name
const HQ_USERS_API = "/api/hq/users";

// Public lookup endpoints (use same internal IP as your other endpoints)
const PUBLIC_AREAS = "/api/public/areas";
const PUBLIC_EMPLOY = "/api/public/employment-types";

function prettyDate(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function getFinancialYearFromIso(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m >= 4) return `${y}-${y + 1}`;
  return `${y - 1}-${y}`;
}

/** Map server complaint object to UI response row */
function mapComplaintToResponse(c) {
  const incidentDate = c.incident_date || c.created_at || null;
  const createdAt = c.created_at || null;

  const title = c.description
    ? (c.description.length > 60 ? c.description.slice(0, 60) + "..." : c.description)
    : "Unsafe Act Report";

  const nameParts = [c.prefix, c.first_name, c.middle_name, c.last_name].filter(Boolean);
  const submittedBy = nameParts.length ? nameParts.join(" ").trim() : (c.email || "Anonymous");

  const trackingNumber = c.public_token || `ECL-${String(c.id).padStart(4, "0")}`;

  // robust assigned detection from server fields
  const assignedField = c.assignedto ?? c.assigned_to ?? null;
  const isAssigned = Boolean(
    assignedField ||
    c.assignedby ||
    c.isclosed ||
    (c.workflowstatus && String(c.workflowstatus).toUpperCase() !== "NEW")
  );

  const hasAction =
    Boolean(c.assignedby) ||
    Boolean(assignedField) ||
    Boolean(c.isclosed) ||
    (c.workflowstatus && String(c.workflowstatus).toUpperCase() !== "NEW");

  const actionTaken = hasAction
    ? {
        text:
          c.workflowstatus && c.workflowstatus !== "NEW"
            ? `${String(c.workflowstatus).replace(/_/g, " ")}`
            : (assignedField ? `Assigned to ${assignedField}` : (c.isclosed ? "Closed" : "Action recorded")),
        status: c.workflowstatus ?? null,
        assignedTo: assignedField ?? null,
        assignedBy: c.assignedby ?? null,
        assignedAt: c.assignedat ? prettyDate(c.assignedat) : null,
      }
    : null;

  return {
    id: c.id,
    title,
    submittedBy,
    date: prettyDate(createdAt || incidentDate),
    description: c.description || "-",
    location: c.location || "-",
    incidentDate,
    createdAt,
    trackingNumber,
    attachmentPath: c.attachment_path || null,
    attachments: c.attachment_path ? [c.attachment_path] : [],
    isClosed: Boolean(c.isclosed),
    workflowstatus: c.workflowstatus || null,
    assignedTo: assignedField ?? null, // may be id or name depending on backend
    assignedBy: c.assignedby ?? null,
    actionTaken,
    completion: c.isclosed ? "Closed" : (c.workflowstatus ? c.workflowstatus : "Pending"),
    raw: c,
    employment_type_id: c.employment_type_id ?? null,
    area_id: c.area_id ?? null,
    reported_status_id: c.reported_status_id ?? null,
    financialYear: getFinancialYearFromIso(incidentDate || createdAt),
    isAssigned,
  };
}

/* Small chart components omitted for brevity — keep same SimpleBarChart & DonutChart as before */
const COLORS = {
  blue: "#3b82f6",
  teal: "#06b6d4",
  grayText: "#374151",
  muted: "#6b7280",
  warn: "#f97316",
  danger: "#ef4444",
};

function SimpleBarChart({ data = [], width = 720, height = 220, maxBars = 60, maxLabels = 10 }) {
  const pad = { top: 12, right: 12, bottom: 64, left: 36 };
  const innerW = Math.max(200, width - pad.left - pad.right);
  const innerH = Math.max(90, height - pad.top - pad.bottom);
  const display = data.slice(-maxBars);
  const maxValue = Math.max(1, ...display.map((d) => Math.max(d.responses || 0, d.actions || 0)));
  const barW = Math.max(8, innerW / Math.max(1, display.length));
  const labelStep = Math.max(1, Math.ceil(display.length / Math.max(1, maxLabels)));

  return (
    <svg width={width} height={height} className="block" style={{ overflow: "visible" }}>
      <g transform={`translate(${pad.left},${pad.top})`}>
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const y = innerH - (innerH * t);
          const val = Math.round(maxValue * t);
          return (
            <g key={i}>
              <line x1={0} x2={innerW} y1={y} y2={y} stroke="#eef2f7" strokeWidth={1} />
              <text x={-10} y={y + 4} fontSize="10" fill={COLORS.muted} textAnchor="end">{val}</text>
            </g>
          );
        })}

        {display.map((d, idx) => {
          const x = idx * barW;
          const respH = innerH * (d.responses / maxValue || 0);
          const actH = innerH * (d.actions / maxValue || 0);
          const respY = innerH - respH;
          const actY = innerH - actH;
          const bw = Math.max(6, barW * 0.44);
          const showLabel = (idx % labelStep === 0) || idx === display.length - 1;
          const label = d.label.length > 12 ? d.label.slice(0, 12) + "…" : d.label;

          return (
            <g key={d.label} transform={`translate(${x},0)`}>
              <rect x={(barW - bw) / 2} y={respY} width={bw} height={respH} rx="3" fill={COLORS.blue} opacity="0.95" />
              <rect x={(barW - bw) / 2 + bw * 0.16} y={actY} width={bw * 0.68} height={actH} rx="2" fill={COLORS.teal} opacity="0.98" />
              <g transform={`translate(${barW / 2}, ${innerH + 8})`}> 
                {showLabel ? (
                  <text fontSize="10" fill={COLORS.grayText} textAnchor="middle" transform="rotate(-45)" style={{ transformOrigin: "center" }}>
                    {label}
                  </text>
                ) : null}
              </g>
            </g>
          );
        })}

        <g transform={`translate(${Math.max(0, innerW - 220)}, -8)`}>
          <rect x={0} y={0} width={10} height={10} fill={COLORS.blue} rx="2" />
          <text x={14} y={9} fontSize="11" fill={COLORS.grayText}>Responses</text>
          <rect x={0} y={16} width={10} height={10} fill={COLORS.teal} rx="2" />
          <text x={14} y={25} fontSize="11" fill={COLORS.grayText}>Actions Taken</text>
        </g>
      </g>
    </svg>
  );
}

function DonutChart({ valueMap = {}, size = 140 }) {
  const colors = ["#06b6d4", "#3b82f6", "#f97316", "#a78bfa", "#60a5fa"];
  const total = Object.values(valueMap).reduce((s, v) => s + (v || 0), 0);
  const center = size / 2;
  const r = center - 8;
  let angleStart = -Math.PI / 2;
  const minAngle = 0.04;
  const entries = Object.keys(valueMap).map((k) => ({ label: k, value: valueMap[k] || 0 }));
  let otherValue = 0;
  const bigEntries = [];
  entries.forEach((e) => {
    const ratio = total ? e.value / total : 0;
    const angle = ratio * Math.PI * 2;
    if (angle < minAngle && e.value > 0) otherValue += e.value;
    else if (e.value > 0) bigEntries.push(e);
  });
  if (otherValue > 0) bigEntries.push({ label: "Other", value: otherValue });
  const slices = bigEntries.map((e, i) => {
    const val = e.value || 0;
    const angle = (val / Math.max(1, total)) * Math.PI * 2;
    const angleEnd = angleStart + angle;
    const x1 = center + r * Math.cos(angleStart);
    const y1 = center + r * Math.sin(angleStart);
    const x2 = center + r * Math.cos(angleEnd);
    const y2 = center + r * Math.sin(angleEnd);
    const large = angle > Math.PI ? 1 : 0;
    const d = val === 0 ? "" : `M ${center} ${center} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    angleStart = angleEnd;
    return { label: e.label, value: val, path: d, color: colors[i % colors.length] };
  });

  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0" style={{ overflow: "visible" }}>
        <circle cx={center} cy={center} r={r} fill="#f8fafc" />
        <g>{slices.map((s, idx) => s.value > 0 && s.path ? <path key={idx} d={s.path} fill={s.color} /> : null)}</g>
        <circle cx={center} cy={center} r={r * 0.58} fill="#ffffff" />
        <text x={center} y={center} textAnchor="middle" dy="4" fontSize="12" fill="#111827">{total}</text>
      </svg>

      <div className="text-sm">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2 mb-1">
            <span style={{ background: s.color }} className="w-3 h-3 rounded-sm inline-block" />
            <span className="text-xs text-gray-700">{s.label} — <span className="font-semibold">{s.value}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------ Helpers to normalize assigned labels ------------------ */

/**
 * extractUserId(value)
 * - extracts a numeric user id from various messy backend formats:
 *   - 10, "10"
 *   - "user_id=10", "user id:10", "userid 10", "id=10"
 *   - "area officer user_id=10"
 * - returns string id if found, otherwise null
 */
function extractUserId(value) {
  if (value === null || value === undefined) return null;

  // pure number
  if (typeof value === "number") return String(value);

  // numeric string like "10"
  if (typeof value === "string" && /^\s*\d+\s*$/.test(value)) return value.trim();

  if (typeof value === "string") {
    // common noisy patterns: user_id=10, user id:10, userid 10, id=10, (user_id=10)
    const regex = /(?:user[_\s-]*id|userid|user\s*id|id)\s*[:=]?\s*[\(\[]?\s*(\d+)\b/i;
    const m = value.match(regex);
    if (m && m[1]) return m[1];
  }
  return null;
}

/**
 * formatAssignedLabel(assigned, mapInstance)
 * - If assigned contains an id (or is numeric), returns "Name (id:10)" using mapInstance
 * - Otherwise returns the original assigned value
 */
function formatAssignedLabel(assigned, mapInstance = new Map()) {
  if (assigned === null || assigned === undefined || assigned === "") return assigned;

  const id = extractUserId(assigned);
  if (id) {
    const name = mapInstance?.get(String(id));
    if (name) return `${name} (id:${id})`;
    return `User ${id}`;
  }
  // If assigned looks like a plain numeric value (rare), map it
  if (typeof assigned === "number" || (typeof assigned === "string" && /^\s*\d+\s*$/.test(assigned))) {
    const idStr = String(assigned).trim();
    const name = mapInstance?.get(idStr);
    if (name) return `${name} (id:${idStr})`;
    return `User ${idStr}`;
  }
  // otherwise just return as-is (likely already a name/email)
  return assigned;
}

/**
 * normalizeAssignedOnResponse(row, mapInstance)
 * - returns a new row with assignedTo and actionTaken normalized where possible.
 * - keeps row.raw unchanged.
 */
function normalizeAssignedOnResponse(row, mapInstance = new Map()) {
  if (!row) return row;
  const assignedCandidates = [];

  if (row.assignedTo) assignedCandidates.push({ key: "assignedTo", value: row.assignedTo });
  if (row.actionTaken && row.actionTaken.assignedTo) assignedCandidates.push({ key: "actionAssignedTo", value: row.actionTaken.assignedTo });
  if (row.actionTaken && row.actionTaken.text) assignedCandidates.push({ key: "actionText", value: row.actionTaken.text });
  if (row.raw && row.raw.assignedto) assignedCandidates.push({ key: "rawAssigned", value: row.raw.assignedto });

  let label = null;
  let sourceValue = null;
  for (const c of assignedCandidates) {
    const id = extractUserId(c.value);
    if (id) {
      const name = mapInstance?.get(String(id));
      label = name ? `${name} (id:${id})` : `User ${id}`;
      sourceValue = c.value;
      break;
    }
  }

  // fallback: if row.assignedTo is purely numeric and map exists
  if (!label && row.assignedTo && /^\s*\d+\s*$/.test(String(row.assignedTo))) {
    const idStr = String(row.assignedTo).trim();
    const name = mapInstance?.get(idStr);
    if (name) label = `${name} (id:${idStr})`;
    else label = `User ${idStr}`;
    sourceValue = row.assignedTo;
  }

  if (!label) {
    // nothing to normalize — return shallow copy
    return { ...row };
  }

  const newActionTaken = row.actionTaken ? { ...row.actionTaken } : null;
  if (newActionTaken) {
    newActionTaken.assignedTo = label;
    if (newActionTaken.text) {
      if (sourceValue && typeof sourceValue === "string" && newActionTaken.text.includes(sourceValue)) {
        newActionTaken.text = newActionTaken.text.replace(sourceValue, label);
      } else {
        newActionTaken.text = `Assigned to ${label}`;
      }
    } else {
      newActionTaken.text = `Assigned to ${label}`;
    }
  }

  return {
    ...row,
    assignedTo: label,
    actionTaken: newActionTaken,
  };
}

/* ------------------ Open/Closed bar component ------------------ */

/**
 * OpenClosedBar
 * - expects counts: assignedOpen, unassignedOpen, closed
 * - renders a horizontal stacked bar and labels
 */
function OpenClosedBar({ assignedOpen = 0, unassignedOpen = 0, closed = 0 }) {
  const total = assignedOpen + unassignedOpen + closed;
  const safeTotal = Math.max(1, total);
  const assignedPct = Math.round((assignedOpen / safeTotal) * 1000) / 10;
  const unassignedPct = Math.round((unassignedOpen / safeTotal) * 1000) / 10;
  const closedPct = Math.round((closed / safeTotal) * 1000) / 10;

  return (
    <div className="bg-white border rounded-lg p-3" style={{ borderColor: "#eef2f7" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium" style={{ color: COLORS.grayText }}>Open / Closed overview</div>
        <div className="text-xs text-gray-500">{total} complaints (filtered)</div>
      </div>

      <div className="w-full h-8 bg-gray-100 rounded overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={(total ? (assignedPct + unassignedPct + closedPct) : 0)}>
        <div
          title={`Assigned (open): ${assignedOpen}`}
          style={{ width: `${assignedPct}%`, background: COLORS.teal, height: "100%", display: "inline-block" }}
        />
        <div
          title={`Unassigned (open): ${unassignedOpen}`}
          style={{ width: `${unassignedPct}%`, background: COLORS.blue, height: "100%", display: "inline-block" }}
        />
        <div
          title={`Closed: ${closed}`}
          style={{ width: `${closedPct}%`, background: COLORS.warn, height: "100%", display: "inline-block" }}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm" style={{ background: COLORS.teal }} />
          <div>
            <div className="text-xs text-gray-700">Assigned (Open)</div>
            <div className="font-semibold">{assignedOpen} <span className="text-gray-400">({assignedPct}%)</span></div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm" style={{ background: COLORS.blue }} />
          <div>
            <div className="text-xs text-gray-700">Unassigned (Open)</div>
            <div className="font-semibold">{unassignedOpen} <span className="text-gray-400">({unassignedPct}%)</span></div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm" style={{ background: COLORS.warn }} />
          <div>
            <div className="text-xs text-gray-700">Closed</div>
            <div className="font-semibold">{closed} <span className="text-gray-400">({closedPct}%)</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------ MAIN ------------------ */

export default function SafetyDashboard({ onOpenActionModal }) {
  const [responses, setResponses] = useState([]); // page-level
  const [aggregatedResponses, setAggregatedResponses] = useState([]); // all pages (for charts/stats)
  const [loading, setLoading] = useState(false);
  const [aggLoading, setAggLoading] = useState(false);
  const [error, setError] = useState(null);

  const [activeView, setActiveView] = useState("responses");

  // pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [nextPageUrl, setNextPageUrl] = useState(null);
  const [prevPageUrl, setPrevPageUrl] = useState(null);

  // filters
  const [filterComplaintId, setFilterComplaintId] = useState("");
  const [filterText, setFilterText] = useState("");
  const [filterArea, setFilterArea] = useState("");
  const [filterEmploymentType, setFilterEmploymentType] = useState("");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [filterFY, setFilterFY] = useState("");
  // NEW: status filter ("All" | "Open" | "Closed" | "Assigned" | "Unassigned")
  const [filterStatus, setFilterStatus] = useState("");

  // nodal map (areaId -> [users]) and "all" list
  const [nodalMap, setNodalMap] = useState(new Map());
  const [allNodals, setAllNodals] = useState([]);
  const [loadingNodals, setLoadingNodals] = useState(false);

  // HQ users (id -> name) map to resolve assigned user ids to readable names
  const [hqUsersMap, setHqUsersMap] = useState(new Map());
  const [hqUsersList, setHqUsersList] = useState([]);
  const [loadingHqUsers, setLoadingHqUsers] = useState(false);

  // Parent assign modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedForAssign, setSelectedForAssign] = useState(null);
  const [selectedNodalId, setSelectedNodalId] = useState("");
  const [assignAll, setAssignAll] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Profile menu: user + UI state
  const [user, setUser] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  // derive superadmin flag (fixes the UI crash if isSuperadmin wasn't defined)
  const isSuperadmin =
    (user?.mappedRole || user?.rawRole || user?.role || "")
      .toString()
      .toUpperCase() === "SUPERADMIN";

  // NEW: public lookup state (areas & employment types)
  const [areasOpts, setAreasOpts] = useState([]); // [{ id, label }]
  const [employmentOpts, setEmploymentOpts] = useState([]); // [{ id, label }]
  const [employmentMap, setEmploymentMap] = useState(new Map()); // id -> label
  const [areasMapLocal, setAreasMapLocal] = useState(new Map()); // id -> label
  const [loadingLookups, setLoadingLookups] = useState(false);

  // Derived dropdowns removed from aggregatedResponses; we now rely on fetched public APIs.
  // function employmentLabelFromId will consult employmentMap (fetched)
  function employmentLabelFromId(id) {
    if (!id) return "Unknown";
    const v = employmentMap.get(String(id));
    if (v) return v;
    const m = { "1": "Departmental (ECL Employee)", "2": "Contractual (ECL Employee)", "3": "Non-ECL Employee (Outsider)" };
    return m[String(id)] || `Type ${id}`;
  }

  function getAuthToken() {
    return localStorage.getItem("ecl_token") || localStorage.getItem("auth_token") || null;
  }

  // Read user details from localStorage (ecl_user)
  function loadUserFromStorage() {
    try {
      const raw = localStorage.getItem("ecl_user");
      if (!raw) {
        setUser(null);
        return;
      }
      const parsed = JSON.parse(raw);
      setUser(parsed);
    } catch (e) {
      console.warn("Failed to parse user from storage", e);
      setUser(null);
    }
  }

  useEffect(() => {
    loadUserFromStorage();
    const onStorage = () => loadUserFromStorage();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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

  // helper: fetch nodals (all or for area)
  async function fetchNodalsForArea(areaId = null) {
    const token = getAuthToken();
    const url = areaId ? `${NODAL_OFFICERS_API}&areaid=${encodeURIComponent(areaId)}` : NODAL_OFFICERS_API;
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(url, { method: "GET", headers });
      if (!res.ok) {
        console.warn("Failed to fetch AREA_NODAL users", res.status);
        return [];
      }
      const json = await res.json().catch(() => []);
      const list = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : []);
      return list;
    } catch (e) {
      console.warn("fetchNodalsForArea error", e);
      return [];
    }
  }

  // Fetch HQ users (full) to map id -> name
  async function fetchHqUsers() {
    setLoadingHqUsers(true);
    try {
      const token = getAuthToken();
      const headers = {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch(HQ_USERS_API, { method: "GET", headers });
      if (!res.ok) {
        console.warn("Failed to fetch HQ users:", res.status);
        return;
      }
      const json = await res.json().catch(() => null);
      const list = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
      const map = new Map();
      (Array.isArray(list) ? list : []).forEach(u => {
        if (u && (u.id !== undefined)) map.set(String(u.id), u.name || u.email || `User ${u.id}`);
      });
      setHqUsersMap(map);
      setHqUsersList(Array.isArray(list) ? list : []);

      // normalize any already-loaded responses using the new map
      setResponses(prev => (Array.isArray(prev) ? prev.map(r => normalizeAssignedOnResponse(r, map)) : prev));
      setAggregatedResponses(prev => (Array.isArray(prev) ? prev.map(r => normalizeAssignedOnResponse(r, map)) : prev));
    } catch (e) {
      console.warn("fetchHqUsers error", e);
    } finally {
      setLoadingHqUsers(false);
    }
  }

  // Fetch single page (default uses base API or provided url)
  async function fetchPage(url = HQ_COMPLAINTS_API) {
    setLoading(true);
    setError(null);
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      const msg = "Not authenticated — please login to view HQ complaints.";
      setError(msg);
      toast.error(msg);
      return;
    }

    try {
      const headers = {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Authorization: `Bearer ${token}`,
      };
      const res = await fetch(url, { method: "GET", headers });
      if (!res.ok) {
        if (res.status === 401) throw new Error("Unauthorized (401). Please login again.");
        if (res.status === 403) throw new Error("Forbidden (403). You don't have permission.");
        const txt = await res.text().catch(() => "");
        throw new Error(`Server returned ${res.status}${txt ? `: ${txt}` : ""}`);
      }
      const json = await res.json();
      const items = Array.isArray(json.data) ? json.data : [];
      // map server objects
      const mapped = items.map(mapComplaintToResponse);

      // apply HQ users map to assignedTo (so ids show names) via normalize function
      const applied = mapped.map(r => normalizeAssignedOnResponse(r, hqUsersMap));

      setResponses(applied);
      setCurrentPage(json?.current_page ?? 1);
      setLastPage(json?.last_page ?? 1);
      setTotal(json?.total ?? applied.length);
      setNextPageUrl(json?.next_page_url ?? null);
      setPrevPageUrl(json?.prev_page_url ?? null);

      // fetch aggregated dataset for charts
      await fetchAllForCharts(json, headers);
    } catch (err) {
      console.error("Failed to fetch HQ complaints:", err);
      setError(err?.message || "Failed to fetch complaints");
      toast.error("Failed to load complaints. Check console for details.");
    } finally {
      setLoading(false);
    }
  }

  // Fetch all pages to build aggregatedResponses for charts
  async function fetchAllForCharts(firstPageJson, headers) {
    if (!firstPageJson) return;
    const firstItems = Array.isArray(firstPageJson.data) ? firstPageJson.data : [];
    const mappedFirst = firstItems.map(mapComplaintToResponse);
    const lastPageNum = firstPageJson?.last_page ?? 1;

    if (lastPageNum <= 1) {
      // apply HQ users map to assignedTo
      setAggregatedResponses(mappedFirst.map(r => normalizeAssignedOnResponse(r, hqUsersMap)));
      return;
    }

    setAggLoading(true);
    try {
      const tokenHeader = headers || {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Authorization: `Bearer ${getAuthToken()}`,
      };

      const others = [];
      for (let p = 2; p <= lastPageNum; p++) {
        try {
          const r = await fetch(`${HQ_COMPLAINTS_API}?page=${p}`, { method: "GET", headers: tokenHeader });
          if (!r.ok) {
            const t = await r.text().catch(() => "");
            console.warn(`Page ${p} fetch failed: ${r.status} — ${t}`);
            continue;
          }
          const j = await r.json();
          if (Array.isArray(j.data)) others.push(...j.data);
        } catch (e) {
          console.warn("page fetch error", e);
        }
      }
      const mappedOthers = others.map(mapComplaintToResponse);
      // apply HQ users map to assignedTo on the combined set
      const combined = [...mappedFirst, ...mappedOthers].map(r => normalizeAssignedOnResponse(r, hqUsersMap));
      setAggregatedResponses(combined);
    } catch (err) {
      console.error("Failed aggregated fetch:", err);
      toast.error("Could not fetch full dataset for charts — charts may be incomplete.");
      setAggregatedResponses(mappedFirst.map(r => normalizeAssignedOnResponse(r, hqUsersMap)));
    } finally {
      setAggLoading(false);
    }
  }

  useEffect(() => {
    fetchPage();
    // fetch all nodals once into cache
    (async () => {
      setLoadingNodals(true);
      try {
        const list = await fetchNodalsForArea(null);
        setAllNodals(Array.isArray(list) ? list : []);
        const map = new Map();
        (Array.isArray(list) ? list : []).forEach((u) => {
          const area = String(u.area_id ?? "unknown");
          const cur = map.get(area) || [];
          cur.push(u);
          map.set(area, cur);
        });
        setNodalMap(map);
      } finally {
        setLoadingNodals(false);
      }
    })();

    // fetch public lookups (areas + employment types)
    (async () => {
      setLoadingLookups(true);
      try {
        // fetch areas
        try {
          const ares = await fetch(PUBLIC_AREAS, { method: "GET", headers: { Accept: "application/json" } });
          if (ares.ok) {
            const ad = await ares.json().catch(() => []);
            if (Array.isArray(ad)) {
              const opts = ad.map((it) => ({ id: String(it.id), label: it.name || it.label || `Area ${it.id}` }));
              setAreasOpts(opts);
              const amap = new Map();
              opts.forEach(o => amap.set(String(o.id), o.label));
              setAreasMapLocal(amap);
            }
          } else {
            console.warn("Failed to fetch PUBLIC_AREAS:", ares.status);
          }
        } catch (e) {
          console.warn("PUBLIC_AREAS fetch error", e);
        }

        // fetch employment types
        try {
          const ers = await fetch(PUBLIC_EMPLOY, { method: "GET", headers: { Accept: "application/json" } });
          if (ers.ok) {
            const ed = await ers.json().catch(() => []);
            if (Array.isArray(ed)) {
              const opts = ed.map((it) => ({ id: String(it.id), label: it.label || it.name || `Type ${it.id}` }));
              setEmploymentOpts(opts);
              const emap = new Map();
              opts.forEach(o => emap.set(String(o.id), o.label));
              setEmploymentMap(emap);
            }
          } else {
            console.warn("Failed to fetch PUBLIC_EMPLOY:", ers.status);
          }
        } catch (e) {
          console.warn("PUBLIC_EMPLOY fetch error", e);
        }
      } finally {
        setLoadingLookups(false);
      }
    })();

    // fetch HQ users to map ids -> names
    fetchHqUsers();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchNodalOfficers() {
    // NOTE: We now use fetchNodalsForArea and cache results; this function kept for compatibility if called elsewhere.
    setLoadingNodals(true);
    try {
      const list = await fetchNodalsForArea(null);
      const map = new Map();
      (Array.isArray(list) ? list : []).forEach((u) => {
        const area = String(u.area_id ?? "unknown");
        const cur = map.get(area) || [];
        cur.push(u);
        map.set(area, cur);
      });
      setNodalMap(map);
      setAllNodals(Array.isArray(list) ? list : []);
    } catch (err) {
      console.warn("Nodal fetch error:", err);
      setNodalMap(new Map());
    } finally {
      setLoadingNodals(false);
    }
  }

  function handleNext() { if (nextPageUrl) fetchPage(nextPageUrl); }
  function handlePrev() { if (prevPageUrl) fetchPage(prevPageUrl); }

  // Filtering util used by both page and aggregated filtering
  function matchesFilters(r, exactIdOnly = false) {
    if (filterComplaintId) {
      if (String(r.id) !== String(filterComplaintId) && String(r.trackingNumber).toLowerCase() !== String(filterComplaintId).toLowerCase()) return false;
      if (exactIdOnly) return true;
    }
    if (filterText) {
      const q = filterText.toLowerCase();
      const hay = `${r.description || ""} ${r.trackingNumber || ""} ${r.submittedBy || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filterArea) {
      if (!r.raw || String(r.raw.area_id) !== String(filterArea)) return false;
    }
    if (filterEmploymentType) {
      if (!r.raw || String(r.raw.employment_type_id) !== String(filterEmploymentType)) return false;
    }
    if (filterFromDate || filterToDate) {
      const dIso = r.incidentDate || r.createdAt;
      if (!dIso) return false;
      const t = new Date(dIso).setHours(0,0,0,0);
      if (filterFromDate) {
        const fromT = new Date(filterFromDate).setHours(0,0,0,0);
        if (t < fromT) return false;
      }
      if (filterToDate) {
        const toT = new Date(filterToDate).setHours(23,59,59,999);
        if (t > toT) return false;
      }
    }
    if (filterFY) {
      if (r.financialYear !== filterFY) return false;
    }

    // NEW: status filter handling
    if (filterStatus && filterStatus !== "" && filterStatus !== "All") {
      const fs = filterStatus;
      if (fs === "Open") {
        if (r.isClosed) return false;
      } else if (fs === "Closed") {
        if (!r.isClosed) return false;
      } else if (fs === "Assigned") {
        if (!r.isAssigned) return false;
      } else if (fs === "Unassigned") {
        if (r.isAssigned) return false;
      }
    }

    return true;
  }

  // Page-level filtered responses (passed to ResponsesTable)
  const filteredPageResponses = useMemo(() => {
    if (!responses || responses.length === 0) return [];
    if (filterComplaintId && !filterText && !filterArea && !filterEmploymentType && !filterFromDate && !filterToDate && !filterFY && !filterStatus) {
      return responses.filter((r) => matchesFilters(r, true));
    }
    return responses.filter((r) => matchesFilters(r));
  }, [responses, filterComplaintId, filterText, filterArea, filterEmploymentType, filterFromDate, filterToDate, filterFY, filterStatus]);

  // AggregatedFiltered used for charts & totals (always from aggregatedResponses)
  const aggregatedFiltered = useMemo(() => {
    if (!aggregatedResponses || aggregatedResponses.length === 0) return [];
    return aggregatedResponses.filter((r) => matchesFilters(r));
  }, [aggregatedResponses, filterComplaintId, filterText, filterArea, filterEmploymentType, filterFromDate, filterToDate, filterFY, filterStatus]);

  const chartDataByDate = useMemo(() => {
    const m = new Map();
    aggregatedFiltered.forEach((r) => {
      const iso = r.incidentDate || r.createdAt || null;
      if (!iso) return;
      const d = new Date(iso);
      const key = `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`;
      const bucket = m.get(key) || { label: key, responses: 0, actions: 0 };
      bucket.responses += 1;
      if (r.actionTaken) bucket.actions += 1;
      m.set(key, bucket);
    });
    const arr = Array.from(m.values()).sort((a,b) => {
      const [ad,am,ay] = a.label.split("-").map(Number);
      const [bd,bm,by] = b.label.split("-").map(Number);
      return new Date(ay,am-1,ad) - new Date(by,bm-1,bd);
    });
    return arr;
  }, [aggregatedFiltered]);

  const totalActioned = useMemo(() => aggregatedFiltered.filter((r) => r.actionTaken).length, [aggregatedFiltered]);
  const totalPending = useMemo(() => aggregatedFiltered.length - totalActioned, [aggregatedFiltered, totalActioned]);
  const totalClosed = useMemo(() => aggregatedFiltered.filter((r) => r.isClosed).length, [aggregatedFiltered]);
  const totalOpen = useMemo(() => aggregatedFiltered.length - totalClosed, [aggregatedFiltered, totalClosed]);

  function resetFilters() {
    setFilterComplaintId("");
    setFilterText("");
    setFilterArea("");
    setFilterEmploymentType("");
    setFilterFromDate("");
    setFilterToDate("");
    setFilterFY("");
    setFilterStatus("");
  }

  // Parent assign flow (ResponsesTable delegates to parent via onAssign)
  async function openAssignModal(response) {
    setSelectedForAssign(response);
    const areaId = String(response?.raw?.area_id ?? "unknown");

    // ensure nodals for this area are loaded in cache
    let list = nodalMap.get(areaId) || [];
    if ((!list || list.length === 0) && !loadingNodals) {
      setLoadingNodals(true);
      try {
        const fetched = await fetchNodalsForArea(areaId);
        list = Array.isArray(fetched) ? fetched : [];
        setNodalMap(prev => {
          const m = new Map(prev);
          m.set(areaId, list);
          return m;
        });
      } finally {
        setLoadingNodals(false);
      }
    }

    setSelectedNodalId(list.length ? String(list[0].id) : "");
    setAssignAll(false);
    setAssignModalOpen(true);
  }

  function closeAssignModal() {
    setAssignModalOpen(false);
    setSelectedForAssign(null);
    setSelectedNodalId("");
    setAssignAll(false);
  }

  // *** IMPORTANT: after successful assign we re-fetch page+aggregated dataset to stay authoritative
  async function submitAssign() {
    if (!selectedForAssign) return;
    if (!assignAll && !selectedNodalId) {
      toast.error("Select a nodal officer to assign or choose Assign to all.");
      return;
    }
    setAssigning(true);
    try {
      const token = getAuthToken();
      if (!token) {
        toast.error("Not authenticated — please login.");
        setAssigning(false);
        return;
      }

      const payload = assignAll ? { assign_all: true } : { assignedto: Number(selectedNodalId) };
      const url = `${HQ_COMPLAINTS_API}/${selectedForAssign.id}/assign`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        toast.error(`Assign failed: ${res.status} ${txt}`);
        setAssigning(false);
        return;
      }

      const json = await res.json().catch(() => null);

      // If server returned updated complaint object, use that; otherwise optimistic fallback used below
      let updatedResponse = null;
      if (json && (json.id || (json.data && json.data.id))) {
        const serverObj = json.id ? json : (json.data ? json.data : json);
        try { updatedResponse = mapComplaintToResponse(serverObj); } catch (e) { updatedResponse = null; }
      }

      let assignedToLabel = null;
      if (updatedResponse && updatedResponse.assignedTo) {
        // normalize using HQ users map
        updatedResponse = normalizeAssignedOnResponse(updatedResponse, hqUsersMap);
        assignedToLabel = updatedResponse.assignedTo;
      } else {
        if (!assignAll) {
          const areaId = String(selectedForAssign.raw?.area_id ?? "unknown");
          const list = nodalMap.get(areaId) || allNodals || [];
          const nodalUser = list.find(n => String(n.id) === String(selectedNodalId));
          const resolvedName = nodalUser ? (nodalUser.name || nodalUser.username || nodalUser.email || `User ${nodalUser.id}`) : null;
          assignedToLabel = resolvedName ? `${resolvedName} (id:${selectedNodalId})` : String(selectedNodalId);
        } else {
          assignedToLabel = `Area nodals (all)`;
        }
      }

      if (updatedResponse) {
        // updatedResponse already normalized above
        setResponses(prev => prev.map(r => r.id === updatedResponse.id ? updatedResponse : r));
        setAggregatedResponses(prev => prev.map(r => r.id === updatedResponse.id ? updatedResponse : r));
      } else {
        setResponses(prev => prev.map(r => r.id === selectedForAssign.id ? ({
          ...r,
          assignedTo: assignedToLabel,
          isAssigned: true,
          actionTaken: { text: `Assigned to ${assignedToLabel}`, assignedTo: assignedToLabel, assignedAt: new Date().toISOString() },
          raw: { ...(r.raw || {}), assignedto: assignedToLabel, assignedby: "HQ", assignedat: new Date().toISOString() },
        }) : r));
        setAggregatedResponses(prev => prev.map(r => r.id === selectedForAssign.id ? ({
          ...r,
          assignedTo: assignedToLabel,
          isAssigned: true,
          actionTaken: { text: `Assigned to ${assignedToLabel}`, assignedTo: assignedToLabel, assignedAt: new Date().toISOString() },
          raw: { ...(r.raw || {}), assignedto: assignedToLabel, assignedby: "HQ", assignedat: new Date().toISOString() },
        }) : r));
      }

      toast.success(`Assigned${assignAll ? " to area nodals (all)" : ` to ${assignedToLabel}`}.`);
      closeAssignModal();

      // re-fetch authoritative data for current page (and aggregated dataset)
      const pageUrl = `${HQ_COMPLAINTS_API}?page=${currentPage}`;
      try {
        await fetchPage(pageUrl);
      } catch (e) {
        console.warn("Fetch after assign failed:", e);
      }
    } catch (err) {
      console.error("Assign error:", err);
      toast.error("Assign failed — see console.");
    } finally {
      setAssigning(false);
    }
  }

  const simpleChartWidth = Math.max(320, Math.min(1200, chartDataByDate.length * 30 + 180));

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

  // --- New derived counts for Open/Closed/Assigned/Unassigned (from aggregatedFiltered) ---
  const assignedOpenCount = useMemo(() => aggregatedFiltered.filter(r => !r.isClosed && r.isAssigned).length, [aggregatedFiltered]);
  const unassignedOpenCount = useMemo(() => aggregatedFiltered.filter(r => !r.isClosed && !r.isAssigned).length, [aggregatedFiltered]);
  const closedCount = useMemo(() => aggregatedFiltered.filter(r => r.isClosed).length, [aggregatedFiltered]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">ECL HQ Safety Department (Superadmin)</h2>
          <div className="text-sm text-gray-500 mt-1">Page <strong>{currentPage}</strong> of <strong>{lastPage}</strong> • Total (server): <strong>{total}</strong></div>
        </div>

        {/* Right area: note + profile */}
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600 hidden sm:block">
            Table shows current page (filters apply to page). Charts & top stats reflect aggregated data (all pages).
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

      {/* Top stat cards (aggregated) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Responses (all)" value={aggregatedResponses.length} loading={aggLoading} />
        <StatCard title="Action Taken (all)" value={totalActioned} loading={aggLoading} />
        <StatCard title="Pending (all)" value={totalPending} loading={aggLoading} />
      </div>

      {/* Open/Closed stacked bar (NEW) */}
      <OpenClosedBar assignedOpen={assignedOpenCount} unassignedOpen={unassignedOpenCount} closed={closedCount} />

      {/* Left menu + main content */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-1">
          <div className="sticky top-20 bg-white border rounded-lg p-3 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Views</h4>

            <button
              onClick={() => setActiveView("responses")}
              className={`w-full text-left px-3 py-2 rounded text-sm mb-2 ${activeView === "responses" ? "bg-indigo-600 text-white" : "hover:bg-gray-50"}`}
            >
              Responses
            </button>

            <button
              onClick={() => setActiveView("actionReports")}
              className={`w-full text-left px-3 py-2 rounded text-sm mb-2 ${activeView === "actionReports" ? "bg-indigo-600 text-white" : "hover:bg-gray-50"}`}
            >
              Action Reports
            </button>

            <button
              onClick={() => setActiveView("createUser")}
              className={`w-full text-left px-3 py-2 rounded text-sm mb-2 ${activeView === "createUser" ? "bg-indigo-600 text-white" : "hover:bg-gray-50"}`}
            >
              Create User
            </button>

            {isSuperadmin && (
              <button
                onClick={() => setActiveView("manageUsers")}
                className={`w-full text-left px-3 py-2 rounded text-sm mb-2 ${activeView === "manageUsers" ? "bg-indigo-600 text-white" : "hover:bg-gray-50"}`}
              >
                Manage Users
              </button>
            )}

            {isSuperadmin && (
              <button
                onClick={() => setActiveView("mailGroups")}
                className={`w-full text-left px-3 py-2 rounded text-sm mb-2 ${activeView === "mailGroups" ? "bg-indigo-600 text-white" : "hover:bg-gray-50"}`}
              >
                Mail Groups
              </button>
            )}


            <div className="mt-4 text-xs text-gray-500">
              Tip: Charts above reflect all complaints (aggregated dataset).
            </div>
          </div>
        </div>

        <div className="md:col-span-3 space-y-4">
          {activeView === "responses" && (
            <>
              {/* Filters */}
              <div className="bg-white border rounded-lg p-4 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-end md:gap-4 gap-3">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600">Complaint ID or Token</label>
                      <input value={filterComplaintId} onChange={(e)=>setFilterComplaintId(e.target.value)} placeholder="ECL-0070 or 70" className="mt-1 w-full border rounded px-3 py-2 text-sm" />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-600">Search (text)</label>
                      <input value={filterText} onChange={(e)=>setFilterText(e.target.value)} placeholder="search in description / submitter" className="mt-1 w-full border rounded px-3 py-2 text-sm" />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-600">Area</label>
                      <select value={filterArea} onChange={(e)=>setFilterArea(e.target.value)} className="mt-1 w-full border rounded px-3 py-2 text-sm">
                        <option value="">All areas</option>
                        {areasOpts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-600">Employment Type</label>
                      <select value={filterEmploymentType} onChange={(e)=>setFilterEmploymentType(e.target.value)} className="mt-1 w-full border rounded px-3 py-2 text-sm">
                        <option value="">All types</option>
                        {employmentOpts.map(ei => <option key={ei.id} value={ei.id}>{ei.label}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-600">From date</label>
                      <input type="date" value={filterFromDate} onChange={(e)=>setFilterFromDate(e.target.value)} className="mt-1 w-full border rounded px-3 py-2 text-sm" />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-600">To date</label>
                      <input type="date" value={filterToDate} onChange={(e)=>setFilterToDate(e.target.value)} className="mt-1 w-full border rounded px-3 py-2 text-sm" />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-600">Financial Year</label>
                      <select value={filterFY} onChange={(e)=>setFilterFY(e.target.value)} className="mt-1 w-full border rounded px-3 py-2 text-sm">
                        <option value="">All FY</option>
                        {(() => {
                          const s = new Set();
                          aggregatedResponses.forEach((r) => { if (r.financialYear) s.add(r.financialYear); });
                          return Array.from(s).sort().map((fy) => <option key={fy} value={fy}>{fy}</option>);
                        })()}
                      </select>
                    </div>

                    {/* NEW: Status filter */}
                    <div>
                      <label className="text-xs font-medium text-gray-600">Status</label>
                      <select value={filterStatus} onChange={(e)=>setFilterStatus(e.target.value)} className="mt-1 w-full border rounded px-3 py-2 text-sm">
                        <option value="">All</option>
                        <option value="Open">Open</option>
                        <option value="Closed">Closed</option>
                        <option value="Assigned">Assigned</option>
                        <option value="Unassigned">Unassigned</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-3 md:mt-0">
                    <button onClick={() => { toast.success("Filters applied"); }} className="px-4 py-2 bg-indigo-600 text-white rounded">Apply</button>
                    <button onClick={() => resetFilters()} className="px-4 py-2 border rounded">Reset</button>
                  </div>
                </div>

                <div className="mt-2 text-xs text-gray-500">Tip: use Complaint ID to find a single complaint quickly. Other filters narrow results for table and charts.</div>
              </div>

              {/* Table with pagination; ResponsesTable delegates assign to this parent via onAssign */}
              <div className="bg-white border rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex gap-2 items-center">
                    <button onClick={handlePrev} disabled={!prevPageUrl || loading} className={`px-3 py-1 rounded border ${!prevPageUrl || loading ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"}`}>← Previous</button>
                    <button onClick={handleNext} disabled={!nextPageUrl || loading} className={`px-3 py-1 rounded border ${!nextPageUrl || loading ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"}`}>Next →</button>
                  </div>
                  <div className="text-xs text-gray-500">Showing page {currentPage} — use controls to navigate server pages</div>
                </div>

                <ResponsesTable
                  responses={filteredPageResponses}
                  onOpenActionModal={onOpenActionModal}
                  onAssign={(row) => openAssignModal(row)} // delegate assign to parent modal
                  role="safety"
                />

                <div className="flex items-center justify-between mt-3">
                  <div className="flex gap-2 items-center">
                    <button onClick={handlePrev} disabled={!prevPageUrl || loading} className={`px-3 py-1 rounded border ${!prevPageUrl || loading ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"}`}>← Previous</button>
                    <button onClick={handleNext} disabled={!nextPageUrl || loading} className={`px-3 py-1 rounded border ${!nextPageUrl || loading ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"}`}>Next →</button>
                  </div>
                  <div className="text-sm text-gray-600">{error ? <span className="text-red-600">Error: {error}</span> : <span>Showing {filteredPageResponses.length} complaints on this page (filtered)</span>}</div>
                </div>
              </div>
            </>
          )}

          {activeView === "actionReports" && (
            <div className="bg-white border rounded-lg p-4 shadow-sm">
              <ActionReports />
            </div>
          )}

          {/* NEW: Create User view (separate file) */}
          {activeView === "createUser" && (
            <div className="bg-white border rounded-lg p-4 shadow-sm">
              {/* pass areas so the form has area dropdown prepopulated */}
              <UserCreate areas={areasOpts} />
            </div>
          )}

          {/* NEW: Manage Users view (SUPERADMIN only) */}
          {activeView === "manageUsers" && isSuperadmin && (
            <div className="bg-white border rounded-lg p-4 shadow-sm">
              <UserList areas={areasOpts} />
            </div>
          )}

          {/* Mail Groups (SUPERADMIN) */}
          {activeView === "mailGroups" && isSuperadmin && (
            <div className="bg-white border rounded-lg p-4 shadow-sm">
              {/* Render your MailGroups component so its logic runs on click */}
              <MailGroups />
              {/* If you want MailGroups to receive areas, you can do:
                  <MailGroups areas={areasOpts} />
                but the current MailGroups implementation works without props. */}
            </div>
          )}
        </div>
      </div>

      

      {/* Parent Assign Modal (opened when ResponsesTable delegates via onAssign) */}
      {assignModalOpen && selectedForAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 z-40" onClick={closeAssignModal} />

          <div className="relative bg-white rounded-lg shadow-lg p-6 z-50 w-full max-w-lg">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-semibold">Assign complaint to nodal officer</h3>
              <button onClick={closeAssignModal} className="text-gray-500">Close</button>
            </div>

            <div className="text-sm text-gray-700 mb-3">
              <div><strong>ID:</strong> {selectedForAssign.id}</div>
              <div><strong>Title:</strong> {selectedForAssign.title}</div>
              <div><strong>Area:</strong> {selectedForAssign.raw?.unit_name ?? selectedForAssign.raw?.area_id ?? "—"}</div>
            </div>

            <div className="mb-3">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={assignAll} onChange={(e) => setAssignAll(Boolean(e.target.checked))} />
                <span className="text-sm">Assign to <strong>all</strong> area nodal officers</span>
              </label>
            </div>

            <div className="mb-4">
              <label className="text-sm font-medium block mb-1">Select nodal officer (if assigning to specific person)</label>
              <select value={selectedNodalId} onChange={(e) => setSelectedNodalId(e.target.value)} className="w-full border rounded px-3 py-2" disabled={assignAll}>
                <option value="">-- Select nodal officer --</option>
                {(() => {
                  const areaId = String(selectedForAssign.raw?.area_id ?? "unknown");
                  const list = nodalMap.get(areaId) || allNodals || [];
                  if (list.length === 0) {
                    return <option value="">No nodal officers found for this area</option>;
                  }
                  return list.map(u => <option key={u.id} value={String(u.id)}>{u.name || u.username || u.email}</option>);
                })()}
              </select>
              {loadingNodals && <div className="text-xs text-gray-500 mt-1">Loading nodal officers…</div>}
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={closeAssignModal} className="px-4 py-2 border rounded">Cancel</button>
              <button onClick={submitAssign} disabled={assigning || (!assignAll && !selectedNodalId)} className={`px-4 py-2 rounded bg-indigo-600 text-white ${assigning ? "opacity-70 cursor-not-allowed" : ""}`}>
                {assigning ? "Assigning…" : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
