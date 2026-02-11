// src/components/ComplaintForm.jsx
import React, { useState, useRef, useEffect } from "react";
import ProgressBar from "./ProgressBar"; // your existing component
import logo from "../assets/logo.png";
import angaara from "../assets/hero.gif"; // optional mascot / splash
import toast from "react-hot-toast";
import jsPDF from "jspdf";

const API_URL = import.meta.env.VITE_API_URL || "/safety/api/create_complaint";
const MAX_WORDS = 2700;
const MAX_FILES = 5;
const MAX_FILE_SIZE = 6 * 1024 * 1024; // 6MB

export default function ComplaintForm() {
  // UI flow
  const [showSplash, setShowSplash] = useState(true); // show angaara first
  const [lang, setLang] = useState(null); // 'en' | 'hi' after selection

  // stepper and form state
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
  const [errors, setErrors] = useState({});
  const fileInputRef = useRef(null);

  // Areas
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

  // ---------- translations ----------
  // keys used throughout component
  const TR = {
    en: {
      chooseLanguage: "Choose language / भाषा चुनें",
      english: "English",
      hindi: "हिंदी",
      continue: "Continue",
      personalDetails: "Personal Details",
      incidentDetails: "Incident Details",
      reportDetails: "Report Details",
      typeOfAct: "1). Type of act:",
      typeOfActHint: "-- Select --",
      nameOfApplicant: "2). Name of the Applicant (Optional)",
      prefix: "Prefix",
      firstName: "First name",
      middleName: "Middle name",
      lastName: "Last name",
      employmentType: "3). Type of Employment",
      email: "4). Email address of the Applicant",
      phone: "5). Phone Number of the Applicant",
      dateOfOccurrence: "6). Date of Occurrence",
      timePlaceholder: "HH:MM",
      location: "7). Location of Occurrence",
      unitName: "8). Name of the Unit (Optional)",
      areaName: "9). Name of the Area",
      reportedToOfficials: "10). Has this been reported to Officials?",
      details: "11). Details of Observed Unsafe Act / Near Miss",
      uploadFiles: "12). Upload files",
      back: "← BACK",
      next: "NEXT →",
      submit: "SUBMIT",
      submitting: "SUBMITTING...",
      required: "This field is required",
      maxFilesNote: `Optional. Up to ${MAX_FILES} files (images, PDF, DOC, DOCX). Max ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(
        0
      )} MB each.`,
      fieldsMandatory: "Fields marked with * are mandatory.",
      splashCTA: "Proceed to Form",
    },
    hi: {
      chooseLanguage: "भाषा चुनें / Choose language",
      english: "English",
      hindi: "हिंदी",
      continue: "जारी रखें",
      personalDetails: "व्यक्तिगत विवरण",
      incidentDetails: "घटना का विवरण",
      reportDetails: "रिपोर्ट विवरण",
      typeOfAct: "1). कृत्य का प्रकार:",
      typeOfActHint: "-- चुनें --",
      nameOfApplicant: "2). आवेदक का नाम (वैकल्पिक)",
      prefix: "पूर्वसर्ग",
      firstName: "पहला नाम",
      middleName: "मध्य नाम",
      lastName: "अंतिम नाम",
      employmentType: "3). रोजगार का प्रकार",
      email: "4). आवेदक का ईमेल पता",
      phone: "5). आवेदक का फोन नंबर",
      dateOfOccurrence: "6). घटना की तिथि",
      timePlaceholder: "घ:मिन",
      location: "7). घटना का स्थान",
      unitName: "8). यूनिट का नाम (वैकल्पिक)",
      areaName: "9). क्षेत्र का नाम",
      reportedToOfficials: "10). क्या यह अधिकारियों को बताया गया है?",
      details: "11). देखे गए असुरक्षित कृत्य / निकट-मिस का विवरण",
      uploadFiles: "12). फ़ाइल अपलोड करें",
      back: "← पीछे",
      next: "आगे →",
      submit: "सबमिट करें",
      submitting: "सबमिट कर रहे हैं...",
      required: "यह फ़ील्ड आवश्यक है",
      maxFilesNote: `वैकल्पिक। अधिकतम ${MAX_FILES} फ़ाइलें (इमेज, PDF, DOC, DOCX)। प्रत्येक अधिकतम ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(
        0
      )} MB।`,
      fieldsMandatory: "जिसे * से चिह्नित किया गया है वे अनिवार्य फ़ील्ड हैं।",
      splashCTA: "फॉर्म भरने के लिए आगे बढ़ें",
    },
  };

  function t(key) {
    if (!lang) return TR.en[key] || key;
    return TR[lang][key] || TR.en[key] || key;
  }

  // ---------- helpers ----------
  function inputClass(name, isFull = true) {
    const base = isFull ? "mt-1 w-full border rounded-md p-2" : "border rounded-md p-2";
    return `${base} transition-all duration-200 ${
      errors[name]
        ? "border-2 border-red-600 ring-2 ring-red-500 bg-red-50"
        : "border-gray-300 focus:ring-2 focus:ring-blue-500"
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
    }
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
        toast.error(`${f.name} is larger than ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)} MB`);
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

  // ---------- validation ----------
  function validateStep1() {
    let ok = true;
    const newErrors = { ...errors };

    if (!form.typeOfAct) {
      newErrors.typeOfAct = true;
      ok = false;
    } else newErrors.typeOfAct = false;

    if (!form.employmentType) {
      newErrors.employmentType = true;
      ok = false;
    } else newErrors.employmentType = false;

    setErrors(newErrors);
    if (!ok) toast.error(t("required"));
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
    if (!ok) toast.error(t("required"));
    return ok;
  }

  function validateStep3() {
    let ok = true;
    const newErrors = { ...errors };
    if (!form.reportedToOfficials) { newErrors.reportedToOfficials = true; ok = false; } else newErrors.reportedToOfficials = false;
    if (!form.details?.trim()) { newErrors.details = true; ok = false; } else newErrors.details = false;

    setErrors(newErrors);
    if (!ok) toast.error(t("required"));
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
      [t("typeOfAct")]: form.typeOfAct,
      [t("nameOfApplicant")]: `${form.prefix ? form.prefix + " " : ""}${form.firstName || ""} ${form.middleName || ""} ${form.lastName || ""}`.trim(),
      [t("employmentType")]: form.employmentType,
      [t("email")]: form.email || "-",
      [t("phone")]: form.phone || "-",
      [t("dateOfOccurrence")]: `${formatDateToDDMMYYYY(form.date)} ${form.time || ""} ${form.ampm || ""}`.trim(),
      [t("location")]: form.location || "-",
      [t("unitName")]: form.unitName || "-",
      [t("areaName")]: form.areaName || "-",
      [t("reportedToOfficials")]: form.reportedToOfficials || "-",
      [t("details")]: form.details || "-",
      [t("uploadFiles")]: (files.length ? files.map((f) => f.name).join(", ") : "-"),
    };
  }

  // PDF generator (labels will be in selected language)
  async function generatePdf(answers) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 30;

    // add logo centered
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
    const header = lang === "hi"
      ? "देखे गए असुरक्षित कृत्य / निकट-मिस रिपोर्ट"
      : "Reporting of Observed Unsafe Act / Near Miss Incident / Safety Suggestion";
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

  // converts 12-hour to 24-hour and formats to YYYY-MM-DD HH:MM:SS
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

    const reportedStatusMap = { Yes: "1", No: "2", "Do not want to say": "3" };

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

    // If any file present, append first file as "attachment" (server expectation from previous code)
    if (files[0]) fd.append("attachment", files[0]);

    fd.append("complainant_emp_id", "NA");
    fd.append("is_anonymous", "0");

    try {
      const res = await fetch(API_URL, { method: "POST", body: fd });
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

  // by default hide splash after 2.2s to emulate the app screenshot sequence,
  // but allow user to continue earlier by clicking CTA
  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 2200);
    return () => clearTimeout(t);
  }, []);

  // ---------- JSX ----------
  // Splash screen first (angaara large)
  if (showSplash && !lang) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <img src={angaara} alt="angaara" className="mx-auto w-64 h-64 object-contain" />
          <div className="mt-6 text-white text-lg font-semibold">ECL Safety Portal</div>
          <div className="mt-4 flex justify-center gap-4">
            <button
              onClick={() => {
                setShowSplash(false);
              }}
              className="px-6 py-2 rounded bg-white text-black font-medium shadow"
            >
              {t("splashCTA")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // language selection overlay (appears after splash if lang not chosen)
  if (!lang) {
    return (
      <div
        className="min-h-screen flex items-center justify-center relative"
        style={{
          background: "linear-gradient(180deg,#062a66 0%, rgba(6,42,102,0.9) 60%)",
        }}
      >
        <div className="absolute inset-0 opacity-40" />
        <div className="relative z-10 w-full max-w-3xl p-6">
          <div className="bg-white/5 rounded-2xl p-8 backdrop-blur-sm border border-white/10">
            <div className="flex items-center justify-center gap-4 mb-6">
              <img src={logo} alt="ECL" className="w-40 object-contain" />
              <img src={angaara} alt="angaara" className="w-16 h-16 rounded-full" />
            </div>
            <h2 className="text-2xl text-white/95 text-center font-bold mb-3">{t("chooseLanguage")}</h2>
            <p className="text-center text-white/70 mb-6">
              {lang === "hi" ? "फॉर्म हिंदी में भरें" : "Fill the form in your preferred language"}
            </p>

            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => setLang("en")}
                className="px-6 py-3 rounded-lg bg-white text-blue-700 font-semibold shadow"
              >
                {t("english")}
              </button>
              <button
                onClick={() => setLang("hi")}
                className="px-6 py-3 rounded-lg bg-white text-red-700 font-semibold shadow"
              >
                {t("hindi")}
              </button>
            </div>

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setLang("en");
                }}
                className="text-xs text-white/70 underline"
              >
                {t("continue")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main form layout: emulate screenshot with top blue bar + rounded dark card with logo badge
  return (
    <div className="min-h-screen bg-[#0b1738] flex items-start justify-center py-8 px-4">
      {/* top blue strip */}
      <div className="w-full max-w-5xl">
        <div className="h-28 bg-[#0b2d7d] rounded-t-lg flex items-center justify-center">
          {/* centered top badge */}
          <div className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
            <img src={logo} alt="ECL logo" className="w-32 object-contain" />
          </div>
        </div>

        {/* dark rounded card */}
        <div className="bg-gradient-to-b from-[#1f2937] to-[#111827] text-white rounded-b-lg p-8 shadow-xl -mt-6">
          <div className="max-w-3xl mx-auto">
            {/* header area */}
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold">{lang === "hi" ? "फॉर्म - असुरक्षित कृत्य / अभ्यास / निकट-मिस" : "Form - Observance of Unsafe Act / Unsafe Practice / Near Miss"}</h1>
              <p className="mt-3 text-sm text-gray-300 max-w-2xl mx-auto">
                {lang === "hi"
                  ? "एक संरचित तंत्र जो खनन संचालन में सुरक्षा समझौता करने की संभावना वाले घटनाओं का रिकॉर्ड और विश्लेषण करता है।"
                  : "A structured mechanism for systematically capturing, recording, and analysing occurrences that have the potential to compromise safety within mining operations of Eastern Coalfields Limited (ECL)."}
              </p>
            </div>

            {/* centered card (white) that contains the step/form */}
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <ProgressBar step={step} />

              <form onSubmit={submit}>
                {/* STEP 1 */}
                {step === 1 && (
                  <>
                    <h3 className="text-lg font-semibold mb-4 text-gray-800">{t("personalDetails")}</h3>

                    <div className="mb-4">
                      <label className="block font-medium text-gray-700">
                        {t("typeOfAct")} <span className="text-red-600">*</span>
                      </label>
                      <select
                        name="typeOfAct"
                        value={form.typeOfAct}
                        onChange={onChange}
                        className={inputClass("typeOfAct")}
                      >
                        <option value="">{t("typeOfActHint")}</option>
                        <option value="unsafe act">{lang === "hi" ? "असुरक्षित कृत्य" : "unsafe act"}</option>
                        <option value="unsafe practice">{lang === "hi" ? "असुरक्षित अभ्यास" : "unsafe practice"}</option>
                        <option value="near miss incident">{lang === "hi" ? "निकट-मिस घटना" : "near miss incident"}</option>
                      </select>
                    </div>

                    <div className="mb-4">
                      <label className="block font-medium text-gray-700">{t("nameOfApplicant")}</label>
                      <div className="grid grid-cols-4 gap-2 mt-1">
                        <select name="prefix" value={form.prefix} onChange={onChange} className="border rounded-md p-2">
                          <option value="">{t("prefix")}</option>
                          <option value="Mr.">Mr.</option>
                          <option value="Mrs.">Mrs.</option>
                        </select>
                        <input type="text" name="firstName" placeholder={t("firstName")} value={form.firstName} onChange={onChange} className="col-span-3 border rounded-md p-2" />
                        <input type="text" name="middleName" placeholder={t("middleName")} value={form.middleName} onChange={onChange} className="col-span-2 border rounded-md p-2 mt-2" />
                        <input type="text" name="lastName" placeholder={t("lastName")} value={form.lastName} onChange={onChange} className="col-span-2 border rounded-md p-2 mt-2" />
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="block font-medium text-gray-700">{t("employmentType")} <span className="text-red-600">*</span></label>
                      <select name="employmentType" value={form.employmentType} onChange={onChange} className={inputClass("employmentType")}>
                        <option value="">{t("typeOfActHint")}</option>
                        <option value="Departmental (ECL Employee)">{lang === "hi" ? "विभागीय (ECL कर्मचारी)" : "Departmental (ECL Employee)"}</option>
                        <option value="Contractual (ECL Employee)">{lang === "hi" ? "अनुबंध (ECL कर्मचारी)" : "Contractual (ECL Employee)"}</option>
                        <option value="Non-ECL Employee(Outsider)">{lang === "hi" ? "गैर-ECL (बाहरी)" : "Non-ECL Employee(Outsider)"}</option>
                      </select>
                    </div>

                    <div className="mb-4">
                      <label className="block font-medium text-gray-700">{t("email")}</label>
                      <input type="email" name="email" placeholder="example@domain.com" value={form.email} onChange={onChange} className="mt-1 w-full border rounded-md p-2" />
                    </div>

                    <div className="mb-4">
                      <label className="block font-medium text-gray-700">{t("phone")}</label>
                      <input type="tel" name="phone" placeholder="Phone number" value={form.phone} onChange={onChange} className="mt-1 w-full border rounded-md p-2" />
                    </div>
                  </>
                )}

                {/* STEP 2 */}
                {step === 2 && (
                  <>
                    <h3 className="text-lg font-semibold mb-4 text-gray-800">{t("incidentDetails")}</h3>

                    <div className="mb-4">
                      <label className="block font-medium text-gray-700">
                        {t("dateOfOccurrence")} <span className="text-red-600">*</span>
                      </label>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        <input type="date" name="date" value={form.date} onChange={onChange} className={inputClass("date", false)} />
                        <input type="text" name="time" value={form.time} placeholder={t("timePlaceholder")} onChange={onChange} className={inputClass("time", false)} />
                        <select name="ampm" value={form.ampm} onChange={onChange} className={inputClass("ampm", false)}>
                          <option>AM</option>
                          <option>PM</option>
                        </select>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">{lang === "hi" ? "दिन-प्रारूप DD-MM-YYYY" : "DD-MM-YYYY"}</div>
                    </div>

                    <div className="mb-4">
                      <label className="block font-medium text-gray-700">{t("location")} <span className="text-red-600">*</span></label>
                      <input type="text" name="location" value={form.location} onChange={onChange} className={inputClass("location")} />
                    </div>

                    <div className="mb-4">
                      <label className="block font-medium text-gray-700">{t("unitName")}</label>
                      <input type="text" name="unitName" value={form.unitName} onChange={onChange} className="mt-1 w-full border rounded-md p-2" />
                    </div>

                    <div className="mb-4">
                      <label className="block font-medium text-gray-700">{t("areaName")} <span className="text-red-600">*</span></label>
                      <select name="areaName" value={form.areaName} onChange={onChange} className={inputClass("areaName")}>
                        <option value="">{t("typeOfActHint")}</option>
                        {areas.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {/* STEP 3 */}
                {step === 3 && (
                  <>
                    <h3 className="text-lg font-semibold mb-4 text-gray-800">{t("reportDetails")}</h3>

                    <div className="mb-4">
                      <label className="block font-medium text-gray-700">
                        {t("reportedToOfficials")} <span className="text-red-600">*</span>
                      </label>
                      <select name="reportedToOfficials" value={form.reportedToOfficials} onChange={onChange} className={inputClass("reportedToOfficials")}>
                        <option value="">{t("typeOfActHint")}</option>
                        <option>Yes</option>
                        <option>No</option>
                        <option>Do not want to say</option>
                      </select>
                    </div>

                    <div className="mb-4">
                      <label className="block font-medium text-gray-700">{t("details")} <span className="text-red-600">*</span></label>
                      <textarea name="details" value={form.details} onChange={onChange} rows={8} placeholder={lang === "hi" ? "यहाँ विवरण लिखें..." : "Write the details here..."} className={inputClass("details")} />
                      <div className="text-sm text-gray-500 mt-1">{wordCount} / {MAX_WORDS} words</div>
                    </div>

                    <div className="mb-6">
                      <label className="block font-medium text-gray-700">{t("uploadFiles")}</label>
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
                      <div className="text-sm text-gray-500 mt-1">{t("maxFilesNote")}</div>
                    </div>
                  </>
                )}

                {/* actions */}
                <div className="flex justify-between items-center mt-6">
                  <div>
                    {step > 1 && (
                      <button type="button" onClick={goBack} className="px-4 py-2 border rounded-md text-gray-700">
                        {t("back")}
                      </button>
                    )}
                  </div>

                  <div>
                    {step < 3 && (
                      <button type="button" onClick={goNext} className="px-5 py-2 bg-blue-600 text-white rounded-md">
                        {t("next")}
                      </button>
                    )}
                    {step === 3 && (
                      <button type="submit" disabled={submitting} className="px-6 py-2 bg-green-600 text-white rounded-md">
                        {submitting ? t("submitting") : t("submit")}
                      </button>
                    )}
                  </div>
                </div>
              </form>

              <div className="text-xs text-gray-500 text-center mt-4">{t("fieldsMandatory")}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
