// src/dashboards/OversightDashboard.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import toast from "react-hot-toast";

/**
 * OversightDashboard (live data) — updated:
 * - Area context panels shown on Area view.
 * - "View" button opens a complaint-detail modal which fetches full complaint details
 *   and displays nodal & HQ actions + attachments (ResponsesTable-style).
 * - Added profile button/menu and logout (reads ecl_user from localStorage).
 *
 * Changes in this file:
 * - Added `chartAreaFilter` state and UI select to choose an area for the Responses vs Actions chart.
 * - groupedData now respects the chartAreaFilter (show per-area breakdown or All areas).
 * - Area-wise Complaint Status replaced with a horizontal scrolling frame with left/right buttons.
 *
 * Ensure user is authenticated with token in localStorage (ecl_token or auth_token).
 */

/* ----------------- Config / endpoints ----------------- */
const HQ_COMPLAINTS_API = "/api/hq/complaints";
const AREAS_API = "/api/public/areas";

/* ----------------- Visual palette ----------------- */
const PALETTE = {
  bgCard: "#ffffff",
  surface: "#f8fafc",
  primary: "#2563EB", // deep blue
  accent: "#06B6D4", // teal
  warn: "#F97316", // orange
  muted: "#6B7280",
  text: "#0F172A",
  subtleBorder: "#E6EEF7",
  shadow: "0 6px 18px rgba(14, 30, 37, 0.06)",
};

/* ----------------- Helpers ----------------- */
function getAuthToken() {
  return localStorage.getItem("ecl_token") || localStorage.getItem("auth_token") || null;
}

