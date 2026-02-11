// src/components/ResponsesTable.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

/**
 * ResponsesTable
 *
 * Props:
 *  - responses: array of row objects (should be normalized by parent; fallback checks are present)
 *  - onNotifySafety(row) -> may return a promise. If resolved with activity data, we merge it.
 *  - onAssign(row)
 *  - onReassign(row)
 *  - onComplete(row)
 *  - role: "safety" | "nodal" | other
 *  - nodalOfficersApi (optional)
 *  - assignApiBase (optional)  // base for /api/hq/complaints
 */

const FILE_BASE = "/storage/";
const DEFAULT_NODAL_API = "/api/hq/users/options?role=AREA_NODAL";
const DEFAULT_ASSIGN_BASE = "/api/hq/complaints";
const PUBLIC_AREAS = "/api/public/areas";
const PUBLIC_EMPLOY = "/api/public/employment-types";
const PUBLIC_OBSERVE = "/api/public/observance-types";
const PUBLIC_REPORT_STATUSES = "/api/public/report-statuses";
const HQ_USERS_API = "/api/hq/users";


function getAuthToken() {
  return localStorage.getItem("ecl_token") || localStorage.getItem("auth_token") || null;
}

function getCurrentUser() {
  try {
    const raw = localStorage.getItem("ecl_user") || localStorage.getItem("user");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function shouldFetchNodals(roleProp) {
  if (roleProp === "safety") return true;
  const user = getCurrentUser();
  if (!user || !user.role) return false;
  const r = String(user.role).toUpperCase();
  return r === "SUPERADMIN" || r === "HQ_NODAL";
}


export default function ResponsesTable({
  responses = [],
  onNotifySafety,
  onAssign, // used for initial assignments
  onReassign, // when HQ wants to reassign after nodal action
  onComplete, // when HQ wants to mark as complete/close
  role,
  nodalOfficersApi = DEFAULT_NODAL_API,
  assignApiBase = DEFAULT_ASSIGN_BASE,
}) {
  // local copy of responses so we can optimistically update rows
  const [localResponses, setLocalResponses] = useState(Array.isArray(responses) ? responses.slice() : []);
  useEffect(() => {
    setLocalResponses(Array.isArray(responses) ? responses.slice() : []);
  }, [responses]);

  const objectUrlCacheRef = useRef(new Map()); // cache object URLs for File objects

  const [selected, setSelected] = useState(null);
  const [selectedLoading, setSelectedLoading] = useState(false);

  // Internal assign modal state
  const [internalAssignOpen, setInternalAssignOpen] = useState(false);
  const [assignRow, setAssignRow] = useState(null);

  // Assign extras: instructions and files (for safety/hq)
  const [assignInstructions, setAssignInstructions] = useState("");
  const [assignFiles, setAssignFiles] = useState([]); // File objects

  // lookup caches
  const [areasMap, setAreasMap] = useState(new Map());
  const [employmentMap, setEmploymentMap] = useState(new Map());
  const [observanceMap, setObservanceMap] = useState(new Map());
  const [reportStatusMap, setReportStatusMap] = useState(new Map());
  const [hqUsersMap, setHqUsersMap] = useState(new Map());
  const [hqUsersLoaded, setHqUsersLoaded] = useState(false);

  // nodal cache & loading
  const [nodalMap, setNodalMap] = useState(new Map());
  const [allNodals, setAllNodals] = useState([]);
  const [loadingNodals, setLoadingNodals] = useState(false);
  const [selectedNodalId, setSelectedNodalId] = useState("");
  const [assignAll, setAssignAll] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Confirm-close modal state and per-row disable state
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [confirmRow, setConfirmRow] = useState(null);
  // per-row disabled sets
  const [disabledCloseIds, setDisabledCloseIds] = useState(new Set());
  const [confirmReassignOpen, setConfirmReassignOpen] = useState(false);
  const [confirmReassignRow, setConfirmReassignRow] = useState(null);
  const [disabledReassignIds, setDisabledReassignIds] = useState(new Set());

  // Assign confirm (summary-before-submit) modal
  const [confirmAssignOpen, setConfirmAssignOpen] = useState(false);
  const [pendingAssignPayload, setPendingAssignPayload] = useState(null); // { row, assignedLabel, payload }

  // Action Taken modal (shown to HQ when they click Close) - allows text up to 5000 chars and attachments
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionRow, setActionRow] = useState(null);
  const [actionText, setActionText] = useState("");
  const [actionFiles, setActionFiles] = useState([]);
  const [actionSubmitting, setActionSubmitting] = useState(false);

  // Reassign extras (instructions + files)
  const [reassignInstructions, setReassignInstructions] = useState("");
  const [reassignFiles, setReassignFiles] = useState([]);

  // notify pending set to avoid freezing state if user cancels
  const [notifyPendingIds, setNotifyPendingIds] = useState(new Set());

  // --- helper: fetch lookups once on mount ---
  useEffect(() => {
    let mounted = true;
    async function fetchLookup(url, mapSetter, keyField = "id", labelField = "name") {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const json = await res.json().catch(() => []);
        if (!Array.isArray(json)) return;
        const m = new Map();
        json.forEach((it) => {
          m.set(it[keyField], it[labelField] ?? it.name ?? it.label ?? String(it[keyField]));
        });
        if (mounted) mapSetter(m);
      } catch (err) {
        console.warn("lookup fetch failed:", url, err);
      }
    }
    fetchLookup(PUBLIC_AREAS, setAreasMap, "id", "name");
    fetchLookup(PUBLIC_EMPLOY, setEmploymentMap, "id", "label");
    fetchLookup(PUBLIC_OBSERVE, setObservanceMap, "id", "label");
    fetchLookup(PUBLIC_REPORT_STATUSES, setReportStatusMap, "id", "label");
    return () => { mounted = false; };
  }, []);

  // --- fetch HQ users once (GLOBAL user id -> name resolver) ---
useEffect(() => {
  let mounted = true;

  async function fetchHqUsers() {
    try {
      const token = getAuthToken();
      const res = await fetch(HQ_USERS_API, {
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        console.warn("Failed to fetch HQ users:", res.status);
        return;
      }

      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];

      const map = new Map();
      list.forEach(u => {
        if (u?.id != null) {
          map.set(String(u.id), {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            areaid: u.areaid,
          });
        }
      });

      if (mounted) {
        setHqUsersMap(map);
        setHqUsersLoaded(true);
      }
    } catch (e) {
      console.warn("fetchHqUsers error:", e);
    }
  }

  fetchHqUsers();
  return () => { mounted = false; };
}, []);

  async function fetchNodalsForArea(areaId = null) {
    if (!shouldFetchNodals(role)) return [];
    const token = getAuthToken();
    const url = areaId ? `${nodalOfficersApi}&areaid=${encodeURIComponent(areaId)}` : nodalOfficersApi;
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

  // load all nodals on mount (keeps the original behaviour)
  useEffect(() => {
    let mounted = true;
    if (!shouldFetchNodals(role)) {
      setAllNodals([]);
      setNodalMap(new Map());
      return () => { mounted = false; };
    }
    (async () => {
      setLoadingNodals(true);
      try {
        const list = await fetchNodalsForArea(null);
        if (!mounted) return;
        setAllNodals(Array.isArray(list) ? list : []);
        const map = new Map();
        (Array.isArray(list) ? list : []).forEach(u => {
          const area = String(u.area_id ?? "unknown");
          const cur = map.get(area) || [];
          cur.push(u);
          map.set(area, cur);
        });
        if (mounted) setNodalMap(map);
      } finally {
        if (mounted) setLoadingNodals(false);
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodalOfficersApi, role]);

  // ======= ATTACHMENT / NORMALIZATION HELPERS =======

  // safe normalization for mixed shapes (string, json-string, array, object map)
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
      // if it's an object with numeric keys or a map of attachments
      return Object.values(val).filter(Boolean);
    }
    return [];
  }

  // returns a usable href for a given attachment entry
  function getAttachmentUrl(entry) {
    if (!entry) return null;

    // File object (browser) -> create object URL (cached)
    if (typeof window !== "undefined" && typeof File !== "undefined" && entry instanceof File) {
      const cache = objectUrlCacheRef.current;
      if (cache.has(entry)) return cache.get(entry);
      try {
        const url = URL.createObjectURL(entry);
        cache.set(entry, url);
        return url;
      } catch {
        return null;
      }
    }

    // Some uploads may be a plain object but represent an uploaded file (has .name)
    if (entry && typeof entry === "object" && entry.name && (entry.size || entry.type)) {
      const cache = objectUrlCacheRef.current;
      if (cache.has(entry)) return cache.get(entry);
      try {
        // Note: entry here may not be a real File (but often it is). Try createObjectURL defensively.
        const url = URL.createObjectURL(entry);
        cache.set(entry, url);
        return url;
      } catch {
        // fall through to other fields
      }
    }

    // if entry is a string path or full URL
    if (typeof entry === "string") {
      if (entry.startsWith("http://") || entry.startsWith("https://")) return entry;
      // strip leading slashes
      const p = entry.replace(/^\/+/, "");
      return FILE_BASE + p;
    }
    // if entry is an object
    if (typeof entry === "object") {
      // common keys: path, original_name, originalname, url, file
      const path = entry.path ?? entry.path_name ?? entry.file ?? entry.url ?? entry.original_name ?? entry.originalname ?? entry.uri ?? null;
      if (!path) return null;
      if (typeof path === "string") {
        if (path.startsWith("http://") || path.startsWith("https://")) return path;
        const p = path.replace(/^\/+/, "");
        return FILE_BASE + p;
      }
    }
    return null;
  }

  // produce a short label for an attachment entry (string or object)
  function getAttachmentLabel(entry, idx = 0) {
    if (!entry) return `Attachment ${idx + 1}`;
    if (typeof entry === "string") return entry.split("/").pop() || entry;
    if (typeof entry === "object") {
      // handle File objects
      if (entry.name) return entry.name;
      return entry.original_name ?? entry.originalname ?? (entry.path ? (entry.path.split("/").pop() || entry.path) : `Attachment ${idx + 1}`);
    }
    return `Attachment ${idx + 1}`;
  }

  // helper: gather top-level attachments for view (accept many server shapes)
  function getTopLevelAttachments(item) {
    if (!item) return [];
    // include many server-side variations so attachments added on assign/reassign are discovered
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
      item.raw?.assign_files,
      item.raw?.assigned_files,
      item.raw?.assign_attachments,
      item.raw?.assignments,
      item.raw?.assignment_documents,
      item.raw?.assigned_documents,
      item.raw?.instructions_files,
      item.raw?.instructions_attachments,
      item.raw?.assign_docs,
      item.assign_files,
      item.assigned_files,
      item.assign_attachments,
      item.assignments,
      item.assignment_documents,
      item.assigned_documents,
    ];
    for (const c of candidates) {
      const arr = normalizeAttachments(c);
      if (arr && arr.length) return arr;
    }
    if (item.raw && typeof item.raw === "object") {
      const keys = Object.keys(item.raw || {});
      for (const k of keys) {
        if (/assign|assigned|instruction|attach|file|photo|doc|path/i.test(k)) {
          const arr = normalizeAttachments(item.raw[k]);
          if (arr && arr.length) return arr;
        }
      }
    }
    // also fallback to scanning activities for attachments
    const acts = item.activities ?? item.raw?.activities ?? item.raw?.activity ?? [];
    if (Array.isArray(acts) && acts.length) {
      for (const a of acts) {
        const arr = normalizeAttachments(a.attachments ?? a.files ?? a.activity_attachments ?? a.activityFiles ?? []);
        if (arr && arr.length) return arr;
      }
    }

    return [];
  }

  // ======= ROW / ASSIGN helpers =======

  // small helper to update a row in localResponses by id
  function updateLocalRow(id, updates) {
    setLocalResponses(prev => prev.map(r => (r.id === id ? { ...r, ...updates } : r)));
  }

  // small helper to consistently detect assigned state
  function isAssigned(row) {
    if (!row) return false;
    const raw = row.raw || {};
    const ws = (row.workflowstatus || raw.workflowstatus || "").toString().toUpperCase();
    const statusAssigned = ws === "ASSIGNED_TO_AREA" || ws === "HQ_REVIEW" || ws === "BACK_TO_AREA";
    return Boolean(
      row.isAssigned ||
      row.assignedTo ||
      row.assignedBy ||
      raw.assignedto ||
      raw.assigned_to ||
      raw.assignedby ||
      raw.assigned_to_user ||
      raw.assigned_to_id ||
      raw.assigned_by ||
      statusAssigned
    );
  }

  // ======= ACTIVITY / ACTION NORMALIZATION =======

  // parse date safely into timestamp
  function parseTimeToMs(t) {
    if (!t) return 0;
    const d = new Date(t);
    const ms = Number(d && d.getTime && d.getTime());
    return Number.isFinite(ms) ? ms : 0;
  }

  // Normalize a single activity object to predictable keys
  function normalizeActivity(act = {}) {
    const attachmentsRaw = act.attachments ?? act.files ?? act.activity_attachments ?? act.activityFiles ?? act.attachments_map ?? act.assign_attachments ?? act.assign_files ?? [];
    const attachments = Array.isArray(attachmentsRaw) ? attachmentsRaw : normalizeAttachments(attachmentsRaw);

    const created = act.createdat ?? act.created_at ?? act.createdAt ?? act.created ?? act.timestamp ?? act.time ?? null;

    return {
      id: act.id ?? act.activity_id ?? act.activityId ?? null,
      actorid: act.actorid ?? act.actorId ?? act.performed_by ?? act.actor_id ?? act.nodal_id ?? null,
      actortype: act.actortype ?? act.actor_type ?? act.actor ?? (act.actorid ? (String(act.actorid).startsWith("HQ") ? "HQ" : "AREA") : null),
      activitytype: act.activitytype ?? act.activity_type ?? act.type ?? act.type_name ?? act.activitytype_name ?? null,
      description: act.description ?? act.desc ?? act.note ?? act.remarks ?? act.text ?? act.description_text ?? "",
      createdat: created,
      createdTs: parseTimeToMs(created),
      attachments: attachments,
      raw: act,
    };
  }

  // ensure array of activities sorted newest-first
  function normalizeAndSortActivities(arr) {
    if (!Array.isArray(arr)) return [];
    const normalized = arr.map(a => normalizeActivity(a));
    normalized.sort((a, b) => (b.createdTs || 0) - (a.createdTs || 0));
    return normalized;
  }

  // get a display label for a user id using nodal caches (falls back to "User <id>")

  function extractAssignedFromActivities(raw) {
  if (!raw || !Array.isArray(raw.activities)) return null;

  for (const a of raw.activities) {
    const text =
      a?.text ??
      a?.description ??
      a?.remarks ??
      "";

    if (!text) continue;

    // match: "Assigned to area officer user_id=10"
    const id = extractUserId(text);
    if (id) return id;
  }
  return null;
}

  function extractUserId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return String(value);

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return trimmed;

    const match = trimmed.match(/(?:user[_\s-]*id|id)\s*[:=]?\s*(\d+)/i);
    if (match && match[1]) return match[1];
  }
  return null;
}

  function getUserLabel(id) {
    if (id === null || id === undefined) return null;
    const s = String(id);
    // check allNodals
    const found = (allNodals || []).find(u => String(u.id) === s);
    if (found) return `${found.name || found.username || found.email || `User ${found.id}`} (id:${found.id})`;
    // also check nodalMap values
    for (const arr of nodalMap.values()) {
      const f = (arr || []).find(u => String(u.id) === s);
      if (f) return `${f.name || f.username || f.email || `User ${f.id}`} (id:${f.id})`;
    }
    // fallback: maybe the server provided a display name already in some shape
    return `User ${id}`;
  }

  // Helper to extract nodal actions from various server shapes (returns normalized & sorted)
  function extractNodalActions(raw, row = null) {
    if (!raw && !row) return [];
    const direct = raw?.nodal_actions ?? raw?.nodalActions ?? raw?.nodal_notes ?? raw?.nodalNotes;
    if (Array.isArray(direct) && direct.length) return normalizeAndSortActivities(direct);

    // Activities style (your example): filter actortype === "AREA"
    const acts = raw?.activities ?? raw?.activity ?? raw?.actions ?? raw?.history ?? raw?.activities_map ?? raw?.activity_history ?? [];
    if (Array.isArray(acts) && acts.length) {
      const nodal = acts.filter(a => {
        const t = (a.actortype ?? a.actor_type ?? a.actorType ?? "").toString().toUpperCase();
        if (t === "AREA") return true;
        const activityType = String(a.activitytype ?? a.activity_type ?? a.type ?? "").toUpperCase();
        if (activityType.includes("AREA") || activityType.includes("RESOLUTION") || activityType.includes("AREA_SUBMIT")) return true;
        // If actorid matches assignedto, treat as area
        if (a.actorid && raw?.assignedto && String(a.actorid) === String(raw.assignedto)) return true;
        return false;
      });
      if (nodal.length) return normalizeAndSortActivities(nodal);
    }

    // Fallback: single actionTaken on row
    if (row?.actionTaken) {
      const synthetic = {
        id: `local-${Date.now()}`,
        actorid: getCurrentUser()?.id ?? null,
        actortype: "AREA",
        activitytype: "AREA_SUBMIT_RESOLUTION",
        description: row.actionTaken.text ?? row.actionTaken.remarks ?? row.actionTaken.description ?? "",
        createdat: new Date().toISOString(),
        createdTs: Date.now(),
        attachments: row.actionTaken.attachments ?? row.actionTaken.files ?? [],
        raw: row.actionTaken,
      };
      return [synthetic];
    }

    // action_taken top-level
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
      return [synthetic];
    }

    return [];
  }

  // Helper to render a single action entry (works for both nodal and HQ actions)
  function renderActionEntry(a, idx) {
    // 'a' here should be normalized activity (see normalizeActivity/normalizeAndSortActivities)
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
    if (!actor && a.actorid) {
      actor = getUserLabel(a.actorid);
    }
    if (!actor) actor = a.actortype ?? "Officer";

    const created = a.createdat ?? a.createdAt ?? a.created ?? null;
    const when = created ? (new Date(created).toLocaleString ? new Date(created).toLocaleString() : String(created)) : null;
    const remarks = a.description ?? a.raw?.remarks ?? a.raw?.note ?? a.raw?.text ?? "";

    // attachments may be array or string or object entries — keep them as provided but build URLs
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

        {attCandidates && attCandidates.length > 0 && (
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
                    onClick={(ev) => {
                      // if no url, prevent jump
                      if (!url) ev.preventDefault();
                    }}
                  >
                    {label}
                  </a>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 border rounded">
                      Open
                    </a>
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

  // ======= DETAILS / VIEW FLOW (fetch detail when clicking View) =======

  async function openDetails(r) {
    if (!r) return;
    setSelectedLoading(true);
    setSelected(null);
    try {
      const token = getAuthToken();
      const url = `${assignApiBase}/${r.id}`;
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(url, { method: "GET", headers });
      if (!res.ok) {
        setSelected(mapDetailFields(r));
        toast.error("Failed to fetch full details — showing list data.");
        setSelectedLoading(false);
        return;
      }
      const json = await res.json().catch(() => null);
      if (!json) {
        setSelected(mapDetailFields(r));
        toast.error("Failed to parse details response — showing list data.");
        setSelectedLoading(false);
        return;
      }
      setSelected(mapDetailFields(json));
    } catch (err) {
      console.error("openDetails error:", err);
      setSelected(mapDetailFields(r));
      toast.error("Failed to fetch details — showing list data.");
    } finally {
      setSelectedLoading(false);
    }
  }
  function closeDetails() { setSelected(null); }

  // map backend detail object to a shape we render in modal, using lookup maps
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

    // --- NEW: derive submittedBy label + id + name from many possible server shapes ---
    const reporterId = raw.user_id ?? raw.userId ?? raw.reporter_id ?? raw.reporterId ?? raw.submitted_by_id ?? raw.submitted_by ?? raw.created_by ?? raw.created_by_id ?? null;
    let reporterName = null;
    // prefer explicit name fields
    if (raw.user_name || raw.reporter_name || raw.submitted_by_name || raw.reported_by_name) {
      reporterName = raw.user_name ?? raw.reporter_name ?? raw.submitted_by_name ?? raw.reported_by_name;
    } else if (raw.first_name || raw.firstName || raw.last_name || raw.lastName) {
      const fn = raw.first_name ?? raw.firstName ?? "";
      const ln = raw.last_name ?? raw.lastName ?? "";
      reporterName = `${fn} ${ln}`.trim();
      if (!reporterName) reporterName = null;
    } else if (raw.name || raw.full_name || raw.fullName) {
      reporterName = raw.name ?? raw.full_name ?? raw.fullName;
    } else if (raw.user && typeof raw.user === "object") {
      reporterName = raw.user.name ?? raw.user.full_name ?? raw.user.username ?? null;
    }

    let submittedByLabel = null;
    if (reporterName && reporterId) {
      submittedByLabel = `${reporterName} (id:${reporterId})`;
    } else if (reporterName) {
      submittedByLabel = reporterName;
    } else if (reporterId) {
      // attempt to resolve via nodals cache (if available) else fallback to "User <id>"
      submittedByLabel = getUserLabel(reporterId);
    } else {
      submittedByLabel = raw.submittedBy ?? raw.submitted_by ?? raw.reporter ?? raw.reported_by ?? null;
    }
    // also expose separate fields for convenience later
    const submittedById = reporterId ?? null;
    const submittedByName = reporterName ?? null;
    // --- END submittedBy derivation ---

    // attachments (top-level): try many shapes (including assign/reassign fields)
    let attachments = [];
    if (Array.isArray(raw.attachments)) {
      attachments = raw.attachments.map(a => a.path ?? a.original_name ?? a.originalname ?? a);
    } else if (raw.attachment_path) {
      attachments = [raw.attachment_path];
    } else if (raw.raw && Array.isArray(raw.raw.attachments)) {
      attachments = raw.raw.attachments.map(a => a.path ?? a.original_name ?? a.originalname ?? a);
    } else {
      // this helper scans many backend keys (including assign/assign_files)
      attachments = getTopLevelAttachments(rawDetail);
    }

    // activities - prefer server 'activities' or fallback to other arrays
    const activitiesRaw = Array.isArray(raw.activities) ? raw.activities
      : Array.isArray(raw.activity) ? raw.activity
      : Array.isArray(raw.actions) ? raw.actions
      : Array.isArray(raw.action_history) ? raw.action_history
      : Array.isArray(raw.history) ? raw.history
      : [];

    const normalizedActivities = normalizeAndSortActivities(activitiesRaw);

    // actionTaken summary (explicit server fields)
    let actionTaken =
      raw.action ?? raw.actionTaken ?? raw.action_taken ?? raw.action_taken_object ?? rawDetail?.action ?? null;

    // Collect attachments **only** related to actionTaken / closing action:
    // IMPORTANT: we will NOT merge all activity attachments here. The user requested actionTaken attachments
    // must be only those added during the action taken (closing) step.
    let actionAttachments = [];

    // If explicit actionTaken present, normalize attachments from it (use only these)
    if (actionTaken) {
      actionAttachments = normalizeAttachments(actionTaken.attachments ?? actionTaken.files ?? actionTaken.activity_attachments ?? actionTaken.assign_attachments ?? actionTaken.assign_files ?? []);
    } else {
      // Try to find a HQ/closing activity in normalizedActivities to use as the actionTaken
      const hqAct = normalizedActivities.find(a => {
        const at = (a.actortype ?? a.raw?.actortype ?? "").toString().toUpperCase();
        const atype = (a.activitytype ?? a.raw?.activitytype ?? a.raw?.activity_type ?? "").toString().toUpperCase();
        if (at === "HQ") return true;
        if (atype.includes("CLOSE") || atype.includes("HQ") || atype.includes("CLOS")) return true;
        return false;
      });
      if (hqAct) {
        // Use only attachments on that HQ activity as the actionTaken attachments (do NOT merge other attachments)
        actionTaken = { text: hqAct.description, attachments: hqAct.attachments || [], raw: hqAct.raw };
        actionAttachments = Array.isArray(hqAct.attachments) ? hqAct.attachments : normalizeAttachments(hqAct.attachments);
      } else if (raw.action_taken) {
        // fallback to raw.action_taken
        const a = raw.action_taken;
        actionTaken = { text: a.text ?? a.description ?? a.remarks ?? a, attachments: a.attachments ?? a.files ?? [], raw: a };
        actionAttachments = normalizeAttachments(a.attachments ?? a.files ?? []);
      }
    }

    // Build finalActionTaken but ensure attachments are ONLY the actionAttachments (no merging with other activity attachments)
    const finalActionTaken = actionTaken ? {
      text: actionTaken.text ?? actionTaken.description ?? actionTaken.remarks ?? "",
      attachments: Array.isArray(actionAttachments) ? actionAttachments : normalizeAttachments(actionAttachments),
      raw: actionTaken.raw ?? actionTaken
    } : null;

    // ======= NEW: remove special-case "HQ at top" logic and dedupe activities =======
    // Keep newest-first order, but remove duplicate activities (by id or by createdTs+trimmed description+activitytype).
    const activitiesOrdered = (() => {
      const normalized = normalizedActivities; // newest-first already

      // dedupe
      const seenIds = new Set();
      const seenSigs = new Set();
      const out = [];

      for (const a of normalized) {
        const idStr = a.id ? String(a.id) : null;
        // create a signature fallback using timestamp + trimmed description + activitytype
        const ts = a.createdTs || parseTimeToMs(a.createdat) || 0;
        const descSnip = String((a.description || "").trim()).slice(0, 200);
        const typePart = String(a.activitytype || a.raw?.activitytype || "").toUpperCase().slice(0, 50);
        const sig = `${ts}::${typePart}::${descSnip}`;

        if (idStr) {
          if (seenIds.has(idStr)) continue;
          seenIds.add(idStr);
        } else {
          if (seenSigs.has(sig)) continue;
          seenSigs.add(sig);
        }
        out.push(a);
      }
      return out;
    })();

    // Lookups
    const areaName = areasMap.get(Number(areaId)) || raw.unit_name || raw.unitName || raw.area_name || raw.raw?.area_name || (areaId ? String(areaId) : "—");
    const employment = employmentMap.get(Number(raw.employment_type_id ?? raw.employmentTypeId)) || null;
    const observance = observanceMap.get(Number(raw.observance_type_id ?? raw.observanceTypeId)) || null;
    const reportedStatus = reportStatusMap.get(Number(raw.reported_status_id ?? raw.reportStatusId)) || null;

    // build friendly assigned labels (id -> name if possible)
    const assignedToId =
  extractUserId(
    raw.assignedto ??
    raw.assigned_to ??
    raw.assignedTo ??
    raw.assignedToName
  )
  ?? extractAssignedFromActivities(raw);


const assignedById = extractUserId(
  raw.assignedby ??
  raw.assigned_by ??
  raw.assignedBy
);

const assignedToLabel =
  raw.assigned_to_name || raw.assignedToName
    ? (raw.assigned_to_name || raw.assignedToName)
    : assignedToId
      ? getUserLabel(assignedToId)
      : "—";

const assignedByLabel =
  raw.assigned_by_name || raw.assignedByName
    ? (raw.assigned_by_name || raw.assignedByName)
    : assignedById
      ? getUserLabel(assignedById)
      : "—";


    return {
      ...rawDetail,
      id,
      title,
      trackingNumber,
      description,
      date,
      raw: rawDetail,
      assignedTo,
      assignedBy,
      assignedToLabel,
      assignedByLabel,
      workflowstatus,
      attachments,
      activities: activitiesOrdered, // newest-first, deduped
      actionTaken: finalActionTaken, // normalized actionTaken including only action attachments
      actionSummaryText: finalActionTaken?.text ?? null,
      actionAttachments: finalActionTaken?.attachments ?? [], // explicit array for UI convenience
      areaName,
      employment,
      observance,
      reportedStatus,
      // New submittedBy fields for view: includes name + (id) when available
      submittedBy: submittedByLabel,
      submittedById,
      submittedByName,
    };
  }

  // ======= NOTIFY FLOW (merge activity or synthetic activity) =======

  // helper to set notify pending per-row
  function setNotifyPending(id, val) {
    setNotifyPendingIds(prev => {
      const s = new Set(prev);
      if (val) s.add(id); else s.delete(id);
      return s;
    });
  }

  async function handleNotifyClick(e, row) {
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    if (!row) return;

    const ws = (row.workflowstatus || row.raw?.workflowstatus || "").toString().toUpperCase();
    const nodalHasActed = Boolean(
      row.nodalNotified ||
      // DO NOT rely on a pre-existing nodalLocked state to disable notify — only set it on success
      row.actionTaken ||
      (row.raw && Array.isArray(row.raw?.nodal_actions) && row.raw.nodal_actions.length > 0) ||
      row.isClosed ||
      ws === "CLOSED" ||
      ws === "HQ_REVIEW"
    );

    if (!isAssigned(row)) {
      toast.error("Complaint is not assigned to you (cannot notify safety).");
      return;
    }

    if (nodalHasActed) {
      toast.error("Action already recorded for this complaint (or complaint closed).");
      return;
    }

    if (typeof onNotifySafety !== "function") {
      console.warn("onNotifySafety missing");
      toast.error("Notify handler not available.");
      return;
    }

    // set pending so button is disabled while we wait
    setNotifyPending(row.id, true);

    try {
      const ret = onNotifySafety(row);
      if (ret && typeof ret.then === "function") {
        const pendingToastId = toast.loading("Notifying safety...");
        try {
          const result = await ret;
          toast.dismiss(pendingToastId);

          // If the handler resolved to a falsy value, treat it as a cancellation/no-op
          if (!result) {
            setNotifyPending(row.id, false);
            toast.dismiss(pendingToastId);
            toast.info("Notify cancelled.");
            return;
          }

          // determine activity to merge
          let activityToMerge = null;
          if (result) {
            if (result.activity) activityToMerge = result.activity;
            else if (Array.isArray(result.activities) && result.activities.length) activityToMerge = result.activities[0];
            else if (Array.isArray(result) && result.length) activityToMerge = result[0];
            else if (result.id || result.activitytype || result.description) activityToMerge = result;
          }

          if (activityToMerge) {
            const normalized = normalizeActivity(activityToMerge);
            setLocalResponses(curr => curr.map(r => {
              if (r.id === row.id) {
                const raw = r.raw || {};
                const existing = Array.isArray(raw.activities) ? raw.activities.slice() : (Array.isArray(r.activities) ? r.activities.slice() : []);
                existing.unshift(activityToMerge);
                return { ...r, raw: { ...raw, activities: existing }, activities: normalizeAndSortActivities(existing), nodalNotified: true, nodalLocked: true, workflowstatus: "HQ_REVIEW" };
              }
              return r;
            }));

            updateLocalRow(row.id, { nodalNotified: true, nodalLocked: true, workflowstatus: "HQ_REVIEW" });
            toast.success("Notified safety.");
          } else {
            // If no explicit activity returned, still don't treat as success unless result indicates it.
            // We treat absence as cancellation handled above. So this branch rarely runs.
            setNotifyPending(row.id, false);
            toast.info("No action recorded.");
          }
        } catch (err) {
          toast.dismiss(pendingToastId);
          console.error("onNotifySafety rejected:", err);
          toast.error("Notify failed — see console.");
          setNotifyPending(row.id, false);
        }
      } else {
        // synchronous handler
        // If handler returned falsy, treat as cancellation
        if (!ret) {
          setNotifyPending(row.id, false);
          toast.info("Notify cancelled.");
          return;
        }

        const synthetic = {
          id: `local-${Date.now()}`,
          actorid: getCurrentUser()?.id ?? null,
          actortype: "AREA",
          activitytype: "AREA_SUBMIT_RESOLUTION",
          description: row.actionTaken?.text ?? "Nodal resolution submitted",
          createdat: new Date().toISOString(),
          createdTs: Date.now(),
          attachments: row.actionTaken?.attachments ?? row.actionTaken?.files ?? [],
          raw: {}
        };
        setLocalResponses(curr => curr.map(r => {
          if (r.id === row.id) {
            const raw = r.raw || {};
            const existing = Array.isArray(raw.activities) ? raw.activities.slice() : (Array.isArray(r.activities) ? r.activities.slice() : []);
            existing.unshift(synthetic);
            return { ...r, raw: { ...raw, activities: existing }, activities: normalizeAndSortActivities(existing), nodalNotified: true, nodalLocked: true, workflowstatus: "HQ_REVIEW" };
          }
          return r;
        }));
        updateLocalRow(row.id, { nodalNotified: true, nodalLocked: true, workflowstatus: "HQ_REVIEW" });
        setNotifyPending(row.id, false);
        toast.success("Notified safety.");
      }
    } catch (err) {
      console.error("handleNotifyClick error:", err);
      toast.error("Failed to notify safety.");
      setNotifyPending(row.id, false);
    }
  }

  // ======= DECISION / ASSIGN flows (modified to accept text + files) =======
  // performDecision now can accept extraData: { note, files } - if files present, it uses FormData
  async function performDecision(row, decision, extraData = {}) {
    if (!row) return null;
    const token = getAuthToken();
    if (!token) {
      toast.error("Not authenticated — please login.");
      return null;
    }

    const url = `${assignApiBase}/${row.id}/decision`;
    const note = extraData.note ?? (
      decision === "CLOSE"
        ? "Closed after HQ review"
        : decision === "BACK_TO_AREA"
        ? "Please re-check documents and update action taken."
        : decision === "REOPEN"
        ? "Reopened by HQ"
        : ""
    );

    try {
      let res;
      if (extraData.files && extraData.files.length) {
        const fd = new FormData();
        fd.append("decision", decision);
        fd.append("note", note);
        extraData.files.forEach((f, i) => fd.append("attachments[]", f, f.name || `file${i}`));
        res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          body: fd,
        });
      } else {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          body: JSON.stringify({ decision, note }),
        });
      }

      const bodyText = await res.text().catch(() => null);

      if (!res.ok) {
        console.error("Decision API failed:", res.status, bodyText);
        toast.error(`Decision failed: ${res.status}`);
        return null;
      }

      let json = null;
      try {
        json = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        json = null;
      }

      // optimistic update of local UI
      if (decision === "CLOSE") {
        updateLocalRow(row.id, { workflowstatus: "CLOSED", isClosed: true, nodalNotified: false, isAssigned: false, nodalLocked: false });
        setDisabledReassignIds(prev => {
          const s = new Set(prev);
          s.add(row.id);
          return s;
        });
      } else if (decision === "BACK_TO_AREA") {
        const assignedLabel = row.assignedTo || row.raw?.assignedto || "Area nodals (all)";
        updateLocalRow(row.id, { workflowstatus: "BACK_TO_AREA", isClosed: false, nodalNotified: false, actionTaken: null, isAssigned: true, assignedTo: assignedLabel, nodalLocked: false });
        setDisabledReassignIds(prev => {
          const s = new Set(prev);
          s.delete(row.id);
          return s;
        });
      } else if (decision === "REOPEN") {
        updateLocalRow(row.id, { workflowstatus: "OPEN", isClosed: false, nodalNotified: false, isAssigned: false, nodalLocked: false });
        setDisabledReassignIds(prev => {
          const s = new Set(prev);
          s.delete(row.id);
          return s;
        });
      }

      toast.success(
        decision === "CLOSE" ? "Complaint closed." :
        decision === "BACK_TO_AREA" ? "Sent back to area nodal." :
        decision === "REOPEN" ? "Complaint reopened." : "Decision applied."
      );
      return json;
    } catch (err) {
      console.error("performDecision error:", err);
      toast.error("Failed to perform decision — see console.");
      return null;
    }
  }

  // Assign / Reassign flows (now fetch area-specific nodals when opening the modal)
  async function handleAssignClick(e, row) {
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    if (typeof onAssign === "function") {
      try { onAssign(row); } catch (err) { console.warn("onAssign threw:", err); }
      return;
    }
    const alreadyAssigned = isAssigned(row) || Boolean(row?.isClosed);
    if (alreadyAssigned) {
      toast("Already assigned");
      return;
    }

    // Reset assign UI state
    setAssignAll(false);
    setAssignInstructions("");
    setAssignFiles([]);
    setAssignRow(null);
    setSelectedNodalId("");
    setInternalAssignOpen(false);

    const areaId = String(row?.raw?.area_id ?? "unknown");

    // If allowed, fetch nodals for that area specifically (so Assign modal always shows per-area list)
    if (shouldFetchNodals(role)) {
      setLoadingNodals(true);
      try {
        const list = await fetchNodalsForArea(areaId);
        // update caches: nodalMap and allNodals
        setNodalMap(prevMap => {
          const copy = new Map(prevMap);
          copy.set(areaId, Array.isArray(list) ? list : []);
          return copy;
        });
        setAllNodals(prev => {
          const merged = Array.isArray(prev) ? prev.slice() : [];
          (Array.isArray(list) ? list : []).forEach(u => {
            if (!merged.find(x => String(x.id) === String(u.id))) merged.push(u);
          });
          return merged;
        });

        // prefer already-assigned nodal id if present on row (server shapes vary)
        const assignedIdCandidate = row?.raw?.assignedto ?? row?.raw?.assigned_to ?? row?.assignedTo ?? row?.assignedto;
        if (assignedIdCandidate && String(assignedIdCandidate).trim()) {
          setSelectedNodalId(String(assignedIdCandidate));
        } else if (Array.isArray(list) && list.length) {
          setSelectedNodalId(String(list[0].id));
        } else {
          // fallback: try to find a nodal in the generic allNodals for same area if any
          const fallback = (allNodals || []).find(u => String(u.area_id) === String(areaId));
          if (fallback) setSelectedNodalId(String(fallback.id));
          else setSelectedNodalId("");
        }
      } catch (err) {
        console.warn("handleAssignClick: fetch nodals failed", err);
        setSelectedNodalId(String(row?.raw?.assignedto ?? row?.assignedTo ?? "") || "");
      } finally {
        setLoadingNodals(false);
      }
    } else {
      // not allowed to fetch nodals: default to whatever assigned earlier if present
      setSelectedNodalId(String(row?.raw?.assignedto ?? row?.assignedTo ?? "") || "");
    }

    // finally open modal with the row
    setAssignRow(row);
    setInternalAssignOpen(true);
  }

  async function handleReassignClick(e, row) {
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    if (!row) return;
    if (row.isClosed) {
      toast.error("Cannot reassign a closed complaint.");
      return;
    }

    // Reset reassign UI state
    setAssignAll(false);
    setReassignInstructions("");
    setReassignFiles([]);
    setSelectedNodalId("");
    setConfirmReassignRow(null);
    setConfirmReassignOpen(false);

    const areaId = String(row?.raw?.area_id ?? "unknown");

    // Fetch area-specific nodals when opening reassign modal so the select is populated like Assign
    if (shouldFetchNodals(role)) {
      setLoadingNodals(true);
      try {
        const list = await fetchNodalsForArea(areaId);
        // update caches
        setNodalMap(prevMap => {
          const copy = new Map(prevMap);
          copy.set(areaId, Array.isArray(list) ? list : []);
          return copy;
        });
        setAllNodals(prev => {
          const merged = Array.isArray(prev) ? prev.slice() : [];
          (Array.isArray(list) ? list : []).forEach(u => {
            if (!merged.find(x => String(x.id) === String(u.id))) merged.push(u);
          });
          return merged;
        });

        // Prefer the previously-assigned nodal id if present on row (server may give raw.assignedto or assignedTo)
        const previouslyAssigned = row?.raw?.assignedto ?? row?.raw?.assigned_to ?? row?.assignedTo ?? row?.assignedto ?? null;
        if (previouslyAssigned && String(previouslyAssigned).trim()) {
          // If API returned nodals and one matches the previouslyAssigned, set it. If API returned none, still keep the previouslyAssigned as default per your request.
          const foundInList = Array.isArray(list) && list.find(u => String(u.id) === String(previouslyAssigned));
          if (foundInList) setSelectedNodalId(String(previouslyAssigned));
          else setSelectedNodalId(String(previouslyAssigned));
        } else if (Array.isArray(list) && list.length) {
          // no previously assigned id found -> pick first nodal for area
          setSelectedNodalId(String(list[0].id));
        } else {
          // API returned no nodals — keep selectedNodalId blank but we'll show the fallback UI (previously assigned label) in the modal
          setSelectedNodalId("");
        }
      } catch (err) {
        console.warn("handleReassignClick: fetch nodals failed", err);
        // if fetch failed, fallback to previously assigned id if any
        const previouslyAssigned = row?.raw?.assignedto ?? row?.raw?.assigned_to ?? row?.assignedTo ?? row?.assignedto ?? null;
        setSelectedNodalId(previouslyAssigned ? String(previouslyAssigned) : "");
      } finally {
        setLoadingNodals(false);
      }
    } else {
      // not allowed to fetch nodals -> default to previously assigned
      const previouslyAssigned = row?.raw?.assignedto ?? row?.raw?.assigned_to ?? row?.assignedTo ?? row?.assignedto ?? null;
      setSelectedNodalId(previouslyAssigned ? String(previouslyAssigned) : "");
    }

    setDisabledReassignIds(prev => {
      const s = new Set(prev);
      s.add(row.id);
      return s;
    });
    setConfirmReassignRow(row);
    setConfirmReassignOpen(true);
  }

  async function confirmProceedReassign() {
    const row = confirmReassignRow;
    if (!row) {
      setConfirmReassignOpen(false);
      return;
    }

    // If caller wants to handle reassign, pass all relevant info including assign_all/assignedto
    if (typeof onReassign === "function") {
      try {
        const payload = {
          instructions: reassignInstructions,
          files: reassignFiles,
          assign_all: assignAll,
          assignedto: assignAll ? undefined : (selectedNodalId ? Number(selectedNodalId) : undefined),
        };
        onReassign(row, payload);
        setConfirmReassignOpen(false);
        setConfirmReassignRow(null);
        return;
      } catch (err) {
        console.warn("onReassign threw:", err);
      }
    }

    // Default behaviour: call BACK_TO_AREA decision, then optionally call /assign to actually assign
    const decisionJson = await performDecision(row, "BACK_TO_AREA", { note: reassignInstructions, files: reassignFiles });
    if (!decisionJson) {
      setDisabledReassignIds(prev => {
        const s = new Set(prev);
        s.delete(row.id);
        return s;
      });
      setConfirmReassignOpen(false);
      setConfirmReassignRow(null);
      return;
    }

    // --- IMPORTANT CHANGE ---
    // Don't immediately prepend a synthetic BACK_TO_AREA activity.
    // If an assign step is requested and succeeds, we will prepend a single merged synthetic activity (BackToArea+Assign).
    // If no assign requested or assign fails, we'll prepend a single BACK_TO_AREA synthetic.

    let didAssign = false;
    let assignSuccess = false;
    let assignedLabel = null;

    if (assignAll || selectedNodalId) {
      didAssign = true;
      try {
        const token = getAuthToken();
        if (!token) {
          toast.error("Not authenticated — please login.");
          setDisabledReassignIds(prev => {
            const s = new Set(prev);
            s.delete(row.id);
            return s;
          });
          setConfirmReassignOpen(false);
          setConfirmReassignRow(null);
          return;
        }
        const url = `${assignApiBase}/${row.id}/assign`;
        const payload = assignAll ? { assign_all: true } : { assignedto: Number(selectedNodalId) };

        let res;
        if ((reassignInstructions && reassignInstructions.trim()) || (reassignFiles && reassignFiles.length)) {
          const fd = new FormData();
          Object.keys(payload).forEach(k => fd.append(k, payload[k]));
          if (reassignInstructions && reassignInstructions.trim()) fd.append("note", reassignInstructions.trim());
          reassignFiles.forEach((f, i) => fd.append("attachments[]", f, f.name || `file${i}`));
          res = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
            body: fd,
          });
        } else {
          res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });
        }

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          toast.error(`Assign failed: ${res.status} ${txt}`);
          assignSuccess = false;
        } else {
          assignSuccess = true;
          const json = await res.json().catch(() => null);
          assignedLabel = payload.assign_all ? "Area nodals (all)" : (() => {
            const list = nodalMap.get(String(row.raw?.area_id ?? "unknown")) || allNodals || [];
            const nod = list.find(n => String(n.id) === String(selectedNodalId));
            return nod ? (nod.name || nod.username || nod.email || `User ${nod.id}`) : String(selectedNodalId);
          })();

          updateLocalRow(row.id, { assignedTo: assignedLabel, isAssigned: true, workflowstatus: "ASSIGNED_TO_AREA", nodalLocked: false });

          // Instead of adding two separate synthetic activities (BACK_TO_AREA then ASSIGN),
          // we will add a single merged synthetic activity representing both.
          const mergedSynthetic = {
            id: `local-reassign-assign-${Date.now()}`,
            actorid: getCurrentUser()?.id ?? null,
            actortype: "HQ",
            activitytype: payload.assign_all ? "BACK_TO_AREA_ASSIGN_ALL" : "BACK_TO_AREA_ASSIGN",
            description: reassignInstructions || "Sent back to area and assigned",
            createdat: new Date().toISOString(),
            createdTs: Date.now(),
            attachments: reassignFiles || [],
            raw: {}
          };

          setLocalResponses(curr => curr.map(r => r.id === row.id ? { ...r, raw: { ...(r.raw || {}), activities: [mergedSynthetic, ...((r.raw && Array.isArray(r.raw.activities)) ? r.raw.activities : (Array.isArray(r.activities) ? r.activities : []))] }, activities: normalizeAndSortActivities([mergedSynthetic, ...((r.raw && Array.isArray(r.raw.activities)) ? r.raw.activities : (Array.isArray(r.activities) ? r.activities : []))]) } : r));

          if (typeof onReassign === "function") {
            try { onReassign(row, json); } catch (err) { /* ignore */ }
          }

          toast.success("Reassigned and assigned successfully.");
        }
      } catch (err) {
        console.error("Reassign-assign error:", err);
        toast.error("Reassign assign part failed — check console.");
      } finally {
        setDisabledReassignIds(prev => {
          const s = new Set(prev);
          s.add(row.id);
          return s;
        });
      }
    }

    // If no assign was requested, or assign was requested but failed, prepend a single BACK_TO_AREA synthetic
    if (!didAssign || (didAssign && !assignSuccess)) {
      const syntheticReassign = {
        id: `local-reassign-${Date.now()}`,
        actorid: getCurrentUser()?.id ?? null,
        actortype: "HQ",
        activitytype: "BACK_TO_AREA",
        description: reassignInstructions || "Sent back to area",
        createdat: new Date().toISOString(),
        createdTs: Date.now(),
        attachments: reassignFiles || [],
        raw: {}
      };
      setLocalResponses(curr => curr.map(r => r.id === row.id ? { ...r, raw: { ...(r.raw || {}), activities: [syntheticReassign, ...((r.raw && Array.isArray(r.raw.activities)) ? r.raw.activities : (Array.isArray(r.activities) ? r.activities : []))] }, activities: normalizeAndSortActivities([syntheticReassign, ...((r.raw && Array.isArray(r.raw.activities)) ? r.raw.activities : (Array.isArray(r.activities) ? r.activities : []))]) } : r));
      toast.success("Sent back to area nodal.");
    }

    setConfirmReassignOpen(false);
    setConfirmReassignRow(null);
  }

  function confirmCancelReassign() {
    const row = confirmReassignRow;
    if (row) {
      setDisabledReassignIds(prev => {
        const s = new Set(prev);
        s.delete(row.id);
        return s;
      });
    }
    setConfirmReassignOpen(false);
    setConfirmReassignRow(null);
  }

  function handleCloseClick(e, row) {
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    if (!row) return;

    // For HQ / SUPERADMIN / safety (non-nodal) role, open an Action Taken modal to collect text + attachments before closing
    if (role !== "nodal" && !row.isClosed) {
      setActionRow(row);
      setActionText("");
      setActionFiles([]);
      setActionModalOpen(true);
      setDisabledCloseIds(prev => {
        const s = new Set(prev);
        s.add(row.id);
        return s;
      });
      return;
    }

    setDisabledCloseIds(prev => {
      const s = new Set(prev);
      s.add(row.id);
      return s;
    });
    setConfirmRow(row);
    setConfirmCloseOpen(true);
  }

  // NEW: handle reopen (open) click triggered from list row - will open confirm modal (it will call REOPEN on confirm)
  function handleReopenClick(e, row) {
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    if (!row) return;
    setDisabledCloseIds(prev => {
      const s = new Set(prev);
      s.add(row.id);
      return s;
    });
    setConfirmRow(row);
    setConfirmCloseOpen(true);
  }

  function startAssignSubmit() {
    if (!assignRow) return;
    if (!assignAll && !selectedNodalId) {
      toast.error("Select a nodal officer or choose Assign to all.");
      return;
    }
    const payload = assignAll ? { assign_all: true } : { assignedto: Number(selectedNodalId) };
    const areaId = String(assignRow.raw?.area_id ?? "unknown");
    const list = nodalMap.get(areaId) || allNodals || [];
    const nod = !assignAll ? list.find(n => String(n.id) === String(selectedNodalId)) : null;
    const assignedLabel = assignAll ? "Area nodals (all)" : (nod ? (nod.name || nod.username || nod.email || `User ${nod.id}`) : String(selectedNodalId));
    setPendingAssignPayload({ row: assignRow, assignedLabel, payload });
    setConfirmAssignOpen(true);
  }

  async function confirmProceedAssign() {
    if (!pendingAssignPayload) {
      setConfirmAssignOpen(false);
      return;
    }
    const { row, payload } = pendingAssignPayload;
    setConfirmAssignOpen(false);
    setPendingAssignPayload(null);
    setAssigning(true);

    try {
      const token = getAuthToken();
      if (!token) {
        toast.error("Not authenticated — please login.");
        setAssigning(false);
        return;
      }
      const url = `${assignApiBase}/${row.id}/assign`;

      // if we have note text or files, use multipart form
      let res;
      if ((assignInstructions && assignInstructions.trim()) || (assignFiles && assignFiles.length)) {
        const fd = new FormData();
        Object.keys(payload).forEach(k => fd.append(k, payload[k]));
        if (assignInstructions && assignInstructions.trim()) fd.append("note", assignInstructions.trim());
        assignFiles.forEach((f, i) => fd.append("attachments[]", f, f.name || `file${i}`));
        res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          body: fd,
        });
      } else {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        toast.error(`Assign failed: ${res.status} ${txt}`);
        setAssigning(false);
        return;
      }
      const json = await res.json().catch(() => null);
      const assignedLabel = payload.assign_all ? "Area nodals (all)" : (() => {
        const list = nodalMap.get(String(row.raw?.area_id ?? "unknown")) || allNodals || [];
        const nod = list.find(n => String(n.id) === String(selectedNodalId));
        return nod ? (nod.name || nod.username || nod.email || `User ${nod.id}`) : String(selectedNodalId);
      })();
      updateLocalRow(row.id, { assignedTo: assignedLabel, isAssigned: true, workflowstatus: "ASSIGNED_TO_AREA", nodalLocked: false });

      // add a synthetic assign activity so attachments/instructions from HQ are visible immediately
      if ((assignFiles && assignFiles.length) || (assignInstructions && assignInstructions.trim())) {
        const synthetic = {
          id: `local-assign-${Date.now()}`,
          actorid: getCurrentUser()?.id ?? null,
          actortype: "HQ",
          activitytype: "ASSIGN",
          description: assignInstructions || "Assigned to area nodal",
          createdat: new Date().toISOString(),
          createdTs: Date.now(),
          attachments: assignFiles || [],
          raw: {}
        };
        setLocalResponses(curr => curr.map(r => r.id === row.id ? { ...r, raw: { ...(r.raw || {}), activities: [synthetic, ...((r.raw && Array.isArray(r.raw.activities)) ? r.raw.activities : (Array.isArray(r.activities) ? r.activities : []))] }, activities: normalizeAndSortActivities([synthetic, ...((r.raw && Array.isArray(r.raw.activities)) ? r.raw.activities : (Array.isArray(r.activities) ? r.activities : []))]) } : r));
      }

      toast.success("Assigned successfully.");
      setInternalAssignOpen(false);
      setAssignRow(null);
      setAssignAll(false);
      setSelectedNodalId("");
      setAssignInstructions("");
      setAssignFiles([]);
      if (typeof onAssign === "function") {
        try { onAssign(row, json); } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.error("Assign error:", err);
      toast.error("Assignment failed — check console.");
    } finally {
      setAssigning(false);
    }
  }

  function confirmCancelAssign() {
    setConfirmAssignOpen(false);
    setPendingAssignPayload(null);
  }

  // group nodals by area for assign modal
  const nodalsGroupedByArea = useMemo(() => {
    const m = new Map();
    nodalMap.forEach((v, k) => { m.set(k, v); });
    (allNodals || []).forEach(u => {
      const k = String(u.area_id ?? "unknown");
      const cur = m.get(k) || [];
      if (!cur.find(x => String(x.id) === String(u.id))) cur.push(u);
      m.set(k, cur);
    });
    return m;
  }, [nodalMap, allNodals]);

  function isRowClosed(row) {
    const local = localResponses.find(r => r.id === row.id);
    return Boolean(local?.isClosed ?? row?.isClosed);
  }

  function isFrozenByClose(row) {
    return disabledCloseIds.has(row.id);
  }

  // ======= SUBMIT ACTION (Close flow) =======
  async function submitActionTakenClose() {
    const row = actionRow;
    if (!row) {
      setActionModalOpen(false);
      return;
    }
    setActionSubmitting(true);

    try {
      const json = await performDecision(row, "CLOSE", { note: actionText, files: actionFiles });
      if (!json) {
        setDisabledCloseIds(prev => {
          const s = new Set(prev);
          s.delete(row.id);
          return s;
        });
        setActionSubmitting(false);
        setActionModalOpen(false);
        setActionRow(null);
        return;
      }

      // add synthetic activity/actionTaken to local row for immediate UX
      const synthetic = {
        id: `local-${Date.now()}`,
        actorid: getCurrentUser()?.id ?? null,
        actortype: "HQ",
        activitytype: "HQ_CLOSE_ACTION",
        description: actionText || "Closed by HQ",
        createdat: new Date().toISOString(),
        createdTs: Date.now(),
        attachments: actionFiles || [],
        raw: {}
      };

      // Prepend synthetic to the activities array and ensure actionTaken is stored separately (with only actionFiles)
      setLocalResponses(curr => curr.map(r => {
        if (r.id === row.id) {
          const existingActivities = Array.isArray(r.raw?.activities) ? r.raw.activities.slice() : (Array.isArray(r.activities) ? r.activities.slice() : []);
          // Prepend synthetic activity so it's the first update shown
          const newActivities = [synthetic, ...existingActivities];
          return {
            ...r,
            raw: { ...(r.raw || {}), activities: newActivities },
            activities: normalizeAndSortActivities(newActivities),
            workflowstatus: "CLOSED",
            isClosed: true,
            // store actionTaken explicitly with attachments that were uploaded during close only
            actionTaken: { text: synthetic.description, attachments: synthetic.attachments, raw: synthetic.raw }
          };
        }
        return r;
      }));

      toast.success("Complaint closed with action taken.");
    } catch (err) {
      console.error("submitActionTakenClose error:", err);
      toast.error("Failed to close with action — see console.");
      setDisabledCloseIds(prev => {
        const s = new Set(prev);
        s.delete(row.id);
        return s;
      });
    } finally {
      setActionSubmitting(false);
      setActionModalOpen(false);
      setActionRow(null);
    }
  }

  function confirmCancelClose() {
    const row = confirmRow;
    if (row) {
      setDisabledCloseIds(prev => {
        const s = new Set(prev);
        s.delete(row.id);
        return s;
      });
    }
    setConfirmCloseOpen(false);
    setConfirmRow(null);
  }

  // ======= RENDER =======
  return (
    <div className="bg-white shadow rounded-lg p-4">
      <h4 className="font-semibold mb-3">Responses</h4>

      <div className="overflow-x-auto">
        <table className="w-full table-auto text-left text-sm">
          <thead>
            <tr className="text-gray-500">
              <th className="p-2">ID</th>
              <th className="p-2">Title</th>
              <th className="p-2">Submitted By</th>
              <th className="p-2">Date</th>
              <th className="p-2">Last Action</th>
              <th className="p-2">Completion</th>
              <th className="p-2">Workflow</th>
            </tr>
          </thead>

          <tbody>
            {localResponses.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">No responses on this page.</td>
              </tr>
            )}

            {localResponses.map((r) => {
              const actionText = r?.actionTaken && typeof r.actionTaken.text === "string" ? r.actionTaken.text : null;
              const actionPreview = actionText ? (actionText.length > 80 ? actionText.slice(0, 80) + "..." : actionText) : null;

              const hasAction = Boolean(
                r.actionTaken ||
                (r.raw && Array.isArray(r.raw?.nodal_actions) && r.raw.nodal_actions.length > 0) ||
                (r.workflowstatus && String(r.workflowstatus).toUpperCase() !== "NEW")
              );

              const ws = (r.workflowstatus || r.raw?.workflowstatus || "").toString().toUpperCase();
              const nodalHasActed = Boolean(
                r.nodalNotified ||
                r.actionTaken ||
                (r.raw && Array.isArray(r.raw?.nodal_actions) && r.raw.nodal_actions.length > 0) ||
                r.isClosed ||
                ws === "CLOSED" ||
                ws === "HQ_REVIEW"
              );

              const alreadyAssigned = Boolean(isAssigned(r) || r?.isClosed);

              const isCloseDisabled = disabledCloseIds.has(r.id) || Boolean(r.isClosed);
              const isReassignDisabled =
                disabledReassignIds.has(r.id) ||
                Boolean(r.isClosed) ||
                ["ASSIGNED_TO_AREA", "BACK_TO_AREA"].includes(String(r.workflowstatus || r.raw?.workflowstatus || "").toUpperCase()) ||
                isFrozenByClose(r);

              const frozen = isFrozenByClose(r);

              // compute notify disabled: include notifyPendingIds to avoid freezing on cancellation
              const notifyPending = notifyPendingIds.has(r.id);
              const notifyDisabled = nodalHasActed || notifyPending || Boolean(r.isClosed);

              return (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 align-top">{r.id}</td>

                  <td className="p-2 align-top max-w-xl">
                    <div className="font-medium">{r.title ?? "Unsafe Act Report"}</div>
                    <div className="text-xs text-gray-500 mt-1 truncate">{r.trackingNumber ?? "-"}</div>
                  </td>

                  <td className="p-2 align-top">{r.submittedBy ?? "-"}</td>
                  <td className="p-2 align-top">{r.date ?? "-"}</td>

                  <td className="p-2 align-top">{actionPreview ? <div className="text-sm text-gray-700">{actionPreview}</div> : <div className="text-sm text-gray-400">—</div>}</td>

                  <td className="p-2 align-top">{r.completion ?? "—"}</td>

                  <td className="p-2 align-top">
                    <div className="flex gap-2 flex-wrap items-center">
                      {role !== "nodal" && (
                        <>
                          {!hasAction ? (
                            <>
                              <button
                                type="button"
                                className={`px-3 py-1 rounded text-xs ${alreadyAssigned || frozen ? "bg-gray-200 text-gray-700 cursor-not-allowed" : "bg-orange-600 text-white hover:opacity-90"}`}
                                onClick={(e) => handleAssignClick(e, r)}
                                disabled={alreadyAssigned || frozen}
                                title={alreadyAssigned ? `Already assigned${typeof r.assignedTo === "string" ? ` to ${r.assignedTo}` : ""}` : "Assign to area nodal officer"}
                              >
                                {alreadyAssigned ? "Assigned" : "Assign"}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className={`px-3 py-1 rounded text-xs ${isReassignDisabled ? "bg-white text-gray-700 border cursor-not-allowed" : "bg-yellow-600 text-white hover:opacity-90"}`}
                                onClick={(e) => handleReassignClick(e, r)}
                                title="Send back to area nodal (Back to Area)"
                                disabled={isReassignDisabled}
                              >
                                Reassign
                              </button>
                            </>
                          )}

                          {/* Close / Open button: show "Open" when complaint is closed so HQ can reopen */}
                          {isRowClosed(r) ? (
                            <button
                              type="button"
                              className={`px-3 py-1 rounded text-xs ${disabledCloseIds.has(r.id) ? "bg-gray-200 text-gray-700 cursor-not-allowed" : "bg-indigo-600 text-white hover:opacity-90"}`}
                              onClick={(e) => handleReopenClick(e, r)}
                              title={disabledCloseIds.has(r.id) ? "Processing…" : "Open complaint"}
                              disabled={disabledCloseIds.has(r.id)}
                            >
                              {disabledCloseIds.has(r.id) ? "Processing…" : "Open"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={`px-3 py-1 rounded text-xs ${isCloseDisabled ? "bg-gray-200 text-gray-700 cursor-not-allowed" : "bg-green-700 text-white hover:opacity-90"}`}
                              onClick={(e) => handleCloseClick(e, r)}
                              title={isCloseDisabled ? (r.isClosed ? "Closed" : "Processing…") : "Close complaint"}
                              disabled={isCloseDisabled}
                            >
                              {isCloseDisabled ? (r.isClosed ? "Closed" : "Processing…") : "Close"}
                            </button>
                          )}
                        </>
                      )}

                      {role === "nodal" && (
                        <>
                          {isAssigned(r) ? (
                            <button
                              type="button"
                              className={`px-3 py-1 rounded text-xs ${nodalHasActed ? "bg-gray-200 text-gray-700 cursor-not-allowed" : "bg-indigo-600 text-white hover:opacity-90"}`}
                              onClick={(e) => handleNotifyClick(e, r)}
                              disabled={notifyDisabled}
                              title={nodalHasActed ? "Notify disabled — action already recorded or complaint closed" : "Notify Safety"}
                            >
                              {notifyPending ? "Notifying…" : "Notify Safety"}
                            </button>
                          ) : (
                            <div className="text-xs text-gray-500 px-2">Not assigned</div>
                          )}
                        </>
                      )}

                      <button type="button" className="px-3 py-1 border rounded text-xs" onClick={() => openDetails(r)}>
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Details modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeDetails} />
          <div className="relative w-full max-w-3xl bg-white rounded-lg shadow-xl p-6 z-10 overflow-auto max-h-[90vh]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold">Complaint #{selected.id} — {selected.title}</h3>
                <div className="text-xs text-gray-500 mt-1">Tracking: <span className="font-mono">{selected.trackingNumber}</span></div>
              </div>

              {/* header Close button removed on purpose */}
              <div className="flex items-start gap-2"></div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
              <div>
                <div className="text-xs text-gray-500">Submitted by</div>
                <div className="font-medium">{(selected.prefix || "") + " " + ((selected.first_name || selected.firstName) ? `${selected.first_name || selected.firstName} ${selected.last_name || selected.lastName || ""}`.trim() : (selected.submittedBy || "-"))}</div>
              </div>

              <div>
                <div className="text-xs text-gray-500">Date (created/incident)</div>
                <div>{selected.date ?? "-"} {selected.incident_date ? <span className="text-xs text-gray-400">({new Date(selected.incident_date).toLocaleString()})</span> : null}</div>
              </div>

              <div>
                <div className="text-xs text-gray-500">Location</div>
                <div>{selected.location ?? "-"}</div>
              </div>

              <div>
                <div className="text-xs text-gray-500">Status / Workflow</div>
                <div>{selected.workflowstatus ?? "NEW"} {selected.isclosed || selected.isClosed ? <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800">Closed</span> : null}</div>
              </div>

              <div>
                <div className="text-xs text-gray-500">Assigned To</div>
                <div>{selected.assignedToLabel ?? "—"}</div>

              </div>

              <div>
                <div className="text-xs text-gray-500">Assigned By</div>
                <div>{selected.assignedByLabel ?? "—"}</div>

              </div>

              <div>
                <div className="text-xs text-gray-500">Area</div>
                <div>{selected.areaName ?? (selected.raw?.area_name || selected.raw?.unit_name) ?? "-"}</div>
              </div>

              <div>
                <div className="text-xs text-gray-500">Observance type</div>
                <div>{selected.observance ?? "-"}</div>
              </div>

              <div>
                <div className="text-xs text-gray-500">Employment type</div>
                <div>{selected.employment ?? "-"}</div>
              </div>

              <div>
                <div className="text-xs text-gray-500">Reported status</div>
                <div>{selected.reportedStatus ?? "-"}</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs text-gray-500">Full Description</div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{selected.description ?? "-"}</div>
            </div>

            <div className="mt-4">
              <div className="text-xs text-gray-500">Attachments</div>
              <div className="mt-2 flex flex-col gap-2">
                {(() => {
                  const topAtts = selected.attachments && selected.attachments.length ? selected.attachments : getTopLevelAttachments(selected);
                  if (!topAtts || topAtts.length === 0) {
                    return <div className="text-xs text-gray-400">No attachments</div>;
                  }
                  return topAtts.map((p, i) => {
                    const url = getAttachmentUrl(typeof p === "object" ? (p.path ?? p.original_name ?? p.originalname ?? p) : p);
                    const label = typeof p === "string" ? (p.split("/").pop() || p) : (p.original_name || p.originalname || getAttachmentLabel(p, i));
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

            {/* Combined Updates: HQ action (if present) will be shown first, then other actions */}
            <div className="mt-6">
              <div className="text-xs text-gray-500">Updates (newest first)</div>
              <div className="mt-3 space-y-3">
                {(() => {
                  const acts = selected.activities ?? [];
                  if (!acts || acts.length === 0) {
                    return <div className="text-sm text-gray-400">No updates recorded.</div>;
                  }
                  return acts.map((a, idx) => renderActionEntry(a, idx));
                })()}
              </div>
            </div>

            {/* Server metadata (compact) */}
            {selected.raw && (
              <div className="mt-6">
                <div className="text-xs text-gray-500 mb-2">Server metadata (compact)</div>
                <div className="text-xs text-gray-700 p-3 bg-gray-50 rounded">
                  <div><strong>Server ID:</strong> {selected.raw?.id ?? "-"}</div>
                  <div className="mt-1"><strong>Area id:</strong> {selected.raw?.area_id ?? selected.raw?.unit_id ?? "-"}</div>
                  <div className="mt-1"><strong>Area name:</strong> {selected.raw?.area_name ?? selected.raw?.unit_name ?? selected.areaName ?? "-"}</div>
                  <div className="mt-1"><strong>Received at:</strong> {selected.raw?.created_at ?? selected.raw?.createdAt ?? "-"}</div>
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-between items-center gap-2">
              <div>
                <button type="button" onClick={() => { navigator.clipboard?.writeText(selected.trackingNumber || ""); }} className="px-3 py-1 border rounded text-sm">Copy tracking</button>
              </div>

              <div className="flex items-center gap-2">
                {role !== "nodal" && (
                  <>
                    {isRowClosed(selected) ? (
                      <button type="button" className="px-3 py-1 bg-indigo-600 text-white rounded text-sm" onClick={(e) => {
                        setDisabledCloseIds(prev => { const s = new Set(prev); s.add(selected.id); return s; });
                        setConfirmRow(selected);
                        setConfirmCloseOpen(true);
                      }}>Open</button>
                    ) : (
                      <button type="button" className="px-3 py-1 bg-green-700 text-white rounded text-sm" onClick={(e) => handleCloseClick(e, selected)} disabled={disabledCloseIds.has(selected.id)}>
                        {disabledCloseIds.has(selected.id) ? "Processing…" : "Close"}
                      </button>
                    )}
                  </>
                )}
                <button type="button" onClick={closeDetails} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Internal Assign modal */}
      {internalAssignOpen && assignRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setInternalAssignOpen(false); setAssignRow(null); }} />
          <div className="relative w-full max-w-lg bg-white rounded-lg shadow-lg p-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Assign complaint #{assignRow.id}</h3>
              <button type="button" onClick={() => { setInternalAssignOpen(false); setAssignRow(null); }} className="text-sm text-gray-600">Close</button>
            </div>

            <div className="text-sm text-gray-700 mb-3">
              <div><strong>Title:</strong> {assignRow.title}</div>
              <div><strong>Area:</strong> {assignRow.raw?.unit_name ?? assignRow.raw?.area_name ?? assignRow.raw?.area_id ?? "—"} <span className="text-xs text-gray-500">({assignRow.raw?.area_id ?? assignRow.raw?.unit_id ?? "-"})</span></div>
            </div>

            <div className="mb-3">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={assignAll} onChange={(e) => setAssignAll(Boolean(e.target.checked))} />
                <span className="text-sm">Assign to <strong>all</strong> area nodal officers</span>
              </label>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Or select a nodal officer (from the same area)</label>
              {loadingNodals && <div className="text-xs text-gray-500">Loading nodal officers…</div>}
              {!loadingNodals && (() => {
                const areaId = String(assignRow.raw?.area_id ?? "unknown");
                const list = nodalsGroupedByArea.get(areaId) || [];
                if (!list.length) {
                  return <div className="text-xs text-gray-500">No nodal officers found for this area.</div>;
                }
                return (
                  <select className="w-full border rounded px-3 py-2" value={selectedNodalId} onChange={(e) => setSelectedNodalId(e.target.value)} disabled={assignAll}>
                    <option value="">-- select nodal officer --</option>
                    {list.map(u => <option key={u.id} value={String(u.id)}>{u.name || u.username || u.email}</option>)}
                  </select>
                );
              })()}
            </div>

            {/* HQ / SUPERADMIN / safety note + attachments */}
            {role !== "nodal" && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Note (optional, up to 5000 chars)</label>
                <textarea className="w-full border rounded px-3 py-2 text-sm" maxLength={5000} rows={5} value={assignInstructions} onChange={(e) => setAssignInstructions(e.target.value)} />
                <div className="mt-2">
                  <label className="block text-sm font-medium mb-1">Attachments (optional)</label>
                  <input type="file" multiple onChange={(e) => setAssignFiles(Array.from(e.target.files || []))} />
                  {assignFiles.length > 0 && <div className="text-xs text-gray-600 mt-2">{assignFiles.length} file(s) selected</div>}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setInternalAssignOpen(false); setAssignRow(null); }} className="px-4 py-2 border rounded">Cancel</button>
              <button type="button" onClick={startAssignSubmit} disabled={assigning || (!assignAll && !selectedNodalId)} className={`px-4 py-2 rounded bg-indigo-600 text-white ${assigning ? "opacity-70 cursor-not-allowed" : ""}`}>{assigning ? "Assigning…" : "Assign"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign confirmation modal (summary before final POST) */}
      {confirmAssignOpen && pendingAssignPayload && (
        <div className="fixed inset-0 z-60 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={confirmCancelAssign} />
          <div className="relative w-full max-w-md bg-white rounded-lg shadow-lg p-6 z-10">
            <h3 className="text-lg font-semibold mb-3">Confirm assignment</h3>
            <div className="text-sm text-gray-700 mb-4">
              You are about to assign complaint #{pendingAssignPayload.row.id} — <span className="font-medium">{pendingAssignPayload.row.title}</span>
              <div className="mt-2"><strong>Assigned to:</strong> {pendingAssignPayload.assignedLabel}</div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={confirmCancelAssign} className="px-4 py-2 border rounded">Cancel</button>
              <button type="button" onClick={confirmProceedAssign} className="px-4 py-2 bg-indigo-600 text-white rounded">Confirm assign</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Reassign modal */}
      {confirmReassignOpen && confirmReassignRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={confirmCancelReassign} />
          <div className="relative w-full max-w-md bg-white rounded-lg shadow-lg p-6 z-10">
            <h3 className="text-lg font-semibold mb-3">Confirm reassign</h3>
            <div className="text-sm text-gray-700 mb-4">Are you sure you want to <strong>send back to area</strong> complaint #{confirmReassignRow.id} — <span className="font-medium">{confirmReassignRow.title}</span>?</div>

            {/* New: allow assign to all / select nodal (same as Assign modal) */}
            <div className="mb-3">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={assignAll} onChange={(e) => setAssignAll(Boolean(e.target.checked))} />
                <span className="text-sm">Assign to <strong>all</strong> area nodal officers</span>
              </label>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Select nodal officer (if assigning to specific person)</label>
              {loadingNodals && <div className="text-xs text-gray-500">Loading nodal officers…</div>}
              {!loadingNodals && (() => {
                const areaId = String(confirmReassignRow.raw?.area_id ?? "unknown");
                const list = nodalsGroupedByArea.get(areaId) || [];
                if (!list.length) {
                  // If no nodals were returned by the API, show previously assigned label (if any) as the fallback
                  const previouslyAssignedLabel = confirmReassignRow.assignedToLabel ?? confirmReassignRow.raw?.assigned_to_name ?? confirmReassignRow.raw?.assignedToName ?? (confirmReassignRow.raw?.assignedto ? String(confirmReassignRow.raw.assignedto) : null);
                  return (
                    <div className="text-xs text-gray-500">
                      No nodal officers found for this area.
                      {previouslyAssignedLabel ? <div className="mt-2 text-sm text-gray-700">Using previously-assigned: <strong>{previouslyAssignedLabel}</strong></div> : null}
                    </div>
                  );
                }
                return (
                  <select className="w-full border rounded px-3 py-2" value={selectedNodalId} onChange={(e) => setSelectedNodalId(e.target.value)} disabled={assignAll}>
                    <option value="">-- Select nodal officer --</option>
                    {list.map(u => <option key={u.id} value={String(u.id)}>{u.name || u.username || u.email}</option>)}
                  </select>
                );
              })()}
            </div>

            {/* optional note + files for HQ / SUPERADMIN */}
            {role !== "nodal" && (
              <div className="mb-3">
                <label className="block text-sm font-medium mb-1">Note (optional, up to 5000 chars)</label>
                <textarea className="w-full border rounded px-3 py-2 text-sm" maxLength={5000} rows={4} value={reassignInstructions} onChange={(e) => setReassignInstructions(e.target.value)} />
                <div className="mt-2">
                  <label className="block text-sm font-medium mb-1">Attachments (optional)</label>
                  <input type="file" multiple onChange={(e) => setReassignFiles(Array.from(e.target.files || []))} />
                  {reassignFiles.length > 0 && <div className="text-xs text-gray-600 mt-2">{reassignFiles.length} file(s) selected</div>}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={confirmCancelReassign} className="px-4 py-2 border rounded">Cancel</button>
              <button type="button" onClick={confirmProceedReassign} className="px-4 py-2 bg-yellow-600 text-white rounded">Confirm reassign</button>
            </div>
          </div>
        </div>
      )}

      {/* Action Taken modal for HQ when closing */}
      {actionModalOpen && actionRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setActionModalOpen(false); setActionRow(null); setDisabledCloseIds(prev => { const s = new Set(prev); s.delete(actionRow.id); return s; }); }} />
          <div className="relative w-full max-w-lg bg-white rounded-lg shadow-lg p-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Action taken before closing — complaint #{actionRow.id}</h3>
              <button type="button" onClick={() => { setActionModalOpen(false); setActionRow(null); setDisabledCloseIds(prev => { const s = new Set(prev); s.delete(actionRow.id); return s; }); }} className="text-sm text-gray-600">Close</button>
            </div>

            <div className="mb-3 text-sm text-gray-700">Provide action summary (up to 5000 chars) and attach any supporting documents. This will be recorded as the closing action and will appear at the top of updates.</div>

            <div className="mb-3">
              <textarea className="w-full border rounded px-3 py-2 text-sm" maxLength={5000} rows={6} value={actionText} onChange={(e) => setActionText(e.target.value)} placeholder="Describe action taken..." />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Attachments (optional)</label>
              <input type="file" multiple onChange={(e) => setActionFiles(Array.from(e.target.files || []))} />
              {actionFiles.length > 0 && <div className="text-xs text-gray-600 mt-2">{actionFiles.length} file(s) selected</div>}
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setActionModalOpen(false); setActionRow(null); setDisabledCloseIds(prev => { const s = new Set(prev); s.delete(actionRow.id); return s; }); }} className="px-4 py-2 border rounded">Cancel</button>
              <button type="button" onClick={submitActionTakenClose} disabled={actionSubmitting} className={`px-4 py-2 bg-red-600 text-white rounded ${actionSubmitting ? "opacity-70 cursor-not-allowed" : ""}`}>{actionSubmitting ? "Submitting…" : "Close & record action"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Close (and Reopen) modal (fallback for non-nodal roles or reopen) */}
      {confirmCloseOpen && confirmRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => {
            if (confirmRow && confirmRow.isClosed) {
              setDisabledCloseIds(prev => { const s = new Set(prev); s.delete(confirmRow.id); return s; });
            } else {
              setDisabledCloseIds(prev => { const s = new Set(prev); s.delete(confirmRow.id); return s; });
            }
            setConfirmCloseOpen(false);
            setConfirmRow(null);
          }} />
          <div className="relative w-full max-w-md bg-white rounded-lg shadow-lg p-6 z-10">
            <h3 className="text-lg font-semibold mb-3">{confirmRow.isClosed ? "Confirm reopen" : "Confirm close"}</h3>
            <div className="text-sm text-gray-700 mb-4">
              {confirmRow.isClosed ? <>Are you sure you want to <strong>reopen</strong> complaint #{confirmRow.id} — <span className="font-medium">{confirmRow.title}</span>?</> : <>Are you sure you want to <strong>close</strong> complaint #{confirmRow.id} — <span className="font-medium">{confirmRow.title}</span>? Closing will mark this complaint as closed and freeze further actions.</>}
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => {
                setDisabledCloseIds(prev => { const s = new Set(prev); s.delete(confirmRow.id); return s; });
                setConfirmCloseOpen(false);
                setConfirmRow(null);
              }} className="px-4 py-2 border rounded">Cancel</button>
              <button type="button" onClick={async () => {
                const row = confirmRow; if (!row) return;
                if (!row.isClosed && typeof onComplete === "function") {
                  try {
                    onComplete(row);
                    setDisabledCloseIds(prev => { const s = new Set(prev); s.add(row.id); return s; });
                    setConfirmCloseOpen(false); setConfirmRow(null); return;
                  } catch (err) { console.warn("onComplete threw:", err); }
                }
                const decision = row.isClosed ? "REOPEN" : "CLOSE";
                const json = await performDecision(row, decision);
                if (!json) {
                  setDisabledCloseIds(prev => { const s = new Set(prev); s.delete(row.id); return s; });
                  setConfirmCloseOpen(false); setConfirmRow(null); return;
                }
                if (decision === "CLOSE") {
                  setDisabledCloseIds(prev => { const s = new Set(prev); s.add(row.id); return s; });
                } else {
                  setDisabledCloseIds(prev => { const s = new Set(prev); s.delete(row.id); return s; });
                }
                setConfirmCloseOpen(false); setConfirmRow(null);
              }} className="px-4 py-2 bg-red-600 text-white rounded">{confirmRow.isClosed ? "Confirm reopen" : "Confirm close"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
