// src/components/ComplaintForm.jsx
import React, { useState, useRef, useEffect } from "react";
import ProgressBar from "./ProgressBar"; // your existing component
import logo from "../assets/logo.png";
import tiger from "../assets/hero.gif"; // optional mascot
import toast from "react-hot-toast";
import jsPDF from "jspdf";

const API_URL = "http://172.18.42.19/ecl_safety_api/create_complaint.php";
const MAX_WORDS = 2700;
const MAX_FILES = 5;
const MAX_FILE_SIZE = 6 * 1024 * 1024; // 6MB

// MAIL GROUPS API
const MAIL_GROUPS_API = "/api/hq/mail-groups";

function getAuthToken() {
  return localStorage.getItem("ecl_token") || localStorage.getItem("auth_token") || null;
}

export default function ComplaintForm() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    typeOfAct: "",
    prefix: "",
    firstName: "",
    middleName: "",
    lastName: "",
    employmentType: "",
    email: "",
    phone: "",
    date: "",
    time: "",
    ampm: "AM",
    location: "",
    unitName: "",
    areaName: "",
    reportedToOfficials: "",
    details: "",
    includeFilesInPdf: true,
  });
  const [files, setFiles] = useState([]);
  const [wordCount, setWordCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({}); // <-- new: track field errors
  const fileInputRef = useRef(null);

  // MAIL GROUPS state
  const [mailGroups, setMailGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState("");

  const areas = [
    "Jhanjra Area",
    "Bankola Area",
    "Pandaveswar Area",
    "Sonepur Bazari Area",
    "Kenda Area",
    "Kunustoria Area",
    "Kajora Area",
    "Satgram-Sriprur Area",
    "Salanpur Area",
    "Sodepur Area",
    "Mugma Area",
    "Rajmahal Area",
    "S.P. Mines Area",
    "ECL HQ",
  ];

  useEffect(() => {
    fetchMailGroups();
  }, []);

  async function fetchMailGroups() {
    setGroupsLoading(true);
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
      if (!res.ok) {
        console.warn("Mail groups fetch failed:", res.status);
        setMailGroups([]);
        return;
      }
      const json = await res.json();
      const list = Array.isArray(json) ? json : json.data ?? [];
      setMailGroups(list);
      // if you want a default selected group, you can set it here; we keep it empty intentionally
    } catch (err) {
      console.error("fetchMailGroups error", err);
      toast.error("Could not load mail groups — see console.");
    } finally {
      setGroupsLoading(false);
    }
  }

  // ... (the rest of your helper functions remain unchanged)
  // I'll re-include your helper code and submission logic but only modify the submit function to append `mail_group_id`.

  // helper to produce classNames and add red border when field has error
  function inputClass(name, isFull = true) {
    const base = isFull ? "mt-1 w-full border rounded-md p-2" : "border rounded-md p-2";
    return `${base} transition-all duration-200 ${
      errors[name]
        ? "border-2 border-red-600 ring-2 ring-red-500 bg-red-50"
        : "border-gray-300 focus:ring-2 focus:ring-blue-500"
    }`;
  }

  // ---------- helpers (unchanged) ----------
  function onChange(e) {
    const { name, value } = e.target;
    if (name === "details") {
      const words = value.trim() ? value.trim().split(/\s+/).length : 0;
      if (words <= MAX_WORDS) {
        setForm((s) => ({ ...s, [name]: value }));
        setWordCount(words);
      } else {
        // ignore extra words
        toast.error(`Maximum ${MAX_WORDS} words allowed`);
      }
    } else {
      setForm((s) => ({ ...s, [name]: value }));
    }
    // clear the error for this field as soon as user changes it
    setErrors((prev) => ({ ...prev, [name]: false }));
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
        toast.error(`${f.name} is larger than 6 MB`);
        continue;
      }

      const isImage = f.type && f.type.startsWith("image/");
      const isAllowedMime = f.type && allowedMimes.has(f.type);
      const isAllowedExt = allowedExt.test(f.name);

      if (isImage || isAllowedMime || isAllowedExt) {
        valid.push(f);
      } else {
        toast.error(`Unsupported file type: ${f.name}`);
      }
    }

    if (valid.length === 0 && selected.length > 0) {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }

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

    if (!form.typeOfAct) {
      newErrors.typeOfAct = true;
      ok = false;
    } else {
      newErrors.typeOfAct = false;
    }

    if (!form.employmentType) {
      newErrors.employmentType = true;
      ok = false;
    } else {
      newErrors.employmentType = false;
    }

    setErrors(newErrors);

    if (!ok) {
      if (!toast.isActive("step1-error")) {
        toast.error("Please fill required fields in Personal Details.", {
          id: "step1-error",
        });
      }
    } else {
      toast.dismiss("step1-error");
    }

    return ok;
  }

  function validateStep2() {
    let ok = true;
    const newErrors = { ...errors };

    if (!form.date) { newErrors.date = true; ok = false; }
    else newErrors.date = false;

    if (!form.time) { newErrors.time = true; ok = false; }
    else newErrors.time = false;

    if (!form.ampm) { newErrors.ampm = true; ok = false; }
    else newErrors.ampm = false;

    if (!form.location) { newErrors.location = true; ok = false; }
    else newErrors.location = false;

    if (!form.areaName) { newErrors.areaName = true; ok = false; }
    else newErrors.areaName = false;

    setErrors(newErrors);

    if (!ok) {
      if (!toast.isActive("step2-error")) {
        toast.error("Please fill required fields in Incident Details.", {
          id: "step2-error",
        });
      }
    } else {
      toast.dismiss("step2-error");
    }

    return ok;
  }

  function validateStep3() {
    let ok = true;
    const newErrors = { ...errors };

    if (!form.reportedToOfficials) {
      newErrors.reportedToOfficials = true;
      ok = false;
    } else newErrors.reportedToOfficials = false;

    if (!form.details?.trim()) {
      newErrors.details = true;
      ok = false;
    } else newErrors.details = false;

    setErrors(newErrors);

    if (!ok) {
      if (!toast.isActive("step3-error")) {
        toast.error("Please fill required fields in Report Details.", {
          id: "step3-error",
        });
      }
    } else {
      toast.dismiss("step3-error");
    }

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

  function collectAnswers() {
    return {
      "1). Type of act:": form.typeOfAct,
      "2).  Name of the Applicant:": `${form.prefix ? form.prefix + " " : ""}${form.firstName || ""} ${form.middleName || ""} ${form.lastName || ""}`.trim(),
      "3). Type of Employment:": form.employmentType,
      "4). Email address of the Applicant:": form.email || "-",
      "5). Phone Number of the Applicant:": form.phone || "-",
      "6). Date of Occurrence of Unsafe Act / Unsafe Practice / Near Miss Incident:": `${formatDateToDDMMYYYY(form.date)} ${form.time || ""} ${form.ampm || ""}`.trim(),
      "7). Location of Occurrence of Unsafe Act / Unsafe Practice / Near Miss Incident:": form.location || "-",
      "8). Name of the Unit where Unsafe Act / Unsafe Practice / Near Miss Incident observed:": form.unitName || "-",
      "9). Name of the Area:": form.areaName || "-",
      "10). Whether the Unsafe Act / Unsafe Practice / Near Miss Incident has been reported to Officials of Unit / Area?:": form.reportedToOfficials || "-",
      "11). Details of Observed Unsafe Act / Unsafe Practice / Near Miss Incident:": form.details || "-",
      "12). Upload files section to upload file:": (files.length ? files.map((f) => f.name).join(", ") : "-"),
      "13). Mail group selected:": selectedGroupId ? (mailGroups.find(g => String(g.id) === String(selectedGroupId))?.name || selectedGroupId) : "None",
    };
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
    const header = "Reporting of Observed Unsafe Act / Unsafe Practice / Near Miss Incident / Safety Suggestion";
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

    const answers = collectAnswers();
    setSubmitting(true);

    const observanceMap = {
      "unsafe act": "1",
      "unsafe practice": "2",
      "near miss incident": "3",
    };

    const employmentMap = {
      "Departmental (ECL Employee)": "1",
      "Contractual (ECL Employee)": "2",
      "Non-ECL Employee(Outsider)": "3",
    };

    const areaMap = {
      "Jhanjra Area": "1",
      "Bankola Area": "2",
      "Pandaveswar Area": "3",
      "Sonepur Bazari Area": "4",
      "Kenda Area": "5",
      "Kunustoria Area": "6",
      "Kajora Area": "7",
      "Satgram-Sriprur Area": "8",
      "Salanpur Area": "9",
      "Sodepur Area": "10",
      "Mugma Area": "11",
      "Rajmahal Area": "12",
      "S.P. Mines Area": "13",
      "ECL HQ": "14",
    };

    const reportedStatusMap = {
      "Yes": "1",
      "No": "2",
      "Do not want to say": "3",
    };

    const fd = new FormData();

    const obsId = observanceMap[form.typeOfAct] || form.typeOfAct || "";
    fd.append("observance_type_id", obsId);

    fd.append("prefix", form.prefix || "");
    fd.append("first_name", form.firstName || "");
    fd.append("middle_name", form.middleName || "");
    fd.append("last_name", form.lastName || "");

    const empId = employmentMap[form.employmentType] || form.employmentType || "";
    fd.append("employment_type_id", empId);

    fd.append("email", form.email || "");
    fd.append("phone_number", form.phone || "");

    const incidentDate = makeIncidentDate(form.date, form.time, form.ampm);
    fd.append("incident_date", incidentDate);

    fd.append("location", form.location || "");
    fd.append("unit_name", form.unitName || "");

    const areaId = areaMap[form.areaName] || form.areaName || "";
    fd.append("area_id", areaId);

    const repId = reportedStatusMap[form.reportedToOfficials] || form.reportedToOfficials || "";
    fd.append("reported_status_id", repId);

    fd.append("description", form.details || "");

    files.forEach((file, idx) => {
      fd.append(`file_${idx + 1}`, file);
    });

    fd.append("complainant_emp_id", "NA");
    fd.append("is_anonymous", "0");

    // MAIL GROUP: append selected group id so the backend can send email to that group
    if (selectedGroupId) {
      fd.append("mail_group_id", String(selectedGroupId));
    }

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const serverMsg = await res.text().catch(() => "Unknown server error");
        console.error("Server Error Response:", serverMsg);
        toast.error(`Upload failed: ${res.status} — ${serverMsg}`);
      } else {
        const txt = await res.text().catch(() => "");
        toast.success("Submitted to server successfully.");
        console.log("Server success response:", txt);
      }
    } catch (err) {
      console.error("Network Error:", err);
      toast.error("Network error — Could not reach server.");
    }

    await generatePdf(answers);

    // reset
    setForm({
      typeOfAct: "",
      prefix: "",
      firstName: "",
      middleName: "",
      lastName: "",
      employmentType: "",
      email: "",
      phone: "",
      date: "",
      time: "",
      ampm: "AM",
      location: "",
      unitName: "",
      areaName: "",
      reportedToOfficials: "",
      details: "",
      includeFilesInPdf: true,
    });
    setFiles([]);
    setWordCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setStep(1);
    setSubmitting(false);
  }

  // ---------- JSX ----------
  return (
    <div className="w-full mx-auto my-6 px-4">
      <div className="max-w-3xl mx-auto bg-white shadow-xl rounded-xl p-10 pb-32 relative border border-gray-100 w-full">
        <ProgressBar step={step} />

        <form onSubmit={submit}>
          {step === 1 && (
            <>
              {/* ... unchanged Step 1 UI (omitted here for brevity in this snippet) */}
              <h3 className="text-lg font-semibold mb-2">Personal Details</h3>
              {/* (rest of Step 1 fields — same as before) */}
              {/* For brevity, include your original code here — unchanged */}
            </>
          )}

          {step === 2 && (
            <>
              <h3 className="text-lg font-semibold mt-6 mb-2">Incident Details</h3>
              {/* (Step 2 fields — same as before) */}
            </>
          )}

          {step === 3 && (
            <>
              <h3 className="text-lg font-semibold mt-6 mb-2">Report Details</h3>

              {/* 10) Reported to officials */}
              <div className="mb-4">
                <label className="block font-medium">
                  10). Whether the Unsafe Act / Unsafe Practice / Near Miss Incident has been reported to Officials of Unit / Area?{" "}
                  <span className="text-red-600">*</span>
                </label>
                <select
                  name="reportedToOfficials"
                  value={form.reportedToOfficials}
                  onChange={onChange}
                  className={inputClass("reportedToOfficials")}
                >
                  <option value="">-- Select --</option>
                  <option>Yes</option>
                  <option>No</option>
                  <option>Do not want to say</option>
                </select>
              </div>

              {/* 11) Details */}
              <div className="mb-4">
                <label className="block font-medium">
                  11). Details of Observed Unsafe Act / Unsafe Practice / Near Miss Incident{" "}
                  <span className="text-red-600">*</span>
                </label>
                <textarea
                  name="details"
                  value={form.details}
                  onChange={onChange}
                  rows={8}
                  placeholder="Write the details here..."
                  className={inputClass("details")}
                />
                <div className="text-sm text-gray-500 mt-1">
                  {wordCount} / {MAX_WORDS} words
                </div>
              </div>

              {/* 12) Upload files */}
              <div className="mb-6">
                <label className="block font-medium">
                  12). Upload files section to upload file
                </label>
                <input
                  ref={fileInputRef}
                  name="files"
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  multiple
                  onChange={handleFilesChange}
                  className="mt-1"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {files.map((f, i) => (
                    <div key={i} className="relative">
                      {f.type && f.type.startsWith("image/") ? (
                        <img
                          src={URL.createObjectURL(f)}
                          alt={f.name}
                          className="w-24 h-16 object-cover rounded-md border"
                        />
                      ) : (
                        <div className="w-36 h-16 bg-gray-50 border rounded-md flex flex-col items-start justify-center p-2 text-xs">
                          <div className="font-semibold text-sm truncate w-full">{f.name}</div>
                          <div className="text-gray-500 mt-1">{getExt(f.name)}</div>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="absolute top-0 right-0 bg-white rounded-full text-sm w-6 h-6 flex items-center justify-center shadow"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  Optional. Up to {MAX_FILES} files (images, PDF, DOC, DOCX), max {(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)} MB each.
                </div>
              </div>

              {/* NEW: Mail group select */}
              <div className="mb-6">
                <label className="block font-medium">
                  13). Send email notification to (optional)
                </label>
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="mt-1 w-full border rounded-md p-2"
                >
                  <option value="">-- Do not send / None selected --</option>
                  {groupsLoading ? (
                    <option value="">Loading groups…</option>
                  ) : mailGroups.length === 0 ? (
                    <option value="">No mail groups available</option>
                  ) : (
                    mailGroups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.key})</option>)
                  )}
                </select>
                <div className="text-xs text-gray-500 mt-1">
                  Choose a mail group to notify when this complaint is submitted. Manage groups in the Mail Groups admin.
                </div>
              </div>
            </>
          )}

          <div className="flex justify-between items-center mt-6">
            <div>
              {step > 1 && (
                <button type="button" onClick={goBack} className="px-4 py-2 border rounded-md">
                  ← BACK
                </button>
              )}
            </div>

            <div>
              {step < 3 && (
                <button type="button" onClick={goNext} className="px-5 py-2 bg-blue-600 text-white rounded-md">
                  NEXT →
                </button>
              )}
              {step === 3 && (
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-green-600 text-white rounded-md"
                >
                  {submitting ? "SUBMITTING..." : "SUBMIT"}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      <div className="text-xs text-gray-500 text-center mt-3">
        Fields marked with <span className="text-red-600">*</span> are mandatory.
      </div>
    </div>
  );
}
