// src/pages/ComplaintForm.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProgressBar from "../components/ProgressBar";
import logo from "../assets/logo.png";
import angaara from "../assets/hero.gif";
import toast from "react-hot-toast";
import jsPDF from "jspdf";

const API_URL = "/api/complaints";
const TRACK_API_BASE = "/api/public/complaints/track";
const PUBLIC_API_BASE = "/api/public"; // backend public endpoints
const MAX_WORDS = 2700;
const MAX_FILES = 4;
const MAX_FILE_SIZE = 6 * 1024 * 1024; // 6MB

const LABELS = {
  en: {
    title: "Reporting of Unsafe Act / Unsafe Practice / Near Miss Incident / Safety Suggestion",
    personalDetails: "Personal Details",
    incidentDetails: "Incident Details",
    reportDetails: "Report Details",
    typeOfAct: "Type of act",
    nameOfApplicant: "Name of the Applicant",
    typeOfEmployment: "Type of Employment",
    email: "Email address of the Applicant",
    phone: "Phone Number of the Applicant",
    dateOfOccurrence: "Date of Occurrence",
    location: "Location of Occurrence",
    unitName: "Name of the Unit where observed",
    areaName: "Name of the Area",
    reportedToOfficials: "Whether reported to Officials?",
    details: "Details of Observed Unsafe Act / Unsafe Practice / Near Miss Incident",
    uploadFiles: "Upload files (optional)",
    next: "NEXT →",
    back: "← BACK",
    submit: "SUBMIT",
    selectLang: "Select language to fill the form",
    startForm: "Start Form",
    backHome: "Back to Home",
    trackingPlaceholder: "Enter tracking number",
    trackingSearch: "Track",
    lastTracking: "Last tracking",
    trackingNotFound: "Tracking number not found.",
    trackingStatusSubmitted: "Submitted",
    trackingStatusAcknowledged: "Acknowledged",
  },
  hi: {
    title: "अवांछित कार्य / अव्यवहार / नियर मिस की रिपोर्टिंग",
    personalDetails: "व्यक्तिगत विवरण",
    incidentDetails: "घटना विवरण",
    reportDetails: "रिपोर्ट विवरण",
    typeOfAct: "घटना का प्रकार",
    nameOfApplicant: "आवेदक का नाम",
    typeOfEmployment: "रोजगार का प्रकार",
    email: "आवेदक का ईमेल",
    phone: "आवेदक का फोन नंबर",
    dateOfOccurrence: "घटना की तिथि",
    location: "घटना का स्थान",
    unitName: "जहाँ देखा गया (यूनिट का नाम)",
    areaName: "क्षेत्र का नाम",
    reportedToOfficials: "क्या अधिकारियों को बताया गया?",
    details: "विवरण",
    uploadFiles: "फ़ाइलें अपलोड करें (वैकल्पिक)",
    next: "अगला →",
    back: "← पीछे",
    submit: "सबमिट",
    selectLang: "फॉर्म के लिए भाषा चुने",
    startForm: "फॉर्म शुरू करें",
    backHome: "होम पर वापस जाएं",
    trackingPlaceholder: "ट्रैकिंग नंबर डालें",
    trackingSearch: "ट्रैक करें",
    lastTracking: "अंतिम ट्रैकिंग",
    trackingNotFound: "ट्रैकिंग नंबर नहीं मिला।",
    trackingStatusSubmitted: "सबमिट किया गया",
    trackingStatusAcknowledged: "स्वीकृत",
  },
};

