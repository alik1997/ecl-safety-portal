// src/dashboards/ActionReports.jsx
import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

/**
 * ActionReports (enhanced)
 *
 * - Adds realistic, actionable KPIs and ageing metrics.
 * - Area-wise accountability (counts, pending, avg pending age).
 * - Top-oldest-pending list for immediate action.
 * - Keeps server-friendly pagination fetch from original file.
 *
 * Changes in this version:
 * - Fetches public areas from PUBLIC_AREAS and employment types from PUBLIC_EMPLOY
 * - Uses those as the source-of-truth for Area and Employment dropdowns
 * - When aggregating complaints, maps area_id -> public name (if available)
 */

const HQ_COMPLAINTS_API = "/api/hq/complaints";
const PUBLIC_AREAS = "/api/public/areas";
const PUBLIC_EMPLOY = "/api/public/employment-types";

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

function employmentLabelFromId(id) {
  const m = {
    "1": "Departmental (ECL Employee)",
    "2": "Contractual (ECL Employee)",
    "3": "Non-ECL Employee (Outsider)",
  };
  return m[String(id)] || `Type ${id}`;
}

function normalizeComplaint(c) {
  const iso = c.incident_date || c.created_at || null;
  const hasAction =
    Boolean(c.assignedby) ||
    Boolean(c.assignedto) ||
    Boolean(c.isclosed) ||
    (c.workflowstatus && String(c.workflowstatus).toUpperCase() !== "NEW");

  return {
    id: c.id,
    incidentIso: iso,
    createdAt: c.created_at || null,
    isClosed: Boolean(c.isclosed),
    actionTaken: hasAction,
    area_id: c.area_id ?? null,
    unit_name: c.unit_name || c.unit || "", // may be patched later from public areas lookup
    employment_type_id: c.employment_type_id ?? null,
    financialYear: getFinancialYearFromIso(iso),
    ageDays: daysBetween(iso),
    raw: c,
  };
}

/* ----------------- Visual style ----------------- */
const PALETTE = {
  bgCard: "#ffffff",
  surface: "#f8fafc",
  primary: "#2563EB",
  accent: "#06B6D4",
  warn: "#F97316",
  muted: "#6B7280",
  text: "#0F172A",
  subtleBorder: "#E6EEF7",
  shadow: "0 6px 18px rgba(14, 30, 37, 0.06)",
  danger: "#EF4444",
};

/* ----------------- Small chart components (SVG) ----------------- */
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

function GroupedBarChart({ data = [], width = 900, height = 300, groupBy = "month" }) {
  const pad = { top: 20, right: 20, bottom: 70, left: 48 };
  const innerW = Math.max(200, width - pad.left - pad.right);
  const innerH = Math.max(100, height - pad.top - pad.bottom);
  const display = data.slice(-Math.max(8, Math.min(60, data.length)));
  const maxValue = Math.max(1, ...display.map(d => Math.max(d.responses || 0, d.actions || 0)));
  const groupW = innerW / Math.max(1, display.length);
  const barW = Math.max(6, groupW * 0.44);
  const ticks = Math.ceil(display.length / 10) || 1;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Responses vs actions">
      <g transform={`translate(${pad.left},${pad.top})`}>
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const y = innerH * (1 - t);
          const label = Math.round(maxValue * t);
          return (
            <g key={i}>
              <line x1={0} x2={innerW} y1={y} y2={y} stroke={PALETTE.subtleBorder} />
              <text x={-12} y={y + 4} fontSize="11" fill={PALETTE.muted} textAnchor="end">{label}</text>
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
                rx="5"
                fill={PALETTE.primary}
                opacity="0.95"
              />
              <rect
                x={(groupW - barW) / 2 + barW * 0.18}
                y={innerH - actH}
                width={barW * 0.64}
                height={actH}
                rx="4"
                fill={PALETTE.accent}
                opacity="0.98"
              />

              {(idx % ticks === 0 || idx === display.length - 1) && (
                <text
                  x={groupW / 2}
                  y={innerH + 48}
                  fontSize="11"
                  fill={PALETTE.text}
                  textAnchor="middle"
                  transform={`rotate(-45 ${groupW / 2} ${innerH + 48})`}
                >
                  {shortLabelFromKey(d.labelKey, groupBy)}
                </text>
              )}
            </g>
          );
        })}

        <g transform={`translate(${Math.max(0, innerW - 190)}, -10)`}>
          <rect x={0} y={0} width={10} height={10} rx="2" fill={PALETTE.primary} />
          <text x={16} y={10} fontSize="12" fill={PALETTE.text}>Responses</text>
          <rect x={0} y={18} width={10} height={10} rx="2" fill={PALETTE.accent} />
          <text x={16} y={28} fontSize="12" fill={PALETTE.text}>Actions</text>
        </g>
      </g>
    </svg>
  );
}