function daysBetween(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function getFinancialYearFromIso(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  return d.getMonth() + 1 >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function statusFromNormalized(n) {
  if (n.isClosed) return "Completed";
  if (n.actionTaken) return "In Progress";
  return "Pending";
}

/* ----------------- Chart utilities ----------------- */
function groupKeyFromDate(d, groupBy) {
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  if (groupBy === "day") return date.toISOString().slice(0, 10);
  if (groupBy === "week") {
    const tmp = new Date(date.getTime());
    tmp.setHours(0, 0, 0, 0);
    tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
    const week1 = new Date(tmp.getFullYear(), 0, 4);
    const weekNo = 1 + Math.round(((tmp - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    return `${tmp.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }
  if (groupBy === "month") {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  }
  if (groupBy === "year") return `${date.getFullYear()}`;
  return date.toISOString().slice(0, 10);
}

function shortLabelFromKey(key = "", grp = "month") {
  try {
    if (!key) return "";
    if (grp === "day") {
      const d = new Date(key);
      return `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleString("en", { month: "short" })}`;
    }
    if (grp === "week") return key;
    if (grp === "month") {
      const [y, m] = key.split("-").map(Number);
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return `${months[(m - 1) % 12]} ${y}`;
    }
    if (grp === "year") return key;
    return key;
  } catch {
    return key;
  }
}

/* ----------------- Small chart components (SVG, compact) ----------------- */
function GroupedBarChart({ data = [], width = 760, height = 260, groupBy = "month" }) {
  const pad = { top: 20, right: 20, bottom: 64, left: 44 };
  const innerW = Math.max(300, width - pad.left - pad.right);
  const innerH = Math.max(120, height - pad.top - pad.bottom);
  const display = data.slice(-Math.max(6, Math.min(48, data.length))); // keep it compact
  const maxValue = Math.max(1, ...display.map(d => Math.max(d.responses || 0, d.actions || 0)));
  const groupW = innerW / Math.max(1, display.length);
  const barW = Math.max(8, groupW * 0.36);
  const ticks = Math.ceil(display.length / 8) || 1;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Responses vs actions">
      <g transform={`translate(${pad.left},${pad.top})`}>
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const y = innerH * (1 - t);
          const label = Math.round(maxValue * t);
          return (
            <g key={i}>
              <line x1={0} x2={innerW} y1={y} y2={y} stroke={PALETTE.subtleBorder} />
              <text x={-8} y={y + 4} fontSize="10" fill={PALETTE.muted} textAnchor="end">{label}</text>
            </g>
          );
        })}

        {display.map((d, idx) => {
          const x = idx * groupW;
          const respH = (d.responses / maxValue) * innerH;
          const actH = (d.actions / maxValue) * innerH;
          return (
            <g key={d.labelKey || idx} transform={`translate(${x},0)`}>
              <rect
                x={(groupW - barW) / 2}
                y={innerH - respH}
                width={barW}
                height={respH}
                rx="4"
                fill={PALETTE.primary}
                opacity="0.95"
              />
              <rect
                x={(groupW - barW) / 2 + barW * 0.12}
                y={innerH - actH}
                width={barW * 0.76}
                height={actH}
                rx="3"
                fill={PALETTE.accent}
                opacity="0.98"
              />

              {(idx % ticks === 0 || idx === display.length - 1) && (
                <text
                  x={groupW / 2}
                  y={innerH + 42}
                  fontSize="11"
                  fill={PALETTE.text}
                  textAnchor="middle"
                  transform={`rotate(-35 ${groupW / 2} ${innerH + 42})`}
                >
                  {shortLabelFromKey(d.labelKey, groupBy)}
                </text>
              )}
            </g>
          );
        })}

        <g transform={`translate(${Math.max(0, innerW - 180)}, -6)`}>
          <rect x={0} y={0} width={10} height={10} rx="2" fill={PALETTE.primary} />
          <text x={16} y={10} fontSize="12" fill={PALETTE.text}>Responses</text>
          <rect x={0} y={18} width={10} height={10} rx="2" fill={PALETTE.accent} />
          <text x={16} y={28} fontSize="12" fill={PALETTE.text}>Actions</text>
        </g>
      </g>
    </svg>
  );
}

/**
 * Rewritten Donut component (stroke-based) — stable and obvious coloring.
 *
 * - Uses circle strokes with stroke-dasharray for slices.
 * - Shows a neutral grey when total is zero.
 * - Respects provided `colors` order.
 */
function Donut({ valueMap = {}, size = 140, colors = [PALETTE.primary, PALETTE.accent, PALETTE.warn] }) {
  const entries = Object.keys(valueMap).map(k => ({ label: k, value: Number(valueMap[k] || 0) }));
  const total = entries.reduce((s, e) => s + Math.max(0, e.value), 0);

  // sizing
  const outerSize = size;
  const strokeWidth = Math.max(12, Math.round(size * 0.14)); // reasonable stroke
  const center = outerSize / 2;
  const radius = center - strokeWidth / 2 - 2; // small padding
  const circumference = 2 * Math.PI * radius;

  // Build dash segments
  let acc = 0;
  const segments = entries.map((e, idx) => {
    const val = Math.max(0, e.value);
    const portion = total === 0 ? 0 : val / total;
    const dash = portion * circumference;
    const offset = circumference * acc;
    acc += portion;
    return {
      ...e,
      portion,
      dash,
      offset,
      color: colors[idx % colors.length] ?? colors[0] ?? PALETTE.primary,
    };
  });

  return (
    <div className="flex items-center gap-3">
      <svg width={outerSize} height={outerSize} viewBox={`0 0 ${outerSize} ${outerSize}`} role="img" aria-label="Donut chart">
        <defs>
          <filter id="donut-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.08)" />
          </filter>
        </defs>

        {/* background circle for neutral base */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#F1F5F9"
          strokeWidth={strokeWidth}
        />

        {/* slices (rendered as stroked circles with dasharray / dashoffset) */}
        {total === 0 ? (
          // when total is zero, keep the neutral circle only
          null
        ) : (
          segments.map((s, idx) => {
            // for SVG stroke-dashoffset: positive offset moves start — we need to invert because circle starts at 3 o'clock and we rotate -90deg
            const dashArray = `${s.dash} ${Math.max(0, circumference - s.dash)}`;
            const dashOffset = circumference - s.offset; // shift so segment sits after accumulated
            return (
              <circle
                key={s.label + idx}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={strokeWidth}
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
                transform={`rotate(-90 ${center} ${center})`}
                style={{ filter: "none" }}
              />
            );
          })
        )}

        {/* inner white circle (hole) */}
        <circle cx={center} cy={center} r={Math.max(6, radius - strokeWidth / 2 - 2)} fill="#ffffff" stroke="none" />
        {/* count text */}
        <text x={center} y={center} textAnchor="middle" dy="4" fontSize={Math.max(10, Math.round(size * 0.12))} fill={PALETTE.text} fontWeight="600">
          {total}
        </text>
      </svg>

      <div className="text-sm">
        {entries.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2 mb-1">
            <span style={{ background: (colors[i % colors.length] ?? PALETTE.primary) }} className="w-3 h-3 rounded-sm inline-block" />
            <span className="text-xs text-gray-700">{s.label} — <span className="font-semibold">{s.value}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalTopBars({ items = [], maxItems = 6 }) {
  const data = items.slice(0, maxItems);
  const maxVal = Math.max(1, ...data.map(d => d.value || 0));
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <div className="w-36 text-xs text-gray-700 truncate">{d.label}</div>
          <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
            <div style={{ width: `${(d.value / maxVal) * 100}%` }} className="h-3 bg-blue-600 rounded" />
          </div>
          <div className="w-10 text-right text-sm font-semibold">{d.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ----------------- Normalization (list-level) ----------------- */
function normalizeComplaint(c, areaLookup = {}) {
  const iso = c.incident_date || c.created_at || null;
  const hasAction =
    Boolean(c.assignedby) ||
    Boolean(c.assignedto) ||
    Boolean(c.isclosed) ||
    (c.workflowstatus && String(c.workflowstatus).toUpperCase() !== "NEW");

  const unitName = (() => {
    if (c.unit_name) return c.unit_name;
    if (c.unit) return c.unit;
    if (c.area_id && areaLookup[String(c.area_id)]) return areaLookup[String(c.area_id)];
    return c.area_name || (c.area_id ? `Area ${c.area_id}` : "Unknown Area");
  })();

  return {
    id: c.id,
    title: c.title || c.description || `Complaint ${c.id}`,
    incidentIso: iso,
    createdAt: c.created_at || null,
    isClosed: Boolean(c.isclosed),
    actionTaken: hasAction,
    actionDetails: c.action || null,
    area_id: c.area_id ?? null,
    unit_name: unitName,
    employment_type_id: c.employment_type_id ?? null,
    financialYear: getFinancialYearFromIso(iso),
    ageDays: daysBetween(iso),
    raw: c,
  };
}

/* ----------------- Attachment & activity helpers (for detail modal) ----------------- */
const FILE_BASE = "/storage/";

function normalizeAttachments(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return val.split(",").map(s => s.trim()).filter(Boolean);
  }
  if (typeof val === "object") {
    return Object.values(val).filter(Boolean);
  }
  return [];
}

function getAttachmentUrl(entry) {
  if (!entry) return null;
  if (typeof entry === "string") {
    if (entry.startsWith("http://") || entry.startsWith("https://")) return entry;
    const p = entry.replace(/^\/+/, "");
    return FILE_BASE + p;
  }
  if (typeof entry === "object") {
    const path = entry.path ?? entry.path_name ?? entry.file ?? entry.url ?? entry.original_name ?? entry.originalname ?? null;
    if (!path) return null;
    if (typeof path === "string") {
      if (path.startsWith("http://") || path.startsWith("https://")) return path;
      const p = path.replace(/^\/+/, "");
      return FILE_BASE + p;
    }
  }
  return null;
}

function getAttachmentLabel(entry, idx = 0) {
  if (!entry) return `Attachment ${idx + 1}`;
  if (typeof entry === "string") return entry.split("/").pop() || entry;
  if (typeof entry === "object") {
    return entry.original_name ?? entry.originalname ?? (entry.path ? (entry.path.split("/").pop() || entry.path) : `Attachment ${idx + 1}`);
  }
  return `Attachment ${idx + 1}`;
}

function getTopLevelAttachments(item) {
  if (!item) return [];
  const candidates = [
    item.attachments,
    item.files,
    item.raw?.attachments,
    item.raw?.files,
    item.raw?.docs,
    item.raw?.photos,
    item.raw?.attachments_map,
    item.raw?.files_map,
    item.attachment_path,
  ];
  for (const c of candidates) {
    const arr = normalizeAttachments(c);
    if (arr && arr.length) return arr;
  }
  if (item.raw && typeof item.raw === "object") {
    const keys = Object.keys(item.raw || {});
    for (const k of keys) {
      if (/attach|file|photo|doc|path/i.test(k)) {
        const arr = normalizeAttachments(item.raw[k]);
        if (arr && arr.length) return arr;
      }
    }
  }
  return [];
}

// Activity normalization (small subset of ResponsesTable behaviour)
function parseTimeToMs(t) {
  if (!t) return 0;
  const d = new Date(t);
  const ms = Number(d && d.getTime && d.getTime());
  return Number.isFinite(ms) ? ms : 0;
}

function normalizeActivity(act = {}) {
  const attachmentsRaw = act.attachments ?? act.files ?? act.activity_attachments ?? act.activityFiles ?? act.attachments_map ?? [];
  const attachments = Array.isArray(attachmentsRaw) ? attachmentsRaw : normalizeAttachments(attachmentsRaw);
  const created = act.createdat ?? act.created_at ?? act.createdAt ?? act.created ?? act.timestamp ?? act.time ?? null;
  return {
    id: act.id ?? act.activity_id ?? act.activityId ?? null,
    actorid: act.actorid ?? act.actorId ?? act.performed_by ?? act.actor_id ?? act.nodal_id ?? null,
    actortype: act.actortype ?? act.actor_type ?? act.actor ?? (act.actorid ? (String(act.actorid).startsWith("HQ") ? "HQ" : "AREA") : null),
    activitytype: act.activitytype ?? act.activity_type ?? act.type ?? act.type_name ?? null,
    description: act.description ?? act.desc ?? act.note ?? act.remarks ?? act.text ?? act.description_text ?? "",
    createdat: created,
    createdTs: parseTimeToMs(created),
    attachments: attachments,
    raw: act,
  };
}

function normalizeAndSortActivities(arr) {
  if (!Array.isArray(arr)) return [];
  const normalized = arr.map(a => normalizeActivity(a));
  normalized.sort((a, b) => (b.createdTs || 0) - (a.createdTs || 0));
  return normalized;
}

// Extract nodal/area actions by heuristics (tries multiple server shapes)
function extractNodalActions(raw) {
  if (!raw) return [];
  const direct = raw?.nodal_actions ?? raw?.nodalActions ?? raw?.nodal_notes ?? raw?.nodalNotes;
  if (Array.isArray(direct) && direct.length) return normalizeAndSortActivities(direct);

  const acts = raw?.activities ?? raw?.activity ?? raw?.actions ?? raw?.history ?? raw?.activities_map ?? raw?.activity_history ?? [];
  if (Array.isArray(acts) && acts.length) {
    const nodal = acts.filter(a => {
      const t = (a.actortype ?? a.actor_type ?? a.actorType ?? "").toString().toUpperCase();
      if (t === "AREA") return true;
      const activityType = String(a.activitytype ?? a.activity_type ?? a.type ?? "").toUpperCase();
      if (activityType.includes("AREA") || activityType.includes("RESOLUTION") || activityType.includes("AREA_SUBMIT")) return true;
      if (a.actorid && raw?.assignedto && String(a.actorid) === String(raw.assignedto)) return true;
      return false;
    });
    if (nodal.length) return normalizeAndSortActivities(nodal);
  }

  // fallback: action_taken or single action on raw
  if (raw?.action_taken) {
    const a = raw.action_taken;
    const synthetic = {
      id: a.id ?? `local-${Date.now()}`,
      actorid: a.nodal_id ?? a.actorid ?? null,
      actortype: "AREA",
      activitytype: a.activitytype ?? a.type ?? "AREA_SUBMIT_RESOLUTION",
      description: a.text ?? a.remarks ?? a.description ?? "",
      createdat: a.created_at ?? new Date().toISOString(),
      createdTs: parseTimeToMs(a.created_at) || Date.now(),
      attachments: a.attachments ?? a.files ?? [],
      raw: a,
    };
    return [normalizeActivity(synthetic)];
  }

  return [];
}

function renderActionEntry(a, idx) {
  const actorNameCandidates = [
    a.raw?.nodal_name,
    a.raw?.hq_name,
    a.raw?.name,
    a.raw?.username,
    a.raw?.performed_by,
    a.raw?.user,
    a.raw?.author,
    a.raw?.from,
  ];
  let actor = actorNameCandidates.find(Boolean) ?? null;
  if (!actor && a.actorid) actor = `User ${a.actorid}`;
  if (!actor) actor = a.actortype ?? "Officer";

  const created = a.createdat ?? a.createdAt ?? a.created ?? null;
  const when = created ? (new Date(created).toLocaleString ? new Date(created).toLocaleString() : String(created)) : null;
  const remarks = a.description ?? a.raw?.remarks ?? a.raw?.note ?? a.raw?.text ?? "";

  const attCandidates = Array.isArray(a.attachments) ? a.attachments : normalizeAttachments(a.attachments ?? a.raw?.attachments ?? a.raw?.files ?? []);

  return (
    <div key={idx} className="p-3 border rounded bg-gray-50">
      <div className="flex justify-between items-start gap-3">
        <div>
          <div className="text-sm font-medium">{actor}</div>
          {when ? <div className="text-xs text-gray-500">{when}</div> : null}
        </div>
        <div className="text-xs text-gray-500">{(a.activitytype || a.raw?.activitytype || a.raw?.activity_type || "").toString()}</div>
      </div>

      <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{remarks || <span className="text-gray-400">No remarks</span>}</div>

      {attCandidates.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="text-xs text-gray-500">Attachments</div>
          {attCandidates.map((p, i) => {
            const url = getAttachmentUrl(p);
            const label = getAttachmentLabel(p, i);
            return (
              <div key={i} className="flex items-center gap-2">
                <a
                  className="text-sm underline text-blue-600 truncate"
                  href={url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(ev) => { if (!url) ev.preventDefault(); }}
                >
                  {label}
                </a>
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 border rounded">Open</a>
                ) : (
                  <span className="text-xs text-gray-400 px-2 py-1 border rounded">No file</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ----------------- Utility: activity comparison to avoid duplicates ----------------- */
function activityKey(a) {
  if (!a) return "";
  if (a.id) return `id:${String(a.id)}`;
  const ts = a.createdTs ?? (a.createdat ? parseTimeToMs(a.createdat) : 0);
  const desc = String(a.description ?? a.raw?.remarks ?? a.raw?.note ?? a.raw?.text ?? "").trim().slice(0, 200);
  return `ts:${ts}|desc:${desc}`;
}

/**
 * Returns true if arrays are equivalent (same items by id or same ts+desc),
 * or if arrB is fully contained inside arrA (so arrB is subset of arrA).
 */
function activitiesAreDuplicateOrSubset(arrA = [], arrB = []) {
  if (!Array.isArray(arrA) || !Array.isArray(arrB)) return false;
  // build sets of keys
  const setA = new Set(arrA.map(activityKey));
  const setB = new Set(arrB.map(activityKey));
  if (setA.size === 0 && setB.size === 0) return true; // both empty -> treat as duplicate
  // If sizes equal and every key matches, they are equivalent
  if (setA.size === setB.size) {
    for (const k of setA) if (!setB.has(k)) return false;
    return true;
  }
  // If B is subset of A (all B keys exist in A), treat as duplicate (no need to show other activities)
  for (const k of setB) {
    if (!setA.has(k)) return false;
  }
  return true;
}

/* ----------------- Main component ----------------- */
export default function OversightDashboard() {
  // area master
  const [areas, setAreas] = useState([]);
  const [areasLoading, setAreasLoading] = useState(false);
  const [areasError, setAreasError] = useState(null);

  // complaints (normalized)
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [aggLoading, setAggLoading] = useState(false);
  const [error, setError] = useState(null);

  // nav + filters
  const [selectedArea, setSelectedArea] = useState(null);
  const [selectedComplaint, setSelectedComplaint] = useState(null); // complaint detail (rich)
  const [detailLoading, setDetailLoading] = useState(false);
  const [groupBy, setGroupBy] = useState("month");
  const [fyFilter, setFyFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [pendingMoreThan, setPendingMoreThan] = useState(0);

  // chart-specific area filter (new) — separate from selectedArea (drill)
  const [chartAreaFilter, setChartAreaFilter] = useState("All");

  // area-view specific: search & sort
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("date_desc"); // date_desc, date_asc, age_desc

  // Profile: read from localStorage ecl_user
  const [user, setUser] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  // Scroller refs + state (for horizontal area cards)
  const areaScrollerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Load user info from localStorage
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

  // Derived values & filters (same as before)
  const fyOptions = useMemo(() => {
    const s = new Set();
    items.forEach(i => { if (i.financialYear) s.add(i.financialYear); });
    return Array.from(s).sort();
  }, [items]);

  // Build a robust list of area names for the chart filter:
  const areaOptions = useMemo(() => {
    const set = new Set();
    // from server areas
    (areas || []).forEach(a => { if (a && a.name) set.add(a.name); });
    // also include any unit_name found in complaints (in case area master is incomplete)
    (items || []).forEach(i => { if (i && i.unit_name) set.add(i.unit_name); });
    const arr = Array.from(set).sort();
    return ["All", ...arr];
  }, [areas, items]);

  // normalizedForView respects selectedArea and global filters
  const normalizedForView = useMemo(() => {
    return items.filter(i => {
      if (selectedArea && i.unit_name !== selectedArea) return false;
      if (fyFilter && fyFilter !== "All" && i.financialYear !== fyFilter) return false;
      if (statusFilter && statusFilter !== "All" && statusFromNormalized(i) !== statusFilter) return false;
      if (pendingMoreThan > 0) {
        if (i.actionTaken) return false;
        const iso = i.incidentIso || i.createdAt;
        if (!iso) return false;
        const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000*60*60*24));
        if (days <= pendingMoreThan) return false;
      }
      return true;
    });
  }, [items, selectedArea, fyFilter, statusFilter, pendingMoreThan]);

  // groupedData now respects chartAreaFilter as well (new)
  const groupedData = useMemo(() => {
    const map = new Map();
    normalizedForView.forEach(r => {
      // filter by chart area if set
      if (chartAreaFilter && chartAreaFilter !== "All" && r.unit_name !== chartAreaFilter) return;
      const iso = r.incidentIso || r.createdAt;
      if (!iso) return;
      const key = groupKeyFromDate(iso, groupBy);
      const entry = map.get(key) || { labelKey: key, responses: 0, actions: 0 };
      entry.responses += 1;
      if (r.actionTaken) entry.actions += 1;
      map.set(key, entry);
    });
    return Array.from(map.values()).sort((a,b) => {
      try {
        if (groupBy === "day") return new Date(a.labelKey) - new Date(b.labelKey);
        if (groupBy === "month") {
          const [ay, am] = a.labelKey.split("-").map(Number);
          const [by, bm] = b.labelKey.split("-").map(Number);
          return new Date(ay, am-1) - new Date(by, bm-1);
        }
        if (groupBy === "year") return Number(a.labelKey) - Number(b.labelKey);
        if (groupBy === "week") {
          const [ay, aw] = a.labelKey.split("-W").map(Number);
          const [by, bw] = b.labelKey.split("-W").map(Number);
          if (ay !== by) return ay - by;
          return aw - bw;
        }
        return 0;
      } catch { return 0; }
    });
  }, [normalizedForView, groupBy, chartAreaFilter]);

  const topAreas = useMemo(() => {
    const map = new Map();
    normalizedForView.forEach(r => {
      const label = r.unit_name || `Area ${r.area_id || "(unknown)"}`;
      const cur = map.get(label) || { label, value: 0 };
      cur.value += 1;
      map.set(label, cur);
    });
    return Array.from(map.values()).sort((a,b) => b.value - a.value).slice(0, 8);
  }, [normalizedForView]);

  const totalAll = normalizedForView.length;
  const totalActioned = normalizedForView.filter(d => d.actionTaken).length;
  const totalPending = totalAll - totalActioned;
  const totalClosed = normalizedForView.filter(d => d.isClosed).length;

  const ageing = useMemo(() => {
    const ages = normalizedForView.map(i => i.ageDays).filter(v => typeof v === "number");
    const pendingAges = normalizedForView.filter(i => !i.actionTaken).map(i => i.ageDays).filter(v => typeof v === "number");
    return {
      avgAge: ages.length ? Math.round(ages.reduce((a,b)=>a+b,0)/ages.length) : 0,
      avgPendingAge: pendingAges.length ? Math.round(pendingAges.reduce((a,b)=>a+b,0)/pendingAges.length) : 0,
      maxPendingAge: pendingAges.length ? Math.max(...pendingAges) : 0,
    };
  }, [normalizedForView]);

  const pendingBuckets = useMemo(() => {
    const buckets = { "0–7": 0, "8–30": 0, "31–90": 0, "90+": 0 };
    normalizedForView.filter(i => !i.actionTaken).forEach(i => {
      const d = i.ageDays ?? 0;
      if (d <= 7) buckets["0–7"]++;
      else if (d <= 30) buckets["8–30"]++;
      else if (d <= 90) buckets["31–90"]++;
      else buckets["90+"]++;
    });
    return buckets;
  }, [normalizedForView]);

  const areaMetrics = useMemo(() => {
    const map = new Map();
    normalizedForView.forEach(i => {
      const idKey = i.area_id ?? i.unit_name ?? "(unknown)";
      const label = i.unit_name || `Area ${i.area_id ?? "(unknown)"}`;
      const cur = map.get(idKey) || { id: idKey, label, total: 0, actioned: 0, closed: 0, pending: 0, pendingAgeSum: 0 };
      cur.total++;
      if (i.actionTaken) cur.actioned++;
      if (i.isClosed) cur.closed++;
      if (!i.actionTaken) {
        cur.pending++;
        cur.pendingAgeSum += (i.ageDays || 0);
      }
      map.set(idKey, cur);
    });

    return Array.from(map.values()).map(a => ({
      ...a,
      avgPendingAge: a.pending ? Math.round(a.pendingAgeSum / a.pending) : 0,
    })).sort((x,y) => y.pending - x.pending || y.total - x.total).slice(0, 50);
  }, [normalizedForView]);

  const oldestPending = useMemo(() => {
    return normalizedForView
      .filter(i => !i.actionTaken && typeof i.ageDays === "number")
      .sort((a,b) => (b.ageDays || 0) - (a.ageDays || 0))
      .slice(0, 10);
  }, [normalizedForView]);

  /* ---------- fetch areas ---------- */
  useEffect(() => {
    async function fetchAreas() {
      setAreasLoading(true);
      setAreasError(null);
      try {
        const res = await fetch(AREAS_API);
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(`${res.status} ${t}`);
        }
        const j = await res.json();
        setAreas(Array.isArray(j) ? j : []);
      } catch (err) {
        console.error("Failed to fetch areas:", err);
        setAreasError(err?.message || "Failed to fetch areas");
        toast.error("Failed to fetch areas — labels may be limited.");
      } finally {
        setAreasLoading(false);
      }
    }
    fetchAreas();
  }, []);

  /* ---------- fetch & aggregate HQ complaints (server-friendly) ---------- */
  async function fetchAllComplaints() {
    setLoading(true);
    setError(null);
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      setError("Not authenticated — please login.");
      toast.error("Please login to view aggregated reports.");
      return;
    }

    try {
      const headers = {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Authorization: `Bearer ${token}`,
      };

      const res1 = await fetch(HQ_COMPLAINTS_API, { method: "GET", headers });
      if (!res1.ok) {
        const t = await res1.text().catch(() => "");
        throw new Error(`Server returned ${res1.status} ${t}`);
      }
      const j1 = await res1.json();
      const firstData = Array.isArray(j1.data) ? j1.data : [];
      const lastPage = j1?.last_page ?? 1;
      const allRaw = [...firstData];

      setAggLoading(true);
      for (let p = 2; p <= lastPage; p++) {
        try {
          const r = await fetch(`${HQ_COMPLAINTS_API}?page=${p}`, { method: "GET", headers });
          if (!r.ok) {
            console.warn("page", p, "fetch failed", r.status);
            continue;
          }
          const pageJson = await r.json();
          if (Array.isArray(pageJson.data)) allRaw.push(...pageJson.data);
        } catch (e) {
          console.warn("page fetch error", e);
        }
      }

      const areaLookup = {};
      areas.forEach(a => { if (a && a.id) areaLookup[String(a.id)] = a.name; });

      const mapped = allRaw.map(c => normalizeComplaint(c, areaLookup));
      setItems(mapped);
      toast.success(`Loaded ${mapped.length} complaints`);
    } catch (err) {
      console.error("Failed to aggregate:", err);
      setError(err?.message || "Failed to aggregate data");
      toast.error("Aggregation failed — charts may be incomplete.");
    } finally {
      setLoading(false);
      setAggLoading(false);
    }
  }

  // fetch complaints on mount and whenever areas change
  useEffect(() => {
    fetchAllComplaints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas.length]);

  /* ---------- Scroller helpers ---------- */
  // update scroller buttons (called on mount, resize, scroll, items change)
  useEffect(() => {
    function update() {
      const el = areaScrollerRef.current;
      if (!el) {
        setCanScrollLeft(false);
        setCanScrollRight(false);
        return;
      }
      setCanScrollLeft(el.scrollLeft > 10);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
    }
    update();
    const el = areaScrollerRef.current;
    if (el) {
      el.addEventListener("scroll", update, { passive: true });
    }
    const onResize = () => update();
    window.addEventListener("resize", onResize);
    return () => {
      if (el) el.removeEventListener("scroll", update);
      window.removeEventListener("resize", onResize);
    };
  }, [areaMetrics.length, areaScrollerRef.current]);

  function scrollAreas(amount) {
    const el = areaScrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: amount, behavior: "smooth" });
  }

  function handleScrollLeft() {
    const el = areaScrollerRef.current;
    if (!el) return;
    // scroll by 80% of visible width
    const amt = -Math.floor(el.clientWidth * 0.8);
    scrollAreas(amt);
  }

  function handleScrollRight() {
    const el = areaScrollerRef.current;
    if (!el) return;
    const amt = Math.floor(el.clientWidth * 0.8);
    scrollAreas(amt);
  }

  /* ---------- UI actions ---------- */
  function clearFilters() {
    setFyFilter("All");
    setStatusFilter("All");
    setPendingMoreThan(0);
    setSelectedArea(null);
    setSearchQuery("");
    setSortBy("date_desc");
    toast.success("Cleared chart filters");
  }

  /* ----------------- DETAIL FETCH & VIEW (ResponsesTable-style) ----------------- */

  // Map server detail to a shape used by the detail modal
  function mapDetailFields(rawDetail) {
    const raw = rawDetail ?? {};
    const id = raw.id ?? rawDetail.id;
    const title = raw.title ?? rawDetail.title ?? `Complaint #${id}`;
    const trackingNumber = raw.public_token ?? raw.trackingNumber ?? raw.tracking_number ?? raw.publicToken ?? raw.public_token ?? null;
    const description = raw.description ?? rawDetail.description ?? rawDetail.raw?.description ?? rawDetail.action ?? null;
    const date = raw.created_at ?? raw.createdAt ?? raw.incident_date ?? raw.incidentDate ?? raw.date ?? null;
    const areaId = raw.area_id ?? raw.areaId ?? raw.unit_id ?? raw.raw?.area_id ?? null;
    const assignedTo = raw.assignedto ?? raw.assignedTo ?? raw.assigned_to ?? raw.assignedToName ?? raw.assigned_to_user ?? null;
    const assignedBy = raw.assignedby ?? raw.assignedBy ?? raw.assigned_by ?? null;
    const workflowstatus = raw.workflowstatus ?? raw.flowStatus ?? raw.status ?? null;

    const attachments = getTopLevelAttachments(rawDetail);

    // activities normalization
    const activitiesRaw = Array.isArray(raw.activities) ? raw.activities
      : Array.isArray(raw.activity) ? raw.activity
      : Array.isArray(raw.actions) ? raw.actions
      : Array.isArray(raw.action_history) ? raw.action_history
      : Array.isArray(raw.history) ? raw.history
      : [];

    const normalizedActivities = normalizeAndSortActivities(activitiesRaw);
    const nodalActions = normalizeAndSortActivities(extractNodalActions(raw) || []);

    const actionTaken =
      raw.action ?? raw.actionTaken ?? raw.action_taken ?? raw.action_taken_object ?? rawDetail?.action ?? null;

    return {
      ...rawDetail,
      id,
      title,
      trackingNumber,
      description,
      date,
      incidentIso: raw.incident_date ?? raw.incidentDate ?? null,
      createdAt: raw.created_at ?? raw.createdAt ?? null,
      raw: rawDetail,
      assignedTo,
      assignedBy,
      workflowstatus,
      attachments,
      activities: normalizedActivities,
      nodalActions,
      actionTaken,
      areaId,
      unit_name: raw.unit_name ?? raw.area_name ?? raw.unit ?? null,
      financialYear: getFinancialYearFromIso(raw.incident_date || raw.created_at || raw.createdAt || null),
    };
  }

  // Fetch full detail by id and open modal
  async function openComplaintDetail(item) {
    if (!item) return;
    setDetailLoading(true);
    setSelectedComplaint(null);
    try {
      const token = getAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}`, Accept: "application/json" } : { Accept: "application/json" };
      const res = await fetch(`${HQ_COMPLAINTS_API}/${item.id}`, { method: "GET", headers });
      if (!res.ok) {
        // fallback: use item
        const fallback = mapDetailFields(item);
        setSelectedComplaint(fallback);
        toast.error("Unable to fetch full detail — showing aggregated item.");
        setDetailLoading(false);
        return;
      }
      const json = await res.json().catch(() => null);
      if (!json) {
        setSelectedComplaint(mapDetailFields(item));
        toast.error("Failed to parse detail — showing aggregated item.");
        setDetailLoading(false);
        return;
      }
      // server may respond with { data: {...} } or the detail directly
      const detail = json.data ?? json;
      setSelectedComplaint(mapDetailFields(detail));
    } catch (err) {
      console.error("openComplaintDetail error:", err);
      setSelectedComplaint(mapDetailFields(item));
      toast.error("Failed to fetch complaint detail — showing aggregated item.");
    } finally {
      setDetailLoading(false);
    }
  }

  function closeComplaintDetail() {
    setSelectedComplaint(null);
  }

  /* ----------------- Profile helpers ----------------- */
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

  /* ===================== UI ===================== */

  // TOP LEVEL: overview
  if (!selectedArea && !selectedComplaint) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold">CMD & Functional Directors — Oversight Dashboard</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <button onClick={() => fetchAllComplaints()} className="px-3 py-2 border rounded text-sm">Refresh</button>
              <div className="text-sm text-gray-600">{aggLoading ? "Aggregating..." : `Raw complaints: ${items.length}`}</div>
            </div>

            {/* Profile menu (reads from ecl_user) */}
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

        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="p-3 bg-white rounded-lg border" style={{ borderColor: PALETTE.subtleBorder }}>
            <div className="text-xs text-gray-500">Registered (shown)</div>
            <div className="text-2xl font-semibold" style={{ color: PALETTE.text }}>{totalAll}</div>
          </div>

          <div className="p-3 bg-white rounded-lg border" style={{ borderColor: PALETTE.subtleBorder }}>
            <div className="text-xs text-gray-500">Actioned</div>
            <div className="text-2xl font-semibold" style={{ color: PALETTE.primary }}>{totalActioned}</div>
          </div>

          <div className="p-3 bg-white rounded-lg border" style={{ borderColor: PALETTE.subtleBorder }}>
            <div className="text-xs text-gray-500">Closed</div>
            <div className="text-2xl font-semibold" style={{ color: PALETTE.muted }}>{totalClosed}</div>
          </div>

          <div className="p-3 bg-white rounded-lg border" style={{ borderColor: PALETTE.subtleBorder }}>
            <div className="text-xs text-gray-500">Pending</div>
            <div className="text-2xl font-semibold" style={{ color: PALETTE.warn }}>{totalPending}</div>
          </div>

          <div className="p-3 bg-white rounded-lg border" style={{ borderColor: PALETTE.subtleBorder }}>
            <div className="text-xs text-gray-500">Action Rate</div>
            <div className="text-2xl font-semibold">{totalAll ? `${((totalActioned/totalAll)*100).toFixed(1)}%` : "0%"}</div>
          </div>

          <div className="p-3 bg-white rounded-lg border" style={{ borderColor: PALETTE.subtleBorder }}>
            <div className="text-xs text-gray-500">Closure Rate</div>
            <div className="text-2xl font-semibold">{totalAll ? `${((totalClosed/totalAll)*100).toFixed(1)}%` : "0%"}</div>
          </div>
        </div>

        {/* Area cards (horizontal scroller with arrows) */}
        <h3 className="font-semibold mt-4">Area-wise Complaint Status</h3>

        <div className="relative">
          {/* Left arrow */}
          <button
            aria-label="Scroll areas left"
            onClick={handleScrollLeft}
            disabled={!canScrollLeft}
            className={`absolute left-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full shadow flex items-center justify-center ${canScrollLeft ? "bg-white hover:bg-gray-50" : "bg-gray-100 opacity-40 cursor-not-allowed"}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M12.293 3.293a1 1 0 010 1.414L7.414 9.586l4.879 4.879a1 1 0 11-1.414 1.414l-5.586-5.586a1 1 0 010-1.414l5.586-5.586a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>

          {/* Scroller */}
          <div
            ref={areaScrollerRef}
            className="overflow-hidden"
            style={{ padding: "8px 48px" }}
          >
            <div className="flex gap-4" style={{ transition: "transform 0.2s" }}>
              {areaMetrics.length === 0 && (
                <div className="text-gray-500 p-4">No area data yet (try refresh)</div>
              )}

              {areaMetrics.map((stats) => (
                <div
                  key={stats.label}
                  onClick={() => { setSelectedArea(stats.label); setSearchQuery(""); setSortBy("date_desc"); }}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setSelectedArea(stats.label); setSearchQuery(""); setSortBy("date_desc"); } }}
                  className="min-w-[260px] max-w-[260px] bg-white rounded-lg shadow p-4 cursor-pointer hover:ring-2 hover:ring-blue-500 transition flex-shrink-0"
                >
                  <div className="font-semibold text-lg truncate">{stats.label}</div>
                  <div className="text-sm text-gray-600 mt-2">
                    Total: <strong>{stats.total}</strong>
                  </div>
                  <div className="text-xs text-green-600">Completed: {stats.closed}</div>
                  <div className="text-xs text-yellow-600">Actioned: {stats.actioned}</div>
                  <div className="text-xs text-red-600">Pending: {stats.pending}</div>
                  <div className="text-xs text-gray-500 mt-2">Avg pending: {stats.avgPendingAge} d</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right arrow */}
          <button
            aria-label="Scroll areas right"
            onClick={handleScrollRight}
            disabled={!canScrollRight}
            className={`absolute right-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full shadow flex items-center justify-center ${canScrollRight ? "bg-white hover:bg-gray-50" : "bg-gray-100 opacity-40 cursor-not-allowed"}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M7.707 16.707a1 1 0 010-1.414L12.586 11 7.707 6.121a1 1 0 011.414-1.414l5.586 5.586a1 1 0 010 1.414l-5.586 5.586a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Charts + filters */}
        <div className="bg-white rounded-lg border p-4" style={{ borderColor: PALETTE.subtleBorder, boxShadow: PALETTE.shadow }}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium" style={{ color: PALETTE.text }}>
              Responses vs Actions {chartAreaFilter && chartAreaFilter !== "All" ? `— ${chartAreaFilter}` : `(${groupBy})`}
            </div>

            <div className="flex items-center gap-2">
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="border rounded px-2 py-1 text-sm">
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>

              {/* New: Area filter for chart */}
              <select value={chartAreaFilter} onChange={(e) => setChartAreaFilter(e.target.value)} className="border rounded px-2 py-1 text-sm">
                {areaOptions.map(opt => <option key={opt} value={opt}>{opt === "All" ? "All Areas" : opt}</option>)}
              </select>

              <select value={fyFilter} onChange={(e) => setFyFilter(e.target.value)} className="border rounded px-2 py-1 text-sm">
                <option value="All">All FY</option>
                {fyOptions.map(fy => <option key={fy} value={fy}>{fy}</option>)}
              </select>

              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border rounded px-2 py-1 text-sm">
                <option value="All">All Status</option>
                <option value="Completed">Completed</option>
                <option value="In Progress">In Progress</option>
                <option value="Pending">Pending</option>
              </select>

              <input type="number" min={0} value={pendingMoreThan} onChange={(e) => setPendingMoreThan(Math.max(0, Number(e.target.value || 0)))} className="border rounded px-2 py-1 text-sm w-28" placeholder="Pending > days" />

              <button onClick={() => toast.success(`Applied chart filters ${chartAreaFilter && chartAreaFilter !== "All" ? `for ${chartAreaFilter}` : ""}`)} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm">Apply</button>
              <button onClick={() => { setChartAreaFilter("All"); clearFilters(); }} className="px-3 py-1 border rounded text-sm">Reset</button>
            </div>
          </div>

          <div className="w-full overflow-x-auto mb-4">
            <div style={{ minWidth: 520 }}>
              <GroupedBarChart data={groupedData} width={760} height={260} groupBy={groupBy} />
            </div>
          </div>

          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 bg-white rounded border" style={{ borderColor: PALETTE.subtleBorder }}>
              <div className="text-sm font-medium mb-2">Actioned / Pending</div>
              <Donut valueMap={{ Actioned: totalActioned, Pending: totalPending }} size={120} colors={[PALETTE.accent, PALETTE.warn]} />
            </div>

            <div className="p-3 bg-white rounded border" style={{ borderColor: PALETTE.subtleBorder }}>
              <div className="text-sm font-medium mb-2">Pending Age Buckets</div>
              <Donut valueMap={pendingBuckets} size={120} colors={[PALETTE.primary, PALETTE.accent, PALETTE.warn, "#D14343"]} />
            </div>

            <div className="p-3 bg-white rounded border" style={{ borderColor: PALETTE.subtleBorder }}>
              <div className="text-sm font-medium mb-2">Avg / Oldest pending</div>
              <div className="text-xl font-semibold" style={{ color: PALETTE.primary }}>{ageing.avgPendingAge} d</div>
              <div className="text-xs text-gray-500 mt-1">Avg pending age (shown)</div>
              <div className="text-sm mt-2">Oldest: <strong>{ageing.maxPendingAge} d</strong></div>
            </div>
          </div>
        </div>

        {/* Side panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-lg border p-3" style={{ borderColor: PALETTE.subtleBorder, boxShadow: PALETTE.shadow }}>
            <div className="font-medium mb-2">Top Areas (by shown complaints)</div>
            <HorizontalTopBars items={topAreas} maxItems={8} />
          </div>

          <div className="bg-white rounded-lg border p-3" style={{ borderColor: PALETTE.subtleBorder }}>
            <div className="text-sm font-medium mb-2">Quick totals</div>
            <div className="text-sm text-gray-700"><strong>Total shown:</strong> {totalAll}</div>
            <div className="text-sm text-gray-700"><strong>Actioned:</strong> {totalActioned}</div>
            <div className="text-sm text-gray-700"><strong>Pending:</strong> {totalPending}</div>
            <div className="mt-2 text-xs text-gray-500">Click an area card above to drill into area complaints.</div>
            <div className="mt-3 text-xs text-gray-500">Areas loaded: {areasLoading ? "Loading..." : areas.length} {areasError ? ` — ${areasError}` : ""}</div>
          </div>
        </div>

        {/* Area accountability */}
        <div className="bg-white rounded-lg border p-4" style={{ borderColor: PALETTE.subtleBorder }}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium">Area-wise Accountability</div>
            <div className="text-xs text-gray-500">Showing top areas by pending</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="py-2">Area</th>
                  <th className="py-2">Total</th>
                  <th className="py-2">Actioned</th>
                  <th className="py-2">Closed</th>
                  <th className="py-2">Pending</th>
                  <th className="py-2">Avg pending age</th>
                </tr>
              </thead>
              <tbody>
                {areaMetrics.map(a => (
                  <tr key={String(a.id)} className="border-t">
                    <td className="py-2">{a.label}</td>
                    <td className="py-2">{a.total}</td>
                    <td className="py-2">{a.actioned}</td>
                    <td className="py-2">{a.closed}</td>
                    <td className="py-2">{a.pending}</td>
                    <td className="py-2">{a.avgPendingAge} d</td>
                  </tr>
                ))}
                {areaMetrics.length === 0 && (
                  <tr><td className="py-4 text-gray-500" colSpan={6}>No data for selected filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top oldest pending — now with View button (directors can inspect activities) */}
        <div className="bg-white rounded-lg border p-4" style={{ borderColor: PALETTE.subtleBorder }}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium">Top oldest pending complaints</div>
            <div className="text-xs text-gray-500">Action these first</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="py-2">ID</th>
                  <th className="py-2">Area</th>
                  <th className="py-2">Registered</th>
                  <th className="py-2">Days pending</th>
                  <th className="py-2">Actioned</th>
                  <th className="py-2">Closed</th>
                  <th className="py-2">View</th>
                </tr>
              </thead>
              <tbody>
                {oldestPending.map(c => (
                  <tr key={c.id} className="border-t">
                    <td className="py-2">{String(c.id)}</td>
                    <td className="py-2">{c.unit_name}</td>
                    <td className="py-2">{c.incidentIso ? new Date(c.incidentIso).toLocaleDateString() : (c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—")}</td>
                    <td className="py-2">{c.ageDays} d</td>
                    <td className="py-2">{c.actionTaken ? "Yes" : "No"}</td>
                    <td className="py-2">{c.isClosed ? "Yes" : "No"}</td>
                    <td className="py-2">
                      <button onClick={() => openComplaintDetail(c)} className="px-3 py-1 border rounded text-sm">View</button>
                    </td>
                  </tr>
                ))}
                {oldestPending.length === 0 && <tr><td className="py-4 text-gray-500" colSpan={7}>No pending complaints for selected filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {error && <div className="text-red-600">{error}</div>}
        <div className="text-xs text-gray-500">Tip: For very large datasets, server-side filter endpoints are recommended — I can wire them into this panel if you'd like.</div>
      </div>
    );
  }

  // AREA DETAILS (area context + search + list)
  if (selectedArea && !selectedComplaint) {
    const lowerQ = (searchQuery || "").trim().toLowerCase();
    const matched = normalizedForView.filter(i => {
      if (!lowerQ) return true;
      const fields = [
        String(i.id || ""),
        String(i.title || ""),
        String(i.raw?.description || i.raw?.details || ""),
        String(i.raw?.submitted_by || i.raw?.submittedBy || ""),
        String(i.raw?.assignedto || i.raw?.assigned_by || i.raw?.assignedby || "")
      ];
      return fields.some(f => f.toLowerCase().includes(lowerQ));
    });

    const sorted = [...matched].sort((a,b) => {
      if (sortBy === "date_desc") {
        const da = new Date(a.incidentIso || a.createdAt || 0).getTime();
        const db = new Date(b.incidentIso || b.createdAt || 0).getTime();
        return db - da;
      }
      if (sortBy === "date_asc") {
        const da = new Date(a.incidentIso || a.createdAt || 0).getTime();
        const db = new Date(b.incidentIso || b.createdAt || 0).getTime();
        return da - db;
      }
      if (sortBy === "age_desc") {
        return (b.ageDays || 0) - (a.ageDays || 0);
      }
      return 0;
    });

    const areaStat = areaMetrics.find(a => a.label === selectedArea) || { label: selectedArea, total: 0, actioned: 0, pending: 0, avgPendingAge: 0 };

    return (
      <div className="space-y-4">
        <button
          onClick={() => { setSelectedArea(null); setFyFilter("All"); setStatusFilter("All"); setSearchQuery(""); setSortBy("date_desc"); }}
          className="text-sm text-blue-600 underline"
        >
          ← Back to Area Overview
        </button>

        <h3 className="text-lg font-semibold">Complaints — {selectedArea}</h3>

        {/* AREA CONTEXT */}
        <div className="bg-white rounded-lg border p-4" style={{ borderColor: PALETTE.subtleBorder }}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium">Area context — {selectedArea}</div>
            <div className="text-xs text-gray-500">Snapshot of area accountability</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 bg-white rounded border" style={{ borderColor: PALETTE.subtleBorder }}>
              <div className="text-sm font-medium mb-2">Actioned / Pending (area)</div>
              <Donut valueMap={{
                Actioned: areaStat.actioned || 0,
                Pending: areaStat.pending || 0,
              }} size={100} colors={[PALETTE.accent, PALETTE.warn]} />
            </div>

            <div className="p-3 bg-white rounded border" style={{ borderColor: PALETTE.subtleBorder }}>
              <div className="text-sm font-medium mb-2">Avg pending age (area)</div>
              <div className="text-xl font-semibold" style={{ color: PALETTE.primary }}>{areaStat.avgPendingAge ?? "—"} d</div>
              <div className="text-xs text-gray-500 mt-1">Avg pending age (shown)</div>
            </div>

            <div className="p-3 bg-white rounded border" style={{ borderColor: PALETTE.subtleBorder }}>
              <div className="text-sm font-medium mb-2">Top oldest pending (area)</div>
              <div className="text-xs">
                {oldestPending.filter(x => x.unit_name === selectedArea).slice(0,4).map(x => (
                  <div key={x.id} className="mb-1">
                    <div className="font-medium text-sm">{String(x.id)}</div>
                    <div className="text-xs text-gray-500">{x.ageDays} d • {x.title}</div>
                  </div>
                ))}
                {oldestPending.filter(x => x.unit_name === selectedArea).length === 0 && <div className="text-gray-500">No pending complaints for this area.</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Filters + Search */}
        <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded shadow">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Search</label>
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="id, title, description, submitter..." className="border p-2 rounded w-72" />
          </div>

          <div>
            <label className="text-sm text-gray-600">Sort</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="border p-2 rounded">
              <option value="date_desc">Newest first</option>
              <option value="date_asc">Oldest first</option>
              <option value="age_desc">Oldest pending first</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-600">FY</label>
            <select value={fyFilter} onChange={(e) => setFyFilter(e.target.value)} className="border p-2 rounded">
              <option value="All">All FY</option>
              {fyOptions.map(fy => <option key={fy} value={fy}>{fy}</option>)}
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-600">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border p-2 rounded">
              <option value="All">All Status</option>
              <option>Completed</option>
              <option>In Progress</option>
              <option>Pending</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Pending &gt;</label>
            <input type="number" min={0} value={pendingMoreThan} onChange={(e) => setPendingMoreThan(Math.max(0, Number(e.target.value || 0)))} className="border p-2 rounded w-28" />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => { setSearchQuery(""); setSortBy("date_desc"); setFyFilter("All"); setStatusFilter("All"); setPendingMoreThan(0); toast.success("Cleared area filters"); }} className="px-3 py-1 border rounded text-sm">Reset</button>
            <button onClick={() => toast.success("Filters applied")} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm">Apply</button>
          </div>
        </div>

        {/* Complaint list for area */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sorted.map((r) => (
            <div key={r.id} className="bg-white p-4 rounded shadow">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <div className="font-semibold">{r.title || `#${r.id}`} <span className="text-xs text-gray-400">({r.id})</span></div>
                  <div className="text-xs text-gray-500">{r.incidentIso ? new Date(r.incidentIso).toLocaleDateString() : (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—")} • FY {r.financialYear}</div>
                  <div className="text-sm mt-2">Status: <strong>{statusFromNormalized(r)}</strong></div>
                  <div className="text-xs text-gray-500 mt-1">Area: {r.unit_name}</div>
                  <div className="text-xs text-gray-600 mt-2 truncate">{(r.raw?.description || r.raw?.details || "").slice(0, 180)}</div>
                </div>

                <div className="flex flex-col gap-2">
                  <button onClick={() => openComplaintDetail(r)} className="px-3 py-1 border rounded text-sm">View</button>
                </div>
              </div>
            </div>
          ))}

          {sorted.length === 0 && <div className="text-gray-500 p-4">No complaints match your filters/search.</div>}
        </div>
      </div>
    );
  }

  // COMPLAINT DETAIL modal/view (shows nodal/HQ actions & attachments)
  if (selectedComplaint) {
    const r = selectedComplaint;
    // nodalActions and activities are already normalized in mapDetailFields, but fallback if not
    const nodalActions = (Array.isArray(r.nodalActions) ? r.nodalActions : normalizeAndSortActivities(r.raw?.nodal_actions ?? r.raw?.activities ?? r.raw?.actions ?? []) || []);
    const activities = (Array.isArray(r.activities) ? r.activities : normalizeAndSortActivities(r.raw?.activities ?? r.raw?.activity ?? r.raw?.actions ?? []) || []);

    // decide if "Other activities" is just a duplicate of nodal/area actions
    const hideOtherActivities = activitiesAreDuplicateOrSubset(nodalActions, activities);

    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedComplaint(null)} className="text-sm text-blue-600 underline">← Back</button>

        <div className="bg-white rounded-lg shadow p-6 space-y-3 max-w-4xl">
          <h3 className="text-lg font-semibold">{r.title || `#${r.id}`} <span className="text-xs text-gray-400">({r.id})</span></h3>

          <div className="text-sm text-gray-600">Area: <strong>{r.unit_name || r.raw?.area_name || r.unit_name}</strong> • FY <strong>{r.financialYear}</strong></div>

          <div className="text-sm">Submitted by: <strong>{r.raw?.submitted_by || r.raw?.submittedBy || "Unknown"}</strong> on {r.incidentIso ? new Date(r.incidentIso).toLocaleDateString() : (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—")}</div>

          <div className="text-sm">Status: <strong>{statusFromNormalized(r)}</strong></div>

          <div className="mt-3 text-gray-700 whitespace-pre-wrap">{r.description || r.raw?.description || r.raw?.details || "No description available."}</div>

          <div className="border-t pt-3">
            <div className="font-semibold text-sm">Action Taken (summary)</div>
            <div className="text-sm mt-1">{r.actionTaken?.text ?? r.actionTaken ?? "No action recorded."}</div>
          </div>

          {/* Attachments */}
          <div className="mt-4">
            <div className="text-xs text-gray-500">Attachments</div>
            <div className="mt-2 flex flex-col gap-2">
              {(() => {
                const atts = (r.attachments && r.attachments.length) ? r.attachments : getTopLevelAttachments(r);
                if (!atts || atts.length === 0) return <div className="text-xs text-gray-400">No attachments</div>;
                return atts.map((p, i) => {
                  const url = getAttachmentUrl(p);
                  const label = getAttachmentLabel(p, i);
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <a href={url || "#"} target="_blank" rel="noreferrer" className="text-sm underline text-blue-600 truncate" onClick={(ev) => { if (!url) ev.preventDefault(); }}>{label}</a>
                      {url ? <a href={url} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 border rounded">Open</a> : <span className="text-xs text-gray-400 px-2 py-1 border rounded">No file</span>}
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Nodal actions */}
          <div className="mt-6">
            <div className="text-xs text-gray-500">Nodal / Area actions</div>
            <div className="mt-3 space-y-3">
              {(!nodalActions || nodalActions.length === 0) ? <div className="text-sm text-gray-400">No nodal actions recorded.</div> : nodalActions.map((a, idx) => renderActionEntry(a, idx))}
            </div>
          </div>

          {/* HQ and other activities — hidden when duplicate/subset */}
          {!hideOtherActivities && (
            <div className="mt-6">
              <div className="text-xs text-gray-500">Other activities (HQ / system)</div>
              <div className="mt-3 space-y-3">
                {(!activities || activities.length === 0) ? <div className="text-sm text-gray-400">No activities recorded.</div> : activities.map((a, idx) => renderActionEntry(a, idx))}
              </div>
            </div>
          )}

          {/* Server metadata */}
          {r.raw && (
            <div className="mt-6">
              <div className="text-xs text-gray-500 mb-2">Server metadata (compact)</div>
              <div className="text-xs text-gray-700 p-3 bg-gray-50 rounded">
                <div><strong>Server ID:</strong> {r.raw?.id ?? "-"}</div>
                <div className="mt-1"><strong>Area id:</strong> {r.raw?.area_id ?? r.raw?.unit_id ?? "-"}</div>
                <div className="mt-1"><strong>Area name:</strong> {r.raw?.area_name ?? r.raw?.unit_name ?? r.unit_name ?? "-"}</div>
                <div className="mt-1"><strong>Received at:</strong> {r.raw?.created_at ?? r.raw?.createdAt ?? "-"}</div>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-between items-center gap-2">
            <div>
              <button type="button" onClick={() => { navigator.clipboard?.writeText(r.trackingNumber || ""); toast.success("Copied"); }} className="px-3 py-1 border rounded text-sm">Copy tracking</button>
            </div>

            <div>
              <button type="button" onClick={() => setSelectedComplaint(null)} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Done</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