export default function ComplaintForm() {
  const navigate = useNavigate();
  const [showIntro, setShowIntro] = useState(true);
  const [lang, setLang] = useState("en");

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    typeOfAct: "", // observance_type_id (string)
    prefix: "",
    firstName: "",
    middleName: "",
    lastName: "",
    employmentType: "", // employment_type_id (string)
    email: "",
    phone: "",
    complainantEmpId: "",
    date: "",
    time: "",
    ampm: "AM",
    location: "",
    unitName: "",
    areaName: "", // area_id (string)
    reportedToOfficials: "", // report_status_id (string)
    personReportedAgainst: "",
    witnesses: "",
    details: "",
    includeFilesInPdf: true,
  });
  const [files, setFiles] = useState([]);
  const [wordCount, setWordCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const fileInputRef = useRef(null);

  const [submittedRecords, setSubmittedRecords] = useState([]);

  // remote tracking panel states
  const [panelId, setPanelId] = useState("");
  const [panelToken, setPanelToken] = useState("");
  const [panelTrackingNumber, setPanelTrackingNumber] = useState("");
  const [remoteTrackResult, setRemoteTrackResult] = useState(null);
  const [panelLoading, setPanelLoading] = useState(false);

  // UI: mobile tracking panel
  const [showTrackingMobile, setShowTrackingMobile] = useState(false);

  // fetched lists
  const [areasList, setAreasList] = useState([]);
  const [empTypesList, setEmpTypesList] = useState([]);
  const [observanceTypesList, setObservanceTypesList] = useState([]);
  const [reportStatusesList, setReportStatusesList] = useState([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState(null);

  // make label set available early (used by intro)
  const L = LABELS[lang];

  /* --------------------------
     Fetch reference lists (areas, employment-types, observance-types, report-statuses)
     -------------------------- */
  useEffect(() => {
    let mounted = true;
    async function loadLists() {
      setListsLoading(true);
      setListsError(null);
      try {
        const endpoints = [
          `${PUBLIC_API_BASE}/areas`,
          `${PUBLIC_API_BASE}/employment-types`,
          `${PUBLIC_API_BASE}/observance-types`,
          `${PUBLIC_API_BASE}/report-statuses`,
        ];
        const results = await Promise.allSettled(endpoints.map(u => fetch(u)));
        // process individually so a fail on one doesn't block others
        const [areasRes, empRes, obsRes, statRes] = results;

        if (areasRes.status === "fulfilled" && areasRes.value.ok) {
          const data = await areasRes.value.json();
          if (mounted) setAreasList(Array.isArray(data) ? data : []);
        } else {
          console.warn("Failed to load areas", areasRes);
        }

        if (empRes.status === "fulfilled" && empRes.value.ok) {
          const data = await empRes.value.json();
          if (mounted) setEmpTypesList(Array.isArray(data) ? data : []);
        } else {
          console.warn("Failed to load employment types", empRes);
        }

        if (obsRes.status === "fulfilled" && obsRes.value.ok) {
          const data = await obsRes.value.json();
          if (mounted) setObservanceTypesList(Array.isArray(data) ? data : []);
        } else {
          console.warn("Failed to load observance types", obsRes);
        }

        if (statRes.status === "fulfilled" && statRes.value.ok) {
          const data = await statRes.value.json();
          if (mounted) setReportStatusesList(Array.isArray(data) ? data : []);
        } else {
          console.warn("Failed to load report statuses", statRes);
        }
      } catch (err) {
        console.error("Error fetching lists:", err);
        if (mounted) setListsError("Failed to load selection lists");
      } finally {
        if (mounted) setListsLoading(false);
      }
    }

    loadLists();
    return () => { mounted = false; };
  }, []);

  /* ----------------- Helpers ----------------- */
  function inputClass(name, isFull = true) {
    const base = isFull ? "mt-1 w-full border rounded-md p-2" : "border rounded-md p-2";
    return `${base} transition-all duration-200 ${
      errors[name] ? "border-2 border-red-600 ring-2 ring-red-500 bg-red-50" : "border-gray-300 focus:ring-2 focus:ring-blue-500"
    }`;
  }

  function onChange(e) {
    const { name, value } = e.target;
    if (name === "details") {
      const words = value.trim() ? value.trim().split(/\s+/).length : 0;
      if (words <= MAX_WORDS) {
        setForm((s) => ({ ...s, [name]: value }));
        setWordCount(words);
      } else {
        toast.error(`Maximum ${MAX_WORDS} words allowed`);
      }
    } else {
      setForm((s) => ({ ...s, [name]: value }));
      // clear validation error for the field
      setErrors((prev) => ({ ...prev, [name]: false }));
    }
  }

  function getExt(filename) {
    const m = filename.match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toUpperCase() : "";
  }

  function handleFilesChange(e) {
    const selected = Array.from(e.target.files || []);
    const valid = [];
    const allowedMimes = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    const allowedExt = /\.(pdf|doc|docx)$/i;

    if (selected.length === 0) {
      setFiles([]);
      return;
    }

    for (const f of selected.slice(0, MAX_FILES)) {
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`${f.name} is larger than ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)} MB`);
        continue;
      }
      const isImage = f.type && f.type.startsWith("image/");
      const isAllowedMime = f.type && allowedMimes.has(f.type);
      const isAllowedExt = allowedExt.test(f.name);

      if (isImage || isAllowedMime || isAllowedExt) valid.push(f);
      else toast.error(`Unsupported file type: ${f.name}`);
    }

    if (valid.length === 0 && selected.length > 0 && fileInputRef.current) fileInputRef.current.value = "";
    setFiles(valid);
  }

  function removeFile(idx) {
    const next = [...files];
    next.splice(idx, 1);
    setFiles(next);
    if (next.length === 0 && fileInputRef.current) fileInputRef.current.value = "";
  }

  function formatDateToDDMMYYYY(isoDate) {
    if (!isoDate) return "";
    const d = new Date(isoDate);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  function validateStep1() {
    let ok = true;
    const newErrors = { ...errors };
    if (!form.typeOfAct) { newErrors.typeOfAct = true; ok = false; } else newErrors.typeOfAct = false;
    if (!form.employmentType) { newErrors.employmentType = true; ok = false; } else newErrors.employmentType = false;
    setErrors(newErrors);
    if (!ok) {
      if (!toast.isActive("step1-error")) toast.error("Please fill required fields in Personal Details.", { id: "step1-error" });
    } else toast.dismiss("step1-error");
    return ok;
  }
  function validateStep2() {
    let ok = true;
    const newErrors = { ...errors };
    if (!form.date) { newErrors.date = true; ok = false; } else newErrors.date = false;
    if (!form.time) { newErrors.time = true; ok = false; } else newErrors.time = false;
    if (!form.ampm) { newErrors.ampm = true; ok = false; } else newErrors.ampm = false;
    if (!form.location) { newErrors.location = true; ok = false; } else newErrors.location = false;
    if (!form.areaName) { newErrors.areaName = true; ok = false; } else newErrors.areaName = false;
    setErrors(newErrors);
    if (!ok) {
      if (!toast.isActive("step2-error")) toast.error("Please fill required fields in Incident Details.", { id: "step2-error" });
    } else toast.dismiss("step2-error");
    return ok;
  }
  function validateStep3() {
    let ok = true;
    const newErrors = { ...errors };
    if (!form.reportedToOfficials) { newErrors.reportedToOfficials = true; ok = false; } else newErrors.reportedToOfficials = false;
    if (!form.details?.trim()) { newErrors.details = true; ok = false; } else newErrors.details = false;
    setErrors(newErrors);
    if (!ok) {
      if (!toast.isActive("step3-error")) toast.error("Please fill required fields in Report Details.", { id: "step3-error" });
    } else toast.dismiss("step3-error");
    return ok;
  }

  function goNext() {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep((s) => Math.min(3, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function goBack() {
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ----------------- lookup helpers to show labels based on selected ids ----------------- */
  function getAreaNameById(id) {
    const a = areasList.find(x => String(x.id) === String(id));
    return a ? a.name : (id || "-");
  }
  function getEmploymentLabelById(id) {
    const e = empTypesList.find(x => String(x.id) === String(id));
    return e ? e.label : (id || "-");
  }
  function getObservanceLabelById(id) {
    const o = observanceTypesList.find(x => String(x.id) === String(id));
    return o ? o.label : (id || "-");
  }
  function getReportStatusLabelById(id) {
    const s = reportStatusesList.find(x => String(x.id) === String(id));
    return s ? s.label : (id || "-");
  }

  function collectAnswers(trackingNumber, serverMeta = null) {
    const base = {
      "Tracking Number:": trackingNumber || "-",
      "1). Type of act:": getObservanceLabelById(form.typeOfAct),
      "2).  Name of the Applicant:": `${form.prefix ? form.prefix + " " : ""}${form.firstName || ""} ${form.middleName || ""} ${form.lastName || ""}`.trim() || "-",
      "3). Type of Employment:": getEmploymentLabelById(form.employmentType),
      "4). Email address of the Applicant:": form.email || "-",
      "5). Phone Number of the Applicant:": form.phone || "-",
      "6). Date of Occurrence of Unsafe Act / Unsafe Practice / Near Miss Incident:": `${formatDateToDDMMYYYY(form.date)} ${form.time || ""} ${form.ampm || ""}`.trim(),
      "7). Location of Occurrence of Unsafe Act / Unsafe Practice / Near Miss Incident:": form.location || "-",
      "8). Name of the Unit where Unsafe Act / Unsafe Practice / Near Miss Incident observed:": form.unitName || "-",
      "9). Name of the Area:": getAreaNameById(form.areaName),
      "10). Whether the Unsafe Act / Unsafe Practice / Near Miss Incident has been reported to Officials of Unit / Area?:": getReportStatusLabelById(form.reportedToOfficials),
      "11). Details of Observed Unsafe Act / Unsafe Practice / Near Miss Incident:": form.details || "-",
      "12). Upload files section to upload file:": (files.length ? files.map((f) => f.name).join(", ") : "-"),
      "Person Reported Against:": form.personReportedAgainst || "-",
      "Witnesses:": form.witnesses || "-",
    };

    if (serverMeta) {
      base["Complaint ID (server):"] = serverMeta.id ? String(serverMeta.id) : "-";
      base["Public Token (server):"] = serverMeta.public_token || serverMeta.publicToken || serverMeta.token || "-";
    }
    return base;
  }

  async function generatePdf(answers) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 30;
    try {
      const img = new Image();
      img.src = logo;
      await new Promise((res) => (img.onload = res));
      const imgWidth = 120;
      const imgHeight = (img.height / img.width) * imgWidth;
      doc.addImage(img, "PNG", (pageWidth - imgWidth) / 2, y, imgWidth, imgHeight);
      y += imgHeight + 10;
    } catch (err) {
      console.warn("logo load failed", err);
    }
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    const header = L.title || "Unsafe Act Report";
    const headerLines = doc.splitTextToSize(header, pageWidth - 80);
    doc.text(headerLines, pageWidth / 2, y, { align: "center" });
    y += headerLines.length * 14 + 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const leftX = 40;
    const rightX = pageWidth / 2 + 10;
    const columnWidth = pageWidth / 2 - 60;
    const lineH = 14;
    for (const [q, a] of Object.entries(answers)) {
      const qLines = doc.splitTextToSize(q, columnWidth);
      const aLines = doc.splitTextToSize(a || "-", columnWidth);
      const needed = Math.max(qLines.length, aLines.length) * lineH + 8;
      if (y + needed > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        y = 40;
      }
      doc.setFont("helvetica", "bold");
      doc.text(qLines, leftX, y);
      doc.setFont("helvetica", "normal");
      doc.text(aLines, rightX, y);
      y += needed;
    }
    doc.save("unsafe_act_report.pdf");
    toast.success("PDF downloaded");
  }

  function generateTrackingNumber() {
    const t = Date.now().toString(36).toUpperCase();
    const r = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ECL-${t}-${r}`;
  }

  function copyToClipboard(text) {
    if (!navigator.clipboard) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        toast.success("Copied");
      } catch {
        toast.error("Copy failed");
      }
      return;
    }
    navigator.clipboard.writeText(text).then(() => toast.success("Copied"), () => toast.error("Copy failed"));
  }

  function makeIncidentDate(dateIso, timeStr, ampm) {
    if (!dateIso) return "";
    const [hhStr, mmStr] = (timeStr || "").split(":");
    let hh = parseInt(hhStr || "0", 10);
    const mm = (mmStr || "00").padStart(2, "0");
    if (isNaN(hh)) hh = 0;
    const ampmUpper = (ampm || "").toUpperCase();
    if (ampmUpper === "PM" && hh < 12) hh += 12;
    if (ampmUpper === "AM" && hh === 12) hh = 0;
    const hh24 = String(hh).padStart(2, "0");
    return `${dateIso} ${hh24}:${mm}:00`;
  }

  async function submit(e) {
    e && e.preventDefault();
    if (!validateStep1() || !validateStep2() || !validateStep3()) return;

    const clientTracking = generateTrackingNumber();
    setSubmitting(true);

    const fd = new FormData();
    fd.append("language", lang);
    // These fields now expect IDs (already stored in form)
    fd.append("observance_type_id", form.typeOfAct || "");
    fd.append("employment_type_id", form.employmentType || "");
    fd.append("area_id", form.areaName || "");
    fd.append("reported_status_id", form.reportedToOfficials || "");
    fd.append("incident_date", makeIncidentDate(form.date, form.time, form.ampm));
    fd.append("location", form.location || "");
    fd.append("unit_name", form.unitName || "");
    fd.append("description", form.details || "");
    fd.append("is_anonymous", "0");
    fd.append("prefix", form.prefix || "");
    fd.append("first_name", form.firstName || "");
    fd.append("middle_name", form.middleName || "");
    fd.append("last_name", form.lastName || "");
    fd.append("email", form.email || "");
    fd.append("phone_number", form.phone || "");
    fd.append("complainant_emp_id", form.complainantEmpId || "NA");
    fd.append("person_reported_against", form.personReportedAgainst || "");
    fd.append("witnesses", form.witnesses || "");
    fd.append("tracking_number", clientTracking);
    files.forEach((file) => fd.append("attachments[]", file));

    let serverJson = null;
    let finalTracking = clientTracking;

    try {
      const res = await fetch(API_URL, { method: "POST", body: fd });
      if (!res.ok) {
        const serverMsg = await res.text().catch(() => "Unknown server error");
        console.error("Server Error Response:", serverMsg);
        toast.error(`Upload failed: ${res.status} — ${serverMsg}`);
      } else {
        serverJson = await res.json().catch(() => null);
        console.log("Server success response:", serverJson || "OK (no JSON)");
        toast.success("Submitted to server successfully.");
        if (serverJson && (serverJson.public_token || serverJson.publicToken || serverJson.token)) {
          finalTracking = serverJson.public_token || serverJson.publicToken || serverJson.token;
        }
      }
    } catch (err) {
      console.error("Network Error:", err);
      toast.error("Network error — Could not reach server.");
    }

    try {
      await generatePdf(collectAnswers(finalTracking, serverJson));
    } catch (err) {
      console.warn("PDF generation failed:", err);
    }

    const localRecord = {
      trackingNumber: finalTracking,
      title: form.details ? (form.details.slice(0, 60) + (form.details.length > 60 ? "..." : "")) : "Unsafe Act Report",
      submittedBy: form.firstName || "Anonymous",
      date: new Date().toISOString().split("T")[0],
      description: form.details || "-",
      files: files.map((f) => f.name),
      status: L.trackingStatusSubmitted,
      serverResponse: serverJson,
      complaintId: serverJson?.id ?? null,
      publicToken: serverJson?.public_token ?? serverJson?.publicToken ?? serverJson?.token ?? null,
    };

    if (serverJson && serverJson.success) {
      localRecord.status = L.trackingStatusAcknowledged;
    }

    setSubmittedRecords((prev) => [localRecord, ...prev]);

    toast(() => (
      <div className="flex flex-col">
        <div>Submission complete</div>
        <div className="font-mono font-semibold mt-1">{localRecord.trackingNumber}</div>
        <div className="text-xs mt-1">Use this number to track status in the tracking panel (right).</div>
      </div>
    ), { duration: 8000 });

    setForm({
      typeOfAct: "",
      prefix: "",
      firstName: "",
      middleName: "",
      lastName: "",
      employmentType: "",
      email: "",
      phone: "",
      complainantEmpId: "",
      date: "",
      time: "",
      ampm: "AM",
      location: "",
      unitName: "",
      areaName: "",
      reportedToOfficials: "",
      personReportedAgainst: "",
      witnesses: "",
      details: "",
      includeFilesInPdf: true,
    });
    setFiles([]);
    setWordCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setStep(1);
    setSubmitting(false);
  }

  // Use local submittedRecords to fetch server id+token (if available),
  // then call remote tracking API to get status.
  async function trackByTrackingNumber(panelTN) {
    if (!panelTN || !panelTN.trim()) {
      toast.error("Enter tracking number to track");
      return;
    }
    const q = panelTN.trim().toUpperCase();
    const found = submittedRecords.find((r) => String(r.trackingNumber).toUpperCase() === q);
    if (!found) {
      toast.error("Tracking number not found locally. If you have complaint id & token use those.");
      return;
    }
    if (!found.complaintId || !found.publicToken) {
      toast.error("This local submission doesn't have complaint id/token returned by server.");
      return;
    }
    await callRemoteTrack(found.complaintId, found.publicToken);
  }

  async function callRemoteTrack(id, token) {
    if (!id || !token) {
      toast.error("Provide complaint id and token");
      return;
    }
    setRemoteTrackResult(null);
    setPanelLoading(true);
    try {
      const url = `${TRACK_API_BASE}?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        toast.error(`Track failed: ${res.status} — ${txt}`);
        setPanelLoading(false);
        return;
      }
      const json = await res.json().catch(() => null);
      setRemoteTrackResult(json);
      toast.success("Tracking info retrieved");
    } catch (err) {
      console.error("Track API error:", err);
      toast.error("Network error while tracking");
    } finally {
      setPanelLoading(false);
    }
  }

  async function handlePanelTrackByIdToken(e) {
    e && e.preventDefault();
    if (!panelId || !panelToken) {
      toast.error("Enter complaint id and token");
      return;
    }
    await callRemoteTrack(panelId, panelToken);
  }

  async function handlePanelTrackByTN(e) {
    e && e.preventDefault();
    if (!panelTrackingNumber) {
      toast.error("Enter tracking number");
      return;
    }
    await trackByTrackingNumber(panelTrackingNumber);
  }

  function statusBadgeClass(status, isclosed) {
    if (isclosed === true || String(isclosed).toLowerCase() === "true") return "bg-green-100 text-green-800";
    const s = String(status || "").toUpperCase();
    if (s.includes("PEND") || s.includes("NEW") || s.includes("OPEN")) return "bg-yellow-100 text-yellow-800";
    return "bg-gray-100 text-gray-800";
  }

  // Inline tracking panel component so same logic is reused for desktop & mobile
  function TrackingPanel({ compact = false, onClose } = {}) {
    return (
      <div className={`bg-white rounded p-4 shadow-lg border ${compact ? "w-full" : "w-80"}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Track complaint</div>
          {onClose && (
            <button onClick={onClose} className="text-gray-500 text-sm px-2 py-1 rounded hover:bg-gray-100">Close</button>
          )}
        </div>

        <div className="text-xs text-gray-500 mb-2">Or by Complaint ID + Token (server)</div>
        <input value={panelId} onChange={(e) => setPanelId(e.target.value)} placeholder="Complaint ID (e.g. 60)" className="w-full border rounded p-2 text-sm mb-2" />
        <input value={panelToken} onChange={(e) => setPanelToken(e.target.value)} placeholder="Tracking token" className="w-full border rounded p-2 text-sm mb-2" />
        <div className="flex justify-end mb-3">
          <button onClick={handlePanelTrackByIdToken} className="px-3 py-2 bg-green-600 text-white rounded text-sm">{panelLoading ? "Loading..." : "Track"}</button>
        </div>

        <div className="mt-2 border-t pt-3 text-sm">
          <div className="font-semibold mb-2">Status</div>

          {panelLoading && <div className="text-xs text-gray-500">Checking...</div>}

          {!panelLoading && remoteTrackResult && (
            <div className="space-y-2 text-sm">
              <div className={`inline-block px-3 py-1 rounded-full text-xs ${statusBadgeClass(remoteTrackResult.status, remoteTrackResult.isclosed)}`}>{remoteTrackResult.status ?? "-"}</div>

              <div className="mt-2">
                <div className="text-xs text-gray-500">Complaint ID</div>
                <div className="font-mono font-semibold">{remoteTrackResult.id ?? "-"}</div>
              </div>

              <div className="mt-2">
                <div className="text-xs text-gray-500">Workflow</div>
                <div className="">{remoteTrackResult.workflowstatus ?? "-"}</div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div>
                  <div className="text-gray-500">Created</div>
                  <div className="text-sm">{remoteTrackResult.created_at ?? "-"}</div>
                </div>
                <div>
                  <div className="text-gray-500">Closed</div>
                  <div className="text-sm">{remoteTrackResult.closedat ?? "-"}</div>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                {remoteTrackResult.public_token && (
                  <button onClick={() => copyToClipboard(remoteTrackResult.public_token)} className="px-2 py-1 border rounded text-xs">Copy token</button>
                )}
                {remoteTrackResult.id && (
                  <button onClick={() => copyToClipboard(String(remoteTrackResult.id))} className="px-2 py-1 border rounded text-xs">Copy id</button>
                )}
              </div>
            </div>
          )}

          {!panelLoading && !remoteTrackResult && (
            <div className="text-xs text-gray-500">No result yet — enter tracking number or complaint id + token and press Track.</div>
          )}
        </div>
      </div>
    );
  }

  // ---------- RENDER ----------
  // show intro screen when required
  if (showIntro) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="max-w-3xl w-full bg-white rounded-xl shadow-lg p-6 text-center">
          <div className="flex items-center justify-center gap-4 mb-6">
            <img src={logo} alt="ECL logo" className="w-28 object-contain" />
            <img src={angaara} alt="Angaara" className="w-20 h-20 object-contain rounded-lg" />
          </div>

          <h2 className="text-xl font-semibold mb-4">{L.selectLang}</h2>

          <div className="flex justify-center gap-6 mb-6">
            <label className="flex items-center gap-2">
              <input type="radio" name="lang" checked={lang === "en"} onChange={() => setLang("en")} />
              English
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="lang" checked={lang === "hi"} onChange={() => setLang("hi")} />
              हिंदी
            </label>
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={() => setShowIntro(false)}
              className="px-6 py-2 bg-indigo-600 text-white rounded-md"
            >
              {L.startForm}
            </button>

            <button
              onClick={() => {
                setShowIntro(true);
                setStep(1);
              }}
              className="px-6 py-2 border rounded-md"
            >
              {L.backHome}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto my-6 px-4">
      {/* Header area (clean) */}
      <div className="max-w-3xl mx-auto mb-6">
        <div className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-lg p-6 flex items-center gap-6 border border-white/40 flex-col sm:flex-row">

          <img src={logo} alt="ECL" className="w-24 object-contain" />

          <div className="flex-1 text-center sm:text-left">
            <div className="text-2xl font-extrabold text-gray-900 tracking-tight">ECL Safety Monitoring Portal</div>
            <div className="mt-2 text-gray-700 font-semibold text-lg leading-snug">{L.title}</div>
            <div className="mt-1 text-sm text-gray-500">Use this form to report observed unsafe acts / practices.</div>
          </div>

          <div className="mt-3 sm:mt-0">
            <button
              onClick={() => { setShowIntro(true); setStep(1); }}
              className="inline-flex items-center gap-2 whitespace-nowrap px-4 py-2 border rounded-md bg-white hover:bg-gray-50 text-sm"
              title={L.backHome}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
              {L.backHome}
            </button>
          </div>
        </div>
      </div>

      {/* Form container */}
      <div className="max-w-3xl mx-auto bg-white/90 backdrop-blur-xl shadow-2xl rounded-2xl p-6 pb-44 md:pb-32 relative border w-full">

        <ProgressBar step={step} />

        <form onSubmit={submit} className="space-y-4">
          {/* STEP 1 */}
          {step === 1 && (
            <div>
              <h3 className="text-lg font-semibold mb-2">{L.personalDetails}</h3>

              <div className="mb-4">
                <label className="block font-medium">
                  1). {L.typeOfAct} <span className="text-red-600">*</span>
                </label>
                <select name="typeOfAct" value={form.typeOfAct} onChange={onChange} className={inputClass("typeOfAct")}>
                  <option value="">-- Select --</option>
                  {observanceTypesList.map(o => (
                    <option key={o.id} value={String(o.id)}>{o.label}</option>
                  ))}
                </select>
                {listsLoading && observanceTypesList.length === 0 && <div className="text-xs text-gray-500 mt-1">Loading types…</div>}
                {listsError && <div className="text-xs text-red-500 mt-1">Could not load types</div>}
              </div>

              <div className="mb-4">
                <label className="block font-medium">2). {L.nameOfApplicant}</label>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-1">
                  <select name="prefix" value={form.prefix} onChange={onChange} className="border rounded-md p-2">
                    <option value="">Prefix</option>
                    <option value="Mr.">Mr.</option>
                    <option value="Mrs.">Mrs.</option>
                  </select>
                  <input type="text" name="firstName" placeholder={lang === "hi" ? "पहला नाम" : "First name"} value={form.firstName} onChange={onChange} className="sm:col-span-3 border rounded-md p-2" />

                  <input type="text" name="middleName" placeholder={lang === "hi" ? "मध्य नाम" : "Middle name"} value={form.middleName} onChange={onChange} className="col-span-1 sm:col-span-2 border rounded-md p-2 mt-2 sm:mt-0" />
                  <input type="text" name="lastName" placeholder={lang === "hi" ? "अंतिम नाम" : "Last name"} value={form.lastName} onChange={onChange} className="col-span-1 sm:col-span-2 border rounded-md p-2 mt-2 sm:mt-0" />
                </div>
              </div>

              <div className="mb-4">
                <label className="block font-medium">3). {L.typeOfEmployment} <span className="text-red-600">*</span></label>
                <select name="employmentType" value={form.employmentType} onChange={onChange} className={inputClass("employmentType")}>
                  <option value="">-- Select --</option>
                  {empTypesList.map(e => (
                    <option key={e.id} value={String(e.id)}>{e.label}</option>
                  ))}
                </select>
                {listsLoading && empTypesList.length === 0 && <div className="text-xs text-gray-500 mt-1">Loading employment types…</div>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium">4). {L.email}</label>
                  <input type="email" name="email" placeholder="example@domain.com" value={form.email} onChange={onChange} className="mt-1 w-full border rounded-md p-2" />
                </div>

                <div>
                  <label className="block font-medium">5). {L.phone}</label>
                  <input type="tel" name="phone" placeholder={lang === "hi" ? "फोन नंबर" : "Phone number"} value={form.phone} onChange={onChange} className="mt-1 w-full border rounded-md p-2" />
                </div>
              </div>

              <div className="mb-4">
                <label className="block font-medium">Employee ID (optional)</label>
                <input type="text" name="complainantEmpId" placeholder="EMP123" value={form.complainantEmpId} onChange={onChange} className="mt-1 w-full border rounded-md p-2" />
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div>
              <h3 className="text-lg font-semibold mt-6 mb-2">{L.incidentDetails}</h3>

              <div className="mb-4">
                <label className="block font-medium">6). {L.dateOfOccurrence} <span className="text-red-600">*</span></label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <input type="date" name="date" value={form.date} onChange={onChange} className={inputClass("date", false)} />
                  <input type="text" name="time" value={form.time} placeholder="HH:MM" onChange={onChange} className={inputClass("time", false)} />
                  <select name="ampm" value={form.ampm} onChange={onChange} className={inputClass("ampm", false)}><option>AM</option><option>PM</option></select>
                </div>
                <div className="text-sm text-gray-500 mt-1">{lang === "hi" ? "DD-MM-YYYY।" : "DD-MM-YYYY. You can pick from calendar or enter manually."}</div>
              </div>

              <div className="mb-4">
                <label className="block font-medium">7). {L.location} <span className="text-red-600">*</span></label>
                <input type="text" name="location" value={form.location} onChange={onChange} className={inputClass("location")} />
              </div>

              <div className="mb-4">
                <label className="block font-medium">8). {L.unitName}</label>
                <input type="text" name="unitName" value={form.unitName} onChange={onChange} className="mt-1 w-full border rounded-md p-2" />
              </div>

              <div className="mb-4">
                <label className="block font-medium">9). {L.areaName} <span className="text-red-600">*</span></label>
                <select name="areaName" value={form.areaName} onChange={onChange} className={inputClass("areaName")}>
                  <option value="">-- Select --</option>
                  {areasList.map(a => (
                    <option key={a.id} value={String(a.id)}>{a.name}</option>
                  ))}
                </select>
                {listsLoading && areasList.length === 0 && <div className="text-xs text-gray-500 mt-1">Loading areas…</div>}
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div>
              <h3 className="text-lg font-semibold mt-6 mb-2">{L.reportDetails}</h3>

              <div className="mb-4">
                <label className="block font-medium">10). {L.reportedToOfficials} <span className="text-red-600">*</span></label>
                <select name="reportedToOfficials" value={form.reportedToOfficials} onChange={onChange} className={inputClass("reportedToOfficials")}>
                  <option value="">-- Select --</option>
                  {reportStatusesList.map(s => (
                    <option key={s.id} value={String(s.id)}>{s.label}</option>
                  ))}
                </select>
                {listsLoading && reportStatusesList.length === 0 && <div className="text-xs text-gray-500 mt-1">Loading statuses…</div>}
              </div>

              <div className="mb-4">
                <label className="block font-medium">11). {L.details} <span className="text-red-600">*</span></label>
                <textarea name="details" value={form.details} onChange={onChange} rows={8} placeholder={lang === "hi" ? "यहाँ विवरण लिखें..." : "Write the details here..."} className={inputClass("details")} />
                <div className="text-sm text-gray-500 mt-1">{wordCount} / {MAX_WORDS} words</div>
              </div>

              <div className="mb-6 grid grid-cols-1 gap-2">
                <div>
                  <label className="block font-medium">Person Reported Against (optional)</label>
                  <input type="text" name="personReportedAgainst" placeholder="Name of person" value={form.personReportedAgainst} onChange={onChange} className="mt-1 w-full border rounded-md p-2" />
                </div>
                <div>
                  <label className="block font-medium">Witnesses (optional)</label>
                  <input type="text" name="witnesses" placeholder="Witness 1, Witness 2" value={form.witnesses} onChange={onChange} className="mt-1 w-full border rounded-md p-2" />
                </div>
              </div>

              <div className="mb-6">
                <label className="block font-medium">12). {L.uploadFiles}</label>
                <input ref={fileInputRef} name="files" type="file" accept="image/*,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple onChange={handleFilesChange} className="mt-1" />
                <div className="mt-2 flex flex-wrap gap-2">
                  {files.map((f, i) => (
                    <div key={i} className="relative">
                      {f.type && f.type.startsWith("image/") ? (
                        <img src={URL.createObjectURL(f)} alt={f.name} className="w-24 h-16 object-cover rounded-md border" />
                      ) : (
                        <div className="w-36 h-16 bg-gray-50 border rounded-md flex flex-col items-start justify-center p-2 text-xs">
                          <div className="font-semibold text-sm truncate w-full">{f.name}</div>
                          <div className="text-gray-500 mt-1">{getExt(f.name)}</div>
                        </div>
                      )}
                      <button type="button" onClick={() => removeFile(i)} className="absolute top-0 right-0 bg-white rounded-full text-sm w-6 h-6 flex items-center justify-center shadow">×</button>
                    </div>
                  ))}
                </div>
                <div className="text-sm text-gray-500 mt-1">Optional. Up to {MAX_FILES} files, max {(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)} MB each.</div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mt-6">
            <div className="w-full sm:w-auto">
              {step > 1 && <button type="button" onClick={goBack} className="px-4 py-2 border rounded-md w-full sm:w-auto">{L.back}</button>}
            </div>

            <div className="w-full sm:w-auto">
              {step < 3 && <button type="button" onClick={goNext} className="px-5 py-2 bg-blue-600 text-white rounded-md w-full sm:w-auto">{L.next}</button>}
              {step === 3 && <button type="submit" disabled={submitting} className="px-6 py-2 bg-green-600 text-white rounded-md w-full sm:w-auto">{submitting ? "SUBMITTING..." : L.submit}</button>}
            </div>
          </div>
        </form>
      </div>

      {/* Desktop: Right side tracking panel - hidden on small screens */}
      <div className="hidden md:block fixed right-6 top-36 z-40">
        <TrackingPanel />
      </div>

      {/* Mobile: floating button that opens bottom sheet */}
      <div className="md:hidden">
        <button onClick={() => setShowTrackingMobile(true)} className="fixed right-4 bottom-4 bg-green-600 text-white px-4 py-3 rounded-full shadow-lg z-50">Track</button>

        {showTrackingMobile && (
          <div className="fixed inset-0 z-50 flex items-end">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowTrackingMobile(false)} />
            <div className="w-full bg-transparent p-4">
              <div className="mx-auto max-w-xl">
                <TrackingPanel compact onClose={() => setShowTrackingMobile(false)} />
                <div className="mt-3 text-center">
                  <button onClick={() => setShowTrackingMobile(false)} className="text-sm text-gray-500">Close</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="text-xs text-gray-500 text-center mt-3">Fields marked with <span className="text-red-600">*</span> are mandatory.</div>
    </div>
  );
}