function Donut({ valueMap = {}, size = 140, colors = [PALETTE.primary, PALETTE.accent, PALETTE.warn, PALETTE.danger] }) {
  const total = Object.values(valueMap).reduce((s, v) => s + (v || 0), 0);
  const viewSize = Math.max(64, Math.min(200, size));
  const center = viewSize / 2;
  const r = center - 8;
  const innerR = Math.max(8, Math.floor(r * 0.58));
  const entries = Object.keys(valueMap).map((k) => ({ label: k, value: valueMap[k] || 0 }));
  const nonZero = entries.filter(e => (e.value || 0) > 0);

  const legendRows = (list) => list.map((s, idx) => (
    <div key={s.label} className="flex items-center gap-2 mb-1">
      <span style={{ background: s.color, border: "1px solid rgba(0,0,0,0.06)" }} className="w-3 h-3 rounded-sm inline-block" />
      <span className="text-xs" style={{ color: PALETTE.text }}>{s.label} — <span className="font-semibold">{s.value}</span></span>
    </div>
  ));

  const svgContainerClass = "w-28 h-28 flex items-center justify-center flex-shrink-0";

  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className={svgContainerClass}>
          <svg width="100%" height="100%" viewBox={`0 0 ${viewSize} ${viewSize}`} aria-hidden>
            <circle cx={center} cy={center} r={r} fill={PALETTE.surface} stroke={PALETTE.subtleBorder} strokeWidth="10" />
            <circle cx={center} cy={center} r={innerR} fill="#fff" />
            <text x={center} y={center} textAnchor="middle" dy="4" fontSize={Math.max(10, viewSize * 0.07)} fill={PALETTE.muted}>0</text>
          </svg>
        </div>

        <div className="text-sm w-full">
          {legendRows(entries.map((e, i) => ({ label: e.label, value: e.value, color: colors[i % colors.length] })))}
        </div>
      </div>
    );
  }

  if (nonZero.length === 1) {
    const s = nonZero[0];
    const color = colors[0 % colors.length];
    return (
      <div className="flex flex-col items-center gap-2">
        <div className={svgContainerClass}>
          <svg width="100%" height="100%" viewBox={`0 0 ${viewSize} ${viewSize}`} aria-hidden>
            <circle cx={center} cy={center} r={r} fill={color} />
            <circle cx={center} cy={center} r={innerR} fill="#fff" />
            <text x={center} y={center} textAnchor="middle" dy="4" fontSize={Math.max(10, viewSize * 0.08)} fill={PALETTE.text}>{s.value}</text>
          </svg>
        </div>

        <div className="text-sm w-full">
          {legendRows(entries.map((e, i) => ({ label: e.label, value: e.value, color: (e.value || 0) > 0 ? color : colors[i % colors.length] })))}
        </div>
      </div>
    );
  }

  let angleStart = -Math.PI / 2;
  const slices = [];
  nonZero.forEach((e, i) => {
    const angle = (e.value / total) * Math.PI * 2;
    const angleEnd = angleStart + angle;
    const x1 = center + r * Math.cos(angleStart);
    const y1 = center + r * Math.sin(angleStart);
    const x2 = center + r * Math.cos(angleEnd);
    const y2 = center + r * Math.sin(angleEnd);
    const large = angle > Math.PI ? 1 : 0;
    const d = `M ${center} ${center} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    slices.push({ label: e.label, value: e.value, path: d, color: colors[i % colors.length] });
    angleStart = angleEnd;
  });

  const legendList = entries.map((e, i) => {
    const idx = nonZero.findIndex(n => n.label === e.label);
    const color = idx >= 0 ? colors[idx % colors.length] : colors[(i + nonZero.length) % colors.length];
    return { label: e.label, value: e.value, color };
  });

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className={svgContainerClass}>
        <svg width="100%" height="100%" viewBox={`0 0 ${viewSize} ${viewSize}`} aria-hidden>
          <circle cx={center} cy={center} r={r} fill={PALETTE.surface} />
          <g>
            {slices.map((s, idx) => s.value > 0 ? <path key={idx} d={s.path} fill={s.color} /> : null)}
          </g>
          <circle cx={center} cy={center} r={innerR} fill="#fff" />
          <text x={center} y={center} textAnchor="middle" dy="4" fontSize={Math.max(10, viewSize * 0.07)} fill={PALETTE.text}>{total}</text>
        </svg>
      </div>

      <div className="text-sm w-full">
        {legendRows(legendList)}
      </div>
    </div>
  );
}

const DonutChart = Donut;

function SimpleBarChart({ data = [], width = 800, height = 240, maxBars = 60, maxLabels = 10 }) {
  const display = data.slice(-maxBars);
  const maxValue = Math.max(1, ...display.map(d => Math.max(d.responses || 0, d.actions || 0)));
  const pad = { left: 36, top: 12, bottom: 40, right: 12 };
  const innerW = Math.max(200, width - pad.left - pad.right);
  const innerH = Math.max(80, height - pad.top - pad.bottom);
  const barGroupW = innerW / Math.max(1, display.length);
  const respW = barGroupW * 0.42;
  const actW = barGroupW * 0.42;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMid meet" role="img">
      <g transform={`translate(${pad.left},${pad.top})`}>
        {display.map((d, i) => {
          const x = i * barGroupW;
          const respH = ((d.responses || 0) / maxValue) * innerH;
          const actH = ((d.actions || 0) / maxValue) * innerH;
          return (
            <g key={i} transform={`translate(${x},0)`}>
              <rect x={(barGroupW - respW - actW) / 2} y={innerH - respH} width={respW} height={respH} rx="3" fill={PALETTE.primary} />
              <rect x={(barGroupW - respW - actW) / 2 + respW + 4} y={innerH - actH} width={actW} height={actH} rx="3" fill={PALETTE.accent} />
              {(i % Math.ceil(display.length / maxLabels) === 0 || i === display.length - 1) && (
                <text x={barGroupW / 2} y={innerH + 28} fontSize="10" fill={PALETTE.muted} textAnchor="middle">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function HorizontalTopBars({ items = [], maxItems = 6 }) {
  const data = items.slice(0, maxItems);
  const maxVal = Math.max(1, ...data.map(d => d.value || 0));
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <div className="w-28 text-xs text-gray-700 truncate">{d.label}</div>
          <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
            <div style={{ width: `${(d.value / maxVal) * 100}%` }} className="h-3 bg-blue-600 rounded" />
          </div>
          <div className="w-10 text-right text-sm font-semibold">{d.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ----------------- Grouping utilities ----------------- */
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

/* ----------------- Main component ----------------- */
export default function ActionReports() {
  const [items, setItems] = useState([]);
  const [publicAreas, setPublicAreas] = useState([]); // from PUBLIC_AREAS
  const [publicEmployTypes, setPublicEmployTypes] = useState([]); // from PUBLIC_EMPLOY

  const [loading, setLoading] = useState(false);
  const [aggLoading, setAggLoading] = useState(false);
  const [error, setError] = useState(null);

  // filters / UI
  const [groupBy, setGroupBy] = useState("month");
  const [areaFilter, setAreaFilter] = useState("");
  const [empFilter, setEmpFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [fyFilter, setFyFilter] = useState("");
  const [pendingMoreThan, setPendingMoreThan] = useState(0);

  /* ----------------- Fetch public masters ----------------- */
  async function fetchPublicMasters() {
    try {
      const [aRes, eRes] = await Promise.all([
        fetch(PUBLIC_AREAS),
        fetch(PUBLIC_EMPLOY),
      ]);

      if (aRes.ok) {
        const aJson = await aRes.json();
        // Expecting an array of { id, name } or similar
        setPublicAreas(Array.isArray(aJson) ? aJson : (aJson?.data && Array.isArray(aJson.data) ? aJson.data : []));
      } else {
        console.warn("Failed to fetch PUBLIC_AREAS", aRes.status);
        setPublicAreas([]);
      }

      if (eRes.ok) {
        const eJson = await eRes.json();
        setPublicEmployTypes(Array.isArray(eJson) ? eJson : (eJson?.data && Array.isArray(eJson.data) ? eJson.data : []));
      } else {
        console.warn("Failed to fetch PUBLIC_EMPLOY", eRes.status);
        setPublicEmployTypes([]);
      }
    } catch (err) {
      console.error("Failed to fetch public masters", err);
      toast.error("Failed loading area / employment master data");
      setPublicAreas([]);
      setPublicEmployTypes([]);
    }
  }

  /* ----------------- Fetch complaints (aggregated pages) ----------------- */
  async function fetchAll() {
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

      // build lookup from publicAreas (if available)
      const areaLookup = {};
      publicAreas.forEach(a => {
        if (a && a.id != null) areaLookup[String(a.id)] = (a.name ?? a.label ?? a.title ?? a.area_name ?? null);
      });

      // normalize and patch unit_name with public area name when possible
      const mapped = allRaw.map(c => {
        const n = normalizeComplaint(c);
        if ((!n.unit_name || n.unit_name === "" || n.unit_name.startsWith("Area ")) && n.area_id != null) {
          const ln = areaLookup[String(n.area_id)];
          n.unit_name = ln ?? (n.unit_name || `Area ${n.area_id}`);
        } else {
          // if existing unit_name, leave it; if no mapping and no unit_name, fallback
          n.unit_name = n.unit_name || (n.area_id ? `Area ${n.area_id}` : "Unknown Area");
        }
        return n;
      });

      setItems(mapped);
      toast.success(`Aggregated ${mapped.length} complaints`);
    } catch (err) {
      console.error("Failed to aggregate:", err);
      setError(err?.message || "Failed to aggregate data");
      toast.error("Aggregation failed — charts may be incomplete.");
    } finally {
      setLoading(false);
      setAggLoading(false);
    }
  }

  /* ----------------- Load masters then complaints on mount ----------------- */
  useEffect(() => {
    async function init() {
      await fetchPublicMasters();
      await fetchAll();
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Derived / filters ---------- */
  // NOTE: keep previous derived areas/empTypes (from items) for internal metrics,
  // but filter dropdowns will use publicAreas / publicEmployTypes.
  const areasFromItems = useMemo(() => {
    const m = new Map();
    items.forEach((i) => {
      const id = i.area_id ?? "(unknown)";
      m.set(String(id), i.unit_name || `Area ${id}`);
    });
    return Array.from(m.entries()).map(([id, label]) => ({ id, label }));
  }, [items]);

  const empTypesFromItems = useMemo(() => {
    const s = new Set();
    items.forEach((i) => { if (i.employment_type_id) s.add(String(i.employment_type_id)); });
    return Array.from(s).map(id => ({ id, label: employmentLabelFromId(id) }));
  }, [items]);

  const fyOptions = useMemo(() => {
    const s = new Set();
    items.forEach(i => { if (i.financialYear) s.add(i.financialYear); });
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => {
    if (!items || items.length === 0) return [];
    return items.filter(i => {
      if (areaFilter && String(i.area_id) !== String(areaFilter)) return false;
      if (empFilter && String(i.employment_type_id) !== String(empFilter)) return false;
      if (fyFilter && i.financialYear !== fyFilter) return false;
      if (fromDate || toDate) {
        const iso = i.incidentIso || i.createdAt;
        if (!iso) return false;
        const t = new Date(iso).setHours(0,0,0,0);
        if (fromDate) {
          const f = new Date(fromDate).setHours(0,0,0,0);
          if (t < f) return false;
        }
        if (toDate) {
          const to = new Date(toDate).setHours(23,59,59,999);
          if (t > to) return false;
        }
      }
      if (pendingMoreThan > 0) {
        if (i.actionTaken) return false;
        const iso = i.incidentIso || i.createdAt;
        if (!iso) return false;
        const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000*60*60*24));
        if (days <= pendingMoreThan) return false;
      }
      return true;
    });
  }, [items, areaFilter, empFilter, fromDate, toDate, fyFilter, pendingMoreThan]);

  const groupedData = useMemo(() => {
    const map = new Map();
    filtered.forEach(r => {
      if (!r.incidentIso && !r.createdAt) return;
      const iso = r.incidentIso || r.createdAt;
      const key = groupKeyFromDate(iso, groupBy);
      const entry = map.get(key) || { labelKey: key, responses: 0, actions: 0 };
      entry.responses += 1;
      if (r.actionTaken) entry.actions += 1;
      map.set(key, entry);
    });

    const arr = Array.from(map.values()).sort((a,b) => {
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
      } catch {
        return 0;
      }
    });

    return arr;
  }, [filtered, groupBy]);

  const topAreas = useMemo(() => {
    const map = new Map();
    filtered.forEach(r => {
      const id = r.area_id ?? "(unknown)";
      const label = r.unit_name || `Area ${id}`;
      const cur = map.get(id) || { label, value: 0 };
      cur.value += 1;
      map.set(id, cur);
    });
    return Array.from(map.values()).sort((a,b) => b.value - a.value).slice(0, 8);
  }, [filtered]);

  const totalAll = filtered.length;
  const totalActioned = filtered.filter(d => d.actionTaken).length;
  const totalPending = totalAll - totalActioned;
  const totalClosed = filtered.filter(d => d.isClosed).length;

  const ageing = useMemo(() => {
    const ages = filtered.map(i => i.ageDays).filter(v => typeof v === "number");
    const pendingAges = filtered.filter(i => !i.actionTaken).map(i => i.ageDays).filter(v => typeof v === "number");
    return {
      avgAge: ages.length ? Math.round(ages.reduce((a,b)=>a+b,0)/ages.length) : 0,
      avgPendingAge: pendingAges.length ? Math.round(pendingAges.reduce((a,b)=>a+b,0)/pendingAges.length) : 0,
      maxPendingAge: pendingAges.length ? Math.max(...pendingAges) : 0,
    };
  }, [filtered]);

  const pendingBuckets = useMemo(() => {
    const buckets = { "0–7": 0, "8–30": 0, "31–90": 0, "90+": 0 };
    filtered.filter(i => !i.actionTaken).forEach(i => {
      const d = i.ageDays ?? 0;
      if (d <= 7) buckets["0–7"]++;
      else if (d <= 30) buckets["8–30"]++;
      else if (d <= 90) buckets["31–90"]++;
      else buckets["90+"]++;
    });
    return buckets;
  }, [filtered]);

  const areaMetrics = useMemo(() => {
    const map = new Map();
    filtered.forEach(i => {
      const id = i.area_id ?? "(unknown)";
      const cur = map.get(id) || { id, label: i.unit_name || `Area ${id}`, total: 0, actioned: 0, closed: 0, pending: 0, pendingAgeSum: 0 };
      cur.total++;
      if (i.actionTaken) cur.actioned++;
      if (i.isClosed) cur.closed++;
      if (!i.actionTaken) {
        cur.pending++;
        cur.pendingAgeSum += (i.ageDays || 0);
      }
      map.set(id, cur);
    });

    return Array.from(map.values()).map(a => ({
      ...a,
      avgPendingAge: a.pending ? Math.round(a.pendingAgeSum / a.pending) : 0,
    })).sort((x,y) => y.pending - x.pending || y.total - x.total).slice(0, 50);
  }, [filtered]);

  const oldestPending = useMemo(() => {
    return filtered
      .filter(i => !i.actionTaken && typeof i.ageDays === "number")
      .sort((a,b) => (b.ageDays || 0) - (a.ageDays || 0))
      .slice(0, 10);
  }, [filtered]);

  /* ----------------- Aggregated (unfiltered) ----------------- */
  const aggregatedGroupBy = "month";
  const aggregatedGroupedData = useMemo(() => {
    const map = new Map();
    (items || []).forEach(r => {
      if (!r.incidentIso && !r.createdAt) return;
      const iso = r.incidentIso || r.createdAt;
      const key = groupKeyFromDate(iso, aggregatedGroupBy);
      const entry = map.get(key) || { labelKey: key, responses: 0, actions: 0 };
      entry.responses += 1;
      if (r.actionTaken) entry.actions += 1;
      map.set(key, entry);
    });

    const arr = Array.from(map.values()).sort((a,b) => {
      try {
        if (aggregatedGroupBy === "day") return new Date(a.labelKey) - new Date(b.labelKey);
        if (aggregatedGroupBy === "month") {
          const [ay, am] = a.labelKey.split("-").map(Number);
          const [by, bm] = b.labelKey.split("-").map(Number);
          return new Date(ay, am-1) - new Date(by, bm-1);
        }
        if (aggregatedGroupBy === "year") return Number(a.labelKey) - Number(b.labelKey);
        if (aggregatedGroupBy === "week") {
          const [ay, aw] = a.labelKey.split("-W").map(Number);
          const [by, bw] = b.labelKey.split("-W").map(Number);
          if (ay !== by) return ay - by;
          return aw - bw;
        }
        return 0;
      } catch {
        return 0;
      }
    });

    return arr;
  }, [items]);

  const aggregatedTotalAll = items.length;
  const aggregatedTotalActioned = (items || []).filter(i => i.actionTaken).length;
  const aggregatedTotalPending = aggregatedTotalAll - aggregatedTotalActioned;
  const aggregatedTotalClosed = (items || []).filter(i => i.isClosed).length;
  const aggregatedTotalOpen = aggregatedTotalAll - aggregatedTotalClosed;

  const chartDataByDate = useMemo(() => {
    return aggregatedGroupedData.map(g => ({
      label: shortLabelFromKey(g.labelKey, aggregatedGroupBy),
      responses: g.responses || 0,
      actions: g.actions || 0,
    }));
  }, [aggregatedGroupedData]);

  const simpleChartWidth = Math.max(640, Math.min(1400, (chartDataByDate.length || 10) * 28));

  /* ---------- UI handlers ---------- */
  function clearFilters() {
    setAreaFilter("");
    setEmpFilter("");
    setFromDate("");
    setToDate("");
    setFyFilter("");
    setPendingMoreThan(0);
    toast.success("Cleared chart filters");
  }

  /* ---------- Render ---------- */
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold" style={{ color: PALETTE.text }}>Action Reports</h3>
        <div className="text-sm" style={{ color: PALETTE.muted }}>{aggLoading ? "Aggregating..." : `Total complaints (raw): ${items.length}`}</div>
      </div>

      {/* Charts at top (aggregated) - UNFILTERED */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Responses vs Actions (aggregated by date)</div>
            <div className="text-xs text-gray-500">{aggLoading ? "Loading aggregated data..." : `Total: ${aggregatedTotalAll}`}</div>
          </div>
          <div className="w-full overflow-x-auto">
            <SimpleBarChart data={chartDataByDate} width={simpleChartWidth} height={240} maxBars={60} maxLabels={10} />
          </div>
        </div>

        <div className="lg:col-span-1 bg-white border rounded-lg p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <div className="text-sm font-medium mb-2">Actioned / Pending (aggregated)</div>
              <div className="flex items-center justify-center">
                <DonutChart valueMap={{ Actioned: aggregatedTotalActioned, Pending: aggregatedTotalPending }} size={140} colors={[PALETTE.primary, PALETTE.accent, PALETTE.warn]} />
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Completion (Closed / Open)</div>
              <div className="flex items-center justify-center">
                <DonutChart valueMap={{ Closed: aggregatedTotalClosed, Open: aggregatedTotalOpen }} size={140} colors={[PALETTE.primary, PALETTE.accent, PALETTE.warn]} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border" style={{ borderColor: PALETTE.subtleBorder, boxShadow: PALETTE.shadow }}>
        <div className="p-4 grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Group by</label>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="mt-1 w-full border rounded px-3 py-2 text-sm">
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Area</label>
            <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} className="mt-1 w-full border rounded px-3 py-2 text-sm">
              <option value="">All areas</option>
              {publicAreas.map(a => <option key={a.id} value={a.id}>{a.name ?? a.label ?? a.title ?? `Area ${a.id}`}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Employment Type</label>
            <select value={empFilter} onChange={(e) => setEmpFilter(e.target.value)} className="mt-1 w-full border rounded px-3 py-2 text-sm">
              <option value="">All types</option>
              {publicEmployTypes.map(ei => <option key={ei.id} value={ei.id}>{ei.name ?? ei.label ?? ei.title ?? `Type ${ei.id}`}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mt-1 w-full border rounded px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="mt-1 w-full border rounded px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Financial Year</label>
            <select value={fyFilter} onChange={(e) => setFyFilter(e.target.value)} className="mt-1 w-full border rounded px-3 py-2 text-sm">
              <option value="">All FY</option>
              {fyOptions.map(fy => <option key={fy} value={fy}>{fy}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Pending &gt; N days</label>
            <input type="number" min={0} value={pendingMoreThan} onChange={(e) => setPendingMoreThan(Math.max(0, Number(e.target.value || 0)))} className="mt-1 w-full border rounded px-3 py-2 text-sm" />
          </div>

          <div className="flex items-end gap-2 col-span-2">
            <button onClick={() => { setAggLoading(true); setTimeout(() => setAggLoading(false), 200); toast.success("Applied chart filters"); }} className="px-4 py-2 bg-indigo-600 text-white rounded">Apply</button>
            <button onClick={() => clearFilters()} className="px-4 py-2 border rounded">Reset</button>
            <button onClick={async () => { await fetchPublicMasters(); await fetchAll(); }} className="px-4 py-2 border rounded">Refresh data</button>
          </div>
        </div>
      </div>

      {/* KPI STRIP */}
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

      {/* Main charts + KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-lg border p-4" style={{ borderColor: PALETTE.subtleBorder, boxShadow: PALETTE.shadow }}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium" style={{ color: PALETTE.text }}>Responses vs Actions ({groupBy})</div>
            <div className="text-xs" style={{ color: PALETTE.muted }}>Showing {groupedData.length} buckets</div>
          </div>

          <div className="w-full overflow-x-auto">
            <div style={{ minWidth: 640 }}>
              <GroupedBarChart data={groupedData} width={Math.max(640, Math.min(1400, groupedData.length * 30))} height={340} groupBy={groupBy} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 bg-white rounded border" style={{ borderColor: PALETTE.subtleBorder }}>
              <div className="text-sm font-medium mb-2">Actioned / Pending</div>
              <div className="flex items-center justify-center">
                <DonutChart valueMap={{ Actioned: totalActioned, Pending: totalPending }} size={140} colors={[PALETTE.primary, PALETTE.accent, PALETTE.warn]} />
              </div>
            </div>

            <div className="p-3 bg-white rounded border" style={{ borderColor: PALETTE.subtleBorder }}>
              <div className="text-sm font-medium mb-2">Pending Age Buckets</div>
              <div className="flex items-center justify-center">
                <DonutChart valueMap={pendingBuckets} size={140} colors={[PALETTE.primary, PALETTE.accent, PALETTE.warn, PALETTE.danger]} />
              </div>
            </div>

            <div className="p-3 bg-white rounded border" style={{ borderColor: PALETTE.subtleBorder }}>
              <div className="text-sm font-medium mb-2">Avg / Oldest pending</div>
              <div className="text-xl font-semibold" style={{ color: PALETTE.primary }}>{ageing.avgPendingAge}d</div>
              <div className="text-xs text-gray-500 mt-1">Avg pending age (shown)</div>
              <div className="text-sm mt-2">Oldest: <strong>{ageing.maxPendingAge}d</strong></div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-lg border p-3" style={{ borderColor: PALETTE.subtleBorder, boxShadow: PALETTE.shadow }}>
            <div className="text-sm font-medium mb-2">Top Areas (by shown pending)</div>
            <HorizontalTopBars items={topAreas} maxItems={6} />
          </div>

          <div className="bg-white rounded-lg border p-3" style={{ borderColor: PALETTE.subtleBorder }}>
            <div className="text-sm font-medium mb-2">Quick totals</div>
            <div className="text-sm text-gray-700"><strong>Total shown:</strong> {totalAll}</div>
            <div className="text-sm text-gray-700"><strong>Actioned:</strong> {totalActioned}</div>
            <div className="text-sm text-gray-700"><strong>Pending:</strong> {totalPending}</div>
            <div className="mt-2 text-xs text-gray-500">Filters above control chart contents. Use Group by to change resolution (Month for large datasets).</div>
          </div>
        </div>
      </div>

      {/* Area accountability panel */}
      <div className="bg-white rounded-lg border p-4" style={{ borderColor: PALETTE.subtleBorder }}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-medium">Area-wise Accountability</div>
          <div className="text-xs text-gray-500">Showing top 50 areas by pending</div>
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
                <tr key={a.id} className="border-t">
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

      {/* Top oldest pending complaints */}
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
                </tr>
              ))}
              {oldestPending.length === 0 && <tr><td className="py-4 text-gray-500" colSpan={6}>No pending complaints for selected filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {error && <div className="text-red-600">{error}</div>}
      <div className="text-xs text-gray-500">Tip: For very large datasets, server-side filter endpoints are recommended — I can wire them into this panel if you'd like.</div>
    </div>
  );
}
